// Simple Fastify server JUST for testing components - NO DATABASE
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Créer l'instance Fastify
const server = fastify({ 
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

const PORT = process.env.PORT || 3333;

async function startServer() {
  try {
    console.log('🚀 Démarrage du serveur de test (SANS DATABASE)...');

    // CORS pour le développement
    await server.register(fastifyCors, {
      origin: true,
      credentials: true
    });

    // Servir les fichiers statiques depuis le répertoire courant
    await server.register(fastifyStatic, {
      root: path.join(__dirname),
      prefix: '/'
    });

    // Health check simple
    server.get('/health', async (request, reply) => {
      return {
        status: 'ok - test server',
        timestamp: new Date().toISOString(),
        purpose: 'Component exports testing'
      };
    });    // Route de test pour les composants
    server.get('/test-components', async (request, reply) => {
      return reply.sendFile('test-components-browser-clean.html');
    });

    // PWA-specific routes
    server.get('/manifest.json', async (request, reply) => {
      reply.type('application/manifest+json');
      return reply.sendFile('src/pwa/manifest.json');
    });

    server.get('/service-worker.js', async (request, reply) => {
      reply.type('application/javascript');
      return reply.sendFile('src/pwa/service-worker.js');
    });

    // Offline fallback
    server.get('/offline', async (request, reply) => {
      return reply.sendFile('src/pwa/offline/offline.html');
    });

    // Route directe pour le fichier de test
    server.get('/test-components-browser.html', async (request, reply) => {
      return reply.sendFile('test-components-browser.html');
    });

    // Log all requests for debugging
    server.addHook('onRequest', async (request, reply) => {
      console.log(`📡 ${request.method} ${request.url}`);
    });

    // Démarrer le serveur
    await server.listen({ 
      port: PORT, 
      host: '0.0.0.0' 
    });
    
    console.log(`✅ Serveur de test démarré sur http://localhost:${PORT}`);
    console.log(`🧪 Test des composants: http://localhost:${PORT}/test-components-browser.html`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    
  } catch (err) {
    server.log.error(err);
    console.error('❌ Erreur lors du démarrage du serveur:', err);
    process.exit(1);
  }
}

// Gérer l'arrêt propre
process.on('SIGINT', async () => {
  console.log('\n🛑 Arrêt du serveur...');
  await server.close();
  process.exit(0);
});

startServer();
