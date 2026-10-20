// Server status routes: version / health probes, database status and stats,
// and the connected sync clients.
import crypto from 'crypto';
import { readFileSync } from 'fs';
import db from '../database/adole.js';
import { SERVER_VERSION, EVE_VERSION, refreshVersionCache } from './server_version.js';
import { getConnectedClients, getLocalVersion } from './githubSync.js';

export function registerServerInfoRoutes(server, { SERVER_TYPE, DATABASE_ENABLED }) {
  server.get('/api/server-info', async () => {
    await refreshVersionCache();
    return {
      success: true,
      version: SERVER_VERSION,
      atomeVersion: SERVER_VERSION,
      eveVersion: EVE_VERSION,
      type: SERVER_TYPE
    };
  });

  // Health check endpoint for load balancers and monitoring
  server.get('/health', { config: { cors: { origin: '*', credentials: false, methods: ['GET'] } } }, async () => {
    return {
      status: 'ok',
      version: SERVER_VERSION,
      atomeVersion: SERVER_VERSION,
      eveVersion: EVE_VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: DATABASE_ENABLED ? 'connected' : 'disabled'
    };
  });
}

export function registerDbStatusRoutes(server, { DATABASE_ENABLED, DB_REQUIRED_MESSAGE, SCHEMA_PATH }) {
  const SCHEMA_TABLES = 'atomes, particles, particles_versions, snapshots, events, state_current, permissions, sync_queue, sync_state';
  let cachedSchemaHash = null;

  function getSchemaHash() {
    if (cachedSchemaHash) return cachedSchemaHash;
    try {
      const schema = readFileSync(SCHEMA_PATH, 'utf8');
      cachedSchemaHash = crypto.createHash('sha256').update(schema).digest('hex');
    } catch (error) {
      cachedSchemaHash = null;
    }
    return cachedSchemaHash;
  }

  // ===========================
  // 3. DATABASE API ROUTES (ADOLE v3.0)
  // ===========================

  // Database status endpoint (SQLite/LibSQL - ADOLE v3.0)
  server.get('/api/db/status', async (request, reply) => {
    if (!DATABASE_ENABLED) {
      reply.code(503);
      return {
        success: false,
        status: 'unavailable',
        error: DB_REQUIRED_MESSAGE,
        timestamp: new Date().toISOString()
      };
    }

    try {
      const dataSourceAdapter = db.getDataSourceAdapter();
      await dataSourceAdapter.query('SELECT 1');

      // Get ADOLE tables from SQLite
      const tableRows = await dataSourceAdapter.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );

      return {
        success: true,
        status: 'connected',
        database: 'SQLite/LibSQL (ADOLE v3.0)',
        tables: tableRows.map((row) => row.name),
        schema: SCHEMA_TABLES,
        schema_hash: getSchemaHash(),
        schema_source: 'database/schema.sql',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      request.log.error({ err: error }, 'Database status check failed');
      reply.code(500);
      return {
        success: false,
        status: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });

  // Database stats endpoint (ADOLE v3.0)
  server.get('/api/db/stats', async (request, reply) => {
    if (!DATABASE_ENABLED) {
      reply.code(503);
      return { success: false, error: DB_REQUIRED_MESSAGE };
    }

    try {
      const dataSourceAdapter = db.getDataSourceAdapter();
      const [atomesResult, particlesResult, usersResult] = await Promise.all([
        dataSourceAdapter.query("SELECT COUNT(*) as count FROM atomes"),
        dataSourceAdapter.query("SELECT COUNT(*) as count FROM particles"),
        dataSourceAdapter.query("SELECT COUNT(*) as count FROM atomes WHERE atome_type = 'user'")
      ]);

      return {
        success: true,
        data: {
          atomes: parseInt(atomesResult[0]?.count || 0),
          particles: parseInt(particlesResult[0]?.count || 0),
          users: parseInt(usersResult[0]?.count || 0),
          database: 'SQLite/LibSQL (ADOLE v3.0)',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Route pour voir les clients sync connectés
  server.get('/api/admin/sync-clients', async (request, reply) => {
    const clients = getConnectedClients();
    const version = await getLocalVersion();
    return {
      success: true,
      serverVersion: version.version,
      clients: clients,
      totalClients: clients.length
    };
  });
}
