// Server Fastify v5 moderne avec WebSocket natif
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs, createReadStream, createWriteStream, readFileSync, existsSync, mkdirSync } from 'fs';
import crypto from 'crypto';
import pino from 'pino';
import { coerceLogEnvelope, isValidLogEnvelope } from '../src/shared/logging.js';

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
import { registerAuthRoutes, createUserAtome, findUserByPhone, findUserById, listAllUsers, updateUserParticle, deleteUserAtome, hashPassword, generateDeterministicUserId } from './auth.js';
import { registerAtomeRoutes } from './atomeRoutes.orm.js';
import { registerSharingRoutes, handleShareMessage } from './sharing.js';
import {
  initUserFiles,
  registerFileUpload,
  getFileMetadata,
  getUserFiles,
  getAccessibleFiles,
  canAccessFile,
  shareFile,
  unshareFile,
  setFilePublic,
  getFileStats
} from './userFiles.js';
import {
  startPolling as startGitHubPolling,
  stopPolling as stopGitHubPolling,
  registerClient,
  unregisterClient,
  handleClientMessage,
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

// Database imports - Using SQLite/libSQL (ADOLE data layer)
import db from '../database/adole.js';
import { v4 as uuidv4 } from 'uuid';

// Check if database is configured (SQLite path or libSQL URL)
const DB_CONFIGURED = Boolean(process.env.SQLITE_PATH || process.env.LIBSQL_URL);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const staticRoot = path.join(projectRoot, 'src');
const SERVER_CONFIG_FILE = path.join(projectRoot, 'server_config.json');
const LOG_DIR = path.join(projectRoot, 'logs');
const FASTIFY_LOG_FILE = path.join(LOG_DIR, 'fastify.log');
const UPLOADS_TMP_DIR = path.join(projectRoot, 'data', 'uploads_tmp');
const BROWSER_LOG_FILE = path.join(LOG_DIR, 'browser.log');
const SNAPSHOT_DIR = path.join(LOG_DIR, 'snapshots');
const UI_TESTS_DIR = path.join(LOG_DIR, 'ui-tests');

try {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  mkdirSync(UI_TESTS_DIR, { recursive: true });
} catch (error) {
  console.warn('WARN: Unable to prepare log directories:', error?.message || error);
}
const legacyUploadsDir = (() => {
  try {
    return resolveUploadsDir();
  } catch (error) {
    const message = error?.message || error;
    console.warn('⚠️ Unable to resolve legacy uploads directory:', message);
    return null;
  }
})();
const VERSION_FILE = path.join(projectRoot, 'version.txt');
let SERVER_VERSION = 'unknown';
const SERVER_TYPE = 'Fastify';
const syncEventBus = getABoxEventBus();
let fileSyncWatcherHandle = null;
const recentErrors = [];
const MAX_RECENT_ERRORS = 100;

function recordRecentError(payload) {
  if (!payload) return;
  recentErrors.push(payload);
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.splice(0, recentErrors.length - MAX_RECENT_ERRORS);
  }
}

function sanitizeUploadId(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return null;
  return value;
}

function logStructured(level, { source = 'fastify', component = 'server', request_id = null, session_id = null, message = '', data = null } = {}) {
  const payload = {
    source,
    component,
    request_id,
    session_id,
    data
  };
  if (typeof server?.log?.[level] === 'function') {
    server.log[level](payload, message);
  } else {
    const fallback = { ...payload, level, timestamp: new Date().toISOString(), message };
    process.stdout.write(`${JSON.stringify(fallback)}\n`);
  }
}

async function loadServerVersion() {
  try {
    const raw = await fs.readFile(VERSION_FILE, 'utf8');
    const trimmed = raw.trim();
    return trimmed || 'unknown';
  } catch (error) {
    const details = error && typeof error === 'object' && 'message' in error
      ? error.message
      : String(error);
    console.warn('⚠️ Impossible de lire version.txt:', details);
    return 'unknown';
  }
}

function resolveUploadsDir() {
  const customDir = typeof process.env.SQUIRREL_UPLOADS_DIR === 'string'
    ? process.env.SQUIRREL_UPLOADS_DIR.trim()
    : '';

  if (!customDir) {
    return null;
  }

  const absolute = path.isAbsolute(customDir)
    ? customDir
    : path.join(projectRoot, customDir);
  return path.resolve(absolute);
}

async function listLegacyUploads() {
  if (!legacyUploadsDir) return [];
  const entries = await fs.readdir(legacyUploadsDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const safeName = sanitizeFileName(entry.name);
    const absolutePath = path.join(legacyUploadsDir, safeName);
    try {
      const stats = await fs.stat(absolutePath);
      files.push({
        name: safeName,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        origin: 'legacy'
      });
    } catch (error) {
      console.warn('⚠️ Impossible de lire les métadonnées pour', absolutePath, error);
    }
  }

  files.sort((a, b) => b.modified.localeCompare(a.modified));
  return files;
}

