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
import { registerAuthRoutes } from './auth.js';
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

// Database imports - Using Knex ORM (unified for SQLite/PostgreSQL)
import orm from '../database/orm.js';
import { v4 as uuidv4 } from 'uuid';

// Get PostgreSQL connection URL from environment (for DATABASE_ENABLED check)
const PG_URL = process.env.ADOLE_PG_DSN || process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;

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
const DATABASE_ENABLED = Boolean(PG_URL);
const DB_REQUIRED_MESSAGE = 'Database not configured. Set ADOLE_PG_DSN or PG_CONNECTION_STRING/DATABASE_URL.';

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
    // 0. DATABASE INITIALIZATION
    // ===========================

    if (DATABASE_ENABLED) {
      console.log('📊 Initialisation de la base de données...');

      try {
        // Initialize Knex ORM (unified SQLite/PostgreSQL layer)
        await orm.initDatabase();
        console.log('✅ Connexion à la base de données établie (Knex ORM)');
      } catch (error) {
        if (error && error.code === 'ECONNREFUSED') {
          console.error('❌ PostgreSQL connection refused. Start the database and retry.');
          console.error('   macOS (Homebrew): brew services start postgresql@16');
          console.error('   macOS (manual):  pg_ctl -D /usr/local/var/postgresql@16 start');
          console.error('   Linux (systemd): sudo systemctl start postgresql');
          console.error('   Windows:         Services.msc → start "PostgreSQL 16" or run "net start postgresql-x64-16"');
          console.error('   Docker (any OS): docker run --name squirrel-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=squirrel -p 5432:5432 -d postgres:16');
        }
        throw error;
      }

      console.log('✅ Schéma ADOLE prêt (Knex)');
    } else {
      console.warn('⚠️  Aucune base PostgreSQL configurée. Les routes dépendant de la base renverront 503.');
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
      const dataSourceAdapter = orm.getDataSourceAdapter();

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

    server.post('/api/adole/users', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      const {
        tenantId,
        tenantName,
        principalId,
        email,
        kind = 'user',
        username,
        phone,
        optional = {}
      } = request.body || {};

      const tenant_id = tenantId || uuidv4();
      const principal_id = principalId || uuidv4();
      const branch_id = uuidv4();
      const commit_id = uuidv4();
      const logical_clock = Date.now();
      const snapshot = {
        type: 'user_profile',
        username,
        phone,
        optional
      };

      try {
        const dataSourceAdapter = orm.getDataSourceAdapter();
        await dataSourceAdapter.manager.transaction(async (tx) => {
          await tx.query(
            `INSERT INTO tenants (tenant_id, name) VALUES ($1, $2) ON CONFLICT (tenant_id) DO UPDATE SET name = EXCLUDED.name`,
            [tenant_id, tenantName || username || 'tenant']
          );

          await tx.query(
            `INSERT INTO principals (tenant_id, principal_id, kind, email) VALUES ($1, $2, $3, $4) ON CONFLICT (principal_id) DO UPDATE SET email = EXCLUDED.email, kind = EXCLUDED.kind`,
            [tenant_id, principal_id, kind, email]
          );

          await tx.query(
            `INSERT INTO objects (object_id, tenant_id, type, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT (object_id) DO UPDATE SET type = EXCLUDED.type, created_by = EXCLUDED.created_by`,
            [principal_id, tenant_id, 'user_profile', principal_id]
          );

          await tx.query(
            `INSERT INTO branches (branch_id, tenant_id, object_id, name, is_default) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (branch_id) DO NOTHING`,
            [branch_id, tenant_id, principal_id, 'main', true]
          );

          await tx.query(
            `INSERT INTO commits (commit_id, tenant_id, object_id, branch_id, author_id, logical_clock, message) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (commit_id) DO NOTHING`,
            [commit_id, tenant_id, principal_id, branch_id, principal_id, logical_clock, 'profile upsert']
          );

          await tx.query(
            `INSERT INTO object_state (tenant_id, object_id, branch_id, version_seq, snapshot) VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (tenant_id, object_id, branch_id) DO UPDATE SET version_seq = EXCLUDED.version_seq, snapshot = EXCLUDED.snapshot, updated_at = now()`,
            [tenant_id, principal_id, branch_id, logical_clock, JSON.stringify(snapshot)]
          );
        });

        return {
          success: true,
          tenantId: tenant_id,
          principalId: principal_id,
          branchId: branch_id,
          commitId: commit_id
        };
      } catch (error) {
        request.log.error({ err: error }, 'Failed to persist ADOLE user');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.get('/api/adole/users/:principalId', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const principalId = request.params.principalId;
        const dataSourceAdapter = orm.getDataSourceAdapter();
        const rows = await dataSourceAdapter.query(
          `SELECT p.principal_id, p.tenant_id, p.email, p.kind, os.snapshot 
           FROM principals p 
           LEFT JOIN object_state os ON os.object_id = p.principal_id AND os.tenant_id = p.tenant_id 
           WHERE p.principal_id = $1 LIMIT 1`,
          [principalId]
        );
        const row = rows[0];

        if (!row) {
          reply.code(404);
          return { success: false, error: 'User not found' };
        }

        return {
          success: true,
          data: {
            principalId: row.principal_id,
            tenantId: row.tenant_id,
            email: row.email,
            kind: row.kind,
            snapshot: row.snapshot
          }
        };
      } catch (error) {
        request.log.error({ err: error }, 'Failed to read ADOLE user');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.get('/api/adole/users', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const dataSourceAdapter = orm.getDataSourceAdapter();
        const rows = await dataSourceAdapter.query(
          `SELECT p.principal_id, p.tenant_id, p.email, p.kind, os.snapshot 
           FROM principals p 
           LEFT JOIN object_state os ON os.object_id = p.principal_id AND os.tenant_id = p.tenant_id 
           ORDER BY p.created_at DESC`
        );

        return {
          success: true,
          data: rows.map((row) => ({
            principalId: row.principal_id,
            tenantId: row.tenant_id,
            email: row.email,
            kind: row.kind,
            snapshot: row.snapshot
          }))
        };
      } catch (error) {
        request.log.error({ err: error }, 'Failed to list ADOLE users');
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

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
    // 3. DATABASE API ROUTES
    // ===========================

    // Database status endpoint
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
        const dataSourceAdapter = orm.getDataSourceAdapter();
        await dataSourceAdapter.query('SELECT 1');

        const tableRows = await dataSourceAdapter.query(`
          SELECT tablename FROM pg_catalog.pg_tables 
          WHERE schemaname = 'public' 
          ORDER BY tablename
        `);

        let connectionInfo = {
          type: 'postgres'
        };

        if (PG_URL) {
          try {
            const parsed = new URL(PG_URL);
            connectionInfo = {
              type: 'postgres',
              host: parsed.hostname,
              port: parsed.port || '5432',
              database: parsed.pathname.replace(/^\//, ''),
              user: parsed.username || undefined,
              ssl: parsed.searchParams.get('sslmode') || undefined
            };
          } catch (parseError) {
            request.log.warn({ err: parseError }, 'Unable to parse PG connection string');
            connectionInfo = {
              type: 'postgres',
              dsn: PG_URL
            };
          }
        }

        return {
          success: true,
          status: 'connected',
          database: 'PostgreSQL',
          tables: tableRows.map((row) => row.tablename),
          connection: connectionInfo,
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

    // ...existing database routes...

    // Users API
    // Users API (now using Knex principals table - ADOLE compliant)
    server.get('/api/users', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const db = orm.getDatabase();
        const users = await db('principals').select('*');
        return { success: true, data: users };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/users', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const db = orm.getDatabase();
        const { name, email, phone, password } = request.body;
        const principal_id = uuidv4();

        // Get or create default tenant
        let tenant = await db('tenants').first();
        if (!tenant) {
          const tenant_id = uuidv4();
          await db('tenants').insert({ tenant_id, name: 'default' });
          tenant = { tenant_id };
        }

        await db('principals').insert({
          principal_id,
          tenant_id: tenant.tenant_id,
          kind: 'user',
          email: email || null,
          phone: phone || null,
          username: name || null
        });

        const user = await db('principals').where('principal_id', principal_id).first();
        return { success: true, data: user };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.get('/api/users/:id', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const db = orm.getDatabase();
        const user = await db('principals').where('principal_id', request.params.id).first();

        if (!user) {
          reply.code(404);
          return { success: false, error: 'User not found' };
        }

        return { success: true, data: user };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.delete('/api/users/:id', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const db = orm.getDatabase();
        const deleted = await db('principals').where('principal_id', request.params.id).del();

        if (deleted === 0) {
          reply.code(404);
          return { success: false, error: 'User not found' };
        }

        return {
          success: true,
          message: `User with ID ${request.params.id} deleted successfully`,
          data: { deletedId: request.params.id }
        };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    // Projects API (now using Knex objects table with type='project' - ADOLE compliant)
    server.get('/api/projects', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const db = orm.getDatabase();
        const projects = await db('objects').where('type', 'project').andWhere('deleted', false);
        return { success: true, data: projects };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/projects', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const db = orm.getDatabase();
        const { name, description } = request.body;
        const object_id = uuidv4();

        // Get or create default tenant
        let tenant = await db('tenants').first();
        if (!tenant) {
          const tenant_id = uuidv4();
          await db('tenants').insert({ tenant_id, name: 'default' });
          tenant = { tenant_id };
        }

        await db('objects').insert({
          object_id,
          tenant_id: tenant.tenant_id,
          type: 'project',
          kind: 'project',
          meta: JSON.stringify({ name, description })
        });

        const project = await db('objects').where('object_id', object_id).first();
        return { success: true, data: project };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.get('/api/projects/:id', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const db = orm.getDatabase();
        const project = await db('objects')
          .where('object_id', request.params.id)
          .andWhere('type', 'project')
          .first();

        if (!project) {
          reply.code(404);
          return { success: false, error: 'Project not found' };
        }

        return { success: true, data: project };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    // NOTE: Atome routes are registered via registerAtomeRoutes() from atomeRoutes.orm.js
    // They use /api/atome/* (singular) endpoints

    // Database stats endpoint (now using Knex)
    server.get('/api/db/stats', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const db = orm.getDatabase();
        const [userResult, projectResult, atomeResult] = await Promise.all([
          db('principals').count('* as count').first(),
          db('objects').where('type', 'project').count('* as count').first(),
          db('objects').where('type', 'atome').count('* as count').first()
        ]);

        return {
          success: true,
          data: {
            users: parseInt(userResult?.count || 0),
            projects: parseInt(projectResult?.count || 0),
            atomes: parseInt(atomeResult?.count || 0),
            database: 'PostgreSQL + Knex (ADOLE)',
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

    // -----------------------------------------------
    // 3.1 ATOME SYNC WEBSOCKET - Real-time sync
    // -----------------------------------------------

    // Store connected atome sync clients
    const atomeSyncClients = new Map();

    // Broadcast to all atome sync clients except sender
    function broadcastToAtomeSyncClients(message, excludeClientId = null) {
      const payload = JSON.stringify(message);
      for (const [clientId, connection] of atomeSyncClients) {
        if (clientId !== excludeClientId) {
          try {
            connection.send(payload);
          } catch (error) {
            console.error(`❌ Failed to broadcast to ${clientId}:`, error);
          }
        }
      }
    }

    // WebSocket route for atome real-time sync
    server.register(async function (fastify) {
      fastify.get('/ws/atome-sync', { websocket: true }, (connection) => {
        const clientId = `atome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`📡 Atome Sync WebSocket connected: ${clientId}`);

        // Register client
        atomeSyncClients.set(clientId, connection);

        // Send welcome message
        connection.send(JSON.stringify({
          type: 'welcome',
          clientId,
          timestamp: new Date().toISOString(),
          connectedClients: atomeSyncClients.size
        }));

        // Handle incoming messages
        connection.on('message', async (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'ping':
                connection.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;

              case 'auth':
                // Validate token if provided
                console.log(`🔐 Client ${clientId} authenticated`);
                connection.send(JSON.stringify({ type: 'auth:success', clientId }));
                break;

              case 'atome:created':
                // NOTE: Do NOT save to database here!
                // The HTTP API (/api/atome/create) already saves and broadcasts via /ws/sync
                // This WebSocket is for client-to-client sync only, not for DB operations
                console.log(`📦 [ws/atome-sync] Received atome:created from ${clientId}:`, data.atome?.id);
                // Only broadcast to other atome-sync clients (for P2P sync scenarios)
                broadcastToAtomeSyncClients({
                  type: 'atome:created',
                  atome: data.atome,
                  sourceClient: clientId,
                  timestamp: new Date().toISOString()
                }, clientId);
                break;

              case 'atome:updated':
                // NOTE: Do NOT update database here - HTTP API handles it
                console.log(`✏️ [ws/atome-sync] Received atome:updated from ${clientId}:`, data.atome?.id);
                // Broadcast to other clients
                broadcastToAtomeSyncClients({
                  type: 'atome:updated',
                  atome: data.atome,
                  sourceClient: clientId,
                  timestamp: new Date().toISOString()
                }, clientId);
                break;

              case 'atome:altered':
                console.log(`🔄 Atome altered by ${clientId}:`, data.atomeId);
                // Broadcast alteration to other clients
                broadcastToAtomeSyncClients({
                  type: 'atome:altered',
                  atomeId: data.atomeId,
                  alteration: data.alteration,
                  atome: data.atome,
                  sourceClient: clientId,
                  timestamp: new Date().toISOString()
                }, clientId);
                break;

              case 'atome:deleted':
                // NOTE: Do NOT delete from database here - HTTP API handles it
                console.log(`🗑️ [ws/atome-sync] Received atome:deleted from ${clientId}:`, data.atomeId);
                // Broadcast to other clients
                broadcastToAtomeSyncClients({
                  type: 'atome:deleted',
                  atomeId: data.atomeId,
                  sourceClient: clientId,
                  timestamp: new Date().toISOString()
                }, clientId);
                break;

              default:
                console.log(`❓ Unknown message type from ${clientId}:`, data.type);
            }
          } catch (error) {
            console.error(`❌ Message parse error from ${clientId}:`, error);
            connection.send(JSON.stringify({ type: 'error', message: error.message }));
          }
        });

        // Handle disconnect
        connection.on('close', () => {
          atomeSyncClients.delete(clientId);
          console.log(`🛑 Atome Sync client disconnected: ${clientId} (${atomeSyncClients.size} remaining)`);
        });

        connection.on('error', (error) => {
          atomeSyncClients.delete(clientId);
          console.error(`❌ Atome Sync WebSocket error for ${clientId}:`, error);
        });
      });
    });

    // Route WebSocket pour les événements temps réel
    server.register(async function (fastify) {
      fastify.get('/ws/events', { websocket: true }, (connection) => {
        console.log('📡 Connexion WebSocket Events');

        const safeSend = (payload) => {
          try {
            connection.send(JSON.stringify(payload));
          } catch (error) {
            console.error('❌ Impossible d\'envoyer un événement sync:', error);
          }
        };

        safeSend({
          type: 'sync:handshake',
          version: 1,
          runtime: SERVER_TYPE,
          timestamp: new Date().toISOString(),
          payload: {
            watcherEnabled: Boolean(fileSyncWatcherHandle),
            watcherConfig: fileSyncWatcherHandle?.config ?? null
          }
        });

        if (fileSyncWatcherHandle) {
          const forward = (payload) => safeSend(payload);
          syncEventBus.on('event', forward);

          connection.on('close', () => {
            syncEventBus.off('event', forward);
            console.log('🛑 Client events déconnecté');
          });

          connection.on('error', (error) => {
            syncEventBus.off('event', forward);
            console.error('❌ Erreur WebSocket events:', error);
          });
        } else {
          safeSend({
            type: 'sync:warning',
            timestamp: new Date().toISOString(),
            payload: { message: 'File watcher disabled server-side' }
          });
          connection.on('close', () => {
            console.log('🛑 Client events déconnecté (watcher inactif)');
          });
        }
      });

      // Route WebSocket pour sync GitHub et gestion clients Tauri/Browser
      fastify.get('/ws/sync', { websocket: true }, async (connection) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('🔗 Nouvelle connexion sync:', clientId);

        // Register client
        registerClient(clientId, connection, 'unknown');

        // Send initial version info
        const version = await getLocalVersion();
        connection.send(JSON.stringify({
          type: 'welcome',
          clientId,
          version: version.version,
          protectedPaths: version.protectedPaths || [],
          timestamp: new Date().toISOString()
        }));

        connection.on('message', async (message) => {
          try {
            const response = await handleClientMessage(clientId, message.toString());
            if (response) {
              connection.send(JSON.stringify(response));
            }
          } catch (error) {
            connection.send(JSON.stringify({ type: 'error', message: error.message }));
          }
        });

        connection.on('close', () => {
          unregisterClient(clientId);
        });

        connection.on('error', (error) => {
          console.error('❌ Erreur WebSocket sync:', error);
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
    console.log(`📡 Events WebSocket sur ws://localhost:${PORT}/ws/events`);
    console.log(`🔄 Atome Sync WebSocket sur ws://localhost:${PORT}/ws/atome-sync`);
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
