const fs = require('fs');
const path = require('path');
require('dotenv').config();

const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'config.json');

function readConfigFile() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`No se encuentra config.json en ${configPath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`config.json no es un JSON válido: ${error.message}`);
  }
}

const fileConfig = readConfigFile();


function normalizeBasePath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return '/' + raw.replace(/^\/+|\/+$/g, '');
}

const config = {
  rootDir,
  port: Number(process.env.PORT || fileConfig.app?.port || 3000),
  basePath: normalizeBasePath(process.env.BASE_PATH || fileConfig.app?.basePath || '/movies_series'),
  defaultUsers: fileConfig.app?.defaultUsers || ['Xavi', 'Judit'],
  database: {
    provider: fileConfig.database?.provider || 'sqlite',
    path: process.env.DB_PATH || fileConfig.database?.path,
    url: process.env.DATABASE_URL || fileConfig.database?.url || ''
  },
  tmdb: {
    accessToken: process.env.TMDB_ACCESS_TOKEN,
    language: process.env.TMDB_LANGUAGE || fileConfig.tmdb?.language || 'es-ES',
    includeAdult: Boolean(fileConfig.tmdb?.includeAdult),
    region: fileConfig.tmdb?.region || 'ES'
  }
};

if (config.database.provider !== 'sqlite') {
  throw new Error('Por ahora la app solo implementa provider sqlite. Puedes dejar una url preparada en config.json para una migración futura.');
}

if (!config.database.path) {
  throw new Error('Falta database.path en config.json o DB_PATH en .env');
}

module.exports = config;
