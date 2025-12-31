/**
 * Authentication module for Squirrel Framework
 * Handles user registration, login, sessions (JWT + HttpOnly cookies), and OTP for password reset.
 * 
 * Supports both local and remote server configurations via configurable API base URL.
 * Includes server identity verification for secure client authentication.
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { initServerIdentity, signChallenge, getServerIdentity, isConfigured as serverIdentityConfigured } from './serverIdentity.js';
import { getABoxEventBus } from './aBoxServer.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { ensureUserHome } from './userHome.js';

// Get project root (parent of server/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// =============================================================================
// CONSTANTS
// =============================================================================

const SALT_ROUNDS = 10;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const JWT_EXPIRY = '7d'; // 7 days
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

// Namespace UUID for deterministic user ID generation
// This MUST be the same in Fastify and Axum to generate identical user IDs
const SQUIRREL_USER_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Generate a deterministic user ID from phone number
 * Uses UUID v5 (SHA-1 based) with a fixed namespace
 * This ensures the same phone number always produces the same user ID
 * across all platforms (Fastify, Axum/Tauri, iOS)
 * 
 * @param {string} phone - The normalized phone number
 * @returns {string} - Deterministic UUID
 */
function generateDeterministicUserId(phone) {
    // Normalize phone: remove spaces, ensure consistent format
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '').toLowerCase();

    // Generate UUID v5 from phone + namespace
    const userId = uuidv5(normalizedPhone, SQUIRREL_USER_NAMESPACE);

    console.log(`[Auth] Generated deterministic userId for phone ${phone.substring(0, 4)}***: ${userId}`);
    return userId;
}

// In-memory OTP storage (use Redis in production for multi-instance deployments)
const otpStore = new Map();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
export async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Stored hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * Generate a 6-digit OTP code
 * @returns {string}
 */
export function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store an OTP for a phone number
 * @param {string} phone
 * @param {string} code
 */
export function storeOTP(phone, code) {
    otpStore.set(phone, {
        code,
        expires: Date.now() + OTP_EXPIRY_MS
    });
}

/**
 * Verify and consume an OTP
 * @param {string} phone
 * @param {string} code
 * @returns {{ valid: boolean, error?: string }}
 */
export function verifyOTP(phone, code) {
    const stored = otpStore.get(phone);

    if (!stored) {
        return { valid: false, error: 'No pending OTP request for this phone number' };
    }

    if (Date.now() > stored.expires) {
        otpStore.delete(phone);
        return { valid: false, error: 'OTP has expired' };
    }

    if (stored.code !== code) {
        return { valid: false, error: 'Invalid OTP code' };
    }

    // Consume the OTP (one-time use)
    otpStore.delete(phone);
    return { valid: true };
}

/**
 * Simulate sending an SMS (replace with real provider in production)
 * @param {string} phone
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function sendSMS(phone, message) {
    // TODO: Integrate with real SMS provider (Twilio, Vonage, OVH, etc.)
    console.log(`📱 [SMS SIMULATION] To: ${phone} | Message: "${message}"`);
    return true;
}

// =============================================================================
// ADOLE v3.0 USER FUNCTIONS (Users are Atomes with particles)
// =============================================================================

/**
 * Create a user as an atome with particles for properties
 * @param {Object} dataSource - Database connection
 * @param {string} userId - User's unique ID
 * @param {string} username - User's display name
 * @param {string} phone - User's phone number
 * @param {string} passwordHash - Bcrypt hashed password
 * @param {string} [visibility='public'] - Account visibility: 'public' or 'private'
 * @returns {Promise<Object>} Created user data
 */
async function createUserAtome(dataSource, userId, username, phone, passwordHash, visibility = 'public') {
    const now = new Date().toISOString();
    // Normalize visibility value
    const normalizedVisibility = (visibility === 'private') ? 'private' : 'public';

    // Check if user exists (including soft-deleted)
    const existingRows = await dataSource.query(
        `SELECT atome_id, deleted_at FROM atomes WHERE atome_id = ?`,
        [userId]
    );

    if (existingRows.length > 0) {
        const existing = existingRows[0];
        if (existing.deleted_at) {
            // Reactivate soft-deleted user
            console.log(`🔄 [ADOLE] Reactivating soft-deleted user: ${userId}`);

            // Clear deleted_at and update timestamp
            await dataSource.query(
                `UPDATE atomes SET deleted_at = NULL, updated_at = ?, sync_status = 'local' WHERE atome_id = ?`,
                [now, userId]
            );

            // Update particles (username and password might have changed)
            await dataSource.query(
                `UPDATE particles SET particle_value = ?, updated_at = ? WHERE atome_id = ? AND particle_key = 'username'`,
                [JSON.stringify(username), now, userId]
            );
            await dataSource.query(
                `UPDATE particles SET particle_value = ?, updated_at = ? WHERE atome_id = ? AND particle_key = 'password_hash'`,
                [JSON.stringify(passwordHash), now, userId]
            );

            console.log(`✅ [ADOLE] User reactivated: ${username} (${phone}) [${userId}]`);

            return {
                user_id: userId,
                username,
                phone,
                created_at: now,
                created_source: 'fastify',
                reactivated: true
            };
        } else {
            // User exists and is not deleted - throw error
            throw new Error('User already exists');
        }
    }

    // Create the atome with type 'user'
    await dataSource.query(
        `INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, sync_status, created_source, created_at, updated_at)
         VALUES (?, 'user', ?, ?, 'local', 'fastify', ?, ?)`,
        [userId, userId, userId, now, now]
    );

    // Create particles for user properties (particle_id is auto-increment)
    const particles = [
        { key: 'phone', value: JSON.stringify(phone) },
        { key: 'username', value: JSON.stringify(username) },
        { key: 'password_hash', value: JSON.stringify(passwordHash) },
        { key: 'visibility', value: JSON.stringify(normalizedVisibility) }
    ];

    for (const p of particles) {
        await dataSource.query(
            `INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
             VALUES (?, ?, ?, ?)`,
            [userId, p.key, p.value, now]
        );
    }

    console.log(`✅ [ADOLE] User atome created: ${username} (${phone}) [${userId}]`);

    return {
        user_id: userId,
        username,
        phone,
        created_at: now,
        created_source: 'fastify'
    };
}

