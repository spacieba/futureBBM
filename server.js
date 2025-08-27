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

// === À AJOUTER DANS LE db.exec APRÈS LA LIGNE 103 ===
// Remplacez votre db.exec actuel par :

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

  -- ===== NOUVELLES TABLES =====
  
  CREATE TABLE IF NOT EXISTS player_category_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('sport', 'academic')),
    points INTEGER NOT NULL,
    date TEXT NOT NULL,
    week_year TEXT NOT NULL,
    month_year TEXT NOT NULL,
    quarter_year TEXT NOT NULL,
    action_description TEXT,
    FOREIGN KEY (player_name) REFERENCES players (name)
  );

  CREATE TABLE IF NOT EXISTS hall_of_fame (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    achievement_type TEXT NOT NULL,
    achievement_name TEXT NOT NULL,
    value INTEGER NOT NULL,
    date_achieved TEXT NOT NULL,
    is_current_record BOOLEAN DEFAULT 1,
    FOREIGN KEY (player_name) REFERENCES players (name)
  );

  CREATE TABLE IF NOT EXISTS mvp_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type TEXT NOT NULL CHECK(period_type IN ('week', 'month', 'quarter')),
    period_value TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('sport', 'academic', 'overall')),
    player_name TEXT NOT NULL,
    points INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (player_name) REFERENCES players (name),
    UNIQUE(period_type, period_value, category)
  );

  -- Index pour optimiser les performances
  CREATE INDEX IF NOT EXISTS idx_category_points_date ON player_category_points(date);
  CREATE INDEX IF NOT EXISTS idx_category_points_week ON player_category_points(week_year);
  CREATE INDEX IF NOT EXISTS idx_category_points_month ON player_category_points(month_year);
  CREATE INDEX IF NOT EXISTS idx_category_points_quarter ON player_category_points(quarter_year);
  CREATE INDEX IF NOT EXISTS idx_category_points_category ON player_category_points(category);
  CREATE INDEX IF NOT EXISTS idx_hall_of_fame_type ON hall_of_fame(achievement_type);
  CREATE INDEX IF NOT EXISTS idx_mvp_period ON mvp_records(period_type, period_value);
`);

// === FONCTIONS UTILITAIRES POUR LES DATES ===
// À ajouter également dans server.js après les définitions existantes

// Fonction pour obtenir le numéro de semaine ISO
const getWeekYear = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
};

// Fonction pour obtenir le mois-année
const getMonthYear = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

// Fonction pour obtenir le trimestre-année
const getQuarterYear = (date = new Date()) => {
  const d = new Date(date);
  const quarter = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${quarter}`;
};

// === FONCTION DE CATÉGORISATION DES ACTIONS ===
// À ajouter dans server.js

const getCategoryFromAction = (action) => {
  // Actions Sport
  const sportKeywords = [
    'Hardworker', 'entrainement', 'club', 'Victoire', 'Défaite', 'weekend',
    'Extra basket', 'cross', 'AS', 'sélection', 'étoiles', 'facultatifs',
    'marque', 'Arbitrage', 'Bonus Sport', 'Pénalité Sport',
    'Mauvaise attitude', 'retard entrainement', 'Absences', 'non justifiées'
  ];
  
  // Actions Académiques
  const academicKeywords = [
    'Observation positive', 'Participation', 'Travail de qualité',
    'sentinelle', 'ateliers devoirs', 'délégué', 'conseil admin',
    'Félicitations', 'Compliments', 'Encouragements', 'Bonus Scolaire',
    'Pénalité Scolaire', 'Observation négative', 'Exclusion', 'cours',
    'établissement', 'non fait', 'non justifiée', 'classe', 'perturbe'
  ];
  
  const actionLower = action.toLowerCase();
  
  // Vérifier d'abord les mots-clés sport
  for (const keyword of sportKeywords) {
    if (actionLower.includes(keyword.toLowerCase())) {
      return 'sport';
    }
  }
  
  // Puis les mots-clés académiques
  for (const keyword of academicKeywords) {
    if (actionLower.includes(keyword.toLowerCase())) {
      return 'academic';
    }
  }
  
  // Par défaut, si contient 🏀 c'est sport, si contient 📚 c'est académique
  if (action.includes('🏀')) return 'sport';
  if (action.includes('📚')) return 'academic';
  
  // Fallback: si on ne peut pas déterminer, on considère comme 'academic'
  return 'academic';
};

console.log('✅ Étape 1 terminée - Base de données étendue avec les nouvelles tables');
console.log('📊 Nouvelles tables créées : player_category_points, hall_of_fame, mvp_records');
console.log('🔧 Fonctions utilitaires ajoutées : getWeekYear, getMonthYear, getQuarterYear, getCategoryFromAction');

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
// === À AJOUTER JUSTE APRÈS LA DÉFINITION DES BADGES (après la ligne ~300) ===

