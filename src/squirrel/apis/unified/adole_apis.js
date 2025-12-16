

// ============================================
// ADOLE v3.0 - WebSocket API Functions
// ============================================

import { TauriAdapter, FastifyAdapter, CONFIG } from './adole.js';

// ============================================
// CURRENT PROJECT STATE
// ============================================

// Global current project state (accessible everywhere)
let _currentProjectId = null;
let _currentProjectName = null;

// Also expose on window for easy access
if (typeof window !== 'undefined') {
    window.__currentProject = {
        get id() { return _currentProjectId; },
        get name() { return _currentProjectName; }
    };
}

/**
 * Get the current project ID
 * @returns {string|null} Current project ID or null
 */
function get_current_project_id() {
    return _currentProjectId;
}

/**
 * Get the current project info
 * @returns {{id: string|null, name: string|null}} Current project info
 */
function get_current_project() {
    return {
        id: _currentProjectId,
        name: _currentProjectName
    };
}

/**
 * Set the current project (in memory and persist to user particle)
 * @param {string} projectId - Project ID
 * @param {string} [projectName] - Project name (optional)
 * @param {boolean} [persist=true] - Whether to save to database
 * @returns {Promise<boolean>} Success status
 */
async function set_current_project(projectId, projectName = null, persist = true) {
    _currentProjectId = projectId;
    _currentProjectName = projectName;

    console.log(`[AdoleAPI] Current project set: ${projectName || 'unnamed'} (${projectId ? projectId.substring(0, 8) + '...' : 'none'})`);

    if (!persist || !projectId) {
        return true;
    }

    // Persist to user's particle (current_project_id)
    try {
        // Get current user ID
        const userResult = await current_user();
        const userId = userResult?.user?.user_id || userResult?.user?.id;

        if (!userId) {
            console.warn('[AdoleAPI] Cannot persist current project: no user logged in');
            return false;
        }

        // Update user's current_project_id particle via alter_atome
        // We use the user's atome to store this preference
        const particleData = {
            current_project_id: projectId,
            current_project_name: projectName || null
        };

        // Try to update via both adapters
        try {
            await TauriAdapter.atome.alter(userId, particleData);
        } catch (e) {
            console.warn('[AdoleAPI] Tauri persist current project failed:', e.message);
        }

        try {
            await FastifyAdapter.atome.alter(userId, particleData);
        } catch (e) {
            console.warn('[AdoleAPI] Fastify persist current project failed:', e.message);
        }

        console.log('[AdoleAPI] Current project persisted to user particle');
        return true;
    } catch (e) {
        console.error('[AdoleAPI] Failed to persist current project:', e);
        return false;
    }
}

/**
 * Load the current project from user's saved preference
 * Called after login to restore last used project
 * @returns {Promise<{id: string|null, name: string|null}>} Last saved project info
 */
async function load_saved_current_project() {
    try {
        // Get current user
        const userResult = await current_user();
        const userId = userResult?.user?.user_id || userResult?.user?.id;

        if (!userId) {
            return { id: null, name: null };
        }

        // Get user atome to read current_project_id particle
        const atomeResult = await get_atome(userId);
        const particles = atomeResult?.tauri?.data?.particles ||
            atomeResult?.fastify?.data?.particles ||
            atomeResult?.tauri?.particles ||
            atomeResult?.fastify?.particles ||
            {};

        const savedProjectId = particles.current_project_id || null;
        const savedProjectName = particles.current_project_name || null;

        if (savedProjectId) {
            _currentProjectId = savedProjectId;
            _currentProjectName = savedProjectName;
            console.log(`[AdoleAPI] Restored saved project: ${savedProjectName || 'unnamed'} (${savedProjectId.substring(0, 8)}...)`);
        }

        return { id: savedProjectId, name: savedProjectName };
    } catch (e) {
        console.warn('[AdoleAPI] Could not load saved current project:', e.message);
        return { id: null, name: null };
    }
}

/**
 * Create a user via WebSocket
 * @param {string} phone - Phone number
 * @param {string} password - Password
 * @param {string} username - Username
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function create_user(phone, password, username, callback) {
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Try Tauri first (local SQLite)
    try {
        const tauriResult = await TauriAdapter.auth.register({
            phone,
            password,
            username
        });
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Also try Fastify (LibSQL)
    try {
        const fastifyResult = await FastifyAdapter.auth.register({
            phone,
            password,
            username
        });
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    // Call callback if provided
    if (typeof callback === 'function') {
        callback(results);
    }

    return results;
}

/**
 * Login a user via WebSocket
 * @param {string} phone - Phone number
 * @param {string} password - Password
 * @param {string} username - Username (for logging purposes)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function log_user(phone, password, username, callback) {
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Try Tauri first (local SQLite)
    try {
        const tauriResult = await TauriAdapter.auth.login({
            phone,
            password
        });
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Also try Fastify (LibSQL)
    try {
        const fastifyResult = await FastifyAdapter.auth.login({
            phone,
            password
        });
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    // Call callback if provided
    if (typeof callback === 'function') {
        callback(results);
    }

    return results;
}

/**
 * Get the currently logged in user
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{logged: boolean, user: Object|null, source: string}>}
 */
async function current_user(callback) {
    const result = {
        logged: false,
        user: null,
        source: null
    };

    // Try Tauri first
    try {
        const tauriResult = await TauriAdapter.auth.me();
        if (tauriResult.ok || tauriResult.success) {
            if (tauriResult.user) {
                result.logged = true;
                result.user = tauriResult.user;
                result.source = 'tauri';

                if (typeof callback === 'function') {
                    callback(result);
                }
                return result;
            }
        }
    } catch (e) {
        // Silent failure
    }

    // Try Fastify if Tauri didn't have a user
    try {
        const fastifyResult = await FastifyAdapter.auth.me();
        if (fastifyResult.ok || fastifyResult.success) {
            if (fastifyResult.user) {
                result.logged = true;
                result.user = fastifyResult.user;
                result.source = 'fastify';

                if (typeof callback === 'function') {
                    callback(result);
                }
                return result;
            }
        }
    } catch (e) {
        // Silent failure
    }

    // No user logged in
    if (typeof callback === 'function') {
        callback(result);
    }

    return result;
}

