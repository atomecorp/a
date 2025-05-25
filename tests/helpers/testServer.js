import fastify from 'fastify';
import fastifySocketIo from 'fastify-socket.io';
import { connect } from '../../server/handlers/socketHandlers.js';
import { registerRoutes } from '../../server/handlers/apiHandlers.js';

class TestServer {
  constructor(port = 3001) {
    this.port = port;
    this.server = fastify({ logger: false });
  }

  async start() {
    // Register Socket.IO plugin
    await this.server.register(fastifySocketIo, {
      cors: {
        origin: true,
        credentials: true
      }
    });

    // Register HTTP routes
    registerRoutes(this.server);

    // Setup Socket.IO handlers
    this.server.ready((err) => {
      if (err) throw err;
      
      this.server.io.on('connection', (socket) => {
        socket.on('connect_request', (data) => {
          connect(data, socket);
        });
      });
    });

    // Start server
    await this.server.listen({ port: this.port, host: '0.0.0.0' });
    return `http://localhost:${this.port}`;
  }

  async stop() {
    await this.server.close();
  }

  getServer() {
    return this.server;
  }
}

export default TestServer;