// === FONCTIONS UTILITAIRES POUR DATES ET CATÉGORISATION ===

// Fonction pour obtenir le numéro de semaine ISO
const getWeekYear = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
};

// Fonction pour obtenir le mois-année
const getMonthYear = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

// Fonction pour obtenir le trimestre-année
const getQuarterYear = (date = new Date()) => {
  const d = new Date(date);
  const quarter = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${quarter}`;
};

// Fonction de catégorisation automatique des actions
const getCategoryFromAction = (action) => {
  // Actions Sport - mots-clés et emojis
  const sportKeywords = [
    'hardworker', 'entrainement', 'club', 'victoire', 'défaite', 'weekend',
    'extra basket', 'cross', 'as', 'sélection', 'étoiles', 'facultatifs',
    'marque', 'arbitrage', 'bonus sport', 'pénalité sport',
    'mauvaise attitude', 'retard entrainement', 'absences', 'non justifiées'
  ];
  
  // Actions Académiques - mots-clés et emojis
  const academicKeywords = [
    'observation positive', 'participation', 'travail de qualité',
    'sentinelle', 'ateliers devoirs', 'délégué', 'conseil admin',
    'félicitations', 'compliments', 'encouragements', 'bonus scolaire',
    'pénalité scolaire', 'observation négative', 'exclusion', 'cours',
    'établissement', 'non fait', 'non justifiée', 'classe', 'perturbe'
  ];
  
  const actionLower = action.toLowerCase();
  
  // Vérifier d'abord les emojis (plus fiable)
  if (action.includes('🏀')) return 'sport';
  if (action.includes('📚')) return 'academic';
  
  // Puis vérifier les mots-clés sport
  for (const keyword of sportKeywords) {
    if (actionLower.includes(keyword)) {
      return 'sport';
    }
  }
  
  // Puis les mots-clés académiques
  for (const keyword of academicKeywords) {
    if (actionLower.includes(keyword)) {
      return 'academic';
    }
  }
  
  // Fallback: si on ne peut pas déterminer, considérer comme 'academic'
  return 'academic';
};

// Fonction pour vérifier et mettre à jour le Hall of Fame
const updateHallOfFame = (playerName, newScore) => {
  const now = new Date().toISOString();
  
  // Vérifier les paliers milestone
  const milestones = [
    { value: 50, name: 'first_to_50' },
    { value: 100, name: 'first_to_100' },
    { value: 150, name: 'first_to_150' },
    { value: 200, name: 'first_to_200' },
    { value: 250, name: 'first_to_250' }
  ];
  
  milestones.forEach(milestone => {
    if (newScore >= milestone.value) {
      // Vérifier si quelqu'un a déjà atteint ce palier
      const existing = db.prepare(`
        SELECT * FROM hall_of_fame 
        WHERE achievement_type = 'milestone' AND achievement_name = ?
      `).get(milestone.name);
      
      if (!existing) {
        // Premier à atteindre ce palier !
        db.prepare(`
          INSERT INTO hall_of_fame (player_name, achievement_type, achievement_name, value, date_achieved)
          VALUES (?, 'milestone', ?, ?, ?)
        `).run(playerName, milestone.name, milestone.value, now);
        
        console.log(`🏆 ${playerName} est le premier à atteindre ${milestone.value} points !`);
      }
    }
  });
  
  // Vérifier le record du score le plus élevé
  const currentRecord = db.prepare(`
    SELECT * FROM hall_of_fame 
    WHERE achievement_type = 'record' AND achievement_name = 'highest_score'
    ORDER BY value DESC LIMIT 1
  `).get();
  
  if (!currentRecord || newScore > currentRecord.value) {
    // Nouveau record !
    if (currentRecord) {
      // Marquer l'ancien record comme non-current
      db.prepare(`
        UPDATE hall_of_fame 
        SET is_current_record = 0 
        WHERE id = ?
      `).run(currentRecord.id);
    }
    
    // Ajouter le nouveau record
    db.prepare(`
      INSERT INTO hall_of_fame (player_name, achievement_type, achievement_name, value, date_achieved)
      VALUES (?, 'record', 'highest_score', ?, ?)
    `).run(playerName, newScore, now);
    
    console.log(`🎯 Nouveau record de score : ${playerName} avec ${newScore} points !`);
  }
};

console.log('✅ Fonctions utilitaires ajoutées : getWeekYear, getMonthYear, getQuarterYear, getCategoryFromAction, updateHallOfFame');
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
      
      // === NOUVEAU: TRACKER PAR CATÉGORIE ===
      const category = getCategoryFromAction(action);
      const now = new Date();
      
      // Insérer dans player_category_points
      db.prepare(`
        INSERT INTO player_category_points 
        (player_name, category, points, date, week_year, month_year, quarter_year, action_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        playerName,
        category,
        points,
        now.toISOString(),
        getWeekYear(now),
        getMonthYear(now),
        getQuarterYear(now),
        action
      );
      
      console.log(`📊 Points trackés: ${playerName} - ${points} pts en ${category} (${action})`);
      
      // === NOUVEAU: VÉRIFIER HALL OF FAME ===
      if (player.score > oldPlayer.score) {
        updateHallOfFame(playerName, player.score);
      }
      
      // Mettre à jour les statistiques existantes (code inchangé)
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
        if (action.includes('Félicitations')) {
          updates.felicitations_count++;
        }
        if (action.includes('Hardworker')) {
          updates.hardworker_count++;
          updates.hardworker_dates.push(new Date().toISOString());
        }
        
        // Mettre à jour les consecutive_days
        const today = new Date().toDateString();
        const consecutiveDays = JSON.parse(stats.consecutive_days || '[]');
        if (!consecutiveDays.includes(today) && points > 0) {
          consecutiveDays.push(today);
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
      
      // Mettre à jour les stats de franchise (code existant inchangé)
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
      
      return { player, franchise, category };
    });
    
    const result = transaction();
    
    // Vérifier les badges après la transaction (code existant)
    checkIndividualBadges(playerName);
    checkCollectiveBadges(result.franchise);
    
    // === NOUVEAU: CALCULER ET METTRE À JOUR LES MVP ===
    updateMVPRecords();
    
    // Récupérer les badges du joueur
    const badges = db.prepare(`
      SELECT badge_id, badge_name, badge_emoji, rarity 
      FROM player_badges 
      WHERE player_name = ?
    `).all(playerName);
    
    res.json({ 
      success: true, 
      newScore: result.player.score,
      category: result.category,
      badges: badges
    });
    
  } catch (error) {
    console.error('Erreur lors de l\'ajout de points:', error);
    res.status(500).json({ error: error.message });
  }
});

