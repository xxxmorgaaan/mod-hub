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

// Лёгкая миграция для баз, созданных до появления scan_note (CREATE TABLE IF
// NOT EXISTS не добавляет колонки в уже существующую таблицу сам).
const modVersionCols = db.prepare("PRAGMA table_info(mod_versions)").all().map(c => c.name);
if (!modVersionCols.includes('scan_note')) {
  db.exec('ALTER TABLE mod_versions ADD COLUMN scan_note TEXT');
  console.log('[db] Миграция: добавлена колонка mod_versions.scan_note');
}

function seed() {
  const gameExists = db.prepare('SELECT 1 FROM games WHERE slug = ?').get('alem-colony');
  if (!gameExists) {
    db.prepare('INSERT INTO games (id, slug, name) VALUES (?, ?, ?)')
      .run('alem-colony', 'alem-colony', 'Alem Colony');
    console.log('[db] Добавлена игра: Alem Colony');
  }

  const login = (process.env.OWNER_LOGIN || 'owner').trim();
  const pass = (process.env.OWNER_PASSWORD || 'change-me-now').trim();
  const owner = db.prepare(`SELECT * FROM admins WHERE role = 'owner' LIMIT 1`).get();

  if (!owner) {
    // Первый запуск — владельца ещё нет, заводим из .env.
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)')
      .run(login, hash, 'owner');
    console.log(`[db] Создан владелец админки: логин "${login}". Пароль — из OWNER_PASSWORD в .env. Смените его на вкладке «Настройки» после первого входа.`);
  } else if (process.env.SYNC_OWNER_PASSWORD === 'true') {
    // Владелец уже есть в базе — поменяли пароль/логин в .env, но старая
    // запись в БД об этом не узнаёт сама (это осознанно, чтобы редеплой не
    // сбрасывал пароль, который сменили через «Настройки»). Если код входа
    // не подходит — самая частая причина именно в этом: пароль в .env
    // поменяли, а в уже существующей базе остался старый хэш. Поставьте
    // SYNC_OWNER_PASSWORD=true, задеплойте — логин/пароль владельца
    // принудительно перезапишутся из .env. После успешного входа переменную
    // можно убрать (или оставить false), чтобы «Настройки» снова работали
    // как обычно.
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare('UPDATE admins SET username = ?, password_hash = ? WHERE id = ?').run(login, hash, owner.id);
    console.log(`[db] SYNC_OWNER_PASSWORD=true: логин/пароль владельца перезаписаны из .env ("${login}"). Уберите эту переменную после входа.`);
  }
}
seed();

module.exports = db;
