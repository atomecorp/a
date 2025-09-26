import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import knex from 'knex';
import { Model } from 'objection';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILENAME = 'eDen.db';
const DB_DIR = path.resolve(__dirname, '../src');
const DB_PATH = path.join(DB_DIR, DB_FILENAME);
const LEGACY_DB_PATH = path.resolve(__dirname, '../eDen.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Ensure the target directory exists (should already, but safeguard)
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
}

// Migrate an existing legacy database at project root without overwriting
if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  try {
    fs.renameSync(LEGACY_DB_PATH, DB_PATH);
  } catch (error) {
    console.warn('[database] Impossible de déplacer l\'ancienne base eDen vers src:', error);
  }
}

// Database configuration
const knexConfig = {
  client: 'sqlite3',
  connection: {
    filename: DB_PATH
  },
  useNullAsDefault: true,
  migrations: {
    directory: MIGRATIONS_DIR
  }
};

// Initialize knex
const knexInstance = knex(knexConfig);

// Give the knex instance to objection
Model.knex(knexInstance);

// Export for use in tests and app
export {
  knexInstance as knex,
  knexConfig,
  DB_PATH
};
