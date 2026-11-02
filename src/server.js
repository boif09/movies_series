const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const db = require('./db');
const config = require('./config');
const tmdb = require('./tmdb');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(config.basePath, express.static(path.join(config.rootDir, 'public')));

const router = express.Router();

function now() {
  return new Date().toISOString();
}

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateStatus(status) {
  if (!['watchlist', 'watched'].includes(status)) {
    const error = new Error('El status debe ser watchlist o watched');
    error.status = 400;
    throw error;
  }
}

// Qué nos ha parecido algo visto. Solo tiene sentido en contenido marcado como visto.
const VERDICTS = ['recommend', 'meh', 'crap'];

function verdictOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!VERDICTS.includes(value)) {
    const error = new Error(`La categoría debe ser una de: ${VERDICTS.join(', ')}`);
    error.status = 400;
    throw error;
  }
  return value;
}

function validateRating(rating) {
  if (rating === null || !Number.isInteger(rating) || rating < 1 || rating > 10) {
    const error = new Error('Para marcar como vista debes añadir una valoración del 1 al 10');
    error.status = 400;
    throw error;
  }
}

function getUsersByIds(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    const error = new Error('Debes seleccionar al menos un usuario');
    error.status = 400;
    throw error;
  }

  const cleanIds = [...new Set(userIds.map(Number).filter(Number.isInteger))];
  if (cleanIds.length === 0) {
    const error = new Error('Los usuarios seleccionados no son válidos');
    error.status = 400;
    throw error;
  }

  const placeholders = cleanIds.map(() => '?').join(',');
  const users = db.prepare(`SELECT id, name FROM users WHERE id IN (${placeholders})`).all(...cleanIds);

  if (users.length !== cleanIds.length) {
    const error = new Error('Alguno de los usuarios seleccionados no existe');
    error.status = 400;
    throw error;
  }

  return users;
}

function mapMediaRow(row) {
  return {
    ...row,
    poster_url: tmdb.buildImageUrl(row.poster_path),
    backdrop_url: tmdb.buildImageUrl(row.backdrop_path, 'w780'),
    genres: row.genres_json ? JSON.parse(row.genres_json) : []
  };
}

function collapseSharedRows(rows) {
  const seenSharedEvents = new Set();
  const collapsed = [];

  for (const row of rows) {
    if (!row.shared_watch_event_id) {
      collapsed.push({ ...row, entry_type: 'user' });
      continue;
    }

    const key = String(row.shared_watch_event_id);
    if (seenSharedEvents.has(key)) continue;
    seenSharedEvents.add(key);

    collapsed.push({
      ...row,
      entry_type: 'shared',
      status: 'watched',
      user_name: row.shared_user_names || row.user_name,
      watched_at: row.shared_watched_at || row.watched_at,
      comment: row.shared_comment || row.comment
    });
  }

  return collapsed;
}

router.get('/api/health', (req, res) => {
  res.json({ ok: true, databasePath: config.database.path });
});

router.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, name, created_at FROM users ORDER BY id ASC').all();
  res.json(users);
});

router.post('/api/users', (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      const error = new Error('El nombre es obligatorio');
      error.status = 400;
      throw error;
    }

    const result = db.prepare('INSERT INTO users (name) VALUES (?)').run(name);
    const user = db.prepare('SELECT id, name, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      error.status = 409;
      error.message = 'Ya existe un usuario con ese nombre';
    }
    next(error);
  }
});

