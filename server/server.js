// Server Fastify v5 moderne avec WebSocket natif
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs, createReadStream } from 'fs';

// Database imports
import { knex, ensureAdoleSchema, PG_URL } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import User from '../database/User.js';
import Project from '../database/Project.js';
import Atome from '../database/Atome.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../src/assets/uploads');
const VERSION_FILE = path.join(__dirname, '../version.txt');
let SERVER_VERSION = 'unknown';
const SERVER_TYPE = 'Fastify';

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

// Créer l'instance Fastify
const server = fastify({
  bodyLimit: 1024 * 1024 * 1024, // 1 GiB
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

const PORT = process.env.PORT || 3001;
const DATABASE_ENABLED = Boolean(knex);
const DB_REQUIRED_MESSAGE = 'Database not configured. Set ADOLE_PG_DSN or PG_CONNECTION_STRING/DATABASE_URL.';

async function startServer() {
  try {
    console.log('🚀 Démarrage du serveur Fastify v5...');

    SERVER_VERSION = await loadServerVersion();
    console.log(`📦 Version applicative: ${SERVER_VERSION}`);

    await fs.mkdir(uploadsDir, { recursive: true });

    // ===========================
    // 0. DATABASE INITIALIZATION
    // ===========================

    if (DATABASE_ENABLED) {
      console.log('📊 Initialisation de la base de données...');

      // Run migrations
      try {
        await knex.migrate.latest();
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
      console.log('✅ Migrations exécutées');

      // Test database connection
      try {
        await knex.raw('SELECT 1');
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
      console.log('✅ Connexion à la base de données établie');

      console.log('🗄️  Initialisation du schéma ADOLE (PostgreSQL)...');
      await ensureAdoleSchema();
      console.log('✅ Schéma ADOLE prêt');
    } else {
      console.warn('⚠️  Aucune base PostgreSQL configurée. Les routes dépendant de la base renverront 503.');
    }

    // ===========================
    // 1. PLUGINS DE BASE
    // ===========================

    // CORS pour le développement
    await server.register(fastifyCors, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
    });

    // Servir les fichiers statiques depuis ../src
    await server.register(fastifyStatic, {
      root: path.join(__dirname, '../src'),
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

    // Health check
    server.get('/health', async (request, reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        fastify: server.version,
        uptime: process.uptime()
      };
    });

    // API de test
    server.get('/api/status', async (request, reply) => {
      return {
        status: 'ok',
        server: 'Fastify v5',
        timestamp: new Date().toISOString()
      };
    });

    server.get('/api/test', async (request, reply) => {
      return {
        message: 'Test réussi avec Fastify v5! 🎉',
        server: 'Fastify',
        version: server.version,
        websocket: 'Natif intégré'
      };
    });

    server.get('/api/server-info', async () => {
      return {
        success: true,
        version: SERVER_VERSION,
        type: SERVER_TYPE
      };
    });

    server.post('/api/uploads', async (request, reply) => {
      try {
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

        return { success: true, file: fileName };
      } catch (error) {
        request.log.error({ err: error }, 'File upload failed');
        reply.code(500);
        return { success: false, error: error.message };
      }
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
        await knex.transaction(async (trx) => {
          await trx('tenants')
            .insert({ tenant_id, name: tenantName || username || 'tenant' })
            .onConflict('tenant_id')
            .merge({ name: tenantName || username || 'tenant' });

          await trx('principals')
            .insert({ tenant_id, principal_id, kind, email })
            .onConflict('principal_id')
            .merge({ email, kind });

          await trx('objects')
            .insert({
              object_id: principal_id,
              tenant_id,
              type: 'user_profile',
              created_by: principal_id
            })
            .onConflict('object_id')
            .merge({ type: 'user_profile', created_by: principal_id });

          await trx('branches')
            .insert({
              branch_id,
              tenant_id,
              object_id: principal_id,
              name: 'main',
              is_default: true
            })
            .onConflict('branch_id')
            .ignore();

          await trx('commits')
            .insert({
              commit_id,
              tenant_id,
              object_id: principal_id,
              branch_id,
              author_id: principal_id,
              logical_clock,
              message: 'profile upsert'
            })
            .onConflict('commit_id')
            .ignore();

          await trx('object_state')
            .insert({
              tenant_id,
              object_id: principal_id,
              branch_id,
              version_seq: logical_clock,
              snapshot: trx.raw('?::jsonb', [JSON.stringify(snapshot)])
            })
            .onConflict(['tenant_id', 'object_id', 'branch_id'])
            .merge({
              version_seq: logical_clock,
              snapshot: trx.raw('?::jsonb', [JSON.stringify(snapshot)]),
              updated_at: trx.fn.now()
            });
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
        const row = await knex('principals as p')
          .leftJoin('object_state as os', function joinProfiles() {
            this.on('os.object_id', '=', 'p.principal_id')
              .andOn('os.tenant_id', '=', 'p.tenant_id');
          })
          .select('p.principal_id', 'p.tenant_id', 'p.email', 'p.kind', 'os.snapshot')
          .where('p.principal_id', principalId)
          .first();

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
        const rows = await knex('principals as p')
          .leftJoin('object_state as os', function joinProfiles() {
            this.on('os.object_id', '=', 'p.principal_id')
              .andOn('os.tenant_id', '=', 'p.tenant_id');
          })
          .select('p.principal_id', 'p.tenant_id', 'p.email', 'p.kind', 'os.snapshot')
          .orderBy('p.created_at', 'desc');

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

    // YouTube Search proxy (requires YOUTUBE_API_KEY)
    server.get('/api/youtube/search', async (request, reply) => {
      try {
        const q = (request.query.q || '').toString();
        const pageToken = (request.query.pageToken || '').toString();
        if (!q) {
          reply.code(400);
          return { success: false, error: 'Missing query parameter q' };
        }

        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
          // Minimal mocked fallback so UI can still render
          return {
            success: true,
            info: 'No YOUTUBE_API_KEY configured. Returning mocked results.',
            items: [
              {
                id: { videoId: 'dQw4w9WgXcQ' },
                snippet: {
                  title: `Résultats simulés pour "${q}" (exemple 1)`,
                  channelTitle: 'Mock Channel',
                  publishedAt: new Date().toISOString(),
                  thumbnails: {
                    default: { url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg' },
                    medium: { url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg' },
                    high: { url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }
                  }
                }
              },
              {
                id: { videoId: '9bZkp7q19f0' },
                snippet: {
                  title: `Résultats simulés pour "${q}" (exemple 2)`,
                  channelTitle: 'Mock Channel',
                  publishedAt: new Date().toISOString(),
                  thumbnails: {
                    default: { url: 'https://img.youtube.com/vi/9bZkp7q19f0/default.jpg' },
                    medium: { url: 'https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg' },
                    high: { url: 'https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg' }
                  }
                }
              },
              {
                id: { videoId: 'kUMe1FH4CHE' },
                snippet: {
                  title: `Résultats simulés pour "${q}" (exemple 3)`,
                  channelTitle: 'Mock Channel',
                  publishedAt: new Date().toISOString(),
                  thumbnails: {
                    default: { url: 'https://img.youtube.com/vi/kUMe1FH4CHE/default.jpg' },
                    medium: { url: 'https://img.youtube.com/vi/kUMe1FH4CHE/mqdefault.jpg' },
                    high: { url: 'https://img.youtube.com/vi/kUMe1FH4CHE/hqdefault.jpg' }
                  }
                }
              }
            ],
            pageInfo: { totalResults: 3, resultsPerPage: 3 }
          };
        }

        const params = new URLSearchParams({
          key: apiKey,
          part: 'snippet',
          type: 'video',
          maxResults: '12',
          q,
          videoEmbeddable: 'true'
        });
        if (pageToken) params.set('pageToken', pageToken);

        const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) {
          let parsed;
          try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }
          reply.code(res.status);
          return { success: false, status: res.status, ...parsed };
        }
        const data = JSON.parse(text);
        return data; // Keep original YouTube shape
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
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
        await knex.raw('SELECT 1');

        const tableRows = await knex('pg_catalog.pg_tables')
          .select('tablename')
          .where('schemaname', 'public')
          .orderBy('tablename');

        let connectionInfo = {
          type: knex.client.config.client || 'pg'
        };

        if (PG_URL) {
          try {
            const parsed = new URL(PG_URL);
            connectionInfo = {
              type: knex.client.config.client || 'pg',
              host: parsed.hostname,
              port: parsed.port || '5432',
              database: parsed.pathname.replace(/^\//, ''),
              user: parsed.username || undefined,
              ssl: parsed.searchParams.get('sslmode') || undefined
            };
          } catch (parseError) {
            request.log.warn({ err: parseError }, 'Unable to parse PG connection string');
            connectionInfo = {
              type: knex.client.config.client || 'pg',
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
    server.get('/api/users', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const users = await User.query();
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
        const user = await User.query().insert(request.body);
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
        const user = await User.query()
          .findById(request.params.id)
          .withGraphFetched('[project, atomes]');

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
        const deletedCount = await User.query().deleteById(request.params.id);

        if (deletedCount === 0) {
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

    // Projects API
    server.get('/api/projects', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const projects = await Project.query().withGraphFetched('[users, owner, atomes]');
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
        const project = await Project.query().insert(request.body);
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
        const project = await Project.query()
          .findById(request.params.id)
          .withGraphFetched('[users, owner, atomes]');

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

    // Atomes API
    server.get('/api/atomes', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const atomes = await Atome.query().withGraphFetched('[user, project]');
        return { success: true, data: atomes };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/atomes', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const atome = await Atome.query().insert(request.body);
        return { success: true, data: atome };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    // Database stats endpoint
    server.get('/api/db/stats', async (request, reply) => {
      if (!DATABASE_ENABLED) {
        reply.code(503);
        return { success: false, error: DB_REQUIRED_MESSAGE };
      }

      try {
        const [userCount, projectCount, atomeCount] = await Promise.all([
          User.query().resultSize(),
          Project.query().resultSize(),
          Atome.query().resultSize()
        ]);

        return {
          success: true,
          data: {
            users: userCount,
            projects: projectCount,
            atomes: atomeCount,
            database: 'PostgreSQL + Objection.js',
            timestamp: new Date().toISOString()
          }
        };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    // ===========================
    // 3. WEBSOCKET NATIF
    // ===========================

    // Route WebSocket principale
    server.register(async function (fastify) {
      fastify.get('/ws', { websocket: true }, (connection, req) => {
        console.log('🔌 Nouvelle connexion WebSocket');

        // Envoyer un message de bienvenue
        connection.send(JSON.stringify({
          type: 'welcome',
          message: 'Connexion WebSocket établie avec Fastify v5!',
          timestamp: new Date().toISOString()
        }));

        // Écouter les messages du client
        connection.on('message', (message) => {
          try {
            const data = JSON.parse(message);
            console.log('📨 Message reçu:', data);

            // Echo du message avec enrichissement
            const response = {
              type: 'echo',
              original: data,
              timestamp: new Date().toISOString(),
              server: 'Fastify v5'
            };

            connection.send(JSON.stringify(response));
          } catch (error) {
            console.error('❌ Erreur parsing message:', error);
            connection.send(JSON.stringify({
              type: 'error',
              message: 'Format de message invalide'
            }));
          }
        });

        // Gestion de la déconnexion
        connection.on('close', () => {
          console.log('👋 Connexion WebSocket fermée');
        });

        // Gestion des erreurs
        connection.on('error', (error) => {
          console.error('❌ Erreur WebSocket:', error);
        });
      });
    });

    // Route WebSocket pour les événements temps réel
    server.register(async function (fastify) {
      fastify.get('/ws/events', { websocket: true }, (connection, req) => {
        console.log('📡 Connexion WebSocket Events');

        // Simuler des événements périodiques
        const interval = setInterval(() => {
          const event = {
            type: 'event',
            data: {
              timestamp: new Date().toISOString(),
              random: Math.random(),
              uptime: process.uptime()
            }
          };
          connection.send(JSON.stringify(event));
        }, 5000); // Toutes les 5 secondes

        connection.on('close', () => {
          clearInterval(interval);
          console.log('🛑 Arrêt des événements périodiques');
        });
      });
    });

    // ===========================
    // 4. DÉMARRAGE
    // ===========================

    await server.listen({
      port: PORT,
      host: '0.0.0.0'
    });

    console.log(`✅ Serveur Fastify v${server.version} (app ${SERVER_VERSION}) démarré sur http://localhost:${PORT}`);
    console.log(`🔌 WebSocket disponible sur ws://localhost:${PORT}/ws`);
    console.log(`📡 Events WebSocket sur ws://localhost:${PORT}/ws/events`);
    console.log(`🌐 Frontend servi depuis: http://localhost:${PORT}/`);

  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
    process.exit(1);
  }
}

// ===========================
// 5. GESTION GRACEFUL SHUTDOWN
// ===========================

process.on('SIGINT', async () => {
  console.log('\n🛑 Arrêt du serveur...');
  try {
    await server.close();
    console.log('✅ Serveur arrêté proprement');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de l\'arrêt:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Signal SIGTERM reçu, arrêt...');
  await server.close();
});

// Démarrer le serveur
startServer();
