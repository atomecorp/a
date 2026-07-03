/**
 * registerAccountRoutes — extracted from auth.js registerAuthRoutes.
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

export function registerAccountRoutes(server, { dataSource, isProduction }) {
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

        const cleanPhone = normalizePhone(phone);
        const rate = enforceAuthRateLimit(request, 'otp_request', cleanPhone, 3);
        if (!rate.ok) {
            reply.header('retry-after', String(rate.retryAfterSeconds));
            return reply.code(429).send({ success: false, error: 'Too many OTP requests' });
        }

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

            console.log('OTP sent');

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

        const cleanPhone = normalizePhone(phone);
        const rate = enforceAuthRateLimit(request, 'password_reset', cleanPhone, 5);
        if (!rate.ok) {
            reply.header('retry-after', String(rate.retryAfterSeconds));
            return reply.code(429).send({ success: false, error: 'Too many password reset attempts' });
        }

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

            console.log('Password reset completed');

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

            const cleanPhone = normalizePhone(newPhone);

            if (!cleanPhone || cleanPhone.length < 6) {
                return reply.code(400).send({ success: false, error: 'Valid phone number is required' });
            }
            const rate = enforceAuthRateLimit(request, 'phone_change_request', cleanPhone, 3);
            if (!rate.ok) {
                reply.header('retry-after', String(rate.retryAfterSeconds));
                return reply.code(429).send({ success: false, error: 'Too many phone change requests' });
            }

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

            console.log('Phone change OTP sent');

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

            const cleanPhone = normalizePhone(newPhone);
            const rate = enforceAuthRateLimit(request, 'phone_change_verify', cleanPhone, 5);
            if (!rate.ok) {
                reply.header('retry-after', String(rate.retryAfterSeconds));
                return reply.code(429).send({ success: false, error: 'Too many phone verification attempts' });
            }

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

            console.log(`Phone changed for user ${String(resolvedUserId)}`);

            // Parse optional if it's a string
            let optional = current.optional;
            if (typeof optional === 'string') {
                try { optional = JSON.parse(optional); } catch (error) {
        console.warn("[cleanup] operation failed", error); optional = {}; }
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
            } catch (error) {
        console.warn("[cleanup] operation failed", error);
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
                        type: 'sync:account-deleted',
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
}
