const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

function normalizeDbPath(dbPath) {
  // Permite rutas Windows escritas con / o \\ y rutas relativas al proyecto.
  if (/^[a-zA-Z]:[\\/]/.test(dbPath)) return dbPath;
  return path.resolve(config.rootDir, dbPath);
}

const dbPath = normalizeDbPath(config.database.path);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath, {
  enableForeignKeyConstraints: true,
  timeout: 5000,
  allowBareNamedParameters: true
});

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

function runTransaction(callback) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = callback(...args);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        console.error('No se ha podido hacer rollback:', rollbackError);
      }
      throw error;
    }
  };
}

// Compatibilidad sencilla con el método transaction() que antes aportaba better-sqlite3.
db.transaction = runTransaction;

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

// La nota del 1 al 10 se sustituyó por la categoría. Antes de borrar la columna, lo que aún
// no tiene categoría la recibe según su nota (sin tocar las categorías ya puestas).
function dropRating() {
  const columns = db.prepare('PRAGMA table_info(user_media)').all();
  if (!columns.some((column) => column.name === 'rating')) return;

  runTransaction(() => {
    db.exec(`
      UPDATE user_media
      SET verdict = CASE
        WHEN rating >= 9 THEN 'masterpiece'
        WHEN rating >= 7 THEN 'recommend'
        WHEN rating >= 5 THEN 'meh'
        ELSE 'crap'
      END
      WHERE verdict IS NULL AND rating IS NOT NULL AND status = 'watched'
    `);
    db.exec('ALTER TABLE user_media DROP COLUMN rating');
  })();
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
      title TEXT NOT NULL,
      original_title TEXT,
      overview TEXT,
      poster_path TEXT,
      backdrop_path TEXT,
      release_date TEXT,
      original_language TEXT,
      tmdb_vote_average REAL,
      genres_json TEXT,
      runtime INTEGER,
      number_of_seasons INTEGER,
      number_of_episodes INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tmdb_id, media_type)
    );

    CREATE TABLE IF NOT EXISTS user_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      media_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('watchlist', 'watched')),
      comment TEXT,
      watched_at TEXT,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
      UNIQUE (user_id, media_id)
    );

    CREATE TABLE IF NOT EXISTS watch_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL,
      watched_at TEXT DEFAULT CURRENT_TIMESTAMP,
      general_comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watch_event_users (
      watch_event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (watch_event_id, user_id),
      FOREIGN KEY (watch_event_id) REFERENCES watch_events(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_tmdb ON media(tmdb_id, media_type);
    CREATE INDEX IF NOT EXISTS idx_user_media_status ON user_media(status);
    CREATE INDEX IF NOT EXISTS idx_user_media_user ON user_media(user_id);
    CREATE INDEX IF NOT EXISTS idx_watch_events_media ON watch_events(media_id);
    CREATE INDEX IF NOT EXISTS idx_watch_event_users_user ON watch_event_users(user_id);
  `);

  // Si ya habías creado las tablas antes, añadimos columnas nuevas sin borrar datos.
  ensureColumn('media', 'runtime', 'INTEGER');
  ensureColumn('media', 'number_of_seasons', 'INTEGER');
  ensureColumn('media', 'number_of_episodes', 'INTEGER');
  ensureColumn('user_media', 'verdict', 'TEXT');
  dropRating();

  const insertUser = db.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)');
  for (const userName of config.defaultUsers) {
    if (userName && userName.trim()) insertUser.run(userName.trim());
  }
}

migrate();

module.exports = db;
