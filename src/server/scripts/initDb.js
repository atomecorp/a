// src/server/scripts/initDb.js
import { DatabaseOperations } from '../database.js';

async function initializeDatabase() {
  try {
    console.log(' Initializing database');
    await DatabaseOperations.initialize();
    console.log(' Database initialized successfully!');
    
    // Test the connection
    const healthCheck = await DatabaseOperations.healthCheck();
    console.log(' Database health check:', healthCheck);
    
    // Close the connection
    await DatabaseOperations.close();
    console.log(' Database connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error(' Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();