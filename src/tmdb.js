const config = require('./config');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

function requireToken() {
  if (!config.tmdb.accessToken) {
    const error = new Error('Falta TMDB_ACCESS_TOKEN. Copia .env.example como .env y pega tu token v4 de TMDB.');
    error.status = 500;
    throw error;
  }
}

async function tmdbFetch(endpoint, params = {}) {
  requireToken();

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set('language', config.tmdb.language);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.tmdb.accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Error TMDB ${response.status}: ${body}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function buildImageUrl(path, size = 'w500') {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

function normalizeSearchResult(item) {
  const isMovie = item.media_type === 'movie';
  const isTv = item.media_type === 'tv';

  if (!isMovie && !isTv) return null;

  return {
    tmdb_id: item.id,
    media_type: item.media_type,
    title: isMovie ? item.title : item.name,
    original_title: isMovie ? item.original_title : item.original_name,
    overview: item.overview || '',
    poster_path: item.poster_path || null,
    poster_url: buildImageUrl(item.poster_path),
    backdrop_path: item.backdrop_path || null,
    backdrop_url: buildImageUrl(item.backdrop_path, 'w780'),
    release_date: isMovie ? item.release_date : item.first_air_date,
    original_language: item.original_language,
    tmdb_vote_average: item.vote_average,
    genre_ids: item.genre_ids || []
  };
}

async function searchMulti(query) {
  const data = await tmdbFetch('/search/multi', {
    query,
    page: 1,
    include_adult: config.tmdb.includeAdult,
    region: config.tmdb.region
  });

  return (data.results || [])
    .map(normalizeSearchResult)
    .filter(Boolean)
    .filter((item) => item.poster_path || item.overview || item.release_date)
    .slice(0, 20);
}

async function getDetails(mediaType, tmdbId) {
  if (!['movie', 'tv'].includes(mediaType)) {
    const error = new Error('media_type debe ser movie o tv');
    error.status = 400;
    throw error;
  }

  const item = await tmdbFetch(`/${mediaType}/${tmdbId}`, {
    append_to_response: 'credits,watch/providers'
  });

  const isMovie = mediaType === 'movie';

  return {
    tmdb_id: item.id,
    media_type: mediaType,
    title: isMovie ? item.title : item.name,
    original_title: isMovie ? item.original_title : item.original_name,
    overview: item.overview || '',
    poster_path: item.poster_path || null,
    poster_url: buildImageUrl(item.poster_path),
    backdrop_path: item.backdrop_path || null,
    backdrop_url: buildImageUrl(item.backdrop_path, 'w780'),
    release_date: isMovie ? item.release_date : item.first_air_date,
    original_language: item.original_language,
    tmdb_vote_average: item.vote_average,
    genres: item.genres || [],
    runtime: isMovie ? item.runtime || null : null,
    number_of_seasons: isMovie ? null : item.number_of_seasons || null,
    number_of_episodes: isMovie ? null : item.number_of_episodes || null
  };
}

module.exports = {
  searchMulti,
  getDetails,
  buildImageUrl
};
