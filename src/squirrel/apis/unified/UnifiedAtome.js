/**
 * UnifiedAtome.js
 * 
 * Unified Atome (Document) API implementing ADOLE principles:
 * - Append-only: Never modify original data, only add alterations
 * - Versioned: Every change increments logical_clock
 * - Restorable: Can restore to any previous version
 * - Soft-delete: Delete marks as deleted, doesn't remove
 * 
 * Works seamlessly with both:
 * - Tauri/Axum backend (localhost:3000, SQLite)
 * - Fastify backend (localhost:3001, PostgreSQL)
 * 
 * @module unified/UnifiedAtome
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
 * Generate a unique ID for atomes
 */
function generateId(prefix = 'atome') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// UNIFIED ATOME API
// ============================================

const UnifiedAtome = {
    /**
     * Create a new atome (document)
     * Creates on Tauri first (local-first), then syncs to Fastify
     * 
     * @param {Object} data - Atome data
     * @param {string} data.kind - Type of atome (e.g., 'code_file', 'shape', 'note')
     * @param {string} [data.type] - Subtype (e.g., 'javascript', 'python')
     * @param {Object} data.data - Atome content (name, content, etc.)
     * @param {Object} [data.meta] - Optional metadata (tags, description)
     * @param {string} [data.parentId] - Parent atome ID (for hierarchies)
     * @returns {Promise<Object>} { success, id, version, atome, backends }
     * 
     * @example
     * const doc = await UnifiedAtome.create({
     *     kind: "code_file",
     *     type: "javascript",
     *     data: {
     *         name: "hello.js",
     *         content: "console.log('Hello');"
     *     }
     * });
     */
    async create(data) {
        if (!data.kind) {
            return { success: false, error: 'Kind is required' };
        }
        if (!data.data) {
            return { success: false, error: 'Data is required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Prepare atome data
        const atomeData = {
            kind: data.kind,
            type: data.type || 'generic',
            data: data.data,
            meta: data.meta || {},
            parentId: data.parentId || null,
            logicalClock: 1,
            deviceId: this._getDeviceId()
        };

        // Create on Tauri first (local-first)
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.create(atomeData);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Create on Fastify (cloud backup)
        if (fastify && FastifyAdapter.getToken()) {
            try {
                // Use same ID if created on Tauri
                if (primaryResult && primaryResult.id) {
                    atomeData.id = primaryResult.id;
                }
                results.fastify = await FastifyAdapter.atome.create(atomeData);
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
                id: primaryResult.id || primaryResult.atome?.id,
                version: 1,
                atome: primaryResult.atome,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Create failed';
        return { success: false, error, backends: results };
    },

    /**
     * Get a single atome by ID
     * 
     * @param {string} id - Atome UUID
     * @returns {Promise<Object>} { success, atome }
     * 
     * @example
     * const doc = await UnifiedAtome.get("uuid-...");
     * console.log(doc.atome.data.content);
     */
    async get(id) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }

        const { tauri, fastify } = await checkBackends();

        // Try Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                const result = await TauriAdapter.atome.get(id);
                if (result.success) {
                    return { ...result, source: 'tauri' };
                }
            } catch (error) {
                // Fall through
            }
        }

        // Try Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                const result = await FastifyAdapter.atome.get(id);
                if (result.success) {
                    return { ...result, source: 'fastify' };
                }
            } catch (error) {
                // Fall through
            }
        }

        return { success: false, error: 'Atome not found' };
    },

    /**
     * List atomes with optional filters
     * 
     * @param {Object} [params] - Filter parameters
     * @param {string} [params.kind] - Filter by kind
     * @param {string} [params.type] - Filter by type
     * @param {string} [params.parentId] - Filter by parent
     * @param {string} [params.search] - Search in name/content
     * @param {number} [params.page=1] - Page number
     * @param {number} [params.limit=20] - Items per page
     * @param {string} [params.sortBy='updatedAt'] - Sort field
     * @param {string} [params.sortOrder='desc'] - Sort order
     * @returns {Promise<Object>} { success, data, total, page, pages }
     * 
     * @example
     * const files = await UnifiedAtome.list({
     *     kind: "code_file",
     *     limit: 10
     * });
     */
    async list(params = {}) {
        const { tauri, fastify } = await checkBackends();

        // Try Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                const result = await TauriAdapter.atome.list(params);
                if (result.success) {
                    return { ...result, source: 'tauri' };
                }
            } catch (error) {
                // Fall through
            }
        }

        // Try Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                const result = await FastifyAdapter.atome.list(params);
                if (result.success) {
                    return { ...result, source: 'fastify' };
                }
            } catch (error) {
                // Fall through
            }
        }

        return { success: false, error: 'Failed to list atomes', data: [] };
    },

    /**
     * Alter an atome (ADOLE compliant)
     * Never modifies original - creates a new alteration version
     * 
     * @param {string} id - Atome UUID
     * @param {Object} data - Alteration data
     * @param {string} data.operation - Operation type: 'update' | 'patch' | 'rename' | 'tag'
     * @param {Object} data.changes - The changes to apply
     * @param {string} [data.reason] - Reason for the change (for audit)
     * @returns {Promise<Object>} { success, id, version, alteration }
     * 
     * @example
     * const result = await UnifiedAtome.alter("uuid-...", {
     *     operation: "update",
     *     changes: { content: "console.log('Updated!');" },
     *     reason: "Fixed typo"
     * });
     */
    async alter(id, data) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }
        if (!data.operation) {
            return { success: false, error: 'Operation is required' };
        }
        if (!data.changes) {
            return { success: false, error: 'Changes are required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        const alterData = {
            operation: data.operation,
            changes: data.changes,
            reason: data.reason || '',
            deviceId: this._getDeviceId(),
            timestamp: new Date().toISOString()
        };

        // Alter on Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.alter(id, alterData);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Alter on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.atome.alter(id, alterData);
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
                id: id,
                version: primaryResult.version || primaryResult.logicalClock,
                alteration: primaryResult.alteration,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Alter failed';
        return { success: false, error, backends: results };
    },

    /**
     * Update an atome (simple update for backward compatibility)
     * For ADOLE compliance, prefer using alter()
     * 
     * @param {string} id - Atome UUID
     * @param {Object} data - Fields to update
     * @returns {Promise<Object>} { success, atome }
     */
    async update(id, data) {
        // Internally use alter with 'update' operation
        return this.alter(id, {
            operation: 'update',
            changes: data,
            reason: 'Direct update'
        });
    },

    /**
     * Rename an atome (shorthand for alter with rename operation)
     * 
     * @param {string} id - Atome UUID
     * @param {Object} data - Rename data
     * @param {string} data.newName - New name for the atome
     * @returns {Promise<Object>} { success, id, version, oldName, newName }
     * 
     * @example
     * await UnifiedAtome.rename("uuid-...", { newName: "renamed.js" });
     */
    async rename(id, data) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }
        if (!data.newName) {
            return { success: false, error: 'New name is required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Rename on Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.rename(id, data);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Rename on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.atome.rename(id, data);
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
                id: id,
                version: primaryResult.version,
                oldName: primaryResult.oldName,
                newName: data.newName,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Rename failed';
        return { success: false, error, backends: results };
    },

    /**
     * Soft delete an atome (ADOLE compliant)
     * Marks as deleted but keeps in database for history
     * 
     * @param {string} id - Atome UUID
     * @param {Object} [data] - Delete options
     * @param {string} [data.reason] - Reason for deletion
     * @returns {Promise<Object>} { success, id, deletedAt, restorable }
     * 
     * @example
     * await UnifiedAtome.delete("uuid-...", { reason: "No longer needed" });
     */
    async delete(id, data = {}) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Delete on Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.delete(id, data);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Delete on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.atome.delete(id, data);
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
                id: id,
                deletedAt: new Date().toISOString(),
                restorable: true,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Delete failed';
        return { success: false, error, backends: results };
    },

    /**
     * Get atome alteration history
     * 
     * @param {string} id - Atome UUID
     * @param {Object} [params] - Pagination options
     * @param {number} [params.page=1] - Page number
     * @param {number} [params.limit=50] - Items per page
     * @returns {Promise<Object>} { success, id, currentVersion, alterations }
     * 
     * @example
     * const history = await UnifiedAtome.history("uuid-...");
     * console.log(history.alterations);
     */
    async history(id, params = {}) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }

        const { tauri, fastify } = await checkBackends();

        // Try Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                const result = await TauriAdapter.atome.history(id, params);
                if (result.success) {
                    return { ...result, source: 'tauri' };
                }
            } catch (error) {
                // Fall through
            }
        }

        // Try Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                const result = await FastifyAdapter.atome.history(id, params);
                if (result.success) {
                    return { ...result, source: 'fastify' };
                }
            } catch (error) {
                // Fall through
            }
        }

        return { success: false, error: 'Failed to get history' };
    },

    /**
     * Restore atome to a specific version
     * Creates a new version with content from the specified version
     * 
     * @param {string} id - Atome UUID
     * @param {Object} data - Restore options
     * @param {number} data.version - Version number to restore to
     * @param {string} [data.reason] - Reason for restoration
     * @returns {Promise<Object>} { success, id, restoredToVersion, newVersion, data }
     * 
     * @example
     * await UnifiedAtome.restore("uuid-...", {
     *     version: 2,
     *     reason: "Reverting accidental changes"
     * });
     */
    async restore(id, data) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }
        if (!data.version) {
            return { success: false, error: 'Version is required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Restore on Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.restore(id, data);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Restore on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.atome.restore(id, data);
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
                id: id,
                restoredToVersion: data.version,
                newVersion: primaryResult.newVersion || primaryResult.version,
                data: primaryResult.data,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Restore failed';
        return { success: false, error, backends: results };
    },

    /**
     * Get device ID for ADOLE tracking
     * @private
     */
    _getDeviceId() {
        if (typeof localStorage !== 'undefined') {
            let deviceId = localStorage.getItem('squirrel_device_id');
            if (!deviceId) {
                deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                localStorage.setItem('squirrel_device_id', deviceId);
            }
            return deviceId;
        }
        return 'unknown_device';
    }
};

export default UnifiedAtome;
