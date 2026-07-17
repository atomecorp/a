// Server Fastify v5 moderne avec WebSocket natif
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyCompress from '@fastify/compress';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs, createReadStream, createWriteStream, readFileSync, existsSync, mkdirSync, watchFile } from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import pino from 'pino';
import { coerceLogEnvelope, isValidLogEnvelope } from '../atome/shared/logging.js';
import { handleWsAtomeOperation } from './wsAtomeOperations.js';
import { sendWsApiRequest } from './wsApiClient.js';
import {
  authenticateWsSyncMessage,
  authenticateWsSyncRequest,
  buildWsSyncWelcome,
  filterWsSyncEventForPrincipal,
  handleWsSyncControlMessage,
  validateWsSyncPrincipal
} from './wsSyncSecurity.js';

const SERVER_LOG_LEVEL = (process.env.SQUIRREL_LOG_LEVEL || 'warn').toLowerCase();
const SERVER_INFO_ENABLED = SERVER_LOG_LEVEL === 'info' || SERVER_LOG_LEVEL === 'debug';

// Load environment variables from .env files
const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);
const projectRoot_env = path.resolve(__dirname_env, '..');

function loadEnvFile(filePath, options = {}) {
  const { override = false } = options;
  if (!existsSync(filePath)) return false;

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex === -1) continue;

    const key = line.slice(0, delimiterIndex).trim();
    if (!key) continue;

    let value = line.slice(delimiterIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n');

    if (override || !(key in process.env)) {
      process.env[key] = value;
    }
  }
  return true;
}

// Load .env and .env.local (local overrides main)
loadEnvFile(path.join(projectRoot_env, '.env'));
loadEnvFile(path.join(projectRoot_env, '.env.local'), { override: true });

import {
  startABoxMonitoring,
  stopABoxMonitoring,
  getABoxWatcherHandle,
  getABoxEventBus
} from './aBoxServer.js';
import { createUserAtome, findUserByPhone, findUserById, listAllUsers, updateUserParticle, deleteUserAtome, hashPassword, generateDeterministicUserId, normalizePhone, generateOTP, storeOTP, verifyOTP, sendSMS, enforceAuthIdentityRateLimit } from './auth.js';
import {
  commitAtomeEvent,
  commitAtomeEvents,
  syncAtomeViaWebSocket
} from './atomeRoutes.orm.js';
import { handleShareMessage } from './sharing_message_api.js';
import { buildUserExportZip, inspectUserExportZip, importUserExportZip } from './userExportImport.js';
import { registerMailRoutes } from './mailRoutes.js';
import {
  registerFileUpload,
  getFileMetadata,
  getUserFiles,
  getAccessibleFiles,
  canAccessFile,
  setFilePublic,
  getFileStats
} from './userFiles.js';
import { shareFile, unshareFile } from './user_files_sharing.js';
import { initUserFiles } from './user_files_message_api.js';
import {
  startPolling as startGitHubPolling,
  stopPolling as stopGitHubPolling,
  registerClient,
  unregisterClient,
  getConnectedClients,
  getLocalVersion
} from './githubSync.js';
import { wsSendJson, wsBroadcastJson } from './wsSend.js';
import {
  wsApiConnections,
  wsApiClientsByUserId,
  enqueuePendingConsoleMessage,
  attachWsApiClientToUser,
  detachWsApiClient,
  wsSendJsonToUser,
  wsSendJsonToUserExcept
} from './wsApiState.js';
import {
  inheritPermissionsFromParent,
  broadcastAtomeCreate,
  broadcastAtomeDelete,
  broadcastAtomeRealtimePatch
} from './atomeRealtime.js';
import { executeShellCommand } from './shell.js';
import { ensureUserHome } from './userHome.js';
import { createVisioService } from './visio.js';
import { pushNotificationToUserStack } from './notificationStack.js';
import {
  ensureUserDownloadsDir,
  resolveUserUploadPath,
  resolveUserAssetPath,
  normalizeUserRelativePath,
  resolveUserFilePath,
  sanitizeFileName,
  ensureSharedFileLink,
  removeSharedFileLink
} from './fileStorage.js';
import { lowerFileExtension, replaceFileExtension, shouldServeWebmVideoAsMp4, resolveVideoCacheTarget, transcodeVideoToMp4, ensureVideoPlaybackCache, resolveVideoPlaybackTarget } from './server_media.js';
import { sanitizeUploadId, coerceWsChunkSize, looksLikeRecordingName, looksLikeRecordingType, getAdminSecret, isAdminPasswordValid, getAdminPasswordFromRequest, resolveUserId, pickDisplayName } from './server_utils.js';
import { SERVER_VERSION, EVE_VERSION, loadServerVersion, loadEveVersion, refreshVersionCache, startVersionWatchers } from './server_version.js';
import { logger, logStructured, setLogServer, MINIMAL_LOGS } from './server_logger.js';
import { recentErrors, recordRecentError, isDuplicateWsRequest, isDuplicateAtomeCreate } from './server_dedup.js';
import { uploadsDir, resolveUploadsDir, listUserDownloadsSnapshot, listAnonymousUploads, listUserDownloads, listUploadsForUser, resolveDownloadTarget } from './server_uploads.js';

// Database imports - Using SQLite/libSQL (ADOLE data layer)
import db from '../database/adole.js';
import { v4 as uuidv4 } from 'uuid';

// Check if database is configured (SQLite path or libSQL URL)
const DB_CONFIGURED = Boolean(process.env.SQLITE_PATH || process.env.LIBSQL_URL);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const staticRoot = path.join(projectRoot, 'atome', 'src');
const atomeStaticRoot = path.join(projectRoot, 'atome');
const eveStaticRoot = path.join(projectRoot, 'eVe');
const SERVER_CONFIG_FILE = path.join(projectRoot, 'server_config.json');
const LOG_DIR = path.join(projectRoot, 'logs');
const UPLOADS_TMP_DIR = path.join(projectRoot, 'data', 'uploads_tmp');
const BROWSER_LOG_FILE = path.join(LOG_DIR, 'browser.log');
const RANDOM_WALLPAPER_URL = 'https://picsum.photos/1920/1080';
const RANDOM_WALLPAPER_MAX_BYTES = 12 * 1024 * 1024;
const RANDOM_WALLPAPER_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);
const SNAPSHOT_DIR = path.join(LOG_DIR, 'snapshots');
const UI_TESTS_DIR = path.join(LOG_DIR, 'ui-tests');
const SCHEMA_PATH = path.join(projectRoot, 'database', 'schema.sql');
const SCHEMA_TABLES = 'atomes, particles, particles_versions, snapshots, events, state_current, permissions, sync_queue, sync_state';
let cachedSchemaHash = null;
const TAURI_SYNC_URL = process.env.SQUIRREL_TAURI_URL || process.env.TAURI_URL || 'http://127.0.0.1:3000';
const SYNC_REMOTE_ENABLED = process.env.SQUIRREL_SYNC_REMOTE !== '0';
const SYNC_TARGET_SERVER = 'tauri';
const SYNC_BACKOFF_BASE_MS = Number(process.env.SQUIRREL_SYNC_BACKOFF_MS || 1000);
const SYNC_BACKOFF_MAX_MS = Number(process.env.SQUIRREL_SYNC_BACKOFF_MAX_MS || 60000);
const SYNC_QUEUE_LIMIT = Number(process.env.SQUIRREL_SYNC_BATCH || 50);
const CORS_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];

const buildAllowedCorsOrigins = () => {
  const fromEnv = String(process.env.SQUIRREL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([
    ...fromEnv,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3001',
    'http://localhost:3001',
    'http://tauri.localhost',
    'https://tauri.localhost',
    'tauri://localhost',
    'null'
  ]);
};

const ALLOWED_CORS_ORIGINS = buildAllowedCorsOrigins();

const isAllowedCorsOrigin = (origin) => {
  // When no Origin header is present (same-origin or no-cors requests),
  // return false to prevent @fastify/cors from sending Access-Control-Allow-Origin: *
  // which is invalid when credentials: true is set.
  if (!origin) return false;
  if (ALLOWED_CORS_ORIGINS.has(origin)) return true;
  if (origin === 'null') return true;
  const parsed = new URL(origin);
  const protocol = String(parsed.protocol || '').toLowerCase();
  const hostname = String(parsed.hostname || '').toLowerCase();
  if (protocol === 'tauri:' && hostname === 'localhost') return true;
  if ((protocol === 'http:' || protocol === 'https:') && hostname === 'tauri.localhost') return true;
  return false;
};

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

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    console.warn('[server] invalid JSON payload', { error: error?.message || String(error) });
    return null;
  }
};

const resolveSyncAtomeType = (...candidates) => {
  for (const candidate of candidates) {
    const value = String(candidate == null ? '' : candidate).trim().toLowerCase();
    if (!value || value === 'atome') continue;
    return value;
  }
  return null;
};

const computeBackoffMs = (attempts) => {
  if (!attempts || attempts <= 1) return SYNC_BACKOFF_BASE_MS;
  const next = SYNC_BACKOFF_BASE_MS * Math.pow(2, attempts - 1);
  return Math.min(next, SYNC_BACKOFF_MAX_MS);
};

async function processSyncQueue() {
  if (!SYNC_REMOTE_ENABLED) return;
  const items = await db.listSyncQueue({ target_server: SYNC_TARGET_SERVER, limit: SYNC_QUEUE_LIMIT });
  if (!items || !items.length) return;

  for (const item of items) {
    const attempts = (item.attempts || 0) + 1;
    await db.markSyncQueueSyncing(item.queue_id, attempts);

    const payload = safeJsonParse(item.payload);
    if (!payload || typeof payload !== 'object') {
      await db.markSyncQueueError(item.queue_id, attempts, 'Invalid payload', null, true);
      continue;
    }

    try {
      const response = await sendWsApiRequest(TAURI_SYNC_URL, {
        type: 'events',
        action: 'commit',
        token: process.env.SQUIRREL_SYNC_TOKEN || '',
        sync_source: 'fastify',
        event: payload
      });
      if (response.success === true) {
        await db.markSyncQueueDone(item.queue_id);
        continue;
      }

      const maxAttempts = item.max_attempts || 5;
      const final = attempts >= maxAttempts;
      const retryAt = final ? null : new Date(Date.now() + computeBackoffMs(attempts)).toISOString();
      await db.markSyncQueueError(
        item.queue_id,
        attempts,
        response.error || 'WebSocket sync failed',
        retryAt,
        final
      );
    } catch (error) {
      const maxAttempts = item.max_attempts || 5;
      const final = attempts >= maxAttempts;
      const retryAt = final ? null : new Date(Date.now() + computeBackoffMs(attempts)).toISOString();
      await db.markSyncQueueError(item.queue_id, attempts, error?.message || 'Sync error', retryAt, final);
    }
  }
}

try {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  mkdirSync(UI_TESTS_DIR, { recursive: true });
} catch (error) {
  console.warn('WARN: Unable to prepare log directories:', error?.message || error);
}

const SERVER_TYPE = 'Fastify';
const getSyncEventBus = () => getABoxEventBus();
let fileSyncWatcherHandle = null;

// HTTPS Configuration
let httpsOptions = null;
if (process.env.USE_HTTPS === 'true') {
  // Check multiple locations for certificates
  // 1. Production path (deploy/certs)
  // 2. Local development path (dev/certs)
  const possibleDirs = [
    path.join(projectRoot, 'deploy', 'certs'),
    path.join(projectRoot, 'dev', 'certs'),
    path.join(projectRoot, 'scripts', 'certs'),
    path.join(projectRoot, 'certs')
  ];

  let certConfig = null;

  for (const dir of possibleDirs) {
    // Check for standard names (key.pem, cert.pem) - used by our scripts
    if (existsSync(path.join(dir, 'key.pem')) && existsSync(path.join(dir, 'cert.pem'))) {
      certConfig = {
        key: path.join(dir, 'key.pem'),
        cert: path.join(dir, 'cert.pem')
      };
      break;
    }
    // Check for Let's Encrypt names (privkey.pem, fullchain.pem) - if copied directly
    if (existsSync(path.join(dir, 'privkey.pem')) && existsSync(path.join(dir, 'fullchain.pem'))) {
      certConfig = {
        key: path.join(dir, 'privkey.pem'),
        cert: path.join(dir, 'fullchain.pem')
      };
      break;
    }
  }

  if (certConfig) {
    try {
      console.log(`🔐 Loading HTTPS certificates from: ${path.dirname(certConfig.key)}`);
      httpsOptions = {
        key: readFileSync(certConfig.key),
        cert: readFileSync(certConfig.cert)
      };
      console.log('🔐 HTTPS enabled');
    } catch (e) {
      console.error('❌ Failed to load SSL certificates:', e.message);
    }
  } else {
    console.warn('⚠️ USE_HTTPS is true but no valid certificates found in deploy/certs/, dev/certs/, scripts/certs/, or certs/');
  }
}

// Créer l'instance Fastify
const server = fastify({
  https: httpsOptions,
  bodyLimit: 1024 * 1024 * 1024, // 1 GiB
  loggerInstance: logger,
  disableRequestLogging: true,
  genReqId: (req) => {
    const headerId = req.headers['x-request-id'];
    if (typeof headerId === 'string' && headerId.trim()) return headerId;
    return crypto.randomUUID();
  },
  requestIdLogLabel: 'request_id'
});
setLogServer(server);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
const AUTH_OTP_BYPASS_ENABLED = process.env.NODE_ENV !== 'production' && process.env.SQUIRREL_AUTH_OTP_BYPASS === '1';
const DATABASE_ENABLED = DB_CONFIGURED;
const DB_REQUIRED_MESSAGE = 'Database not configured. Set SQLITE_PATH or LIBSQL_URL/LIBSQL_AUTH_TOKEN.';

function getServerFingerprint() {
  return {
    pid: process.pid,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    argv: process.argv,
    entry: fileURLToPath(import.meta.url),
    projectRoot_env,
    projectRoot,
    staticRoot,
    port: PORT,
    env: {
      NODE_ENV: process.env.NODE_ENV || null,
      USE_HTTPS: process.env.USE_HTTPS || null,
      HOST: process.env.HOST || null,
      PORT: process.env.PORT || null
    },
    started_at: new Date().toISOString()
  };
}

