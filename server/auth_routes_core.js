/**
 * registerCoreAuthRoutes — extracted from auth.js registerAuthRoutes.
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

export function registerCoreAuthRoutes(server, { dataSource, isProduction }) {
    server.post('/api/auth/check-phone', async (request, reply) => {
        const { phone } = request.body || {};

        const cleanPhone = normalizePhone(phone);

        if (!cleanPhone || cleanPhone.length < 6) {
            return reply.code(400).send({
                success: false,
                exists: false,
                error: 'Valid phone number is required'
            });
        }

        try {
            // ADOLE v3.0: Check if phone exists in particles
            const existingUser = await findUserByPhone(dataSource, cleanPhone);

            return {
                success: true,
                exists: existingUser !== null,
                // Don't return user ID for privacy
            };

        } catch (error) {
            request.log.error({ err: error }, 'Phone check failed');
            return reply.code(500).send({
                success: false,
                exists: false,
                error: 'Check failed'
            });
        }
    });

    /**
     * GET /api/auth/users
     * List all users in the database (for sync debugging)
     * ADOLE v3.0: Users are atomes with atome_type='user', properties in particles
     */
    server.get('/api/auth/users', async (request, reply) => {
        if (process.env.SQUIRREL_ENABLE_AUTH_USER_LIST !== '1') {
            return reply.code(404).send({ success: false, error: 'Not found' });
        }
        try {
            const token = request.cookies.access_token
                || String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
            if (!token) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }
            server.jwt.verify(token);
            // Query user atomes with their particles (phone, username, etc.)
            const rows = await dataSource.query(
                `SELECT 
                    a.atome_id as user_id,
                    a.created_at,
                    a.updated_at,
                    a.created_source,
                    a.last_sync,
                    MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) as username,
                    MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) as phone
                 FROM atomes a
                 LEFT JOIN particles p ON a.atome_id = p.atome_id
                 WHERE a.atome_type = 'user' AND a.deleted_at IS NULL
                 GROUP BY a.atome_id, a.created_at, a.updated_at, a.created_source, a.last_sync
                 ORDER BY a.created_at DESC`
            );

            console.log(`[Auth] Listed ${rows.length} users from LibSQL (ADOLE atomes)`);

            // Helper to safely parse JSON values
            const parseJsonValue = (val) => {
                if (!val) return null;
                try { return JSON.parse(val); } catch (error) {
        console.warn("[cleanup] operation failed", error); return val; }
            };

            return {
                success: true,
                database: 'Fastify/LibSQL (ADOLE v3.0)',
                users: rows.map(row => ({
                    user_id: row.user_id,
                    username: parseJsonValue(row.username) || 'Unknown',
                    phone: parseJsonValue(row.phone) || 'Unknown',
                    created_at: row.created_at,
                    last_sync: row.last_sync || null,
                    created_source: row.created_source || null,
                    synced: row.last_sync ? true : false
                }))
            };
        } catch (error) {
            request.log.error({ err: error }, 'List users failed');
            return reply.code(500).send({
                success: false,
                database: 'Fastify/LibSQL (ADOLE v3.0)',
                users: [],
                error: error.message
            });
        }
    });

    /**
     * POST /api/auth/register
     * Create a new user account
     * ADOLE v3.0: Users are atomes with atome_type='user', properties in particles
     */
    server.post('/api/auth/login', async (request, reply) => {
        const { phone, password } = request.body || {};

        if (!phone || !password) {
            return reply.code(400).send({ success: false, error: 'Phone and password are required' });
        }

        const cleanPhone = normalizePhone(phone);
        const rate = enforceAuthRateLimit(request, 'login', cleanPhone);
        if (!rate.ok) {
            reply.header('retry-after', String(rate.retryAfterSeconds));
            return reply.code(429).send({ success: false, error: 'Too many authentication attempts' });
        }

        try {
            // ADOLE v3.0: Find user by phone (query particles)
            const user = await findUserByPhone(dataSource, cleanPhone);

            if (!user) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, error: 'Invalid credentials' };
            }

            const normalizedUserPhone = normalizePhone(user.phone);
            if (!normalizedUserPhone || normalizedUserPhone !== cleanPhone) {
                console.warn(`[Auth] 🚨 Phone mismatch on login: expected ${cleanPhone.slice(0, 4)}*** got ${String(user.phone || '').slice(0, 4)}*** (userId=${user.user_id})`);
                return { success: false, error: 'Invalid credentials' };
            }

            // Verify password
            const passwordValid = await verifyPassword(password, user.password_hash);
            if (!passwordValid) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, error: 'Invalid credentials' };
            }

            try {
                const visibilityRows = await dataSource.query(
                    'SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ? LIMIT 1',
                    [user.user_id, 'visibility']
                );
                const visibilityRaw = visibilityRows[0]?.particle_value || null;
                const visibility = visibilityRaw ? JSON.parse(visibilityRaw) : 'public';
                await upsertUserStateCurrent(
                    dataSource,
                    user.user_id,
                    user.username,
                    user.phone,
                    visibility || 'public',
                    new Date().toISOString()
                );
            } catch (error) {
        console.warn("[cleanup] operation failed", error);
                // Ignore state_current sync issues on login.
            }

            const refreshSession = await createRefreshSession(dataSource, user.user_id, 'login');
            const token = server.jwt.sign({
                id: user.user_id,
                tenantId: 'local-tenant', // ADOLE: flat tenant model
                phone: user.phone,
                username: user.username,
                refresh_session_id: refreshSession.session_id
            });

            setAuthCookies(reply, token, refreshSession.refresh_token, isProduction);

            console.log(`✅ User logged in (ADOLE): ${user.username} (${user.phone})`);

            try {
                await ensureUserHome(PROJECT_ROOT, {
                    id: user.user_id,
                    username: user.username,
                    phone: user.phone
                });
            } catch (e) {
                console.warn('[auth] Failed to prepare user home:', e.message);
            }

            return {
                success: true,
                authenticated: true,
                logged: true,
                user: {
                    id: user.user_id,
                    username: user.username,
                    phone: user.phone,
                    optional: await getUserOptionalParticles(dataSource, user.user_id)
                }
            };

        } catch (error) {
            request.log.error({ err: error }, 'Login failed');
            return reply.code(500).send({ success: false, error: 'Login failed: ' + error.message });
        }
    });

    /**
     * POST /api/auth/logout
     * Clear session cookie
     */
    server.post('/api/auth/logout', async (request, reply) => {
        try {
            const refreshToken = readRefreshTokenFromRequest(request);
            const accessToken = request.cookies?.access_token || '';
            if (refreshToken && accessToken) {
                const decoded = server.jwt.verify(accessToken);
                const userId = String(decoded.id || decoded.sub || '').trim();
                if (userId) await revokeRefreshToken(dataSource, userId, refreshToken, 'logout');
            }
        } catch {
            // Logout must clear local cookies even when the presented session is already invalid.
        }
        reply.clearCookie('access_token', {
            path: '/',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict'
        });
        reply.clearCookie(REFRESH_COOKIE_NAME, {
            path: '/api/auth/refresh',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict'
        });
        return { success: true, message: 'Logged out successfully' };
    });

    /**
     * GET /api/auth/me
     * Get current authenticated user
     * Uses simplified SQLite schema with direct users table
     */
    server.get('/api/auth/me', async (request, reply) => {
        try {
            // Accept token from cookie OR Authorization header
            let token = request.cookies.access_token;

            // Secondary to Authorization header if no cookie
            if (!token) {
                const authHeader = request.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    token = authHeader.substring(7);
                }
            }

            if (!token) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, authenticated: false };
            }

            const decoded = server.jwt.verify(token);

            // Support both HTTP-issued tokens ({ id }) and ws/api-issued tokens ({ userId }).
            // Also accept common JWT conventions like { sub }.
            const resolvedUserId = decoded?.id || decoded?.userId || decoded?.user_id || decoded?.sub || null;
            if (!resolvedUserId) {
                reply.clearCookie('access_token', {
                    path: '/',
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: 'strict'
                });
                return { success: false, authenticated: false };
            }

            // ADOLE v3.0: Fetch user data from atomes+particles
            const user = await findUserById(dataSource, String(resolvedUserId));

            if (!user) {
                reply.clearCookie('access_token', {
                    path: '/',
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: 'strict'
                });
                return { success: false, authenticated: false, error: 'User not found' };
            }

            return {
                success: true,
                authenticated: true,
                logged: true,
                user: {
                    id: user.user_id,
                    username: user.username,
                    phone: user.phone,
                    optional: await getUserOptionalParticles(dataSource, user.user_id)
                }
            };

        } catch (error) {
            reply.clearCookie('access_token', {
                path: '/',
                httpOnly: true,
                secure: isProduction,
                sameSite: 'strict'
            });
            // Return 200 with success:false for invalid/expired tokens
            return { success: false, authenticated: false };
        }
    });

    /**
     * PUT /api/auth/update
     * Update user profile
     */
}
