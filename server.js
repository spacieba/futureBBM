const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); 

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 🔒 MOT DE PASSE PROFESSEUR - MODIFIABLE ICI
const TEACHER_PASSWORD = 'GPwinner2026';

// Initialiser la base de données
const dataDir = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'teams.db');
console.log('📁 Dossier de données:', dataDir);
console.log('🗄️ Base de données:', dbPath);

const db = new Database(dbPath);

// Configuration SQLite
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Créer les tables
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    franchise TEXT NOT NULL,
    score INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    action TEXT NOT NULL,
    points INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    new_total INTEGER NOT NULL,
    teacher_name TEXT DEFAULT 'Anonyme',
    FOREIGN KEY (player_name) REFERENCES players (name)
  );

  CREATE TABLE IF NOT EXISTS player_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    badge_name TEXT NOT NULL,
    badge_emoji TEXT,
    points INTEGER DEFAULT 0,
    rarity TEXT,
    date_earned TEXT NOT NULL,
    FOREIGN KEY (player_name) REFERENCES players (name),
    UNIQUE(player_name, badge_id)
  );

  CREATE TABLE IF NOT EXISTS franchise_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    franchise TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    badge_name TEXT NOT NULL,
    badge_emoji TEXT,
    points INTEGER DEFAULT 0,
    rarity TEXT,
    date_earned TEXT NOT NULL,
    UNIQUE(franchise, badge_id)
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    player_name TEXT PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    consecutive_days TEXT DEFAULT '[]',
    felicitations_count INTEGER DEFAULT 0,
    hardworker_count INTEGER DEFAULT 0,
    hardworker_dates TEXT DEFAULT '[]',
    last_action_date TEXT,
    lowest_score INTEGER DEFAULT 0,
    weekly_actions INTEGER DEFAULT 0,
    monthly_actions INTEGER DEFAULT 0,
    FOREIGN KEY (player_name) REFERENCES players (name)
  );

  CREATE TABLE IF NOT EXISTS franchise_stats (
    franchise TEXT PRIMARY KEY,
    weekly_points INTEGER DEFAULT 0,
    monthly_points INTEGER DEFAULT 0,
    last_negative_date TEXT,
    consecutive_positive_weeks INTEGER DEFAULT 0,
    best_rank_duration INTEGER DEFAULT 0,
    last_rank_check TEXT
  );