/**
 * Find a user by phone number (query atomes+particles)
 * @param {Object} dataSource - Database connection
 * @param {string} phone - Phone number to search
 * @returns {Promise<Object|null>} User data or null
 */
async function findUserByPhone(dataSource, phone) {
    const rows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'password_hash' THEN p.particle_value END) AS password_hash
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id
         WHERE a.atome_type = 'user' AND a.deleted_at IS NULL
         GROUP BY a.atome_id
         HAVING MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) = ?`,
        [JSON.stringify(phone)]
    );

    if (rows.length === 0) return null;

    const user = rows[0];
    // Parse JSON values
    return {
        user_id: user.user_id,
        username: user.username ? JSON.parse(user.username) : null,
        phone: user.phone ? JSON.parse(user.phone) : null,
        password_hash: user.password_hash ? JSON.parse(user.password_hash) : null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sync: user.last_sync,
        created_source: user.created_source
    };
}

/**
 * Find a user by user_id (query atomes+particles)
 * @param {Object} dataSource - Database connection
 * @param {string} userId - User ID to search
 * @returns {Promise<Object|null>} User data or null
 */
async function findUserById(dataSource, userId) {
    const rows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'password_hash' THEN p.particle_value END) AS password_hash
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id
         WHERE a.atome_id = ? AND a.atome_type = 'user' AND a.deleted_at IS NULL
         GROUP BY a.atome_id`,
        [userId]
    );

    if (rows.length === 0) return null;

    const user = rows[0];
    return {
        user_id: user.user_id,
        username: user.username ? JSON.parse(user.username) : null,
        phone: user.phone ? JSON.parse(user.phone) : null,
        password_hash: user.password_hash ? JSON.parse(user.password_hash) : null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sync: user.last_sync,
        created_source: user.created_source
    };
}

/**
 * List all PUBLIC users (query atomes with type='user' and visibility='public')
 * Private users are hidden and must be contacted by phone number directly.
 * @param {Object} dataSource - Database connection
 * @param {boolean} [includePrivate=false] - If true, include private users (admin only)
 * @returns {Promise<Array>} Array of user objects
 */
