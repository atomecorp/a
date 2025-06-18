import knex from 'knex';
import { Model } from 'objection';

// Database configuration
const knexConfig = {
  client: 'sqlite3',
  connection: {
    filename: './thermal_app.db'
  },
  useNullAsDefault: true,  migrations: {
    directory: './database/migrations'
  }
};

// Initialize knex
const knexInstance = knex(knexConfig);

// Give the knex instance to objection
Model.knex(knexInstance);

// Export for use in tests and app
export {
  knexInstance as knex,
  knexConfig
};
