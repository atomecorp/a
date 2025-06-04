// src/server/scripts/initDb.js
import { DatabaseOperations } from '../database.js';

async function initializeDatabase() {
  try {
    await DatabaseOperations.initialize();
    
    // Test the connection
    const healthCheck = await DatabaseOperations.healthCheck();
    
    // Close the connection
    await DatabaseOperations.close();
    
    process.exit(0);
  } catch (error) {
    console.error(' Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();