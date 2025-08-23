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
    // SÉRIES
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
      emoji: '🔥',
      description: '2 "Hardworker" en 2 semaines',
      points: 10,
      rarity: 'argent',
      condition: (stats) => {
        const dates = JSON.parse(stats.hardworker_dates || '[]');
        if (dates.length < 2) return false;
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const recentCount = dates.filter(d => new Date(d) > twoWeeksAgo).length;
        return recentCount >= 2;
      },
      hot_streak: {
  id: 'hot_streak',
  name: 'Hot Streak',
  emoji: '🔥',
  description: '5 actions positives d\'affilée',
  points: 5,
  rarity: 'bronze',
  condition: (stats) => stats.current_streak >= 5 && stats.max_streak >= 5
},
    },
    
    // PERSÉVÉRANCE
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
        return days.length >= 5;
      }
    },
    
    // SOCIAUX/ÉQUIPE
    team_captain: {
      id: 'team_captain',
      name: 'Team Captain',
      emoji: '👑',
      description: 'Meilleur de sa franchise pendant 1 semaine',
      points: 10,
      rarity: 'argent',
      condition: null // Vérifié séparément
    },
    veteran: {
      id: 'veteran',
      name: 'Veteran',
      emoji: '🎖️',
      description: 'Top 3 de sa franchise pendant 2 mois',
      points: 20,
      rarity: 'or',
      condition: null // Vérifié séparément
    },
    
    // SPÉCIAUX
    showtime: {
      id: 'showtime',
      name: 'Showtime',
      emoji: '🎪',
      description: 'Recevoir "Félicitations" 3 fois',
      points: 35,
      rarity: 'diamant',
      condition: (stats) => stats.felicitations_count >= 3
    },
    halloween_spirit: {
      id: 'halloween_spirit',
      name: 'Halloween Spirit',
      emoji: '🎃',
      description: 'Actions positives semaine Halloween',
      points: 50,
      rarity: 'legendaire',
      condition: null // Vérifié pendant Halloween
    },
    christmas_magic: {
      id: 'christmas_magic',
      name: 'Christmas Magic',
      emoji: '🎄',
      description: 'Actions positives pendant les fêtes',
      points: 50,
      rarity: 'legendaire',
      condition: null // Vérifié pendant Noël
    },
    back_to_school: {
      id: 'back_to_school',
      name: 'Back to School',
      emoji: '📚',
      description: '10 actions positives premier mois rentrée',
      points: 50,
      rarity: 'legendaire',
      condition: null // Vérifié en septembre
    }
  },
  
  collective: {
    // DOMINATION
    franchise_royalty: {
      id: 'franchise_royalty',
      name: 'Franchise Royalty',
      emoji: '👑',
      description: '#1 pendant 1 mois complet',
      points: 50,
      rarity: 'argent'
    },
    dynasty: {
      id: 'dynasty',
      name: 'Dynasty',
      emoji: '🌟',
      description: '#1 pendant 3 mois consécutifs',
      points: 100,
      rarity: 'or'
    },
    
    // PERFORMANCES
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
    
    // SOLIDARITÉ
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
    
    const transaction = db.transaction(() => {
      // Récupérer l'ancien score
      const oldPlayer = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
      if (!oldPlayer) throw new Error('Joueur non trouvé');
      
      // Mettre à jour le score
      db.prepare('UPDATE players SET score = score + ? WHERE name = ?').run(points, playerName);
      
      // Récupérer le nouveau score
      const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
      
      // Ajouter à l'historique
      const timestamp = new Date().toLocaleString('fr-FR');
      db.prepare(`
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(playerName, action, points, timestamp, player.score, teacherName || 'Anonyme');
      
      // Mettre à jour les statistiques
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
        
        // Gérer les streaks
        if (points > 0) {
          updates.current_streak++;
          updates.max_streak = Math.max(updates.current_streak, updates.max_streak);
          updates.weekly_actions++;
          updates.monthly_actions++;
        } else {
          updates.current_streak = 0;
        }
        
        // Tracker le score le plus bas
        if (player.score < updates.lowest_score) {
          updates.lowest_score = player.score;
        }
        
        // Compter les actions spéciales
        if (action === 'Félicitations') {
          updates.felicitations_count++;
        }
        if (action === 'Hardworker') {
          updates.hardworker_count++;
          updates.hardworker_dates.push(new Date().toISOString());
        }
        
        // Mettre à jour les consecutive_days
        const today = new Date().toDateString();
        const consecutiveDays = JSON.parse(stats.consecutive_days || '[]');
        if (!consecutiveDays.includes(today) && points > 0) {
          consecutiveDays.push(today);
          // Garder seulement les 7 derniers jours
          if (consecutiveDays.length > 7) {
            consecutiveDays.shift();
          }
        }
        
        // Sauvegarder les stats
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
      
      // Mettre à jour les stats de franchise
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
    
    // Vérifier les badges après la transaction
    checkIndividualBadges(playerName);
    checkCollectiveBadges(result.franchise);
    
    // Récupérer les badges du joueur
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
      
      const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
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

// Servir l'application React
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