async function listAllUsers(dataSource, includePrivate = false) {
    // Build query with visibility filter
    const visibilityFilter = includePrivate
        ? ''
        : `AND EXISTS (SELECT 1 FROM particles pv WHERE pv.atome_id = a.atome_id AND pv.particle_key = 'visibility' AND pv.particle_value = '"public"')`;

    const rows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id
         WHERE a.atome_type = 'user' AND a.deleted_at IS NULL ${visibilityFilter}
         GROUP BY a.atome_id
         ORDER BY a.created_at DESC`
    );

    return rows.map(user => ({
        user_id: user.user_id,
        username: user.username ? JSON.parse(user.username) : null,
        phone: user.phone ? JSON.parse(user.phone) : null,
        visibility: user.visibility ? JSON.parse(user.visibility) : 'private',
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sync: user.last_sync,
        created_source: user.created_source
    }));
}

/**
 * Update a user's particle (property)
 * @param {Object} dataSource - Database connection
 * @param {string} userId - User's atome_id
 * @param {string} key - Particle key
 * @param {any} value - New value
 */
async function updateUserParticle(dataSource, userId, key, value) {
    const now = new Date().toISOString();
    const valueStr = JSON.stringify(value);

    // Check if particle exists
    const existing = await dataSource.query(
        `SELECT particle_id, version FROM particles WHERE atome_id = ? AND particle_key = ?`,
        [userId, key]
    );

    if (existing.length > 0) {
        const newVersion = (existing[0].version || 1) + 1;
        await dataSource.query(
            `UPDATE particles SET particle_value = ?, version = ?, updated_at = ? WHERE atome_id = ? AND particle_key = ?`,
            [valueStr, newVersion, now, userId, key]
        );
    } else {
        // particle_id is auto-increment, don't specify it
        await dataSource.query(
            `INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
             VALUES (?, ?, ?, 'string', 1, ?, ?)`,
            [userId, key, valueStr, now, now]
        );
    }

    // Update atome's updated_at
    await dataSource.query(
        `UPDATE atomes SET updated_at = ?, sync_status = 'pending' WHERE atome_id = ?`,
        [now, userId]
    );
}

/**
 * Delete a user (soft delete the atome)
 * @param {Object} dataSource - Database connection
 * @param {string} userId - User's atome_id
 */
async function deleteUserAtome(dataSource, userId) {
    const now = new Date().toISOString();
    await dataSource.query(
        `UPDATE atomes SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE atome_id = ?`,
        [now, now, userId]
    );
    console.log(`🗑️ [ADOLE] User atome soft-deleted: ${userId}`);
}

/**
 * Sync a newly created user to Tauri server via WebSocket
 * Uses EventBus instead of POST for reliable async sync
 * @param {string} username - User's username
 * @param {string} phone - User's phone number
 * @param {string} passwordHash - Bcrypt hashed password
 * @param {string} userId - User's atome_id
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function syncUserToTauri(username, phone, passwordHash, userId = null) {
    try {
        const eventBus = getABoxEventBus();
        if (eventBus) {
            eventBus.emit('event', {
                type: 'sync:user-created',
                timestamp: new Date().toISOString(),
                runtime: 'Fastify',
                payload: {
                    userId: userId || generateDeterministicUserId(phone),
                    username,
                    phone,
                    passwordHash,
                    source: 'fastify'
                }
            });
            console.log(`🔄 [WebSocket] User sync event emitted: ${username} (${phone})`);
            return { success: true, synced: true };
        } else {
            console.warn(`⚠️ EventBus not available for sync`);
            return { success: false, error: 'EventBus not available' };
        }
    } catch (error) {
        console.warn(`⚠️ WebSocket sync failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// =============================================================================
// FASTIFY PLUGIN REGISTRATION
// =============================================================================

/**
 * Register authentication routes and plugins on a Fastify instance
 * @param {import('fastify').FastifyInstance} server
 * @param {import('typeorm').DataSource} dataSource
 * @param {object} options
 */
export async function registerAuthRoutes(server, dataSource, options = {}) {
    const {
        jwtSecret = process.env.JWT_SECRET || 'squirrel_jwt_secret_change_in_production',
        cookieSecret = process.env.COOKIE_SECRET || 'squirrel_cookie_secret_change_in_production',
        isProduction = process.env.NODE_ENV === 'production'
    } = options;

    // Import and register plugins
    const fastifyJwt = (await import('@fastify/jwt')).default;
    const fastifyCookie = (await import('@fastify/cookie')).default;

    await server.register(fastifyJwt, {
        secret: jwtSecret,
        sign: { expiresIn: JWT_EXPIRY }
    });

    await server.register(fastifyCookie, {
        secret: cookieSecret,
        hook: 'onRequest'
    });

    // =========================================================================
    // AUTH ROUTES
    // =========================================================================

    /**
     * POST /api/auth/check-phone
     * Check if a phone number is already registered (for sync conflict detection)
     */
    server.post('/api/auth/check-phone', async (request, reply) => {
        const { phone } = request.body || {};

        if (!phone || typeof phone !== 'string' || phone.trim().length < 6) {
            return reply.code(400).send({
                success: false,
                exists: false,
                error: 'Valid phone number is required'
            });
        }

        const cleanPhone = phone.trim().replace(/\s+/g, '');

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
        try {
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
                try { return JSON.parse(val); } catch { return val; }
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
    server.post('/api/auth/register', async (request, reply) => {
        const { username, phone, password, visibility = 'private', optional = {} } = request.body || {};

        // Validation
        if (!username || typeof username !== 'string' || username.trim().length < 2) {
            return reply.code(400).send({ success: false, error: 'Username must be at least 2 characters' });
        }

        if (!phone || typeof phone !== 'string' || phone.trim().length < 6) {
            return reply.code(400).send({ success: false, error: 'Valid phone number is required' });
        }

        if (!password || typeof password !== 'string' || password.length < 8) {
            return reply.code(400).send({ success: false, error: 'Password must be at least 8 characters' });
        }

        const cleanPhone = phone.trim().replace(/\s+/g, '');
        const cleanUsername = username.trim();

        try {
            // Check if phone already exists (ADOLE: query particles for phone)
            const existingUser = await findUserByPhone(dataSource, cleanPhone);

            if (existingUser) {
                // Return 200 with success:true and message to avoid browser console error
                return { success: true, message: 'User already exists - ready to login', alreadyExists: true };
            }

            // Hash password
            const passwordHash = await hashPassword(password);

            // Use deterministic user ID based on phone number
            // This ensures same user gets same ID across Fastify, Tauri, and iOS
            const principalId = generateDeterministicUserId(cleanPhone);
            const now = new Date().toISOString();

            // Create user atome with particles (ADOLE v3.0)
            // visibility: 'public' = visible in user_list, 'private' = hidden (default)
            await createUserAtome(dataSource, principalId, cleanUsername, cleanPhone, passwordHash, visibility);

            console.log(`✅ User registered (ADOLE atome): ${cleanUsername} (${cleanPhone}) [${principalId}]`);

            // Sync to Tauri server (async, don't block response)
            let syncResult = { success: false };
            try {
                syncResult = await syncUserToTauri(cleanUsername, cleanPhone, passwordHash);
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
                            optional: optional || {}
                        }
                    });
                    console.log('[auth] Emitted sync:account-created event');
                }
            } catch (e) {
                console.warn('[auth] Could not emit account-created event:', e.message);
            }

            return {
                success: true,
                message: 'Account created successfully',
                principalId,
                synced: syncResult.success
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

        if (!phone || typeof phone !== 'string' || phone.trim().length < 6) {
            return reply.code(400).send({ success: false, error: 'Valid phone number is required' });
        }

        if (!passwordHash || typeof passwordHash !== 'string') {
            return reply.code(400).send({ success: false, error: 'Password hash is required for sync' });
        }

        const cleanPhone = phone.trim().replace(/\s+/g, '');
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

            await createUserAtome(dataSource, principalId, cleanUsername, cleanPhone, passwordHash);

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
    server.post('/api/auth/login', async (request, reply) => {
        const { phone, password } = request.body || {};

        if (!phone || !password) {
            return reply.code(400).send({ success: false, error: 'Phone and password are required' });
        }

        const cleanPhone = phone.trim().replace(/\s+/g, '');

        try {
            // ADOLE v3.0: Find user by phone (query particles)
            const user = await findUserByPhone(dataSource, cleanPhone);

            if (!user) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, error: 'Invalid credentials' };
            }

            // Verify password
            const passwordValid = await verifyPassword(password, user.password_hash);
            if (!passwordValid) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, error: 'Invalid credentials' };
            }

            // Generate JWT (ADOLE v3.0: no tenant_id, user_id is atome_id)
            const token = server.jwt.sign({
                id: user.user_id,
                tenantId: 'local-tenant', // ADOLE: flat tenant model
                phone: user.phone,
                username: user.username
            });

            // Set HttpOnly cookie
            reply.setCookie('access_token', token, {
                path: '/',
                httpOnly: true,
                secure: isProduction,
                sameSite: 'strict',
                maxAge: COOKIE_MAX_AGE
            });

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
                token: token, // Also return token in response for cross-origin requests
                user: {
                    id: user.user_id,
                    username: user.username,
                    phone: user.phone,
                    optional: {}
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
        reply.clearCookie('access_token', {
            path: '/',
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

            // Fallback to Authorization header if no cookie
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
                user: {
                    id: user.user_id,
                    username: user.username,
                    phone: user.phone,
                    optional: {}
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
    server.put('/api/auth/update', async (request, reply) => {
        try {
            const token = request.cookies.access_token;
            if (!token) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }

            const decoded = server.jwt.verify(token);
            const resolvedUserId = decoded?.id || decoded?.userId || decoded?.user_id || decoded?.sub || null;
            if (!resolvedUserId) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }
            const { username } = request.body || {};

            // ADOLE v3.0: Get current user from atomes+particles
            const current = await findUserById(dataSource, String(resolvedUserId));

            if (!current) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const newUsername = username || current.username;

            // Update username particle
            await updateUserParticle(dataSource, String(resolvedUserId), 'username', newUsername);

            console.log(`✅ User profile updated (ADOLE): ${newUsername}`);

            return {
                success: true,
                user: {
                    id: String(resolvedUserId),
                    username: newUsername,
                    phone: current.phone,
                    optional: {}
                }
            };

        } catch (error) {
            request.log.error({ err: error }, 'Profile update failed');
            return reply.code(500).send({ success: false, error: 'Update failed' });
        }
    });

    // =========================================================================
    // OTP / PASSWORD RESET ROUTES
    // =========================================================================

    /**
     * POST /api/auth/request-otp
     * Send OTP code via SMS for password reset
     */
    server.post('/api/auth/request-otp', async (request, reply) => {
        const { phone } = request.body || {};

        if (!phone) {
            return reply.code(400).send({ success: false, error: 'Phone number is required' });
        }

        const cleanPhone = phone.trim().replace(/\s+/g, '');

        try {
            // ADOLE v3.0: Check if user exists via particles
            const user = await findUserByPhone(dataSource, cleanPhone);

            if (!user) {
                // Don't reveal if user exists or not (security)
                return { success: true, message: 'If this phone is registered, a code has been sent' };
            }

            // Generate and store OTP
            const code = generateOTP();
            storeOTP(cleanPhone, code);

            // Send SMS
            await sendSMS(cleanPhone, `Your Squirrel verification code is: ${code}`);

            console.log(`📱 OTP sent to ${cleanPhone}`);

            return { success: true, message: 'Verification code sent' };

        } catch (error) {
            request.log.error({ err: error }, 'OTP request failed');
            return reply.code(500).send({ success: false, error: 'Failed to send code' });
        }
    });

    /**
     * POST /api/auth/reset-password
     * Reset password using OTP code
     */
    server.post('/api/auth/reset-password', async (request, reply) => {
        const { phone, code, newPassword } = request.body || {};

        if (!phone || !code || !newPassword) {
            return reply.code(400).send({ success: false, error: 'Phone, code, and new password are required' });
        }

        if (newPassword.length < 8) {
            return reply.code(400).send({ success: false, error: 'Password must be at least 8 characters' });
        }

        const cleanPhone = phone.trim().replace(/\s+/g, '');

        // Verify OTP
        const otpResult = verifyOTP(cleanPhone, code);
        if (!otpResult.valid) {
            return reply.code(400).send({ success: false, error: otpResult.error });
        }

        try {
            // Hash new password
            const newHash = await hashPassword(newPassword);

            // ADOLE v3.0: Find user by phone via particles
            const user = await findUserByPhone(dataSource, cleanPhone);

            if (!user) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            // Update password_hash particle
            await updateUserParticle(dataSource, user.user_id, 'password_hash', newHash);

            console.log(`✅ Password reset for ${cleanPhone}`);

            return { success: true, message: 'Password has been reset successfully' };

        } catch (error) {
            request.log.error({ err: error }, 'Password reset failed');
            return reply.code(500).send({ success: false, error: 'Password reset failed' });
        }
    });

    /**
     * POST /api/auth/change-password
     * Change password for authenticated user (requires current password)
     */
    server.post('/api/auth/change-password', async (request, reply) => {
        try {
            // Try to get token from cookie first, then from Authorization header
            let token = request.cookies.access_token;

            if (!token) {
                const authHeader = request.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    token = authHeader.substring(7);
                }
            }

            if (!token) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }

            const decoded = server.jwt.verify(token);
            const resolvedUserId = decoded?.id || decoded?.userId || decoded?.user_id || decoded?.sub || null;
            if (!resolvedUserId) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }
            const { currentPassword, newPassword } = request.body || {};

            if (!currentPassword || !newPassword) {
                return reply.code(400).send({ success: false, error: 'Current and new password are required' });
            }

            if (newPassword.length < 8) {
                return reply.code(400).send({ success: false, error: 'New password must be at least 8 characters' });
            }

            // ADOLE v3.0: Get current user from atomes+particles
            const current = await findUserById(dataSource, String(resolvedUserId));

            if (!current) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            // Verify current password
            const passwordValid = await verifyPassword(currentPassword, current.password_hash);
            if (!passwordValid) {
                return reply.code(401).send({ success: false, error: 'Current password is incorrect' });
            }

            // Hash new password and update particle
            const newHash = await hashPassword(newPassword);
            await updateUserParticle(dataSource, String(resolvedUserId), 'password_hash', newHash);

            console.log(`✅ Password changed for user ${String(resolvedUserId)}`);

            return { success: true, message: 'Password changed successfully' };

        } catch (error) {
            request.log.error({ err: error }, 'Password change failed');
            return reply.code(500).send({ success: false, error: 'Password change failed' });
        }
    });

    /**
     * POST /api/auth/request-phone-change
     * Request OTP to change phone number (for authenticated user)
     */
    server.post('/api/auth/request-phone-change', async (request, reply) => {
        try {
            const token = request.cookies.access_token;
            if (!token) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }

            server.jwt.verify(token); // Just verify token is valid

            const { newPhone } = request.body || {};

            if (!newPhone || newPhone.trim().length < 6) {
                return reply.code(400).send({ success: false, error: 'Valid phone number is required' });
            }

            const cleanPhone = newPhone.trim().replace(/\s+/g, '');

            // ADOLE v3.0: Check if new phone is already in use via particles
            const existingUser = await findUserByPhone(dataSource, cleanPhone);

            if (existingUser) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, error: 'Phone number already in use' };
            }

            // Generate and store OTP for the NEW phone
            const code = generateOTP();
            storeOTP(cleanPhone, code);

            // Send SMS to NEW phone
            await sendSMS(cleanPhone, `Your Squirrel verification code is: ${code}`);

            console.log(`📱 Phone change OTP sent to ${cleanPhone}`);

            return { success: true, message: 'Verification code sent to new phone number' };

        } catch (error) {
            request.log.error({ err: error }, 'Phone change request failed');
            return reply.code(500).send({ success: false, error: 'Failed to request phone change' });
        }
    });

    /**
     * POST /api/auth/verify-phone-change
     * Verify OTP and update phone number
     */
    server.post('/api/auth/verify-phone-change', async (request, reply) => {
        try {
            const token = request.cookies.access_token;
            if (!token) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }

            const decoded = server.jwt.verify(token);
            const resolvedUserId = decoded?.id || decoded?.userId || decoded?.user_id || decoded?.sub || null;
            if (!resolvedUserId) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }
            const { newPhone, code } = request.body || {};

            if (!newPhone || !code) {
                return reply.code(400).send({ success: false, error: 'Phone and code are required' });
            }

            const cleanPhone = newPhone.trim().replace(/\s+/g, '');

            // Verify OTP
            const otpResult = verifyOTP(cleanPhone, code);
            if (!otpResult.valid) {
                return reply.code(400).send({ success: false, error: otpResult.error });
            }

            // ADOLE v3.0: Update phone in particles
            const current = await findUserById(dataSource, String(resolvedUserId));

            if (!current) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            await updateUserParticle(dataSource, String(resolvedUserId), 'phone', cleanPhone);

            // Generate new JWT with updated phone
            const newToken = server.jwt.sign({
                id: String(resolvedUserId),
                tenantId: decoded.tenantId,
                phone: cleanPhone,
                username: current.username
            });

            // Update cookie
            reply.setCookie('access_token', newToken, {
                path: '/',
                httpOnly: true,
                secure: isProduction,
                sameSite: 'strict',
                maxAge: COOKIE_MAX_AGE
            });

            console.log(`✅ Phone changed for user ${String(resolvedUserId)}: ${cleanPhone}`);

            // Parse optional if it's a string
            let optional = current.optional;
            if (typeof optional === 'string') {
                try { optional = JSON.parse(optional); } catch { optional = {}; }
            }

            return {
                success: true,
                message: 'Phone number updated successfully',
                user: {
                    id: String(resolvedUserId),
                    username: current.username,
                    phone: cleanPhone,
                    optional: optional || {}
                }
            };

        } catch (error) {
            request.log.error({ err: error }, 'Phone change verification failed');
            return reply.code(500).send({ success: false, error: 'Phone change failed' });
        }
    });

    // =====================================================
    // DELETE ACCOUNT ROUTE
    // =====================================================
    server.delete('/api/auth/delete-account', async (request, reply) => {
        try {
            // Check for token in cookie OR Authorization header (for cross-origin requests)
            let token = request.cookies?.access_token;

            if (!token) {
                const authHeader = request.headers?.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    token = authHeader.substring(7);
                }
            }

            if (!token) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }

            let decoded;
            try {
                decoded = server.jwt.verify(token);
            } catch {
                reply.clearCookie('access_token', {
                    path: '/',
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: 'strict'
                });
                return reply.code(401).send({ success: false, error: 'Invalid session' });
            }

            const resolvedUserId = decoded?.id || decoded?.userId || decoded?.user_id || decoded?.sub || null;
            if (!resolvedUserId) {
                reply.clearCookie('access_token', {
                    path: '/',
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: 'strict'
                });
                return reply.code(401).send({ success: false, error: 'Invalid session' });
            }

            const { password } = request.body || {};

            if (!password) {
                return reply.code(400).send({ success: false, error: 'Password is required for account deletion' });
            }

            // ADOLE v3.0: Get current user from atomes+particles
            const user = await findUserById(dataSource, String(resolvedUserId));

            if (!user) {
                reply.clearCookie('access_token', {
                    path: '/',
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: 'strict'
                });
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            // Verify password
            const passwordMatch = await verifyPassword(password, user.password_hash);
            if (!passwordMatch) {
                return reply.code(401).send({ success: false, error: 'Incorrect password' });
            }

            // ADOLE v3.0: Delete user atome and all its particles
            await dataSource.query(`DELETE FROM particles WHERE atome_id = ?`, [String(resolvedUserId)]);
            await dataSource.query(`DELETE FROM particles_versions WHERE atome_id = ?`, [String(resolvedUserId)]);
            await dataSource.query(`DELETE FROM permissions WHERE atome_id = ?`, [String(resolvedUserId)]);
            await dataSource.query(`DELETE FROM atomes WHERE atome_id = ?`, [String(resolvedUserId)]);

            console.log(`[delete] User atome ${String(resolvedUserId)} and particles deleted`);

            // Clear the authentication cookie
            reply.clearCookie('access_token', {
                path: '/',
                httpOnly: true,
                secure: isProduction,
                sameSite: 'strict'
            });

            console.log(`🗑️ Account deleted: user ${String(resolvedUserId)}`);

            // === SYNC: Delete account via WebSocket (not POST) ===
            try {
                const eventBus = getABoxEventBus();
                if (eventBus) {
                    eventBus.emit('event', {
                        type: 'sync:user-deleted',
                        timestamp: new Date().toISOString(),
                        runtime: 'Fastify',
                        payload: {
                            userId: String(resolvedUserId),
                            phone: user.phone,
                            username: user.username
                        }
                    });
                    console.log('[auth] ✅ User deletion synced via WebSocket');
                }
            } catch (syncError) {
                console.warn('[auth] ⚠️ Could not sync delete via WebSocket:', syncError.message);
            }

            return {
                success: true,
                message: 'Account deleted successfully'
            };

        } catch (error) {
            request.log.error({ err: error }, 'Account deletion failed');
            return reply.code(500).send({ success: false, error: 'Account deletion failed: ' + error.message });
        }
    });

    // =========================================================================
    // SERVER IDENTITY VERIFICATION ROUTES
    // =========================================================================

    /**
     * Initialize server identity (load keys from environment)
     */
    initServerIdentity();

    /**
     * GET /api/server/identity
     * Returns server identity information (public, no secrets)
     * Clients use this to check if server supports verification
     */
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
    server.post('/api/admin/apply-update', async (request, reply) => {
        const { path: filePath, content } = request.body || {};

        // Validate input
        if (!filePath || typeof filePath !== 'string') {
            return reply.code(400).send({
                success: false,
                error: 'Path is required'
            });
        }

        if (typeof content !== 'string') {
            return reply.code(400).send({
                success: false,
                error: 'Content is required'
            });
        }

        // Security: Define allowed and protected paths
        const allowedPrefixes = ['src/squirrel', 'src/application/core', 'src/application/security'];
        const allowedFiles = ['src/version.json']; // Fichiers spécifiques autorisés
        const protectedPrefixes = ['src/application/examples', 'src/application/config'];

        // Check if path is protected
        for (const protectedPath of protectedPrefixes) {
            if (filePath.startsWith(protectedPath)) {
                return reply.code(403).send({
                    success: false,
                    error: `Path ${protectedPath} is protected and cannot be updated`
                });
            }
        }

        // Check if path is allowed (prefix ou fichier spécifique)
        const isAllowed = allowedPrefixes.some(prefix => filePath.startsWith(prefix))
            || allowedFiles.includes(filePath);
        if (!isAllowed) {
            return reply.code(403).send({
                success: false,
                error: 'Path is not in allowed update directories'
            });
        }

        // Prevent path traversal attacks
        if (filePath.includes('..') || filePath.includes('//')) {
            return reply.code(403).send({
                success: false,
                error: 'Invalid path'
            });
        }

        try {
            const { promises: fsPromises } = await import('fs');
            const pathModule = await import('path');
            const { fileURLToPath } = await import('url');

            const __dirname = pathModule.dirname(fileURLToPath(import.meta.url));
            const projectRoot = pathModule.join(__dirname, '..');
            const targetPath = pathModule.join(projectRoot, filePath);

            // Create parent directories if needed
            const parentDir = pathModule.dirname(targetPath);
            await fsPromises.mkdir(parentDir, { recursive: true });

            // Write the file
            await fsPromises.writeFile(targetPath, content, 'utf8');

            console.log(`📝 [Admin] Updated file: ${filePath}`);

            return {
                success: true,
                path: filePath,
                message: 'File updated successfully'
            };
        } catch (error) {
            request.log.error({ err: error }, 'Failed to write update file');
            return reply.code(500).send({
                success: false,
                error: 'Failed to write file: ' + error.message
            });
        }
    });

    /**
     * POST /api/admin/batch-update
     * Batch download and update files from GitHub (admin only)
     */
    server.post('/api/admin/batch-update', async (request, reply) => {
        const { files, version } = request.body || {};

        if (!files || !Array.isArray(files)) {
            return reply.code(400).send({
                success: false,
                error: 'Files array is required'
            });
        }

        const allowedPrefixes = ['src/squirrel', 'src/application/core', 'src/application/security'];
        const allowedFiles = ['src/version.json'];
        const protectedPrefixes = ['src/application/examples', 'src/application/config'];

        const { promises: fsPromises } = await import('fs');
        const pathModule = await import('path');
        const { fileURLToPath } = await import('url');

        const __dirname = pathModule.dirname(fileURLToPath(import.meta.url));
        const projectRoot = pathModule.join(__dirname, '..');

        const updatedFiles = [];
        const errors = [];

        for (const file of files) {
            const { path: filePath, url } = file;

            if (!filePath || !url) {
                errors.push({ path: filePath || 'unknown', error: 'Missing path or url' });
                continue;
            }

            // Check protected paths
            const isProtected = protectedPrefixes.some(p => filePath.startsWith(p));
            if (isProtected) {
                errors.push({ path: filePath, error: 'Path is protected' });
                continue;
            }

            // Check allowed paths
            const isAllowed = allowedPrefixes.some(p => filePath.startsWith(p)) || allowedFiles.includes(filePath);
            if (!isAllowed) {
                errors.push({ path: filePath, error: 'Path not in allowed directories' });
                continue;
            }

            // Prevent path traversal
            if (filePath.includes('..') || filePath.includes('//')) {
                errors.push({ path: filePath, error: 'Invalid path' });
                continue;
            }

            try {
                // Download from GitHub
                const response = await fetch(url);
                if (!response.ok) {
                    errors.push({ path: filePath, error: `GitHub returned ${response.status}` });
                    continue;
                }

                const content = await response.text();
                const targetPath = pathModule.join(projectRoot, filePath);

                // Create parent directories
                const parentDir = pathModule.dirname(targetPath);
                await fsPromises.mkdir(parentDir, { recursive: true });

                // Write file
                await fsPromises.writeFile(targetPath, content, 'utf8');
                updatedFiles.push(filePath);

            } catch (error) {
                errors.push({ path: filePath, error: error.message });
            }
        }

        // Update version file if provided
        if (version && version.path && version.content) {
            try {
                const versionPath = pathModule.join(projectRoot, version.path);
                const parentDir = pathModule.dirname(versionPath);
                await fsPromises.mkdir(parentDir, { recursive: true });
                await fsPromises.writeFile(versionPath, version.content, 'utf8');
            } catch (error) {
                errors.push({ path: version.path, error: error.message });
            }
        }

        console.log(`📥 [Admin] Batch update: ${updatedFiles.length} files updated, ${errors.length} errors`);

        return {
            success: errors.length === 0,
            filesUpdated: updatedFiles.length,
            updated: updatedFiles,
            errors: errors.length > 0 ? errors : null
        };
    });

    /**
     * POST /api/admin/sync-from-zip
     * Downloads ZIP from GitHub, extracts src/, syncs files
     */
    server.post('/api/admin/sync-from-zip', async (request, reply) => {
        const { zipUrl, extractPath = 'src', protectedPaths = [] } = request.body;

        if (!zipUrl) {
            return reply.code(400).send({ success: false, error: 'Missing zipUrl' });
        }

        console.log('📦 Sync from ZIP:', zipUrl);
        console.log('📂 Extract path:', extractPath);
        console.log('🛡️ Protected paths:', protectedPaths);
        console.log('📂 Project root:', PROJECT_ROOT);

        try {
            // Download ZIP
            const response = await fetch(zipUrl);
            if (!response.ok) {
                throw new Error(`GitHub returned status ${response.status}`);
            }

            const zipBuffer = Buffer.from(await response.arrayBuffer());
            console.log('📥 Downloaded ZIP:', zipBuffer.length, 'bytes');

            // Use AdmZip to extract
            const AdmZip = (await import('adm-zip')).default;
            const zip = new AdmZip(zipBuffer);
            const entries = zip.getEntries();

            console.log('📦 ZIP contains', entries.length, 'entries');

            // Find root prefix (e.g., "a-main/")
            let rootPrefix = '';
            if (entries.length > 0) {
                const firstName = entries[0].entryName;
                const idx = firstName.indexOf('/');
                if (idx > 0) {
                    rootPrefix = firstName.substring(0, idx + 1);
                }
            }
            console.log('📁 ZIP root prefix:', rootPrefix);

            const updatedFiles = [];
            const errors = [];

            for (const entry of entries) {
                // Skip directories
                if (entry.isDirectory) continue;

                const name = entry.entryName;

                // Strip root prefix
                const relativePath = name.startsWith(rootPrefix)
                    ? name.substring(rootPrefix.length)
                    : name;

                // Only process files EXACTLY in extractPath (src/)
                // Must start with "src/" but NOT "src-tauri/" or "src-Auv3/"
                const extractPrefix = extractPath.replace(/\/$/, '') + '/';
                if (!relativePath.startsWith(extractPrefix)) {
                    continue;
                }

                // Check if protected
                const isProtected = protectedPaths.some(p => relativePath.startsWith(p));
                if (isProtected) {
                    console.log('🛡️ Skipping protected:', relativePath);
                    continue;
                }

                // Write file to PROJECT_ROOT (not process.cwd which might be server/)
                const targetPath = path.join(PROJECT_ROOT, relativePath);
                const targetDir = path.dirname(targetPath);

                console.log('📝 Writing:', relativePath, '→', targetPath);

                try {
                    await fs.mkdir(targetDir, { recursive: true });
                    await fs.writeFile(targetPath, entry.getData());
                    updatedFiles.push(relativePath);
                } catch (e) {
                    console.log('❌ Error writing:', relativePath, e.message);
                    errors.push({ path: relativePath, error: e.message });
                }
            }

            console.log('✅ Updated', updatedFiles.length, 'files');
            if (errors.length > 0) {
                console.log('⚠️', errors.length, 'errors');
            }

            return {
                success: errors.length === 0,
                filesUpdated: updatedFiles.length,
                updated: updatedFiles,
                errors: errors.length > 0 ? errors : null
            };

        } catch (error) {
            console.error('❌ Sync from ZIP failed:', error.message);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // REFRESH TOKEN - POST /api/auth/refresh
    // =========================================================================
    server.post('/api/auth/refresh', async (request, reply) => {
        try {
            // Try to get token from cookie first, then from Authorization header
            let token = request.cookies.access_token;

            if (!token) {
                const authHeader = request.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    token = authHeader.substring(7);
                }
            }

            if (!token) {
                return reply.code(401).send({ success: false, error: 'No token provided' });
            }

            // Verify the current token (allow expired tokens for refresh, but ALWAYS verify signature)
            let decoded;
            try {
                decoded = server.jwt.verify(token, { ignoreExpiration: true });
            } catch (_) {
                return reply.code(401).send({ success: false, error: 'Invalid token' });
            }

            // ADOLE v3.0: Verify user atome still exists
            const user = await findUserById(dataSource, decoded.id || decoded.sub);

            if (!user) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            // Generate new token with fresh expiry
            const newToken = server.jwt.sign({
                sub: user.user_id,
                id: user.user_id,
                username: user.username,
                phone: user.phone
            });

            // Set new cookie
            reply.setCookie('access_token', newToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: COOKIE_MAX_AGE
            });

            console.log(`🔄 Token refreshed for user ${user.user_id}`);

            return {
                success: true,
                token: newToken,
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

// Export user management functions for WebSocket handlers
export {
    createUserAtome,
    findUserByPhone,
    findUserById,
    listAllUsers,
    updateUserParticle,
    deleteUserAtome,
    generateDeterministicUserId
};

export default { registerAuthRoutes, hashPassword, verifyPassword, generateOTP, sendSMS };
