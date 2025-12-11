/**
 * Database Module - Unified Export
 * ADOLE v3.0 - Atome-Particle Model
 * 
 * This module provides a unified interface to the ADOLE database layer.
 * Pure SQLite/libSQL implementation - no ORM.
 * 
 * Schema (7 tables):
 *   - atomes: All entities (users, documents, etc.)
 *   - particles: Properties of atomes (key-value)
 *   - particles_versions: History of changes
 *   - snapshots: Full backups
 *   - permissions: Access control
 *   - sync_queue: Sync queue
 *   - sync_state: Sync state
 * 
 * Usage:
 *   import db from '../database/adole.js'
 *   // or
 *   import { initDatabase, createAtome } from '../database/adole.js'
 */

// Re-export everything from the ADOLE module
export * from './adole.js';
export { default } from './adole.js';

// Export driver utilities for direct SQL access if needed
export {
    connect as connectDriver,
    getDatabase as getDriverDatabase,
    serializeJson,
    deserializeJson,
    isSqlite as isDriverSqlite,
    isLibsql as isDriverLibsql
} from './driver.js';