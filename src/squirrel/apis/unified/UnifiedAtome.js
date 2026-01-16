/**
 * UnifiedAtome.js
 * 
 * Unified Atome (Document) API.
 *
 * Role:
 * - Thin, UI-facing wrapper around the canonical ADOLE data layer.
 * - Delegates base CRUD to AdoleAPI.atomes for a single source of truth.
 * - Keeps advanced operations (rename/history/restore) here for UI convenience.
 * - Sync is handled by UnifiedSync; this module does not implement its own sync loop.
 * 
 * @module unified/UnifiedAtome
 */

import { checkBackends, TauriAdapter, FastifyAdapter } from './_shared.js';
import { AdoleAPI } from './adole_apis.js';

const resolveAdoleAtomes = () => {
    if (AdoleAPI?.atomes) return AdoleAPI.atomes;
    if (typeof window !== 'undefined' && window.AdoleAPI?.atomes) return window.AdoleAPI.atomes;
    if (typeof globalThis !== 'undefined' && globalThis.AdoleAPI?.atomes) return globalThis.AdoleAPI.atomes;
    return null;
};

const extractAtomeId = (result) => {
    const extractFrom = (res) => {
        if (!res) return null;
        return (
            res?.atome_id || res?.id ||
            res?.data?.atome_id || res?.data?.id ||
            res?.data?.data?.atome_id || res?.data?.data?.id ||
            res?.atome?.atome_id || res?.atome?.id ||
            res?.data?.atome?.atome_id || res?.data?.atome?.id ||
            null
        );
    };
    return extractFrom(result?.tauri?.data) || extractFrom(result?.fastify?.data) || null;
};

const mergeAtomes = (tauriAtomes = [], fastifyAtomes = []) => {
    const map = new Map();

    const add = (list, source) => {
        if (!Array.isArray(list)) return;
        list.forEach((atome) => {
            const id = atome?.id || atome?.atome_id || atome?.object_id || null;
            if (!id) return;
            const existing = map.get(id);
            if (!existing) {
                map.set(id, { ...atome, _source: source });
                return;
            }
            const existingClock = existing.logicalClock || existing.logical_clock || 0;
            const nextClock = atome.logicalClock || atome.logical_clock || 0;
            if (nextClock > existingClock) {
                map.set(id, { ...atome, _source: source });
            }
        });
    };

    add(tauriAtomes, 'tauri');
    add(fastifyAtomes, 'fastify');

    return Array.from(map.values());
};

const buildListOptions = (params = {}) => {
    const limit = params.limit || 20;
    const page = params.page || 1;
    const offset = params.offset !== undefined ? params.offset : (page - 1) * limit;
    return {
        type: params.kind || params.type || null,
        projectId: params.parentId || params.projectId || params.project_id || null,
        ownerId: params.ownerId || null,
        includeShared: !!params.includeShared,
        includeDeleted: !!params.includeDeleted,
        limit,
        offset
    };
};

// ============================================
// UNIFIED ATOME API
// ============================================

