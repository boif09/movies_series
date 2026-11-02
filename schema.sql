-- Referencia de tablas usadas por la aplicación.
-- La app también ejecuta estas migraciones automáticamente al arrancar.

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
  verdict TEXT,
  wtf INTEGER NOT NULL DEFAULT 0,
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
