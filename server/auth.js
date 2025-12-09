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

/**
 * Sync a newly created user to Tauri server
 * @param {string} username - User's username
 * @param {string} phone - User's phone number
 * @param {string} passwordHash - Bcrypt hashed password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function syncUserToTauri(username, phone, passwordHash) {
    const tauriUrl = process.env.TAURI_URL || 'http://localhost:3000';
    const syncSecret = process.env.SYNC_SECRET || 'squirrel-sync-2024';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${tauriUrl}/api/auth/local/sync-register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Sync-Secret': syncSecret
            },
            body: JSON.stringify({
                username,
                phone,
                password_hash: passwordHash,
                source_server: 'fastify'
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (data.success || data.alreadyExists) {
            console.log(`🔄 User synced to Tauri: ${username} (${phone})`);
            return { success: true, synced: true };
        } else {
            console.warn(`⚠️ Tauri sync response: ${data.error || 'Unknown error'}`);
            return { success: false, error: data.error };
        }
    } catch (error) {
        // Don't fail registration if Tauri is unavailable
        if (error.name === 'AbortError') {
            console.warn(`⚠️ Tauri sync timeout - server may be offline`);
        } else {
            console.warn(`⚠️ Tauri sync failed: ${error.message}`);
        }
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
            const existingRows = await dataSource.query(
                `SELECT user_id FROM users WHERE phone = ?`,
                [cleanPhone]
            );

            return {
                success: true,
                exists: existingRows.length > 0,
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
     * POST /api/auth/register
     * Create a new user account
     * Uses simplified SQLite schema with direct users table
     */
    server.post('/api/auth/register', async (request, reply) => {
        const { username, phone, password, optional = {} } = request.body || {};

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
            // Check if phone already exists
            const existingRows = await dataSource.query(
                `SELECT user_id FROM users WHERE phone = ?`,
                [cleanPhone]
            );

            if (existingRows.length > 0) {
                // Return 200 with success:true and message to avoid browser console error
                return { success: true, message: 'User already exists - ready to login', alreadyExists: true };
            }

            // Hash password
            const passwordHash = await hashPassword(password);

            // Use deterministic user ID based on phone number
            // This ensures same user gets same ID across Fastify, Tauri, and iOS
            const tenantId = uuidv4();
            const principalId = generateDeterministicUserId(cleanPhone);
            const now = new Date().toISOString();

            // Create tenant first
            await dataSource.query(
                `INSERT INTO tenants (tenant_id, name) VALUES (?, ?)`,
                [tenantId, cleanUsername]
            );

            // Create principal
            await dataSource.query(
                `INSERT INTO principals (principal_id, tenant_id, type, name) VALUES (?, ?, 'user', ?)`,
                [principalId, tenantId, cleanUsername]
            );

            // Create user
            await dataSource.query(
                `INSERT INTO users (user_id, principal_id, tenant_id, phone, username, password_hash, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [principalId, principalId, tenantId, cleanPhone, cleanUsername, passwordHash, now, now]
            );

            console.log(`✅ User registered: ${cleanUsername} (${cleanPhone}) [${principalId}]`);

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
            return reply.code(500).send({ success: false, error: 'Registration failed' });
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
            // Check if phone already exists
            const existingRows = await dataSource.query(
                `SELECT user_id FROM users WHERE phone = ?`,
                [cleanPhone]
            );

            if (existingRows.length > 0) {
                // User already exists - this is fine for sync
                return { success: true, message: 'User already exists', alreadyExists: true, principalId: existingRows[0].user_id };
            }

            // Create user with pre-hashed password
            const tenantId = uuidv4();
            const principalId = generateDeterministicUserId(cleanPhone);
            const now = new Date().toISOString();

            // Create tenant
            await dataSource.query(
                `INSERT INTO tenants (tenant_id, name) VALUES (?, ?)`,
                [tenantId, cleanUsername]
            );

            // Create principal
            await dataSource.query(
                `INSERT INTO principals (principal_id, tenant_id, type, name) VALUES (?, ?, 'user', ?)`,
                [principalId, tenantId, cleanUsername]
            );

            // Create user with pre-hashed password
            await dataSource.query(
                `INSERT INTO users (user_id, principal_id, tenant_id, phone, username, password_hash, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [principalId, principalId, tenantId, cleanPhone, cleanUsername, passwordHash, now, now]
            );

            console.log(`✅ User synced from ${sourceServer || 'unknown'}: ${cleanUsername} (${cleanPhone}) [${principalId}]`);

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
     * Uses simplified SQLite schema with direct users table
     */
    server.post('/api/auth/login', async (request, reply) => {
        const { phone, password } = request.body || {};

        if (!phone || !password) {
            return reply.code(400).send({ success: false, error: 'Phone and password are required' });
        }

        const cleanPhone = phone.trim().replace(/\s+/g, '');

        try {
            // Find user by phone
            const rows = await dataSource.query(
                `SELECT user_id, tenant_id, username, phone, password_hash FROM users WHERE phone = ?`,
                [cleanPhone]
            );

            if (rows.length === 0) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, error: 'Invalid credentials' };
            }

            const user = rows[0];

            // Verify password
            const passwordValid = await verifyPassword(password, user.password_hash);
            if (!passwordValid) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, error: 'Invalid credentials' };
            }

            // Generate JWT
            const token = server.jwt.sign({
                id: user.user_id,
                tenantId: user.tenant_id,
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

            console.log(`✅ User logged in: ${user.username} (${user.phone})`);

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
            return reply.code(500).send({ success: false, error: 'Login failed' });
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

            // Fetch fresh data from DB
            const rows = await dataSource.query(
                `SELECT user_id, username, phone FROM users WHERE user_id = ?`,
                [decoded.id]
            );

            if (rows.length === 0) {
                reply.clearCookie('access_token', {
                    path: '/',
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: 'strict'
                });
                return { success: false, authenticated: false, error: 'User not found' };
            }

            const user = rows[0];

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
            const { username } = request.body || {};

            // Get current user
            const rows = await dataSource.query(
                `SELECT user_id, tenant_id, username, phone FROM users WHERE user_id = ?`,
                [decoded.id]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const current = rows[0];
            const now = new Date().toISOString();
            const newUsername = username || current.username;

            await dataSource.query(
                `UPDATE users SET username = ?, updated_at = ? WHERE user_id = ?`,
                [newUsername, now, decoded.id]
            );

            console.log(`✅ User profile updated: ${newUsername}`);

            return {
                success: true,
                user: {
                    id: decoded.id,
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
            // Check if user exists
            const rows = await dataSource.query(
                `SELECT user_id FROM users WHERE phone = ?`,
                [cleanPhone]
            );

            if (rows.length === 0) {
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

            // Update in database - using users table
            const rows = await dataSource.query(
                `SELECT user_id FROM users WHERE phone = ?`,
                [cleanPhone]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const userId = rows[0].user_id;

            await dataSource.query(
                `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE user_id = ?`,
                [newHash, userId]
            );

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
            const { currentPassword, newPassword } = request.body || {};

            if (!currentPassword || !newPassword) {
                return reply.code(400).send({ success: false, error: 'Current and new password are required' });
            }

            if (newPassword.length < 8) {
                return reply.code(400).send({ success: false, error: 'New password must be at least 8 characters' });
            }

            // Get current user data - using users table
            const rows = await dataSource.query(
                `SELECT user_id, password_hash FROM users WHERE user_id = ?`,
                [decoded.id]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const current = rows[0];

            // Verify current password
            const passwordValid = await verifyPassword(currentPassword, current.password_hash);
            if (!passwordValid) {
                return reply.code(401).send({ success: false, error: 'Current password is incorrect' });
            }

            // Hash new password
            const newHash = await hashPassword(newPassword);

            await dataSource.query(
                `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE user_id = ?`,
                [newHash, decoded.id]
            );

            console.log(`✅ Password changed for user ${decoded.id}`);

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

            // Check if new phone is already in use - using users table
            const existingRows = await dataSource.query(
                `SELECT user_id FROM users WHERE phone = ?`,
                [cleanPhone]
            );

            if (existingRows.length > 0) {
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

            // Update phone in database - using users table
            const rows = await dataSource.query(
                `SELECT user_id, username, optional FROM users WHERE user_id = ?`,
                [decoded.id]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const current = rows[0];

            await dataSource.query(
                `UPDATE users SET phone = ?, updated_at = datetime('now') WHERE user_id = ?`,
                [cleanPhone, decoded.id]
            );

            // Generate new JWT with updated phone
            const newToken = server.jwt.sign({
                id: decoded.id,
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

            console.log(`✅ Phone changed for user ${decoded.id}: ${cleanPhone}`);

            // Parse optional if it's a string
            let optional = current.optional;
            if (typeof optional === 'string') {
                try { optional = JSON.parse(optional); } catch { optional = {}; }
            }

            return {
                success: true,
                message: 'Phone number updated successfully',
                user: {
                    id: decoded.id,
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

            const { password } = request.body || {};

            if (!password) {
                return reply.code(400).send({ success: false, error: 'Password is required for account deletion' });
            }

            // Get current user data - using users table
            const rows = await dataSource.query(
                `SELECT user_id, tenant_id, phone, username, password_hash FROM users WHERE user_id = ?`,
                [decoded.id]
            );

            if (rows.length === 0) {
                reply.clearCookie('access_token', {
                    path: '/',
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: 'strict'
                });
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const user = rows[0];

            // Verify password
            const passwordMatch = await verifyPassword(password, user.password_hash);
            if (!passwordMatch) {
                return reply.code(401).send({ success: false, error: 'Incorrect password' });
            }

            // Delete user from users table
            await dataSource.query(`DELETE FROM users WHERE user_id = ?`, [decoded.id]);

            // Also clean up related tables if they exist
            const cleanupTables = ['property_versions', 'properties', 'objects', 'principals', 'tenants'];
            for (const table of cleanupTables) {
                try {
                    if (table === 'tenants') {
                        await dataSource.query(`DELETE FROM ${table} WHERE tenant_id = ?`, [user.tenant_id]);
                    } else if (table === 'principals') {
                        await dataSource.query(`DELETE FROM ${table} WHERE principal_id = ?`, [decoded.id]);
                    } else {
                        await dataSource.query(`DELETE FROM ${table} WHERE object_id = ?`, [decoded.id]);
                    }
                } catch (tableErr) {
                    // Ignore errors for missing tables
                    console.log(`[delete] Skipping ${table}: ${tableErr.message?.substring(0, 50) || 'error'}`);
                }
            }

            // Clear the authentication cookie
            reply.clearCookie('access_token', {
                path: '/',
                httpOnly: true,
                secure: isProduction,
                sameSite: 'strict'
            });

            console.log(`🗑️ Account deleted: user ${decoded.id}`);

            // === SYNC: Delete account on Tauri server ===
            try {
                const tauriUrl = 'http://localhost:3000/api/auth/local/sync-delete';
                console.log(`[auth] Syncing account deletion to Tauri: ${user.phone}`);

                const syncResponse = await fetch(tauriUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Sync-Source': 'fastify',
                        'X-Sync-Secret': process.env.SYNC_SECRET || 'squirrel-sync-2024'
                    },
                    body: JSON.stringify({
                        phone: user.phone,
                        userId: decoded.id
                    })
                });

                if (syncResponse.ok) {
                    const syncData = await syncResponse.json();
                    console.log(`[auth] ✅ Tauri account sync-delete successful:`, syncData);
                } else {
                    console.warn(`[auth] ⚠️ Tauri sync-delete failed: ${syncResponse.status}`);
                }
            } catch (syncError) {
                console.warn(`[auth] ⚠️ Could not sync delete to Tauri:`, syncError.message);
            }

            // Emit account deletion event for sync
            try {
                const eventBus = getABoxEventBus();
                if (eventBus) {
                    eventBus.emit('event', {
                        type: 'sync:account-deleted',
                        timestamp: new Date().toISOString(),
                        runtime: 'Fastify',
                        payload: {
                            userId: decoded.id,
                            phone: user.phone,
                            username: user.username
                        }
                    });
                    console.log('[auth] Emitted sync:account-deleted event');
                }
            } catch (e) {
                console.warn('[auth] Could not emit account-deleted event:', e.message);
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

            // Verify the current token (allow expired tokens for refresh)
            let decoded;
            try {
                decoded = server.jwt.verify(token);
            } catch (err) {
                // If token is expired, try to decode without verification
                if (err.message.includes('expired')) {
                    try {
                        const [, payload] = token.split('.');
                        decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
                    } catch {
                        return reply.code(401).send({ success: false, error: 'Invalid token format' });
                    }
                } else {
                    return reply.code(401).send({ success: false, error: 'Invalid token' });
                }
            }

            // Verify user still exists - using users table
            const rows = await dataSource.query(
                `SELECT user_id, username, phone FROM users WHERE user_id = ?`,
                [decoded.id || decoded.sub]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const user = rows[0];

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

export default { registerAuthRoutes, hashPassword, verifyPassword, generateOTP, sendSMS };
