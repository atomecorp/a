// Developer/diagnostic HTTP routes: the served server_config.json, the dev state
// snapshot, browser log ingestion and UI state snapshots.
import path from 'path';
import { promises as fs } from 'fs';
import { coerceLogEnvelope, isValidLogEnvelope } from '../atome/src/shared/logging.js';
import { SERVER_VERSION, EVE_VERSION } from './server_version.js';
import { wsApiConnections, wsApiClientsByUserId } from './wsApiState.js';
import { recentErrors } from './server_dedup.js';

export function registerHttpDevRoutes(server, { replyJson, SERVER_CONFIG_FILE, BROWSER_LOG_FILE, SNAPSHOT_DIR }) {
  // Serve server_config.json from the real project root.
  // Static assets are served from `atome/src/`, so we need an explicit route.
  server.get('/server_config.json', async (request, reply) => {
    try {
      const raw = await fs.readFile(SERVER_CONFIG_FILE, 'utf8');
      reply.header('content-type', 'application/json; charset=utf-8');
      reply.header('cache-control', 'no-store');
      let config;
      try {
        config = JSON.parse(raw);
      } catch (error) {
        request.log.warn({ err: error }, 'server_config.json is not valid JSON; returning raw file');
        return raw;
      }

      const rawUiDebug = typeof process.env.__CHECK_DEBUG__ === 'string'
        ? process.env.__CHECK_DEBUG__.trim()
        : '';
      if (rawUiDebug !== '') {
        const uiDebugEnabled = rawUiDebug === '1' || rawUiDebug === 'true';
        config.logging = {
          ...(config.logging || {}),
          debugEnabled: uiDebugEnabled
        };
      }

      return JSON.stringify(config);
    } catch (error) {
      reply.code(404);
      return { success: false, error: 'server_config.json not found' };
    }
  });

  server.get('/dev/state', async (request, reply) => {
    return {
      success: true,
      source: 'fastify',
      version: SERVER_VERSION,
      atomeVersion: SERVER_VERSION,
      eveVersion: EVE_VERSION,
      uptime_sec: Number(process.uptime().toFixed(2)),
      ws_api_connections: wsApiConnections.size,
      ws_api_users: wsApiClientsByUserId.size,
      recent_errors: recentErrors.slice(-20)
    };
  });

  const clientLogHandler = async (request, reply) => {
    const rawBody = request.body;
    const inputLogs = Array.isArray(rawBody)
      ? rawBody
      : (Array.isArray(rawBody?.logs) ? rawBody.logs : [rawBody]);
    const validLogs = inputLogs
      .map((entry) => coerceLogEnvelope(entry, { source: 'browser', component: 'ui' }))
      .filter((entry) => isValidLogEnvelope(entry));

    if (!validLogs.length) {
      return replyJson(reply, 400, { success: false, error: 'invalid log envelope' });
    }

    try {
      const lines = validLogs.map((entry) => JSON.stringify(entry)).join('\n');
      await fs.appendFile(BROWSER_LOG_FILE, `${lines}\n`);
    } catch (error) {
      const message = error?.message || String(error);
      return replyJson(reply, 500, { success: false, error: message });
    }

    return {
      success: true,
      accepted: validLogs.length,
      dropped: Math.max(0, inputLogs.length - validLogs.length)
    };
  };

  // Keep both endpoints for compatibility (older builds used /client-log).
  server.post('/dev/client-log', clientLogHandler);
  server.post('/client-log', clientLogHandler);

  server.post('/dev/snapshot', async (request, reply) => {
    const now = new Date();
    const payload = request.body && typeof request.body === 'object' ? request.body : {};
    const fileSafe = now.toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(SNAPSHOT_DIR, `snapshot-${fileSafe}.json`);
    const snapshot = {
      timestamp: now.toISOString(),
      source: 'fastify',
      state: payload.state || null,
      logs: Array.isArray(payload.logs) ? payload.logs.slice(-500) : [],
      meta: payload.meta || null
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
    } catch (error) {
      const message = error?.message || String(error);
      return replyJson(reply, 500, { success: false, error: message });
    }

    return { success: true, path: filePath };
  });
}
