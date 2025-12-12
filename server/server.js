// Server Fastify v5 moderne avec WebSocket natif
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs, createReadStream, readFileSync, existsSync } from 'fs';

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
import { registerSharingRoutes } from './sharing.js';
import {
  initUserFiles,
  registerFileUpload,
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

// Database imports - Using SQLite/libSQL (ADOLE data layer)
import db from '../database/adole.js';
import { v4 as uuidv4 } from 'uuid';

// Check if database is configured (SQLite path or libSQL URL)
const DB_CONFIGURED = Boolean(process.env.SQLITE_PATH || process.env.LIBSQL_URL);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const staticRoot = path.join(projectRoot, 'src');
const uploadsDir = (() => {
  try {
    return resolveUploadsDir();
  } catch (error) {
    const message = error?.message || error;
    console.error('❌ Unable to resolve uploads directory:', message);
    process.exit(1);
  }
})();
const VERSION_FILE = path.join(projectRoot, 'version.txt');
let SERVER_VERSION = 'unknown';
const SERVER_TYPE = 'Fastify';
const syncEventBus = getABoxEventBus();
let fileSyncWatcherHandle = null;

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
    throw new Error('SQUIRREL_UPLOADS_DIR is not defined. Set it via run.sh or export it before starting the server.');
  }

  const absolute = path.isAbsolute(customDir)
    ? customDir
    : path.join(projectRoot, customDir);
  return path.resolve(absolute);
}