`);

// Définition des badges (même structure que dans le front)
const BADGES = {
  individual: {
    // === SÉRIES (4 badges) ===
    hot_streak: {
      id: 'hot_streak',
      name: 'Hot Streak',
      emoji: '🔥',
      description: '5 actions positives d\'affilée',
      points: 5,
      rarity: 'bronze',
      condition: (stats) => stats.current_streak >= 5
    },
    tsunami: {
      id: 'tsunami',
      name: 'Tsunami',
      emoji: '🌊',
      description: '10 actions positives d\'affilée',
      points: 10,
      rarity: 'argent',
      condition: (stats) => stats.current_streak >= 10
    },
    unstoppable: {
      id: 'unstoppable',
      name: 'Unstoppable',
      emoji: '🚀',
      description: '15 actions positives d\'affilée',
      points: 20,
      rarity: 'or',
      condition: (stats) => stats.current_streak >= 15
    },
    on_fire: {
      id: 'on_fire',
      name: 'On Fire',
      emoji: '💪',
      description: '2 Hardworker en 2 semaines',
      points: 10,
      rarity: 'argent',
      condition: (stats) => {
        // Vérifier qu'il y a au moins 2 Hardworker comptés
    if (stats.hardworker_count < 2) return false;
    
    const dates = JSON.parse(stats.hardworker_dates || '[]');
    if (dates.length < 2) return false;
    
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const recentCount = dates.filter(d => new Date(d) > twoWeeksAgo).length;
    return recentCount >= 2;
  }
},
    
    // === PERSÉVÉRANCE (2 badges) ===
    phoenix: {
      id: 'phoenix',
      name: 'Phoenix',
      emoji: '🦅',
      description: 'Remonter de -50 à +50 points',
      points: 20,
      rarity: 'or',
      condition: (stats, player) => stats.lowest_score <= -50 && player.score >= 50
    },
    marathon_runner: {
      id: 'marathon_runner',
      name: 'Marathon Runner',
      emoji: '🏃',
      description: 'Actions positives 5 jours consécutifs',
      points: 5,
      rarity: 'bronze',
      condition: (stats) => {
        const days = JSON.parse(stats.consecutive_days || '[]');
        if (days.length < 5) return false;
        
        // Vérifier que les 5 derniers jours sont consécutifs
        const lastDays = days.slice(-5);
        const dates = lastDays.map(d => new Date(d));
        
        for (let i = 1; i < dates.length; i++) {
          const diff = (dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24);
          if (diff > 1.5) return false; // Plus d'un jour d'écart
        }
        return true;
      }
    },
    
    // === SOCIAUX/ÉQUIPE (3 badges) ===
    team_captain: {
      id: 'team_captain',
      name: 'Team Captain',
      emoji: '👑',
      description: 'Meilleur de sa franchise pendant 1 semaine',
      points: 10,
      rarity: 'argent',
      condition: null // Vérifié séparément avec une fonction spéciale
    },
    veteran: {
      id: 'veteran',
      name: 'Veteran',
      emoji: '🎖️',
      description: 'Top 3 de sa franchise pendant 2 mois',
      points: 20,
      rarity: 'or',
      condition: null // Vérifié séparément avec une fonction spéciale
    },
    team_player: {
      id: 'team_player',
      name: 'Team Player',
      emoji: '🤝',
      description: 'Sa franchise gagne le + de points en 1 semaine',
      points: 5,
      rarity: 'bronze',
      condition: null // Vérifié séparément avec une fonction spéciale
    },
    
    // === SPÉCIAUX & RARES (3 badges) ===
    showtime: {
      id: 'showtime',
      name: 'Showtime',
      emoji: '🎪',
      description: 'Recevoir Félicitations 3 fois',
      points: 35,
      rarity: 'diamant',
      condition: (stats) => stats.felicitations_count >= 3
    },
    halloween_spirit: {
      id: 'halloween_spirit',
      name: 'Halloween Spirit',
      emoji: '🎃',
      description: '3 Actions positives semaine Halloween',
      points: 50,
      rarity: 'legendaire',
      condition: null // Vérifié dans checkIndividualBadges avec la date
    },
    christmas_magic: {
      id: 'christmas_magic',
      name: 'Christmas Magic',
      emoji: '🎄',
      description: 'Actions positives pendant les fêtes',
      points: 50,
      rarity: 'legendaire',
      condition: null // Vérifié dans checkIndividualBadges avec la date
    }
  },
  
  collective: {
    // === PERFORMANCES (4 badges) ===
    rocket_launch: {
      id: 'rocket_launch',
      name: 'Rocket Launch',
      emoji: '🚀',
      description: '+80 points collectifs en 1 semaine',
      points: 20,
      rarity: 'bronze'
    },
    tidal_wave: {
      id: 'tidal_wave',
      name: 'Tidal Wave',
      emoji: '🌊',
      description: '+200 points collectifs en 1 mois',
      points: 100,
      rarity: 'or'
    },
    lightning_strike: {
      id: 'lightning_strike',
      name: 'Lightning Strike',
      emoji: '⚡',
      description: 'Tous les membres gagnent points même jour',
      points: 20,
      rarity: 'bronze'
    },
    house_on_fire: {
      id: 'house_on_fire',
      name: 'House on Fire',
      emoji: '🔥',
      description: '80% membres actions positives en 1 semaine',
      points: 50,
      rarity: 'argent'
    },
    
    // === SOLIDARITÉ (3 badges) ===
    united_we_stand: {
      id: 'united_we_stand',
      name: 'United We Stand',
      emoji: '🤝',
      description: 'Aucun membre négatif pendant 2 semaines',
      points: 50,
      rarity: 'argent'
    },
    perfect_balance: {
      id: 'perfect_balance',
      name: 'Perfect Balance',
      emoji: '⚖️',
      description: 'Tous membres entre 25-75 points',
      points: 100,
      rarity: 'or'
    },
    harmony: {
      id: 'harmony',
      name: 'Harmony',
      emoji: '🌈',
      description: 'Écart <50 points entre 1er et dernier',
      points: 50,
      rarity: 'argent'
    }
  }
};

// Données initiales des franchises
const initialFranchises = {
  Minotaurs: ['Leny', 'Lyam', 'Augustin', 'Lino', 'Lina D', 'Djilane', 'Talia'],
  Krakens: ['Swan', 'Nolann', 'Enery', 'Marie', 'Seyma Nur', 'Willow'],
  Phoenix: ['Mahé', 'Narcisse', 'Daniella', 'Matis.B', 'Jamila'],
  Werewolves: ['Assia', 'Ethaniel', 'Russy', 'Youssef', 'Lisa L', 'Noa', 'Lenny K']
};

// Initialiser les joueurs et stats
const initDatabase = () => {
  const existingPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get();
  
  if (existingPlayers.count === 0) {
    const insertPlayer = db.prepare('INSERT INTO players (name, franchise, score) VALUES (?, ?, ?)');
    const insertStats = db.prepare('INSERT INTO player_stats (player_name) VALUES (?)');
    
    Object.entries(initialFranchises).forEach(([franchise, players]) => {
      players.forEach(player => {
        insertPlayer.run(player, franchise, 0);
        insertStats.run(player);
      });
    });
  }
  
  // Initialiser les stats de franchise
  const franchises = ['Minotaurs', 'Krakens', 'Phoenix', 'Werewolves'];
  const insertFranchiseStats = db.prepare('INSERT OR IGNORE INTO franchise_stats (franchise) VALUES (?)');
  franchises.forEach(f => insertFranchiseStats.run(f));
};

initDatabase();
initDatabase();

// Ajoutez cette fonction complète juste ici :
const addCategoryColumn = () => {
  try {
    const hasCategory = db.prepare(`
      SELECT COUNT(*) as count 
      FROM pragma_table_info('history') 
      WHERE name = 'category'
    `).get();
    
    if (hasCategory.count === 0) {
      db.prepare('ALTER TABLE history ADD COLUMN category TEXT').run();
      console.log('✅ Colonne category ajoutée à la table history');
      
      const updateExistingRecords = db.prepare(`
        UPDATE history 
        SET category = CASE 
          WHEN action LIKE '%📚%' OR action LIKE '%Scolaire%' OR action LIKE '%Observation positive%' 
               OR action LIKE '%Participation active%' OR action LIKE '%Travail de qualité%'
               OR action LIKE '%Activités facultatives%' OR action LIKE '%Félicitations%'
               OR action LIKE '%Compliments%' OR action LIKE '%Encouragements%'
               OR action LIKE '%Exclusion%' OR action LIKE '%Travail non fait%'
               OR action LIKE '%Retard%' OR action LIKE '%absence%' OR action LIKE '%Mauvaise attitude en classe%'
               THEN 'academic'
          WHEN action LIKE '%🏀%' OR action LIKE '%Sport%' OR action LIKE '%Hardworker%'
               OR action LIKE '%entrainement%' OR action LIKE '%Victoire%' OR action LIKE '%Défaite%'
               OR action LIKE '%Extra basket%' OR action LIKE '%sélection%' OR action LIKE '%étoiles%'
               OR action LIKE '%Table de marque%' OR action LIKE '%Arbitrage%'
               OR action LIKE '%attitude/retard entrainement%' OR action LIKE '%Absences répétées%'
               THEN 'sport'
          ELSE 'general'
        END
        WHERE category IS NULL
      `);
      
      const result = updateExistingRecords.run();
      console.log(`✅ ${result.changes} enregistrements historiques mis à jour avec les catégories`);
    }
  } catch (error) {
    console.error('Erreur lors de l\'ajout de la colonne category:', error);
  }
};

// Et appelez-la immédiatement après :
addCategoryColumn()

// === FONCTIONS DE VÉRIFICATION DES BADGES ===

// Attribuer un badge individuel
const awardPlayerBadge = (playerName, badge) => {
  const existing = db.prepare(`
    SELECT * FROM player_badges 
    WHERE player_name = ? AND badge_id = ?
  `).get(playerName, badge.id);
  
  if (!existing) {
    const insertBadge = db.prepare(`
      INSERT INTO player_badges (player_name, badge_id, badge_name, badge_emoji, points, rarity, date_earned)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertBadge.run(
      playerName, 
      badge.id, 
      badge.name, 
      badge.emoji,
      badge.points, 
      badge.rarity,
      new Date().toISOString()
    );
    
    // Ajouter les points bonus
    if (badge.points > 0) {
      db.prepare('UPDATE players SET score = score + ? WHERE name = ?').run(badge.points, playerName);
      
      // Ajouter à l'historique
      const insertHistory = db.prepare(`
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name)
        VALUES (?, ?, ?, ?, (SELECT score FROM players WHERE name = ?), ?)
      `);
      const timestamp = new Date().toLocaleString('fr-FR');
      insertHistory.run(playerName, `Badge débloqué: ${badge.name}`, badge.points, timestamp, playerName, 'Système');
    }
    
    console.log(`🏅 Badge attribué: ${badge.name} à ${playerName}`);
    return true;
  }
  return false;
};

