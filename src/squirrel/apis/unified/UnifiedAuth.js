/**
 * UnifiedAuth.js
 * 
 * Unified Authentication API that works seamlessly with both:
 * - Tauri/Axum backend (localhost:3000, SQLite)
 * - Fastify backend (config-driven)
 * 
 * Features:
 * - Delegates core auth flows to AdoleAPI.auth
 * - Unified responses for UI consumers
 * - Secure password handling
 * 
 * @module unified/UnifiedAuth
 */

import { checkBackends } from './_shared.js';

const getAdoleAuth = () => {
    if (typeof window !== 'undefined' && window.AdoleAPI?.auth) return window.AdoleAPI.auth;
    if (typeof globalThis !== 'undefined' && globalThis.AdoleAPI?.auth) return globalThis.AdoleAPI.auth;
    return null;
};

const extractBackendFlags = (result) => ({
    tauri: !!result?.tauri?.success,
    fastify: !!result?.fastify?.success
});

const extractAuthUser = (result) => {
    return result?.tauri?.data?.user
        || result?.fastify?.data?.user
        || result?.login?.tauri?.data?.user
        || result?.login?.fastify?.data?.user
        || null;
};

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
     * Immediately syncs to the other backend if available
     * 
    * @param {Object} data - Registration data
    * @param {string} data.username - Username (required)
    * @param {string} data.phone - Phone (required)
    * @param {string} data.password - Password (required, min 8 chars)
    * @param {string} [data.email] - Email (optional)
     * @returns {Promise<Object>} { success, user, token, backends }
     * 
     * @example
    * const result = await UnifiedAuth.register({
    *     username: "john_doe",
    *     phone: "33000000000",
    *     password: "SecurePass123!"
    * });
     */
    async register(data) {
        if (!data.username || data.username.trim().length < 2) {
            return { success: false, error: 'Username must be at least 2 characters' };
        }
        if (!data.phone || String(data.phone).trim().length < 6) {
            return { success: false, error: 'Phone number is required' };
        }
        if (!data.password || data.password.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters' };
        }

        const auth = getAdoleAuth();
        if (!auth?.create) {
            return { success: false, error: 'AdoleAPI.auth.create is not available' };
        }

        const result = await auth.create(String(data.phone).trim(), data.password, data.username.trim());
        const success = !!(result?.tauri?.success || result?.fastify?.success);
        return {
            success,
            user: extractAuthUser(result),
            backends: extractBackendFlags(result),
            error: success ? null : (result?.tauri?.error || result?.fastify?.error || 'Registration failed')
        };
    },

    /**
     * Login user
     * Attempts login on available backends, stores tokens for successful logins
     * 
    * @param {Object} data - Login credentials
    * @param {string} data.phone - Phone (required)
    * @param {string} [data.username] - Username (optional, used for display)
    * @param {string} data.password - Password
     * @returns {Promise<Object>} { success, user, token, backends }
     * 
     * @example
    * const result = await UnifiedAuth.login({
    *     phone: "33000000000",
    *     password: "SecurePass123!"
    * });
     */
    async login(data) {
        if (!data.phone || !data.password) {
            return { success: false, error: 'Phone and password are required' };
        }

        const auth = getAdoleAuth();
        if (!auth?.login) {
            return { success: false, error: 'AdoleAPI.auth.login is not available' };
        }

        const result = await auth.login(String(data.phone).trim(), data.password, data.username || '');
        const success = !!(result?.tauri?.success || result?.fastify?.success);
        return {
            success,
            user: extractAuthUser(result),
            backends: extractBackendFlags(result),
            error: success ? null : (result?.tauri?.error || result?.fastify?.error || 'Login failed')
        };
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
        const auth = getAdoleAuth();
        if (!auth?.logout) {
            return { success: false, error: 'AdoleAPI.auth.logout is not available' };
        }
        const result = await auth.logout();
        const success = !!(result?.tauri?.success || result?.fastify?.success);
        return {
            success,
            backends: extractBackendFlags(result),
            error: success ? null : (result?.tauri?.error || result?.fastify?.error || 'Logout failed')
        };
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
        const auth = getAdoleAuth();
        if (!auth?.current) {
            return { success: false, error: 'AdoleAPI.auth.current is not available', user: null };
        }

        const result = await auth.current();
        return {
            success: !!result?.logged,
            user: result?.user || null,
            source: result?.source || null,
            error: result?.logged ? null : (result?.error || 'Not authenticated')
        };
    },

    /**
     * Change password
     * Updates password on all authenticated backends
     * 
     * @param {Object} data - Password change data
     * @param {string} data.currentPassword - Current password (for verification)
    * @param {string} data.newPassword - New password (min 8 chars)
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
        if (data.newPassword.length < 8) {
            return { success: false, error: 'New password must be at least 8 characters' };
        }
        const auth = getAdoleAuth();
        if (!auth?.changePassword) {
            return { success: false, error: 'AdoleAPI.auth.changePassword is not available' };
        }

        return auth.changePassword(data);
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
        const auth = getAdoleAuth();
        if (!auth?.deleteAccount) {
            return { success: false, error: 'AdoleAPI.auth.deleteAccount is not available' };
        }

        return auth.deleteAccount(data);
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
        const auth = getAdoleAuth();
        if (!auth?.refreshToken) {
            return { success: false, error: 'AdoleAPI.auth.refreshToken is not available', token: null, backends: null };
        }

        return auth.refreshToken();
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
    // Sync queue management lives in AdoleAPI.auth
};

export default UnifiedAuth;