router.get('/api/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json([]);

    const results = await tmdb.searchMulti(query);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

router.get('/api/library', (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const mediaType = req.query.mediaType ? String(req.query.mediaType) : null;
    const textFilter = req.query.q ? String(req.query.q).trim() : '';
    const verdict = req.query.verdict ? String(req.query.verdict) : null;

    const where = [];
    const params = [];

    if (status && status !== 'all') {
      validateStatus(status);
      where.push('um.status = ?');
      params.push(status);
    }

    if (userId) {
      where.push('um.user_id = ?');
      params.push(userId);
    }

    if (mediaType && mediaType !== 'all') {
      if (!['movie', 'tv'].includes(mediaType)) {
        const error = new Error('mediaType debe ser movie, tv o all');
        error.status = 400;
        throw error;
      }
      where.push('m.media_type = ?');
      params.push(mediaType);
    }

    if (textFilter) {
      where.push('(m.title LIKE ? COLLATE NOCASE OR m.original_title LIKE ? COLLATE NOCASE)');
      params.push(`%${textFilter}%`, `%${textFilter}%`);
    }

    if (verdict && verdict !== 'all') {
      if (verdict === 'none') {
        where.push("um.status = 'watched' AND um.verdict IS NULL");
      } else {
        where.push('um.verdict = ?');
        params.push(verdictOrNull(verdict));
      }
    }

    const sql = `
      WITH shared_events AS (
        SELECT
          we.id,
          we.media_id,
          we.watched_at,
          we.general_comment,
          COUNT(weu.user_id) AS shared_user_count,
          GROUP_CONCAT(weu.user_id) AS shared_user_ids,
          GROUP_CONCAT(u.name, ', ') AS shared_user_names
        FROM watch_events we
        JOIN watch_event_users weu ON weu.watch_event_id = we.id
        JOIN users u ON u.id = weu.user_id
        GROUP BY we.id
      )
      SELECT
        um.id AS user_media_id,
        um.status,
        um.rating,
        um.comment,
        um.verdict,
        um.watched_at,
        um.added_at,
        um.updated_at AS user_media_updated_at,
        u.id AS user_id,
        u.name AS user_name,
        se.id AS shared_watch_event_id,
        se.watched_at AS shared_watched_at,
        se.general_comment AS shared_comment,
        se.shared_user_count,
        se.shared_user_ids,
        se.shared_user_names,
        m.*
      FROM user_media um
      JOIN users u ON u.id = um.user_id
      JOIN media m ON m.id = um.media_id
      LEFT JOIN shared_events se ON se.id = (
        SELECT we.id
        FROM watch_events we
        JOIN watch_event_users weu ON weu.watch_event_id = we.id
        WHERE we.media_id = m.id
          AND weu.user_id = um.user_id
        ORDER BY we.watched_at DESC, we.id DESC
        LIMIT 1
      )
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY COALESCE(se.watched_at, um.watched_at, um.updated_at, um.added_at) DESC, um.id DESC
    `;

    const rows = db.prepare(sql).all(...params).map(mapMediaRow);
    res.json(collapseSharedRows(rows));
  } catch (error) {
    next(error);
  }
});