// Attribuer un badge collectif
const awardFranchiseBadge = (franchise, badge) => {
  const existing = db.prepare(`
    SELECT * FROM franchise_badges 
    WHERE franchise = ? AND badge_id = ?
  `).get(franchise, badge.id);
  
  if (!existing) {
    const insertBadge = db.prepare(`
      INSERT INTO franchise_badges (franchise, badge_id, badge_name, badge_emoji, points, rarity, date_earned)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertBadge.run(
      franchise,
      badge.id,
      badge.name,
      badge.emoji,
      badge.points,
      badge.rarity,
      new Date().toISOString()
    );
    
    console.log(`🏆 Badge collectif attribué: ${badge.name} à ${franchise}`);
    return true;
  }
  return false;
};

// Vérifier les badges individuels
const checkIndividualBadges = (playerName) => {
  const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
  const stats = db.prepare('SELECT * FROM player_stats WHERE player_name = ?').get(playerName);
  
  if (!player || !stats) return;
  
  // Vérifier chaque badge
  Object.values(BADGES.individual).forEach(badge => {
    if (badge.condition && badge.condition(stats, player)) {
      awardPlayerBadge(playerName, badge);
    }
  });
  
  // Vérifications spéciales pour badges temporels
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  
  // Halloween (dernière semaine d'octobre)
  if (month === 9 && day >= 25) {
    const halloweenActions = db.prepare(`
      SELECT COUNT(*) as count FROM history 
      WHERE player_name = ? 
      AND points > 0 
      AND DATE(timestamp) >= DATE('now', '-7 days')
    `).get(playerName);
    
    if (halloweenActions.count > 0) {
      awardPlayerBadge(playerName, BADGES.individual.halloween_spirit);
    }
  }
  
  // Noël (20-31 décembre)
  if (month === 11 && day >= 20) {
    const christmasActions = db.prepare(`
      SELECT COUNT(*) as count FROM history 
      WHERE player_name = ? 
      AND points > 0 
      AND DATE(timestamp) >= DATE('now', '-10 days')
    `).get(playerName);
    
    if (christmasActions.count > 0) {
      awardPlayerBadge(playerName, BADGES.individual.christmas_magic);
    }
  }
  
  // Back to School (septembre)
  if (month === 8) {
    if (stats.monthly_actions >= 10) {
      awardPlayerBadge(playerName, BADGES.individual.back_to_school);
    }
  }
};
// Fonction pour recalculer tous les badges d'un joueur lors d'une annulation
const recalculatePlayerBadges = (playerName) => {
  const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
  const stats = db.prepare('SELECT * FROM player_stats WHERE player_name = ?').get(playerName);
  
  if (!player || !stats) return;
  
  // Supprimer tous les badges existants
  db.prepare('DELETE FROM player_badges WHERE player_name = ?').run(playerName);
  
  // Recalculer selon les conditions actuelles
  Object.values(BADGES.individual).forEach(badge => {
    if (badge.condition && badge.condition(stats, player)) {
      // Réattribuer le badge SANS ajouter les points
      const insertBadge = db.prepare(`
        INSERT INTO player_badges (player_name, badge_id, badge_name, badge_emoji, points, rarity, date_earned)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      insertBadge.run(
        playerName, 
        badge.id, 
        badge.name, 
        badge.emoji,
        0, // 0 points car on ne veut pas re-ajouter les points
        badge.rarity,
        new Date().toISOString()
      );
    }
  });
  
  console.log(`♻️ Badges recalculés pour ${playerName}`);
};


