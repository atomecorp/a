/**
 * registerServerIdentityRoutes — extracted from auth.js registerAuthRoutes.
 */

import path from 'path';
import fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import { appendEvent } from '../database/adole.js';
import { getABoxEventBus } from './aBoxServer.js';
import { initServerIdentity, signChallenge, getServerIdentity, isConfigured as serverIdentityConfigured } from './serverIdentity.js';
import { ensureUserHome } from './userHome.js';
import { normalizePhone, generateDeterministicUserId, hashPassword, verifyPassword, requireConfiguredAuthSecret } from './auth_crypto.js';
import { createUserAtome, findUserByPhone, ensureAnonymousUser, findUserById, listAllUsers, updateUserParticle, deleteUserAtome, syncUserToTauri, ANONYMOUS_PHONE, ANONYMOUS_USERNAME, ANONYMOUS_PASSWORD, ANONYMOUS_VISIBILITY, ANONYMOUS_OPTIONAL } from './auth_users.js';
import { getUserOptionalParticles, ensureUserAtomeType, repairMistypedUserAtomes, upsertUserStateCurrent, normalizeUserOptional, normalizeAccessValue } from './auth_user_particles.js';
import { generateOTP, storeOTP, verifyOTP, readClientRateKey, enforceAuthIdentityRateLimit, enforceAuthRateLimit, sendSMS } from './auth_otp.js';
import { readRefreshTokenFromRequest, readRefreshSessions, writeRefreshSessions, createRefreshSession, consumeRefreshSession, revokeRefreshToken, setAuthCookies, COOKIE_MAX_AGE, REFRESH_COOKIE_NAME } from './auth_sessions.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fs = fsp;

export function registerServerIdentityRoutes(server, { dataSource, isProduction }) {
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
    server.post('/api/server/verify', async (request, reply) => {
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

    // =========================================================================
    // ADMIN ROUTES (UPDATE SYSTEM)
    // =========================================================================

    /**
     * POST /api/admin/apply-update
     * Write update files to the server (admin only)
     * Security: Only allows writes to specific directories
     */
}
