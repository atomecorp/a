// src/server/server.js
import fastify from 'fastify';
import fastifySocketIo from 'fastify-socket.io';
import { connect, handleMessage } from './handlers/socketHandlers.js';
import { DatabaseOperations } from './database.js';

const server = fastify({ 
  logger: process.env.NODE_ENV === 'development' 
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database first
    await DatabaseOperations.initialize();

    // Register Socket.IO plugin
    await server.register(fastifySocketIo, {
      cors: {
        origin: true,
        credentials: true
      }
    });

    // Setup Socket.IO handlers
    server.ready((err) => {
      if (err) throw err;
      
      server.io.on('connection', (socket) => {
        socket.on('connect_request', (data) => {
          connect(data, socket);
        });
        
        socket.on('message', (data) => {
          handleMessage(data, socket);
        });
        
        socket.on('disconnect', () => {
          // Client disconnected
        });
      });
    });

    // Add health check endpoint
    server.get('/health', async (request, reply) => {
      const dbHealth = await DatabaseOperations.healthCheck();
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbHealth
      };
    });

    // Start the server
    await server.listen({ port: PORT, host: '0.0.0.0' });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await DatabaseOperations.close();
    await server.close();
    process.exit(0);
  } catch (error) {
    console.error(' Error during shutdown:', error);
    process.exit(1);
  }
});

startServer();