async function unlog_user(callback = null) {
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Tauri logout
    try {
        const tauriResult = await TauriAdapter.auth.logout();
        if (tauriResult.ok && tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Fastify logout
    try {
        const fastifyResult = await FastifyAdapter.auth.logout();
        if (fastifyResult.ok && fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    // Execute callback if provided
    if (callback && typeof callback === 'function') {
        callback(results);
    }

    return results;
}

// ...existing code...

/**
 * Delete a user via WebSocket
 * @param {string} phone - Phone number of the user to delete
 * @param {string} password - Password for verification
 * @param {string} username - Username (for logging purposes)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function delete_user(phone, password, username, callback) {
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Try Tauri first (local SQLite)
    try {
        const tauriResult = await TauriAdapter.auth.deleteAccount({
            phone,
            password
        });
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Also try Fastify (LibSQL)
    try {
        const fastifyResult = await FastifyAdapter.auth.deleteAccount({
            phone,
            password
        });
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    // Call callback if provided
    if (typeof callback === 'function') {
        callback(results);
    }

    return results;
}

/**
 * List all users via WebSocket - FIXED VERSION
 * Uses atome.list to get user-type atomes - Fixed server-side bug in Tauri
 */
async function user_list() {
    const results = {
        tauri: { users: [], error: null },
        fastify: { users: [], error: null }
    };

    // Try Tauri
    try {
        const tauriResult = await TauriAdapter.atome.list({ type: 'user' });
        if (tauriResult.ok || tauriResult.success) {
            results.tauri.users = tauriResult.atomes || tauriResult.data || [];
        } else {
            results.tauri.error = tauriResult.error;
        }
    } catch (e) {
        results.tauri.error = e.message;
    }

    // Try Fastify
    try {
        const fastifyResult = await FastifyAdapter.atome.list({ type: 'user' });
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify.users = fastifyResult.atomes || fastifyResult.data || [];
        } else {
            results.fastify.error = fastifyResult.error;
        }
    } catch (e) {
        results.fastify.error = e.message;
    }

    return results;
}

/**
 * Send a debug request via the existing WebSocket adapters
 * @param {Object} adapter - TauriAdapter or FastifyAdapter
 * @param {string} action - Debug action (e.g., 'list-tables')
 * @returns {Promise<Object>} Result from server
 */
async function sendDebugRequest(adapter, action) {
    // Access the internal WebSocket send method
    // The adapter uses ws.send() internally, we need to use the same pattern
    const ws = adapter === TauriAdapter ? getTauriWsInternal() : getFastifyWsInternal();

    if (!ws) {
        return { success: false, error: 'WebSocket not available' };
    }

    return ws.send({
        type: 'debug',
        action: action
    });
}

// Helper to access internal WebSocket instances
/**
 * List all tables from both databases via WebSocket
 * Uses the TauriAdapter and FastifyAdapter debug.listTables() method
 */
async function list_tables() {
    const results = {
        tauri: { database: 'Tauri/SQLite', tables: [], error: null },
        fastify: { database: 'Fastify/LibSQL', tables: [], error: null }
    };

    // Tauri: Use WebSocket adapter
    try {
        const tauriResult = await TauriAdapter.debug.listTables();
        if (tauriResult.success || tauriResult.ok) {
            results.tauri.tables = tauriResult.tables || [];
        } else {
            results.tauri.error = tauriResult.error || 'Unknown error';
        }
    } catch (e) {
        results.tauri.error = e.message;
    }

    // Fastify: Use WebSocket adapter
    try {
        const fastifyResult = await FastifyAdapter.debug.listTables();
        if (fastifyResult.success || fastifyResult.ok) {
            results.fastify.tables = fastifyResult.tables || [];
        } else {
            results.fastify.error = fastifyResult.error || 'Unknown error';
        }
    } catch (e) {
        results.fastify.error = e.message;
    }

    return results;
}

/**
 * List all unsynced atomes between Tauri (local) and Fastify (remote)
 * Compares both presence and content (particles) to detect modifications
 * Also detects soft-deleted atomes that need to be propagated
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Sync status with categorized atomes
 */
async function list_unsynced_atomes(callback) {
    const result = {
        onlyOnTauri: [],      // Atomes to push to server
        onlyOnFastify: [],    // Atomes to pull from server
        modifiedOnTauri: [],  // Local modifications not synced
        modifiedOnFastify: [], // Remote modifications not synced
        deletedOnTauri: [],   // Deleted on Tauri, need to propagate to Fastify
        deletedOnFastify: [], // Deleted on Fastify, need to propagate to Tauri
        conflicts: [],        // Modified on both sides (need resolution)
        synced: [],           // Identical on both sides
        error: null
    };

    // Known atome types to query (server requires a type when no owner specified)
    const atomeTypes = ['user', 'atome', 'shape', 'color', 'text', 'image', 'audio', 'video', 'code', 'data'];

    let tauriAtomes = [];
    let fastifyAtomes = [];

    // Helper to fetch all atomes of all types from an adapter (including deleted for sync)
    const fetchAllAtomes = async (adapter, name) => {
        const allAtomes = [];
        for (const type of atomeTypes) {
            try {
                // Include deleted atomes for sync comparison
                const result = await adapter.atome.list({ type, includeDeleted: true });
                if (result.ok || result.success) {
                    const atomes = result.atomes || result.data || [];
                    allAtomes.push(...atomes);
                }
            } catch (e) {
                // Ignore errors for individual types
            }
        }
        return allAtomes;
    };

    // Fetch all atomes from Tauri
    try {
        tauriAtomes = await fetchAllAtomes(TauriAdapter, 'Tauri');
    } catch (e) {
        result.error = 'Tauri connection failed: ' + e.message;
        if (typeof callback === 'function') callback(result);
        return result;
    }

    // Fetch all atomes from Fastify
    try {
        fastifyAtomes = await fetchAllAtomes(FastifyAdapter, 'Fastify');
    } catch (e) {
        // If Fastify is offline, all Tauri atomes are "unsynced"
        result.onlyOnTauri = tauriAtomes.filter(a => !a.deleted_at);
        result.error = 'Fastify connection failed - all local atomes considered unsynced';
        if (typeof callback === 'function') callback(result);
        return result;
    }

    // If Fastify returned nothing but Tauri has atomes, check if Fastify is just unreachable
    // Could be offline, mark all as unsynced

    // Create lookup maps by atome_id
    const tauriMap = new Map();
    const fastifyMap = new Map();

    tauriAtomes.forEach(atome => {
        const id = atome.atome_id || atome.id;
        if (id) tauriMap.set(id, atome);
    });

    fastifyAtomes.forEach(atome => {
        const id = atome.atome_id || atome.id;
        if (id) fastifyMap.set(id, atome);
    });

    // Helper function to extract particles from an atome (handles inline format)
    const extractParticlesForComparison = (atome) => {
        // If data field exists and has content, use it
        if (atome.data && typeof atome.data === 'object' && Object.keys(atome.data).length > 0) {
            return atome.data;
        }
        // If particles field exists and has content, use it
        if (atome.particles && typeof atome.particles === 'object' && Object.keys(atome.particles).length > 0) {
            return atome.particles;
        }

        // Otherwise, extract inline particles (all fields except metadata)
        const metadataFields = [
            'atome_id', 'atome_type', 'parent_id', 'owner_id', 'creator_id',
            'sync_status', 'created_at', 'updated_at', 'deleted_at', 'last_sync',
            'created_source', 'id', 'type', 'data', 'particles'
        ];

        const inlineParticles = {};
        for (const [key, value] of Object.entries(atome)) {
            if (!metadataFields.includes(key) && value !== null && value !== undefined) {
                inlineParticles[key] = value;
            }
        }
        return inlineParticles;
    };

    // Helper function to compare atome content
    const compareAtomes = (atome1, atome2) => {
        // First, compare particles content (the actual data)
        const particles1 = extractParticlesForComparison(atome1);
        const particles2 = extractParticlesForComparison(atome2);

        const count1 = Object.keys(particles1).length;
        const count2 = Object.keys(particles2).length;

        // Sort keys for consistent comparison
        const sortedP1 = JSON.stringify(particles1, Object.keys(particles1).sort());
        const sortedP2 = JSON.stringify(particles2, Object.keys(particles2).sort());

        // If content is identical, they are synced
        if (sortedP1 === sortedP2) {
            return 'equal';
        }

        // Content differs - special case: one has data, other is empty
        // The one with data should "win" regardless of timestamp
        if (count1 === 0 && count2 > 0) {
            // Tauri is empty, Fastify has data - Fastify is "newer" (more complete)
            return 'fastify_newer';
        }
        if (count2 === 0 && count1 > 0) {
            // Fastify is empty, Tauri has data - Tauri is "newer" (more complete)
            return 'tauri_newer';
        }

        // Both have data but differ - use timestamps to determine which is newer
        const updated1 = atome1.updated_at || atome1.updatedAt;
        const updated2 = atome2.updated_at || atome2.updatedAt;

        if (updated1 && updated2) {
            const date1 = new Date(updated1).getTime();
            const date2 = new Date(updated2).getTime();
            if (date1 > date2) return 'tauri_newer';
            if (date2 > date1) return 'fastify_newer';
        }

        // If timestamps are equal or missing but content differs, it's a conflict
        return 'conflict';
    };

    // Compare atomes
    const allIds = new Set([...tauriMap.keys(), ...fastifyMap.keys()]);

    for (const id of allIds) {
        const tauriAtome = tauriMap.get(id);
        const fastifyAtome = fastifyMap.get(id);

        // Check for soft deletes
        const tauriDeleted = tauriAtome?.deleted_at != null;
        const fastifyDeleted = fastifyAtome?.deleted_at != null;

        if (tauriAtome && !fastifyAtome) {
            // Only on Tauri (local)
            if (tauriDeleted) {
                // Already deleted, nothing to do
                result.synced.push({ id, tauri: tauriAtome, fastify: null, status: 'deleted_local_only' });
            } else {
                // Needs to be pushed
                result.onlyOnTauri.push(tauriAtome);
            }
        } else if (!tauriAtome && fastifyAtome) {
            // Only on Fastify (remote)
            if (fastifyDeleted) {
                // Already deleted, nothing to do
                result.synced.push({ id, tauri: null, fastify: fastifyAtome, status: 'deleted_remote_only' });
            } else {
                // Needs to be pulled
                result.onlyOnFastify.push(fastifyAtome);
            }
        } else if (tauriAtome && fastifyAtome) {
            // Exists on both - check for deletion propagation first
            if (tauriDeleted && !fastifyDeleted) {
                // Deleted on Tauri, not on Fastify - propagate deletion
                result.deletedOnTauri.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
            } else if (!tauriDeleted && fastifyDeleted) {
                // Deleted on Fastify, not on Tauri - propagate deletion
                result.deletedOnFastify.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
            } else if (tauriDeleted && fastifyDeleted) {
                // Both deleted - synced
                result.synced.push({ id, tauri: tauriAtome, fastify: fastifyAtome, status: 'both_deleted' });
            } else {
                // Neither deleted - compare content
                const comparison = compareAtomes(tauriAtome, fastifyAtome);

                switch (comparison) {
                    case 'equal':
                        result.synced.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
                        break;
                    case 'tauri_newer':
                        result.modifiedOnTauri.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
                        break;
                    case 'fastify_newer':
                        result.modifiedOnFastify.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
                        break;
                    case 'conflict':
                        result.conflicts.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
                        break;
                }
            }
        }
    }

    if (typeof callback === 'function') {
        callback(result);
    }

    return result;
}

/**
 * Synchronize atomes between Tauri (local) and Fastify (remote)
 * - Pushes local-only atomes to Fastify
 * - Pulls remote-only atomes to Tauri
 * - Updates based on most recent modification
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Sync results with success/failure counts
 */
async function sync_atomes(callback) {
    const result = {
        pushed: { success: 0, failed: 0, errors: [] },
        pulled: { success: 0, failed: 0, errors: [] },
        updated: { success: 0, failed: 0, errors: [] },
        conflicts: { count: 0, items: [] },
        alreadySynced: 0,
        error: null
    };

    // First, get the list of unsynced atomes
    let unsyncedResult;
    try {
        unsyncedResult = await list_unsynced_atomes();
        if (unsyncedResult.error) {
            result.error = unsyncedResult.error;
            if (typeof callback === 'function') callback(result);
            return result;
        }
    } catch (e) {
        result.error = 'Failed to list unsynced atomes: ' + e.message;
        if (typeof callback === 'function') callback(result);
        return result;
    }

    result.alreadySynced = unsyncedResult.synced.length;

    // 1. Push local-only atomes to Fastify
    for (const atome of unsyncedResult.onlyOnTauri) {
        try {
            const createResult = await FastifyAdapter.atome.create({
                id: atome.atome_id,
                type: atome.atome_type,
                ownerId: atome.owner_id,
                parentId: atome.parent_id,
                particles: atome.data || atome.particles || {}
            });

            if (createResult.ok || createResult.success) {
                result.pushed.success++;
            } else {
                result.pushed.failed++;
                result.pushed.errors.push({ id: atome.atome_id, error: createResult.error });
            }
        } catch (e) {
            result.pushed.failed++;
            result.pushed.errors.push({ id: atome.atome_id, error: e.message });
        }
    }

    // 2. Pull remote-only atomes to Tauri
    for (const atome of unsyncedResult.onlyOnFastify) {
        try {
            const createResult = await TauriAdapter.atome.create({
                id: atome.atome_id,
                type: atome.atome_type,
                ownerId: atome.owner_id,
                parentId: atome.parent_id,
                particles: atome.data || atome.particles || {}
            });

            if (createResult.ok || createResult.success) {
                result.pulled.success++;
            } else {
                result.pulled.failed++;
                result.pulled.errors.push({ id: atome.atome_id, error: createResult.error });
            }
        } catch (e) {
            result.pulled.failed++;
            result.pulled.errors.push({ id: atome.atome_id, error: e.message });
        }
    }

    // Helper function to extract particles from an atome object
    const extractParticles = (atome) => {
        if (atome.data && typeof atome.data === 'object' && Object.keys(atome.data).length > 0) {
            return atome.data;
        }
        if (atome.particles && typeof atome.particles === 'object' && Object.keys(atome.particles).length > 0) {
            return atome.particles;
        }

        const metadataFields = [
            'atome_id', 'atome_type', 'parent_id', 'owner_id', 'creator_id',
            'sync_status', 'created_at', 'updated_at', 'deleted_at', 'last_sync',
            'created_source', 'id', 'type', 'data', 'particles'
        ];

        const inlineParticles = {};
        for (const [key, value] of Object.entries(atome)) {
            if (!metadataFields.includes(key) && value !== null && value !== undefined) {
                inlineParticles[key] = value;
            }
        }
        return inlineParticles;
    };

    // 3. Update Fastify with newer Tauri modifications
    for (const item of unsyncedResult.modifiedOnTauri) {
        try {
            const particles = extractParticles(item.tauri);

            if (!particles || Object.keys(particles).length === 0) {
                result.updated.success++;
                continue;
            }

            const updateResult = await FastifyAdapter.atome.update(item.id, particles);

            if (updateResult.ok || updateResult.success) {
                result.updated.success++;
            } else {
                result.updated.failed++;
                result.updated.errors.push({ id: item.id, error: updateResult.error });
            }
        } catch (e) {
            result.updated.failed++;
            result.updated.errors.push({ id: item.id, error: e.message });
        }
    }

    // 4. Update Tauri with newer Fastify modifications
    for (const item of unsyncedResult.modifiedOnFastify) {
        try {
            const particles = extractParticles(item.fastify);

            if (!particles || Object.keys(particles).length === 0) {
                result.updated.success++;
                continue;
            }

            const updateResult = await TauriAdapter.atome.update(item.id, particles);

            if (updateResult.ok || updateResult.success) {
                result.updated.success++;
            } else {
                result.updated.failed++;
                result.updated.errors.push({ id: item.id, error: updateResult.error });
            }
        } catch (e) {
            result.updated.failed++;
            result.updated.errors.push({ id: item.id, error: e.message });
        }
    }

    // 5. Propagate deletions from Tauri to Fastify
    for (const item of unsyncedResult.deletedOnTauri) {
        try {
            const deleteResult = await FastifyAdapter.atome.softDelete(item.id);

            if (deleteResult.ok || deleteResult.success) {
                result.updated.success++;
            } else {
                result.updated.failed++;
                result.updated.errors.push({ id: item.id, error: deleteResult.error });
            }
        } catch (e) {
            result.updated.failed++;
            result.updated.errors.push({ id: item.id, error: e.message });
        }
    }

    // 6. Propagate deletions from Fastify to Tauri
    for (const item of unsyncedResult.deletedOnFastify) {
        try {
            const deleteResult = await TauriAdapter.atome.softDelete(item.id);

            if (deleteResult.ok || deleteResult.success) {
                result.updated.success++;
            } else {
                result.updated.failed++;
                result.updated.errors.push({ id: item.id, error: deleteResult.error });
            }
        } catch (e) {
            result.updated.failed++;
            result.updated.errors.push({ id: item.id, error: e.message });
        }
    }

    // 7. Report conflicts (don't auto-resolve, just report)
    result.conflicts.count = unsyncedResult.conflicts.length;
    result.conflicts.items = unsyncedResult.conflicts.map(c => c.id);

    if (typeof callback === 'function') {
        callback(result);
    }

    return result;
}

// ============================================
// PROJECT & ATOME MANAGEMENT FUNCTIONS
// ============================================

/**
 * Create a project (a project is an atome with type='project')
 * A project serves as an entry point to contain user's atomes
 * @param {string} projectName - Name of the project
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function create_project(projectName, callback) {
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Get current user to set as owner
    const currentUserResult = await current_user();
    const ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;

    if (!ownerId) {
        const error = 'No user logged in. Please log in first.';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    const projectData = {
        type: 'project',
        ownerId: ownerId,
        particles: {
            name: projectName,
            created_at: new Date().toISOString()
        }
    };

    // Create on Tauri
    try {
        const tauriResult = await TauriAdapter.atome.create(projectData);
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Create on Fastify
    try {
        const fastifyResult = await FastifyAdapter.atome.create(projectData);
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * List all projects for the current user - SECURE VERSION
 * Only returns projects owned by the currently logged-in user
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} List of projects from both backends
 */
async function list_projects(callback) {
    const results = {
        tauri: { projects: [], error: null },
        fastify: { projects: [], error: null }
    };

    // SECURITY: Verify user is logged in
    const currentUserResult = await current_user();
    const currentUserId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;

    if (!currentUserId || currentUserId === 'anonymous') {
        const error = 'SECURITY: No user logged in. Cannot list projects.';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    // Try Tauri - Server automatically filters by owner_id
    try {
        const tauriResult = await TauriAdapter.atome.list({ type: 'project' });
        if (tauriResult.ok || tauriResult.success) {
            const projects = tauriResult.atomes || tauriResult.data || [];
            // SECURITY: Double-check each project belongs to current user
            const userProjects = projects.filter(project => {
                const projectOwnerId = project.owner_id || project.ownerId || project.particles?.owner_id;
                return projectOwnerId === currentUserId;
            });
            results.tauri.projects = userProjects;
        } else {
            results.tauri.error = tauriResult.error;
        }
    } catch (e) {
        results.tauri.error = e.message;
    }

    // Try Fastify - Server automatically filters by owner_id
    try {
        const fastifyResult = await FastifyAdapter.atome.list({ type: 'project' });
        if (fastifyResult.ok || fastifyResult.success) {
            const projects = fastifyResult.atomes || fastifyResult.data || [];
            // SECURITY: Double-check each project belongs to current user
            const userProjects = projects.filter(project => {
                const projectOwnerId = project.owner_id || project.ownerId || project.particles?.owner_id;
                return projectOwnerId === currentUserId;
            });
            results.fastify.projects = userProjects;
        } else {
            results.fastify.error = fastifyResult.error;
        }
    } catch (e) {
        results.fastify.error = e.message;
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * Delete a project and all its contents (soft delete)
 * @param {string} projectId - ID of the project to delete
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function delete_project(projectId, callback) {
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    if (!projectId) {
        const error = 'No project ID provided';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    // Soft delete on Tauri
    try {
        const tauriResult = await TauriAdapter.atome.softDelete(projectId);
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Soft delete on Fastify
    try {
        const fastifyResult = await FastifyAdapter.atome.softDelete(projectId);
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * Create an atome within a project
 * @param {Object} options - Atome options { type, color, projectId, particles }
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function create_atome(options, callback) {
    // Handle both object and callback-only signatures
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    const atomeType = options.type || 'shape';
    const atomeColor = options.color || 'blue';
    const projectId = options.projectId || null;

    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Get current user
    const currentUserResult = await current_user();
    const ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;

    if (!ownerId) {
        const error = 'No user logged in. Please log in first.';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    const atomeData = {
        type: atomeType,
        ownerId: ownerId,
        parentId: projectId, // Link to project if provided
        particles: {
            color: atomeColor,
            created_at: new Date().toISOString(),
            ...options.particles
        }
    };

    // Create on Tauri
    try {
        const tauriResult = await TauriAdapter.atome.create(atomeData);
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Create on Fastify
    try {
        const fastifyResult = await FastifyAdapter.atome.create(atomeData);
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * List atomes, optionally filtered by project or type
 * @param {Object} options - Filter options { type, projectId }
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} List of atomes from both backends
 */
async function list_atomes(options = {}, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    const atomeType = options.type || null;

    const results = {
        tauri: { atomes: [], error: null },
        fastify: { atomes: [], error: null }
    };

    const queryOptions = atomeType ? { type: atomeType } : {};

    // Try Tauri
    try {
        const tauriResult = await TauriAdapter.atome.list(queryOptions);
        if (tauriResult.ok || tauriResult.success) {
            results.tauri.atomes = tauriResult.atomes || tauriResult.data || [];
        } else {
            results.tauri.error = tauriResult.error;
        }
    } catch (e) {
        results.tauri.error = e.message;
    }

    // Try Fastify
    try {
        const fastifyResult = await FastifyAdapter.atome.list(queryOptions);
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify.atomes = fastifyResult.atomes || fastifyResult.data || [];
        } else {
            results.fastify.error = fastifyResult.error;
        }
    } catch (e) {
        results.fastify.error = e.message;
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * Delete an atome (soft delete to preserve history)
 * @param {string} atomeId - ID of the atome to delete (REQUIRED)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function delete_atome(atomeId, callback) {
    // Handle callback-only call
    if (typeof atomeId === 'function') {
        callback = atomeId;
        atomeId = null;
    }

    // atomeId is required
    if (!atomeId) {
        const error = 'atomeId parameter is required';
        const results = {
            tauri: { success: false, data: null, error },
            fastify: { success: false, data: null, error }
        };
        if (typeof callback === 'function') callback(results);
        return results;
    }

    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Soft delete on Tauri
    try {
        const tauriResult = await TauriAdapter.atome.softDelete(atomeId);
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Soft delete on Fastify
    try {
        const fastifyResult = await FastifyAdapter.atome.softDelete(atomeId);
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * Alter an atome's particles (update with history tracking)
 * The particles_versions table stores each change for undo functionality
 * @param {string} atomeId - ID of the atome to alter (REQUIRED)
 * @param {Object} newParticles - New particle values to set/update (REQUIRED)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function alter_atome(atomeId, newParticles, callback) {
    // Handle callback as second argument
    if (typeof newParticles === 'function') {
        callback = newParticles;
        newParticles = null;
    }

    // Both atomeId and newParticles are required
    if (!atomeId || !newParticles || typeof newParticles !== 'object') {
        const error = !atomeId
            ? 'atomeId parameter is required'
            : 'newParticles object is required';
        const results = {
            tauri: { success: false, data: null, error },
            fastify: { success: false, data: null, error }
        };
        if (typeof callback === 'function') callback(results);
        return results;
    }

    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Update on Tauri (particles_versions are automatically updated in the backend)
    try {
        const tauriResult = await TauriAdapter.atome.update(atomeId, newParticles);
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Update on Fastify
    try {
        const fastifyResult = await FastifyAdapter.atome.update(atomeId, newParticles);
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * Get an atome with all its particles and history
 * @param {string} atomeId - ID of the atome to retrieve (REQUIRED)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Atome data with particles
 */
async function get_atome(atomeId, callback) {
    // Handle callback as first argument
    if (typeof atomeId === 'function') {
        callback = atomeId;
        atomeId = null;
    }

    if (!atomeId) {
        const error = 'atomeId parameter is required';
        if (typeof callback === 'function') callback({ error });
        return { error };
    }

    const results = {
        tauri: { atome: null, error: null },
        fastify: { atome: null, error: null }
    };

    // Try Tauri
    try {
        console.log('🔍 Calling TauriAdapter.atome.list to find atome ID:', atomeId);
        // FIX: Use list API instead of get API to find the atome
        const tauriResult = await TauriAdapter.atome.list({ id: atomeId });
        console.log('🔍 Tauri raw result:', tauriResult);
        console.log('🔍 Tauri result structure:', {
            hasAtomes: !!tauriResult.atomes,
            atomesLength: tauriResult.atomes?.length || 0,
            hasData: !!tauriResult.data,
            dataHasAtomes: !!tauriResult.data?.atomes,
            dataAtomesLength: tauriResult.data?.atomes?.length || 0,
            dataKeys: tauriResult.data ? Object.keys(tauriResult.data) : [],
            allKeys: Object.keys(tauriResult),
            fullResponse: tauriResult
        });

        if (tauriResult.ok || tauriResult.success) {
            // ENHANCED: More detailed extraction logic with debugging
            let extractedAtome = null;

            // Check if we actually have atomes before trying to extract
            if (tauriResult.atomes && Array.isArray(tauriResult.atomes)) {
                if (tauriResult.atomes.length > 0) {
                    extractedAtome = tauriResult.atomes[0];
                    console.log('🔍 Tauri: Found atome in .atomes[0]');
                } else {
                    console.log('🔍 Tauri: No atomes found in response (empty array)');
                    results.tauri.error = 'No atomes found with this ID';
                }
            } else if (tauriResult.data && tauriResult.data.atomes && Array.isArray(tauriResult.data.atomes)) {
                if (tauriResult.data.atomes.length > 0) {
                    extractedAtome = tauriResult.data.atomes[0];
                    console.log('🔍 Tauri: Found atome in .data.atomes[0]');
                } else {
                    console.log('🔍 Tauri: No atomes found in .data.atomes (empty array)');
                    results.tauri.error = 'No atomes found with this ID';
                }
            } else if (tauriResult.data && !tauriResult.data.atomes) {
                extractedAtome = tauriResult.data;
                console.log('🔍 Tauri: Using .data as atome');
            } else if (tauriResult.atome) {
                extractedAtome = tauriResult.atome;
                console.log('🔍 Tauri: Found atome in .atome');
            } else {
                console.log('🔍 Tauri: No atome data found in response structure');
                results.tauri.error = 'No atome data found in response';
            }

            if (extractedAtome) {
                console.log('🔍 Tauri: Extracted atome keys:', Object.keys(extractedAtome));
                console.log('🔍 Tauri: Extracted atome type:', extractedAtome.atome_type || extractedAtome.type);
                results.tauri.atome = extractedAtome;
            }
        } else {
            results.tauri.error = tauriResult.error;
        }
    } catch (e) {
        results.tauri.error = e.message;
    }

    // Try Fastify
    try {
        console.log('🔍 Calling FastifyAdapter.atome.list to find atome ID:', atomeId);
        // FIX: Use list API instead of get API to find the atome
        const fastifyResult = await FastifyAdapter.atome.list({ id: atomeId });
        console.log('🔍 Fastify raw result:', fastifyResult);
        console.log('🔍 Fastify result structure:', {
            hasAtomes: !!fastifyResult.atomes,
            atomesLength: fastifyResult.atomes?.length || 0,
            hasData: !!fastifyResult.data,
            dataHasAtomes: !!fastifyResult.data?.atomes,
            dataAtomesLength: fastifyResult.data?.atomes?.length || 0,
            dataKeys: fastifyResult.data ? Object.keys(fastifyResult.data) : [],
            allKeys: Object.keys(fastifyResult),
            fullResponse: fastifyResult
        });

        if (fastifyResult.ok || fastifyResult.success) {
            // ENHANCED: More detailed extraction logic with debugging
            let extractedAtome = null;

            // Check if we actually have atomes before trying to extract
            if (fastifyResult.atomes && Array.isArray(fastifyResult.atomes)) {
                if (fastifyResult.atomes.length > 0) {
                    extractedAtome = fastifyResult.atomes[0];
                    console.log('🔍 Fastify: Found atome in .atomes[0]');
                } else {
                    console.log('🔍 Fastify: No atomes found in response (empty array)');
                    results.fastify.error = 'No atomes found with this ID';
                }
            } else if (fastifyResult.data && fastifyResult.data.atomes && Array.isArray(fastifyResult.data.atomes)) {
                if (fastifyResult.data.atomes.length > 0) {
                    extractedAtome = fastifyResult.data.atomes[0];
                    console.log('🔍 Fastify: Found atome in .data.atomes[0]');
                } else {
                    console.log('🔍 Fastify: No atomes found in .data.atomes (empty array)');
                    results.fastify.error = 'No atomes found with this ID';
                }
            } else if (fastifyResult.data && !fastifyResult.data.atomes) {
                extractedAtome = fastifyResult.data;
                console.log('🔍 Fastify: Using .data as atome');
            } else if (fastifyResult.atome) {
                extractedAtome = fastifyResult.atome;
                console.log('🔍 Fastify: Found atome in .atome');
            } else {
                console.log('🔍 Fastify: No atome data found in response structure');
                results.fastify.error = 'No atome data found in response';
            }

            if (extractedAtome) {
                console.log('🔍 Fastify: Extracted atome keys:', Object.keys(extractedAtome));
                console.log('🔍 Fastify: Extracted atome type:', extractedAtome.atome_type || extractedAtome.type);
                results.fastify.atome = extractedAtome;
            }
        } else {
            results.fastify.error = fastifyResult.error;
        }
    } catch (e) {
        results.fastify.error = e.message;
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * Share one or more Atomes with another user
 * @param {string} phoneNumber - Target user's phone number
 * @param {string|Array<string>} atomeIds - Atome IDs to share (single ID or array)
 * @param {Object} sharePermissions - Global permissions { read: boolean, alter: boolean, delete: boolean, create: boolean }
 * @param {string} sharingMode - 'real-time' or 'validation-based'
 * @param {Object} propertyOverrides - Optional property-level permission overrides
 * @param {string} [currentProjectId] - ID of the current project on screen (optional)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function share_atome(phoneNumber, atomeIds, sharePermissions, sharingMode, propertyOverrides = {}, currentProjectId = null, callback) {
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Validate inputs
    if (!phoneNumber) {
        const error = 'Phone number is required';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    if (!atomeIds || (Array.isArray(atomeIds) && atomeIds.length === 0)) {
        const error = 'At least one Atome ID is required';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    if (!sharePermissions || typeof sharePermissions !== 'object') {
        const error = 'Share permissions object is required';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    if (!sharingMode || !['real-time', 'validation-based'].includes(sharingMode)) {
        const error = 'Sharing mode must be "real-time" or "validation-based"';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    // Normalize atomeIds to array
    const normalizedAtomeIds = Array.isArray(atomeIds) ? atomeIds : [atomeIds];

    // Validate permissions structure
    const validPermissions = ['read', 'alter', 'delete', 'create'];
    for (const permission of validPermissions) {
        if (sharePermissions[permission] === undefined) {
            sharePermissions[permission] = false;
        }
    }

    const shareRequest = {
        targetPhone: phoneNumber,
        atomeIds: normalizedAtomeIds,
        permissions: sharePermissions,
        mode: sharingMode,
        propertyOverrides: propertyOverrides || {},
        timestamp: new Date().toISOString(),
        requestId: 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };

    console.log('🔄 Creating sharing request:', shareRequest);

    // First, get the target user by phone number to get their user ID
    let targetUserId = null;
    try {
        console.log('🔍 Searching for user with phone:', phoneNumber);
        const tauriUsers = await TauriAdapter.atome.list({ type: 'user' });
        const fastifyUsers = await FastifyAdapter.atome.list({ type: 'user' });

        console.log('🔍 Tauri users:', tauriUsers.atomes?.length || 0);
        console.log('🔍 Fastify users:', fastifyUsers.atomes?.length || 0);

        const allUsers = [
            ...(tauriUsers.atomes || []),
            ...(fastifyUsers.atomes || [])
        ];

        console.log('🔍 All users found:', allUsers.length);
        allUsers.forEach(user => {
            console.log('  User:', user.username || 'no-name', 'Phone:', user.phone || user.data?.phone || user.particles?.phone || 'no-phone');
        });

        const targetUser = allUsers.find(user =>
            (user.phone || user.data?.phone || user.particles?.phone) === phoneNumber
        );

        if (targetUser) {
            targetUserId = targetUser.atome_id || targetUser.id;
            const targetUsername = targetUser.username || targetUser.data?.username || targetUser.particles?.username || 'unknown';
            console.log('✅ Found target user:', targetUsername, 'ID:', targetUserId.substring(0, 8) + '...');
        } else {
            const error = 'Target user not found with phone: ' + phoneNumber;
            console.error('❌', error);
            results.tauri.error = error;
            results.fastify.error = error;
            if (typeof callback === 'function') callback(results);
            return results;
        }
    } catch (e) {
        const error = 'Failed to find target user: ' + e.message;
        console.error('❌', error);
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    // Get current user as the sharer
    const currentUserResult = await current_user();
    const sharerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
    console.log('🔍 Sharer ID:', sharerId?.substring(0, 8) + '...');

    // ENHANCED: Determine target project for shared atomes
    let targetProjectId = null;

    if (currentProjectId) {
        // Use provided current project ID
        targetProjectId = currentProjectId;
        console.log('📁 Using provided current project ID:', targetProjectId.substring(0, 8) + '...');
    } else {
        // Try to find the target user's current/default project
        try {
            const targetUserProjects = await list_projects();
            const allProjects = [...(targetUserProjects.tauri.projects || []), ...(targetUserProjects.fastify.projects || [])];

            // Filter projects owned by target user
            const targetUserProjectsList = allProjects.filter(project => {
                const projectOwnerId = project.owner_id || project.ownerId || project.particles?.owner_id;
                return projectOwnerId === targetUserId;
            });

            if (targetUserProjectsList.length > 0) {
                // Use the first project found for the target user
                targetProjectId = targetUserProjectsList[0].atome_id || targetUserProjectsList[0].id;
                console.log('📁 Found target user project:', targetUserProjectsList[0].particles?.name || 'unnamed', 'ID:', targetProjectId.substring(0, 8) + '...');
            } else {
                // No project found - implement inbox system later
                console.log('📬 INBOX SYSTEM: No current project for target user. Shared atomes will be placed in inbox.');
                console.log('📬 TODO: Implement inbox/mailbox system for orphaned shared atomes');
                console.log('📬 For now, creating standalone shared atomes (parentId: null)');
                targetProjectId = null;
            }
        } catch (e) {
            console.warn('⚠️ Could not determine target project:', e.message);
            console.log('📬 INBOX SYSTEM: Fallback to inbox due to project lookup error');
            targetProjectId = null;
        }
    }

    // Now share each atome by creating copies for the target user
    const sharedAtomes = [];

    for (const atomeId of normalizedAtomeIds) {
        try {
            console.log('🔄 Sharing atome:', atomeId.substring(0, 8) + '...');

            // Get the original atome
            const originalAtome = await get_atome(atomeId);
            let atomeData = null;

            if (originalAtome.tauri.atome) {
                atomeData = originalAtome.tauri.atome;
                console.log('✅ Found atome on Tauri');
            } else if (originalAtome.fastify.atome) {
                atomeData = originalAtome.fastify.atome;
                console.log('✅ Found atome on Fastify');
            }

            if (!atomeData) {
                console.warn('⚠️ Could not find atome:', atomeId);
                continue;
            }

            console.log('🔍 Raw atome data structure:', Object.keys(atomeData));
            console.log('🔍 Original atome type:', atomeData.atome_type || atomeData.type);

            // Extract particles using the same logic as in the comparison function
            const extractParticles = (atome) => {
                // If data field exists and has content, use it
                if (atome.data && typeof atome.data === 'object' && Object.keys(atome.data).length > 0) {
                    return atome.data;
                }
                // If particles field exists and has content, use it
                if (atome.particles && typeof atome.particles === 'object' && Object.keys(atome.particles).length > 0) {
                    return atome.particles;
                }

                // Otherwise, extract inline particles (all fields except metadata)
                const metadataFields = [
                    'atome_id', 'atome_type', 'parent_id', 'owner_id', 'creator_id',
                    'sync_status', 'created_at', 'updated_at', 'deleted_at', 'last_sync',
                    'created_source', 'id', 'type', 'data', 'particles'
                ];

                const inlineParticles = {};
                for (const [key, value] of Object.entries(atome)) {
                    if (!metadataFields.includes(key) && value !== null && value !== undefined) {
                        inlineParticles[key] = value;
                    }
                }
                return inlineParticles;
            };

            const originalParticles = extractParticles(atomeData);
            console.log('🔍 Extracted particles:', Object.keys(originalParticles));
            console.log('🔍 Particles content:', originalParticles);

            // Create shared copy for target user with PROJECT ASSIGNMENT
            const sharedAtomeData = {
                type: atomeData.atome_type || atomeData.type || 'shape',
                ownerId: targetUserId,
                parentId: targetProjectId, // FIXED: Use target project ID instead of null
                particles: {
                    // Copy all original particles
                    ...originalParticles,
                    // Add sharing metadata
                    sharedFrom: sharerId,
                    sharedAt: new Date().toISOString(),
                    originalAtomeId: atomeId,
                    isShared: true,
                    // Add project assignment info
                    assignedToProject: targetProjectId ? true : false,
                    inboxItem: targetProjectId ? false : true
                }
            };

            console.log('🔄 Creating shared copy with type:', sharedAtomeData.type);
            console.log('🔄 For user ID:', targetUserId.substring(0, 8) + '...');
            console.log('📁 Assigned to project:', targetProjectId ? targetProjectId.substring(0, 8) + '...' : 'INBOX (no project)');

            // Create the shared atome copy on both backends
            let createdOnTauri = false;
            let createdOnFastify = false;

            try {
                const tauriResult = await TauriAdapter.atome.create(sharedAtomeData);
                if (tauriResult.ok || tauriResult.success) {
                    console.log('✅ Created shared atome copy on Tauri');
                    createdOnTauri = true;
                } else {
                    console.error('❌ Tauri creation failed:', tauriResult.error);
                }
            } catch (e) {
                console.error('❌ Failed to create Tauri copy:', e.message);
            }

            try {
                const fastifyResult = await FastifyAdapter.atome.create(sharedAtomeData);
                if (fastifyResult.ok || fastifyResult.success) {
                    console.log('✅ Created shared atome copy on Fastify');
                    createdOnFastify = true;
                } else {
                    console.error('❌ Fastify creation failed:', fastifyResult.error);
                }
            } catch (e) {
                console.error('❌ Failed to create Fastify copy:', e.message);
            }

            if (createdOnTauri || createdOnFastify) {
                sharedAtomes.push({
                    originalId: atomeId,
                    sharedData: sharedAtomeData,
                    createdOnTauri,
                    createdOnFastify
                });
                console.log('✅ Atome shared successfully');
            } else {
                console.error('❌ Failed to create shared atome on both backends');
            }

        } catch (e) {
            console.error('❌ Failed to share atome:', atomeId, e.message);
        }
    }

    console.log('🎯 Total shared atomes:', sharedAtomes.length + '/' + normalizedAtomeIds.length);

    // Try Tauri first (local SQLite) - Create sharing request record
    try {
        const tauriResult = await TauriAdapter.atome.create({
            type: 'share_request',
            particles: {
                ...shareRequest,
                sharedAtomes: sharedAtomes,
                targetUserId: targetUserId,
                status: 'completed'
            }
        });
        console.log('🔍 Tauri sharing result:', tauriResult);

        if (tauriResult.ok || tauriResult.success) {
            results.tauri = {
                success: true,
                data: tauriResult,
                shareRequest: shareRequest,
                sharedAtomes: sharedAtomes,
                error: null
            };
        } else {
            results.tauri = {
                success: false,
                data: null,
                error: tauriResult.error || 'Tauri sharing failed'
            };
        }
    } catch (e) {
        console.error('❌ Tauri sharing error:', e);
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Try Fastify (LibSQL) - Create sharing request record
    try {
        const fastifyResult = await FastifyAdapter.atome.create({
            type: 'share_request',
            particles: {
                ...shareRequest,
                sharedAtomes: sharedAtomes,
                targetUserId: targetUserId,
                status: 'completed'
            }
        });
        console.log('🔍 Fastify sharing result:', fastifyResult);

        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = {
                success: true,
                data: fastifyResult,
                shareRequest: shareRequest,
                sharedAtomes: sharedAtomes,
                error: null
            };
        } else {
            results.fastify = {
                success: false,
                data: null,
                error: fastifyResult.error || 'Fastify sharing failed'
            };
        }
    } catch (e) {
        console.error('❌ Fastify sharing error:', e);
        results.fastify = { success: false, data: null, error: e.message };
    }

    // Log comprehensive sharing request details
    if (results.tauri.success || results.fastify.success) {
        console.log('✅ Sharing completed successfully');
        console.log('📱 Target:', phoneNumber, '(' + targetUserId.substring(0, 8) + '...)');
        console.log('🎯 Atomes shared:', sharedAtomes.length + '/' + normalizedAtomeIds.length);
        console.log('� Project assignment:', targetProjectId ? targetProjectId.substring(0, 8) + '...' : 'INBOX SYSTEM');
        console.log('🔐 Permissions:', Object.entries(sharePermissions)
            .filter(([k, v]) => v)
            .map(([k, v]) => k)
            .join(', ') || 'none');
        console.log('🔄 Mode:', sharingMode);
        if (targetProjectId) {
            console.log('📋 Shared atomes now available in target user\'s project');
        } else {
            console.log('📬 Shared atomes placed in inbox (no current project)');
        }
        if (Object.keys(propertyOverrides).length > 0) {
            console.log('⚙️ Overrides:', Object.keys(propertyOverrides).length, 'properties');
        }
    } else {
        console.error('❌ Sharing failed on both backends');
        console.error('   Tauri error:', results.tauri.error);
        console.error('   Fastify error:', results.fastify.error);
    }

    if (typeof callback === 'function') callback(results);
    return results;
}


// ============================================
// ADOLE API EXPORTS
// ============================================

export const AdoleAPI = {
    auth: {
        create: create_user,
        login: log_user,
        logout: unlog_user,
        current: current_user,
        delete: delete_user,
        list: user_list
    },
    projects: {
        create: create_project,
        list: list_projects,
        delete: delete_project,
        // Current project management
        getCurrent: get_current_project,
        getCurrentId: get_current_project_id,
        setCurrent: set_current_project,
        loadSaved: load_saved_current_project
    },
    atomes: {
        create: create_atome,
        list: list_atomes,
        get: get_atome,
        delete: delete_atome,
        alter: alter_atome
    },
    sharing: {
        share: share_atome
    },
    sync: {
        sync: sync_atomes,
        listUnsynced: list_unsynced_atomes
    },
    debug: {
        listTables: list_tables
    }
};

export default AdoleAPI;
