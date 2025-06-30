const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 🔐 MOT DE PASSE PROFESSEUR - MODIFIABLE ICI
// Pour changer le mot de passe, modifiez la ligne ci-dessous et redémarrez l'app
const TEACHER_PASSWORD = 'GPwinner2026';

// Initialiser la base de données
const db = new Database('.data/teams.db');

// Créer les tables si elles n'existent pas
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

// Ajouter des points (PROFESSEURS SEULEMENT)
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
      
      return player.score;
    });
    
    const newScore = transaction();
    res.json({ success: true, newScore });
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

// Servir l'application React
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Serveur démarré sur le port ${port}`);
  console.log(`🔐 Mot de passe professeur: ${TEACHER_PASSWORD}`);
});