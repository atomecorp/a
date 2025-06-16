const knex = require('knex');
const { Model } = require('objection');

// Database configuration
const knexConfig = {
  client: 'sqlite3',
  connection: {
    filename: './thermal_app.db'
  },
  useNullAsDefault: true,
  migrations: {
    directory: './src/database/migrations'
  }
};

// Initialize knex
const knexInstance = knex(knexConfig);

// Give the knex instance to objection
Model.knex(knexInstance);

// Export for use in tests and app
module.exports = {
  knex: knexInstance,
  knexConfig
};
