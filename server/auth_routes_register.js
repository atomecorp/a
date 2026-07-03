/**
 * registerRegisterRoutes — register + sync-register, extracted from auth_routes_core.
 */

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

export function registerRegisterRoutes(server, { dataSource, isProduction }) {
    server.post('/api/auth/register', async (request, reply) => {
        const body = request.body || {};
        const { username, phone, password, optional = {} } = body;
        const incomingAccess = body.access ?? body.visibility;
        const visibility = normalizeAccessValue(incomingAccess || 'public');
        console.log(`[Auth] Register request access=${incomingAccess ?? 'n/a'} resolvedVisibility=${visibility}`);

        // Validation
        if (!username || typeof username !== 'string' || username.trim().length < 2) {
            return reply.code(400).send({ success: false, error: 'Username must be at least 2 characters' });
        }

        const cleanPhone = normalizePhone(phone);

        if (!cleanPhone || cleanPhone.length < 6) {
            return reply.code(400).send({ success: false, error: 'Valid phone number is required' });
        }

        if (!password || typeof password !== 'string' || password.length < 8) {
            return reply.code(400).send({ success: false, error: 'Password must be at least 8 characters' });
        }

        const cleanUsername = username.trim();
        const safeOptional = normalizeUserOptional(optional);

        try {
            // Check if phone already exists (ADOLE: query particles for phone)
            const existingUser = await findUserByPhone(dataSource, cleanPhone);

            if (existingUser) {
                return { success: false, error: 'Invalid credentials', alreadyExists: true };
            }

            // Hash password
            const passwordHash = await hashPassword(password);

            // Use deterministic user ID based on phone number
            // This ensures same user gets same ID across Fastify, Tauri, and iOS
            const principalId = generateDeterministicUserId(cleanPhone);
            const now = new Date().toISOString();

            // Create user atome with particles (ADOLE v3.0)
            // visibility: 'public' = visible in user_list, 'private' = hidden (default)
            await createUserAtome(dataSource, principalId, cleanUsername, cleanPhone, passwordHash, visibility, safeOptional);

            try {
                const accessRows = await dataSource.query(
                    'SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ?',
                    [principalId, 'access']
                );
                const storedAccess = accessRows?.[0]?.particle_value ? JSON.parse(accessRows[0].particle_value) : null;
                console.log(`[Auth] Register stored access=${storedAccess ?? 'unknown'} userId=${principalId}`);
            } catch (error) {
        console.warn("[cleanup] operation failed", error);
                console.log(`[Auth] Register stored access=unknown userId=${principalId}`);
            }

            console.log(`✅ User registered (ADOLE atome): ${cleanUsername} (${cleanPhone}) [${principalId}]`);

            const refreshSession = await createRefreshSession(dataSource, principalId, 'register');
            const token = server.jwt.sign({
                id: principalId,
                tenantId: 'local-tenant',
                phone: cleanPhone,
                username: cleanUsername,
                refresh_session_id: refreshSession.session_id
            });

            setAuthCookies(reply, token, refreshSession.refresh_token, isProduction);

            // Sync to Tauri server (async, don't block response)
            let syncResult = { success: false };
            try {
                syncResult = await syncUserToTauri(cleanUsername, cleanPhone, passwordHash, principalId, safeOptional, visibility);
            } catch (e) {
                console.warn('[auth] Tauri sync error:', e.message);
            }

            // Emit account creation event for sync
            try {
                const eventBus = getABoxEventBus();
                if (eventBus) {
                    eventBus.emit('event', {
                        type: 'sync:account-created',
                        timestamp: now,
                        runtime: 'Fastify',
                        payload: {
                            userId: principalId,
                            username: cleanUsername,
                            phone: cleanPhone,
                            optional: safeOptional
                        }
                    });
                    console.log('[auth] Emitted sync:account-created event');
                }
            } catch (e) {
                console.warn('[auth] Could not emit account-created event:', e.message);
            }

            return {
                success: true,
                authenticated: true,
                logged: true,
                message: 'Account created successfully',
                principalId,
                synced: syncResult.success,
                user: {
                    id: principalId,
                    user_id: principalId,
                    username: cleanUsername,
                    phone: cleanPhone,
                    optional: safeOptional
                }
            };

        } catch (error) {
            request.log.error({ err: error }, 'Registration failed');
            return reply.code(500).send({ success: false, error: 'Registration failed: ' + error.message });
        }
    });

    /**
     * POST /api/auth/sync-register
     * Create a user account from another server (Tauri sync)
     * Accepts pre-hashed password for server-to-server sync
     * Uses a sync secret for authentication instead of user credentials
     */
    server.post('/api/auth/sync-register', async (request, reply) => {
        // Accept both camelCase (from Tauri) and snake_case formats
        const body = request.body || {};
        const username = body.username;
        const phone = body.phone;
        const passwordHash = body.passwordHash || body.password_hash;
        const incomingAccess = body.access ?? body.visibility;
        const visibility = normalizeAccessValue(incomingAccess || 'public');
        const syncSecret = body.syncSecret || body.sync_secret;
        const sourceServer = body.source || body.source_server;

        // Also check headers for sync secret (preferred method)
        const headerSyncSecret = request.headers['x-sync-secret'];

        // Validate sync secret (simple shared secret for now)
        const expectedSecret = process.env.SYNC_SECRET || 'squirrel-sync-2024';
        const providedSecret = headerSyncSecret || syncSecret;
        if (providedSecret !== expectedSecret) {
            return reply.code(403).send({ success: false, error: 'Invalid sync secret' });
        }

        // Validation
        if (!username || typeof username !== 'string' || username.trim().length < 2) {
            return reply.code(400).send({ success: false, error: 'Username must be at least 2 characters' });
        }

        const cleanPhone = normalizePhone(phone);

        if (!cleanPhone || cleanPhone.length < 6) {
            return reply.code(400).send({ success: false, error: 'Valid phone number is required' });
        }

        if (!passwordHash || typeof passwordHash !== 'string') {
            return reply.code(400).send({ success: false, error: 'Password hash is required for sync' });
        }

        const cleanUsername = username.trim();

        try {
            // ADOLE v3.0: Check if phone already exists in particles
            const existingUser = await findUserByPhone(dataSource, cleanPhone);

            if (existingUser) {
                // User already exists - this is fine for sync
                return { success: true, message: 'User already exists', alreadyExists: true, principalId: existingUser.user_id };
            }

            // Create user atome with pre-hashed password (ADOLE v3.0)
            const principalId = generateDeterministicUserId(cleanPhone);

            console.log(`[Auth] Sync-register request access=${incomingAccess ?? 'n/a'} resolvedVisibility=${visibility}`);

            await createUserAtome(dataSource, principalId, cleanUsername, cleanPhone, passwordHash, visibility, body.optional || {});

            try {
                const accessRows = await dataSource.query(
                    'SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ?',
                    [principalId, 'access']
                );
                const storedAccess = accessRows?.[0]?.particle_value ? JSON.parse(accessRows[0].particle_value) : null;
                console.log(`[Auth] Sync-register stored access=${storedAccess ?? 'unknown'} userId=${principalId}`);
            } catch (error) {
        console.warn("[cleanup] operation failed", error);
                console.log(`[Auth] Sync-register stored access=unknown userId=${principalId}`);
            }

            // Update last_sync particle
            await updateUserParticle(dataSource, principalId, 'last_sync', new Date().toISOString());

            console.log(`✅ User synced (ADOLE atome) from ${sourceServer || 'unknown'}: ${cleanUsername} (${cleanPhone}) [${principalId}]`);

            return {
                success: true,
                message: 'User synced successfully',
                principalId
            };

        } catch (error) {
            request.log.error({ err: error }, 'Sync registration failed');
            return reply.code(500).send({ success: false, error: 'Sync registration failed' });
        }
    });

    /**
     * POST /api/auth/login
     * Authenticate user and create session
     * ADOLE v3.0: Users are atomes with atome_type='user', properties in particles
     */
}
