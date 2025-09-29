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

// Configuration des types MIME pour éviter les problèmes de déploiement
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// 🔒 MOT DE PASSE PROFESSEUR - MODIFIABLE ICI
const TEACHER_PASSWORD = 'GPwinner2026';

// 🔐 Fonction pour générer un code d'accès unique pour chaque élève
function generateStudentCode(playerName) {
  const crypto = require('crypto');
  const secret = 'GPBasketball2026Secret'; // Clé secrète pour la génération des codes
  const hash = crypto.createHash('md5').update(secret + playerName.toLowerCase()).digest('hex');
  // Prendre les 6 premiers caractères et les convertir en format XXX-XXX
  const code = hash.substring(0, 6).toUpperCase();
  return code.substring(0, 3) + '-' + code.substring(3, 6);
}

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
    score INTEGER DEFAULT 0,
    is_drafted INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    action TEXT NOT NULL,
    points INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    new_total INTEGER NOT NULL,
    teacher_name TEXT DEFAULT 'Anonyme',
    category TEXT DEFAULT 'unknown',
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
    total_points INTEGER DEFAULT 0,
    last_negative_date TEXT,
    consecutive_positive_weeks INTEGER DEFAULT 0,
    best_rank_duration INTEGER DEFAULT 0,
    last_rank_check TEXT
  );
`);

db.exec(`
  -- Table pour les records permanents du Hall of Fame
  CREATE TABLE IF NOT EXISTS hall_of_fame (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_type TEXT NOT NULL, -- 'first_50', 'first_100', 'first_150', 'highest_score'
    player_name TEXT NOT NULL,
    franchise TEXT NOT NULL,
    score INTEGER NOT NULL,
    date_achieved TEXT NOT NULL,
    weeks_held INTEGER DEFAULT 1,
    is_current INTEGER DEFAULT 1, -- 1 si record actuel, 0 si dépassé
    UNIQUE(record_type, player_name, date_achieved)
  );

  -- Table pour l'historique des MVP
  CREATE TABLE IF NOT EXISTS mvp_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type TEXT NOT NULL, -- 'week', 'month', 'trimester'
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    mvp_type TEXT NOT NULL, -- 'academic', 'sport', 'overall', 'progression'
    player_name TEXT NOT NULL,
    franchise TEXT NOT NULL,
    points_earned INTEGER NOT NULL,
    total_score INTEGER NOT NULL,
    date_awarded TEXT NOT NULL
  );

  -- Table pour les statistiques par période et catégorie
  CREATE TABLE IF NOT EXISTS period_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    franchise TEXT NOT NULL,
    period_type TEXT NOT NULL, -- 'week', 'month', 'trimester'
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    sport_points INTEGER DEFAULT 0,
    academic_points INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    actions_count INTEGER DEFAULT 0,
    date_updated TEXT NOT NULL,
    FOREIGN KEY (player_name) REFERENCES players (name),
    UNIQUE(player_name, period_type, period_start)
  );

  -- Table pour suivre les positions des franchises dans le temps
  CREATE TABLE IF NOT EXISTS franchise_rankings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    franchise TEXT NOT NULL,
    date_recorded TEXT NOT NULL,
    position INTEGER NOT NULL, -- 1, 2, 3, 4
    total_points INTEGER NOT NULL,
    sport_points INTEGER DEFAULT 0,
    academic_points INTEGER DEFAULT 0,
    UNIQUE(franchise, date_recorded)
  );
`);

// Index pour optimiser les requêtes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_history_category ON history(category);
  CREATE INDEX IF NOT EXISTS idx_history_date ON history(DATE(timestamp));
  CREATE INDEX IF NOT EXISTS idx_period_stats_period ON period_stats(period_type, period_start);
`);

// Ajouter la colonne total_points si elle n'existe pas (pour les bases existantes)
try {
  // Vérifier si la colonne existe déjà
  const columns = db.pragma('table_info(franchise_stats)');
  const hasColumn = columns.some(col => col.name === 'total_points');
  
  if (!hasColumn) {
    console.log('🔧 Ajout de la colonne total_points à franchise_stats...');
    db.exec(`ALTER TABLE franchise_stats ADD COLUMN total_points INTEGER DEFAULT 0`);
    console.log('✅ Colonne total_points ajoutée avec succès');
  } else {
    console.log('✅ Colonne total_points déjà présente');
  }
} catch (error) {
  console.error('❌ Erreur lors de l\'ajout de la colonne total_points:', error.message);
}

// FONCTIONS UTILITAIRES

// Fonction pour déterminer la catégorie d'une action
const getActionCategory = (action) => {
  const actionLower = action.toLowerCase();
  
  // Sport - Vérifier d'abord les mots-clés spécifiques
  if (action.includes('🏀') || 
      actionLower.includes('hardworker') ||
      actionLower.includes('entrainement') ||
      actionLower.includes('basket') ||
      actionLower.includes('victoire') ||
      actionLower.includes('défaite') ||
      actionLower.includes('weekend') ||
      actionLower.includes('tournoi') ||
      actionLower.includes('sélection') ||
      actionLower.includes('arbitrage') ||
      actionLower.includes('table de marque') ||
      actionLower.includes('bonus sport') ||
      actionLower.includes('pénalité sport')) {
    return 'sport';
  }
  
  // Académique
  if (action.includes('📚') || 
      actionLower.includes('scolaire') ||
      actionLower.includes('classe') ||
      actionLower.includes('observation') ||
      actionLower.includes('félicitations') ||
      actionLower.includes('compliments') ||
      actionLower.includes('encouragements') ||
      actionLower.includes('exclusion') ||
      actionLower.includes('travail') ||
      actionLower.includes('retard') ||
      actionLower.includes('absence') ||
      actionLower.includes('délégué') ||
      actionLower.includes('sentinelle') ||
      actionLower.includes('devoirs') ||
      actionLower.includes('bonus scolaire') ||
      actionLower.includes('pénalité scolaire')) {
    return 'academic';
  }
  
  console.log(`⚠️ Catégorie inconnue pour: "${action}"`);
  return 'unknown';
};

// Fonction pour obtenir les dates de début/fin de semaine (lundi à dimanche)
const getWeekBounds = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lundi = début
  
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return {
    start: monday.toISOString(),
    end: sunday.toISOString()
  };
};

// Fonction pour obtenir les dates de début/fin de mois
const getMonthBounds = (date = new Date()) => {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
};

// Fonction pour obtenir les dates de trimestre scolaire
const getTrimesterBounds = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  
  if (month >= 9 && month <= 12) {
    // Trimestre 1: septembre à décembre
    return {
      start: new Date(year, 8, 1).toISOString(), // 1er septembre
      end: new Date(year, 11, 31, 23, 59, 59, 999).toISOString() // 31 décembre
    };
  } else if (month >= 1 && month <= 3) {
    // Trimestre 2: janvier à mars
    return {
      start: new Date(year, 0, 1).toISOString(), // 1er janvier
      end: new Date(year, 2, 31, 23, 59, 59, 999).toISOString() // 31 mars
    };
  } else {
    // Trimestre 3: avril à juin
    return {
      start: new Date(year, 3, 1).toISOString(), // 1er avril
      end: new Date(year, 5, 30, 23, 59, 59, 999).toISOString() // 30 juin
    };
  }
};

// Fonction pour mettre à jour les statistiques par période
const updatePeriodStats = (playerName, points, action) => {
  const category = getActionCategory(action);
  const now = new Date();
  
  // Mettre à jour stats hebdomadaires
  const weekBounds = getWeekBounds(now);
  updatePlayerPeriodStat(playerName, 'week', weekBounds.start, weekBounds.end, points, category);
  
  // Mettre à jour stats mensuelles
  const monthBounds = getMonthBounds(now);
  updatePlayerPeriodStat(playerName, 'month', monthBounds.start, monthBounds.end, points, category);
  
  // Mettre à jour stats trimestrielles
  const trimesterBounds = getTrimesterBounds(now);
  updatePlayerPeriodStat(playerName, 'trimester', trimesterBounds.start, trimesterBounds.end, points, category);
};