function resolveUserId(user) {
  const direct = user?.id || user?.userId || user?.user_id;
  if (direct !== undefined && direct !== null) {
    const text = String(direct).trim();
    if (text) return text;
  }

  const phone = user?.phone || user?.user_phone || user?.userPhone;
  if (phone !== undefined && phone !== null) {
    const text = String(phone).trim();
    if (text) return generateDeterministicUserId(text);
  }

  const fallback = user?.username || user?.name;
  if (fallback !== undefined && fallback !== null) {
    const text = String(fallback).trim();
    if (text) return text;
  }

  return 'anonymous';
}

function pickDisplayName(file, fallbackName) {
  if (typeof file?.original_name === 'string' && file.original_name.trim()) {
    return file.original_name;
  }
  if (typeof file?.file_name === 'string' && file.file_name.trim()) {
    return file.file_name;
  }
  if (typeof file?.name === 'string' && file.name.trim()) {
    return file.name;
  }
  return fallbackName;
}

async function listUserDownloads(userId) {
  const { downloadsDir } = await ensureUserDownloadsDir(projectRoot, { id: userId });
  const entries = await fs.readdir(downloadsDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const safeName = sanitizeFileName(entry.name);
    const absolutePath = path.join(downloadsDir, safeName);
    try {
      const stats = await fs.stat(absolutePath);
      files.push({
        name: safeName,
        file_name: safeName,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        owner_id: userId,
        access: 'owner',
        shared: false
      });
    } catch (error) {
      console.warn('⚠️ Impossible de lire les métadonnées pour', absolutePath, error);
    }
  }

  files.sort((a, b) => b.modified.localeCompare(a.modified));
  return files;
}

async function listUploadsForUser(userId) {
  if (!DATABASE_ENABLED) {
    return listUserDownloads(userId);
  }

  const accessible = await getAccessibleFiles(userId);
  const files = [];

  for (const entry of (accessible || [])) {
    const ownerId = entry.owner_id || userId;
    const safeName = typeof entry.file_name === 'string' && entry.file_name.trim()
      ? entry.file_name
      : sanitizeFileName(entry.original_name || entry.name || 'upload.bin');
    let stats = null;
    try {
      const filePath = await resolveUserFilePath(projectRoot, ownerId, safeName);
      stats = await fs.stat(filePath);
    } catch (_) {
      stats = null;
    }

    const parsedSize = typeof entry.size === 'number' ? entry.size : Number(entry.size);
    files.push({
      id: entry.atome_id,
      name: pickDisplayName(entry, safeName),
      file_name: safeName,
      size: Number.isFinite(parsedSize) ? parsedSize : (stats?.size || 0),
      modified: stats?.mtime?.toISOString() || entry.updated_at || entry.created_at || null,
      owner_id: ownerId,
      access: entry.access || (ownerId === userId ? 'owner' : 'read'),
      shared: ownerId !== userId
    });
  }

  if (userId === 'anonymous') {
    const legacy = await listLegacyUploads();
    const mapped = legacy.map((file) => ({
      id: null,
      name: file.name,
      file_name: file.name,
      size: file.size || 0,
      modified: file.modified || null,
      owner_id: userId,
      access: 'owner',
      shared: false,
      legacy: true
    }));
    files.push(...mapped);
  }

  const toTimestamp = (value) => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  files.sort((a, b) => toTimestamp(b.modified) - toTimestamp(a.modified));
  return files;
}

async function resolveDownloadTarget(fileParam, userId) {
  const raw = typeof fileParam === 'string' ? fileParam : String(fileParam || '');
  const safeParam = raw.trim();

  if (DATABASE_ENABLED && safeParam) {
    let meta = await getFileMetadata(safeParam);
    if (meta && meta.atome_id !== safeParam) {
      meta = null;
    }

    if (!meta) {
      meta = await getFileMetadata(safeParam, { userId });
    }

    if (meta) {
      const canRead = await canAccessFile(meta.atome_id, userId);
      if (!canRead) {
        return { error: 'Access denied', status: 403 };
      }
      const safeName = typeof meta.file_name === 'string' && meta.file_name.trim()
        ? meta.file_name
        : sanitizeFileName(meta.original_name || safeParam);
      const filePath = await resolveUserFilePath(projectRoot, meta.owner_id || userId, safeName);
      const downloadName = typeof meta.original_name === 'string' && meta.original_name.trim()
        ? meta.original_name
        : safeName;
      return { filePath, downloadName, meta };
    }
  }

  const fallbackName = sanitizeFileName(safeParam);

  if (userId === 'anonymous' && legacyUploadsDir) {
    const legacyPath = path.join(legacyUploadsDir, fallbackName);
    try {
      await fs.access(legacyPath);
      return { filePath: legacyPath, downloadName: fallbackName, meta: null };
    } catch (_) { }
  }

  try {
    const userPath = await resolveUserFilePath(projectRoot, userId, fallbackName);
    await fs.access(userPath);
    return { filePath: userPath, downloadName: fallbackName, meta: null };
  } catch (_) {
    return null;
  }
}

