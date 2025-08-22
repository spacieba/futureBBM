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
// Pour changer le mot de passe, modifiez la ligne ci-dessous et redémarrez l'app
const TEACHER_PASSWORD = 'GPwinner2026';

// Initialiser la base de données
// Créer le dossier de données
const dataDir = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
// Base de données
const dbPath = path.join(dataDir, 'teams.db');
console.log('📁 Dossier de données:', dataDir);
console.log('🗄️ Base de données:', dbPath);

const db = new Database(dbPath);

// Configuration SQLite
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Créer les tables si elles n'existent pas (avec les nouvelles tables pour les badges)
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

  -- NOUVELLES TABLES POUR LES BADGES
  CREATE TABLE IF NOT EXISTS player_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    badge_name TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    date_earned TEXT NOT NULL,
    FOREIGN KEY (player_name) REFERENCES players (name),
    UNIQUE(player_name, badge_id)
  );

  CREATE TABLE IF NOT EXISTS franchise_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    franchise TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    badge_name TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    date_earned TEXT NOT NULL,
    UNIQUE(franchise, badge_id)
  );

  -- Table pour tracker les streaks et statistiques
  CREATE TABLE IF NOT EXISTS player_stats (
    player_name TEXT PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    consecutive_days TEXT DEFAULT '[]',
    felicitations_count INTEGER DEFAULT 0,
    hardworker_count INTEGER DEFAULT 0,
    last_action_date TEXT,
    FOREIGN KEY (player_name) REFERENCES players (name)
  );
