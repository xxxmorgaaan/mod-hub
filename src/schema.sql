-- schema.sql
-- Модерация: и mods.status, и bundles.status идут через 'pending' → 'approved'
-- (или 'rejected'), плюс отдельное 'hidden' — админ/автор снял уже одобренную
-- запись с витрины, не удаляя её. Публично видно только status = 'approved'.

CREATE TABLE IF NOT EXISTS games (
  id   TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mods (
  id                 TEXT PRIMARY KEY,
  game_id            TEXT NOT NULL REFERENCES games(id),
  slug               TEXT NOT NULL,
  name               TEXT NOT NULL,
  summary            TEXT,
  description        TEXT,
  cover_path         TEXT,
  control_code_hash  TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | hidden
  moderation_note    TEXT,
  downloads          INTEGER NOT NULL DEFAULT 0,
  likes              INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mods_game_slug ON mods(game_id, slug);
CREATE INDEX IF NOT EXISTS idx_mods_status ON mods(status);

CREATE TABLE IF NOT EXISTS mod_tags (
  mod_id TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  tag    TEXT NOT NULL,
  PRIMARY KEY (mod_id, tag)
);

CREATE TABLE IF NOT EXISTS mod_screenshots (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_id   TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  path     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mod_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_id       TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  changelog    TEXT,
  file_path    TEXT NOT NULL,
  file_size    INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending', -- новая версия тоже ждёт проверки
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mod_likes (
  mod_id      TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  voter_token TEXT NOT NULL,
  PRIMARY KEY (mod_id, voter_token)
);

CREATE TABLE IF NOT EXISTS mod_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_id      TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bundles (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id         TEXT UNIQUE NOT NULL,
  game_id           TEXT NOT NULL REFERENCES games(id),
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  summary           TEXT,
  description       TEXT,
  cover_path        TEXT,
  control_code_hash TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  moderation_note   TEXT,
  likes             INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bundles_game_slug ON bundles(game_id, slug);

CREATE TABLE IF NOT EXISTS bundle_mods (
  bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  mod_id    TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  PRIMARY KEY (bundle_id, mod_id)
);

CREATE TABLE IF NOT EXISTS bundle_likes (
  bundle_id   INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  voter_token TEXT NOT NULL,
  PRIMARY KEY (bundle_id, voter_token)
);

CREATE TABLE IF NOT EXISTS complaints (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type  TEXT NOT NULL, -- 'mod' | 'bundle'
  target_id    TEXT NOT NULL,
  reporter_note TEXT,
  token_hash   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS complaint_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  sender       TEXT NOT NULL, -- 'user' | 'admin'
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'moderator', -- 'owner' | 'moderator'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
