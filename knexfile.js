export default {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './thermal_app.db'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './database/migrations'
    }
  },
  
  production: {
    client: 'sqlite3',
    connection: {
      filename: './thermal_app.db'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './database/migrations'
    }
  }
};
