/**
 * UnifiedUserData.js
 * 
 * Unified User Data Management API
 * Handles user data operations separately from account management
 * 
 * Features:
 * - Delete all user data (keep account)
 * - Export user data
 * - Data isolation per user
 * 
 * @module unified/UnifiedUserData
 */

import { checkBackends, TauriAdapter, FastifyAdapter } from './_shared.js';

// ============================================
// UNIFIED USER DATA API
// ============================================

const UnifiedUserData = {
    /**
     * Delete all user data (keeps the account)
     * Requires password confirmation for security
     * 
     * @param {Object} data - Deletion options
     * @param {string} data.password - Password for confirmation
     * @param {string[]} [data.kinds] - Specific kinds to delete (optional, deletes all if not provided)
     * @returns {Promise<Object>} { success, deleted, message, backends }
     * 
     * @example
     * // Delete all data
     * await UnifiedUserData.deleteAll({
     *     password: "MyPassword123!"
     * });
     * 
     * // Delete only code files
     * await UnifiedUserData.deleteAll({
     *     password: "MyPassword123!",
     *     kinds: ["code_file"]
     * });
     */
    async deleteAll(data) {
        if (!data.password) {
            return { success: false, error: 'Password is required for confirmation' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let totalDeleted = 0;

        // Delete on Tauri
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.userData.deleteAll(data);
                if (results.tauri.success) {
                    totalDeleted += results.tauri.deleted || 0;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Delete on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.userData.deleteAll(data);
                if (results.fastify.success) {
                    totalDeleted += results.fastify.deleted || 0;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        const anySuccess = results.tauri?.success || results.fastify?.success;

        return {
            success: anySuccess,
            deleted: totalDeleted,
            message: anySuccess ? `Deleted ${totalDeleted} items` : 'Deletion failed',
            backends: results
        };
    },

    /**
     * Export all user data
     * Returns all user atomes in specified format
     * 
     * @param {Object} [params] - Export options
     * @param {string} [params.format='json'] - Export format: 'json' | 'zip'
     * @param {string[]} [params.kinds] - Specific kinds to export (optional, exports all if not provided)
     * @returns {Promise<Object>} { success, data, exportedAt, format }
     * 
     * @example
     * const exported = await UnifiedUserData.export({
     *     format: "json",
     *     kinds: ["code_file", "shape"]
     * });
     */
    async export(params = {}) {
        const { tauri, fastify } = await checkBackends();
        const format = params.format || 'json';

        // Prefer Tauri for local data
        if (tauri && TauriAdapter.getToken()) {
            try {
                const result = await TauriAdapter.userData.export(params);
                if (result.success) {
                    return {
                        ...result,
                        format,
                        exportedAt: new Date().toISOString(),
                        source: 'tauri'
                    };
                }
            } catch (error) {
                // Fall through
            }
        }

        // Try Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                const result = await FastifyAdapter.userData.export(params);
                if (result.success) {
                    return {
                        ...result,
                        format,
                        exportedAt: new Date().toISOString(),
                        source: 'fastify'
                    };
                }
            } catch (error) {
                // Fall through
            }
        }

        return { success: false, error: 'Export failed', data: null };
    },

    /**
     * Get user data statistics
     * 
     * @returns {Promise<Object>} { success, stats }
     * 
     * @example
     * const stats = await UnifiedUserData.stats();
     * console.log(stats.stats.totalAtomes);
     */
    async stats() {
        const { tauri, fastify } = await checkBackends();
        const stats = {
            totalAtomes: 0,
            byKind: {},
            lastModified: null,
            sources: { tauri: null, fastify: null }
        };

        // Get from Tauri
        if (tauri && TauriAdapter.getToken()) {
            try {
                const result = await TauriAdapter.atome.list({ limit: 1000 });
                if (result.success && result.data) {
                    stats.sources.tauri = {
                        count: result.data.length,
                        total: result.total || result.data.length
                    };
                    result.data.forEach(atome => {
                        const kind = atome.kind || 'unknown';
                        stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;
                    });
                    stats.totalAtomes += result.data.length;
                }
            } catch (error) {
                stats.sources.tauri = { error: error.message };
            }
        }

        // Get from Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                const result = await FastifyAdapter.atome.list({ limit: 1000 });
                if (result.success && result.data) {
                    stats.sources.fastify = {
                        count: result.data.length,
                        total: result.total || result.data.length
                    };
                    // Only add if not already counted from Tauri
                    if (!stats.sources.tauri?.count) {
                        result.data.forEach(atome => {
                            const kind = atome.kind || 'unknown';
                            stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;
                        });
                        stats.totalAtomes += result.data.length;
                    }
                }
            } catch (error) {
                stats.sources.fastify = { error: error.message };
            }
        }

        return { success: true, stats };
    }
};

export default UnifiedUserData;
