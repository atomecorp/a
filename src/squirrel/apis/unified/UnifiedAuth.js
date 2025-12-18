/**
 * UnifiedAuth.js
 * 
 * Unified Authentication API that works seamlessly with both:
 * - Tauri/Axum backend (localhost:3000, SQLite)
 * - Fastify backend (config-driven)
 * 
 * Features:
 * - Automatic backend detection
 * - Dual-backend sync when both available
 * - Offline-first with sync queue
 * - Secure password handling
 * 
 * @module unified/UnifiedAuth
 */

import { checkBackends, TauriAdapter, FastifyAdapter } from './_shared.js';

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

        // Prepare registration data
        const regData = {
            username: data.username.trim(),
            phone: data.phone || data.username.trim(),
            password: data.password,
            email: data.email
        };

        // Register on Tauri (local-first)
        if (tauri) {
            try {
                results.tauri = await TauriAdapter.auth.register({
                    username: regData.username,
                    phone: regData.phone,
                    password: regData.password,
                    email: regData.email
                });
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Register on Fastify (cloud) 
        if (fastify) {
            try {
                results.fastify = await FastifyAdapter.auth.register({
                    phone: regData.phone,
                    password: regData.password,
                    username: regData.username
                });
                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        // Handle success - sync to offline backend if needed
        if (primaryResult && primaryResult.success) {
            let pendingSync = false;

            // If Tauri is offline but Fastify succeeded, queue for Tauri sync
            if (!tauri && results.fastify?.success) {
                this._queuePendingSync('register', {
                    username: regData.username,
                    phone: regData.phone,
                    password: regData.password, // Stored temporarily for sync
                    userId: primaryResult.user?.id,
                    createdOn: 'fastify'
                });
                pendingSync = true;
            }
            // If Fastify is offline but Tauri succeeded, queue for Fastify sync
            else if (!fastify && results.tauri?.success) {
                this._queuePendingSync('register', {
                    username: regData.username,
                    phone: regData.phone,
                    password: regData.password,
                    userId: primaryResult.user?.id,
                    createdOn: 'tauri'
                });
                pendingSync = true;
            }
            // BOTH online: If one succeeded but other failed (not just offline), try to sync
            else if (tauri && fastify) {
                // If Tauri succeeded but Fastify failed (user didn't exist there)
                if (results.tauri?.success && !results.fastify?.success) {
                    const msg = results.fastify?.message || results.fastify?.error || '';
                    // Only retry if not "already exists"
                    if (!msg.includes('already') && !msg.includes('exists')) {
                        try {
                            results.fastify = await FastifyAdapter.auth.register({
                                phone: regData.phone,
                                password: regData.password,
                                username: regData.username
                            });
                        } catch (e) {
                            console.log('[UnifiedAuth] Fastify sync retry failed:', e.message);
                        }
                    }
                }
                // If Fastify succeeded but Tauri failed
                if (results.fastify?.success && !results.tauri?.success) {
                    const msg = results.tauri?.message || results.tauri?.error || '';
                    if (!msg.includes('already') && !msg.includes('exists')) {
                        try {
                            results.tauri = await TauriAdapter.auth.register({
                                username: regData.username,
                                phone: regData.phone,
                                password: regData.password
                            });
                        } catch (e) {
                            console.log('[UnifiedAuth] Tauri sync retry failed:', e.message);
                        }
                    }
                }
            }

            return {
                success: true,
                user: primaryResult.user,
                token: primaryResult.token,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                },
                pendingSync
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
            // Process any pending syncs after successful login
            const syncResult = await this.processPendingSync();
            if (syncResult.processed > 0) {
                console.log(`[UnifiedAuth] Processed ${syncResult.processed} pending syncs after login`);
            }

            // Dispatch event to trigger atome sync after login
            if (typeof window !== 'undefined') {
                console.log('[UnifiedAuth] Dispatching squirrel:user-logged-in event');
                window.dispatchEvent(new CustomEvent('squirrel:user-logged-in', {
                    detail: {
                        backends: {
                            tauri: results.tauri?.success || false,
                            fastify: results.fastify?.success || false
                        }
                    }
                }));
            }

            return {
                success: true,
                user: primaryResult.user,
                token: primaryResult.token,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                },
                syncedPending: syncResult.processed
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
    },

    // ============================================
    // SYNC QUEUE MANAGEMENT
    // ============================================

    /**
     * Queue a pending sync operation for when offline backend comes online
     * @private
     */
    _queuePendingSync(operation, data) {
        if (typeof localStorage === 'undefined') return;

        try {
            const queue = JSON.parse(localStorage.getItem('auth_pending_sync') || '[]');
            queue.push({
                operation,
                data,
                queuedAt: new Date().toISOString()
            });
            localStorage.setItem('auth_pending_sync', JSON.stringify(queue));
            console.log(`[UnifiedAuth] Queued ${operation} for sync:`, data.username);
        } catch (e) {
            console.warn('[UnifiedAuth] Failed to queue sync:', e);
        }
    },

    /**
     * Process pending sync operations
     * Called when backends become available
     * @returns {Promise<Object>} { processed: number, errors: [] }
     */
    async processPendingSync() {
        if (typeof localStorage === 'undefined') return { processed: 0, errors: [] };

        const queue = JSON.parse(localStorage.getItem('auth_pending_sync') || '[]');
        if (queue.length === 0) return { processed: 0, errors: [] };

        const { tauri, fastify } = await checkBackends(true);
        const processed = [];
        const errors = [];
        const remaining = [];

        for (const item of queue) {
            if (item.operation === 'register') {
                const data = item.data;

                // Sync to Tauri if it was created on Fastify
                if (data.createdOn === 'fastify' && tauri) {
                    try {
                        const result = await TauriAdapter.auth.register({
                            username: data.username,
                            phone: data.phone,
                            password: data.password
                        });
                        if (result.success) {
                            processed.push({ type: 'register', target: 'tauri', username: data.username });
                            console.log(`[UnifiedAuth] ✅ Synced account to Tauri: ${data.username}`);
                        } else {
                            // If user already exists, that's fine - remove from queue
                            if (result.error?.includes('already exists') || result.error?.includes('Phone already registered')) {
                                processed.push({ type: 'register', target: 'tauri', username: data.username, alreadyExists: true });
                            } else {
                                remaining.push(item);
                                errors.push({ target: 'tauri', error: result.error });
                            }
                        }
                    } catch (e) {
                        remaining.push(item);
                        errors.push({ target: 'tauri', error: e.message });
                    }
                }
                // Sync to Fastify if it was created on Tauri
                else if (data.createdOn === 'tauri' && fastify) {
                    try {
                        const result = await FastifyAdapter.auth.register({
                            username: data.username,
                            phone: data.phone,
                            password: data.password
                        });
                        if (result.success) {
                            processed.push({ type: 'register', target: 'fastify', username: data.username });
                            console.log(`[UnifiedAuth] ✅ Synced account to Fastify: ${data.username}`);
                        } else {
                            if (result.error?.includes('already exists') || result.error?.includes('already registered')) {
                                processed.push({ type: 'register', target: 'fastify', username: data.username, alreadyExists: true });
                            } else {
                                remaining.push(item);
                                errors.push({ target: 'fastify', error: result.error });
                            }
                        }
                    } catch (e) {
                        remaining.push(item);
                        errors.push({ target: 'fastify', error: e.message });
                    }
                }
                // Backend still not available
                else if ((data.createdOn === 'fastify' && !tauri) || (data.createdOn === 'tauri' && !fastify)) {
                    remaining.push(item);
                }
            }
        }

        // Update queue with remaining items
        localStorage.setItem('auth_pending_sync', JSON.stringify(remaining));

        // Clear passwords from processed items for security
        if (processed.length > 0) {
            console.log(`[UnifiedAuth] Processed ${processed.length} pending syncs, ${remaining.length} remaining`);
        }

        return { processed: processed.length, errors, remaining: remaining.length };
    },

    /**
     * Get pending sync count
     * @returns {number}
     */
    getPendingSyncCount() {
        if (typeof localStorage === 'undefined') return 0;
        try {
            const queue = JSON.parse(localStorage.getItem('auth_pending_sync') || '[]');
            return queue.length;
        } catch {
            return 0;
        }
    }
};

export default UnifiedAuth;
