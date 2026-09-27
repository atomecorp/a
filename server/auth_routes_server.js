/**
 * registerServerIdentityRoutes — extracted from auth.js registerAuthRoutes.
 */

import { signChallenge, getServerIdentity, isConfigured as serverIdentityConfigured } from './serverIdentity.js';

export function registerServerIdentityRoutes(server, { dataSource, isProduction }) {
    // Association and handoff are infrastructure only. GET never consumes a
    // challenge, sends an SMS, or creates an authenticated session.
    server.get('/.well-known/apple-app-site-association', async (_request, reply) => {
        reply.type('application/json').header('Cache-Control', 'public, max-age=3600');
        return { applinks: { apps: [], details: [{ appID: '2W25PVZ57F.one.atome.app', paths: ['/auth/v/*'] }] } };
    });
    server.get('/auth/v/:attemptId', { logLevel: 'silent' }, async (request, reply) => {
        reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
            .header('X-Content-Type-Options', 'nosniff').header('X-Robots-Tag', 'noindex, nofollow')
            .header('Content-Security-Policy', "default-src 'none'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        if (!/^[A-Za-z0-9_-]{43}$/.test(request.params.attemptId) || Object.keys(request.query).length) {
            return reply.code(400).send();
        }
        return reply.sendFile('auth-link.html', { cacheControl: false, etag: false, lastModified: false });
    });
    server.get('/api/server/identity', async (request, reply) => {
        const identity = getServerIdentity();
        return {
            success: true,
            serverId: identity.serverId,
            serverName: identity.serverName,
            hasSigningCapability: identity.hasSigningCapability,
            algorithm: identity.algorithm,
            fingerprint: identity.fingerprint,
            // Don't send full public key here, only on /verify endpoint
            timestamp: Date.now()
        };
    });

    /**
     * POST /api/server/verify
     * Challenge-response verification endpoint
     * Client sends a random challenge, server signs it with private key
     * Client can verify signature using server's public key
     */
    // Public signed challenge: no account data, cookie or credential is used.
    // WKWebView's atome:// origin is opaque; keep other routes' CORS restricted.
    const verificationCors = { origin: '*', credentials: false, methods: ['POST'], allowedHeaders: ['content-type', 'accept'] };
    server.options('/api/server/verify', { config: { cors: verificationCors } }, (request, reply) => reply.code(204).send());
    server.post('/api/server/verify', { config: { cors: verificationCors } }, async (request, reply) => {
        const { challenge } = request.body || {};

        // Validate challenge
        if (!challenge || typeof challenge !== 'string') {
            return reply.code(400).send({
                success: false,
                error: 'Challenge is required',
                errorCode: 'INVALID_CHALLENGE'
            });
        }

        if (challenge.length < 32) {
            return reply.code(400).send({
                success: false,
                error: 'Challenge must be at least 32 characters',
                errorCode: 'CHALLENGE_TOO_SHORT'
            });
        }

        if (challenge.length > 256) {
            return reply.code(400).send({
                success: false,
                error: 'Challenge must be at most 256 characters',
                errorCode: 'CHALLENGE_TOO_LONG'
            });
        }

        // Sign the challenge
        const signedResponse = signChallenge(challenge);

        if (!signedResponse.success) {
            // Server doesn't have signing capability configured
            return reply.code(503).send(signedResponse);
        }

        return signedResponse;
    });

    /**
     * GET /api/server/status
     * Returns server status and verification capabilities
     */
    server.get('/api/server/status', async (request, reply) => {
        return {
            success: true,
            status: 'online',
            verificationEnabled: serverIdentityConfigured(),
            timestamp: Date.now(),
            version: process.env.npm_package_version || '1.0.0'
        };
    });

}