const UnifiedAtome = {
    /**
     * Create a new atome (document)
     * Delegates to AdoleAPI.atomes for canonical persistence
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
        const atomes = resolveAdoleAtomes();
        if (!atomes?.create) {
            return { success: false, error: 'AdoleAPI.atomes.create is not available' };
        }

        const kind = data.kind;
        const type = data.type || 'generic';
        const properties = {
            ...(data.data || {}),
            ...(data.meta ? { meta: data.meta } : {}),
            kind,
            type
        };

        const result = await atomes.create({
            type: kind,
            parentId: data.parentId || null,
            properties
        });

        const success = !!(result?.tauri?.success || result?.fastify?.success);
        const id = extractAtomeId(result);
        const backends = {
            tauri: !!result?.tauri?.success,
            fastify: !!result?.fastify?.success
        };

        if (!success) {
            return {
                success: false,
                error: result?.tauri?.error || result?.fastify?.error || 'Create failed',
                backends
            };
        }

        return {
            success: true,
            id,
            version: 1,
            atome: {
                id,
                kind,
                type,
                data: data.data,
                meta: data.meta || {},
                parentId: data.parentId || null,
                properties
            },
            backends,
            queued: !(backends.tauri && backends.fastify)
        };
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
        const atomes = resolveAdoleAtomes();
        if (!atomes?.get) {
            return { success: false, error: 'AdoleAPI.atomes.get is not available' };
        }

        const result = await atomes.get(id);
        const tauriAtome = result?.tauri?.atome || null;
        const fastifyAtome = result?.fastify?.atome || null;
        const atome = tauriAtome || fastifyAtome;
        const source = tauriAtome ? 'tauri' : (fastifyAtome ? 'fastify' : null);

        if (!atome) {
            return {
                success: false,
                error: result?.tauri?.error || result?.fastify?.error || 'Atome not found'
            };
        }

        return {
            success: true,
            atome,
            source
        };
    },

    /**
     * List atomes with optional filters
     * Merges results from both backends, preferring the most recent version
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
        const atomes = resolveAdoleAtomes();
        if (!atomes?.list) {
            return { success: false, error: 'AdoleAPI.atomes.list is not available' };
        }

        const result = await atomes.list(buildListOptions(params));
        const merged = mergeAtomes(result?.tauri?.atomes, result?.fastify?.atomes);

        merged.sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0).getTime();
            const bTime = new Date(b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0).getTime();
            return bTime - aTime;
        });

        return {
            success: true,
            data: merged,
            atomes: merged,
            total: merged.length,
            source: merged.length > 0 ? 'merged' : 'empty'
        };
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

                // If atome not found on Fastify (404), try to sync it first from Tauri
                if (!results.fastify.success && results.fastify.status === 404 && results.tauri?.success) {
                    // Get the full atome from Tauri (which already contains the alteration)
                    const tauriAtome = await TauriAdapter.atome.get(id);

                    if (tauriAtome.success && tauriAtome.atome) {
                        // Transform Tauri atome to Fastify format
                        // Tauri uses 'data' field for properties, Fastify expects 'properties'
                        const atomeForFastify = {
                            id: tauriAtome.atome.id,
                            kind: tauriAtome.atome.kind || 'generic',
                            tag: tauriAtome.atome.data?.tag || 'div',
                            parentId: tauriAtome.atome.parentId || tauriAtome.atome.data?.parentId || null,
                            // Merge all data fields into properties for Fastify
                            properties: {
                                ...(tauriAtome.atome.data || {}),
                                ...(tauriAtome.atome.snapshot || {})
                            }
                        };

                        const createResult = await FastifyAdapter.atome.create(atomeForFastify);
                        if (createResult.success) {
                            // The atome is now on Fastify with the complete state from Tauri
                            // No need to alter again - the alteration is already included
                            results.fastify = {
                                success: true,
                                synced: true,
                                message: 'Atome synced from Tauri (alteration already applied)'
                            };
                        } else {
                            results.fastify = {
                                success: false,
                                error: createResult.error || 'Fastify create failed'
                            };
                        }
                    }
                }

                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        if (primaryResult && primaryResult.success) {
            // NOTE: Do NOT broadcast manually here!
            // The HTTP API broadcasts to all clients via the sync server

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
            // NOTE: Do NOT broadcast manually here!
            // The HTTP API broadcasts to all clients via the sync server

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
        const atomes = resolveAdoleAtomes();
        if (!atomes?.delete) {
            return { success: false, error: 'AdoleAPI.atomes.delete is not available' };
        }

        const result = await atomes.delete(id);
        const backends = {
            tauri: !!result?.tauri?.success,
            fastify: !!result?.fastify?.success
        };

        if (backends.tauri || backends.fastify) {
            return {
                success: true,
                id,
                deletedAt: new Date().toISOString(),
                restorable: true,
                backends
            };
        }

        return {
            success: false,
            error: result?.tauri?.error || result?.fastify?.error || 'Delete failed',
            backends
        };
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
    },

    /**
     * Get pending operations count (for offline sync queue)
     * @returns {number} Number of pending operations
     */
    getPendingCount() {
        // For now, return 0 as the unified API handles sync differently
        // This can be enhanced to track pending operations if needed
        if (typeof localStorage !== 'undefined') {
            try {
                const pending = localStorage.getItem('unified_pending_ops');
                if (pending) {
                    const ops = JSON.parse(pending);
                    return Array.isArray(ops) ? ops.length : 0;
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
        return 0;
    },

    /**
     * Sync is owned by UnifiedSync.
     * Use UnifiedSync.syncNow() for explicit sync requests.
     */
};

export default UnifiedAtome;
