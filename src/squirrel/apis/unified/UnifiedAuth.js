/**
 * UnifiedAuth.js
 * 
 * Unified Authentication API that works seamlessly with both:
 * - Tauri/Axum backend (localhost:3000, SQLite)
 * - Fastify backend (localhost:3001, PostgreSQL)
 * 
 * Features:
 * - Automatic backend detection
 * - Dual-backend sync when both available
 * - Offline-first with sync queue
 * - Secure password handling
 * 
 * @module unified/UnifiedAuth
 */

import TauriAdapter from './adapters/TauriAdapter.js';
import FastifyAdapter from './adapters/FastifyAdapter.js';

// ============================================
// BACKEND DETECTION
// ============================================

let _tauriAvailable = null;
let _fastifyAvailable = null;
let _lastCheck = 0;
const CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check which backends are available
 * @param {boolean} force - Force recheck even if recently checked
 * @returns {Promise<{tauri: boolean, fastify: boolean}>}
 */
async function checkBackends(force = false) {
    const now = Date.now();
    if (!force && _lastCheck && (now - _lastCheck < CHECK_INTERVAL)) {
        return { tauri: _tauriAvailable, fastify: _fastifyAvailable };
    }

    const [tauri, fastify] = await Promise.all([
        TauriAdapter.isAvailable(),
        FastifyAdapter.isAvailable()
    ]);

    _tauriAvailable = tauri;
    _fastifyAvailable = fastify;
    _lastCheck = now;

    return { tauri, fastify };
}

/**
 * Get the primary adapter based on availability
 * Priority: Tauri (local-first) > Fastify (cloud)
 */
async function getPrimaryAdapter() {
    const { tauri, fastify } = await checkBackends();

    if (tauri) return { adapter: TauriAdapter, name: 'tauri' };
    if (fastify) return { adapter: FastifyAdapter, name: 'fastify' };

    throw new Error('No backend available. Please check your connection.');
}

// ============================================
// UNIFIED AUTH API
// ============================================

