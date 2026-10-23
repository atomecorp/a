// Fastify v5 server composition root: boot configuration, the shared service
// instances, the Fastify instance, and every plugin / hook / route registration
// in its significant order. Route families live in server/http_*.js and the
// /ws/api handler in server/ws_api_*.js.
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs, mkdirSync } from 'fs';
import crypto from 'crypto';
import { registerOfflineAppAssets } from './offline_app_assets.js';
import { loadServerEnvFiles, resolveHttpsOptions } from './server_boot_config.js';
import { createServerServices } from './server_services.js';
import { startABoxMonitoring, stopABoxMonitoring } from './aBoxServer.js';
import { ensureOpaquePrincipalIdentity } from './auth_identity.js';
import { createWsPhoneLinkHandler } from './wsPhoneLinkAuth.js';
import { registerServerIdentityRoutes } from './auth_routes_server.js';
import { initServerIdentity } from './serverIdentity.js';
import { requiredJwtSecret as getRequiredJwtSecret } from './wsApiIdentity.js';
import { registerMailRoutes } from './mailRoutes.js';
import { registerSocialRoutes } from './social/social_oauth.js';
import { registerBillingRoutes } from './billing/billing_routes.js';
import { initUserFiles } from './user_files_message_api.js';
import { startPolling as startGitHubPolling } from './githubSync.js';
import { createVisioService } from './visio.js';
import { SERVER_VERSION, EVE_VERSION, refreshVersionCache, startVersionWatchers } from './server_version.js';
import { logger, setLogServer } from './server_logger.js';
import { uploadsDir } from './server_uploads.js';
import { registerHttpServerHooks } from './http_server_hooks.js';
import { registerHttpDevRoutes } from './http_dev_routes.js';
import { createHttpRequestIdentity } from './http_request_identity.js';
import { registerMediaTokenRoute, registerMediaServingRoutes } from './http_media_serving_routes.js';
import { registerServerInfoRoutes, registerDbStatusRoutes } from './http_status_routes.js';
import { registerUploadRoutes } from './http_upload_routes.js';
import { registerFileRoutes } from './http_file_routes.js';
import { registerAdminUserRoutes } from './http_admin_user_routes.js';
import { registerWsApiRoute } from './ws_api_connection.js';

// Database imports - Using SQLite/libSQL (ADOLE data layer)
import db from '../database/adole.js';

// Load environment variables from .env files
const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);
const projectRoot_env = path.resolve(__dirname_env, '..');

// Runs after every imported module has been evaluated, as the inline loader did.
loadServerEnvFiles(projectRoot_env);

const {
  userVaultRouter,
  wsSyncRuntime,
  deliverCommNotification,
  communicationRelations,
  directMessageRateAllowed,
  syncSharingService,
  newsBroadcast,
  newsPublishRateAllowed,
  communities,
  directoryPublicService
} = createServerServices({ projectRoot_env });

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
const SNAPSHOT_DIR = path.join(LOG_DIR, 'snapshots');
const UI_TESTS_DIR = path.join(LOG_DIR, 'ui-tests');
const SCHEMA_PATH = path.join(projectRoot, 'database', 'schema.sql');

try {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  mkdirSync(UI_TESTS_DIR, { recursive: true });
} catch (error) {
  console.warn('WARN: Unable to prepare log directories:', error?.message || error);
}

const SERVER_TYPE = 'Fastify';
let fileSyncWatcherHandle = null;

