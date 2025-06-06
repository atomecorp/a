import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });

// Servir des fichiers statiques
await fastify.register(fastifyStatic, {
    root: path.join(process.cwd(), 'src'), // ← Servir le dossier 'src'
    prefix: '/', // ← URL racine
});

// API endpoint
fastify.get('/api/test', async (request, reply) => {
    return { message: 'Serveur Fastify fonctionnel!', timestamp: new Date().toISOString() };
});