// Vérifier les badges collectifs
const checkCollectiveBadges = (franchise) => {
  const players = db.prepare('SELECT * FROM players WHERE franchise = ?').all(franchise);
  const franchiseStats = db.prepare('SELECT * FROM franchise_stats WHERE franchise = ?').get(franchise);
  
  if (!franchiseStats) return;
  
  // Rocket Launch (+80 points en 1 semaine)
  if (franchiseStats.weekly_points >= 80) {
    awardFranchiseBadge(franchise, BADGES.collective.rocket_launch);
  }
  
  // Tidal Wave (+200 points en 1 mois)
  if (franchiseStats.monthly_points >= 200) {
    awardFranchiseBadge(franchise, BADGES.collective.tidal_wave);
  }
  
  // Lightning Strike (tous gagnent des points le même jour)
  const todayActions = db.prepare(`
    SELECT COUNT(DISTINCT player_name) as count 
    FROM history 
    WHERE player_name IN (SELECT name FROM players WHERE franchise = ?)
    AND DATE(timestamp) = DATE('now')
    AND points > 0
  `).get(franchise);
  
  if (todayActions.count === players.length && players.length > 0) {
    awardFranchiseBadge(franchise, BADGES.collective.lightning_strike);
  }
  
  // United We Stand (aucun négatif pendant 2 semaines)
  const hasNegative = players.some(p => p.score < 0);
  if (!hasNegative) {
    const lastNegative = new Date(franchiseStats.last_negative_date || '2000-01-01');
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    if (lastNegative < twoWeeksAgo) {
      awardFranchiseBadge(franchise, BADGES.collective.united_we_stand);
    }
  }
  
  // Perfect Balance (tous entre 25-75 points)
  const allInRange = players.every(p => p.score >= 25 && p.score <= 75);
  if (allInRange && players.length > 0) {
    awardFranchiseBadge(franchise, BADGES.collective.perfect_balance);
  }
};

// Vérifier le classement des franchises
const checkFranchiseRankings = () => {
  const franchiseScores = db.prepare(`
    SELECT franchise, SUM(score) as total 
    FROM players 
    GROUP BY franchise 
    ORDER BY total DESC
  `).all();
  
  if (franchiseScores.length > 0) {
    const topFranchise = franchiseScores[0].franchise;
    const stats = db.prepare('SELECT * FROM franchise_stats WHERE franchise = ?').get(topFranchise);
    
    if (stats) {
      const updateStats = db.prepare(`
        UPDATE franchise_stats 
        SET best_rank_duration = best_rank_duration + 1,
            last_rank_check = ?
        WHERE franchise = ?
      `);
      updateStats.run(new Date().toISOString(), topFranchise);
      
      // Franchise Royalty (1 mois au top)
      if (stats.best_rank_duration >= 30) {
        awardFranchiseBadge(topFranchise, BADGES.collective.franchise_royalty);
      }
      
      // Dynasty (3 mois au top)
      if (stats.best_rank_duration >= 90) {
        awardFranchiseBadge(topFranchise, BADGES.collective.dynasty);
      }
    }
  }
};

// === ROUTES API ===

