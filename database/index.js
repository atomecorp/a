/**
 * Database Module - Unified Export
 * 
 * This module provides a unified interface to the ADOLE database layer.
 * Pure SQLite/libSQL implementation - no ORM.
 * 
 * Usage:
 *   import db from '../database/adole.js'
 *   // or
 *   import { initDatabase, createAtome } from '../database/adole.js'
 */

// Re-export everything from the new ADOLE module
export * from './adole.js';
export { default } from './adole.js';

// Also export driver utilities for direct SQL access if needed
export {
    connect as connectDriver,
    getDatabase as getDriverDatabase,
    serializeJson,
    deserializeJson,
    isSqlite as isDriverSqlite,
    isLibsql as isDriverLibsql
} from './driver.js';

// Export migration utilities
export { runMigrations, getMigrationStatus, createMigration } from './migrate.js';
