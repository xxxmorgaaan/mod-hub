// src/db.js
// Открывает (или создаёт) SQLite-базу, накатывает схему и один раз засевает
// игру Alem Colony и владельца админки — дальше всё живёт в data/modbuild.db.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'modbuild.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function seed() {
  const gameExists = db.prepare('SELECT 1 FROM games WHERE slug = ?').get('alem-colony');
  if (!gameExists) {
    db.prepare('INSERT INTO games (id, slug, name) VALUES (?, ?, ?)')
      .run('alem-colony', 'alem-colony', 'Alem Colony');
    console.log('[db] Добавлена игра: Alem Colony');
  }

  const anyAdmin = db.prepare('SELECT 1 FROM admins LIMIT 1').get();
  if (!anyAdmin) {
    const login = process.env.OWNER_LOGIN || 'owner';
    const pass = process.env.OWNER_PASSWORD || 'change-me-now';
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)')
      .run(login, hash, 'owner');
    console.log(`[db] Создан владелец админки: логин "${login}". Пароль — из OWNER_PASSWORD в .env. Смените его на вкладке «Настройки» после первого входа.`);
  }
}
seed();

module.exports = db;