// Vérification du mot de passe professeur
app.post('/api/verify-teacher', (req, res) => {
  const { password } = req.body;
  if (password === TEACHER_PASSWORD) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Récupérer tous les joueurs avec leurs badges
app.get('/api/players', (req, res) => {
  try {
    const players = db.prepare('SELECT * FROM players ORDER BY score DESC').all();
    
    // Ajouter les badges à chaque joueur
    const playersWithBadges = players.map(player => {
      const badges = db.prepare(`
        SELECT badge_id, badge_name, badge_emoji, rarity 
        FROM player_badges 
        WHERE player_name = ?
      `).all(player.name);
      
      return { ...player, badges };
    });
    
    res.json(playersWithBadges);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer un joueur spécifique
app.get('/api/player/:playerName', (req, res) => {
  try {
    const player = db.prepare('SELECT * FROM players WHERE name = ?').get(req.params.playerName);
    if (player) {
      const badges = db.prepare(`
        SELECT * FROM player_badges 
        WHERE player_name = ?
      `).all(req.params.playerName);
      
      res.json({ ...player, badges });
    } else {
      res.status(404).json({ error: 'Joueur non trouvé' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer l'historique d'un joueur
app.get('/api/history/:playerName', (req, res) => {
  try {
    const history = db.prepare(`
      SELECT * FROM history 
      WHERE player_name = ? 
      ORDER BY id DESC 
      LIMIT 50
    `).all(req.params.playerName);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ajouter des points avec vérification automatique des badges
app.post('/api/add-points', (req, res) => {
  try {
    const { playerName, points, action, teacherName } = req.body;
    
    // Déterminer la catégorie de l'action
    const determineCategory = (actionText) => {
      if (actionText.includes('📚') || actionText.includes('Scolaire') ||
          actionText.includes('Observation positive') || actionText.includes('Participation active') ||
          actionText.includes('Travail de qualité') || actionText.includes('Activités facultatives') ||
          actionText.includes('Félicitations') || actionText.includes('Compliments') ||
          actionText.includes('Encouragements') || actionText.includes('Exclusion') ||
          actionText.includes('Travail non fait') || actionText.includes('Retard') ||
          actionText.includes('absence') || actionText.includes('Mauvaise attitude en classe')) {
        return 'academic';
      }
      if (actionText.includes('🏀') || actionText.includes('Sport') ||
          actionText.includes('Hardworker') || actionText.includes('entrainement') ||
          actionText.includes('Victoire') || actionText.includes('Défaite') ||
          actionText.includes('Extra basket') || actionText.includes('sélection') ||
          actionText.includes('étoiles') || actionText.includes('Table de marque') ||
          actionText.includes('Arbitrage') || actionText.includes('attitude/retard entrainement') ||
          actionText.includes('Absences répétées')) {
        return 'sport';
      }
      return 'general';
    };
    
    const transaction = db.transaction(() => {
      const oldPlayer = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
      if (!oldPlayer) throw new Error('Joueur non trouvé');
      
      db.prepare('UPDATE players SET score = score + ? WHERE name = ?').run(points, playerName);
      const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
      
      // MODIFIÉ : Ajouter la catégorie à l'historique
      const category = determineCategory(action);
      const timestamp = new Date().toLocaleString('fr-FR');
      db.prepare(`
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(playerName, action, points, timestamp, player.score, teacherName || 'Anonyme', category);
      
      // Le reste de votre code existant pour les stats
      const stats = db.prepare('SELECT * FROM player_stats WHERE player_name = ?').get(playerName);
      
      if (stats) {
        let updates = {
          current_streak: stats.current_streak,
          max_streak: stats.max_streak,
          felicitations_count: stats.felicitations_count,
          hardworker_count: stats.hardworker_count,
          hardworker_dates: JSON.parse(stats.hardworker_dates || '[]'),
          lowest_score: stats.lowest_score,
          weekly_actions: stats.weekly_actions,
          monthly_actions: stats.monthly_actions
        };
        
        if (points > 0) {
          updates.current_streak++;
          updates.max_streak = Math.max(updates.current_streak, updates.max_streak);
          updates.weekly_actions++;
          updates.monthly_actions++;
        } else {
          updates.current_streak = 0;
        }
        
        if (player.score < updates.lowest_score) {
          updates.lowest_score = player.score;
        }
        
        if (action.includes('Félicitations')) {
          updates.felicitations_count++;
        }
        if (action.includes('Hardworker')) {
          updates.hardworker_count++;
          updates.hardworker_dates.push(new Date().toISOString());
        }
        
        const today = new Date().toDateString();
        const consecutiveDays = JSON.parse(stats.consecutive_days || '[]');
        if (!consecutiveDays.includes(today) && points > 0) {
          consecutiveDays.push(today);
          if (consecutiveDays.length > 7) {
            consecutiveDays.shift();
          }
        }
        
        db.prepare(`
          UPDATE player_stats 
          SET current_streak = ?, 
              max_streak = ?, 
              felicitations_count = ?,
              hardworker_count = ?,
              hardworker_dates = ?,
              lowest_score = ?,
              weekly_actions = ?,
              monthly_actions = ?,
              consecutive_days = ?,
              last_action_date = ?
          WHERE player_name = ?
        `).run(
          updates.current_streak,
          updates.max_streak,
          updates.felicitations_count,
          updates.hardworker_count,
          JSON.stringify(updates.hardworker_dates),
          updates.lowest_score,
          updates.weekly_actions,
          updates.monthly_actions,
          JSON.stringify(consecutiveDays),
          new Date().toISOString(),
          playerName
        );
      }
      
      const franchise = oldPlayer.franchise;
      const franchiseStats = db.prepare('SELECT * FROM franchise_stats WHERE franchise = ?').get(franchise);
      
      if (franchiseStats && points > 0) {
        db.prepare(`
          UPDATE franchise_stats 
          SET weekly_points = weekly_points + ?,
              monthly_points = monthly_points + ?
          WHERE franchise = ?
        `).run(points, points, franchise);
      }
      
      if (points < 0 && player.score < 0) {
        db.prepare(`
          UPDATE franchise_stats 
          SET last_negative_date = ?
          WHERE franchise = ?
        `).run(new Date().toISOString(), franchise);
      }
      
      return { player, franchise };
    });
    
    const result = transaction();
    
    checkIndividualBadges(playerName);
    checkCollectiveBadges(result.franchise);
    
    const badges = db.prepare(`
      SELECT badge_id, badge_name, badge_emoji, rarity 
      FROM player_badges 
      WHERE player_name = ?
    `).all(playerName);
    
    res.json({ 
      success: true, 
      newScore: result.player.score,
      badges: badges
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Annuler la dernière action
app.delete('/api/undo-last/:playerName', (req, res) => {
  try {
    const playerName = req.params.playerName;
    
    const transaction = db.transaction(() => {
      const lastAction = db.prepare(`
        SELECT * FROM history 
        WHERE player_name = ? 
        ORDER BY id DESC 
        LIMIT 1
      `).get(playerName);
      
      if (!lastAction) {
        throw new Error('Aucune action à annuler');
      }
      
      // Inverser les points
      db.prepare('UPDATE players SET score = score - ? WHERE name = ?')
        .run(lastAction.points, playerName);
      
      // Supprimer de l'historique
      db.prepare('DELETE FROM history WHERE id = ?').run(lastAction.id);
      
      // Ajuster les stats si nécessaire
      if (lastAction.points > 0) {
        db.prepare(`
          UPDATE player_stats 
          SET current_streak = CASE WHEN current_streak > 0 THEN current_streak - 1 ELSE 0 END
          WHERE player_name = ?
        `).run(playerName);
      }
     // Si on annule un Hardworker, décrémenter le compteur
if (lastAction.action.includes('Hardworker')) {
  const stats = db.prepare('SELECT * FROM player_stats WHERE player_name = ?').get(playerName);
  if (stats) {
    const hardworkerDates = JSON.parse(stats.hardworker_dates || '[]');
    
    // Supprimer la dernière date Hardworker
    if (hardworkerDates.length > 0) {
      hardworkerDates.pop();
    }
    
    db.prepare(`
      UPDATE player_stats 
      SET hardworker_count = CASE WHEN hardworker_count > 0 THEN hardworker_count - 1 ELSE 0 END,
          hardworker_dates = ?
      WHERE player_name = ?
    `).run(JSON.stringify(hardworkerDates), playerName);
  }
}
      
      const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
       // Recalculer les badges après annulation
      recalculatePlayerBadges(playerName);
      return player.score;
    });
    
    const newScore = transaction();
    res.json({ success: true, newScore });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ajouter un nouvel élève
app.post('/api/add-student', (req, res) => {
  try {
    const { name, franchise } = req.body;
    
    const existing = db.prepare('SELECT * FROM players WHERE name = ?').get(name);
    if (existing) {
      return res.status(400).json({ error: 'Un élève avec ce nom existe déjà' });
    }
    
    const transaction = db.transaction(() => {
      db.prepare('INSERT INTO players (name, franchise, score) VALUES (?, ?, ?)')
        .run(name, franchise, 0);
      
      db.prepare('INSERT INTO player_stats (player_name) VALUES (?)')
        .run(name);
    });
    
    transaction();
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Supprimer un élève
app.delete('/api/remove-student/:playerName', (req, res) => {
  try {
    const playerName = req.params.playerName;
    
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM history WHERE player_name = ?').run(playerName);
      db.prepare('DELETE FROM player_badges WHERE player_name = ?').run(playerName);
      db.prepare('DELETE FROM player_stats WHERE player_name = ?').run(playerName);
      const result = db.prepare('DELETE FROM players WHERE name = ?').run(playerName);
      return result.changes > 0;
    });
    
    const success = transaction();
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Élève non trouvé' });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer tous les badges
app.get('/api/badges/all', (req, res) => {
  try {
    const playerBadges = db.prepare(`
      SELECT pb.*, p.franchise 
      FROM player_badges pb
      JOIN players p ON pb.player_name = p.name
      ORDER BY pb.date_earned DESC
    `).all();
    
    const franchiseBadges = db.prepare(`
      SELECT * FROM franchise_badges 
      ORDER BY date_earned DESC
    `).all();
    
    res.json({ 
      playerBadges, 
      franchiseBadges,
      definitions: BADGES 
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les stats d'un joueur
app.get('/api/stats/:playerName', (req, res) => {
  try {
    const stats = db.prepare('SELECT * FROM player_stats WHERE player_name = ?')
      .get(req.params.playerName);
    res.json(stats || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les stats de franchise
app.get('/api/franchise-stats/:franchise', (req, res) => {
  try {
    const stats = db.prepare('SELECT * FROM franchise_stats WHERE franchise = ?')
      .get(req.params.franchise);
      
    const badges = db.prepare('SELECT * FROM franchise_badges WHERE franchise = ?')
      .all(req.params.franchise);
    
    res.json({ stats, badges });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vérification périodique des classements (à appeler régulièrement)
app.post('/api/check-rankings', (req, res) => {
  try {
    checkFranchiseRankings();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset hebdomadaire des stats
app.post('/api/reset-weekly', (req, res) => {
  try {
    db.prepare('UPDATE franchise_stats SET weekly_points = 0').run();
    db.prepare('UPDATE player_stats SET weekly_actions = 0').run();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset mensuel des stats
app.post('/api/reset-monthly', (req, res) => {
  try {
    db.prepare('UPDATE franchise_stats SET monthly_points = 0').run();
    db.prepare('UPDATE player_stats SET monthly_actions = 0').run();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les données de progression d'un joueur
app.get('/api/progression/:playerName', (req, res) => {
  try {
    const { playerName } = req.params;
    const { days = 30 } = req.query; // Par défaut 30 jours
    
    // Récupérer l'historique sur la période demandée
    let query;
    let params;
    
    if (days === 'all') {
      // Tout l'historique
      query = `
        SELECT 
          DATE(timestamp) as date,
          SUM(points) as daily_points,
          MAX(new_total) as end_score,
          COUNT(*) as actions_count,
          SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as positive_points,
          SUM(CASE WHEN points < 0 THEN points ELSE 0 END) as negative_points
        FROM history 
        WHERE player_name = ?
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `;
      params = [playerName];
    } else {
      // Période spécifique
      query = `
        SELECT 
          DATE(timestamp) as date,
          SUM(points) as daily_points,
          MAX(new_total) as end_score,
          COUNT(*) as actions_count,
          SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as positive_points,
          SUM(CASE WHEN points < 0 THEN points ELSE 0 END) as negative_points
        FROM history 
        WHERE player_name = ? 
          AND DATE(timestamp) >= DATE('now', '-' || ? || ' days')
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `;
      params = [playerName, days];
    }
    
    const progressionData = db.prepare(query).all(...params);
    
    // Obtenir le score initial (premier score avant la période)
    let initialScore = 0;
    if (days !== 'all' && progressionData.length > 0) {
      const firstDateQuery = `
        SELECT new_total - points as initial_score
        FROM history
        WHERE player_name = ?
          AND DATE(timestamp) = ?
        ORDER BY id ASC
        LIMIT 1
      `;
      const firstEntry = db.prepare(firstDateQuery).get(playerName, progressionData[0].date);
      if (firstEntry) {
        initialScore = firstEntry.initial_score;
      }
    }
    
    // Calculer les scores cumulés
    let cumulativeScore = initialScore;
    const processedData = progressionData.map(day => {
      cumulativeScore += day.daily_points;
      return {
        ...day,
        cumulative_score: cumulativeScore
      };
    });
    
    // Ajouter les dates manquantes pour avoir une ligne continue
    if (processedData.length > 0 && days !== 'all') {
      const filledData = [];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      
      let currentScore = initialScore;
      for (let d = new Date(startDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const existingData = processedData.find(item => item.date === dateStr);
        
        if (existingData) {
          filledData.push(existingData);
          currentScore = existingData.cumulative_score;
        } else {
          // Jour sans activité
          filledData.push({
            date: dateStr,
            daily_points: 0,
            end_score: currentScore,
            cumulative_score: currentScore,
            actions_count: 0,
            positive_points: 0,
            negative_points: 0
          });
        }
      }
      
      res.json({
        playerName,
        period: days,
        initialScore,
        data: filledData,
        summary: {
          totalPoints: filledData[filledData.length - 1]?.cumulative_score - initialScore || 0,
          totalActions: filledData.reduce((sum, d) => sum + d.actions_count, 0),
          activeDays: filledData.filter(d => d.actions_count > 0).length
        }
      });
    } else {
      res.json({
        playerName,
        period: days,
        initialScore,
        data: processedData,
        summary: {
          totalPoints: processedData[processedData.length - 1]?.cumulative_score - initialScore || 0,
          totalActions: processedData.reduce((sum, d) => sum + d.actions_count, 0),
          activeDays: processedData.filter(d => d.actions_count > 0).length
        }
      });
    }
    
  } catch (error) {
    console.error('Erreur lors de la récupération de la progression:', error);
    res.status(500).json({ error: error.message });
  }
});

// Servir l'application React
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Lancer le serveur
// Route pour obtenir les points par catégorie pour tous les joueurs
app.get('/api/stats/category-breakdown', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT 
        p.name,
        p.franchise,
        p.score as total_score,
        COALESCE(SUM(CASE WHEN h.category = 'academic' THEN h.points ELSE 0 END), 0) as academic_points,
        COALESCE(SUM(CASE WHEN h.category = 'sport' THEN h.points ELSE 0 END), 0) as sport_points,
        COALESCE(SUM(CASE WHEN h.category = 'general' THEN h.points ELSE 0 END), 0) as general_points
      FROM players p
      LEFT JOIN history h ON p.name = h.player_name
      GROUP BY p.name, p.franchise, p.score
      ORDER BY p.score DESC
    `).all();
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats/mvp-weekly', (req, res) => {
  try {
    const mvpAcademic = db.prepare(`
      SELECT 
        h.player_name as name,
        p.franchise,
        p.score as total_score,
        SUM(h.points) as weekly_points
      FROM history h
      JOIN players p ON h.player_name = p.name
      WHERE h.category = 'academic' 
        AND DATE(h.timestamp) >= DATE('now', '-7 days')
        AND h.points > 0
      GROUP BY h.player_name, p.franchise, p.score
      ORDER BY weekly_points DESC
      LIMIT 1
    `).get();
    
    const mvpSport = db.prepare(`
      SELECT 
        h.player_name as name,
        p.franchise,
        p.score as total_score,
        SUM(h.points) as weekly_points
      FROM history h
      JOIN players p ON h.player_name = p.name
      WHERE h.category = 'sport' 
        AND DATE(h.timestamp) >= DATE('now', '-7 days')
        AND h.points > 0
      GROUP BY h.player_name, p.franchise, p.score
      ORDER BY weekly_points DESC
      LIMIT 1
    `).get();
    
    res.json({ 
      mvpAcademic: mvpAcademic || null, 
      mvpSport: mvpSport || null 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats/top5-by-category', (req, res) => {
  try {
    const top5Academic = db.prepare(`
      SELECT 
        p.name,
        p.franchise,
        p.score as total_score,
        COALESCE(SUM(CASE WHEN h.category = 'academic' THEN h.points ELSE 0 END), 0) as category_points
      FROM players p
      LEFT JOIN history h ON p.name = h.player_name
      GROUP BY p.name, p.franchise, p.score
      ORDER BY category_points DESC
      LIMIT 5
    `).all();
    
    const top5Sport = db.prepare(`
      SELECT 
        p.name,
        p.franchise,
        p.score as total_score,
        COALESCE(SUM(CASE WHEN h.category = 'sport' THEN h.points ELSE 0 END), 0) as category_points
      FROM players p
      LEFT JOIN history h ON p.name = h.player_name
      GROUP BY p.name, p.franchise, p.score
      ORDER BY category_points DESC
      LIMIT 5
    `).all();
    
    res.json({ 
      academic: top5Academic, 
      sport: top5Sport 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats/franchise-balance', (req, res) => {
  try {
    const franchiseStats = db.prepare(`
      SELECT 
        p.franchise,
        COUNT(p.name) as player_count,
        SUM(p.score) as total_points,
        COALESCE(SUM(CASE WHEN h.category = 'academic' THEN h.points ELSE 0 END), 0) as academic_points,
        COALESCE(SUM(CASE WHEN h.category = 'sport' THEN h.points ELSE 0 END), 0) as sport_points,
        COALESCE(SUM(CASE WHEN h.category = 'general' THEN h.points ELSE 0 END), 0) as general_points
      FROM players p
      LEFT JOIN history h ON p.name = h.player_name
      GROUP BY p.franchise
      ORDER BY total_points DESC
    `).all();
    
    const franchiseBalance = franchiseStats.map(franchise => {
      const totalCategorized = franchise.academic_points + franchise.sport_points;
      const academicPercent = totalCategorized > 0 ? (franchise.academic_points / totalCategorized * 100) : 50;
      const balance = Math.abs(50 - academicPercent);
      const avgPerPlayer = franchise.player_count > 0 ? Math.round(franchise.total_points / franchise.player_count) : 0;
      
      return {
        ...franchise,
        academic_percent: Math.round(academicPercent),
        sport_percent: Math.round(100 - academicPercent),
        balance_score: Math.round(100 - balance),
        avg_per_player: avgPerPlayer
      };
    });
    
    franchiseBalance.sort((a, b) => b.balance_score - a.balance_score);
    
    res.json(franchiseBalance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats/hall-of-fame', (req, res) => {
  try {
    const recordHolder = db.prepare(`
      SELECT name, franchise, score 
      FROM players 
      ORDER BY score DESC 
      LIMIT 1
    `).get();
    
    const mostBadges = db.prepare(`
      SELECT 
        pb.player_name as name,
        p.franchise,
        p.score,
        COUNT(pb.badge_id) as badge_count
      FROM player_badges pb
      JOIN players p ON pb.player_name = p.name
      GROUP BY pb.player_name, p.franchise, p.score
      ORDER BY badge_count DESC
      LIMIT 1
    `).get();
    
    const getFirstToReach = (threshold) => {
      return db.prepare(`
        SELECT h.player_name as name, p.franchise, MIN(h.timestamp) as date_reached
        FROM history h
        JOIN players p ON h.player_name = p.name
        WHERE h.new_total >= ?
        GROUP BY h.player_name, p.franchise
        ORDER BY date_reached ASC
        LIMIT 1
      `).get(threshold);
    };
    
    const hallOfFame = {
      recordHolder,
      mostBadges,
      firstTo50: getFirstToReach(50),
      firstTo100: getFirstToReach(100),
      firstTo150: getFirstToReach(150),
      firstTo200: getFirstToReach(200)
    };
    
    res.json(hallOfFame);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lancer le serveur 
app.listen(port, () => {
  console.log(`🚀 Serveur démarré sur le port ${port}`);
  console.log(`🔐 Mot de passe professeur: ${TEACHER_PASSWORD}`);
  console.log(`🏅 Système de badges automatique activé`);
  console.log(`📊 Base de données: ${dbPath}`);
  
  // Vérifier les classements toutes les heures
  setInterval(checkFranchiseRankings, 3600000);
  
  // Reset hebdomadaire (tous les lundis à minuit)
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      db.prepare('UPDATE franchise_stats SET weekly_points = 0').run();
      db.prepare('UPDATE player_stats SET weekly_actions = 0').run();
      console.log('📅 Reset hebdomadaire effectué');
    }
  }, 60000); // Vérifier chaque minute
  
  // Reset mensuel (le 1er de chaque mois)
  setInterval(() => {
    const now = new Date();
    if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      db.prepare('UPDATE franchise_stats SET monthly_points = 0').run();
      db.prepare('UPDATE player_stats SET monthly_actions = 0').run();
      console.log('📅 Reset mensuel effectué');
    }
  }, 60000);
});