`);

// Données initiales des franchises
const initialFranchises = {
  Minotaurs: ['Leny', 'Lyam', 'Augustin', 'Lino', 'Lina D', 'Djilane', 'Talia'],
  Krakens: ['Swan', 'Nolann', 'Enery', 'Marie', 'Seyma Nur', 'Willow'],
  Phoenix: ['Mahé', 'Narcisse', 'Daniella', 'Matis.B', 'Jamila'],
  Werewolves: ['Assia', 'Ethaniel', 'Russy', 'Youssef', 'Lisa L', 'Noa', 'Lenny K']
};

// Initialiser les joueurs s'ils n'existent pas
const initPlayers = () => {
  const existingPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get();
  
  if (existingPlayers.count === 0) {
    const insertPlayer = db.prepare('INSERT INTO players (name, franchise, score) VALUES (?, ?, ?)');
    
    Object.entries(initialFranchises).forEach(([franchise, players]) => {
      players.forEach(player => {
        insertPlayer.run(player, franchise, 0);
      });
    });
  }
};

initPlayers();

// Initialiser les stats des joueurs
const initPlayerStats = () => {
  const players = db.prepare('SELECT name FROM players').all();
  const insertStats = db.prepare(`
    INSERT OR IGNORE INTO player_stats (player_name) VALUES (?)
  `);
  
  players.forEach(player => {
    insertStats.run(player.name);
  });
};

initPlayerStats();

// === ROUTES API EXISTANTES ===

// Vérification du mot de passe professeur
app.post('/api/verify-teacher', (req, res) => {
  const { password } = req.body;
  if (password === TEACHER_PASSWORD) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Récupérer tous les joueurs
app.get('/api/players', (req, res) => {
  try {
    const players = db.prepare('SELECT * FROM players ORDER BY score DESC').all();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer un joueur spécifique
app.get('/api/player/:playerName', (req, res) => {
  try {
    const player = db.prepare('SELECT * FROM players WHERE name = ?').get(req.params.playerName);
    if (player) {
      res.json(player);
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
    const history = db.prepare('SELECT * FROM history WHERE player_name = ? ORDER BY timestamp DESC').all(req.params.playerName);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ajouter des points (MODIFIÉ pour inclure les statistiques de badges)
app.post('/api/add-points', (req, res) => {
  try {
    const { playerName, points, action, teacherName } = req.body;
    
    const transaction = db.transaction(() => {
      // Mettre à jour le score du joueur
      const updatePlayer = db.prepare('UPDATE players SET score = score + ? WHERE name = ?');
      updatePlayer.run(points, playerName);
      
      // Récupérer le nouveau score
      const player = db.prepare('SELECT score FROM players WHERE name = ?').get(playerName);
      
      // Ajouter à l'historique
      const insertHistory = db.prepare('INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name) VALUES (?, ?, ?, ?, ?, ?)');
      const timestamp = new Date().toLocaleString('fr-FR');
      insertHistory.run(playerName, action, points, timestamp, player.score, teacherName || 'Anonyme');
      
      // Mettre à jour les statistiques pour les badges
      const stats = db.prepare('SELECT * FROM player_stats WHERE player_name = ?').get(playerName);
      
      if (stats) {
        let updatedStats = {
          current_streak: stats.current_streak,
          max_streak: stats.max_streak,
          felicitations_count: stats.felicitations_count,
          hardworker_count: stats.hardworker_count
        };
        
        // Gérer les streaks
        if (points > 0) {
          updatedStats.current_streak = stats.current_streak + 1;
          updatedStats.max_streak = Math.max(updatedStats.current_streak, stats.max_streak);
        } else {
          updatedStats.current_streak = 0;
        }
        
        // Compter les actions spéciales
        if (action === 'Félicitations') {
          updatedStats.felicitations_count = stats.felicitations_count + 1;
        }
        if (action === 'Hardworker') {
          updatedStats.hardworker_count = stats.hardworker_count + 1;
        }
        
        // Mettre à jour les stats
        const updateStats = db.prepare(`
          UPDATE player_stats 
          SET current_streak = ?, 
              max_streak = ?, 
              felicitations_count = ?,
              hardworker_count = ?,
              last_action_date = ?
          WHERE player_name = ?
        `);
        
        updateStats.run(
          updatedStats.current_streak,
          updatedStats.max_streak,
          updatedStats.felicitations_count,
          updatedStats.hardworker_count,
          new Date().toISOString(),
          playerName
        );
        
        return { 
          newScore: player.score,
          stats: updatedStats 
        };
      }
      
      return { newScore: player.score };
    });
    
    const result = transaction();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Annuler la dernière action (PROFESSEURS SEULEMENT)
app.delete('/api/undo-last/:playerName', (req, res) => {
  try {
    const playerName = req.params.playerName;
    
    const transaction = db.transaction(() => {
      // Récupérer la dernière action
      const lastAction = db.prepare('SELECT * FROM history WHERE player_name = ? ORDER BY id DESC LIMIT 1').get(playerName);
      
      if (!lastAction) {
        throw new Error('Aucune action à annuler');
      }
      
      // Inverser les points
      const updatePlayer = db.prepare('UPDATE players SET score = score - ? WHERE name = ?');
      updatePlayer.run(lastAction.points, playerName);
      
      // Supprimer l'entrée de l'historique
      const deleteHistory = db.prepare('DELETE FROM history WHERE id = ?');
      deleteHistory.run(lastAction.id);
      
      // Récupérer le nouveau score
      const player = db.prepare('SELECT score FROM players WHERE name = ?').get(playerName);
      
      return player.score;
    });
    
    const newScore = transaction();
    res.json({ success: true, newScore });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ajouter un nouvel élève (PROFESSEURS SEULEMENT)
app.post('/api/add-student', (req, res) => {
  try {
    const { name, franchise } = req.body;
    
    // Vérifier si l'élève existe déjà
    const existing = db.prepare('SELECT * FROM players WHERE name = ?').get(name);
    if (existing) {
      return res.status(400).json({ error: 'Un élève avec ce nom existe déjà' });
    }
    
    // Ajouter l'élève
    const insertPlayer = db.prepare('INSERT INTO players (name, franchise, score) VALUES (?, ?, ?)');
    insertPlayer.run(name, franchise, 0);
    
    // Initialiser les stats pour le nouvel élève
    const insertStats = db.prepare('INSERT OR IGNORE INTO player_stats (player_name) VALUES (?)');
    insertStats.run(name);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Supprimer un élève (PROFESSEURS SEULEMENT)
app.delete('/api/remove-student/:playerName', (req, res) => {
  try {
    const playerName = req.params.playerName;
    
    const transaction = db.transaction(() => {
      // Supprimer l'historique de l'élève
      const deleteHistory = db.prepare('DELETE FROM history WHERE player_name = ?');
      deleteHistory.run(playerName);
      
      // Supprimer les badges de l'élève
      const deleteBadges = db.prepare('DELETE FROM player_badges WHERE player_name = ?');
      deleteBadges.run(playerName);
      
      // Supprimer les stats de l'élève
      const deleteStats = db.prepare('DELETE FROM player_stats WHERE player_name = ?');
      deleteStats.run(playerName);
      
      // Supprimer l'élève
      const deletePlayer = db.prepare('DELETE FROM players WHERE name = ?');
      const result = deletePlayer.run(playerName);
      
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

// Changer la franchise d'un élève (PROFESSEURS SEULEMENT)
app.put('/api/change-franchise', (req, res) => {
  try {
    const { playerName, newFranchise } = req.body;
    
    const updatePlayer = db.prepare('UPDATE players SET franchise = ? WHERE name = ?');
    const result = updatePlayer.run(newFranchise, playerName);
    
    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Élève non trouvé' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === NOUVELLES ROUTES POUR LES BADGES ===

// Récupérer tous les badges (joueurs et franchises)
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
    
    res.json({ playerBadges, franchiseBadges });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les badges d'un joueur spécifique
app.get('/api/badges/player/:playerName', (req, res) => {
  try {
    const badges = db.prepare(`
      SELECT * FROM player_badges 
      WHERE player_name = ? 
      ORDER BY date_earned DESC
    `).all(req.params.playerName);
    
    res.json(badges);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les badges d'une franchise
app.get('/api/badges/franchise/:franchise', (req, res) => {
  try {
    const badges = db.prepare(`
      SELECT * FROM franchise_badges 
      WHERE franchise = ? 
      ORDER BY date_earned DESC
    `).all(req.params.franchise);
    
    res.json(badges);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Attribuer un badge à un joueur
app.post('/api/badges/award-player', (req, res) => {
  try {
    const { playerName, badgeId, badgeName, points } = req.body;
    
    const transaction = db.transaction(() => {
      // Vérifier si le badge existe déjà
      const existing = db.prepare(`
        SELECT * FROM player_badges 
        WHERE player_name = ? AND badge_id = ?
      `).get(playerName, badgeId);
      
      if (existing) {
        return { success: false, message: 'Badge déjà obtenu' };
      }
      
      // Ajouter le badge
      const insertBadge = db.prepare(`
        INSERT INTO player_badges (player_name, badge_id, badge_name, points, date_earned)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const dateEarned = new Date().toISOString();
      insertBadge.run(playerName, badgeId, badgeName, points, dateEarned);
      
      // Ajouter les points bonus au joueur
      if (points > 0) {
        const updatePlayer = db.prepare('UPDATE players SET score = score + ? WHERE name = ?');
        updatePlayer.run(points, playerName);
        
        // Ajouter à l'historique
        const insertHistory = db.prepare(`
          INSERT INTO history (player_name, action, points, timestamp, new_total, teacher_name) 
          VALUES (?, ?, ?, ?, (SELECT score FROM players WHERE name = ?), ?)
        `);
        const timestamp = new Date().toLocaleString('fr-FR');
        insertHistory.run(playerName, `Badge: ${badgeName}`, points, timestamp, playerName, 'Système');
      }
      
      return { success: true };
    });
    
    const result = transaction();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Attribuer un badge à une franchise