// HTTPS Configuration
const httpsOptions = resolveHttpsOptions(projectRoot);

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

    await registerHttpServerHooks(server, { getServerFingerprint, SERVER_TYPE });

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

    registerHttpDevRoutes(server, { replyJson, SERVER_CONFIG_FILE, BROWSER_LOG_FILE, SNAPSHOT_DIR });

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
        await ensureOpaquePrincipalIdentity(db.getDataSourceAdapter());
        const globalScopeRepair = await db.repairGlobalStateCurrentScopes();
        if (globalScopeRepair.repaired_ids.length) {
          console.log('[ADOLE] Repaired account-global projections:', globalScopeRepair.repaired_ids.length);
        }
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

    // Rubber Band's WebAssembly build. The bare specifier `rubberband-wasm` and the
    // .wasm are BOTH declared against this prefix (importmap in atome/src/index.html
    // and RUBBERBAND_WASM_URL): node_modules is not under the static root, which is
    // why the two module resolutions used to 404 in the browser.
    await server.register(fastifyStatic, {
      root: path.join(projectRoot, 'node_modules', 'rubberband-wasm', 'dist'),
      prefix: '/vendor/rubberband-wasm/',
      decorateReply: false,
      preCompressed: true
    });

    // Servir les fichiers statiques depuis staticRoot (../atome/src en dev)
    await server.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
      preCompressed: true
    });

    await registerOfflineAppAssets(server, { staticRoot, eveStaticRoot, projectRoot });

    // WebSocket natif Fastify v5
    await server.register(fastifyWebsocket);

    server.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => {
      done(null, body);
    });

    // ===========================
    // 2. ROUTES API
    // ===========================

    initServerIdentity();
    registerServerIdentityRoutes(server, {
      dataSource: DATABASE_ENABLED ? db.getDataSourceAdapter() : null,
      isProduction: process.env.NODE_ENV === 'production'
    });

    const phoneLinkAuth = DATABASE_ENABLED
      ? createWsPhoneLinkHandler({ projectRoot, jwtSecret: getRequiredJwtSecret })
      : null;

    const { validateToken, resolveUploadIdentity, resolveMediaDownloadIdentity } = createHttpRequestIdentity(server);

    registerMediaTokenRoute(server, { validateToken });

    registerMailRoutes(server, { identify: validateToken });
    registerSocialRoutes(server, { projectRoot });
    registerBillingRoutes(server);

    const visioService = createVisioService({
      databaseEnabled: DATABASE_ENABLED,
      jwtSecret: process.env.JWT_SECRET,
      logger: server.log,
      relations: communicationRelations,
      notify: (targetId, senderId, notification) => deliverCommNotification(targetId, senderId, notification)
    });
    server.decorate('visioService', visioService);

    registerServerInfoRoutes(server, { SERVER_TYPE, DATABASE_ENABLED });
    registerUploadRoutes(server, { projectRoot, UPLOADS_TMP_DIR, DATABASE_ENABLED, resolveUploadIdentity });
    registerFileRoutes(server, { projectRoot, replyJson, validateToken });
    registerAdminUserRoutes(server, { DATABASE_ENABLED, DB_REQUIRED_MESSAGE, projectRoot, replyJson, validateToken });
    registerMediaServingRoutes(server, { resolveUploadIdentity, resolveMediaDownloadIdentity });
    registerDbStatusRoutes(server, { DATABASE_ENABLED, DB_REQUIRED_MESSAGE, SCHEMA_PATH });

    // ===========================
    // 3. WEBSOCKET NATIF
    // ===========================

    registerWsApiRoute(server, {
      projectRoot,
      UPLOADS_TMP_DIR,
      DATABASE_ENABLED,
      validateToken,
      phoneLinkAuth,
      userVaultRouter,
      wsSyncRuntime,
      directoryPublicService,
      communicationRelations,
      directMessageRateAllowed,
      syncSharingService,
      newsBroadcast,
      newsPublishRateAllowed,
      communities
    });

    // Route WebSocket unifiée pour sync (inclut file events, atome events, version sync)
    server.register(async function (fastify) {
      // Route WebSocket pour sync GitHub et gestion clients Tauri/Browser
      fastify.get('/ws/sync', { websocket: true }, async (connection, request) => {
        await wsSyncRuntime.attach(connection, request);
      });
    });

    // ===========================
    // 4. DÉMARRAGE
    // ===========================

    // Auto-sync rewrites `atome/src/**` from a GitHub ZIP. That is a deployment
    // action, not a development one: enabled by default it silently overwrites
    // whatever the developer is working on. It is now opt-in, and refuses to run
    // on a dirty tree even when enabled.
    if (String(process.env.GITHUB_AUTO_SYNC || '').toLowerCase() === 'true') {
      startGitHubPolling();
    } else {
      console.log('⏸️  GitHub auto-sync disabled (set GITHUB_AUTO_SYNC=true to enable)');
    }

    await server.listen({
      port: PORT,
      host: HOST
    });

    console.log(`✅ Fastify server v${server.version} started on http://localhost:${PORT} (Atome ${SERVER_VERSION}, eVe ${EVE_VERSION})`);
    console.log(`🔄 Sync WebSocket at ws://localhost:${PORT}/ws/sync`);
    console.log(`🌐 Frontend served from: http://localhost:${PORT}/`);
    void directoryPublicService.rebuild()
      .then((result) => console.log(`[directory.public] startup rebuild complete profiles=${result.profiles}`))
      .catch((error) => console.warn('[directory.public] startup rebuild failed:', error?.message || error));

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

const shutdownOn = (signal, message) => process.on(signal, async () => {
  console.log(message);
  try {
    await server.close();
    wsSyncRuntime.stop();
    await stopFileWatcher();
    await userVaultRouter.stopAll();
    console.log('✅ Server stopped cleanly');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

shutdownOn('SIGINT', '\n🛑 Server stopping...');
shutdownOn('SIGTERM', '\n🛑 Signal SIGTERM received, stopping...');

// Start the server
startServer();
