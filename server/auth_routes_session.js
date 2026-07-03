/**
 * registerSessionRoutes — extracted from auth.js registerAuthRoutes.
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

export function registerSessionRoutes(server, { dataSource, isProduction }) {
    server.post('/api/auth/refresh', async (request, reply) => {
        try {
            const rate = enforceAuthRateLimit(request, 'token_refresh', 'session', 20);
            if (!rate.ok) {
                reply.header('retry-after', String(rate.retryAfterSeconds));
                return reply.code(429).send({ success: false, error: 'Too many refresh attempts' });
            }
            const refreshToken = readRefreshTokenFromRequest(request);
            if (!refreshToken) {
                return reply.code(401).send({ success: false, error: 'No refresh session provided' });
            }

            const [refreshSessionId] = refreshToken.split('.');
            if (!refreshSessionId) {
                return reply.code(401).send({ success: false, error: 'Invalid refresh session' });
            }

            const sessionRows = await dataSource.query(
                'SELECT atome_id FROM particles WHERE particle_key = ? AND particle_value LIKE ? LIMIT 1',
                [`%${refreshSessionId}%`]
            );
            const userId = sessionRows?.[0]?.atome_id ? String(sessionRows[0].atome_id) : '';
            if (!userId) {
                return reply.code(401).send({ success: false, error: 'Refresh session not found' });
            }

            // ADOLE v3.0: Verify user atome still exists
            const user = await findUserById(dataSource, userId);

            if (!user) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const refreshSession = await consumeRefreshSession(dataSource, user.user_id, refreshToken);
            if (refreshSession.ok !== true) {
                return reply.code(401).send({ success: false, error: 'Refresh session rejected' });
            }

            const newToken = server.jwt.sign({
                sub: user.user_id,
                id: user.user_id,
                username: user.username,
                phone: user.phone,
                refresh_session_id: refreshSession.session_id
            });

            setAuthCookies(reply, newToken, refreshSession.refresh_token, isProduction);

            return {
                success: true,
                user: {
                    id: user.user_id,
                    username: user.username,
                    phone: user.phone
                }
            };

        } catch (error) {
            request.log.error({ err: error }, 'Token refresh failed');
            return reply.code(500).send({ success: false, error: 'Token refresh failed' });
        }
    });

    console.log('🔐 Authentication routes registered');
    console.log('🔧 Admin update route registered: /api/admin/apply-update');
    console.log('🔧 Admin batch-update route registered: /api/admin/batch-update');
    console.log('🔧 Admin sync-from-zip route registered: /api/admin/sync-from-zip');
    if (serverIdentityConfigured()) {
        console.log('🔑 Server identity verification enabled');
    } else {
        console.log('⚠️  Server identity not configured (run npm run generate-keys)');
    }
}
