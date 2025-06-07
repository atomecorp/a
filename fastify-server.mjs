// server Node Fastify

import Fastify from 'fastify';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import fastifyCors from '@fastify/cors';

const readFileAsync = promisify(readFile);
const fastify = Fastify({ logger: true });
await fastify.register(fastifyCors, { origin: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = 7001;
const srcDir = join(__dirname, 'src');

// Routes API
fastify.get('/api/status', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString()
  };
});

fastify.get('/api/test', async () => {
  return {
    message: 'Test réussi!',
    server: 'Fastify',
    version: fastify.version
  };
});

// Gestionnaire pour servir des fichiers statiques
fastify.get('/*', async (request, reply) => {
  try {
    const requestPath = request.url === '/' ? '/index.html' : request.url;
    const filePath = join(srcDir, requestPath);

    if (existsSync(filePath)) {
      const content = await readFileAsync(filePath);
      const ext = extname(filePath).toLowerCase();
      let contentType = 'text/plain';

      switch(ext) {
        case '.html': contentType = 'text/html'; break;
        case '.js': contentType = 'application/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
      }

      reply.type(contentType).send(content);
    } else {
      reply.code(404).send({ error: 'Fichier non trouvé' });
    }
  } catch (err) {
    fastify.log.error(err);
    reply.code(500).send({ error: 'Erreur interne du serveur' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '127.0.0.1' });
    console.log(`API Fastify: http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
