// knexfile.js
module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './eDen.db'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './database/migrations'
    }
  },

  production: {
    client: 'sqlite3',
    connection: {
      filename: './eDen.db'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './database/migrations'
    }
  }
};
