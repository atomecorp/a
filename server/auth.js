/**
 * Authentication module for Squirrel Framework
 * Handles user registration, login, sessions (JWT + HttpOnly cookies), and OTP for password reset.
 * 
 * Supports both local and remote server configurations via configurable API base URL.
 * Includes server identity verification for secure client authentication.
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { initServerIdentity, signChallenge, getServerIdentity, isConfigured as serverIdentityConfigured } from './serverIdentity.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const SALT_ROUNDS = 10;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const JWT_EXPIRY = '7d'; // 7 days
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

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
                `SELECT principal_id FROM principals p
                 JOIN object_state os ON os.object_id = p.principal_id AND os.tenant_id = p.tenant_id
                 WHERE os.snapshot->>'phone' = $1 LIMIT 1`,
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
                `SELECT principal_id FROM principals p
                 JOIN object_state os ON os.object_id = p.principal_id AND os.tenant_id = p.tenant_id
                 WHERE os.snapshot->>'phone' = $1 LIMIT 1`,
                [cleanPhone]
            );

            if (existingRows.length > 0) {
                return reply.code(409).send({ success: false, error: 'Phone number already registered' });
            }

            // Hash password
            const passwordHash = await hashPassword(password);

            // Create user in ADOLE schema
            const tenantId = uuidv4();
            const principalId = uuidv4();
            const branchId = uuidv4();
            const commitId = uuidv4();
            const logicalClock = Date.now();

            const snapshot = {
                type: 'user_profile',
                username: cleanUsername,
                phone: cleanPhone,
                password_hash: passwordHash,
                optional,
                created_at: new Date().toISOString()
            };

            await dataSource.manager.transaction(async (tx) => {
                await tx.query(
                    `INSERT INTO tenants (tenant_id, name) VALUES ($1, $2)`,
                    [tenantId, cleanUsername]
                );

                await tx.query(
                    `INSERT INTO principals (tenant_id, principal_id, kind, email) VALUES ($1, $2, 'user', $3)`,
                    [tenantId, principalId, optional.email || null]
                );

                await tx.query(
                    `INSERT INTO objects (object_id, tenant_id, type, created_by) VALUES ($1, $2, 'user_profile', $1)`,
                    [principalId, tenantId]
                );

                await tx.query(
                    `INSERT INTO branches (branch_id, tenant_id, object_id, name, is_default) VALUES ($1, $2, $3, 'main', true)`,
                    [branchId, tenantId, principalId]
                );

                await tx.query(
                    `INSERT INTO commits (commit_id, tenant_id, object_id, branch_id, author_id, logical_clock, message) VALUES ($1, $2, $3, $4, $3, $5, 'user created')`,
                    [commitId, tenantId, principalId, branchId, logicalClock]
                );

                await tx.query(
                    `INSERT INTO object_state (tenant_id, object_id, branch_id, version_seq, snapshot) VALUES ($1, $2, $3, $4, $5::jsonb)`,
                    [tenantId, principalId, branchId, logicalClock, JSON.stringify(snapshot)]
                );
            });

            console.log(`✅ User registered: ${cleanUsername} (${cleanPhone}) [${principalId}]`);

            return {
                success: true,
                message: 'Account created successfully',
                principalId
            };

        } catch (error) {
            request.log.error({ err: error }, 'Registration failed');
            return reply.code(500).send({ success: false, error: 'Registration failed' });
        }
    });

    /**
     * POST /api/auth/login
     * Authenticate user and create session
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
                `SELECT p.principal_id, p.tenant_id, os.snapshot
                 FROM principals p
                 JOIN object_state os ON os.object_id = p.principal_id AND os.tenant_id = p.tenant_id
                 WHERE os.snapshot->>'phone' = $1 LIMIT 1`,
                [cleanPhone]
            );

            if (rows.length === 0) {
                return reply.code(401).send({ success: false, error: 'Invalid credentials' });
            }

            const user = rows[0];
            const snapshot = user.snapshot;

            // Verify password
            const passwordValid = await verifyPassword(password, snapshot.password_hash);
            if (!passwordValid) {
                return reply.code(401).send({ success: false, error: 'Invalid credentials' });
            }

            // Generate JWT
            const token = server.jwt.sign({
                id: user.principal_id,
                tenantId: user.tenant_id,
                phone: snapshot.phone,
                username: snapshot.username
            });

            // Set HttpOnly cookie
            reply.setCookie('access_token', token, {
                path: '/',
                httpOnly: true,
                secure: isProduction,
                sameSite: 'strict',
                maxAge: COOKIE_MAX_AGE
            });

            console.log(`✅ User logged in: ${snapshot.username} (${snapshot.phone})`);

            return {
                success: true,
                user: {
                    id: user.principal_id,
                    username: snapshot.username,
                    phone: snapshot.phone,
                    optional: snapshot.optional || {}
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
     * Returns 200 with success:false when not authenticated (avoids browser console errors)
     */
    server.get('/api/auth/me', async (request, reply) => {
        try {
            const token = request.cookies.access_token;
            if (!token) {
                // Return 200 with success:false to avoid browser console error
                return { success: false, authenticated: false };
            }

            const decoded = server.jwt.verify(token);

            // Optionally fetch fresh data from DB
            const rows = await dataSource.query(
                `SELECT os.snapshot FROM object_state os WHERE os.object_id = $1 LIMIT 1`,
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

            const snapshot = rows[0].snapshot;

            return {
                success: true,
                user: {
                    id: decoded.id,
                    username: snapshot.username,
                    phone: snapshot.phone,
                    optional: snapshot.optional || {}
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
            const { username, optional } = request.body || {};

            // Get current snapshot
            const rows = await dataSource.query(
                `SELECT os.tenant_id, os.branch_id, os.version_seq, os.snapshot 
                 FROM object_state os WHERE os.object_id = $1 LIMIT 1`,
                [decoded.id]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const current = rows[0];
            const newSnapshot = {
                ...current.snapshot,
                username: username || current.snapshot.username,
                optional: { ...current.snapshot.optional, ...optional },
                updated_at: new Date().toISOString()
            };

            await dataSource.query(
                `UPDATE object_state 
                 SET snapshot = $1::jsonb, version_seq = $2, updated_at = now() 
                 WHERE object_id = $3`,
                [JSON.stringify(newSnapshot), Date.now(), decoded.id]
            );

            console.log(`✅ User profile updated: ${newSnapshot.username}`);

            return {
                success: true,
                user: {
                    id: decoded.id,
                    username: newSnapshot.username,
                    phone: newSnapshot.phone,
                    optional: newSnapshot.optional
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
                `SELECT p.principal_id FROM principals p
                 JOIN object_state os ON os.object_id = p.principal_id AND os.tenant_id = p.tenant_id
                 WHERE os.snapshot->>'phone' = $1 LIMIT 1`,
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

            // Update in database
            const rows = await dataSource.query(
                `SELECT os.object_id, os.snapshot FROM object_state os
                 JOIN principals p ON p.principal_id = os.object_id AND p.tenant_id = os.tenant_id
                 WHERE os.snapshot->>'phone' = $1 LIMIT 1`,
                [cleanPhone]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const current = rows[0];
            const newSnapshot = {
                ...current.snapshot,
                password_hash: newHash,
                updated_at: new Date().toISOString()
            };

            await dataSource.query(
                `UPDATE object_state SET snapshot = $1::jsonb, version_seq = $2, updated_at = now() WHERE object_id = $3`,
                [JSON.stringify(newSnapshot), Date.now(), current.object_id]
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
            const token = request.cookies.access_token;
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

            // Get current user data
            const rows = await dataSource.query(
                `SELECT os.object_id, os.snapshot FROM object_state os WHERE os.object_id = $1 LIMIT 1`,
                [decoded.id]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const current = rows[0];
            const snapshot = current.snapshot;

            // Verify current password
            const passwordValid = await verifyPassword(currentPassword, snapshot.password_hash);
            if (!passwordValid) {
                return reply.code(401).send({ success: false, error: 'Current password is incorrect' });
            }

            // Hash new password
            const newHash = await hashPassword(newPassword);

            const newSnapshot = {
                ...snapshot,
                password_hash: newHash,
                updated_at: new Date().toISOString()
            };

            await dataSource.query(
                `UPDATE object_state SET snapshot = $1::jsonb, version_seq = $2, updated_at = now() WHERE object_id = $3`,
                [JSON.stringify(newSnapshot), Date.now(), current.object_id]
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

            // Check if new phone is already in use
            const existingRows = await dataSource.query(
                `SELECT principal_id FROM principals p
                 JOIN object_state os ON os.object_id = p.principal_id AND os.tenant_id = p.tenant_id
                 WHERE os.snapshot->>'phone' = $1 LIMIT 1`,
                [cleanPhone]
            );

            if (existingRows.length > 0) {
                return reply.code(409).send({ success: false, error: 'Phone number already in use' });
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

            // Update phone in database
            const rows = await dataSource.query(
                `SELECT os.object_id, os.tenant_id, os.snapshot FROM object_state os WHERE os.object_id = $1 LIMIT 1`,
                [decoded.id]
            );

            if (rows.length === 0) {
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            const current = rows[0];
            const newSnapshot = {
                ...current.snapshot,
                phone: cleanPhone,
                updated_at: new Date().toISOString()
            };

            await dataSource.query(
                `UPDATE object_state SET snapshot = $1::jsonb, version_seq = $2, updated_at = now() WHERE object_id = $3`,
                [JSON.stringify(newSnapshot), Date.now(), current.object_id]
            );

            // Generate new JWT with updated phone
            const newToken = server.jwt.sign({
                id: decoded.id,
                tenantId: decoded.tenantId,
                phone: cleanPhone,
                username: newSnapshot.username
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

            return {
                success: true,
                message: 'Phone number updated successfully',
                user: {
                    id: decoded.id,
                    username: newSnapshot.username,
                    phone: cleanPhone,
                    optional: newSnapshot.optional || {}
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
            const token = request.cookies?.access_token;
            if (!token) {
                return reply.code(401).send({ success: false, error: 'Not authenticated' });
            }

            let decoded;
            try {
                decoded = server.jwt.verify(token);
            } catch {
                reply.clearCookie('access_token', { path: '/' });
                return reply.code(401).send({ success: false, error: 'Invalid session' });
            }

            const { password } = request.body || {};

            if (!password) {
                return reply.code(400).send({ success: false, error: 'Password is required for account deletion' });
            }

            // Get current user data
            const userPrincipal = await principalRepository.findOne({
                where: { id: decoded.id }
            });

            if (!userPrincipal) {
                reply.clearCookie('access_token', { path: '/' });
                return reply.code(404).send({ success: false, error: 'User not found' });
            }

            // Get user snapshot to verify password
            const objectState = await objectStateRepository.findOne({
                where: { principal_id: decoded.id },
                order: { created_at: 'DESC' }
            });

            if (!objectState || !objectState.snapshot) {
                return reply.code(500).send({ success: false, error: 'User data not found' });
            }

            const snapshot = typeof objectState.snapshot === 'string'
                ? JSON.parse(objectState.snapshot)
                : objectState.snapshot;

            // Verify password
            const passwordMatch = await verifyPassword(password, snapshot.password);
            if (!passwordMatch) {
                return reply.code(401).send({ success: false, error: 'Incorrect password' });
            }

            // Delete all user data
            // 1. Delete all object_state entries for this principal
            await objectStateRepository.delete({ principal_id: decoded.id });

            // 2. Delete the principal (user)
            await principalRepository.delete({ id: decoded.id });

            // 3. Optionally: Delete tenant if user was the only principal
            // (keeping tenant for now as it might be shared)

            // Clear the authentication cookie
            reply.clearCookie('access_token', { path: '/' });

            console.log(`🗑️ Account deleted: user ${decoded.id} (${userPrincipal.name})`);

            return {
                success: true,
                message: 'Account deleted successfully'
            };

        } catch (error) {
            request.log.error({ err: error }, 'Account deletion failed');
            return reply.code(500).send({ success: false, error: 'Account deletion failed' });
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

    console.log('🔐 Authentication routes registered');
    if (serverIdentityConfigured()) {
        console.log('🔑 Server identity verification enabled');
    } else {
        console.log('⚠️  Server identity not configured (run npm run generate-keys)');
    }
}

export default { registerAuthRoutes, hashPassword, verifyPassword, generateOTP, sendSMS };
