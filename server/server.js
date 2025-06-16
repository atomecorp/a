// Server Fastify v5 moderne avec WebSocket natif
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
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

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    console.log('🚀 Démarrage du serveur Fastify v5...');

    // ===========================
    // 1. PLUGINS DE BASE
    // ===========================

    // CORS pour le développement
    await server.register(fastifyCors, {
      origin: true,
      credentials: true
    });

    // Servir les fichiers statiques depuis ../src
    await server.register(fastifyStatic, {
      root: path.join(__dirname, '../src'),
      prefix: '/'
    });

    // WebSocket natif Fastify v5
    await server.register(fastifyWebsocket);

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
    
    console.log(`✅ Serveur Fastify v${server.version} démarré sur http://localhost:${PORT}`);
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