app.post('/api/badges/award-franchise', (req, res) => {
  try {
    const { franchise, badgeId, badgeName, points } = req.body;
    
    const transaction = db.transaction(() => {
      // Vérifier si le badge existe déjà
      const existing = db.prepare(`
        SELECT * FROM franchise_badges 
        WHERE franchise = ? AND badge_id = ?
      `).get(franchise, badgeId);
      
      if (existing) {
        return { success: false, message: 'Badge déjà obtenu' };
      }
      
      // Ajouter le badge
      const insertBadge = db.prepare(`
        INSERT INTO franchise_badges (franchise, badge_id, badge_name, points, date_earned)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const dateEarned = new Date().toISOString();
      insertBadge.run(franchise, badgeId, badgeName, points, dateEarned);
      
      // Optionnel : distribuer les points aux joueurs de la franchise
      if (points > 0) {
        const updatePlayers = db.prepare('UPDATE players SET score = score + ? WHERE franchise = ?');
        updatePlayers.run(Math.floor(points / 4), franchise); // Diviser les points entre les joueurs
      }
      
      return { success: true };
    });
    
    const result = transaction();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les statistiques d'un joueur (pour les streaks)
app.get('/api/stats/:playerName', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT * FROM player_stats WHERE player_name = ?
    `).get(req.params.playerName);
    
    res.json(stats || {
      current_streak: 0,
      max_streak: 0,
      consecutive_days: '[]',
      felicitations_count: 0,
      hardworker_count: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mettre à jour les statistiques d'un joueur
app.post('/api/stats/update', (req, res) => {
  try {
    const { playerName, stats } = req.body;
    
    const updateStats = db.prepare(`
      UPDATE player_stats 
      SET current_streak = ?, 
          max_streak = ?, 
          consecutive_days = ?,
          felicitations_count = ?,
          hardworker_count = ?,
          last_action_date = ?
      WHERE player_name = ?
    `);
    
    updateStats.run(
      stats.currentStreak || 0,
      stats.maxStreak || 0,
      JSON.stringify(stats.consecutiveDays || []),
      stats.felicitationsCount || 0,
      stats.hardworkerCount || 0,
      new Date().toISOString(),
      playerName
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Réinitialiser les badges (OPTIONNEL - POUR TESTS)
app.delete('/api/badges/reset', (req, res) => {
  try {
    db.prepare('DELETE FROM player_badges').run();
    db.prepare('DELETE FROM franchise_badges').run();
    db.prepare('UPDATE player_stats SET current_streak = 0, max_streak = 0, felicitations_count = 0, hardworker_count = 0').run();
    
    res.json({ success: true, message: 'Badges réinitialisés' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir l'application React
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Serveur démarré sur le port ${port}`);
  console.log(`🔐 Mot de passe professeur: ${TEACHER_PASSWORD}`);
  console.log(`🏅 Système de badges activé`);
});