// HTTPS Configuration
let httpsOptions = null;
if (process.env.USE_HTTPS === 'true') {
  // Check multiple locations for certificates
  // 1. Production path (scripts_utils/certs)
  // 2. Legacy/Local path (certs/)
  const possibleDirs = [
    path.join(projectRoot, 'scripts_utils', 'certs'),
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
    console.warn('⚠️ USE_HTTPS is true but no valid certificates found in scripts_utils/certs/ or certs/');
  }
}

const logLevel = process.env.LOG_LEVEL || 'info';
const logStreams = pino.multistream([
  { stream: process.stdout },
  { stream: pino.destination({ dest: FASTIFY_LOG_FILE, sync: false }) }
]);

const logger = pino(
  {
    level: logLevel,
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level(label) {
        return { level: label };
      }
    },
    base: { source: 'fastify', component: 'http' }
  },
  logStreams
);

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

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
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

    // Always-on diagnostic endpoint (useful in production to confirm which code is running)
    server.get('/__whoami', async () => {
      return {
        success: true,
        type: SERVER_TYPE,
        appVersion: SERVER_VERSION,
        fingerprint: getServerFingerprint()
      };
    });

    server.get('/healthz', async () => {
      return {
        success: true,
        type: SERVER_TYPE,
        appVersion: SERVER_VERSION,
        uptime_sec: Number(process.uptime().toFixed(2))
      };
    });

    server.addHook('onRequest', async (request, reply) => {
      request.request_id = request.id;
      request._requestStartMs = Date.now();
      reply.header('x-request-id', request.id);
    });

    server.addHook('onResponse', async (request, reply) => {
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

    SERVER_VERSION = await loadServerVersion();
    console.log(`📦 Version applicative: ${SERVER_VERSION}`);

    if (legacyUploadsDir) {
      await fs.mkdir(legacyUploadsDir, { recursive: true });
      console.log('📁 Legacy uploads directory:', legacyUploadsDir);
    } else {
      console.log('📁 Legacy uploads directory: disabled');
    }

    // Serve server_config.json from the real project root.
    // Static assets are served from `src/`, so we need an explicit route.
    server.get('/server_config.json', async (request, reply) => {
      try {
        const raw = await fs.readFile(SERVER_CONFIG_FILE, 'utf8');
        reply.header('content-type', 'application/json; charset=utf-8');
        reply.header('cache-control', 'no-store');
        let config;
        try {
          config = JSON.parse(raw);
        } catch (_) {
          return raw;
        }

        const disableUiLogs =
          process.env.SQUIRREL_DISABLE_UI_LOGS === '1'
          || process.env.SQUIRREL_DISABLE_UI_LOGS === 'true';

        if (disableUiLogs) {
          config.logging = {
            ...(config.logging || {}),
            disableUiLogs: true
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
        uptime_sec: Number(process.uptime().toFixed(2)),
        ws_api_connections: wsApiConnections.size,
        ws_api_users: wsApiClientsByUserId.size,
        recent_errors: recentErrors.slice(-20)
      };
    });

    const clientLogHandler = async (request, reply) => {
      const payload = coerceLogEnvelope(request.body, {
        source: 'browser',
        component: 'ui'
      });

      if (!isValidLogEnvelope(payload)) {
        return replyJson(reply, 400, { success: false, error: 'invalid log envelope' });
      }

      try {
        await fs.appendFile(BROWSER_LOG_FILE, `${JSON.stringify(payload)}\n`);
      } catch (error) {
        const message = error?.message || String(error);
        return replyJson(reply, 500, { success: false, error: message });
      }

      return { success: true };
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
    await initUserFiles(legacyUploadsDir || 'per-user Downloads');

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

    // CORS for development and cross-origin requests
    await server.register(fastifyCors, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'X-Client-Id',
        'X-Filename',
        'X-Original-Name',
        'X-File-Path',
        'X-Atome-Id',
        'X-Atome-Type',
        'X-Mime-Type',
        'X-User-Id',
        'X-UserId',
        'X-Username',
        'X-User-Name',
        'X-Phone',
        'X-User-Phone'
      ]
    });

    // Servir les fichiers statiques depuis staticRoot (../src en dev)
    await server.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/'
    });

    // WebSocket natif Fastify v5
    await server.register(fastifyWebsocket);

    server.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => {
      done(null, body);
    });

    // ===========================
    // 2. ROUTES API
    // ===========================

    // Helper function to validate token (for sharing routes)
    // SECURITY: always verify JWT signatures (never trust base64-decoded payload).
    const validateToken = async (request) => {
      const verifyJwt = async (token, options = {}) => {
        if (!token) return null;

        if (server.jwt && typeof server.jwt.verify === 'function') {
          return server.jwt.verify(token, options);
        }

        const jwt = await import('jsonwebtoken');
        const jwtSecret = process.env.JWT_SECRET || 'squirrel_jwt_secret_change_in_production';
        return jwt.default.verify(token, jwtSecret, options);
      };

      // Try Bearer token first
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          return await verifyJwt(token);
        } catch (_) {
          // Fall through to cookie check
        }
      }

      // Try cookie
      const cookieToken = request.cookies?.access_token;
      if (cookieToken) {
        try {
          return await verifyJwt(cookieToken);
        } catch (_) {
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

    const resolveUploadIdentity = async (request) => {
      const tokenUser = await validateToken(request);
      if (tokenUser) {
        return { user: tokenUser, userId: resolveUserId(tokenUser), source: 'token' };
      }
      const headerUser = resolveUserFromHeaders(request);
      if (headerUser) {
        return { user: headerUser, userId: resolveUserId(headerUser), source: 'headers' };
      }
      return { user: null, userId: 'anonymous', source: 'anonymous' };
    };

    // Register authentication routes (login, register, logout, OTP, etc.)
    if (DATABASE_ENABLED) {
      // Get TypeORM-compatible adapter from Knex ORM
      const dataSourceAdapter = db.getDataSourceAdapter();

      await registerAuthRoutes(server, dataSourceAdapter, {
        jwtSecret: process.env.JWT_SECRET,
        cookieSecret: process.env.COOKIE_SECRET,
        isProduction: process.env.NODE_ENV === 'production'
      });

      // Register Atome API routes (uses Knex directly, dataSource param is legacy)
      registerAtomeRoutes(server, dataSourceAdapter);

      // Register Sharing routes
      registerSharingRoutes(server, validateToken);
    } else {
      // Provide stub routes that return 503 when DB is not configured
      server.post('/api/auth/register', async (req, reply) => replyJson(reply, 503, { success: false, error: DB_REQUIRED_MESSAGE }));
      server.post('/api/auth/login', async (req, reply) => replyJson(reply, 503, { success: false, error: DB_REQUIRED_MESSAGE }));
      server.post('/api/auth/logout', async (req, reply) => replyJson(reply, 503, { success: false, error: DB_REQUIRED_MESSAGE }));
      server.get('/api/auth/me', async (req, reply) => replyJson(reply, 503, { success: false, error: DB_REQUIRED_MESSAGE }));
      server.put('/api/auth/update', async (req, reply) => replyJson(reply, 503, { success: false, error: DB_REQUIRED_MESSAGE }));
      server.post('/api/auth/request-otp', async (req, reply) => replyJson(reply, 503, { success: false, error: DB_REQUIRED_MESSAGE }));
      server.post('/api/auth/reset-password', async (req, reply) => replyJson(reply, 503, { success: false, error: DB_REQUIRED_MESSAGE }));
    }

    server.get('/api/server-info', async () => {
      return {
        success: true,
        version: SERVER_VERSION,
        type: SERVER_TYPE
      };
    });

    // Health check endpoint for load balancers and monitoring
    server.get('/health', async () => {
      return {
        status: 'ok',
        version: SERVER_VERSION,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: DATABASE_ENABLED ? 'connected' : 'disabled'
      };
    });

    server.post('/api/uploads', async (request, reply) => {
      try {
        // Get user info if authenticated (optional for uploads)
        const user = await validateToken(request);
        const userId = resolveUserId(user);

        const headerValue = Array.isArray(request.headers['x-filename'])
          ? request.headers['x-filename'][0]
          : request.headers['x-filename'];
        const pathHeader = Array.isArray(request.headers['x-file-path'])
          ? request.headers['x-file-path'][0]
          : request.headers['x-file-path'];

        if (!headerValue && !pathHeader) {
          reply.code(400);
          return { success: false, error: 'Missing X-Filename header' };
        }

        let decodedName = headerValue ? String(headerValue) : '';
        try {
          decodedName = decodedName ? decodeURIComponent(decodedName) : decodedName;
        } catch {
          // Keep original value if decoding fails
        }

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
          const atomeTypeHeader = Array.isArray(request.headers['x-atome-type'])
            ? request.headers['x-atome-type'][0]
            : request.headers['x-atome-type'];
          const originalNameHeader = Array.isArray(request.headers['x-original-name'])
            ? request.headers['x-original-name'][0]
            : request.headers['x-original-name'];
          const mimeHeader = Array.isArray(request.headers['x-mime-type'])
            ? request.headers['x-mime-type'][0]
            : request.headers['x-mime-type'];

          await registerFileUpload(fileName, userId, {
            atomeId: atomeIdHeader || null,
            atomeType: atomeTypeHeader || null,
            originalName: originalNameHeader || decodedName || fileName,
            mimeType: mimeHeader || request.headers['content-type'] || null,
            size: bodyBuffer.length,
            filePath: relativePath || null
          });
        }

        return { success: true, file: fileName, owner: userId, path: relativePath || null };
      } catch (error) {
        request.log.error({ err: error }, 'File upload failed');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/uploads/chunk', async (request, reply) => {
      try {
        // Get user info if authenticated (optional for uploads)
        const user = await validateToken(request);
        const userId = resolveUserId(user);

        const headerValue = Array.isArray(request.headers['x-filename'])
          ? request.headers['x-filename'][0]
          : request.headers['x-filename'];
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

        let decodedName = String(headerValue);
        try {
          decodedName = decodeURIComponent(decodedName);
        } catch {
          // Keep original value if decoding fails
        }

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
        // Get user info if authenticated (optional for uploads)
        const user = await validateToken(request);
        const userId = resolveUserId(user);

        const headerValue = Array.isArray(request.headers['x-filename'])
          ? request.headers['x-filename'][0]
          : request.headers['x-filename'];
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

        let decodedName = String(headerValue);
        try {
          decodedName = decodeURIComponent(decodedName);
        } catch {
          // Keep original value if decoding fails
        }

        const uploadDir = path.join(UPLOADS_TMP_DIR, safeUploadId);
        const { fileName, filePath } = await resolveUserUploadPath(
          projectRoot,
          { id: userId, username: user?.username },
          decodedName
        );

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

        try {
          await fs.rm(uploadDir, { recursive: true, force: true });
        } catch (_) { }

        if (DATABASE_ENABLED) {
          const mimeType = request.headers['x-mime-type'] || null;
          const stats = await fs.stat(filePath).catch(() => null);
          await registerFileUpload(fileName, userId, {
            originalName: decodedName,
            mimeType: mimeType || null,
            size: stats ? stats.size : null
          });
        }

        return { success: true, file: fileName, owner: userId };
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

      const { fileId, atomeId, fileName, targetUserId, permission } = request.body || {};
      const fileIdentifier = fileId || atomeId || fileName;

      if (!fileIdentifier || !targetUserId) {
        return replyJson(reply, 400, { success: false, error: 'Missing file identifier or targetUserId' });
      }

      const userId = resolveUserId(user);
      const result = await shareFile(fileIdentifier, userId, targetUserId, permission || 'read');

      if (!result.success) {
        return replyJson(reply, 403, result);
      }

      if (result.file?.file_name) {
        const link = await ensureSharedFileLink({
          projectRoot,
          ownerId: result.file.owner_id,
          targetUserId,
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

      const { fileId, atomeId, fileName, targetUserId } = request.body || {};
      const fileIdentifier = fileId || atomeId || fileName;

      if (!fileIdentifier || !targetUserId) {
        return replyJson(reply, 400, { success: false, error: 'Missing file identifier or targetUserId' });
      }

      const userId = resolveUserId(user);
      const result = await unshareFile(fileIdentifier, userId, targetUserId);

      if (!result.success) {
        return replyJson(reply, 403, result);
      }

      if (result.file?.file_name) {
        const link = await removeSharedFileLink({
          projectRoot,
          ownerId: result.file.owner_id,
          targetUserId,
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

      const { fileId, atomeId, fileName, isPublic } = request.body || {};
      const fileIdentifier = fileId || atomeId || fileName;

      if (!fileIdentifier || typeof isPublic !== 'boolean') {
        return replyJson(reply, 400, { success: false, error: 'Missing file identifier or isPublic' });
      }

      const userId = resolveUserId(user);
      const meta = await getFileMetadata(fileIdentifier, { ownerId: userId });
      if (!meta) {
        return replyJson(reply, 404, { success: false, error: 'File not found' });
      }

      const result = await setFilePublic(meta.atome_id, userId, isPublic);

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

      // TODO: Check if user is admin
      const stats = await getFileStats();

      return { success: true, data: stats };
    });

    /**
     * GET /api/adole/debug/tables
     * List all tables in the database (for debugging)
     */
    server.get('/api/adole/debug/tables', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const dataSourceAdapter = db.getDataSourceAdapter();
        const rows = await dataSourceAdapter.query(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        const tables = rows.map(r => r.name);
        console.log(`[Debug] Listed ${tables.length} tables from LibSQL`);
        return { success: true, database: 'Fastify/LibSQL', tables };
      } catch (error) {
        request.log.error({ err: error }, 'List tables failed');
        return reply.code(500).send({ success: false, error: error.message });
      }
    });

    // NOTE: User management is now handled via /api/auth/* routes in auth.js
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
        const { userId } = await resolveUploadIdentity(request);
        const fileParam = request.params.file || '';
        const target = await resolveDownloadTarget(fileParam, userId);

        if (!target?.filePath) {
          const status = target?.status || 404;
          reply.code(status);
          return { success: false, error: target?.error || 'File not found' };
        }

        await fs.access(target.filePath);
        reply.header('Content-Disposition', `attachment; filename="${target.downloadName}"`);
        reply.type('application/octet-stream');
        return reply.send(createReadStream(target.filePath));
      } catch (error) {
        request.log.error({ err: error }, 'Unable to download upload');
        const status = error?.status || 404;
        reply.code(status);
        return { success: false, error: error?.error || error?.message || 'File not found' };
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
          schema: 'atomes, particles, particles_versions, snapshots, permissions, sync_queue, sync_state',
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
      fastify.get('/ws/api', { websocket: true }, async (connection) => {
        // Assign a stable connection id for audit/debugging (server-side only)
        try {
          const crypto = await import('crypto');
          connection._wsApiConnectionId = crypto.randomUUID();
        } catch (_) {
          connection._wsApiConnectionId = `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        }

        if (process.env.WS_CONNECTION_DEBUG === '1') {
          console.log('🔗 New WebSocket API connection');
        }

        try { wsApiConnections.add(connection); } catch (_) { }

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
              } catch (_) { }

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
                } catch (_) {
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
                  } catch (_) {
                    targetUserId = null;
                  }
                }
              }

              // If userId was provided, optionally enrich with DB data.
              if (targetUserId && !targetUser) {
                try {
                  targetUser = await findUserById(dataSource, targetUserId);
                } catch (_) {
                  targetUser = null;
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

          // Handle debug requests (ADOLE v3.0)
          if (data.type === 'debug') {
            const action = data.action || '';
            const requestId = data.requestId;

            if (action === 'list-tables') {
              try {
                const dataSource = db.getDataSourceAdapter();
                const result = await dataSource.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
                const tables = result.map(row => row.name);
                safeSend({
                  type: 'debug-response',
                  requestId,
                  success: true,
                  tables
                });
              } catch (error) {
                safeSend({
                  type: 'debug-response',
                  requestId,
                  success: false,
                  error: error.message
                });
              }
            } else {
              safeSend({
                type: 'debug-response',
                requestId,
                success: false,
                error: `Unknown debug action: ${action}`
              });
            }
            return;
          }

          // Handle API requests
          if (data.type === 'api-request') {
            const { id, method, path, body, headers } = data;

            try {
              // Inject the request through Fastify's internal router
              const response = await server.inject({
                method: method || 'GET',
                url: path,
                payload: body,
                headers: {
                  'content-type': 'application/json',
                  ...headers
                }
              });

              safeSend({
                type: 'api-response',
                id,
                response: {
                  status: response.statusCode,
                  headers: response.headers,
                  body: response.json ? response.json() : response.payload
                }
              });
            } catch (error) {
              safeSend({
                type: 'api-response',
                id,
                error: error.message || 'Internal server error'
              });
            }
            return;
          }

          // Handle auth requests (ADOLE v3.0 WebSocket-only)
          if (data.type === 'auth') {
            const action = data.action || '';
            const requestId = data.requestId;

            // Get dataSource adapter for auth functions
            const dataSource = db.getDataSourceAdapter();

            try {
              if (action === 'register' || action === 'create-user') {
                const { username, phone, password, visibility } = data;
                if (!username || !phone || !password) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'Missing required fields: username, phone, password'
                  });
                  return;
                }

                // Check if user already exists
                const existingUser = await findUserByPhone(dataSource, phone);
                if (existingUser) {
                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: false,
                    error: 'User with this phone already exists'
                  });
                  return;
                }

                // Hash password and create user
                // visibility: 'public' = visible in user_list (default), 'private' = hidden
                const passwordHash = await hashPassword(password);
                const userId = generateDeterministicUserId(phone);
                await createUserAtome(dataSource, userId, username, phone, passwordHash, visibility || 'public');

                // Broadcast account creation for real-time directory sync (ws/sync)
                try {
                  if (syncEventBus) {
                    const now = new Date().toISOString();
                    syncEventBus.emit('event', {
                      type: 'sync:account-created',
                      timestamp: now,
                      runtime: 'Fastify',
                      payload: {
                        userId,
                        username,
                        phone,
                        optional: data.optional || {}
                      }
                    });

                    // Legacy compatibility
                    syncEventBus.emit('event', {
                      type: 'sync:user-created',
                      timestamp: now,
                      runtime: 'Fastify',
                      payload: {
                        userId,
                        username,
                        phone,
                        source: 'fastify'
                      }
                    });
                  }
                } catch (_) { }

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  userId,
                  message: 'User created successfully'
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
                    try { visibility = JSON.parse(rows[0].particle_value); } catch { visibility = rows[0].particle_value; }
                  }
                } catch (_) { }

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
                    const jwtSecret = process.env.JWT_SECRET || 'squirrel_jwt_secret_change_in_production';
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
                } catch (_) { }

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
                const jwtSecret = process.env.JWT_SECRET || 'squirrel_jwt_secret_change_in_production';
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
                } catch (_) {
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
                  const jwtSecret = process.env.JWT_SECRET || 'squirrel_jwt_secret_change_in_production';
                  const decoded = jwt.default.verify(token, jwtSecret);
                  const decodedUserId = decoded.userId || decoded.id || decoded.user_id || decoded.sub || null;
                  const user = decodedUserId ? await findUserById(dataSource, String(decodedUserId)) : null;

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
            const requestId = data.requestId;

            // Resolve requester identity:
            // - Prefer the attached ws identity (fast path)
            // - Enforce expiry
            // - If missing (or expired), verify JWT from the message and attach the connection
            let requesterId = connection?._wsApiUserId || null;

            try {
              const authExpMs = connection && typeof connection._wsApiAuthExpMs === 'number' ? connection._wsApiAuthExpMs : null;
              if (requesterId && authExpMs && Date.now() >= authExpMs) {
                // Stale connection identity
                detachWsApiClient(connection);
                requesterId = null;
              }
            } catch (_) { }

            if (!requesterId && data.token) {
              try {
                const jwt = await import('jsonwebtoken');
                const jwtSecret = process.env.JWT_SECRET || 'squirrel_jwt_secret_change_in_production';
                const decoded = jwt.default.verify(String(data.token), jwtSecret);
                const decodedUserId = decoded?.userId || decoded?.id || decoded?.user_id || decoded?.sub || null;
                if (decodedUserId) {
                  requesterId = String(decodedUserId);
                  attachWsApiClientToUser(connection, requesterId);
                  if (decoded && typeof decoded.exp === 'number') {
                    connection._wsApiAuthExpMs = decoded.exp * 1000;
                  }
                }
              } catch (_) {
                requesterId = null;
              }
            }

            // Last-resort fallback (legacy callers). Prefer not to rely on this.
            if (!requesterId) {
              requesterId = data.userId || data.ownerId || data.owner_id || null;
            }

            try {
              if (action === 'create') {
                // Support multiple field names for ADOLE v3.0 compatibility
                const atomeId = data.id || data.atomeId || data.atome_id || uuidv4();
                const atomeType = data.atomeType || data.atome_type || data.type || 'generic';
                const parentId = data.parentId || data.parent_id || data.parent;
                let ownerId = data.userId || data.ownerId || data.owner_id || data.owner;
                if (!ownerId || ownerId === 'anonymous') {
                  ownerId = requesterId || null;
                }
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

                const result = await db.createAtome({
                  id: atomeId,
                  type: atomeType,
                  kind: data.kind,
                  parent: parentId,
                  owner: ownerId,
                  creator: data.creator,
                  properties: particles
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
                } catch (_) { }

                try {
                  await broadcastAtomeCreate({
                    atomeId,
                    atomeType,
                    parentId: parentId || null,
                    particles,
                    senderUserId: requesterId,
                    senderConnection: connection
                  });
                } catch (_) { }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  atome: result
                });
              } else if (action === 'get') {
                // Support both: { id } and { atomeId }
                const atomeId = data.atomeId || data.id;

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
                const atomeId = data.atomeId || data.id;
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
                } catch (_) { }

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
                // Support both formats: 
                // - Legacy: { id, properties, author }
                // - ADOLE v3.0: { atomeId, particles, token }
                const atomeId = data.atomeId || data.id;
                const particles = data.particles || data.properties;
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

                await db.updateAtome(atomeId, particles, author);

                // Realtime collaboration: broadcast patch to share recipients
                try {
                  await broadcastAtomeRealtimePatch({ atomeId, particles, senderUserId: requesterId, senderConnection: connection });
                } catch (_) { }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Atome updated'
                });
              } else if (action === 'alter') {
                // ADOLE v3.0: partial update of specific particles
                const atomeId = data.atomeId || data.id;
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

                // Alter uses updateAtome with partial particles
                await db.updateAtome(atomeId, particles);

                // Realtime collaboration: broadcast patch to share recipients
                try {
                  await broadcastAtomeRealtimePatch({ atomeId, particles, senderUserId: requesterId, senderConnection: connection });
                } catch (_) { }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Atome altered'
                });
              } else if (action === 'delete' || action === 'soft-delete') {
                // Support both: { id } and { atomeId }
                // Note: This is a SOFT delete (sets deleted_at)
                const atomeId = data.atomeId || data.id;

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
                } catch (_) { }

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Atome deleted'
                });
              } else if (action === 'list') {
                const { ownerId, userId, atomeType, limit, offset, includeDeleted, since } = data;
                const effectiveType = atomeType;
                const requestedOwner = (ownerId === '*' || ownerId === 'all') ? null : (ownerId || userId);
                const effectiveOwner = requesterId || requestedOwner;

                // Special-case: public user directory listing
                // If the client requests atomeType='user' with no explicit owner filter,
                // return all PUBLIC users (visibility='public') instead of "only my own user".
                // This is critical for sharing workflows (recipient discovery) and must work
                // even when authenticated.
                const isUserDirectoryRequest = effectiveType === 'user' && !requestedOwner;

                if (process.env.ATOME_LIST_DEBUG === '1') {
                  console.log(`[Atome List Debug] ownerId=${ownerId}, userId=${userId}, atomeType=${atomeType}, includeDeleted=${includeDeleted}`);
                  console.log(`[Atome List Debug] effectiveOwner=${effectiveOwner || 'none'}, effectiveType=${effectiveType || 'none'}`);
                }

                // Build WHERE clause for deleted_at
                const deletedClause = includeDeleted ? '' : 'AND a.deleted_at IS NULL';

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
                      try { return JSON.parse(val); } catch { return val; }
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
                          } catch {
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
                          } catch {
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
                const { atomeId, key, value, author } = data;
                await db.setParticle(atomeId, key, value, author);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Particle set'
                });
              } else if (action === 'get-particle') {
                const { atomeId, key } = data;
                const value = await db.getParticle(atomeId, key);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  value
                });
              } else if (action === 'get-particles') {
                const { atomeId } = data;
                const particles = await db.getParticles(atomeId);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  particles
                });
              } else if (action === 'delete-particle') {
                const { atomeId, key } = data;
                await db.deleteParticle(atomeId, key);

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
            const requestId = data.requestId;
            const userId = connection?._wsApiUserId || data.userId || null;

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
          try { wsApiConnections.delete(connection); } catch (_) { }
          detachWsApiClient(connection);
        });
      });
    });

    // Route WebSocket unifiée pour sync (inclut file events, atome events, version sync)
    server.register(async function (fastify) {
      // Route WebSocket pour sync GitHub et gestion clients Tauri/Browser
      fastify.get('/ws/sync', { websocket: true }, async (connection) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        if (process.env.WS_CONNECTION_DEBUG === '1') {
          console.log('🔗 Nouvelle connexion sync:', clientId);
        }

        // Helper for safe sending
        const safeSend = (payload) => wsSendJson(connection, payload, { scope: 'ws/sync', op: 'send' });

        // Register client
        registerClient(clientId, connection, 'unknown');

        // Send initial version info + watcher status
        const version = await getLocalVersion();
        safeSend({
          type: 'welcome',
          clientId,
          version: version.version,
          protectedPaths: version.protectedPaths || [],
          timestamp: new Date().toISOString(),
          watcherEnabled: Boolean(fileSyncWatcherHandle),
          watcherConfig: fileSyncWatcherHandle?.config ?? null
        });

        // Forward selected sync events to this client.
        // IMPORTANT: do not depend on the file watcher being enabled.
        // We also use the same event bus to broadcast account and other sync events.
        let fileEventForwarder = null;
        fileEventForwarder = (payload) => {
          const type = payload && typeof payload.type === 'string' ? payload.type : '';
          if (!type) return;

          // File events (only meaningful if watcher is enabled)
          if (type === 'sync:file-event' || type === 'file-event') {
            if (fileSyncWatcherHandle) safeSend(payload);
            return;
          }

          // Account events (always forward)
          if (type === 'sync:account-created' || type === 'sync:account-deleted' || type === 'account-created' || type === 'account-deleted') {
            safeSend(payload);
            return;
          }

          // Legacy compatibility
          if (type === 'sync:user-created' || type === 'sync:user-deleted') {
            safeSend(payload);
            return;
          }
        };
        syncEventBus.on('event', fileEventForwarder);

        connection.on('message', async (message) => {
          try {
            const response = await handleClientMessage(clientId, message.toString());
            if (response) {
              safeSend(response);
            }
          } catch (error) {
            safeSend({ type: 'error', message: error.message });
          }
        });

        connection.on('close', () => {
          if (fileEventForwarder) {
            syncEventBus.off('event', fileEventForwarder);
          }
          unregisterClient(clientId);
        });

        connection.on('error', (error) => {
          console.error('❌ Erreur WebSocket sync:', error);
          if (fileEventForwarder) {
            syncEventBus.off('event', fileEventForwarder);
          }
          unregisterClient(clientId);
        });
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

    console.log(`✅ Fastify server v${server.version} (app ${SERVER_VERSION}) started on http://localhost:${PORT}`);
    console.log(`🔄 Sync WebSocket at ws://localhost:${PORT}/ws/sync`);
    console.log(`🌐 Frontend served from: http://localhost:${PORT}/`);

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
