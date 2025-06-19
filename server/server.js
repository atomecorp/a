// Server Fastify v5 moderne avec WebSocket natif
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Database imports
import { knex } from '../database/db.js';
import User from '../database/User.js';
import Project from '../database/Project.js';
import Atome from '../database/Atome.js';

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
    // 0. DATABASE INITIALIZATION
    // ===========================
    
    console.log('📊 Initialisation de la base de données...');
    
    // Run migrations
    await knex.migrate.latest();
    console.log('✅ Migrations exécutées');
    
    // Test database connection
    await knex.raw('SELECT 1');
    console.log('✅ Connexion à la base de données établie');

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
    // 3. DATABASE API ROUTES
    // ===========================

    // Database status endpoint
    server.get('/api/db/status', async (request, reply) => {
      try {
        // Test database connection
        await knex.raw('SELECT 1');
        
        // Get table info
        const tables = await knex.raw("SELECT name FROM sqlite_master WHERE type='table'");
        
        // Get database file info
        const dbStats = await knex.raw("PRAGMA database_list");
        
        return {
          success: true,
          status: 'connected',
          database: 'SQLite',
          tables: tables.map(row => row.name),
          connection: {
            type: 'sqlite3',
            file: './eDen.db'
          },
          timestamp: new Date().toISOString()
        };      } catch (error) {
        reply.code(500);
        return {
          success: false,
          status: 'disconnected',
          error: error.message,          timestamp: new Date().toISOString()
        };
      }
    });

    // ...existing database routes...

    // Users API
    server.get('/api/users', async (request, reply) => {
      try {
        const users = await User.query();
        return { success: true, data: users };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/users', async (request, reply) => {
      try {
        const user = await User.query().insert(request.body);
        return { success: true, data: user };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.get('/api/users/:id', async (request, reply) => {
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
      try {
        const projects = await Project.query().withGraphFetched('[users, owner, atomes]');
        return { success: true, data: projects };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/projects', async (request, reply) => {
      try {
        const project = await Project.query().insert(request.body);
        return { success: true, data: project };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.get('/api/projects/:id', async (request, reply) => {
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
      try {
        const atomes = await Atome.query().withGraphFetched('[user, project]');
        return { success: true, data: atomes };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    server.post('/api/atomes', async (request, reply) => {
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
      try {
        const [userCount] = await knex('user').count('* as count');
        const [projectCount] = await knex('project').count('* as count');
        const [atomeCount] = await knex('atome').count('* as count');
        
        return {
          success: true,
          data: {
            users: userCount.count,
            projects: projectCount.count,
            atomes: atomeCount.count,
            database: 'SQLite + Objection.js',
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