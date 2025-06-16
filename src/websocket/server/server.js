// src/server/server.js
import fastify from 'fastify';
import fastifySocketIo from 'fastify-socket.io';
import { connect, handleMessage } from './handlers.js';
import { DatabaseOperations } from './mock-database.js';

const server = fastify({ 
  logger: process.env.NODE_ENV === 'development' 
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Initialize database first
    console.log('🔄 Initializing database...');
    await DatabaseOperations.initialize();
    console.log('✅ Database ready!');

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
        console.log(`Client connected: ${socket.id}`);
        
        socket.on('connect_request', (data) => {
          connect(data, socket);
        });
        
        socket.on('message', (data) => {
          handleMessage(data, socket);
        });
        
        socket.on('disconnect', () => {
          console.log(`Client disconnected: ${socket.id}`);
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
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  try {
    await DatabaseOperations.close();
    await server.close();
    console.log('✅ Server shut down successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

startServer();
