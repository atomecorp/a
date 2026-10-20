// Global HTTP behaviour registered first on the root instance: CORS, compression,
// private-network and opaque-origin headers, preflight answers, the always-on
// diagnostics, request ids and HTTP lifecycle logging. Order is significant.
import fastifyCors from '@fastify/cors';
import fastifyCompress from '@fastify/compress';
import { applyOpaqueNativeOriginCors } from './cors_policies.js';
import { SERVER_VERSION, EVE_VERSION } from './server_version.js';
import { logStructured, MINIMAL_LOGS } from './server_logger.js';
import { recordRecentError } from './server_dedup.js';
import { classifyHttpLifecycleError } from './http_error_classification.js';

export async function registerHttpServerHooks(server, { getServerFingerprint, SERVER_TYPE }) {
  // The allowlist reads SQUIRREL_ALLOWED_ORIGINS, so it is built here (after
  // .env is loaded), never at module evaluation.
  const CORS_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];

  const buildAllowedCorsOrigins = () => {
    const fromEnv = String(process.env.SQUIRREL_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return new Set([
      ...fromEnv,
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3001',
      'http://localhost:3001',
      'http://tauri.localhost',
      'https://tauri.localhost',
      'tauri://localhost'
      // 'null' is NOT allowed: sandboxed iframes, file:// pages and some
      // redirects all send `Origin: null`, and this server answers with
      // credentials:true. Accepting it handed credentialed access to any page
      // able to produce that origin.
    ]);
  };

  const ALLOWED_CORS_ORIGINS = buildAllowedCorsOrigins();

  const isAllowedCorsOrigin = (origin) => {
    // When no Origin header is present (same-origin or no-cors requests),
    // return false to prevent @fastify/cors from sending Access-Control-Allow-Origin: *
    // which is invalid when credentials: true is set.
    if (!origin) return false;
    if (ALLOWED_CORS_ORIGINS.has(origin)) return true;
    let parsed;
    // `new URL` used to run unguarded: a malformed Origin header threw inside the
    // CORS check instead of being rejected.
    try { parsed = new URL(origin); } catch { return false; }
    const protocol = String(parsed.protocol || '').toLowerCase();
    const hostname = String(parsed.hostname || '').toLowerCase();
    if (protocol === 'tauri:' && hostname === 'localhost') return true;
    if ((protocol === 'http:' || protocol === 'https:') && hostname === 'tauri.localhost') return true;
    return false;
  };

  // Register CORS first so all routes share the same behavior.
  await server.register(fastifyCors, {
    origin: (origin, callback) => {
      // Pass the origin STRING (not boolean true) so @fastify/cors never
      // falls back to Access-Control-Allow-Origin: * which is forbidden
      // when credentials: true.
      if (origin && isAllowedCorsOrigin(origin)) {
        callback(null, origin);
        return;
      }
      // No Origin header → same-origin or non-browser.  Skip CORS headers
      // entirely to avoid the wildcard + credentials conflict.
      callback(null, false);
    },
    credentials: true,
    methods: CORS_METHODS,
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
    strictPreflight: false
  });

  // Compress dynamic responses (JSON API, etc.). Static assets are already
  // shipped pre-compressed by @fastify/static (preCompressed), so the 1 KB
  // threshold keeps small payloads untouched and only large dynamic bodies
  // are encoded. Brotli preferred, gzip fallback.
  await server.register(fastifyCompress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip']
  });

  server.addHook('onSend', async (request, reply, payload) => {
    if (String(request.headers['access-control-request-private-network'] || '').toLowerCase() === 'true') {
      reply.header('Access-Control-Allow-Private-Network', 'true');
      reply.header('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method, Access-Control-Request-Private-Network');
    }
    return payload;
  });

  // The iOS/AUv3 WebView is served from the custom `atome:` scheme, an opaque
  // origin that can never join the credentialed allowlist above. Without this
  // it receives no CORS header at all and cannot read a single http response,
  // which is what kept an imported or downloaded wallpaper from ever
  // appearing on the phone. Media routes answer it the way
  // /api/server/verify already does: wildcard origin, no credentials, bearer
  // token in the header. Every other route stays restricted.
  server.addHook('onSend', async (request, reply, payload) => {
    applyOpaqueNativeOriginCors(request, reply);
    return payload;
  });

  // @fastify/cors answers a preflight only for an allowlisted origin; from the
  // opaque one it falls through to route matching and a missing OPTIONS route
  // means a 404, which fails the preflight before the real request is sent.
  for (const preflightRoute of [
    '/api/uploads',
    '/api/uploads/*',
    '/api/recordings/*',
    '/api/extract-audio/*',
    '/api/media-token'
  ]) {
    server.options(preflightRoute, (request, reply) => reply.code(204).send());
  }

  // Always-on diagnostic endpoint (useful in production to confirm which code is running)
  server.get('/__whoami', async () => {
    return {
      success: true,
      type: SERVER_TYPE,
      appVersion: SERVER_VERSION,
      eveVersion: EVE_VERSION,
      fingerprint: getServerFingerprint()
    };
  });

  server.get('/healthz', async () => {
    return {
      success: true,
      type: SERVER_TYPE,
      appVersion: SERVER_VERSION,
      eveVersion: EVE_VERSION,
      uptime_sec: Number(process.uptime().toFixed(2))
    };
  });

  server.addHook('onRequest', async (request, reply) => {
    request.request_id = request.id;
    request._requestStartMs = Date.now();
    reply.header('x-request-id', request.id);
  });

  server.addHook('onResponse', async (request, reply) => {
    if (request.url.startsWith('/auth/v/') || request.url.startsWith('/api/social/')) return;
    if (MINIMAL_LOGS && reply.statusCode < 400) return;
    const durationMs = Date.now() - (request._requestStartMs || Date.now());
    logStructured('info', {
      component: 'http',
      request_id: request.id,
      message: `${request.method} ${request.url} ${reply.statusCode}`,
      data: {
        method: request.method,
        url: request.url,
        status_code: reply.statusCode,
        duration_ms: durationMs
      }
    });
  });

  server.addHook('onError', async (request, reply, error) => {
    if (request.url.startsWith('/auth/v/') || request.url.startsWith('/api/social/')) return;
    const lifecycle = classifyHttpLifecycleError({ error, request, reply });
    const details = {
      timestamp: new Date().toISOString(),
      request_id: request?.id || null,
      method: request?.method,
      url: request?.url,
      status_code: reply?.statusCode,
      message: error?.message || String(error)
    };
    if (lifecycle.reportAsError !== true) {
      logStructured('debug', {
        component: 'http',
        request_id: request?.id || null,
        message: lifecycle.kind,
        data: details
      });
      return;
    }
    recordRecentError(details);
    logStructured('error', {
      component: 'http',
      request_id: request?.id || null,
      message: details.message,
      data: details
    });
  });
}
