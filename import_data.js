const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'teams.db');
const sqlPath = path.join(__dirname, 'import_historical_data.sql');

console.log('📂 Ouverture de la base de données...');
const db = new Database(dbPath);

console.log('📄 Lecture du fichier SQL...');
const sql = fs.readFileSync(sqlPath, 'utf8');

console.log('⚙️ Exécution des requêtes SQL...');
try {
  db.exec(sql);
  console.log('✅ Données historiques importées avec succès !');
} catch (error) {
  console.error('❌ Erreur lors de l\'import :', error.message);
  process.exit(1);
}

db.close();
console.log('🔒 Base de données fermée.');