// === NOUVELLE FONCTION: CALCULER ET METTRE À JOUR LES MVP ===
const updateMVPRecords = () => {
  const now = new Date();
  const currentWeek = getWeekYear(now);
  const currentMonth = getMonthYear(now);
  const currentQuarter = getQuarterYear(now);
  
  // Calculer MVP de la semaine (sport et académique)
  updateMVPForPeriod('week', currentWeek, 'sport');
  updateMVPForPeriod('week', currentWeek, 'academic');
  updateMVPForPeriod('week', currentWeek, 'overall');
  
  // Calculer MVP du mois (sport et académique)
  updateMVPForPeriod('month', currentMonth, 'sport');
  updateMVPForPeriod('month', currentMonth, 'academic');
  updateMVPForPeriod('month', currentMonth, 'overall');
  
  // Calculer MVP du trimestre (sport et académique)
  updateMVPForPeriod('quarter', currentQuarter, 'sport');
  updateMVPForPeriod('quarter', currentQuarter, 'academic');
  updateMVPForPeriod('quarter', currentQuarter, 'overall');
};

// Fonction helper pour calculer MVP d'une période spécifique
const updateMVPForPeriod = (periodType, periodValue, category) => {
  let query;
  let params = [periodValue];
  
  if (category === 'overall') {
    // MVP global (toutes catégories)
    query = `
      SELECT player_name, SUM(points) as total_points
      FROM player_category_points 
      WHERE ${periodType}_year = ? AND points > 0
      GROUP BY player_name 
      ORDER BY total_points DESC 
      LIMIT 1
    `;
  } else {
    // MVP par catégorie (sport ou academic)
    query = `
      SELECT player_name, SUM(points) as total_points
      FROM player_category_points 
      WHERE ${periodType}_year = ? AND category = ? AND points > 0
      GROUP BY player_name 
      ORDER BY total_points DESC 
      LIMIT 1
    `;
    params.push(category);
  }
  
  const mvpData = db.prepare(query).get(...params);
  
  if (mvpData && mvpData.total_points > 0) {
    // Mettre à jour ou insérer le MVP
    db.prepare(`
      INSERT OR REPLACE INTO mvp_records 
      (period_type, period_value, category, player_name, points, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      periodType,
      periodValue,
      category,
      mvpData.player_name,
      mvpData.total_points,
      new Date().toISOString()
    );
    
    console.log(`🏆 MVP ${category} ${periodType}: ${mvpData.player_name} (${mvpData.total_points} pts)`);
  }
};

console.log('✅ Étape 2 terminée - Fonction addPoints modifiée avec tracking automatique');

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