const updatePlayerPeriodStat = (playerName, periodType, periodStart, periodEnd, points, category) => {
  const player = db.prepare('SELECT franchise FROM players WHERE name = ?').get(playerName);
  if (!player) {
    console.log(`⚠️ Joueur ${playerName} non trouvé`);
    return;
  }
  
  console.log(`📊 Mise à jour stats: ${playerName}, période: ${periodType}, catégorie: ${category}, points: ${points}`);
  
  // Vérifier si l'enregistrement existe
  const existing = db.prepare(`
    SELECT * FROM period_stats 
    WHERE player_name = ? AND period_type = ? AND period_start = ?
  `).get(playerName, periodType, periodStart);
  
  const now = new Date().toISOString();
  
  if (existing) {
    // Mise à jour
    const updateStmt = db.prepare(`
      UPDATE period_stats SET
        sport_points = sport_points + CASE WHEN ? = 'sport' THEN ? ELSE 0 END,
        academic_points = academic_points + CASE WHEN ? = 'academic' THEN ? ELSE 0 END,
        total_points = total_points + ?,
        actions_count = actions_count + 1,
        date_updated = ?
      WHERE player_name = ? AND period_type = ? AND period_start = ?
    `);
    
    updateStmt.run(
      category, points,
      category, points,
      points,
      now,
      playerName, periodType, periodStart
    );
    console.log(`✅ Stats mises à jour pour ${playerName}`);
  } else {
    // Insertion
    const insertStmt = db.prepare(`
      INSERT INTO period_stats (
        player_name, franchise, period_type, period_start, period_end,
        sport_points, academic_points, total_points, actions_count, date_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertStmt.run(
      playerName,
      player.franchise,
      periodType,
      periodStart,
      periodEnd,
      category === 'sport' ? points : 0,
      category === 'academic' ? points : 0,
      points,
      1,
      now
    );
    console.log(`✅ Nouvelles stats créées pour ${playerName}`);
  }
};

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
    
    // === SOCIAUX/ÉQUIPE (2 badges) ===
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
    
    // === SPÉCIAUX & RARES (6 badges) ===
    showtime: {
      id: 'showtime',
      name: 'Showtime',
      emoji: '🎪',
      description: 'Recevoir Félicitations 3 fois',
      points: 35,
      rarity: 'diamant',
      condition: (stats) => stats.felicitations_count >= 3
    },
    captain_courage: {
      id: 'captain_courage',
      name: 'Captain Courage',
      emoji: '🦾',
      description: 'Arbitrer ou tenir table de marque 5 fois en 3 mois',
      points: 18,
      rarity: 'or',
      condition: null // Vérifié dans checkIndividualBadges avec l'historique
    },
    clockwork: {
      id: 'clockwork',
      name: 'Clockwork',
      emoji: '⏰',
      description: 'Aucun retard pendant 3 mois',
      points: 12,
      rarity: 'argent',
      condition: null // Vérifié dans checkIndividualBadges avec l'historique
    },
    christmas_magic: {
      id: 'christmas_magic',
      name: 'Christmas Magic',
      emoji: '🎄',
      description: 'Actions positives pendant les fêtes',
      points: 50,
      rarity: 'legendaire',
      condition: null // Vérifié dans checkIndividualBadges avec la date
    },
    game_changer: {
      id: 'game_changer',
      name: 'Game Changer',
      emoji: '⚡',
      description: 'Passer des deux dernières places au top 3 de sa franchise',
      points: 40,
      rarity: 'diamant',
      condition: null // Vérifié dans checkIndividualBadges avec le classement
    },
    collectionneur: {
      id: 'collectionneur',
      name: 'Collectionneur',
      emoji: '🏆',
      description: 'Obtenir au moins 6 badges individuels et 6 badges collectifs',
      points: 12,
      rarity: 'or',
      condition: null // Vérifié dans checkIndividualBadges avec le compte de badges
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
    
    // === SOLIDARITÉ (6 badges) ===
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
    },
    no_weak_link: {
      id: 'no_weak_link',
      name: 'No Weak Link',
      emoji: '🔗',
      description: 'Dernier de la franchise au-dessus de +25 points pendant 2 mois',
      points: 60,
      rarity: 'argent'
    },
    triple_threat: {
      id: 'triple_threat',
      name: 'Triple Threat',
      emoji: '🎯',
      description: '3 membres dans le top 10 général pendant 1 mois',
      points: 75,
      rarity: 'argent'
    },
    mutual_support: {
      id: 'mutual_support',
      name: 'Mutual Support',
      emoji: '💪',
      description: '80% des membres ont des activités facultatives en 2 semaines',
      points: 50,
      rarity: 'bronze'
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
  
  // Ajouter la colonne is_drafted si elle n'existe pas
  const columnExists = db.prepare("SELECT COUNT(*) as count FROM pragma_table_info('players') WHERE name='is_drafted'").get();
  if (columnExists.count === 0) {
    db.exec('ALTER TABLE players ADD COLUMN is_drafted INTEGER DEFAULT 1');
  }
  
  // Ajouter la colonne was_bottom_two dans player_stats si elle n'existe pas
  const wasBottomTwoExists = db.prepare("SELECT COUNT(*) as count FROM pragma_table_info('player_stats') WHERE name='was_bottom_two'").get();
  if (wasBottomTwoExists.count === 0) {
    db.exec('ALTER TABLE player_stats ADD COLUMN was_bottom_two INTEGER DEFAULT 0');
  }
  
  // Ajouter colonnes pour tracking des nouveaux badges collectifs
  const noWeakLinkExists = db.prepare("SELECT COUNT(*) as count FROM pragma_table_info('franchise_stats') WHERE name='no_weak_link_start'").get();
  if (noWeakLinkExists.count === 0) {
    db.exec(`
      ALTER TABLE franchise_stats ADD COLUMN no_weak_link_start TEXT;
      ALTER TABLE franchise_stats ADD COLUMN triple_threat_start TEXT;
    `);
  }
  
  if (existingPlayers.count === 0) {
    const insertPlayer = db.prepare('INSERT INTO players (name, franchise, score, is_drafted) VALUES (?, ?, ?, ?)');
    const insertStats = db.prepare('INSERT INTO player_stats (player_name) VALUES (?)');
    
    Object.entries(initialFranchises).forEach(([franchise, players]) => {
      players.forEach(player => {
        insertPlayer.run(player, franchise, 0, 1);
        insertStats.run(player);
      });
    });
  }
  
  // Initialiser les stats de franchise (seulement pour les vraies franchises)
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
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
        VALUES (?, ?, ?, ?, (SELECT score FROM players WHERE name = ?), ?, ?)
      `);
      const timestamp = new Date().toISOString();
      insertHistory.run(playerName, `Badge débloqué: ${badge.name}`, badge.points, timestamp, playerName, 'Système', 'unknown');
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
  
  // Vérifications spéciales pour badges temporels et historiques
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  
  // Captain Courage - Vérifier arbitrage/table de marque sur 3 mois
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  const arbitrageCount = db.prepare(`
    SELECT COUNT(*) as count FROM history 
    WHERE player_name = ? 
    AND (LOWER(action) LIKE '%table de marque%' OR LOWER(action) LIKE '%arbitrage%')
    AND timestamp >= ?
  `).get(playerName, threeMonthsAgo.toISOString());
  
  if (arbitrageCount && arbitrageCount.count >= 5) {
    awardPlayerBadge(playerName, BADGES.individual.captain_courage);
  }
  
  // Clockwork - Vérifier aucun retard pendant 3 mois
  const retardCount = db.prepare(`
    SELECT COUNT(*) as count FROM history 
    WHERE player_name = ? 
    AND (LOWER(action) LIKE '%retard%' OR LOWER(action) LIKE '%absence non justifiée%')
    AND timestamp >= ?
  `).get(playerName, threeMonthsAgo.toISOString());
  
  // Vérifier si le joueur a au moins 3 mois d'historique
  const firstAction = db.prepare(`
    SELECT MIN(timestamp) as first_date FROM history 
    WHERE player_name = ?
  `).get(playerName);
  
  if (firstAction && firstAction.first_date) {
    const firstDate = new Date(firstAction.first_date);
    const threeMonthsOld = new Date(firstDate);
    threeMonthsOld.setMonth(threeMonthsOld.getMonth() + 3);
    
    // Si le joueur a plus de 3 mois d'historique et aucun retard
    if (now >= threeMonthsOld && retardCount && retardCount.count === 0) {
      awardPlayerBadge(playerName, BADGES.individual.clockwork);
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
  
  // Game Changer - Vérifier passage des 2 derniers au top 3
  const franchisePlayers = db.prepare(`
    SELECT name, score FROM players 
    WHERE franchise = (SELECT franchise FROM players WHERE name = ?)
    ORDER BY score DESC
  `).all(playerName);
  
  if (franchisePlayers.length >= 3) {
    const playerRank = franchisePlayers.findIndex(p => p.name === playerName) + 1;
    const isInTop3 = playerRank <= 3;
    
    // Vérifier si le joueur était dans les 2 derniers
    const wasBottomTwo = stats.was_bottom_two === 1;
    
    // Si actuellement dans les 2 derniers, marquer le statut
    if (playerRank >= franchisePlayers.length - 1) {
      db.prepare('UPDATE player_stats SET was_bottom_two = 1 WHERE player_name = ?').run(playerName);
    }
    
    // Si était dans les 2 derniers et maintenant dans le top 3
    if (wasBottomTwo && isInTop3) {
      awardPlayerBadge(playerName, BADGES.individual.game_changer);
      // Réinitialiser le flag après avoir donné le badge
      db.prepare('UPDATE player_stats SET was_bottom_two = 0 WHERE player_name = ?').run(playerName);
    }
  }
  
  // Collectionneur - Vérifier 6+ badges individuels et 6+ badges collectifs
  const individualBadgeCount = db.prepare(`
    SELECT COUNT(*) as count FROM player_badges 
    WHERE player_name = ?
  `).get(playerName);
  
  const franchiseBadgeCount = db.prepare(`
    SELECT COUNT(*) as count FROM franchise_badges 
    WHERE franchise = (SELECT franchise FROM players WHERE name = ?)
  `).get(playerName);
  
  if (individualBadgeCount && franchiseBadgeCount && 
      individualBadgeCount.count >= 6 && franchiseBadgeCount.count >= 6) {
    awardPlayerBadge(playerName, BADGES.individual.collectionneur);
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
  
  // Créer les stats de franchise si elles n'existent pas
  db.prepare('INSERT OR IGNORE INTO franchise_stats (franchise) VALUES (?)').run(franchise);
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
  
  // Harmony (écart <50 points entre 1er et dernier) - Actif uniquement à partir de décembre
  const now = new Date();
  const month = now.getMonth();
  
  if (month === 11 && players.length > 0) { // Décembre = mois 11
    const scores = players.map(p => p.score).sort((a, b) => b - a);
    const highestScore = scores[0];
    const lowestScore = scores[scores.length - 1];
    const gap = highestScore - lowestScore;
    
    if (gap < 50) {
      awardFranchiseBadge(franchise, BADGES.collective.harmony);
    }
  }
  
  // No Weak Link - Dernier de la franchise au-dessus de 25 points pendant 2 mois
  if (players.length > 0) {
    const lowestScore = Math.min(...players.map(p => p.score));
    
    if (lowestScore >= 25) {
      // Vérifier si c'est le début de la période
      if (!franchiseStats.no_weak_link_start) {
        db.prepare('UPDATE franchise_stats SET no_weak_link_start = ? WHERE franchise = ?')
          .run(now.toISOString(), franchise);
      } else {
        // Vérifier si 2 mois se sont écoulés
        const startDate = new Date(franchiseStats.no_weak_link_start);
        const twoMonthsLater = new Date(startDate);
        twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
        
        if (now >= twoMonthsLater) {
          awardFranchiseBadge(franchise, BADGES.collective.no_weak_link);
          // Réinitialiser pour permettre de ré-obtenir le badge
          db.prepare('UPDATE franchise_stats SET no_weak_link_start = NULL WHERE franchise = ?')
            .run(franchise);
        }
      }
    } else {
      // Réinitialiser si quelqu'un descend sous 25 points
      if (franchiseStats.no_weak_link_start) {
        db.prepare('UPDATE franchise_stats SET no_weak_link_start = NULL WHERE franchise = ?')
          .run(franchise);
      }
    }
  }
  
  // Triple Threat - 3 membres dans le top 10 général pendant 1 mois
  const allPlayersRanked = db.prepare('SELECT name, franchise, score FROM players ORDER BY score DESC').all();
  const top10 = allPlayersRanked.slice(0, 10);
  const franchiseInTop10 = top10.filter(p => p.franchise === franchise);
  
  if (franchiseInTop10.length >= 3) {
    if (!franchiseStats.triple_threat_start) {
      db.prepare('UPDATE franchise_stats SET triple_threat_start = ? WHERE franchise = ?')
        .run(now.toISOString(), franchise);
    } else {
      const startDate = new Date(franchiseStats.triple_threat_start);
      const oneMonthLater = new Date(startDate);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      
      if (now >= oneMonthLater) {
        awardFranchiseBadge(franchise, BADGES.collective.triple_threat);
        db.prepare('UPDATE franchise_stats SET triple_threat_start = NULL WHERE franchise = ?')
          .run(franchise);
      }
    }
  } else {
    // Réinitialiser si moins de 3 dans le top 10
    if (franchiseStats.triple_threat_start) {
      db.prepare('UPDATE franchise_stats SET triple_threat_start = NULL WHERE franchise = ?')
        .run(franchise);
    }
  }
  
  // Mutual Support - 80% des membres ont des activités facultatives en 2 semaines
  if (players.length > 0) {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const playersWithFacultativeActivities = players.filter(player => {
      const facultativeActions = db.prepare(`
        SELECT COUNT(*) as count FROM history 
        WHERE player_name = ? 
        AND timestamp >= ?
        AND (LOWER(action) LIKE '%sentinelle%' OR 
             LOWER(action) LIKE '%atelier%' OR 
             LOWER(action) LIKE '%délégué%' OR 
             LOWER(action) LIKE '%conseil%')
      `).get(player.name, twoWeeksAgo.toISOString());
      
      return facultativeActions && facultativeActions.count > 0;
    });
    
    const percentage = (playersWithFacultativeActivities.length / players.length) * 100;
    
    if (percentage >= 80) {
      awardFranchiseBadge(franchise, BADGES.collective.mutual_support);
    }
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
      
      // Note: franchise_royalty and dynasty badges removed - not defined in BADGES object
    }
  }
};

// Fonction pour mettre à jour les records du Hall of Fame
const updateHallOfFame = (playerName, newScore) => {
  const player = db.prepare('SELECT franchise FROM players WHERE name = ?').get(playerName);
  if (!player) return;
  
  const milestones = [50, 100, 150, 200, 250];
  
  milestones.forEach(milestone => {
    // Vérifier si ce joueur a atteint ce palier
    const previousScore = db.prepare(`
      SELECT new_total - points as previous_score 
      FROM history 
      WHERE player_name = ? 
      ORDER BY id DESC 
      LIMIT 1
    `).get(playerName);
    
    const prevScore = previousScore ? previousScore.previous_score : 0;
    
    if (prevScore < milestone && newScore >= milestone) {
      // Premier à atteindre ce palier ?
      const existing = db.prepare(`
        SELECT * FROM hall_of_fame 
        WHERE record_type = ? AND is_current = 1
      `).get(`first_${milestone}`);
      
      if (!existing) {
        // Premier à atteindre ce palier
        db.prepare(`
          INSERT INTO hall_of_fame 
          (record_type, player_name, franchise, score, date_achieved, weeks_held, is_current)
          VALUES (?, ?, ?, ?, ?, 1, 1)
        `).run(`first_${milestone}`, playerName, player.franchise, newScore, new Date().toISOString());
      }
    }
  });
  
  // Mettre à jour le record absolu
  const currentHighest = db.prepare(`
    SELECT * FROM hall_of_fame 
    WHERE record_type = 'highest_score' AND is_current = 1
  `).get();
  
  if (!currentHighest || newScore > currentHighest.score) {
    // Marquer l'ancien record comme dépassé
    if (currentHighest) {
      db.prepare(`
        UPDATE hall_of_fame 
        SET is_current = 0 
        WHERE id = ?
      `).run(currentHighest.id);
    }
    
    // Nouveau record
    db.prepare(`
      INSERT INTO hall_of_fame 
      (record_type, player_name, franchise, score, date_achieved, weeks_held, is_current)
      VALUES ('highest_score', ?, ?, ?, ?, 1, 1)
    `).run(playerName, player.franchise, newScore, new Date().toISOString());
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
      
      return { ...player, badges, is_drafted: 1 };
    });
    
    // Récupérer les statistiques des franchises incluant les total_points
    let franchiseStats;
    try {
      franchiseStats = db.prepare(`
        SELECT 
          franchise,
          weekly_points,
          monthly_points,
          COALESCE(total_points, 0) as total_points,
          consecutive_positive_weeks,
          best_rank_duration
        FROM franchise_stats
      `).all();
    } catch (error) {
      console.log('⚠️ Colonne total_points non disponible, utilisation mode compatibilité');
      franchiseStats = db.prepare(`
        SELECT 
          franchise,
          weekly_points,
          monthly_points,
          0 as total_points,
          consecutive_positive_weeks,
          best_rank_duration
        FROM franchise_stats
      `).all();
    }
    
    // Calculer le total de chaque franchise (joueurs + points directs)
    const franchiseTotals = ['Minotaurs', 'Krakens', 'Phoenix', 'Eagles'].map(franchiseName => {
      const playersTotal = players
        .filter(p => p.franchise === franchiseName && p.is_drafted === 1)
        .reduce((sum, p) => sum + p.score, 0);
      
      const franchiseDirectPoints = franchiseStats.find(f => f.franchise === franchiseName)?.total_points || 0;
      
      return {
        franchise: franchiseName,
        players_total: playersTotal,
        franchise_points: franchiseDirectPoints,
        total: playersTotal + franchiseDirectPoints
      };
    });
    
    res.json({ 
      players: playersWithBadges,
      franchiseStats: franchiseTotals
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer un joueur spécifique avec vérification du code d'accès
app.get('/api/player/:playerName', (req, res) => {
  try {
    const { playerName } = req.params;
    const { code } = req.query;
    
    // Vérifier si le code d'accès est fourni et correct
    const expectedCode = generateStudentCode(playerName);
    
    if (!code || code !== expectedCode) {
      return res.status(403).json({ 
        error: 'Code d\'accès requis',
        message: 'Veuillez entrer votre code d\'accès personnel pour consulter votre profil.',
        needsCode: true
      });
    }
    
    const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
    if (player) {
      const badges = db.prepare(`
        SELECT * FROM player_badges 
        WHERE player_name = ?
      `).all(playerName);
      
      res.json({ ...player, badges });
    } else {
      res.status(404).json({ error: 'Joueur non trouvé' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer le code d'accès d'un élève (pour les professeurs uniquement)
app.get('/api/student-code/:playerName', (req, res) => {
  try {
    const { password } = req.query;
    
    if (password !== TEACHER_PASSWORD) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const code = generateStudentCode(req.params.playerName);
    res.json({ code, playerName: req.params.playerName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer tous les codes d'accès (pour les professeurs uniquement)
app.get('/api/all-student-codes', (req, res) => {
  try {
    const { password } = req.query;
    
    if (password !== TEACHER_PASSWORD) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const players = db.prepare('SELECT name, franchise FROM players ORDER BY name').all();
    const codes = players.map(player => ({
      name: player.name,
      franchise: player.franchise,
      code: generateStudentCode(player.name)
    }));
    
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer l'historique d'un joueur avec vérification du code d'accès
app.get('/api/history/:playerName', (req, res) => {
  try {
    const { playerName } = req.params;
    const { code } = req.query;
    
    // Vérifier si le code d'accès est fourni et correct
    const expectedCode = generateStudentCode(playerName);
    
    if (!code || code !== expectedCode) {
      return res.status(403).json({ 
        error: 'Code d\'accès requis',
        message: 'Veuillez entrer votre code d\'accès personnel pour consulter votre historique.',
        needsCode: true
      });
    }
    
    const history = db.prepare(`
      SELECT * FROM history 
      WHERE player_name = ? 
      ORDER BY id DESC 
      LIMIT 50
    `).all(playerName);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ajouter des points avec vérification automatique des badges
app.post('/api/add-points', (req, res) => {
  try {
    const { playerName, points, action, teacherName } = req.body;
    
    // Validation des paramètres
    if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
      return res.status(400).json({ error: 'Nom du joueur requis' });
    }
    if (typeof points !== 'number' || isNaN(points)) {
      return res.status(400).json({ error: 'Points invalides' });
    }
    if (!action || typeof action !== 'string' || action.trim() === '') {
      return res.status(400).json({ error: 'Action requise' });
    }
    
    console.log(`🎯 Ajout de points: ${playerName}, ${points} pts, action: ${action}`);
    
    const transaction = db.transaction(() => {
      // Récupérer l'ancien score
      const oldPlayer = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
      if (!oldPlayer) {
        throw new Error(`Joueur "${playerName}" non trouvé`);
      }
      
      // Mettre à jour le score
      db.prepare('UPDATE players SET score = score + ? WHERE name = ?').run(points, playerName);
      
      // Récupérer le nouveau score
      const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
      
      // Déterminer la catégorie AVANT l'insertion
      const category = getActionCategory(action);
      console.log(`📌 Catégorie détectée: ${category} pour l'action: ${action}`);
      
      // Ajouter à l'historique avec la catégorie
      const timestamp = new Date().toISOString();
      const insertHistory = db.prepare(`
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertHistory.run(playerName, action, points, timestamp, player.score, teacherName || 'Anonyme', category);
      
      // IMPORTANT: Appeler updatePeriodStats ICI
      updatePeriodStats(playerName, points, action);
      
      // Mettre à jour les records du Hall of Fame
      updateHallOfFame(playerName, player.score);
      
      // Mettre à jour les statistiques - créer si n'existe pas
      let stats = db.prepare('SELECT * FROM player_stats WHERE player_name = ?').get(playerName);
      
      // Si les stats n'existent pas, les créer
      if (!stats) {
        db.prepare('INSERT INTO player_stats (player_name) VALUES (?)').run(playerName);
        stats = db.prepare('SELECT * FROM player_stats WHERE player_name = ?').get(playerName);
      }
      
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
      
      // Créer les stats de franchise si elles n'existent pas
      db.prepare('INSERT OR IGNORE INTO franchise_stats (franchise) VALUES (?)').run(franchise);
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
    
    console.log(`✅ Points ajoutés avec succès pour ${playerName}`);
    res.json({ 
      success: true, 
      newScore: result.player.score,
      badges: badges
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout de points:', error);
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
    
    // Validation du nom
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Nom de l\'eleve requis' });
    }
    
    // Validation de la franchise (inclut maintenant Non-Draftés)
    const validFranchises = ['Minotaurs', 'Krakens', 'Phoenix', 'Werewolves', 'Non-Draftés'];
    if (!franchise || !validFranchises.includes(franchise)) {
      return res.status(400).json({ error: 'Franchise valide requise (Minotaurs, Krakens, Phoenix, Werewolves, Reserve)' });
    }
    
    const cleanName = name.trim();
    const existing = db.prepare('SELECT * FROM players WHERE name = ?').get(cleanName);
    if (existing) {
      return res.status(400).json({ error: 'Un eleve avec ce nom existe deja' });
    }
    
    const transaction = db.transaction(() => {
      // Un élève dans Non-Draftés n'est pas encore drafté
      const isDrafted = franchise !== 'Non-Draftés' ? 1 : 0;
      db.prepare('INSERT INTO players (name, franchise, score, is_drafted) VALUES (?, ?, ?, ?)')
        .run(cleanName, franchise, 0, isDrafted);
      
      db.prepare('INSERT INTO player_stats (player_name) VALUES (?)')
        .run(cleanName);
    });
    
    transaction();
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Renommer un élève
app.put('/api/rename-student', (req, res) => {
  try {
    const { oldName, newName } = req.body;
    
    if (!oldName || !newName) {
      return res.status(400).json({ error: 'Ancien nom et nouveau nom requis' });
    }
    
    if (oldName === newName) {
      return res.status(400).json({ error: 'Le nouveau nom doit être différent de l\'ancien' });
    }
    
    // Vérifier que le nouveau nom n'existe pas déjà
    const existingPlayer = db.prepare('SELECT * FROM players WHERE name = ?').get(newName);
    if (existingPlayer) {
      return res.status(400).json({ error: 'Un élève avec ce nom existe déjà' });
    }
    
    // Vérifier que l'ancien nom existe
    const oldPlayer = db.prepare('SELECT * FROM players WHERE name = ?').get(oldName);
    if (!oldPlayer) {
      return res.status(404).json({ error: 'Élève non trouvé' });
    }
    
    // IMPORTANT: Désactiver temporairement les contraintes de clés étrangères AVANT la transaction
    db.prepare('PRAGMA foreign_keys = OFF').run();
    
    const transaction = db.transaction(() => {
      // Mettre à jour TOUTES les tables enfants AVANT la table parent
      // 1. Tables avec clés étrangères vers players(name)
      db.prepare('UPDATE history SET player_name = ? WHERE player_name = ?').run(newName, oldName);
      db.prepare('UPDATE player_badges SET player_name = ? WHERE player_name = ?').run(newName, oldName);
      db.prepare('UPDATE player_stats SET player_name = ? WHERE player_name = ?').run(newName, oldName);
      db.prepare('UPDATE period_stats SET player_name = ? WHERE player_name = ?').run(newName, oldName);
      db.prepare('UPDATE hall_of_fame SET player_name = ? WHERE player_name = ?').run(newName, oldName);
      db.prepare('UPDATE mvp_history SET player_name = ? WHERE player_name = ?').run(newName, oldName);
      
      // 2. Enfin, mettre à jour la table parent (players)
      db.prepare('UPDATE players SET name = ? WHERE name = ?').run(newName, oldName);
      
      // Ajouter une entrée dans l'historique pour tracer le changement de nom
      const timestamp = new Date().toISOString();
      db.prepare(`
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
        VALUES (?, ?, 0, ?, ?, 'Système', 'unknown')
      `).run(newName, `Nom changé de "${oldName}" vers "${newName}"`, timestamp, oldPlayer.score);
      
      return { oldName, newName, franchise: oldPlayer.franchise };
    });
    
    let result;
    try {
      result = transaction();
    } finally {
      // IMPORTANT: Réactiver les contraintes de clés étrangères APRÈS la transaction
      db.prepare('PRAGMA foreign_keys = ON').run();
    }
    
    console.log(`✅ Élève renommé: ${result.oldName} → ${result.newName}`);
    res.json({ success: true, ...result });
    
  } catch (error) {
    console.error('❌ Erreur lors du renommage:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POOL DE RÉSERVE ET SYSTÈME DE DRAFT
// ============================================

// Obtenir tous les élèves du Pool de Réserve
app.get('/api/reserve-pool', (req, res) => {
  try {
    const reservePlayers = db.prepare(`
      SELECT p.*, 
        COUNT(DISTINCT pb.badge_id) as badge_count,
        ps.current_streak,
        ps.max_streak
      FROM players p
      LEFT JOIN player_badges pb ON p.name = pb.player_name
      LEFT JOIN player_stats ps ON p.name = ps.player_name
      WHERE p.franchise = 'Reserve'
      GROUP BY p.id
      ORDER BY p.score DESC, p.name ASC
    `).all();
    
    res.json({ players: reservePlayers });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du pool de réserve:', error);
    res.status(500).json({ error: error.message });
  }
});

// Drafter un élève depuis la réserve vers une franchise
app.post('/api/draft-player', (req, res) => {
  try {
    const { playerName, targetFranchise } = req.body;
    
    // Validation
    if (!playerName || !targetFranchise) {
      return res.status(400).json({ error: 'Nom du joueur et franchise cible requis' });
    }
    
    const validFranchises = ['Minotaurs', 'Krakens', 'Phoenix', 'Werewolves'];
    if (!validFranchises.includes(targetFranchise)) {
      return res.status(400).json({ error: 'Franchise cible invalide' });
    }
    
    // Vérifier que le joueur existe et est dans la réserve
    const player = db.prepare('SELECT * FROM players WHERE name = ? AND franchise = ?')
      .get(playerName, 'Reserve');
    
    if (!player) {
      return res.status(404).json({ error: 'Joueur non trouvé dans la réserve' });
    }
    
    // Effectuer le draft
    const transaction = db.transaction(() => {
      // Mettre à jour le joueur
      db.prepare('UPDATE players SET franchise = ?, is_drafted = 1 WHERE name = ?')
        .run(targetFranchise, playerName);
      
      // Ajouter une entrée dans l'historique
      const timestamp = new Date().toISOString();
      db.prepare(`
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
        VALUES (?, ?, 0, ?, ?, 'Système', 'draft')
      `).run(playerName, `Drafté dans ${targetFranchise}`, timestamp, player.score);
      
      // Mettre à jour les stats de franchise si nécessaire
      const franchiseStats = db.prepare('SELECT * FROM franchise_stats WHERE franchise = ?')
        .get(targetFranchise);
      
      if (!franchiseStats) {
        db.prepare('INSERT INTO franchise_stats (franchise, total_points) VALUES (?, ?)')
          .run(targetFranchise, player.score);
      } else {
        db.prepare('UPDATE franchise_stats SET total_points = total_points + ? WHERE franchise = ?')
          .run(player.score, targetFranchise);
      }
    });
    
    transaction();
    
    console.log(`✅ ${playerName} drafté dans ${targetFranchise}`);
    res.json({ 
      success: true, 
      message: `${playerName} a été drafté dans ${targetFranchise}`,
      playerName,
      targetFranchise,
      playerScore: player.score
    });
    
  } catch (error) {
    console.error('❌ Erreur lors du draft:', error);
    res.status(500).json({ error: error.message });
  }
});

// Renvoyer un joueur vers la réserve
app.post('/api/undraft-player', (req, res) => {
  try {
    const { playerName } = req.body;
    
    if (!playerName) {
      return res.status(400).json({ error: 'Nom du joueur requis' });
    }
    
    // Vérifier que le joueur existe et n'est pas déjà dans la réserve
    const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
    
    if (!player) {
      return res.status(404).json({ error: 'Joueur non trouvé' });
    }
    
    if (player.franchise === 'Reserve') {
      return res.status(400).json({ error: 'Le joueur est déjà dans la réserve' });
    }
    
    const oldFranchise = player.franchise;
    
    // Renvoyer le joueur dans la réserve
    const transaction = db.transaction(() => {
      // Mettre à jour le joueur
      db.prepare('UPDATE players SET franchise = ?, is_drafted = 0 WHERE name = ?')
        .run('Reserve', playerName);
      
      // Ajouter une entrée dans l'historique
      const timestamp = new Date().toISOString();
      db.prepare(`
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
        VALUES (?, ?, 0, ?, ?, 'Système', 'undraft')
      `).run(playerName, `Renvoyé de ${oldFranchise} vers la réserve`, timestamp, player.score);
      
      // Mettre à jour les stats de l'ancienne franchise
      db.prepare('UPDATE franchise_stats SET total_points = total_points - ? WHERE franchise = ?')
        .run(player.score, oldFranchise);
    });
    
    transaction();
    
    console.log(`✅ ${playerName} renvoyé dans la réserve depuis ${oldFranchise}`);
    res.json({ 
      success: true, 
      message: `${playerName} a été renvoyé dans la réserve`,
      playerName,
      oldFranchise
    });
    
  } catch (error) {
    console.error('❌ Erreur lors du renvoi vers la réserve:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les statistiques du Pool de Réserve
app.get('/api/reserve-stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_players,
        SUM(score) as total_points,
        AVG(score) as avg_points,
        MAX(score) as max_points,
        MIN(score) as min_points
      FROM players
      WHERE franchise = 'Reserve'
    `).get();
    
    const topPlayers = db.prepare(`
      SELECT name, score
      FROM players
      WHERE franchise = 'Reserve'
      ORDER BY score DESC
      LIMIT 3
    `).all();
    
    res.json({ 
      stats,
      topPlayers
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des stats de la réserve:', error);
    res.status(500).json({ error: error.message });
  }
});

// Drafter un élève vers une franchise
app.post('/api/draft-student', (req, res) => {
  try {
    const { playerName, newFranchise } = req.body;
    
    if (!playerName || playerName.trim() === '') {
      return res.status(400).json({ error: 'Nom du joueur requis' });
    }
    
    if (!newFranchise || newFranchise.trim() === '') {
      return res.status(400).json({ error: 'Franchise de destination requise' });
    }
    
    // Validation de la franchise
    const validFranchises = ['Minotaurs', 'Krakens', 'Phoenix', 'Werewolves'];
    if (!validFranchises.includes(newFranchise)) {
      return res.status(400).json({ error: 'Franchise invalide' });
    }
    
    // Vérifier que le joueur existe
    const player = db.prepare('SELECT * FROM players WHERE name = ?').get(playerName);
    if (!player) {
      return res.status(404).json({ error: 'Joueur non trouvé' });
    }
    
    // Mettre à jour la franchise du joueur et marquer comme drafté
    const updateStmt = db.prepare('UPDATE players SET franchise = ?, is_drafted = 1 WHERE name = ?');
    const result = updateStmt.run(newFranchise, playerName);
    
    if (result.changes > 0) {
      // Ajouter une entrée dans l'historique
      const historyStmt = db.prepare(`
        INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      historyStmt.run(
        playerName,
        `Drafté vers ${newFranchise}`,
        0,
        new Date().toISOString(),
        player.score,
        'Système',
        'draft'
      );
      
      res.json({ 
        success: true, 
        message: `${playerName} a été drafté vers ${newFranchise} avec ${player.score} points` 
      });
    } else {
      res.status(400).json({ error: 'Impossible de drafter le joueur' });
    }
  } catch (error) {
    console.error('Erreur lors du draft:', error);
    res.status(500).json({ error: error.message });
  }
});

// Supprimer un élève
app.delete('/api/remove-student/:playerName', (req, res) => {
  try {
    const playerName = req.params.playerName;
    
    if (!playerName || playerName.trim() === '') {
      return res.status(400).json({ error: 'Nom du joueur requis' });
    }
    
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM history WHERE player_name = ?').run(playerName);
      db.prepare('DELETE FROM player_badges WHERE player_name = ?').run(playerName);
      db.prepare('DELETE FROM player_stats WHERE player_name = ?').run(playerName);
      db.prepare('DELETE FROM period_stats WHERE player_name = ?').run(playerName);
      db.prepare('DELETE FROM hall_of_fame WHERE player_name = ?').run(playerName);
      db.prepare('DELETE FROM mvp_history WHERE player_name = ?').run(playerName);
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

// Ajouter des points directement à une franchise
app.post('/api/add-franchise-points', (req, res) => {
  try {
    const { franchise, points, action, teacherName = 'Anonyme' } = req.body;
    console.log('📥 Requête reçue:', { franchise, points, action, teacherName });
    
    // Validation des paramètres
    if (!franchise || typeof points !== 'number') {
      return res.status(400).json({ error: 'Franchise et points requis' });
    }
    
    const validFranchises = ['Minotaurs', 'Krakens', 'Phoenix', 'Eagles'];
    if (!validFranchises.includes(franchise)) {
      return res.status(400).json({ error: 'Franchise invalide' });
    }
    
    const actionDescription = action || `Points franchise (${points > 0 ? '+' : ''}${points})`;
    const currentTime = new Date().toISOString();
    
    console.log('🔍 Vérification franchise existante...');
    // S'assurer que la franchise existe dans franchise_stats
    const existingFranchise = db.prepare('SELECT * FROM franchise_stats WHERE franchise = ?').get(franchise);
    console.log('📋 Franchise existante:', existingFranchise);
    
    if (!existingFranchise) {
      console.log('➕ Création nouvelle franchise...');
      try {
        db.prepare(`
          INSERT INTO franchise_stats (franchise, weekly_points, monthly_points, total_points) 
          VALUES (?, 0, 0, 0)
        `).run(franchise);
        console.log('✅ Franchise créée');
      } catch (insertError) {
        console.error('❌ Erreur création franchise:', insertError.message);
        // Essayer avec les colonnes de base seulement
        try {
          db.prepare(`
            INSERT INTO franchise_stats (franchise, weekly_points, monthly_points) 
            VALUES (?, 0, 0)
          `).run(franchise);
          console.log('✅ Franchise créée (mode compatibilité)');
        } catch (compatError) {
          console.error('❌ Erreur création franchise (compatibilité):', compatError.message);
          return res.status(500).json({ error: 'Erreur création franchise: ' + compatError.message });
        }
      }
    }
    
    console.log('📊 Mise à jour des points...');
    // Mettre à jour les points de la franchise
    try {
      const updateResult = db.prepare(`
        UPDATE franchise_stats 
        SET total_points = COALESCE(total_points, 0) + ?,
            weekly_points = weekly_points + ?,
            monthly_points = monthly_points + ?
        WHERE franchise = ?
      `).run(points, points, points, franchise);
      console.log('📈 Points mis à jour:', updateResult);
    } catch (updateError) {
      console.error('❌ Erreur mise à jour avec total_points:', updateError.message);
      // Essayer sans la colonne total_points si elle n'existe pas
      try {
        const compatResult = db.prepare(`
          UPDATE franchise_stats 
          SET weekly_points = weekly_points + ?,
              monthly_points = monthly_points + ?
          WHERE franchise = ?
        `).run(points, points, franchise);
        console.log('📈 Points mis à jour (mode compatibilité):', compatResult);
      } catch (compatUpdateError) {
        console.error('❌ Erreur mise à jour compatibilité:', compatUpdateError.message);
        return res.status(500).json({ error: 'Erreur mise à jour: ' + compatUpdateError.message });
      }
    }
    
    // Ajouter une entrée dans l'historique (temporairement désactivé à cause de la contrainte FK)
    // On pourrait créer une table séparée pour l'historique des franchises
    /* 
    db.prepare(`
      INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `[${franchise}]`,
      actionDescription,
      points,
      currentTime,
      0,
      teacherName,
      'franchise'
    );
    */
    
    // Vérifier les badges collectifs après l'ajout de points (temporairement désactivé)
    // checkAndAwardCollectiveBadges(franchise);
    
    res.json({ 
      success: true, 
      message: `${points} points ajoutés à ${franchise}`,
      franchise: franchise,
      pointsAdded: points
    });
    
  } catch (error) {
    console.error('Erreur lors de l\'ajout de points franchise:', error);
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
      const parsedDays = parseInt(days);
      if (isNaN(parsedDays) || parsedDays < 0 || parsedDays > 365) {
        throw new Error('Nombre de jours invalide');
      }
      startDate.setDate(startDate.getDate() - parsedDays);
      
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

// 1. MVP actuels (semaine/mois/trimestre)
app.get('/api/mvp/current', (req, res) => {
  try {
    const { period = 'week' } = req.query; // 'week', 'month', 'trimester'
    
    let bounds;
    switch(period) {
      case 'week': bounds = getWeekBounds(); break;
      case 'month': bounds = getMonthBounds(); break;
      case 'trimester': bounds = getTrimesterBounds(); break;
      default: bounds = getWeekBounds();
    }
    
    // MVP Académique
    const academicMVP = db.prepare(`
      SELECT ps.player_name, ps.franchise, ps.academic_points, p.score as total_score
      FROM period_stats ps
      JOIN players p ON ps.player_name = p.name
      WHERE ps.period_type = ? AND ps.period_start = ? AND ps.academic_points > 0
      ORDER BY ps.academic_points DESC
      LIMIT 1
    `).get(period, bounds.start);
    
    // MVP Sport
    const sportMVP = db.prepare(`
      SELECT ps.player_name, ps.franchise, ps.sport_points, p.score as total_score
      FROM period_stats ps
      JOIN players p ON ps.player_name = p.name
      WHERE ps.period_type = ? AND ps.period_start = ? AND ps.sport_points > 0
      ORDER BY ps.sport_points DESC
      LIMIT 1
    `).get(period, bounds.start);
    
    // MVP Progression (qui a gagné le plus de points total)
    const progressionMVP = db.prepare(`
      SELECT ps.player_name, ps.franchise, ps.total_points, p.score as total_score
      FROM period_stats ps
      JOIN players p ON ps.player_name = p.name
      WHERE ps.period_type = ? AND ps.period_start = ? AND ps.total_points > 0
      ORDER BY ps.total_points DESC
      LIMIT 1
    `).get(period, bounds.start);
    
    // Top 5 Académique
    const top5Academic = db.prepare(`
      SELECT ps.player_name, ps.franchise, ps.academic_points, p.score as total_score
      FROM period_stats ps
      JOIN players p ON ps.player_name = p.name
      WHERE ps.period_type = ? AND ps.period_start = ? AND ps.academic_points > 0
      ORDER BY ps.academic_points DESC
      LIMIT 5
    `).all(period, bounds.start);
    
    // Top 5 Sport
    const top5Sport = db.prepare(`
      SELECT ps.player_name, ps.franchise, ps.sport_points, p.score as total_score
      FROM period_stats ps
      JOIN players p ON ps.player_name = p.name
      WHERE ps.period_type = ? AND ps.period_start = ? AND ps.sport_points > 0
      ORDER BY ps.sport_points DESC
      LIMIT 5
    `).all(period, bounds.start);
    
    res.json({
      period,
      period_bounds: bounds,
      mvps: {
        academic: academicMVP,
        sport: sportMVP,
        progression: progressionMVP
      },
      rankings: {
        top5_academic: top5Academic,
        top5_sport: top5Sport
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Historique des MVP
app.get('/api/mvp/history', (req, res) => {
  try {
    const { period = 'week', mvp_type = 'all', limit = 20 } = req.query;
    
    let whereClause = '';
    let params = [];
    
    if (period !== 'all') {
      whereClause += ' WHERE period_type = ?';
      params.push(period);
    }
    
    if (mvp_type !== 'all') {
      whereClause += whereClause ? ' AND mvp_type = ?' : ' WHERE mvp_type = ?';
      params.push(mvp_type);
    }
    
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      return res.status(400).json({ error: 'Limite invalide' });
    }
    params.push(parsedLimit);
    
    const history = db.prepare(`
      SELECT * FROM mvp_history 
      ${whereClause}
      ORDER BY date_awarded DESC 
      LIMIT ?
    `).all(...params);
    
    res.json(history);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Statistiques des franchises (répartition sport/académique)
app.get('/api/stats/franchise-breakdown', (req, res) => {
  try {
    const { period = 'week' } = req.query;
    
    let bounds;
    switch(period) {
      case 'week': bounds = getWeekBounds(); break;
      case 'month': bounds = getMonthBounds(); break;
      case 'trimester': bounds = getTrimesterBounds(); break;
      default: bounds = getWeekBounds();
    }
    
    // Debug logs
    console.log('Période:', period);
    console.log('Bounds:', bounds);
    
    // D'abord vérifier si des données existent pour cette période
    const hasData = db.prepare(`
      SELECT COUNT(*) as count FROM period_stats 
      WHERE period_type = ? AND period_start = ?
    `).get(period, bounds.start);
    
    console.log('Données period_stats trouvées:', hasData);
    
    let franchiseStats = [];
    
    if (hasData && hasData.count > 0) {
      // Utiliser les données de period_stats si elles existent
      franchiseStats = db.prepare(`
        SELECT 
          franchise,
          SUM(sport_points) as total_sport,
          SUM(academic_points) as total_academic,
          SUM(total_points) as total_points,
          COUNT(*) as active_players,
          ROUND(
            CASE 
              WHEN (SUM(sport_points) + SUM(academic_points)) = 0 THEN 0
              ELSE (SUM(sport_points) * 100.0) / (SUM(sport_points) + SUM(academic_points))
            END, 1
          ) as sport_percentage,
          ROUND(
            CASE 
              WHEN (SUM(sport_points) + SUM(academic_points)) = 0 THEN 0
              ELSE (SUM(academic_points) * 100.0) / (SUM(sport_points) + SUM(academic_points))
            END, 1
          ) as academic_percentage
        FROM period_stats 
        WHERE period_type = ? AND period_start = ?
        GROUP BY franchise
        ORDER BY total_points DESC
      `).all(period, bounds.start);
    } else {
      // Sinon, calculer depuis l'historique récent
      console.log('Pas de données period_stats, calcul depuis l\'historique...');
      
      // Obtenir les franchises
      const franchises = db.prepare('SELECT DISTINCT franchise FROM players').all();
      
      franchiseStats = franchises.map(f => {
        const stats = db.prepare(`
          SELECT 
            ? as franchise,
            COALESCE(SUM(CASE WHEN h.category = 'sport' AND h.points > 0 THEN h.points ELSE 0 END), 0) as total_sport,
            COALESCE(SUM(CASE WHEN h.category = 'academic' AND h.points > 0 THEN h.points ELSE 0 END), 0) as total_academic,
            COALESCE(SUM(CASE WHEN h.points > 0 THEN h.points ELSE 0 END), 0) as total_points,
            COUNT(DISTINCT h.player_name) as active_players
          FROM players p
          LEFT JOIN history h ON p.name = h.player_name 
            AND datetime(h.timestamp) >= datetime(?)
            AND datetime(h.timestamp) <= datetime(?)
          WHERE p.franchise = ?
        `).get(f.franchise, bounds.start, bounds.end, f.franchise);
        
        const total = (stats.total_sport || 0) + (stats.total_academic || 0);
        return {
          ...stats,
          sport_percentage: total > 0 ? Math.round((stats.total_sport * 100.0) / total * 10) / 10 : 0,
          academic_percentage: total > 0 ? Math.round((stats.total_academic * 100.0) / total * 10) / 10 : 0
        };
      }); // Enlever le filtre pour montrer toutes les franchises
    }
    
    // Calculer la franchise la plus équilibrée (ratio le plus proche de 50/50)
    let mostBalanced = null;
    let bestBalance = 100;
    
    franchiseStats.forEach(franchise => {
      if (franchise.total_points > 0) {
        const balance = Math.abs(50 - franchise.sport_percentage);
        if (balance < bestBalance) {
          bestBalance = balance;
          mostBalanced = franchise;
        }
      }
    });
    
    res.json({
      period,
      period_bounds: bounds,
      franchise_stats: franchiseStats,
      most_balanced: mostBalanced,
      summary: {
        total_sport_points: franchiseStats.reduce((sum, f) => sum + (f.total_sport || 0), 0),
        total_academic_points: franchiseStats.reduce((sum, f) => sum + (f.total_academic || 0), 0),
        most_active_franchise: franchiseStats.length > 0 ? franchiseStats.reduce((prev, curr) => 
          (prev.active_players || 0) > (curr.active_players || 0) ? prev : curr, franchiseStats[0]) : null
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Hall of Fame (records permanents)
app.get('/api/hall-of-fame', (req, res) => {
  try {
    // Records actuels
    const currentRecords = db.prepare(`
      SELECT * FROM hall_of_fame 
      WHERE is_current = 1 
      ORDER BY score DESC
    `).all();
    
    // Historique complet
    const fullHistory = db.prepare(`
      SELECT * FROM hall_of_fame 
      ORDER BY date_achieved DESC
      LIMIT 50
    `).all();
    
    // Statistiques des badges
    const badgeLeaders = db.prepare(`
      SELECT 
        pb.player_name,
        p.franchise,
        COUNT(*) as badge_count,
        SUM(pb.points) as bonus_points
      FROM player_badges pb
      JOIN players p ON pb.player_name = p.name
      GROUP BY pb.player_name, p.franchise
      ORDER BY badge_count DESC, bonus_points DESC
      LIMIT 10
    `).all();
    
    // Record absolu actuel
    const absoluteRecord = db.prepare(`
      SELECT name as player_name, franchise, score 
      FROM players 
      ORDER BY score DESC 
      LIMIT 1
    `).get();
    
    res.json({
      current_records: currentRecords,
      full_history: fullHistory,
      badge_leaders: badgeLeaders,
      absolute_record: absoluteRecord,
      last_updated: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Évolution des positions des franchises
app.get('/api/progression/franchise', (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    // Récupérer les classements des X derniers jours
    const rankings = db.prepare(`
      SELECT * FROM franchise_rankings 
      WHERE DATE(date_recorded) >= DATE('now', '-' || ? || ' days')
      ORDER BY date_recorded ASC
    `).all(days);
    
    // Si pas assez de données historiques, calculer sur les données actuelles
    if (rankings.length === 0) {
      // Calculer le classement actuel
      const currentRankings = db.prepare(`
        SELECT 
          franchise,
          SUM(score) as total_points,
          DATE('now') as date_recorded
        FROM players 
        GROUP BY franchise 
        ORDER BY total_points DESC
      `).all();
      
      currentRankings.forEach((franchise, index) => {
        // Insérer dans franchise_rankings pour l'historique
        db.prepare(`
          INSERT OR REPLACE INTO franchise_rankings 
          (franchise, date_recorded, position, total_points, sport_points, academic_points)
          VALUES (?, ?, ?, ?, 0, 0)
        `).run(franchise.franchise, franchise.date_recorded, index + 1, franchise.total_points);
      });
      
      return res.json({
        period: `${days} derniers jours`,
        data: currentRankings.map((f, i) => ({...f, position: i + 1})),
        message: 'Données limitées - classement actuel affiché'
      });
    }
    
    // Organiser les données par franchise
    const franchiseProgression = {};
    rankings.forEach(ranking => {
      if (!franchiseProgression[ranking.franchise]) {
        franchiseProgression[ranking.franchise] = [];
      }
      franchiseProgression[ranking.franchise].push({
        date: ranking.date_recorded,
        position: ranking.position,
        total_points: ranking.total_points,
        sport_points: ranking.sport_points || 0,
        academic_points: ranking.academic_points || 0
      });
    });
    
    res.json({
      period: `${days} derniers jours`,
      franchise_progression: franchiseProgression,
      total_records: rankings.length
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT DE DIAGNOSTIC pour vérifier les données
app.get('/api/debug/period-stats', (req, res) => {
  try {
    const stats = db.prepare('SELECT * FROM period_stats ORDER BY date_updated DESC LIMIT 10').all();
    const history = db.prepare('SELECT * FROM history ORDER BY id DESC LIMIT 10').all();
    const counts = db.prepare(`
      SELECT 
        period_type,
        COUNT(*) as count,
        SUM(total_points) as total_points
      FROM period_stats
      GROUP BY period_type
    `).all();
    
    res.json({
      recent_stats: stats,
      recent_history: history,
      summary: counts,
      current_week: getWeekBounds(),
      current_month: getMonthBounds()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FONCTION POUR MIGRER LES DONNÉES EXISTANTES
app.post('/api/migrate-existing-data', (req, res) => {
  try {
    console.log('🔄 Migration des données existantes...');
    
    // Récupérer tout l'historique
    const allHistory = db.prepare('SELECT * FROM history ORDER BY id ASC').all();
    
    allHistory.forEach(entry => {
      // Déterminer la catégorie si elle n'existe pas
      if (!entry.category || entry.category === 'unknown') {
        const category = getActionCategory(entry.action);
        db.prepare('UPDATE history SET category = ? WHERE id = ?').run(category, entry.id);
      }
      
      // Recréer les stats périodiques basées sur la date
      const entryDate = new Date(entry.timestamp);
      const weekBounds = getWeekBounds(entryDate);
      const monthBounds = getMonthBounds(entryDate);
      const trimesterBounds = getTrimesterBounds(entryDate);
      
      const category = entry.category || getActionCategory(entry.action);
      
      // Mettre à jour les stats pour chaque période
      updatePlayerPeriodStat(entry.player_name, 'week', weekBounds.start, weekBounds.end, entry.points, category);
      updatePlayerPeriodStat(entry.player_name, 'month', monthBounds.start, monthBounds.end, entry.points, category);
      updatePlayerPeriodStat(entry.player_name, 'trimester', trimesterBounds.start, trimesterBounds.end, entry.points, category);
    });
    
    console.log(`✅ Migration terminée: ${allHistory.length} entrées traitées`);
    res.json({ 
      success: true, 
      processed: allHistory.length,
      message: 'Migration des données terminée avec succès'
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    res.status(500).json({ error: error.message });
  }
});




// Export CSV des données
app.get('/api/export-csv', (req, res) => {
  try {
    // Récupérer tous les joueurs avec leurs franchises
    const players = db.prepare(`
      SELECT 
        p.name as Joueur,
        p.franchise as Franchise,
        p.score as Score_Total,
        COALESCE(ps.sport_points, 0) as Points_Sport,
        COALESCE(ps.academic_points, 0) as Points_Académique,
        COALESCE(stats.current_streak, 0) as Série_Actuelle,
        COALESCE(stats.max_streak, 0) as Meilleure_Série,
        (SELECT COUNT(*) FROM player_badges WHERE player_name = p.name) as Nombre_Badges
      FROM players p
      LEFT JOIN player_stats stats ON p.name = stats.player_name
      LEFT JOIN (
        SELECT player_name, 
               SUM(sport_points) as sport_points,
               SUM(academic_points) as academic_points
        FROM period_stats
        WHERE period_type = 'month' 
          AND period_start = DATE('now', 'start of month')
        GROUP BY player_name
      ) ps ON p.name = ps.player_name
      ORDER BY p.franchise, p.score DESC
    `).all();

    // Récupérer les totaux par franchise
    const franchises = db.prepare(`
      SELECT 
        franchise as Franchise,
        SUM(score) as Score_Total,
        COUNT(*) as Nombre_Joueurs,
        AVG(score) as Score_Moyen,
        MAX(score) as Meilleur_Score,
        MIN(score) as Moins_Bon_Score
      FROM players
      GROUP BY franchise
      ORDER BY Score_Total DESC
    `).all();

    // Créer le CSV pour les joueurs
    let csvContent = '\ufeff'; // BOM pour Excel UTF-8
    csvContent += 'EXPORT DES DONNÉES - ' + new Date().toLocaleString('fr-FR') + '\n\n';
    
    // Section Joueurs
    csvContent += '=== JOUEURS ===\n';
    if (players.length > 0) {
      csvContent += Object.keys(players[0]).join(';') + '\n';
      players.forEach(player => {
        csvContent += Object.values(player).join(';') + '\n';
      });
    }
    
    csvContent += '\n\n=== FRANCHISES ===\n';
    if (franchises.length > 0) {
      csvContent += Object.keys(franchises[0]).join(';') + '\n';
      franchises.forEach(franchise => {
        csvContent += Object.values(franchise).map(v => 
          typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(1) : v
        ).join(';') + '\n';
      });
    }

    // Ajouter les badges par franchise
    const franchiseBadges = db.prepare(`
      SELECT 
        franchise as Franchise,
        COUNT(*) as Total_Badges_Collectifs
      FROM franchise_badges
      GROUP BY franchise
    `).all();

    if (franchiseBadges.length > 0) {
      csvContent += '\n\n=== BADGES COLLECTIFS ===\n';
      csvContent += 'Franchise;Nombre de Badges\n';
      franchiseBadges.forEach(fb => {
        csvContent += `${fb.Franchise};${fb.Total_Badges_Collectifs}\n`;
      });
    }

    // Configurer les headers pour le téléchargement
    const filename = `export_basketball_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Erreur lors de l\'export CSV:', error);
    res.status(500).json({ error: error.message });
  }
});

// Servir l'application React
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route fallback pour SPA - doit être APRÈS toutes les routes API
app.get('*', (req, res) => {
  // Ne pas servir index.html pour les requêtes API ou de ressources
  if (req.path.startsWith('/api/') || 
      req.path.includes('.js') ||
      req.path.includes('.css') ||
      req.path.includes('favicon')) {
    return res.status(404).send('Not Found');
  }
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