async function startServer() {
  try {
    console.log('🚀 Démarrage du serveur Fastify v5...');
    console.log('🔎 Fastify fingerprint:', JSON.stringify(getServerFingerprint()));

    const replyJson = (reply, statusCode, payload) => {
      reply.code(statusCode);
      return payload;
    };

    // Register CORS first so all routes share the same behavior.
    await server.register(fastifyCors, {
      origin: (origin, callback) => {
        // Pass the origin STRING (not boolean true) so @fastify/cors never
        // falls back to Access-Control-Allow-Origin: * which is forbidden
        // when credentials: true.
        if (origin && isAllowedCorsOrigin(origin)) {
          callback(null, origin);
          return;
        }
        // No Origin header → same-origin or non-browser.  Skip CORS headers
        // entirely to avoid the wildcard + credentials conflict.
        callback(null, false);
      },
      credentials: true,
      methods: CORS_METHODS,
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86400,
      strictPreflight: false
    });

    // Compress dynamic responses (JSON API, etc.). Static assets are already
    // shipped pre-compressed by @fastify/static (preCompressed), so the 1 KB
    // threshold keeps small payloads untouched and only large dynamic bodies
    // are encoded. Brotli preferred, gzip fallback.
    await server.register(fastifyCompress, {
      global: true,
      threshold: 1024,
      encodings: ['br', 'gzip']
    });

    server.addHook('onSend', async (request, reply, payload) => {
      if (String(request.headers['access-control-request-private-network'] || '').toLowerCase() === 'true') {
        reply.header('Access-Control-Allow-Private-Network', 'true');
        reply.header('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method, Access-Control-Request-Private-Network');
      }
      return payload;
    });

    // Always-on diagnostic endpoint (useful in production to confirm which code is running)
    server.get('/__whoami', async () => {
      return {
        success: true,
        type: SERVER_TYPE,
        appVersion: SERVER_VERSION,
        eveVersion: EVE_VERSION,
        fingerprint: getServerFingerprint()
      };
    });

    server.get('/healthz', async () => {
      return {
        success: true,
        type: SERVER_TYPE,
        appVersion: SERVER_VERSION,
        eveVersion: EVE_VERSION,
        uptime_sec: Number(process.uptime().toFixed(2))
      };
    });

    server.addHook('onRequest', async (request, reply) => {
      request.request_id = request.id;
      request._requestStartMs = Date.now();
      reply.header('x-request-id', request.id);
    });

    server.addHook('onResponse', async (request, reply) => {
      if (MINIMAL_LOGS && reply.statusCode < 400) return;
      const durationMs = Date.now() - (request._requestStartMs || Date.now());
      logStructured('info', {
        component: 'http',
        request_id: request.id,
        message: `${request.method} ${request.url} ${reply.statusCode}`,
        data: {
          method: request.method,
          url: request.url,
          status_code: reply.statusCode,
          duration_ms: durationMs
        }
      });
    });

    server.addHook('onError', async (request, reply, error) => {
      const details = {
        timestamp: new Date().toISOString(),
        request_id: request?.id || null,
        method: request?.method,
        url: request?.url,
        status_code: reply?.statusCode,
        message: error?.message || String(error)
      };
      recordRecentError(details);
      logStructured('error', {
        component: 'http',
        request_id: request?.id || null,
        message: details.message,
        data: details
      });
    });

    await refreshVersionCache();
    startVersionWatchers();
    console.log(`📦 Atome version: ${SERVER_VERSION}`);
    console.log(`📦 eVe version: ${EVE_VERSION}`);

    if (uploadsDir) {
      await fs.mkdir(uploadsDir, { recursive: true });
      console.log('📁 uploads directory:', uploadsDir);
    } else {
      console.log('📁 uploads directory: disabled');
    }

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

    // Initialize user files tracking
    await initUserFiles(uploadsDir || 'per-user Downloads');

    if (process.env.SQUIRREL_DISABLE_WATCHER === '1') {
      console.log('🛑 File sync watcher disabled via SQUIRREL_DISABLE_WATCHER=1');
    } else {
      try {
        fileSyncWatcherHandle = startABoxMonitoring({
          projectRoot
        });
        console.log('👀 File sync watcher ready:', fileSyncWatcherHandle.config);
      } catch (error) {
        console.warn('⚠️  Unable to start file sync watcher:', error?.message || error);
      }
    }

    // ===========================
    // 0. DATABASE INITIALIZATION (SQLite/LibSQL - ADOLE v3.0)
    // ===========================

    if (DATABASE_ENABLED) {
      console.log('📊 Initialisation de la base de données SQLite/LibSQL...');

      try {
        await db.initDatabase();
        console.log('✅ Connexion à la base de données établie (SQLite/LibSQL)');
      } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        throw error;
      }

      console.log('✅ Schéma ADOLE v3.0 prêt');
    } else {
      console.warn('⚠️  Aucune base de données configurée. Les routes dépendant de la base renverront 503.');
    }

    // ===========================
    // 1. PLUGINS DE BASE
    // ===========================

    // Serve framework and product roots explicitly; the main app still boots from atome/src.
    // preCompressed serves a sibling .br/.gz when the client accepts it (e.g. the renderer
    // WASM), and transparently falls back to the plain file when no variant exists.
    await server.register(fastifyStatic, {
      root: atomeStaticRoot,
      prefix: '/atome/',
      decorateReply: false,
      preCompressed: true
    });

    await server.register(fastifyStatic, {
      root: eveStaticRoot,
      prefix: '/eVe/',
      decorateReply: false,
      preCompressed: true
    });

    await server.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/src/',
      decorateReply: false,
      preCompressed: true
    });

    // Servir les fichiers statiques depuis staticRoot (../atome/src en dev)
    await server.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
      preCompressed: true
    });

    // WebSocket natif Fastify v5
    await server.register(fastifyWebsocket);

    server.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => {
      done(null, body);
    });

    // ===========================
    // 2. ROUTES API
    // ===========================

    const getRequiredJwtSecret = () => {
        const secret = String(process.env.JWT_SECRET || '').trim();
        if (secret.length < 32) {
          throw new Error('JWT_SECRET must be configured with at least 32 characters');
        }
        return secret;
      };

    // Helper function to validate token (for sharing routes)
    // SECURITY: always verify JWT signatures (never trust base64-decoded payload).
    const validateToken = async (request) => {
      const syncToken = process.env.SQUIRREL_SYNC_TOKEN;
      const headerSyncToken = request.headers['x-sync-token'];
      if (syncToken && headerSyncToken && headerSyncToken === syncToken) {
        const headerUserId = request.headers['x-user-id'] || request.headers['x-userid'];
        return {
          sub: headerUserId || 'sync',
          id: headerUserId || 'sync',
          userId: headerUserId || 'sync',
          username: 'sync',
          phone: null
        };
      }

      const verifyJwt = async (token, options = {}) => {
        if (!token) return null;

        if (server.jwt && typeof server.jwt.verify === 'function') {
          return server.jwt.verify(token, options);
        }

        const jwt = await import('jsonwebtoken');
        return jwt.default.verify(token, getRequiredJwtSecret(), options);
      };

      // Try Bearer token first
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          return await verifyJwt(token);
        } catch (error) {
          request.log.warn({ err: error }, 'Bearer token validation failed');
          return null;
        }
      }

      // Try cookie
      const cookieToken = request.cookies?.access_token;
      if (cookieToken) {
        try {
          return await verifyJwt(cookieToken);
        } catch (error) {
          request.log.warn({ err: error }, 'Cookie token validation failed');
          return null;
        }
      }

      return null;
    };

    const getHeaderValue = (request, headerName) => {
      const raw = request.headers?.[headerName];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text || null;
    };

    const shouldStoreInRecordings = (fileName, atomeType) => {
      if (looksLikeRecordingType(atomeType)) return true;
      if (atomeType) return false;
      return looksLikeRecordingName(fileName);
    };

    const resolveRecordingUploadPath = async ({ fileName, userId, user }) => {
      const safeName = sanitizeFileName(fileName || 'recording.bin');
      const relative = path.join('recordings', safeName);
      const resolved = await resolveUserAssetPath(
        projectRoot,
        { id: userId, username: user?.username },
        relative
      );
      return {
        fileName: safeName || resolved.fileName,
        filePath: resolved.filePath,
        relativePath: resolved.relativePath
      };
    };

    const resolveUserFromHeaders = (request) => {
      const userId = getHeaderValue(request, 'x-user-id') || getHeaderValue(request, 'x-userid');
      const username = getHeaderValue(request, 'x-username') || getHeaderValue(request, 'x-user-name');
      const phone = getHeaderValue(request, 'x-phone') || getHeaderValue(request, 'x-user-phone');
      if (!userId && !username && !phone) return null;
      return {
        id: userId || null,
        user_id: userId || null,
        username: username || null,
        phone: phone || null
      };
    };

    const normalizeUploadResolvedUser = (user = null) => {
      if (!user || typeof user !== 'object') return null;
      const userId = String(user.user_id || user.userId || user.id || '').trim();
      if (!userId) return null;
      return {
        id: userId,
        user_id: userId,
        username: user.username || user.name || null,
        phone: user.phone || null
      };
    };

    const resolvePersistedUploadUserFromHeaders = async (headerUser = null) => {
      if (!headerUser || typeof headerUser !== 'object' || DATABASE_ENABLED !== true) return null;
      const dataSource = db.getDataSourceAdapter?.();
      if (!dataSource) return null;

      const normalizedPhone = normalizePhone(headerUser.phone || '');
      if (normalizedPhone) {
        const byPhone = await findUserByPhone(dataSource, normalizedPhone);
        const normalizedByPhone = normalizeUploadResolvedUser(byPhone);
        if (normalizedByPhone) return normalizedByPhone;
      }

      const headerUserId = String(headerUser.id || headerUser.user_id || headerUser.userId || '').trim();
      if (headerUserId) {
        const byId = await findUserById(dataSource, headerUserId);
        const normalizedById = normalizeUploadResolvedUser(byId);
        if (normalizedById) return normalizedById;
      }

      return null;
    };

    const resolveUploadIdentity = async (request) => {
      const tokenUser = await validateToken(request);
      if (tokenUser) {
        return { user: tokenUser, userId: resolveUserId(tokenUser), source: 'token' };
      }
      const headerUser = resolveUserFromHeaders(request);
      if (headerUser) {
        const persistedUser = await resolvePersistedUploadUserFromHeaders(headerUser);
        if (persistedUser) {
          return { user: persistedUser, userId: resolveUserId(persistedUser), source: 'headers_resolved' };
        }
        return { user: headerUser, userId: resolveUserId(headerUser), source: 'headers' };
      }
      return { user: null, userId: 'anonymous', source: 'anonymous' };
    };

    const readMediaQueryUserId = (request) => {
      const raw = request.query?.media_user_id
        || request.query?.user_id
        || request.query?.userId
        || request.query?.x_user_id
        || '';
      const value = Array.isArray(raw) ? raw[0] : raw;
      const userId = String(value || '').trim();
      if (!userId || userId === 'anonymous') return '';
      return /^[a-zA-Z0-9_-]+$/.test(userId) ? userId : '';
    };

    const resolveMediaDownloadIdentity = async (request) => {
      const identity = await resolveUploadIdentity(request);
      if (identity.userId && identity.userId !== 'anonymous') return identity;
      const queryUserId = readMediaQueryUserId(request);
      if (queryUserId) return { user: null, userId: queryUserId, source: 'media_query' };
      return identity;
    };

    registerMailRoutes(server);

    const visioService = createVisioService({
      databaseEnabled: DATABASE_ENABLED,
      jwtSecret: process.env.JWT_SECRET,
      logger: server.log
    });
    visioService.registerRoutes(server);
    visioService.registerWebsocket(server, { path: '/ws/visio' });

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
    server.get('/health', async () => {
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

    server.post('/api/uploads', async (request, reply) => {
      try {
        const { user, userId } = await resolveUploadIdentity(request);

        const headerValue = Array.isArray(request.headers['x-filename'])
          ? request.headers['x-filename'][0]
          : request.headers['x-filename'];
        const pathHeader = Array.isArray(request.headers['x-file-path'])
          ? request.headers['x-file-path'][0]
          : request.headers['x-file-path'];
        const atomeTypeHeader = getHeaderValue(request, 'x-atome-type');
        const mimeHeader = getHeaderValue(request, 'x-mime-type') || request.headers['content-type'] || null;

        if (!headerValue && !pathHeader) {
          reply.code(400);
          return { success: false, error: 'Missing X-Filename header' };
        }

        const decodedName = headerValue ? decodeURIComponent(String(headerValue)) : '';

        const bodyBuffer = request.body;
        if (!bodyBuffer || !(bodyBuffer instanceof Buffer) || !bodyBuffer.length) {
          reply.code(400);
          return { success: false, error: 'Empty upload body' };
        }

        let fileName = decodedName;
        let filePath = null;
        let relativePath = null;

        if (pathHeader) {
          const rawPath = Array.isArray(pathHeader) ? pathHeader[0] : pathHeader;
          const normalizedRelative = normalizeUserRelativePath(rawPath, userId);
          const resolved = await resolveUserAssetPath(
            projectRoot,
            { id: userId, username: user?.username },
            normalizedRelative
          );
          fileName = fileName || resolved.fileName;
          filePath = resolved.filePath;
          relativePath = resolved.relativePath;
        } else if (shouldStoreInRecordings(decodedName, atomeTypeHeader)) {
          const resolved = await resolveRecordingUploadPath({
            fileName: decodedName || 'recording.bin',
            userId,
            user
          });
          fileName = resolved.fileName;
          filePath = resolved.filePath;
          relativePath = resolved.relativePath;
        } else {
          const resolved = await resolveUserUploadPath(
            projectRoot,
            { id: userId, username: user?.username },
            decodedName || 'upload.bin'
          );
          fileName = resolved.fileName;
          filePath = resolved.filePath;
          relativePath = path.join('Downloads', resolved.fileName);
        }

        await fs.writeFile(filePath, bodyBuffer);

        if (DATABASE_ENABLED) {
          // Register file ownership
          const atomeIdHeader = Array.isArray(request.headers['x-atome-id'])
            ? request.headers['x-atome-id'][0]
            : request.headers['x-atome-id'];
          const originalNameHeader = Array.isArray(request.headers['x-original-name'])
            ? request.headers['x-original-name'][0]
            : request.headers['x-original-name'];

          const registration = await registerFileUpload(fileName, userId, {
            atome_id: atomeIdHeader || null,
            atome_type: atomeTypeHeader || null,
            original_name: originalNameHeader || decodedName || fileName,
            mime_type: mimeHeader || null,
            size_bytes: bodyBuffer.length,
            file_path: relativePath || null
          });
          if (!registration?.success) {
            await fs.rm(filePath, { force: true });
            reply.code(500);
            return { success: false, error: registration?.error || 'file_registration_failed' };
          }
        }

        return { success: true, file_name: fileName, owner_id: userId, file_path: relativePath || null };
      } catch (error) {
        request.log.error({ err: error }, 'File upload failed');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/uploads/remote-wallpaper', async (request, reply) => {
      try {
        const { user, userId } = await resolveUploadIdentity(request);
        const upstream = await fetch(RANDOM_WALLPAPER_URL, {
          method: 'GET',
          headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' }
        });
        if (!upstream.ok) {
          reply.code(502);
          return { success: false, error: `wallpaper_source_http_${upstream.status}` };
        }

        const mimeType = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const extension = RANDOM_WALLPAPER_EXTENSIONS.get(mimeType);
        if (!extension) {
          reply.code(415);
          return { success: false, error: 'wallpaper_source_not_image' };
        }

        const contentLength = Number(upstream.headers.get('content-length') || 0);
        if (Number.isFinite(contentLength) && contentLength > RANDOM_WALLPAPER_MAX_BYTES) {
          reply.code(413);
          return { success: false, error: 'wallpaper_source_too_large' };
        }

        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (!bytes.length) {
          reply.code(502);
          return { success: false, error: 'wallpaper_source_empty' };
        }
        if (bytes.length > RANDOM_WALLPAPER_MAX_BYTES) {
          reply.code(413);
          return { success: false, error: 'wallpaper_source_too_large' };
        }

        const resolved = await resolveUserUploadPath(
          projectRoot,
          { id: userId, username: user?.username },
          `wallpaper_${Date.now()}${extension}`
        );
        await fs.writeFile(resolved.filePath, bytes);
        const relativePath = path.join('Downloads', resolved.fileName);

        if (DATABASE_ENABLED) {
          const registration = await registerFileUpload(resolved.fileName, userId, {
            atome_id: null,
            atome_type: 'image',
            original_name: resolved.fileName,
            mime_type: mimeType,
            size_bytes: bytes.length,
            file_path: relativePath
          });
          if (!registration?.success) {
            await fs.rm(resolved.filePath, { force: true });
            reply.code(500);
            return { success: false, error: registration?.error || 'file_registration_failed' };
          }
        }

        return {
          success: true,
          file_name: resolved.fileName,
          owner_id: userId,
          file_path: relativePath,
          mime_type: mimeType,
          size_bytes: bytes.length,
          source: 'remote_wallpaper'
        };
      } catch (error) {
        request.log.error({ err: error }, 'Remote wallpaper download failed');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/uploads/chunk', async (request, reply) => {
      try {
        const { userId } = await resolveUploadIdentity(request);

        const headerValue = Array.isArray(request.headers['x-filename'])
          ? request.headers['x-filename'][0]
          : request.headers['x-filename'];
        const pathHeader = Array.isArray(request.headers['x-file-path'])
          ? request.headers['x-file-path'][0]
          : request.headers['x-file-path'];
        if (!headerValue) {
          reply.code(400);
          return { success: false, error: 'Missing X-Filename header' };
        }

        const uploadIdHeader = Array.isArray(request.headers['x-upload-id'])
          ? request.headers['x-upload-id'][0]
          : request.headers['x-upload-id'];
        const safeUploadId = sanitizeUploadId(uploadIdHeader);
        if (!safeUploadId) {
          reply.code(400);
          return { success: false, error: 'Missing or invalid X-Upload-Id header' };
        }

        const chunkIndexRaw = Array.isArray(request.headers['x-chunk-index'])
          ? request.headers['x-chunk-index'][0]
          : request.headers['x-chunk-index'];
        const chunkCountRaw = Array.isArray(request.headers['x-chunk-count'])
          ? request.headers['x-chunk-count'][0]
          : request.headers['x-chunk-count'];
        const chunkIndex = Number.parseInt(chunkIndexRaw, 10);
        const chunkCount = Number.parseInt(chunkCountRaw, 10);
        if (!Number.isFinite(chunkIndex) || chunkIndex < 0 || !Number.isFinite(chunkCount) || chunkCount < 1) {
          reply.code(400);
          return { success: false, error: 'Invalid chunk index/count' };
        }

        const decodedName = decodeURIComponent(String(headerValue));

        const bodyBuffer = request.body;
        if (!bodyBuffer || !(bodyBuffer instanceof Buffer) || !bodyBuffer.length) {
          reply.code(400);
          return { success: false, error: 'Empty upload body' };
        }

        await fs.mkdir(UPLOADS_TMP_DIR, { recursive: true, mode: 0o700 });
        const uploadDir = path.join(UPLOADS_TMP_DIR, safeUploadId);
        await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });

        const chunkPath = path.join(uploadDir, `${chunkIndex}.part`);
        await fs.writeFile(chunkPath, bodyBuffer);

        return {
          success: true,
          uploadId: safeUploadId,
          chunkIndex,
          chunkCount,
          owner: userId,
          file: sanitizeFileName(decodedName)
        };
      } catch (error) {
        request.log.error({ err: error }, 'Chunk upload failed');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/uploads/complete', async (request, reply) => {
      try {
        const { user, userId } = await resolveUploadIdentity(request);

        const headerValue = Array.isArray(request.headers['x-filename'])
          ? request.headers['x-filename'][0]
          : request.headers['x-filename'];
        const pathHeader = Array.isArray(request.headers['x-file-path'])
          ? request.headers['x-file-path'][0]
          : request.headers['x-file-path'];
        const atomeTypeHeader = getHeaderValue(request, 'x-atome-type');
        const mimeHeader = getHeaderValue(request, 'x-mime-type') || request.headers['content-type'] || null;
        if (!headerValue) {
          reply.code(400);
          return { success: false, error: 'Missing X-Filename header' };
        }

        const uploadIdHeader = Array.isArray(request.headers['x-upload-id'])
          ? request.headers['x-upload-id'][0]
          : request.headers['x-upload-id'];
        const safeUploadId = sanitizeUploadId(uploadIdHeader);
        if (!safeUploadId) {
          reply.code(400);
          return { success: false, error: 'Missing or invalid X-Upload-Id header' };
        }

        const chunkCountRaw = Array.isArray(request.headers['x-chunk-count'])
          ? request.headers['x-chunk-count'][0]
          : request.headers['x-chunk-count'];
        const chunkCount = Number.parseInt(chunkCountRaw, 10);
        if (!Number.isFinite(chunkCount) || chunkCount < 1) {
          reply.code(400);
          return { success: false, error: 'Invalid chunk count' };
        }

        const decodedName = decodeURIComponent(String(headerValue));

        const uploadDir = path.join(UPLOADS_TMP_DIR, safeUploadId);
        let fileName = decodedName;
        let filePath = null;
        let relativePath = null;

        if (pathHeader) {
          const rawPath = Array.isArray(pathHeader) ? pathHeader[0] : pathHeader;
          const normalizedRelative = normalizeUserRelativePath(rawPath, userId);
          const resolved = await resolveUserAssetPath(
            projectRoot,
            { id: userId, username: user?.username },
            normalizedRelative
          );
          fileName = fileName || resolved.fileName;
          filePath = resolved.filePath;
          relativePath = resolved.relativePath;
        } else if (shouldStoreInRecordings(decodedName, atomeTypeHeader)) {
          const resolved = await resolveRecordingUploadPath({
            fileName: decodedName || 'recording.bin',
            userId,
            user
          });
          fileName = resolved.fileName;
          filePath = resolved.filePath;
          relativePath = resolved.relativePath;
        } else {
          const resolved = await resolveUserUploadPath(
            projectRoot,
            { id: userId, username: user?.username },
            decodedName
          );
          fileName = resolved.fileName;
          filePath = resolved.filePath;
          relativePath = path.join('Downloads', resolved.fileName);
        }

        const output = createWriteStream(filePath, { flags: 'w' });
        for (let idx = 0; idx < chunkCount; idx += 1) {
          const chunkPath = path.join(uploadDir, `${idx}.part`);
          await new Promise((resolve, reject) => {
            const input = createReadStream(chunkPath);
            input.on('error', reject);
            input.on('end', resolve);
            input.pipe(output, { end: false });
          });
        }

        await new Promise((resolve, reject) => {
          output.on('error', reject);
          output.end(resolve);
        });

        await fs.rm(uploadDir, { recursive: true, force: true });
        await ensureVideoPlaybackCache(filePath, fileName, mimeHeader || '');

        if (DATABASE_ENABLED) {
          const mimeType = mimeHeader || null;
          const atomeIdHeader = getHeaderValue(request, 'x-atome-id');
          const stats = await fs.stat(filePath);
          const registration = await registerFileUpload(fileName, userId, {
            atome_id: atomeIdHeader || null,
            atome_type: atomeTypeHeader || null,
            original_name: decodedName,
            mime_type: mimeType || null,
            size_bytes: stats.size,
            file_path: relativePath || null
          });
          if (!registration?.success) {
            await fs.rm(filePath, { force: true });
            reply.code(500);
            return { success: false, error: registration?.error || 'file_registration_failed' };
          }
        }

        return { success: true, file_name: fileName, owner_id: userId, file_path: relativePath || null };
      } catch (error) {
        request.log.error({ err: error }, 'Chunked upload finalize failed');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    // =========================================================================
    // USER FILES ROUTES - Get files with ownership filtering
    // =========================================================================

    // Get my files (files I own)
    server.get('/api/files/my-files', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const userId = resolveUserId(user);
      const files = await getUserFiles(userId);

      return { success: true, data: files, count: files.length };
    });

    // Get all accessible files (owned + shared)
    server.get('/api/files/accessible', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const userId = resolveUserId(user);
      const files = await getAccessibleFiles(userId);

      return { success: true, data: files, count: files.length };
    });

    // Share a file
    server.post('/api/files/share', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const { file_id, atome_id, file_name, target_user_id, permission } = request.body || {};
      const fileIdentifier = file_id || atome_id || file_name;

      if (!fileIdentifier || !target_user_id) {
        return replyJson(reply, 400, { success: false, error: 'Missing file identifier or target_user_id' });
      }

      const userId = resolveUserId(user);
      const result = await shareFile(fileIdentifier, userId, target_user_id, permission || 'read');

      if (!result.success) {
        return replyJson(reply, 403, result);
      }

      if (result.file?.file_name) {
        const link = await ensureSharedFileLink({
          projectRoot,
          owner_id: result.file.owner_id,
          targetUserId: target_user_id,
          fileName: result.file.file_name
        });
        if (!link.ok) {
          result.link_warning = link.error || 'Shared link not created';
        } else {
          result.link = link;
        }
      }

      return result;
    });

    // Unshare a file
    server.post('/api/files/unshare', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const { file_id, atome_id, file_name, target_user_id } = request.body || {};
      const fileIdentifier = file_id || atome_id || file_name;

      if (!fileIdentifier || !target_user_id) {
        return replyJson(reply, 400, { success: false, error: 'Missing file identifier or target_user_id' });
      }

      const userId = resolveUserId(user);
      const result = await unshareFile(fileIdentifier, userId, target_user_id);

      if (!result.success) {
        return replyJson(reply, 403, result);
      }

      if (result.file?.file_name) {
        const link = await removeSharedFileLink({
          projectRoot,
          owner_id: result.file.owner_id,
          targetUserId: target_user_id,
          fileName: result.file.file_name
        });
        if (!link.ok) {
          result.link_warning = link.error || 'Shared link not removed';
        } else {
          result.link = link;
        }
      }

      return result;
    });

    // Set file public/private
    server.post('/api/files/visibility', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      const { file_id, atome_id, file_name, is_public } = request.body || {};
      const fileIdentifier = file_id || atome_id || file_name;

      if (!fileIdentifier || typeof is_public !== 'boolean') {
        return replyJson(reply, 400, { success: false, error: 'Missing file identifier or is_public' });
      }

      const userId = resolveUserId(user);
      const meta = await getFileMetadata(fileIdentifier, { owner_id: userId });
      if (!meta) {
        return replyJson(reply, 404, { success: false, error: 'File not found' });
      }

      const result = await setFilePublic(meta.atome_id, userId, is_public);

      if (!result.success) {
        return replyJson(reply, 403, result);
      }

      return result;
    });

    // Get file stats (admin)
    server.get('/api/files/stats', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
      }

      if (!isAdminPasswordValid(getAdminPasswordFromRequest(request))) {
        return replyJson(reply, 403, { success: false, error: 'admin_required' });
      }

      const stats = await getFileStats();

      return { success: true, data: stats };
    });

    // Export user data (admin for multi-user)
    server.post('/api/admin/users/export', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      const adminPassword = getAdminPasswordFromRequest(request);
      let adminBypass = false;
      let user = await validateToken(request);
      if (!user) {
        if (isAdminPasswordValid(adminPassword)) {
          adminBypass = true;
          user = { id: 'admin', user_id: 'admin', sub: 'admin', username: 'admin' };
        } else {
          return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
        }
      }

      const payload = request.body || {};
      const requested = Array.isArray(payload.users) ? payload.users : [];
      const dataSource = db.getDataSourceAdapter();
      request.log.info({
        route: '/api/admin/users/export',
        requester: resolveUserId(user),
        requestedCount: requested.length,
        format: payload.format || 'zip',
        includeFiles: payload.include_files !== false,
        adminBypass
      }, '[Export] Request received');

      const resolveRequestedUserId = async (entry) => {
        if (!entry) return null;
        let id = null;
        let phone = null;
        if (typeof entry === 'object') {
          id = entry.user_id || entry.userId || entry.id || null;
          phone = entry.phone || entry.user_phone || entry.userPhone || null;
        } else {
          id = String(entry);
        }

        const phoneCandidate = phone || (typeof id === 'string' && /^[+0-9]{6,}$/.test(id) ? id : null);
        if (phoneCandidate) {
          const normalized = normalizePhone(phoneCandidate);
          if (normalized) {
            const found = await findUserByPhone(dataSource, normalized);
            if (found?.user_id) return found.user_id;
            return null;
          }
        }

        if (!id) return null;
        const found = await findUserById(dataSource, String(id));
        return found?.user_id || null;
      };

      let userIds = [];
      if (requested.length > 0) {
        for (const entry of requested) {
          const resolved = await resolveRequestedUserId(entry);
          if (!resolved) {
            return replyJson(reply, 404, { success: false, error: 'user_not_found' });
          }
          userIds.push(resolved);
        }
      } else {
        const currentUserId = resolveUserId(user);
        userIds = [currentUserId];
      }

      const currentUserId = resolveUserId(user);
      const uniqueUserIds = Array.from(new Set(userIds));
      const requiresAdmin = uniqueUserIds.length > 1 || uniqueUserIds.some((id) => id !== currentUserId);
      const isAdmin = adminBypass || isAdminPasswordValid(adminPassword);
      if (requiresAdmin && !isAdmin) {
        request.log.warn({
          route: '/api/admin/users/export',
          requester: currentUserId,
          requiresAdmin,
          userCount: uniqueUserIds.length
        }, '[Export] Admin password required');
        return replyJson(reply, 403, { success: false, error: 'admin_required' });
      }

      try {
        const includeFiles = payload.include_files !== false;
        const exportResult = await buildUserExportZip({
          projectRoot,
          dataSource,
          userIds: uniqueUserIds,
          includeFiles
        });

        if (!exportResult?.buffer) {
          request.log.error({
            route: '/api/admin/users/export',
            requester: currentUserId
          }, '[Export] Export failed (no buffer)');
          return replyJson(reply, 500, { success: false, error: 'export_failed' });
        }

        const format = String(payload.format || 'zip').toLowerCase();
        if (format !== 'zip') {
          if (format !== 'json') {
            return replyJson(reply, 400, { success: false, error: 'unsupported_format' });
          }
          request.log.info({
            route: '/api/admin/users/export',
            requester: currentUserId,
            userCount: uniqueUserIds.length,
            tableCounts: exportResult.manifest?.tables || {}
          }, '[Export] JSON response');
          return {
            success: true,
            manifest: exportResult.manifest,
            tables: exportResult.tables
          };
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `eve_users_export_${timestamp}.zip`;
        request.log.info({
          route: '/api/admin/users/export',
          requester: currentUserId,
          userCount: uniqueUserIds.length,
          filename
        }, '[Export] Zip response');
        reply.header('Content-Type', 'application/zip');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        return reply.send(exportResult.buffer);
      } catch (error) {
        request.log.error({ err: error }, 'User export failed');
        return reply.code(500).send({ success: false, error: error?.message || 'export_failed' });
      }
    });

    // Import user data from zip (admin for multi-user)
    server.post('/api/admin/users/import', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      const adminPassword = getAdminPasswordFromRequest(request);
      let adminBypass = false;
      let user = await validateToken(request);
      if (!user) {
        if (isAdminPasswordValid(adminPassword)) {
          adminBypass = true;
          user = { id: 'admin', user_id: 'admin', sub: 'admin', username: 'admin' };
        } else {
          return replyJson(reply, 401, { success: false, error: 'Unauthorized' });
        }
      }

      const body = request.body;
      if (!body || !Buffer.isBuffer(body)) {
        return replyJson(reply, 400, { success: false, error: 'invalid_payload' });
      }

      request.log.info({
        route: '/api/admin/users/import',
        requester: resolveUserId(user),
        bytes: body.length,
        adminBypass
      }, '[Import] Request received');

      const inspect = inspectUserExportZip(body);
      const users = Array.isArray(inspect?.users) ? inspect.users : [];
      const currentUserId = resolveUserId(user);
      const requiresAdmin = users.length !== 1 || users[0] !== currentUserId;
      const isAdmin = adminBypass || isAdminPasswordValid(adminPassword);
      if (requiresAdmin && !isAdmin) {
        request.log.warn({
          route: '/api/admin/users/import',
          requester: currentUserId,
          requiresAdmin,
          userCount: users.length
        }, '[Import] Admin password required');
        return replyJson(reply, 403, { success: false, error: 'admin_required' });
      }

      try {
        const dataSource = db.getDataSourceAdapter();
        const result = await importUserExportZip({
          projectRoot,
          dataSource,
          zipBuffer: body
        });

        request.log.info({
          route: '/api/admin/users/import',
          requester: currentUserId,
          userCount: users.length,
          tables: result?.tables || {},
          filesWritten: result?.files_written || 0
        }, '[Import] Completed');
        return {
          success: true,
          users,
          ...result
        };
      } catch (error) {
        request.log.error({ err: error }, 'User import failed');
        return reply.code(500).send({ success: false, error: error?.message || 'import_failed' });
      }
    });

    console.warn('[Admin] Routes registered: POST /api/admin/users/export, POST /api/admin/users/import');

    // User management is handled by typed auth actions on /ws/api.
    // which use the ADOLE v3.0 schema (atomes + particles tables)

    server.get('/api/uploads', async (request, reply) => {
      try {
        const { userId } = await resolveUploadIdentity(request);
        const files = await listUploadsForUser(userId);
        return { success: true, files };
      } catch (error) {
        request.log.error({ err: error }, 'Unable to list uploads');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.get('/api/uploads/:file', async (request, reply) => {
      try {
        const { userId } = await resolveMediaDownloadIdentity(request);
        const fileParam = request.params.file || '';
        const target = await resolveDownloadTarget(fileParam, userId);

        if (!target?.filePath) {
          const status = target?.status || 404;
          if (status === 403) {
            console.warn('[Uploads] Forbidden download', { userId, fileParam });
          }
          reply.code(status);
          return { success: false, error: target?.error || 'File not found' };
        }

        const playbackTarget = await resolveVideoPlaybackTarget(target);
        await fs.access(playbackTarget.filePath);
        const stat = await fs.stat(playbackTarget.filePath);
        const totalSize = stat.size;
        const ext = path.extname(playbackTarget.filePath).toLowerCase();

        // Resolve MIME type: DB metadata > extension lookup > logLine
        const MEDIA_MIME_TYPES = {
          '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
          '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
          '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
          '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
          '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
          '.pdf': 'application/pdf', '.json': 'application/json',
        };
        const mimeType = playbackTarget.mimeType || target.meta?.mime_type || MEDIA_MIME_TYPES[ext] || 'application/octet-stream';

        reply.header('Content-Type', mimeType);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Content-Disposition', `inline; filename="${playbackTarget.downloadName || target.downloadName}"`);
        reply.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

        // HTTP Range support for media seeking
        const rangeHeader = request.headers.range;
        if (rangeHeader) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(String(rangeHeader));
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
            if (start >= totalSize || end >= totalSize || start > end) {
              reply.code(416);
              reply.header('Content-Range', `bytes */${totalSize}`);
              return reply.send('');
            }
            reply.code(206);
            reply.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
            reply.header('Content-Length', end - start + 1);
            return reply.send(createReadStream(playbackTarget.filePath, { start, end }));
          }
        }

        reply.header('Content-Length', totalSize);
        return reply.send(createReadStream(playbackTarget.filePath));
      } catch (error) {
        request.log.error({ err: error }, 'Unable to download upload');
        const status = error?.status || 404;
        reply.code(status);
        return { success: false, error: error?.error || error?.message || 'File not found' };
      }
    });

    server.get('/api/recordings/:file', async (request, reply) => {
      try {
        const { userId } = await resolveMediaDownloadIdentity(request);
        const fileParam = request.params.file || '';
        const target = await resolveDownloadTarget(fileParam, userId);

        if (!target?.filePath) {
          const status = target?.status || 404;
          reply.code(status);
          return { success: false, error: target?.error || 'Recording not found' };
        }

        const playbackTarget = await resolveVideoPlaybackTarget(target);
        await fs.access(playbackTarget.filePath);
        const stat = await fs.stat(playbackTarget.filePath);
        const totalSize = stat.size;
        const ext = path.extname(playbackTarget.filePath).toLowerCase();
        const mediaMimeTypes = {
          '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
          '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
          '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
          '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
          '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'
        };
        const mimeType = playbackTarget.mimeType || target.meta?.mime_type || mediaMimeTypes[ext] || 'application/octet-stream';

        reply.header('Content-Type', mimeType);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Content-Disposition', `inline; filename="${playbackTarget.downloadName || target.downloadName}"`);
        reply.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

        const rangeHeader = request.headers.range;
        if (rangeHeader) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(String(rangeHeader));
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
            if (start >= totalSize || end >= totalSize || start > end) {
              reply.code(416);
              reply.header('Content-Range', `bytes */${totalSize}`);
              return reply.send('');
            }
            reply.code(206);
            reply.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
            reply.header('Content-Length', end - start + 1);
            return reply.send(createReadStream(playbackTarget.filePath, { start, end }));
          }
        }

        reply.header('Content-Length', totalSize);
        return reply.send(createReadStream(playbackTarget.filePath));
      } catch (error) {
        request.log.error({ err: error }, 'Unable to download recording');
        const status = error?.status || 404;
        reply.code(status);
        return { success: false, error: error?.error || error?.message || 'Recording not found' };
      }
    });

    // Audio extraction from video containers (FFmpeg)
    // WebKit/WKWebView cannot decode audio from .mov/.m4v containers via decodeAudioData.
    // This endpoint extracts the audio track to .m4a (AAC in MP4 container) that all browsers support.
    server.get('/api/extract-audio/:file', async (request, reply) => {
      try {
        const { userId } = await resolveMediaDownloadIdentity(request);
        const fileParam = request.params.file || '';
        const target = await resolveDownloadTarget(fileParam, userId);

        if (!target?.filePath) {
          const status = target?.status || 404;
          reply.code(status);
          return { success: false, error: target?.error || 'Source file not found' };
        }

        await fs.access(target.filePath);

        const ext = path.extname(target.filePath).toLowerCase();
        const videoExtensions = ['.mov', '.m4v', '.mp4', '.avi', '.mkv', '.webm'];
        if (!videoExtensions.includes(ext)) {
          reply.code(400);
          return { success: false, error: 'Not a video file' };
        }

        const cacheDir = path.join(path.dirname(target.filePath), '.audio_cache');
        if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

        const baseName = path.basename(target.filePath, ext);
        const cachedAudio = path.join(cacheDir, `${baseName}.aac.m4a`);

        const cacheExists = existsSync(cachedAudio);
        if (!cacheExists) {
          await new Promise((resolve, reject) => {
            execFile('ffmpeg', [
              '-v', 'error',
              '-y',
              '-i', target.filePath,
              '-vn',
              '-map', '0:a:0',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ac', '2',
              '-ar', '48000',
              '-movflags', '+faststart',
              cachedAudio
            ], { timeout: 60000 }, (error, _stdout, stderr) => {
              if (error) {
                const msg = String(stderr || error.message || 'ffmpeg_failed').slice(0, 200);
                reject(new Error(`ffmpeg_extract_failed: ${msg}`));
              } else {
                resolve();
              }
            });
          });
        }

        await fs.access(cachedAudio);
        const stat = await fs.stat(cachedAudio);
        reply.header('Content-Type', 'audio/mp4');
        reply.header('Content-Length', stat.size);
        reply.header('Accept-Ranges', 'bytes');
        return reply.send(createReadStream(cachedAudio));
      } catch (error) {
        request.log.error({ err: error }, 'Audio extraction failed');
        reply.code(500);
        return { success: false, error: error?.message || 'Audio extraction failed' };
      }
    });

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

    // ===========================
    // 3. WEBSOCKET NATIF
    // ===========================

    // Route WebSocket pour API calls (replaces HTTP fetch)
    server.register(async function (fastify) {
      fastify.get('/ws/api', { websocket: true }, async (connection, request) => {
        // Assign a stable connection id for audit/debugging (server-side only)
        try {
          const crypto = await import('crypto');
          connection._wsApiConnectionId = crypto.randomUUID();
        } catch (error) {
          console.warn("[server] operation failed", error);
          connection._wsApiConnectionId = `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        }

        if (process.env.WS_CONNECTION_DEBUG === '1') {
          console.log('🔗 New WebSocket API connection');
        }

        try { wsApiConnections.add(connection); } catch (error) {
          console.warn("[server] operation failed", error);
        }

        try {
          const requestUser = await validateToken(request);
          const requestUserId = resolveUserId(requestUser);
          if (requestUserId) {
            attachWsApiClientToUser(connection, requestUserId);
            if (requestUser && typeof requestUser.exp === 'number') {
              connection._wsApiAuthExpMs = requestUser.exp * 1000;
            }
          }
        } catch (error) {
          console.warn("[server] operation failed", error);
        }

        const unknownMessageTypesSeen = new Set();

        const safeSend = (payload) => wsSendJson(connection, payload, { scope: 'ws/api', op: 'reply' });

        connection.on('message', async (message) => {
          let data;
          try {
            data = JSON.parse(message.toString());
          } catch (e) {
            safeSend({ type: 'error', message: 'Invalid JSON' });
            return;
          }

          const atomeOperationResponse = await handleWsAtomeOperation(data, connection);
          if (atomeOperationResponse) {
            safeSend(atomeOperationResponse);
            return;
          }

          // Debug: broadcast probe (no auth) - echoes to ALL ws/api clients
          // if (data && data.type === 'broadcast-probe') {
          //   const nowIso = new Date().toISOString();
          //   const payload = {
          //     ...data,
          //     type: 'broadcast-probe',
          //     serverReceivedAt: nowIso
          //   };

          //   const broadcastedTo = wsBroadcastJson(
          //     wsApiConnections,
          //     payload,
          //     { scope: 'ws/api', op: 'broadcast-probe' }
          //   );

          //   // Also acknowledge to sender (useful if broadcast fails)
          //   safeSend({
          //     type: 'broadcast-probe-ack',
          //     poil: 'poilu',
          //     probeId: data.probeId || data.requestId || null,
          //     serverReceivedAt: nowIso,
          //     broadcastedTo
          //   });
          //   return;
          // }

          // Handle direct messages (targeted, console-only)
          if (data.type === 'direct-message') {
            const requestId = data.requestId || data.request_id;
            const toPhone = data.toPhone;
            const toUserId = data.toUserId || data.to_user_id;
            const msgText = data.message;

            const normalizedToPhone = (typeof toPhone === 'string')
              ? toPhone.trim().replace(/\s+/g, '')
              : toPhone;

            // STRICT MODE: require an authenticated ws/api connection.
            // We do NOT accept per-message tokens for direct-message.
            const attachedSenderUserId = connection && connection._wsApiUserId ? String(connection._wsApiUserId) : null;
            if (!attachedSenderUserId) {
              safeSend({
                type: 'direct-message-response',
                requestId,
                success: false,
                error: 'Unauthenticated ws/api connection (auth required before direct-message)',
                sender_id: null,
                sender_phone: null,
                sender_name: null,
                receiver_id: toUserId ? String(toUserId) : null,
                receiver_phone: toPhone ? String(toPhone) : null,
                receiver_name: null,
                recipientConnections: 0,
                queueSize: 0
              });
              return;
            }
            // Reject stale/expired attached identity.
            // We only authenticate once per connection for performance, but we still enforce token expiry.
            const authExpMs = connection && typeof connection._wsApiAuthExpMs === 'number' ? connection._wsApiAuthExpMs : null;
            if (authExpMs && Date.now() >= authExpMs) {
              safeSend({
                type: 'direct-message-response',
                requestId,
                success: false,
                error: 'ws/api authentication expired (re-auth required)',
                sender_id: attachedSenderUserId,
                sender_phone: null,
                sender_name: null,
                receiver_id: toUserId ? String(toUserId) : null,
                receiver_phone: toPhone ? String(toPhone) : null,
                receiver_name: null,
                recipientConnections: 0,
                queueSize: 0
              });
              return;
            }

            if ((!normalizedToPhone && !toUserId) || !msgText) {
              safeSend({
                type: 'direct-message-response',
                requestId,
                success: false,
                error: 'Missing required fields: (toPhone or toUserId), message',
                sender_id: attachedSenderUserId,
                sender_phone: null,
                sender_name: null,
                receiver_id: toUserId ? String(toUserId) : null,
                receiver_phone: normalizedToPhone ? String(normalizedToPhone) : null,
                receiver_name: null,
                recipientConnections: 0,
                queueSize: 0
              });
              return;
            }

            try {
              const dataSource = db.getDataSourceAdapter();

              // Sender is the authenticated, attached user.
              let senderUserId = attachedSenderUserId;
              let senderPhone = null;
              let senderUsername = null;

              try {
                const senderUser = await findUserById(dataSource, String(senderUserId));
                if (senderUser) {
                  senderPhone = senderUser.phone || null;
                  senderUsername = senderUser.username || null;
                }
              } catch (error) {
                console.warn("[server] operation failed", error);
              }

              // If token payload is missing username, enrich from DB.
              // This keeps `from.username` reliable even for older tokens.
              let senderUser = null;
              if (!senderUsername) {
                try {
                  if (senderUserId) {
                    senderUser = await findUserById(dataSource, String(senderUserId));
                  } else if (senderPhone) {
                    senderUser = await findUserByPhone(dataSource, String(senderPhone));
                  }
                } catch (error) {
                  console.warn("[server] operation failed", error);
                  senderUser = null;
                }
                if (senderUser) {
                  if (!senderUsername) senderUsername = senderUser.username || null;
                  if (!senderPhone) senderPhone = senderUser.phone || null;
                  if (!senderUserId) senderUserId = senderUser.user_id || null;
                }
              }
              let targetUser = null;
              let targetUserId = toUserId ? String(toUserId) : null;

              // If a phone is provided, try DB lookup first (gives us phone/username),
              // but if not present in DB we can still route by deterministic userId.
              if (!targetUserId && normalizedToPhone) {
                targetUser = await findUserByPhone(dataSource, String(normalizedToPhone));
                if (targetUser && targetUser.user_id) {
                  targetUserId = String(targetUser.user_id);
                } else {
                  try {
                    targetUserId = generateDeterministicUserId(String(normalizedToPhone));
                  } catch (error) {
                    console.warn("[server] operation failed", error);
                    targetUserId = null;
                  }
                }
              }

              // If userId was provided, optionally enrich with DB data.
              if (targetUserId && !targetUser) {
                try {
                  targetUser = await findUserById(dataSource, targetUserId);
                } catch (error) {
                  console.warn("[server] operation failed", error);
                  targetUser = null;
                }
              }

              if (!targetUser && targetUserId) {
                try {
                  const shadowUsername = normalizedToPhone || `user_${String(targetUserId).slice(0, 8)}`;
                  const randomHash = await hashPassword(`shadow_${Date.now()}_${Math.random()}`);
                  await createUserAtome(
                    dataSource,
                    targetUserId,
                    shadowUsername,
                    normalizedToPhone || '',
                    randomHash,
                    'private',
                    {}
                  );
                  targetUser = await findUserById(dataSource, targetUserId);
                } catch (err) {
                  console.warn('[direct-message] failed to create shadow user:', err?.message || err);
                }
              }

              if (!targetUserId) {
                safeSend({
                  type: 'direct-message-response',
                  requestId,
                  success: false,
                  error: 'Target user id could not be resolved',
                  sender_id: senderUserId,
                  sender_phone: senderPhone,
                  sender_name: senderUsername,
                  receiver_id: null,
                  receiver_phone: normalizedToPhone ? String(normalizedToPhone) : null,
                  receiver_name: targetUser ? targetUser.username : null,
                  recipientConnections: 0,
                  queueSize: 0
                });
                return;
              }

              const payload = {
                type: 'console-message',
                message: String(msgText),
                from: { userId: senderUserId, phone: senderPhone, username: senderUsername },
                to: { userId: targetUserId, phone: targetUser ? targetUser.phone : (normalizedToPhone ? String(normalizedToPhone) : null) },
                timestamp: new Date().toISOString()
              };

              // Persist notification as a message atome (offline/refresh safe)
              try {
                const nowIso = payload.timestamp;
                let parsed = null;
                try {
                  parsed = JSON.parse(String(msgText));
                } catch (error) {
                  console.warn("[server] operation failed", error);
                  parsed = null;
                }
                const params = parsed?.params && typeof parsed.params === 'object' ? parsed.params : {};
                const messageId = params.id || params.messageId || `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
                const messageProps = {
                  message_id: messageId,
                  command: parsed?.command || null,
                  kind: params.kind || parsed?.command || 'message',
                  subject: params.subject || null,
                  message: params.message || params.text || (typeof msgText === 'string' ? msgText : null),
                  atome_ids: Array.isArray(params.atomeIds) ? params.atomeIds : [],
                  request_atome_id: params.requestAtomeId || null,
                  from_id: senderUserId,
                  from_name: senderUsername,
                  from_phone: senderPhone,
                  to_user_id: targetUserId,
                  to_phone: targetUser ? targetUser.phone : (normalizedToPhone ? String(normalizedToPhone) : null),
                  timestamp: nowIso,
                  unread: true,
                  box: 'inbox'
                };
                const messageAtomeId = uuidv4();
                const created = await commitAtomeEvent({
                  authenticatedUserId: senderUserId,
                  event: {
                    atome_id: messageAtomeId,
                    kind: 'set',
                    payload: {
                      props: {
                        ...messageProps,
                        type: 'message',
                        kind: 'message',
                        owner_id: targetUserId
                      }
                    },
                    actor: { type: 'user', id: senderUserId }
                  }
                });
                if (created?.ok && SERVER_INFO_ENABLED) {
                  console.log('[direct-message] persisted message atome:', messageAtomeId);
                }
                // Persist in user notification stack (single source of truth)
                try {
                  const stackRes = await pushNotificationToUserStack({
                    userId: targetUserId,
                    authorId: senderUserId,
                    notification: {
                      ...messageProps,
                      id: messageId,
                      message_id: messageId
                    }
                  });
                  if (SERVER_INFO_ENABLED && stackRes?.ok) {
                    console.log('[direct-message] notification stack updated:', {
                      userId: targetUserId,
                      count: stackRes.count
                    });
                  }
                } catch (err) {
                  console.warn('[direct-message] failed to update notification stack:', err?.message || err);
                }
              } catch (err) {
                console.warn('[direct-message] failed to persist message atome:', err?.message || err);
              }

              // DEBUG: log routing info
              const registrySize = wsApiClientsByUserId.get(targetUserId)?.size || 0;
              if (process.env.DIRECT_MESSAGE_DEBUG === '1') {
                console.log(`[direct-message] sender=${senderUserId} target=${targetUserId} toPhone=${normalizedToPhone} toUserId=${toUserId} registrySize=${registrySize}`);
              }

              let queued = false;
              let queueSize = 0;

              const { delivered, recipientConnections } = wsSendJsonToUser(
                targetUserId,
                payload,
                { scope: 'ws/api', op: 'direct-message', targetUserId }
              );

              if (!delivered) {
                queueSize = enqueuePendingConsoleMessage(targetUserId, payload);
                queued = true;
              }

              safeSend({
                type: 'direct-message-response',
                requestId,
                success: true,
                delivered,
                queued,
                receiver_id: targetUserId,
                receiver_phone: targetUser ? targetUser.phone : (normalizedToPhone ? String(normalizedToPhone) : null),
                receiver_name: targetUser ? targetUser.username : null,
                sender_id: senderUserId,
                sender_phone: senderPhone,
                sender_name: senderUsername,
                recipientConnections,
                queueSize
              });
            } catch (error) {
              safeSend({
                type: 'direct-message-response',
                requestId,
                success: false,
                error: error.message,
                sender_id: null,
                sender_phone: null,
                sender_name: null,
                receiver_id: null,
                receiver_phone: toPhone ? String(toPhone) : null,
                receiver_name: null,
                recipientConnections: 0,
                queueSize: 0
              });
            }
            return;
          }

          // Handle ping/pong
          if (data.type === 'ping') {
            safeSend({ type: 'pong' });
            return;
          }

          // Handle file requests (ADOLE v3.0 WebSocket)
          if (data.type === 'file') {
            const action = data.action || '';
            const requestId = data.requestId;

            const resolveRequesterId = async () => {
              let requesterId = connection?._wsApiUserId || null;
              try {
                const authExpMs = connection && typeof connection._wsApiAuthExpMs === 'number' ? connection._wsApiAuthExpMs : null;
                if (requesterId && authExpMs && Date.now() >= authExpMs) {
                  detachWsApiClient(connection);
                  requesterId = null;
                }
              } catch (error) {
                console.warn("[server] operation failed", error);
              }

              if (!requesterId && data.token) {
                try {
                  const jwt = await import('jsonwebtoken');
                  const jwtSecret = getRequiredJwtSecret();
                  const decoded = jwt.default.verify(String(data.token), jwtSecret);
                  const decodedUserId = decoded?.userId || decoded?.id || decoded?.user_id || decoded?.sub || null;
                  if (decodedUserId) {
                    requesterId = String(decodedUserId);
                    attachWsApiClientToUser(connection, requesterId);
                    if (decoded && typeof decoded.exp === 'number') {
                      connection._wsApiAuthExpMs = decoded.exp * 1000;
                    }
                  }
                } catch (error) {
                  console.warn("[server] operation failed", error);
                  requesterId = null;
                }
              }

              if (!requesterId) {
                return null;
              }
              return requesterId;
            };

            const userId = await resolveRequesterId();
            if (!userId) {
              safeSend({
                type: 'file-response',
                requestId,
                success: false,
                error: 'file_request_auth_required'
              });
              return;
            }
            const identifier = data.atome_id || data.id || data.file_id || data.identifier || data.file;

            const sendFileResponse = (payload) => {
              safeSend({
                type: 'file-response',
                requestId,
                success: Boolean(payload?.success),
                ...payload
              });
            };

            if (!action) {
              sendFileResponse({ success: false, error: 'Missing file action' });
              return;
            }

            if (action === 'download-info') {
              if (!identifier) {
                sendFileResponse({ success: false, error: 'Missing file identifier' });
                return;
              }

              try {
                let downloadsSnapshot = null;
                if (data.debug) {
                  downloadsSnapshot = await listUserDownloadsSnapshot(userId);
                  console.log('[file-sync] server downloads snapshot (download-info)', downloadsSnapshot);
                }
                const target = await resolveDownloadTarget(identifier, userId);
                if (!target?.filePath) {
                  sendFileResponse({
                    success: false,
                    error: 'File not found',
                    status: 404,
                    downloadsSnapshot
                  });
                  return;
                }
                const stats = await fs.stat(target.filePath);
                const sizeBytes = stats?.size ?? 0;
                const chunkSize = coerceWsChunkSize(data.chunk_size || data.chunkSize);
                const chunkCount = sizeBytes ? Math.ceil(sizeBytes / chunkSize) : 0;
                const meta = target.meta || null;

                sendFileResponse({
                  success: true,
                  action,
                  atome_id: meta?.atome_id || identifier,
                  file_name: meta?.file_name || target.downloadName || String(identifier),
                  original_name: meta?.original_name || target.downloadName || String(identifier),
                  file_path: meta?.file_path || null,
                  mime_type: meta?.mime_type || null,
                  size_bytes: sizeBytes,
                  chunk_size: chunkSize,
                  chunk_count: chunkCount,
                  downloadsSnapshot
                });
              } catch (error) {
                sendFileResponse({ success: false, error: error.message || 'download_info_failed' });
              }
              return;
            }

            if (action === 'download-chunk') {
              if (!identifier) {
                sendFileResponse({ success: false, error: 'Missing file identifier' });
                return;
              }

              const chunkIndex = Number(data.chunk_index ?? data.chunkIndex ?? -1);
              if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
                sendFileResponse({ success: false, error: 'Invalid chunk index' });
                return;
              }

              const chunkSize = coerceWsChunkSize(data.chunk_size || data.chunkSize);

              let handle;
              try {
                const target = await resolveDownloadTarget(identifier, userId);
                if (!target?.filePath) {
                  sendFileResponse({ success: false, error: 'File not found', status: 404 });
                  return;
                }
                handle = await fs.open(target.filePath, 'r');
                const stats = await handle.stat();
                const sizeBytes = stats?.size ?? 0;
                const offset = chunkIndex * chunkSize;
                if (offset >= sizeBytes) {
                  sendFileResponse({ success: false, error: 'Chunk out of range' });
                  return;
                }

                const readLength = Math.min(chunkSize, sizeBytes - offset);
                const buffer = Buffer.alloc(readLength);
                await handle.read(buffer, 0, readLength, offset);
                const chunkBase64 = buffer.toString('base64');

                sendFileResponse({
                  success: true,
                  action,
                  atome_id: identifier,
                  chunk_index: chunkIndex,
                  chunk_size: chunkSize,
                  size_bytes: sizeBytes,
                  chunk_base64: chunkBase64,
                  done: offset + readLength >= sizeBytes
                });
              } catch (error) {
                sendFileResponse({ success: false, error: error.message || 'download_chunk_failed' });
              } finally {
                if (handle) {
                  try { await handle.close(); } catch (error) {
                    console.warn("[server] operation failed", error);
                  }
                }
              }
              return;
            }

            if (action === 'upload-chunk') {
              const uploadId = sanitizeUploadId(data.upload_id);
              const chunkIndex = Number(data.chunk_index ?? -1);
              const chunkCount = Number(data.chunk_count ?? 0);
              const chunkBase64 = data.chunk_base64 || data.chunk;

              if (!uploadId) {
                sendFileResponse({ success: false, error: 'Missing or invalid uploadId' });
                return;
              }
              if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
                sendFileResponse({ success: false, error: 'Invalid chunk index' });
                return;
              }
              if (!chunkBase64) {
                sendFileResponse({ success: false, error: 'Missing chunk data' });
                return;
              }

              try {
                const bytes = Buffer.from(String(chunkBase64), 'base64');
                await fs.mkdir(UPLOADS_TMP_DIR, { recursive: true, mode: 0o700 });
                const uploadDir = path.join(UPLOADS_TMP_DIR, uploadId);
                await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
                const chunkPath = path.join(uploadDir, `${chunkIndex}.part`);
                await fs.writeFile(chunkPath, bytes);

                sendFileResponse({
                  success: true,
                  action,
                  upload_id: uploadId,
                  chunk_index: chunkIndex,
                  chunk_count: chunkCount,
                  size_bytes: bytes.length
                });
              } catch (error) {
                sendFileResponse({ success: false, error: error.message || 'upload_chunk_failed' });
              }
              return;
            }

            if (action === 'upload-complete') {
              const uploadId = sanitizeUploadId(data.upload_id);
              const chunkCount = Number(data.chunk_count ?? 0);
              const rawFileName = data.file_name || data.name || '';
              const rawFilePath = data.file_path || data.path || '';
              const atomeId = data.atome_id || null;
              const atomeType = data.atome_type || null;
              const originalName = data.original_name || rawFileName || null;
              const mimeType = data.mime_type || null;

              if (!uploadId) {
                sendFileResponse({ success: false, error: 'Missing or invalid uploadId' });
                return;
              }

              if (!rawFileName && !rawFilePath) {
                sendFileResponse({ success: false, error: 'Missing fileName or filePath' });
                return;
              }

              try {
                let fileName = rawFileName;
                let filePath = null;
                let relativePath = null;

                if (rawFilePath) {
                  const normalizedRelative = normalizeUserRelativePath(rawFilePath, userId);
                  const resolved = await resolveUserAssetPath(
                    projectRoot,
                    { id: userId },
                    normalizedRelative
                  );
                  fileName = fileName || resolved.fileName;
                  filePath = resolved.filePath;
                  relativePath = resolved.relativePath;
                } else {
                  const resolved = await resolveUserUploadPath(
                    projectRoot,
                    { id: userId },
                    fileName || 'upload.bin'
                  );
                  fileName = resolved.fileName;
                  filePath = resolved.filePath;
                  relativePath = path.join('Downloads', resolved.fileName);
                }

                if (!filePath) {
                  sendFileResponse({ success: false, error: 'Unable to resolve file path' });
                  return;
                }

                const uploadDir = path.join(UPLOADS_TMP_DIR, uploadId);

                if (chunkCount > 0) {
                  const output = createWriteStream(filePath, { flags: 'w' });
                  for (let idx = 0; idx < chunkCount; idx += 1) {
                    const chunkPath = path.join(uploadDir, `${idx}.part`);
                    await new Promise((resolve, reject) => {
                      const input = createReadStream(chunkPath);
                      input.on('error', reject);
                      input.on('end', resolve);
                      input.pipe(output, { end: false });
                    });
                  }

                  await new Promise((resolve, reject) => {
                    output.on('error', reject);
                    output.end(resolve);
                  });
                } else {
                  await fs.writeFile(filePath, Buffer.alloc(0));
                }

                try {
                  await fs.rm(uploadDir, { recursive: true, force: true });
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }
                await ensureVideoPlaybackCache(filePath, fileName, mimeType || '');

                if (DATABASE_ENABLED) {
                  const stats = await fs.stat(filePath).catch(() => null);
                  await registerFileUpload(fileName, userId, {
                    atome_id: atomeId || null,
                    atome_type: atomeType || null,
                    original_name: originalName || fileName,
                    mime_type: mimeType || null,
                    size_bytes: stats ? stats.size : null,
                    file_path: relativePath || null
                  });
                }

                let downloadsSnapshot = null;
                if (data.debug) {
                  downloadsSnapshot = await listUserDownloadsSnapshot(userId);
                  console.log('[file-sync] server downloads snapshot (upload-complete)', downloadsSnapshot);
                }
                sendFileResponse({
                  success: true,
                  action,
                  file_name: fileName,
                  owner_id: userId,
                  file_path: relativePath || null,
                  downloadsSnapshot
                });
              } catch (error) {
                sendFileResponse({ success: false, error: error.message || 'upload_complete_failed' });
              }
              return;
            }

            sendFileResponse({ success: false, error: `Unknown file action: ${action}` });
            return;
          }

          // Handle auth requests (ADOLE v3.0 WebSocket-only)
          if (data.type === 'auth') {
            const action = data.action || '';
            const requestId = data.requestId;

            // Get dataSource adapter for auth functions
            const dataSource = db.getDataSourceAdapter();

            try {
              if (action === 'bootstrap' || action === 'register' || action === 'create-user') {
                const { username, phone, password } = data;
                const isBootstrap = action === 'bootstrap';
                const requestedUsername = String(username || '').trim();
                const normalizeAccessValue = (value) => (String(value || '').toLowerCase() === 'public' ? 'public' : 'private');
                const incomingAccess = data.access ?? data.visibility;
                const visibility = normalizeAccessValue(incomingAccess || 'public');
                console.log(`[ws/api] Register request access=${incomingAccess ?? 'n/a'} resolvedVisibility=${visibility}`);
                if ((!isBootstrap && !requestedUsername) || !phone || !password) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: isBootstrap ? 'Missing required fields: phone, password' : 'Missing required fields: username, phone, password'
                  });
                  return;
                }
                if (typeof password !== 'string' || password.length < 8) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Password must be at least 8 characters'
                  });
                  return;
                }

                const cleanPhone = normalizePhone(phone);
                if (!cleanPhone || cleanPhone.length < 6) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Valid phone number is required'
                  });
                  return;
                }
                const cleanUsername = requestedUsername || cleanPhone;

                // Check if user already exists
                const existingUser = await findUserByPhone(dataSource, cleanPhone);
                if (existingUser) {
                  if (!isBootstrap) {
                    safeSend({
                      type: 'auth-response',
                      requestId,
                      success: false,
                      alreadyExists: true,
                      error: 'Invalid credentials'
                    });
                    return;
                  }

                  const normalizedUserPhone = normalizePhone(existingUser.phone);
                  if (!normalizedUserPhone || normalizedUserPhone !== cleanPhone) {
                    console.warn(`[ws/api] 🚨 Phone mismatch on bootstrap: expected ${String(cleanPhone || '').slice(0, 4)}*** got ${String(existingUser.phone || '').slice(0, 4)}*** (userId=${existingUser.user_id})`);
                    safeSend({
                      type: 'auth-response',
                      requestId,
                      success: false,
                      error: 'Invalid credentials'
                    });
                    return;
                  }

                  const { verifyPassword } = await import('./auth.js');
                  const isValid = await verifyPassword(password, existingUser.password_hash);
                  if (!isValid) {
                    safeSend({
                      type: 'auth-response',
                      requestId,
                      success: false,
                      error: 'Invalid credentials'
                    });
                    return;
                  }

                  const jwt = await import('jsonwebtoken');
                  const jwtSecret = getRequiredJwtSecret();
                  const token = jwt.default.sign(
                    { userId: existingUser.user_id, phone: existingUser.phone },
                    jwtSecret,
                    { expiresIn: '7d' }
                  );

                  try {
                    await ensureUserHome(projectRoot, {
                      id: existingUser.user_id,
                      username: existingUser.username,
                      phone: existingUser.phone
                    });
                  } catch (e) {
                    console.warn('[ws/api] Failed to prepare user home:', e.message);
                  }

                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: true,
                    ok: true,
                    alreadyExists: true,
                    token,
                    user: {
                      id: existingUser.user_id,
                      user_id: existingUser.user_id,
                      username: existingUser.username,
                      phone: existingUser.phone
                    },
                    message: 'User authenticated successfully'
                  });

                  attachWsApiClientToUser(connection, existingUser.user_id);
                  try {
                    const decoded = jwt.default.verify(token, jwtSecret);
                    if (decoded && typeof decoded.exp === 'number') {
                      connection._wsApiAuthExpMs = decoded.exp * 1000;
                    } else {
                      connection._wsApiAuthExpMs = null;
                    }
                  } catch (error) {
                    console.warn("[server] operation failed", error);
                    connection._wsApiAuthExpMs = null;
                  }
                  return;
                }

                // Hash password and create user
                // visibility: 'public' = visible in user_list (default), 'private' = hidden
                const passwordHash = await hashPassword(password);
                const userId = generateDeterministicUserId(cleanPhone);
                try {
                  await createUserAtome(dataSource, userId, cleanUsername, cleanPhone, passwordHash, visibility, data.optional || {});

                  try {
                    const accessRows = await dataSource.query(
                      'SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ?',
                      [userId, 'access']
                    );
                    const storedAccess = accessRows?.[0]?.particle_value ? JSON.parse(accessRows[0].particle_value) : null;
                    console.log(`[ws/api] Register stored access=${storedAccess ?? 'unknown'} userId=${userId}`);
                  } catch (error) {
                    console.warn("[server] operation failed", error);
                    console.log(`[ws/api] Register stored access=unknown userId=${userId}`);
                  }
                } catch (err) {
                  const message = err?.message || String(err);
                  if (message.includes('User already exists')) {
                    safeSend({
                      type: 'auth-response',
                      requestId,
                      success: false,
                      alreadyExists: true,
                      error: 'Invalid credentials'
                    });
                    return;
                  }
                  throw err;
                }

                // Broadcast account creation for real-time directory sync (ws/sync)
                try {
                  const syncEventBus = getSyncEventBus();
                  if (syncEventBus) {
                    const now = new Date().toISOString();
                    syncEventBus.emit('event', {
                      type: 'sync:account-created',
                      timestamp: now,
                      runtime: 'Fastify',
                      payload: {
                        userId,
                        username: cleanUsername,
                        phone: cleanPhone,
                        optional: data.optional || {},
                        visibility,
                        access: visibility
                      }
                    });
                  }
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                // Issue JWT immediately so first post-register commit has a token.
                const jwt = await import('jsonwebtoken');
                const jwtSecret = getRequiredJwtSecret();
                const token = jwt.default.sign(
                  { userId, phone: cleanPhone },
                  jwtSecret,
                  { expiresIn: '7d' }
                );

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  alreadyExists: false,
                  userId,
                  token,
                  user: {
                    id: userId,
                    user_id: userId,
                    username: cleanUsername,
                    phone: cleanPhone
                  },
                  message: 'User created successfully'
                });

                attachWsApiClientToUser(connection, userId);
                try {
                  const decoded = jwt.default.verify(token, jwtSecret);
                  if (decoded && typeof decoded.exp === 'number') {
                    connection._wsApiAuthExpMs = decoded.exp * 1000;
                  } else {
                    connection._wsApiAuthExpMs = null;
                  }
                } catch (error) {
                  console.warn("[server] operation failed", error);
                  connection._wsApiAuthExpMs = null;
                }
              } else if (action === 'request-phone-verification') {
                const rawPhone = data.phone;
                if (!rawPhone || typeof rawPhone !== 'string') {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Missing required field: phone'
                  });
                  return;
                }
                const cleanPhone = normalizePhone(rawPhone);
                if (!cleanPhone || cleanPhone.length < 6) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Valid phone number is required'
                  });
                  return;
                }
                const rate = enforceAuthIdentityRateLimit('phone_verification_request', cleanPhone, 3);
                if (!rate.ok) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    ok: false,
                    retryAfterSeconds: rate.retryAfterSeconds,
                    error: 'Too many verification requests'
                  });
                  return;
                }
                if (AUTH_OTP_BYPASS_ENABLED) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: true,
                    ok: true,
                    context: data.context || 'login_demo',
                    otpBypassed: true
                  });
                  return;
                }
                const code = generateOTP();
                storeOTP(cleanPhone, code);
                await sendSMS(cleanPhone, `Your Atome verification code is: ${code}`);
                const response = {
                  type: 'auth-response',
                  requestId,
                  success: true,
                  ok: true,
                  context: data.context || 'login_demo'
                };
                if (data.exposeForTest === true && process.env.NODE_ENV !== 'production') {
                  response.code = code;
                }
                safeSend(response);
              } else if (action === 'verify-phone-verification') {
                const rawPhone = data.phone;
                const code = data.code === undefined || data.code === null ? '' : String(data.code).trim();
                if (!rawPhone || typeof rawPhone !== 'string' || !code) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Missing required fields: phone, code'
                  });
                  return;
                }
                const cleanPhone = normalizePhone(rawPhone);
                const rate = enforceAuthIdentityRateLimit('phone_verification_verify', cleanPhone, 5);
                if (!rate.ok) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    ok: false,
                    retryAfterSeconds: rate.retryAfterSeconds,
                    error: 'Too many verification attempts'
                  });
                  return;
                }
                const result = verifyOTP(cleanPhone, code);
                if (!result.valid) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: result.error || 'Invalid OTP code'
                  });
                  return;
                }
                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  ok: true,
                  context: data.context || 'login_demo'
                });
              } else if (action === 'lookup-phone') {
                const rawPhone = data.phone;
                if (!rawPhone || typeof rawPhone !== 'string') {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Missing required field: phone'
                  });
                  return;
                }

                const cleanPhone = rawPhone.trim().replace(/\s+/g, '');
                const user = await findUserByPhone(dataSource, cleanPhone);
                if (!user) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: 'User not found'
                  });
                  return;
                }

                // Read visibility without leaking other particles.
                let visibility = 'private';
                try {
                  const rows = await dataSource.query(
                    `SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = 'visibility' LIMIT 1`,
                    [user.user_id]
                  );
                  if (rows && rows[0] && rows[0].particle_value) {
                    try { visibility = JSON.parse(rows[0].particle_value); } catch (error) {
                      console.warn("[server] operation failed", error); visibility = rows[0].particle_value;
                    }
                  }
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  ok: true,
                  user: {
                    id: user.user_id,
                    user_id: user.user_id,
                    username: user.username,
                    phone: user.phone,
                    visibility: visibility === 'public' ? 'public' : 'private'
                  }
                });
              } else if (action === 'delete' || action === 'delete-user') {
                const { userId, phone, token, password } = data;
                let targetUserId = userId || (phone ? generateDeterministicUserId(phone) : null);

                // If no userId/phone provided, try to get from token
                if (!targetUserId && token) {
                  try {
                    const jwt = await import('jsonwebtoken');
                    const jwtSecret = getRequiredJwtSecret();
                    const decoded = jwt.default.verify(token, jwtSecret);
                    targetUserId = decoded.userId;
                  } catch (jwtError) {
                    // Token invalid, continue without userId
                  }
                }

                if (!targetUserId) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Missing required field: userId, phone, or valid token'
                  });
                  return;
                }

                await deleteUserAtome(dataSource, targetUserId);

                // Broadcast account deletion for real-time directory sync
                try {
                  const syncEventBus = getSyncEventBus();
                  if (syncEventBus) {
                    const now = new Date().toISOString();
                    syncEventBus.emit('event', {
                      type: 'sync:account-deleted',
                      timestamp: now,
                      runtime: 'Fastify',
                      payload: {
                        userId: targetUserId
                      }
                    });
                  }
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  message: 'User deleted successfully'
                });
              } else if (action === 'list-users') {
                const users = await listAllUsers(dataSource);

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  users
                });
              } else if (action === 'get-user') {
                const { userId, phone } = data;
                let user = null;

                if (userId) {
                  user = await findUserById(dataSource, userId);
                } else if (phone) {
                  user = await findUserByPhone(dataSource, phone);
                }

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  user
                });
              } else if (action === 'update-user') {
                const { userId, key, value } = data;

                if (!userId || !key) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Missing required fields: userId, key'
                  });
                  return;
                }

                await updateUserParticle(dataSource, userId, key, value);

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  message: 'User updated successfully'
                });
              } else if (action === 'login') {
                const { phone, password } = data;

                if (!phone || !password) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Missing required fields: phone, password'
                  });
                  return;
                }

                // Find user by phone
                const user = await findUserByPhone(dataSource, phone);
                if (!user) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'User not found'
                  });
                  return;
                }
                const normalizedInput = normalizePhone(phone);
                const normalizedUserPhone = normalizePhone(user.phone);
                if (!normalizedUserPhone || normalizedUserPhone !== normalizedInput) {
                  console.warn(`[ws/api] 🚨 Phone mismatch on login: expected ${String(normalizedInput || '').slice(0, 4)}*** got ${String(user.phone || '').slice(0, 4)}*** (userId=${user.user_id})`);
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Invalid credentials'
                  });
                  return;
                }

                // Verify password
                const { verifyPassword } = await import('./auth.js');
                const isValid = await verifyPassword(password, user.password_hash);
                if (!isValid) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Invalid password'
                  });
                  return;
                }

                // Generate JWT token
                const jwt = await import('jsonwebtoken');
                const jwtSecret = getRequiredJwtSecret();
                const token = jwt.default.sign(
                  { userId: user.user_id, phone: user.phone },
                  jwtSecret,
                  { expiresIn: '7d' }
                );

                try {
                  await ensureUserHome(projectRoot, {
                    id: user.user_id,
                    username: user.username,
                    phone: user.phone
                  });
                } catch (e) {
                  console.warn('[ws/api] Failed to prepare user home:', e.message);
                }

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  ok: true,
                  token,
                  user: {
                    id: user.user_id,
                    username: user.username,
                    phone: user.phone
                  }
                });

                // Associate this ws/api connection with the authenticated user.
                attachWsApiClientToUser(connection, user.user_id);

                // Cache expiry on the connection to prevent stale identity usage.
                try {
                  const decoded = jwt.default.verify(token, jwtSecret);
                  if (decoded && typeof decoded.exp === 'number') {
                    connection._wsApiAuthExpMs = decoded.exp * 1000;
                  } else {
                    connection._wsApiAuthExpMs = null;
                  }
                } catch (error) {
                  console.warn("[server] operation failed", error);
                  connection._wsApiAuthExpMs = null;
                }
              } else if (action === 'me') {
                const { token } = data;

                if (!token) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'No token provided'
                  });
                  return;
                }

                try {
                  const jwt = await import('jsonwebtoken');
                  const jwtSecret = getRequiredJwtSecret();
                  const decoded = jwt.default.verify(token, jwtSecret);
                  const decodedUserId = decoded.userId || decoded.id || decoded.user_id || decoded.sub || null;
                  let user = decodedUserId ? await findUserById(dataSource, String(decodedUserId)) : null;

                  // If user doesn't exist but JWT is valid, create a shadow user
                  // This enables Tauri users to authenticate on Fastify without explicit registration
                  if (!user && decodedUserId && decoded) {
                    const shadowUsername = decoded.username || decoded.name || `user_${decodedUserId.substring(0, 8)}`;
                    const shadowPhone = decoded.phone || decoded.phoneNumber || null;

                    console.log(`[ws/api] Creating shadow user from valid JWT: ${decodedUserId.substring(0, 8)}`);
                    try {
                      // Create user with a random password hash (they'll auth via JWT only)
                      const bcrypt = await import('bcrypt');
                      const randomHash = await bcrypt.hash(`shadow_${Date.now()}_${Math.random()}`, 10);
                      await createUserAtome(dataSource, decodedUserId, shadowUsername, shadowPhone, randomHash, 'public', {});
                      user = await findUserById(dataSource, String(decodedUserId));
                    } catch (createErr) {
                      console.warn(`[ws/api] Failed to create shadow user: ${createErr.message}`);
                    }
                  }

                  if (!user) {
                    safeSend({
                      type: 'auth-response',
                      requestId,
                      success: false,
                      error: 'User not found'
                    });
                    return;
                  }

                  try {
                    await ensureUserHome(projectRoot, {
                      id: user.user_id,
                      username: user.username,
                      phone: user.phone
                    });
                  } catch (e) {
                    console.warn('[ws/api] Failed to prepare user home:', e.message);
                  }

                  // Support registerAs ONLY when it matches the authenticated user id.
                  // This prevents attaching the ws/api connection under an arbitrary identifier
                  // (e.g. a phone number), which would break ACL checks and is unsafe.
                  const requestedRegisterAs = data.registerAs ? String(data.registerAs) : null;
                  const registerAsUserId = (requestedRegisterAs && requestedRegisterAs === String(user.user_id))
                    ? requestedRegisterAs
                    : String(user.user_id);

                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: true,
                    ok: true,
                    user: {
                      id: user.user_id,
                      username: user.username,
                      phone: user.phone
                    },
                    registeredAs: registerAsUserId
                  });

                  // Associate this ws/api connection with the requested user ID.
                  attachWsApiClientToUser(connection, registerAsUserId);
                  if (process.env.WS_CONNECTION_DEBUG === '1') {
                    console.log(`[ws/api] Auth: token=${user.user_id.substring(0, 8)}, registerAs=${registerAsUserId.substring(0, 8)}`);
                  }

                  // Cache expiry on the connection to prevent stale identity usage.
                  if (decoded && typeof decoded.exp === 'number') {
                    connection._wsApiAuthExpMs = decoded.exp * 1000;
                  } else {
                    connection._wsApiAuthExpMs = null;
                  }
                } catch (jwtError) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Invalid or expired token'
                  });
                }
              } else if (action === 'logout') {
                // Logout is client-side token clearing, just acknowledge
                try {
                  detachWsApiClient(connection);
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }
                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  ok: true,
                  message: 'Logged out successfully'
                });
              } else {
                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: false,
                  error: `Unknown auth action: ${action}`
                });
              }
            } catch (error) {
              console.error(`❌ Auth WebSocket error: ${error.message}`);
              safeSend({
                type: 'auth-response',
                requestId,
                success: false,
                error: error.message
              });
            }
            return;
          }

          // Handle atome requests (ADOLE v3.0 WebSocket-only)
          if (data.type === 'atome') {
            const action = data.action || '';
            const requestId = data.requestId || data.request_id;
            const mutatingActions = new Set(['create', 'update', 'alter', 'delete', 'soft-delete']);
            if (requestId && mutatingActions.has(action) && isDuplicateWsRequest(connection, requestId)) {
              safeSend({
                type: 'atome-response',
                requestId,
                success: true,
                duplicate: true
              });
              return;
            }

            // Resolve requester identity:
            // - Prefer the attached ws identity (fast path)
            // - Enforce expiry
            // - If missing (or expired), verify JWT from the message and attach the connection
            let requesterId = connection?._wsApiUserId || null;
            let hasAuthIdentity = !!requesterId;

            try {
              const authExpMs = connection && typeof connection._wsApiAuthExpMs === 'number' ? connection._wsApiAuthExpMs : null;
              if (requesterId && authExpMs && Date.now() >= authExpMs) {
                // Stale connection identity
                detachWsApiClient(connection);
                requesterId = null;
              }
            } catch (error) {
              console.warn("[server] operation failed", error);
            }

            if (!requesterId && data.token) {
              try {
                const jwt = await import('jsonwebtoken');
                  const jwtSecret = getRequiredJwtSecret();
                const decoded = jwt.default.verify(String(data.token), jwtSecret);
                const decodedUserId = decoded?.userId || decoded?.id || decoded?.user_id || decoded?.sub || null;
                if (decodedUserId) {
                  requesterId = String(decodedUserId);
                  attachWsApiClientToUser(connection, requesterId);
                  hasAuthIdentity = true;
                  if (decoded && typeof decoded.exp === 'number') {
                    connection._wsApiAuthExpMs = decoded.exp * 1000;
                  }
                }
              } catch (error) {
                console.warn("[server] operation failed", error);
                requesterId = null;
              }
            }

            if (!requesterId) {
              safeSend({
                type: 'atome-response',
                requestId,
                success: false,
                error: 'atome_request_auth_required'
              });
              return;
            }

            try {
              if (action === 'create') {
                const atomeId = data.atome_id || data.id || uuidv4();
                if (isDuplicateAtomeCreate(atomeId)) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: true,
                    duplicate: true,
                    atome: { atome_id: atomeId }
                  });
                  return;
                }
                const atomeType = data.atome_type || data.type || 'generic';
                const parentId = data.parent_id || data.parent;
                let ownerId = requesterId || null;
                if (!ownerId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Missing owner (authentication required)'
                  });
                  return;
                }
                const particles = data.particles || data.properties || data.data || {};

                if (parentId && requesterId) {
                  const allowedCreate = await db.canCreate(parentId, requesterId);
                  if (!allowedCreate) {
                    safeSend({
                      type: 'atome-response',
                      requestId,
                      success: false,
                      error: 'Access denied (create)'
                    });
                    return;
                  }
                }

                const result = await commitAtomeEvent({
                  authenticatedUserId: requesterId || ownerId,
                  event: {
                    atome_id: atomeId,
                    project_id: data.project_id || data.projectId || parentId || null,
                    kind: 'set',
                    payload: {
                      props: {
                        ...particles,
                        type: atomeType,
                        ...(data.kind ? { kind: data.kind } : {}),
                        ...(parentId ? { parent_id: parentId } : {}),
                        ...(ownerId ? { owner_id: ownerId } : {})
                      }
                    },
                    actor: { type: 'user', id: requesterId || ownerId }
                  }
                });

                // After creating an atome, try to resolve any pending owner references
                // This handles FK constraints for sync operations
                try {
                  const resolveResult = await db.resolvePendingOwners();
                  if (resolveResult.resolved > 0) {
                    console.log('[WS] Resolved', resolveResult.resolved, 'pending owner references');
                  }
                } catch (resolveErr) {
                  console.log('[WS] Could not resolve pending owners:', resolveErr.message);
                }

                try {
                  await inheritPermissionsFromParent({
                    parentId,
                    childId: atomeId,
                    childOwnerId: ownerId || requesterId,
                    grantorId: requesterId
                  });
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                try {
                  await broadcastAtomeCreate({
                    atomeId,
                    atomeType,
                    parentId: parentId || null,
                    particles,
                    senderUserId: requesterId,
                    senderConnection: connection
                  });
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                try {
                  syncAtomeViaWebSocket({
                    atome_id: atomeId,
                    atome_type: atomeType,
                    parent_id: parentId || null,
                    owner_id: ownerId || requesterId || null,
                    particles
                  }, 'create');
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  atome: result
                });
              } else if (action === 'get') {
                const atomeId = data.atome_id || data.id;

                if (requesterId && atomeId) {
                  const allowed = await db.canRead(atomeId, requesterId);
                  if (!allowed) {
                    safeSend({
                      type: 'atome-response',
                      requestId,
                      success: false,
                      ok: false,
                      error: 'Access denied'
                    });
                    return;
                  }
                }

                const atome = await db.getAtome(atomeId);

                // Return success: false if atome not found
                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: !!atome,
                  ok: !!atome,
                  atome
                });
              } else if (action === 'realtime') {
                // ADOLE v3.0: broadcast-only realtime patch (no DB write)
                // Used for continuous drag so other collaborators see movement immediately.
                const atomeId = data.atome_id || data.id;
                const particles = data.particles || data.properties;

                if (!atomeId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Missing atome id'
                  });
                  return;
                }

                if (!particles || typeof particles !== 'object') {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Missing or invalid particles data'
                  });
                  return;
                }

                if (!requesterId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: 'Unauthenticated (token required)'
                  });
                  return;
                }

                const allowed = await db.canWrite(atomeId, requesterId);
                if (!allowed) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: 'Access denied'
                  });
                  return;
                }

                // Broadcast to recipients (including other tabs of the same user)
                try {
                  await broadcastAtomeRealtimePatch({
                    atomeId,
                    particles,
                    senderUserId: requesterId,
                    senderConnection: connection
                  });
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                if (data.noReply === true) {
                  return;
                }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Realtime patch broadcasted'
                });
                return;
              } else if (action === 'update') {
                const atomeId = data.atome_id;
                const particles = data.particles;
                const author = data.author;

                if (process.env.WS_UPDATE_DEBUG === '1') {
                  console.log('[WS Update Debug] atomeId:', atomeId);
                  console.log('[WS Update Debug] particles:', JSON.stringify(particles));
                  console.log('[WS Update Debug] data keys:', Object.keys(data));
                }

                if (!atomeId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Missing atome id'
                  });
                  return;
                }

                // Guard against null/undefined particles
                if (!particles || typeof particles !== 'object') {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Missing or invalid particles data'
                  });
                  return;
                }

                if (!requesterId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: 'Unauthenticated (token required)'
                  });
                  return;
                }

                const allowed = await db.canWrite(atomeId, requesterId);
                if (!allowed) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Access denied'
                  });
                  return;
                }

                await commitAtomeEvent({
                  authenticatedUserId: requesterId,
                  event: {
                    atome_id: atomeId,
                    kind: 'set',
                    payload: { props: particles },
                    actor: { type: 'user', id: author || requesterId }
                  }
                });
                const currentAtome = await db.getAtome(atomeId).catch(() => null);

                // Realtime collaboration: broadcast patch to share recipients
                try {
                  await broadcastAtomeRealtimePatch({ atomeId, particles, senderUserId: requesterId, senderConnection: connection });
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                try {
                  syncAtomeViaWebSocket({
                    atome_id: atomeId,
                    atome_type: resolveSyncAtomeType(
                      currentAtome?.atome_type,
                      currentAtome?.type,
                      data.atome_type,
                      data.type,
                      data.kind,
                      particles?.atome_type,
                      particles?.type,
                      particles?.kind
                    ),
                    parent_id: currentAtome?.parent_id || data.parent_id || null,
                    owner_id: currentAtome?.owner_id || requesterId || null,
                    particles
                  }, 'update');
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Atome updated'
                });
              } else if (action === 'alter') {
                // ADOLE v3.0: partial update of specific particles
                const atomeId = data.atome_id || data.id;
                const particles = data.particles || {};

                if (!atomeId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Missing atome id'
                  });
                  return;
                }

                if (!requesterId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: 'Unauthenticated (token required)'
                  });
                  return;
                }

                const allowed = await db.canWrite(atomeId, requesterId);
                if (!allowed) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: 'Access denied'
                  });
                  return;
                }

                await commitAtomeEvent({
                  authenticatedUserId: requesterId,
                  event: {
                    atome_id: atomeId,
                    kind: 'set',
                    payload: { props: particles },
                    actor: { type: 'user', id: requesterId }
                  }
                });
                const currentAtome = await db.getAtome(atomeId).catch(() => null);

                // Realtime collaboration: broadcast patch to share recipients
                try {
                  await broadcastAtomeRealtimePatch({ atomeId, particles, senderUserId: requesterId, senderConnection: connection });
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                try {
                  syncAtomeViaWebSocket({
                    atome_id: atomeId,
                    atome_type: resolveSyncAtomeType(
                      currentAtome?.atome_type,
                      currentAtome?.type,
                      data.atome_type,
                      data.type,
                      data.kind,
                      particles?.atome_type,
                      particles?.type,
                      particles?.kind
                    ),
                    parent_id: currentAtome?.parent_id || data.parent_id || null,
                    owner_id: currentAtome?.owner_id || requesterId || null,
                    particles
                  }, 'update');
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Atome altered'
                });
              } else if (action === 'transfer-owner') {
                const fromOwnerId = data.from_owner_id || null;
                const toOwnerId = data.to_owner_id || null;
                const includeCreator = data.include_creator !== false;

                if (!requesterId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: 'Unauthenticated (token required)'
                  });
                  return;
                }

                if (!fromOwnerId || !toOwnerId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Missing from_owner_id or to_owner_id'
                  });
                  return;
                }

                if (String(toOwnerId) !== String(requesterId)) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Access denied - target owner must be current user'
                  });
                  return;
                }

                let allowTransfer = String(fromOwnerId) === String(requesterId);
                if (!allowTransfer) {
                  try {
                    allowTransfer = await db.isAnonymousUser(fromOwnerId);
                  } catch (error) {
                    console.warn("[server] operation failed", error);
                    allowTransfer = false;
                  }
                }

                if (!allowTransfer) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Access denied - source owner must be anonymous'
                  });
                  return;
                }

                const result = await db.transferOwner({
                  fromOwnerId,
                  toOwnerId,
                  includeCreator
                });

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  data: result
                });
              } else if (action === 'delete' || action === 'soft-delete') {
                // Support both: { id } and { atome_id }
                // Note: This is a SOFT delete (sets deleted_at)
                const atomeId = data.atome_id || data.id;

                if (!requesterId) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    ok: false,
                    error: 'Unauthenticated (token required)'
                  });
                  return;
                }

                if (atomeId) {
                  const allowed = await db.canDelete(atomeId, requesterId);
                  if (!allowed) {
                    safeSend({
                      type: 'atome-response',
                      requestId,
                      success: false,
                      ok: false,
                      error: 'Access denied'
                    });
                    return;
                  }
                }

                await db.deleteAtome(atomeId);

                try {
                  await broadcastAtomeDelete({
                    atomeId,
                    senderUserId: requesterId,
                    senderConnection: connection
                  });
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                try {
                  syncAtomeViaWebSocket({ atome_id: atomeId }, 'delete');
                } catch (error) {
                  console.warn("[server] operation failed", error);
                }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Atome deleted'
                });
              } else if (action === 'list') {
                const { owner_id, user_id, atome_type, limit, offset, include_deleted, since } = data;
                const effectiveType = atome_type;
                const requestedOwner = (owner_id === '*' || owner_id === 'all') ? null : (owner_id || user_id);
                const effectiveOwner = requesterId || requestedOwner;

                // Special-case: public user directory listing
                // If the client requests atomeType='user' with no explicit owner filter,
                // return all PUBLIC users (visibility='public') instead of "only my own user".
                // This is critical for sharing workflows (recipient discovery) and must work
                // even when authenticated.
                const isUserDirectoryRequest = effectiveType === 'user' && !requestedOwner;
                const isAuthenticated = hasAuthIdentity && requesterId && requesterId !== 'anonymous';

                if (!isAuthenticated && !isUserDirectoryRequest) {
                  safeSend({
                    type: 'atome-response',
                    requestId,
                    success: false,
                    error: 'Unauthorized'
                  });
                  return;
                }

                if (process.env.ATOME_LIST_DEBUG === '1') {
                  console.log(`[Atome List Debug] owner_id=${owner_id}, user_id=${user_id}, atome_type=${atome_type}, include_deleted=${include_deleted}`);
                  console.log(`[Atome List Debug] effectiveOwner=${effectiveOwner || 'none'}, effectiveType=${effectiveType || 'none'}`);
                }

                // Build WHERE clause for deleted_at
                const deletedClause = include_deleted ? '' : 'AND a.deleted_at IS NULL';

                let atomes;
                if (isUserDirectoryRequest) {
                  const dataSource = db.getDataSourceAdapter();
                  const directoryLimit = Number.isFinite(Number(limit)) ? Number(limit) : 1000;
                  const directoryOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
                  const sinceIso = (typeof since === 'string' && since.trim()) ? since.trim() : null;

                  const sinceClause = sinceIso ? "AND (a.updated_at > ? OR a.created_at > ?)" : '';
                  const params = sinceIso
                    ? [sinceIso, sinceIso, directoryLimit, directoryOffset]
                    : [directoryLimit, directoryOffset];

                  const rows = await dataSource.query(
                    `SELECT a.atome_id, a.atome_type, a.parent_id, a.owner_id, a.creator_id, a.created_at, a.updated_at, a.deleted_at,
                            MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                            MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                            MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility
                     FROM atomes a
                     LEFT JOIN particles p ON a.atome_id = p.atome_id
                     WHERE a.atome_type = 'user'
                       ${deletedClause}
                       ${sinceClause}
                       AND EXISTS (
                         SELECT 1 FROM particles pv
                         WHERE pv.atome_id = a.atome_id
                           AND pv.particle_key = 'visibility'
                           AND pv.particle_value = '"public"'
                       )
                     GROUP BY a.atome_id
                     ORDER BY a.created_at DESC
                     LIMIT ? OFFSET ?`,
                    params
                  );

                  atomes = rows.map((row) => {
                    const parse = (val) => {
                      if (!val) return null;
                      try { return JSON.parse(val); } catch (error) {
                        console.warn("[server] operation failed", error); return val;
                      }
                    };
                    return {
                      atome_id: row.atome_id,
                      atome_type: row.atome_type,
                      parent_id: row.parent_id,
                      owner_id: row.owner_id,
                      creator_id: row.creator_id,
                      created_at: row.created_at,
                      updated_at: row.updated_at,
                      deleted_at: row.deleted_at,
                      phone: parse(row.phone),
                      username: parse(row.username),
                      visibility: parse(row.visibility) || 'public'
                    };
                  });
                } else if (effectiveOwner && effectiveOwner !== 'anonymous') {
                  // List atomes accessible to this user (owned OR shared via permissions)
                  const dataSource = db.getDataSourceAdapter();
                  const pendingOwner = JSON.stringify(effectiveOwner);
                  const rows = await dataSource.query(
                    `SELECT a.*, 
                            GROUP_CONCAT(p.particle_key || ':' || p.particle_value, '||') as particles_raw
                     FROM atomes a
                     LEFT JOIN particles p ON a.atome_id = p.atome_id
                     LEFT JOIN permissions perm
                       ON perm.atome_id = a.atome_id
                      AND perm.principal_id = ?
                      AND perm.can_read = 1
                      AND (perm.expires_at IS NULL OR perm.expires_at > datetime('now'))
                     WHERE (a.owner_id = ? OR perm.permission_id IS NOT NULL
                       OR EXISTS (
                         SELECT 1 FROM particles p2
                         WHERE p2.atome_id = a.atome_id
                           AND p2.particle_key = '_pending_owner_id'
                           AND p2.particle_value = ?
                       ))
                       ${deletedClause}
                       ${effectiveType ? 'AND a.atome_type = ?' : ''}
                     GROUP BY a.atome_id
                     ORDER BY a.created_at DESC
                     LIMIT ? OFFSET ?`,
                    effectiveType
                      ? [effectiveOwner, effectiveOwner, pendingOwner, effectiveType, limit || 100, offset || 0]
                      : [effectiveOwner, effectiveOwner, pendingOwner, limit || 100, offset || 0]
                  );

                  // Parse particles
                  atomes = rows.map(row => {
                    const atome = {
                      atome_id: row.atome_id,
                      atome_type: row.atome_type,
                      parent_id: row.parent_id,
                      owner_id: row.owner_id,
                      creator_id: row.creator_id,
                      created_at: row.created_at,
                      updated_at: row.updated_at,
                      deleted_at: row.deleted_at // Include deleted_at for sync
                    };

                    if (row.particles_raw) {
                      const pairs = row.particles_raw.split('||');
                      for (const pair of pairs) {
                        const colonIdx = pair.indexOf(':');
                        if (colonIdx > 0) {
                          const key = pair.substring(0, colonIdx);
                          const value = pair.substring(colonIdx + 1);
                          try {
                            atome[key] = JSON.parse(value);
                          } catch (error) {
                            console.warn("[server] operation failed", error);
                            atome[key] = value;
                          }
                        }
                      }
                    }
                    return atome;
                  });

                  // Enforce conditional permissions (rules/expiry) at read time.
                  if (requesterId) {
                    const filtered = [];
                    for (const atome of atomes) {
                      const id = atome?.atome_id;
                      if (!id) continue;
                      const allowed = await db.canRead(id, requesterId);
                      if (allowed) filtered.push(atome);
                    }
                    atomes = filtered;
                  }
                } else if (effectiveType) {
                  // List all atomes of a specific type (e.g., all users)
                  const dataSource = db.getDataSourceAdapter();
                  const rows = await dataSource.query(
                    `SELECT a.*, 
                            GROUP_CONCAT(p.particle_key || ':' || p.particle_value, '||') as particles_raw
                     FROM atomes a
                     LEFT JOIN particles p ON a.atome_id = p.atome_id
                     WHERE a.atome_type = ? ${deletedClause}
                     GROUP BY a.atome_id
                     ORDER BY a.created_at DESC
                     LIMIT ? OFFSET ?`,
                    [effectiveType, limit || 100, offset || 0]
                  );

                  // Parse particles
                  atomes = rows.map(row => {
                    const atome = {
                      atome_id: row.atome_id,
                      atome_type: row.atome_type,
                      parent_id: row.parent_id,
                      owner_id: row.owner_id,
                      creator_id: row.creator_id,
                      created_at: row.created_at,
                      updated_at: row.updated_at,
                      deleted_at: row.deleted_at // Include deleted_at for sync
                    };

                    if (row.particles_raw) {
                      const pairs = row.particles_raw.split('||');
                      for (const pair of pairs) {
                        const colonIdx = pair.indexOf(':');
                        if (colonIdx > 0) {
                          const key = pair.substring(0, colonIdx);
                          const value = pair.substring(colonIdx + 1);
                          try {
                            atome[key] = JSON.parse(value);
                          } catch (error) {
                            console.warn("[server] operation failed", error);
                            atome[key] = value;
                          }
                        }
                      }
                    }
                    return atome;
                  });
                } else {
                  atomes = [];
                }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  atomes
                });
              } else if (action === 'set-particle') {
                const { atome_id, key, value, author } = data;
                await commitAtomeEvent({
                  authenticatedUserId: requesterId || author,
                  event: {
                    atome_id,
                    kind: 'set',
                    payload: { props: { [key]: value } },
                    actor: { type: 'user', id: requesterId || author }
                  }
                });

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Particle set'
                });
              } else if (action === 'get-particle') {
                const { atome_id, key } = data;
                const value = await db.getParticle(atome_id, key);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  value
                });
              } else if (action === 'get-particles') {
                const { atome_id } = data;
                const particles = await db.getParticles(atome_id);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  particles
                });
              } else if (action === 'delete-particle') {
                const { atome_id, key } = data;
                await db.deleteParticle(atome_id, key);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Particle deleted'
                });
              } else {
                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: false,
                  error: `Unknown atome action: ${action}`
                });
              }
            } catch (error) {
              console.error(`❌ Atome WebSocket error: ${error.message}`);
              safeSend({
                type: 'atome-response',
                requestId,
                success: false,
                error: error.message
              });
            }
            return;
          }

          // Handle share requests (permissions) over ws/api
          if (data.type === 'share') {
            const requestId = data.requestId || data.request_id;
            const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
            if (!userId) {
              safeSend({
                type: 'share-response',
                requestId,
                success: false,
                error: 'share_request_auth_required'
              });
              return;
            }

            try {
              const response = await handleShareMessage(data, userId);
              safeSend({ type: 'share-response', ...response });
            } catch (error) {
              safeSend({
                type: 'share-response',
                requestId,
                success: false,
                error: error.message
              });
            }
            return;
          }

          // Handle shell commands (highly restricted)
          if (data.type === 'shell') {
            const requestId = data.requestId || data.request_id;
            const attachedUserId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;

            const authExpMs = connection && typeof connection._wsApiAuthExpMs === 'number' ? connection._wsApiAuthExpMs : null;
            if (!attachedUserId || (authExpMs && Date.now() >= authExpMs)) {
              safeSend({
                type: 'shell-response',
                requestId,
                success: false,
                error: attachedUserId ? 'ws/api authentication expired (re-auth required)' : 'Unauthenticated ws/api connection'
              });
              return;
            }

            try {
              const dataSource = db.getDataSourceAdapter();
              const user = await findUserById(dataSource, attachedUserId);
              const result = await executeShellCommand({
                payload: data,
                projectRoot,
                user: user ? { id: user.user_id, username: user.username, phone: user.phone } : { id: attachedUserId },
                connectionId: connection._wsApiConnectionId
              });

              safeSend({
                type: 'shell-response',
                requestId,
                ...result
              });
            } catch (error) {
              safeSend({
                type: 'shell-response',
                requestId,
                success: false,
                error: error.message
              });
            }
            return;
          }

          // Unknown message type: do not notify any client, log server-side only
          const unknownType = String(data?.type || '');
          if (!unknownMessageTypesSeen.has(unknownType)) {
            unknownMessageTypesSeen.add(unknownType);
            console.warn(`[ws/api] Unknown message type: ${unknownType}`);
          }
          return;
        });

        connection.on('close', () => {
          if (process.env.WS_CONNECTION_DEBUG === '1') {
            console.log('🔌 WebSocket API connection closed');
          }
        });

        connection.on('error', (error) => {
          console.error('❌ WebSocket API error:', error);
        });

        // Cleanup
        connection.on('close', () => {
          try { wsApiConnections.delete(connection); } catch (error) {
            console.warn("[server] operation failed", error);
          }
          detachWsApiClient(connection);
        });
      });
    });

    // Route WebSocket unifiée pour sync (inclut file events, atome events, version sync)
    server.register(async function (fastify) {
      // Route WebSocket pour sync GitHub et gestion clients Tauri/Browser
      fastify.get('/ws/sync', { websocket: true }, async (connection, request) => {
        const clientId = `client_${crypto.randomUUID()}`;
        const safeSend = (payload) => wsSendJson(connection, payload, { scope: 'ws/sync', op: 'send' });
        const syncEventBus = getSyncEventBus();
        let authenticated = false;
        let fileEventForwarder = null;
        let authTimer = null;

        const cleanup = () => {
          if (authTimer) clearTimeout(authTimer);
          authTimer = null;
          if (fileEventForwarder && syncEventBus) {
            syncEventBus.off('event', fileEventForwarder);
          }
          fileEventForwarder = null;
          detachWsApiClient(connection);
          unregisterClient(clientId);
        };

        const closeUnauthenticated = (code = 'authentication_required') => {
          safeSend({ type: 'error', code });
          cleanup();
          connection.close?.(4401, code);
        };

        const activate = async (userId) => {
          if (!userId || authenticated) return;
          authenticated = true;
          if (authTimer) clearTimeout(authTimer);
          authTimer = null;
          registerClient(clientId, connection, 'authenticated');
          fileEventForwarder = async (payload) => {
            try {
              const principalId = validateWsSyncPrincipal(connection);
              if (!principalId) {
                closeUnauthenticated('authentication_expired');
                return;
              }
              const event = await filterWsSyncEventForPrincipal(payload, principalId);
              if (!event) return;
              safeSend({
                type: 'event',
                eventType: event.eventType,
                payload: event.payload,
                timestamp: event.payload?.timestamp || new Date().toISOString()
              });
            } catch (error) {
              closeUnauthenticated('authentication_invalid');
            }
          };
          if (syncEventBus) syncEventBus.on('event', fileEventForwarder);
          const version = await getLocalVersion();
          safeSend(buildWsSyncWelcome(clientId, version));
        };

        try {
          await activate(authenticateWsSyncRequest(connection, request));
        } catch (error) {
          closeUnauthenticated('authentication_invalid');
          return;
        }

        if (!authenticated) {
          authTimer = setTimeout(() => closeUnauthenticated(), 5000);
        }

        connection.on('message', async (rawMessage) => {
          try {
            const data = JSON.parse(rawMessage.toString());
            if (!authenticated) {
              const userId = authenticateWsSyncMessage(connection, data);
              if (!userId) {
                closeUnauthenticated('authentication_required');
                return;
              }
              await activate(userId);
              return;
            }
            safeSend(handleWsSyncControlMessage(connection, data));
          } catch (error) {
            closeUnauthenticated('authentication_invalid');
          }
        });

        connection.on('close', cleanup);
        connection.on('error', cleanup);
      });
    });

    // ===========================
    // 4. DÉMARRAGE
    // ===========================

    // Start GitHub polling for auto-sync
    if (process.env.GITHUB_AUTO_SYNC !== 'false') {
      startGitHubPolling();
    }

    await server.listen({
      port: PORT,
      host: HOST
    });

    console.log(`✅ Fastify server v${server.version} started on http://localhost:${PORT} (Atome ${SERVER_VERSION}, eVe ${EVE_VERSION})`);
    console.log(`🔄 Sync WebSocket at ws://localhost:${PORT}/ws/sync`);
    console.log(`🌐 Frontend served from: http://localhost:${PORT}/`);

    if (SYNC_REMOTE_ENABLED) {
      console.log(`🔁 Sync queue enabled → ${TAURI_SYNC_URL}`);
      setTimeout(() => processSyncQueue().catch((err) => {
        console.warn('⚠️  Sync queue processing failed:', err?.message || err);
      }), 500);
      setInterval(() => {
        processSyncQueue().catch((err) => {
          console.warn('⚠️  Sync queue processing failed:', err?.message || err);
        });
      }, 2000);
    }

  } catch (error) {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  }
}

async function stopFileWatcher() {
  if (!fileSyncWatcherHandle) {
    return;
  }
  try {
    await stopABoxMonitoring();
    console.log('✅ File sync watcher stopped');
  } catch (error) {
    console.warn('⚠️  Error while stopping file watcher:', error?.message || error);
  } finally {
    fileSyncWatcherHandle = null;
  }
}

// ===========================
// 5. GESTION GRACEFUL SHUTDOWN
// ===========================

process.on('SIGINT', async () => {
  console.log('\n🛑 Server stopping...');
  try {
    await server.close();
    await stopFileWatcher();
    console.log('✅ Server stopped cleanly');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Signal SIGTERM received, stopping...');
  try {
    await server.close();
    await stopFileWatcher();
    console.log('✅ Server stopped cleanly');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
startServer();
