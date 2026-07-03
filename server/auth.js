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
import { appendEvent } from '../database/adole.js';
import { normalizePhone, requireConfiguredAuthSecret, generateDeterministicUserId, hashPassword, verifyPassword, hashRefreshSecret, createRefreshSecret } from './auth_crypto.js';
import { createUserAtome, findUserByPhone, ensureAnonymousUser, findUserById, listAllUsers, updateUserParticle, deleteUserAtome, syncUserToTauri, ANONYMOUS_PHONE, ANONYMOUS_USERNAME, ANONYMOUS_PASSWORD, ANONYMOUS_VISIBILITY, ANONYMOUS_OPTIONAL } from './auth_users.js';
import { getUserOptionalParticles, ensureUserAtomeType, repairMistypedUserAtomes, upsertUserStateCurrent, normalizeUserOptional, normalizeAccessValue } from './auth_user_particles.js';
import { generateOTP, storeOTP, verifyOTP, readClientRateKey, enforceAuthIdentityRateLimit, enforceAuthRateLimit, sendSMS } from './auth_otp.js';
import { readRefreshTokenFromRequest, readRefreshSessions, writeRefreshSessions, createRefreshSession, consumeRefreshSession, revokeRefreshToken, setAuthCookies } from './auth_sessions.js';
export { generateOTP, storeOTP, verifyOTP, sendSMS, enforceAuthIdentityRateLimit } from './auth_otp.js';
import { registerCoreAuthRoutes } from './auth_routes_core.js';
import { registerRegisterRoutes } from './auth_routes_register.js';
import { registerAccountRoutes } from './auth_routes_account.js';
import { registerServerIdentityRoutes } from './auth_routes_server.js';
import { registerAdminRoutes } from './auth_routes_admin.js';
import { registerSessionRoutes } from './auth_routes_session.js';

// Get project root (parent of server/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// =============================================================================
// CONSTANTS
// =============================================================================

const JWT_EXPIRY = '7d'; // 7 days

// Namespace UUID for deterministic user ID generation
// This MUST be the same in Fastify and Axum to generate identical user IDs

/**
 * Generate a deterministic user ID from phone number
 * Uses UUID v5 (SHA-1 based) with a fixed namespace
 * This ensures the same phone number always produces the same user ID
 * across all platforms (Fastify, Axum/Tauri, iOS)
 * 
 * @param {string} phone - The normalized phone number
 * @returns {string} - Deterministic UUID
 */

// In-memory OTP storage (use Redis in production for multi-instance deployments)

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Stored hash
 * @returns {Promise<boolean>}
 */

/**
 * Generate a 6-digit OTP code
 * @returns {string}
 */

/**
 * Store an OTP for a phone number
 * @param {string} phone
 * @param {string} code
 */

/**
 * Verify and consume an OTP
 * @param {string} phone
 * @param {string} code
 * @returns {{ valid: boolean, error?: string }}
 */

/**
 * Simulate sending an SMS (replace with real provider in production)
 * @param {string} phone
 * @param {string} message
 * @returns {Promise<boolean>}
 */

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

/**
 * Find a user by phone number (query atomes+particles)
 * @param {Object} dataSource - Database connection
 * @param {string} phone - Phone number to search
 * @returns {Promise<Object|null>} User data or null
 */

/**
 * Find a user by user_id (query atomes+particles)
 * @param {Object} dataSource - Database connection
 * @param {string} userId - User ID to search
 * @returns {Promise<Object|null>} User data or null
 */

/**
 * List all PUBLIC users (query atomes with type='user' and visibility='public')
 * Private users are hidden and must be contacted by phone number directly.
 * @param {Object} dataSource - Database connection
 * @param {boolean} [includePrivate=false] - If true, include private users (admin only)
 * @returns {Promise<Array>} Array of user objects
 */

/**
 * Update a user's particle (property)
 * @param {Object} dataSource - Database connection
 * @param {string} userId - User's atome_id
 * @param {string} key - Particle key
 * @param {any} value - New value
 */

/**
 * Delete a user (soft delete the atome)
 * @param {Object} dataSource - Database connection
 * @param {string} userId - User's atome_id
 */

/**
 * Sync a newly created user to Tauri server via WebSocket
 * Uses EventBus instead of POST for reliable async sync
 * @param {string} username - User's username
 * @param {string} phone - User's phone number
 * @param {string} passwordHash - Bcrypt hashed password
 * @param {string} userId - User's atome_id
 * @returns {Promise<{success: boolean, error?: string}>}
 */

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
        jwtSecret = process.env.JWT_SECRET,
        cookieSecret = process.env.COOKIE_SECRET,
        isProduction = process.env.NODE_ENV === 'production'
    } = options;
    const configuredJwtSecret = requireConfiguredAuthSecret('JWT_SECRET', jwtSecret);
    const configuredCookieSecret = requireConfiguredAuthSecret('COOKIE_SECRET', cookieSecret);

    // Import and register plugins
    const fastifyJwt = (await import('@fastify/jwt')).default;
    const fastifyCookie = (await import('@fastify/cookie')).default;

    await server.register(fastifyJwt, {
        secret: configuredJwtSecret,
        sign: { expiresIn: JWT_EXPIRY }
    });

    await server.register(fastifyCookie, {
        secret: configuredCookieSecret,
        hook: 'onRequest'
    });

    // Ensure anonymous user exists at startup (local-only)
    try {
        await ensureAnonymousUser(dataSource);
    } catch (error) {
        console.warn('[Auth] Anonymous user init failed:', error?.message || error);
    }

    // =========================================================================
    // AUTH ROUTES
    // =========================================================================

    /**
     * POST /api/auth/check-phone
     * Check if a phone number is already registered (for sync conflict detection)
     */
    registerCoreAuthRoutes(server, { dataSource, isProduction });
    registerRegisterRoutes(server, { dataSource, isProduction });
    registerAccountRoutes(server, { dataSource, isProduction });
    registerServerIdentityRoutes(server, { dataSource, isProduction });
    registerAdminRoutes(server, { dataSource, isProduction });
    registerSessionRoutes(server, { dataSource, isProduction });
}

// Export user management functions for WebSocket handlers
export {
    createUserAtome,
    findUserByPhone,
    findUserById,
    listAllUsers,
    updateUserParticle,
    deleteUserAtome,
    generateDeterministicUserId,
    normalizePhone,
    hashPassword,
    verifyPassword
};

export default { registerAuthRoutes, hashPassword, verifyPassword, generateOTP, sendSMS };