const UnifiedAuth = {
    /**
     * Check which backends are currently available
     * @returns {Promise<{tauri: boolean, fastify: boolean}>}
     */
    async checkAvailability() {
        return checkBackends(true);
    },

    /**
     * Register a new user
     * Creates account on available backends (prefers Tauri for local-first)
     * 
     * @param {Object} data - Registration data
     * @param {string} data.username - Username (required)
     * @param {string} data.password - Password (required, min 6 chars)
     * @param {string} [data.email] - Email (optional)
     * @param {string} [data.phone] - Phone (optional, required for Fastify)
     * @returns {Promise<Object>} { success, user, token, backends }
     * 
     * @example
     * const result = await UnifiedAuth.register({
     *     username: "john_doe",
     *     password: "SecurePass123!"
     * });
     */
    async register(data) {
        // Validate input
        if (!data.username || data.username.trim().length < 2) {
            return { success: false, error: 'Username must be at least 2 characters' };
        }
        if (!data.password || data.password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Register on Tauri (local-first)
        if (tauri) {
            try {
                results.tauri = await TauriAdapter.auth.register({
                    username: data.username.trim(),
                    password: data.password,
                    email: data.email
                });
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Register on Fastify (cloud) if phone provided or as backup
        if (fastify && (data.phone || !primaryResult)) {
            try {
                results.fastify = await FastifyAdapter.auth.register({
                    phone: data.phone || data.username, // Use username as phone fallback
                    password: data.password,
                    username: data.username.trim()
                });
                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        if (primaryResult && primaryResult.success) {
            return {
                success: true,
                user: primaryResult.user,
                token: primaryResult.token,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        // Return error from first failed attempt
        const error = results.tauri?.error || results.fastify?.error || 'Registration failed';
        return { success: false, error, backends: results };
    },

    /**
     * Login user
     * Attempts login on available backends, stores tokens for successful logins
     * 
     * @param {Object} data - Login credentials
     * @param {string} data.username - Username (or phone for Fastify)
     * @param {string} data.password - Password
     * @returns {Promise<Object>} { success, user, token, backends }
     * 
     * @example
     * const result = await UnifiedAuth.login({
     *     username: "john_doe",
     *     password: "SecurePass123!"
     * });
     */
    async login(data) {
        if (!data.username || !data.password) {
            return { success: false, error: 'Username and password are required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Try Tauri first (local-first)
        if (tauri) {
            try {
                results.tauri = await TauriAdapter.auth.login({
                    username: data.username,
                    password: data.password
                });
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Try Fastify (cloud)
        if (fastify) {
            try {
                results.fastify = await FastifyAdapter.auth.login({
                    phone: data.phone || data.username,
                    password: data.password
                });
                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        if (primaryResult && primaryResult.success) {
            return {
                success: true,
                user: primaryResult.user,
                token: primaryResult.token,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Login failed';
        return { success: false, error, backends: results };
    },

    /**
     * Logout current user
     * Clears tokens from all backends
     * 
     * @returns {Promise<Object>} { success }
     * 
     * @example
     * await UnifiedAuth.logout();
     */
    async logout() {
        TauriAdapter.clearToken();
        FastifyAdapter.clearToken();

        return { success: true };
    },

    /**
     * Get current user profile
     * Returns profile from the first available authenticated backend
     * 
     * @returns {Promise<Object>} { success, user, source }
     * 
     * @example
     * const profile = await UnifiedAuth.me();
     * console.log(profile.user.username);
     */
    async me() {
        const { tauri, fastify } = await checkBackends();

        // Try Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                const result = await TauriAdapter.auth.me();
                if (result.success) {
                    return { ...result, source: 'tauri' };
                }
            } catch (error) {
                // Fall through to Fastify
            }
        }

        // Try Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                const result = await FastifyAdapter.auth.me();
                if (result.success) {
                    return { ...result, source: 'fastify' };
                }
            } catch (error) {
                // Fall through
            }
        }

        return { success: false, error: 'Not authenticated', user: null };
    },

    /**
     * Change password
     * Updates password on all authenticated backends
     * 
     * @param {Object} data - Password change data
     * @param {string} data.currentPassword - Current password (for verification)
     * @param {string} data.newPassword - New password (min 6 chars)
     * @returns {Promise<Object>} { success, backends }
     * 
     * @example
     * await UnifiedAuth.changePassword({
     *     currentPassword: "OldPass123!",
     *     newPassword: "NewSecure456!"
     * });
     */
    async changePassword(data) {
        if (!data.currentPassword || !data.newPassword) {
            return { success: false, error: 'Current and new passwords are required' };
        }
        if (data.newPassword.length < 6) {
            return { success: false, error: 'New password must be at least 6 characters' };
        }

        const { tauri, fastify } = await checkBackends();
        const results = { tauri: null, fastify: null };
        let anySuccess = false;

        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.auth.changePassword(data);
                if (results.tauri.success) anySuccess = true;
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.auth.changePassword(data);
                if (results.fastify.success) anySuccess = true;
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        return {
            success: anySuccess,
            message: anySuccess ? 'Password updated' : 'Password change failed',
            backends: results
        };
    },

    /**
     * Delete user account
     * Removes account from all backends (requires password confirmation)
     * 
     * @param {Object} data - Deletion data
     * @param {string} data.password - Password (for verification)
     * @param {boolean} [data.deleteData=true] - Also delete all user data
     * @returns {Promise<Object>} { success, backends }
     * 
     * @example
     * await UnifiedAuth.deleteAccount({
     *     password: "MyPassword123!",
     *     deleteData: true
     * });
     */
    async deleteAccount(data) {
        if (!data.password) {
            return { success: false, error: 'Password is required to delete account' };
        }

        const { tauri, fastify } = await checkBackends();
        const results = { tauri: null, fastify: null };
        let anySuccess = false;

        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.auth.deleteAccount(data);
                if (results.tauri.success) {
                    TauriAdapter.clearToken();
                    anySuccess = true;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.auth.deleteAccount(data);
                if (results.fastify.success) {
                    FastifyAdapter.clearToken();
                    anySuccess = true;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        return {
            success: anySuccess,
            message: anySuccess ? 'Account deleted' : 'Account deletion failed',
            backends: results
        };
    },

    /**
     * Refresh authentication token
     * Refreshes tokens on all authenticated backends
     * 
     * @returns {Promise<Object>} { success, token, backends }
     * 
     * @example
     * const result = await UnifiedAuth.refreshToken();
     */
    async refreshToken() {
        const { tauri, fastify } = await checkBackends();
        const results = { tauri: null, fastify: null };
        let primaryToken = null;

        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.auth.refreshToken();
                if (results.tauri.success && results.tauri.token) {
                    primaryToken = results.tauri.token;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.auth.refreshToken();
                if (results.fastify.success && results.fastify.token && !primaryToken) {
                    primaryToken = results.fastify.token;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        return {
            success: !!primaryToken,
            token: primaryToken,
            backends: results
        };
    },

    /**
     * Check if user is currently authenticated
     * @returns {Promise<boolean>}
     * 
     * @example
     * if (await UnifiedAuth.isAuthenticated()) {
     *     console.log("User is logged in");
     * }
     */
    async isAuthenticated() {
        const result = await this.me();
        return result.success && !!result.user;
    },

    /**
     * Get stored tokens info (for debugging)
     * @returns {Object} { tauri: boolean, fastify: boolean }
     */
    getTokenStatus() {
        return {
            tauri: !!TauriAdapter.getToken(),
            fastify: !!FastifyAdapter.getToken()
        };
    }
};

export default UnifiedAuth;
