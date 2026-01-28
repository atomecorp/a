import { TauriAdapter, FastifyAdapter } from '../adole.js';

/**
 * List all tables from both databases via WebSocket
 * Uses the TauriAdapter and FastifyAdapter debug.listTables() method
 */
async function list_tables() {
  const results = {
    tauri: { database: 'Tauri/SQLite', tables: [], error: null },
    fastify: { database: 'Fastify/LibSQL', tables: [], error: null }
  };

  // Tauri: Use WebSocket adapter
  try {
    const tauriResult = await TauriAdapter.debug.listTables();
    if (tauriResult.success || tauriResult.ok) {
      results.tauri.tables = tauriResult.tables || [];
    } else {
      results.tauri.error = tauriResult.error || 'Unknown error';
    }
  } catch (e) {
    results.tauri.error = e.message;
  }

  // Fastify: Use WebSocket adapter
  try {
    const fastifyResult = await FastifyAdapter.debug.listTables();
    if (fastifyResult.success || fastifyResult.ok) {
      results.fastify.tables = fastifyResult.tables || [];
    } else {
      results.fastify.error = fastifyResult.error || 'Unknown error';
    }
  } catch (e) {
    results.fastify.error = e.message;
  }

  return results;
}

export { list_tables };