const sanitizeFileName = (name) => {
  const base = typeof name === 'string' ? name : 'upload.bin';
  const cleaned = path.basename(base).replace(/[^a-z0-9._-]/gi, '_');
  return cleaned || 'upload.bin';
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveUploadPath(rawName) {
  const sanitized = sanitizeFileName(rawName);
  const ext = path.extname(sanitized);
  const stem = path.basename(sanitized, ext);
  let candidate = sanitized;
  let targetPath = path.join(uploadsDir, candidate);
  let counter = 1;
  while (await fileExists(targetPath)) {
    candidate = `${stem}_${counter}${ext}`;
    targetPath = path.join(uploadsDir, candidate);
    counter += 1;
  }
  return { fileName: candidate, filePath: targetPath };
}

async function listUploads() {
  const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const safeName = sanitizeFileName(entry.name);
    const absolutePath = path.join(uploadsDir, safeName);
    try {
      const stats = await fs.stat(absolutePath);
      files.push({
        name: safeName,
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    } catch (error) {
      console.warn('⚠️ Impossible de lire les métadonnées pour', absolutePath, error);
    }
  }

  files.sort((a, b) => b.modified.localeCompare(a.modified));
  return files;
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

// Créer l'instance Fastify
const server = fastify({
  https: httpsOptions,
  bodyLimit: 1024 * 1024 * 1024, // 1 GiB
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

const PORT = process.env.PORT || 3001;
const DATABASE_ENABLED = DB_CONFIGURED;
const DB_REQUIRED_MESSAGE = 'Database not configured. Set SQLITE_PATH or LIBSQL_URL/LIBSQL_AUTH_TOKEN.';

async function startServer() {
  try {
    console.log('🚀 Démarrage du serveur Fastify v5...');

    SERVER_VERSION = await loadServerVersion();
    console.log(`📦 Version applicative: ${SERVER_VERSION}`);

    await fs.mkdir(uploadsDir, { recursive: true });
    console.log('📁 Uploads directory:', uploadsDir);

    // Initialize user files tracking
    await initUserFiles(uploadsDir);

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
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Client-Id']
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
    const validateToken = async (request) => {
      // Try Bearer token first
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const [, payload] = token.split('.');
          const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
          return decoded;
        } catch (e) {
          // Fall through to cookie check
        }
      }

      // Try cookie
      const cookieToken = request.cookies?.access_token;
      if (cookieToken && server.jwt) {
        try {
          return server.jwt.verify(cookieToken);
        } catch (e) {
          return null;
        }
      }

      return null;
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
      server.post('/api/auth/register', async (req, reply) => reply.code(503).send({ success: false, error: DB_REQUIRED_MESSAGE }));
      server.post('/api/auth/login', async (req, reply) => reply.code(503).send({ success: false, error: DB_REQUIRED_MESSAGE }));
      server.post('/api/auth/logout', async (req, reply) => reply.code(503).send({ success: false, error: DB_REQUIRED_MESSAGE }));
      server.get('/api/auth/me', async (req, reply) => reply.code(503).send({ success: false, error: DB_REQUIRED_MESSAGE }));
      server.put('/api/auth/update', async (req, reply) => reply.code(503).send({ success: false, error: DB_REQUIRED_MESSAGE }));
      server.post('/api/auth/request-otp', async (req, reply) => reply.code(503).send({ success: false, error: DB_REQUIRED_MESSAGE }));
      server.post('/api/auth/reset-password', async (req, reply) => reply.code(503).send({ success: false, error: DB_REQUIRED_MESSAGE }));
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
        const userId = user?.id || user?.userId || 'anonymous';

        const headerValue = Array.isArray(request.headers['x-filename'])
          ? request.headers['x-filename'][0]
          : request.headers['x-filename'];
        if (!headerValue) {
          reply.code(400);
          return { success: false, error: 'Missing X-Filename header' };
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

        const { fileName, filePath } = await resolveUploadPath(decodedName);
        await fs.writeFile(filePath, bodyBuffer);

        // Register file ownership
        await registerFileUpload(fileName, userId, {
          originalName: decodedName,
          size: bodyBuffer.length
        });

        return { success: true, file: fileName, owner: userId };
      } catch (error) {
        request.log.error({ err: error }, 'File upload failed');
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
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const userId = user.id || user.userId;
      const files = getUserFiles(userId);

      return { success: true, data: files, count: files.length };
    });

    // Get all accessible files (owned + shared)
    server.get('/api/files/accessible', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const userId = user.id || user.userId;
      const files = getAccessibleFiles(userId);

      return { success: true, data: files, count: files.length };
    });

    // Share a file
    server.post('/api/files/share', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const { fileName, targetUserId, permission } = request.body || {};

      if (!fileName || !targetUserId) {
        return reply.status(400).send({ success: false, error: 'Missing fileName or targetUserId' });
      }

      const userId = user.id || user.userId;
      const result = await shareFile(fileName, userId, targetUserId, permission || 'read');

      if (!result.success) {
        return reply.status(403).send(result);
      }

      return result;
    });

    // Unshare a file
    server.post('/api/files/unshare', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const { fileName, targetUserId } = request.body || {};

      if (!fileName || !targetUserId) {
        return reply.status(400).send({ success: false, error: 'Missing fileName or targetUserId' });
      }

      const userId = user.id || user.userId;
      const result = await unshareFile(fileName, userId, targetUserId);

      if (!result.success) {
        return reply.status(403).send(result);
      }

      return result;
    });

    // Set file public/private
    server.post('/api/files/visibility', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const { fileName, isPublic } = request.body || {};

      if (!fileName || typeof isPublic !== 'boolean') {
        return reply.status(400).send({ success: false, error: 'Missing fileName or isPublic' });
      }

      const userId = user.id || user.userId;
      const result = await setFilePublic(fileName, userId, isPublic);

      if (!result.success) {
        return reply.status(403).send(result);
      }

      return result;
    });

    // Get file stats (admin)
    server.get('/api/files/stats', async (request, reply) => {
      const user = await validateToken(request);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      // TODO: Check if user is admin
      const stats = getFileStats();

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
        const files = await listUploads();
        return { success: true, files };
      } catch (error) {
        request.log.error({ err: error }, 'Unable to list uploads');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.get('/api/uploads/:file', async (request, reply) => {
      try {
        const fileParam = request.params.file || '';
        const safeName = sanitizeFileName(fileParam);
        const filePath = path.join(uploadsDir, safeName);

        await fs.access(filePath);
        reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
        reply.type('application/octet-stream');
        return reply.send(createReadStream(filePath));
      } catch (error) {
        request.log.error({ err: error }, 'Unable to download upload');
        reply.code(404);
        return { success: false, error: 'File not found' };
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
        console.log('🔗 New WebSocket API connection');

        const safeSend = (payload) => {
          try {
            connection.send(JSON.stringify(payload));
          } catch (error) {
            console.error('❌ WebSocket send error:', error);
          }
        };

        connection.on('message', async (message) => {
          let data;
          try {
            data = JSON.parse(message.toString());
          } catch (e) {
            safeSend({ type: 'error', message: 'Invalid JSON' });
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
                const { username, phone, password } = data;
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
                const passwordHash = await hashPassword(password);
                const userId = generateDeterministicUserId(phone);
                await createUserAtome(dataSource, userId, username, phone, passwordHash);

                safeSend({
                  type: 'auth-response',
                  requestId,
                  success: true,
                  userId,
                  message: 'User created successfully'
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
                  const user = await findUserById(dataSource, decoded.userId);

                  if (!user) {
                    safeSend({
                      type: 'auth-response',
                      requestId,
                      success: false,
                      error: 'User not found'
                    });
                    return;
                  }

                  safeSend({
                    type: 'auth-response',
                    requestId,
                    success: true,
                    ok: true,
                    user: {
                      id: user.user_id,
                      username: user.username,
                      phone: user.phone
                    }
                  });
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

            try {
              if (action === 'create') {
                // Support multiple field names for ADOLE v3.0 compatibility
                const atomeId = data.id || data.atomeId || data.atome_id || uuidv4();
                const atomeType = data.atomeType || data.atome_type || data.type || 'generic';
                const parentId = data.parentId || data.parent_id || data.parent;
                const ownerId = data.userId || data.ownerId || data.owner_id || data.owner;
                const particles = data.particles || data.properties || data.data || {};

                const result = await db.createAtome({
                  id: atomeId,
                  type: atomeType,
                  kind: data.kind,
                  parent: parentId,
                  owner: ownerId,
                  creator: data.creator,
                  properties: particles
                });

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  atome: result
                });
              } else if (action === 'get') {
                // Support both: { id } and { atomeId }
                const atomeId = data.atomeId || data.id;
                const atome = await db.getAtome(atomeId);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  atome
                });
              } else if (action === 'update') {
                // Support both formats: 
                // - Legacy: { id, properties, author }
                // - ADOLE v3.0: { atomeId, particles, token }
                const atomeId = data.atomeId || data.id;
                const particles = data.particles || data.properties;
                const author = data.author;

                console.log('[WS Update Debug] atomeId:', atomeId);
                console.log('[WS Update Debug] particles:', JSON.stringify(particles));
                console.log('[WS Update Debug] data keys:', Object.keys(data));

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

                await db.updateAtome(atomeId, particles, author);

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

                // Alter uses updateAtome with partial particles
                await db.updateAtome(atomeId, particles);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Atome altered'
                });
              } else if (action === 'delete') {
                // Support both: { id } and { atomeId }
                const atomeId = data.atomeId || data.id;
                await db.deleteAtome(atomeId);

                safeSend({
                  type: 'atome-response',
                  requestId,
                  success: true,
                  message: 'Atome deleted'
                });
              } else if (action === 'list') {
                const { ownerId, userId, atomeType, limit, offset } = data;
                const effectiveType = atomeType;
                const effectiveOwner = ownerId || userId;

                console.log(`[Atome List Debug] ownerId=${ownerId}, userId=${userId}, atomeType=${atomeType}`);
                console.log(`[Atome List Debug] effectiveOwner=${effectiveOwner}, effectiveType=${effectiveType}`);

                let atomes;
                if (effectiveOwner && effectiveOwner !== 'anonymous') {
                  // List atomes for a specific owner
                  atomes = await db.listAtomes(effectiveOwner, { type: effectiveType, limit, offset });
                } else if (effectiveType) {
                  // List all atomes of a specific type (e.g., all users)
                  const dataSource = db.getDataSourceAdapter();
                  const rows = await dataSource.query(
                    `SELECT a.*, 
                            GROUP_CONCAT(p.particle_key || ':' || p.particle_value, '||') as particles_raw
                     FROM atomes a
                     LEFT JOIN particles p ON a.atome_id = p.atome_id
                     WHERE a.atome_type = ? AND a.deleted_at IS NULL
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
                      updated_at: row.updated_at
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

          // Unknown message type
          safeSend({ type: 'error', message: `Unknown message type: ${data.type}` });
        });

        connection.on('close', () => {
          console.log('🔌 WebSocket API connection closed');
        });

        connection.on('error', (error) => {
          console.error('❌ WebSocket API error:', error);
        });
      });
    });

    // Route WebSocket unifiée pour sync (inclut file events, atome events, version sync)
    server.register(async function (fastify) {
      // Route WebSocket pour sync GitHub et gestion clients Tauri/Browser
      fastify.get('/ws/sync', { websocket: true }, async (connection) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('🔗 Nouvelle connexion sync:', clientId);

        // Helper for safe sending
        const safeSend = (payload) => {
          try {
            connection.send(JSON.stringify(payload));
          } catch (error) {
            console.error('❌ Impossible d\'envoyer un événement sync:', error);
          }
        };

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

        // Forward file watcher events to this client
        let fileEventForwarder = null;
        if (fileSyncWatcherHandle) {
          fileEventForwarder = (payload) => safeSend(payload);
          syncEventBus.on('event', fileEventForwarder);
        }

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
      host: '0.0.0.0'
    });

    console.log(`✅ Serveur Fastify v${server.version} (app ${SERVER_VERSION}) démarré sur http://localhost:${PORT}`);
    console.log(`🔄 Sync WebSocket sur ws://localhost:${PORT}/ws/sync`);
    console.log(`🌐 Frontend servi depuis: http://localhost:${PORT}/`);

  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
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
  console.log('\n🛑 Arrêt du serveur...');
  try {
    await server.close();
    await stopFileWatcher();
    console.log('✅ Serveur arrêté proprement');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de l\'arrêt:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Signal SIGTERM reçu, arrêt...');
  try {
    await server.close();
    await stopFileWatcher();
    console.log('✅ Serveur arrêté proprement');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de l\'arrêt:', error);
    process.exit(1);
  }
});

// Démarrer le serveur
startServer();