router.get('/api/stats', (req, res, next) => {
  try {
    const row = db.prepare(`
      SELECT
        (
          SELECT COUNT(*)
          FROM watch_events
        ) AS shared_watched,
        (
          SELECT COUNT(*)
          FROM user_media um
          WHERE um.status = 'watched'
            AND NOT EXISTS (
              SELECT 1
              FROM watch_events we
              JOIN watch_event_users weu ON weu.watch_event_id = we.id
              WHERE we.media_id = um.media_id
                AND weu.user_id = um.user_id
            )
        ) AS individual_watched,
        (
          SELECT COUNT(*)
          FROM user_media
          WHERE status = 'watchlist'
        ) AS watchlist
    `).get();

    res.json({
      watched: Number(row.shared_watched || 0) + Number(row.individual_watched || 0),
      watchlist: Number(row.watchlist || 0)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/library', async (req, res, next) => {
  try {
    const { tmdb_id, media_type, status, userIds } = req.body;
    validateStatus(status);
    const users = getUsersByIds(userIds);
    const cleanUserIds = users.map((user) => user.id);
    const watchedTogether = status === 'watched' && Boolean(req.body.watchedTogether) && cleanUserIds.length > 1;

    if (!tmdb_id || !['movie', 'tv'].includes(media_type)) {
      const error = new Error('tmdb_id y media_type son obligatorios');
      error.status = 400;
      throw error;
    }

    const rating = intOrNull(req.body.rating);
    if (status === 'watched') validateRating(rating);
    const verdict = status === 'watched' ? verdictOrNull(req.body.verdict) : null;

    const comment = req.body.comment ? String(req.body.comment).trim() : null;
    const watchedAt = status === 'watched'
      ? (req.body.watched_at || new Date().toISOString().slice(0, 10))
      : null;

    const details = await tmdb.getDetails(media_type, tmdb_id);

    const upsertMedia = db.prepare(`
      INSERT INTO media (
        tmdb_id, media_type, title, original_title, overview, poster_path, backdrop_path,
        release_date, original_language, tmdb_vote_average, genres_json, runtime,
        number_of_seasons, number_of_episodes, updated_at
      ) VALUES (
        @tmdb_id, @media_type, @title, @original_title, @overview, @poster_path, @backdrop_path,
        @release_date, @original_language, @tmdb_vote_average, @genres_json, @runtime,
        @number_of_seasons, @number_of_episodes, @updated_at
      )
      ON CONFLICT(tmdb_id, media_type) DO UPDATE SET
        title = excluded.title,
        original_title = excluded.original_title,
        overview = excluded.overview,
        poster_path = excluded.poster_path,
        backdrop_path = excluded.backdrop_path,
        release_date = excluded.release_date,
        original_language = excluded.original_language,
        tmdb_vote_average = excluded.tmdb_vote_average,
        genres_json = excluded.genres_json,
        runtime = excluded.runtime,
        number_of_seasons = excluded.number_of_seasons,
        number_of_episodes = excluded.number_of_episodes,
        updated_at = excluded.updated_at
    `);

    const selectMedia = db.prepare('SELECT id FROM media WHERE tmdb_id = ? AND media_type = ?');
    const insertWatchEvent = db.prepare(`
      INSERT INTO watch_events (media_id, watched_at, general_comment)
      VALUES (?, ?, ?)
    `);
    const insertWatchEventUser = db.prepare(`
      INSERT INTO watch_event_users (watch_event_id, user_id)
      VALUES (?, ?)
    `);
    const upsertUserMedia = db.prepare(`
      INSERT INTO user_media (user_id, media_id, status, rating, comment, verdict, watched_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, media_id) DO UPDATE SET
        status = excluded.status,
        rating = excluded.rating,
        comment = excluded.comment,
        verdict = excluded.verdict,
        watched_at = excluded.watched_at,
        updated_at = excluded.updated_at
    `);

    const mediaParams = {
      tmdb_id: details.tmdb_id,
      media_type: details.media_type,
      title: details.title,
      original_title: details.original_title,
      overview: details.overview,
      poster_path: details.poster_path,
      backdrop_path: details.backdrop_path,
      release_date: details.release_date,
      original_language: details.original_language,
      tmdb_vote_average: details.tmdb_vote_average,
      genres_json: JSON.stringify(details.genres || []),
      runtime: details.runtime,
      number_of_seasons: details.number_of_seasons,
      number_of_episodes: details.number_of_episodes,
      updated_at: now()
    };

    const tx = db.transaction(() => {
      upsertMedia.run(mediaParams);

      const media = selectMedia.get(details.tmdb_id, details.media_type);

      for (const userId of cleanUserIds) {
        upsertUserMedia.run(Number(userId), media.id, status, rating, comment, verdict, watchedAt, now());
      }

      if (watchedTogether) {
        const result = insertWatchEvent.run(media.id, watchedAt, comment);
        const watchEventId = result.lastInsertRowid;
        for (const userId of cleanUserIds) {
          insertWatchEventUser.run(watchEventId, userId);
        }
      }

      return media.id;
    });

    tx();

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

function getWatchEventWithUsers(watchEventId) {
  const event = db.prepare('SELECT id, media_id FROM watch_events WHERE id = ?').get(watchEventId);
  if (!event) return null;

  const users = db.prepare('SELECT user_id FROM watch_event_users WHERE watch_event_id = ?').all(watchEventId);
  return {
    ...event,
    userIds: users.map((user) => user.user_id)
  };
}

router.patch('/api/watch-events/:watchEventId', (req, res, next) => {
  try {
    const watchEventId = Number(req.params.watchEventId);
    const status = req.body.status || 'watchlist';
    validateStatus(status);

    const event = getWatchEventWithUsers(watchEventId);
    if (!event) {
      const error = new Error('No se ha encontrado el visionado compartido');
      error.status = 404;
      throw error;
    }

    const placeholders = event.userIds.map(() => '?').join(',');

    // Editar un visionado compartido: los mismos datos para todas las personas que lo vieron.
    if (status === 'watched') {
      const current = db.prepare('SELECT watched_at, general_comment FROM watch_events WHERE id = ?').get(watchEventId);
      const sample = db.prepare(`
        SELECT rating, verdict FROM user_media WHERE media_id = ? AND user_id IN (${placeholders}) LIMIT 1
      `).get(event.media_id, ...event.userIds) || {};

      const rating = req.body.rating === undefined ? sample.rating : intOrNull(req.body.rating);
      validateRating(rating);
      const verdict = req.body.verdict === undefined ? (sample.verdict ?? null) : verdictOrNull(req.body.verdict);
      const comment = req.body.comment === undefined
        ? current.general_comment
        : String(req.body.comment || '').trim() || null;
      const watchedAt = req.body.watched_at || current.watched_at;

      const tx = db.transaction(() => {
        db.prepare('UPDATE watch_events SET watched_at = ?, general_comment = ? WHERE id = ?')
          .run(watchedAt, comment, watchEventId);
        db.prepare(`
          UPDATE user_media
          SET status = 'watched', rating = ?, comment = ?, verdict = ?, watched_at = ?, updated_at = ?
          WHERE media_id = ? AND user_id IN (${placeholders})
        `).run(rating, comment, verdict, watchedAt, now(), event.media_id, ...event.userIds);
      });

      tx();
      return res.json({ ok: true });
    }

    const tx = db.transaction(() => {
      if (event.userIds.length) {
        db.prepare(`
          UPDATE user_media
          SET status = 'watchlist', rating = NULL, comment = NULL, verdict = NULL, watched_at = NULL, updated_at = ?
          WHERE media_id = ? AND user_id IN (${placeholders})
        `).run(now(), event.media_id, ...event.userIds);
      }

      db.prepare('DELETE FROM watch_event_users WHERE watch_event_id = ?').run(watchEventId);
      db.prepare('DELETE FROM watch_events WHERE id = ?').run(watchEventId);
    });

    tx();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/api/watch-events/:watchEventId', (req, res, next) => {
  try {
    const watchEventId = Number(req.params.watchEventId);
    const event = getWatchEventWithUsers(watchEventId);
    if (!event) {
      const error = new Error('No se ha encontrado el visionado compartido');
      error.status = 404;
      throw error;
    }

    const placeholders = event.userIds.map(() => '?').join(',');
    const tx = db.transaction(() => {
      if (event.userIds.length) {
        db.prepare(`DELETE FROM user_media WHERE media_id = ? AND user_id IN (${placeholders})`)
          .run(event.media_id, ...event.userIds);
      }

      db.prepare('DELETE FROM watch_event_users WHERE watch_event_id = ?').run(watchEventId);
      db.prepare('DELETE FROM watch_events WHERE id = ?').run(watchEventId);
    });

    tx();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/library/:userMediaId', (req, res, next) => {
  try {
    const userMediaId = Number(req.params.userMediaId);
    const existing = db.prepare('SELECT * FROM user_media WHERE id = ?').get(userMediaId);
    if (!existing) {
      const error = new Error('No se ha encontrado el registro');
      error.status = 404;
      throw error;
    }

    const status = req.body.status || existing.status;
    validateStatus(status);

    const rating = req.body.rating === undefined ? existing.rating : intOrNull(req.body.rating);
    if (status === 'watched') validateRating(rating);

    const verdict = req.body.verdict === undefined ? existing.verdict : verdictOrNull(req.body.verdict);
    const comment = req.body.comment === undefined ? existing.comment : String(req.body.comment || '').trim() || null;
    const watchedAt = status === 'watched'
      ? (req.body.watched_at || existing.watched_at || new Date().toISOString().slice(0, 10))
      : null;

    db.prepare(`
      UPDATE user_media
      SET status = ?, rating = ?, comment = ?, verdict = ?, watched_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      status === 'watched' ? rating : null,
      comment,
      status === 'watched' ? verdict : null,
      watchedAt,
      now(),
      userMediaId
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/api/library/:userMediaId', (req, res, next) => {
  try {
    const userMediaId = Number(req.params.userMediaId);
    const result = db.prepare('DELETE FROM user_media WHERE id = ?').run(userMediaId);
    if (result.changes === 0) {
      const error = new Error('No se ha encontrado el registro');
      error.status = 404;
      throw error;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('*', (req, res) => {
  res.sendFile(path.join(config.rootDir, 'public', 'index.html'));
});

app.get('/', (req, res) => {
  res.redirect(config.basePath || '/');
});

app.use(config.basePath, router);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || 'Error interno del servidor'
  });
});

app.listen(config.port, () => {
  console.log(`Movies & Series Tracker funcionando en http://localhost:${config.port}${config.basePath}`);
  console.log(`SQLite: ${config.database.path}`);
});
