

// ============================================
// ADOLE v3.0 - WebSocket API Functions
// ============================================

import { TauriAdapter, FastifyAdapter, CONFIG } from './adole.js';

function normalizeAtomeRecord(raw) {
    if (!raw || typeof raw !== 'object') return raw;

    const particlesFromParticlesField = (raw.particles && typeof raw.particles === 'object')
        ? raw.particles
        : null;

    // Tauri returns dynamic properties under `data` (legacy naming).
    // Fastify typically returns them flattened at top-level.
    const particlesFromDataField = (!particlesFromParticlesField && raw.data && typeof raw.data === 'object')
        ? raw.data
        : null;

    const coreKeys = new Set([
        'atome_id', 'atome_type', 'parent_id', 'owner_id', 'creator_id',
        'created_at', 'updated_at', 'deleted_at',
        // common aliases
        'id', 'type', 'kind', 'parent', 'parentId', 'owner', 'ownerId', 'userId',
        // response/meta
        'data', 'particles', 'atomes', 'count'
    ]);

    // Fastify WS list flattens particles at top-level (e.g. atome.left/top/color).
    // Rehydrate them into `particles` so UI persistence works.
    const particles = particlesFromParticlesField
        ? { ...particlesFromParticlesField }
        : (particlesFromDataField ? { ...particlesFromDataField } : {});

    // If both exist, merge them (prefer explicit `particles` over `data`).
    if (particlesFromParticlesField && raw.data && typeof raw.data === 'object') {
        for (const [k, v] of Object.entries(raw.data)) {
            if (particles[k] === undefined) particles[k] = v;
        }
    }

    for (const key of Object.keys(raw)) {
        if (coreKeys.has(key)) continue;
        const val = raw[key];
        if (val === undefined) continue;
        particles[key] = val;
    }

    return {
        ...raw,
        id: raw.id || raw.atome_id,
        atome_id: raw.atome_id || raw.id,
        type: raw.type || raw.atome_type,
        atome_type: raw.atome_type || raw.type,
        parentId: raw.parentId || raw.parent_id || raw.parent,
        parent_id: raw.parent_id || raw.parentId || raw.parent,
        ownerId: raw.ownerId || raw.owner_id || raw.owner || raw.userId,
        owner_id: raw.owner_id || raw.ownerId || raw.owner || raw.userId,
        particles
    };
}

// ============================================
// CURRENT STATE (Project, User, Machine)
// ============================================

// Global current project state (accessible everywhere)
let _currentProjectId = null;
let _currentProjectName = null;

// Global current user state
let _currentUserId = null;
let _currentUserName = null;
let _currentUserPhone = null;

// Global current machine state
let _currentMachineId = null;
let _currentMachinePlatform = null;

// Machine ID key in localStorage
const MACHINE_ID_KEY = 'squirrel_machine_id';

// Also expose on window for easy access
if (typeof window !== 'undefined') {
    window.__currentProject = {
        get id() { return _currentProjectId; },
        get name() { return _currentProjectName; }
    };

    window.__currentUser = {
        get id() { return _currentUserId; },
        get name() { return _currentUserName; },
        get phone() { return _currentUserPhone; }
    };

    window.__currentMachine = {
        get id() { return _currentMachineId; },
        get platform() { return _currentMachinePlatform; }
    };
}

// ============================================
// MACHINE IDENTIFICATION
// ============================================

/**
 * Detect the current platform
 * @returns {string} Platform identifier
 */
function detectPlatform() {
    if (typeof window === 'undefined') return 'node';

    const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    const userAgent = navigator.userAgent || '';

    if (isTauri) {
        if (/Mac/.test(userAgent)) return 'tauri_mac';
        if (/Win/.test(userAgent)) return 'tauri_windows';
        if (/Linux/.test(userAgent)) return 'tauri_linux';
        if (/iPhone|iPad/.test(userAgent)) return 'tauri_ios';
        if (/Android/.test(userAgent)) return 'tauri_android';
        return 'tauri_unknown';
    }

    if (/iPhone|iPad/.test(userAgent)) return 'safari_ios';
    if (/Android/.test(userAgent)) return 'browser_android';
    if (/Mac/.test(userAgent)) return 'safari_mac';
    if (/Win/.test(userAgent)) return 'browser_windows';
    if (/Linux/.test(userAgent)) return 'browser_linux';

    return 'browser_unknown';
}

/**
 * Get or create a unique machine ID
 * Stored in localStorage, persists across sessions
 * @returns {string} Machine ID (UUID format)
 */
function getOrCreateMachineId() {
    if (typeof localStorage === 'undefined') {
        return 'no_storage_' + Date.now();
    }

    let machineId = localStorage.getItem(MACHINE_ID_KEY);

    if (!machineId) {
        // Generate new UUID v4
        machineId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        localStorage.setItem(MACHINE_ID_KEY, machineId);
        console.log(`[AdoleAPI] New machine ID generated: ${machineId.substring(0, 8)}...`);
    }

    return machineId;
}

/**
 * Get current machine info
 * @returns {{id: string, platform: string}}
 */
function get_current_machine() {
    if (!_currentMachineId) {
        _currentMachineId = getOrCreateMachineId();
        _currentMachinePlatform = detectPlatform();
    }
    return {
        id: _currentMachineId,
        platform: _currentMachinePlatform
    };
}

/**
 * Register or update machine in database
 * Called at startup and login
 * @param {string} [userId] - User ID to associate with this machine
 * @returns {Promise<boolean>} Success status
 */
async function register_machine(userId = null) {
    const machineId = getOrCreateMachineId();
    const platform = detectPlatform();

    _currentMachineId = machineId;
    _currentMachinePlatform = platform;

    const particleData = {
        platform: platform,
        last_seen: new Date().toISOString(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    };

    if (userId) {
        particleData.last_user_id = userId;
        particleData.last_login = new Date().toISOString();
    }

    try {
        // Try to create machine atome if not exists, or update it
        // First try to get existing machine
        const existingResult = await get_atome(machineId);
        const exists = existingResult?.tauri?.success || existingResult?.fastify?.success;

        if (exists) {
            // Update existing machine
            try { await TauriAdapter.atome.alter(machineId, particleData); } catch (e) { }
            try { await FastifyAdapter.atome.alter(machineId, particleData); } catch (e) { }
            console.log(`[AdoleAPI] Machine updated: ${machineId.substring(0, 8)}... (${platform})`);
        } else {
            // Create new machine atome
            try {
                await TauriAdapter.atome.create({
                    atomeId: machineId,
                    atomeType: 'machine',
                    parentId: null,
                    data: particleData
                });
            } catch (e) {
                console.warn('[AdoleAPI] Tauri create machine failed:', e.message);
            }

            try {
                await FastifyAdapter.atome.create({
                    atomeId: machineId,
                    atomeType: 'machine',
                    parentId: null,
                    data: particleData
                });
            } catch (e) {
                console.warn('[AdoleAPI] Fastify create machine failed:', e.message);
            }
            console.log(`[AdoleAPI] Machine registered: ${machineId.substring(0, 8)}... (${platform})`);
        }

        return true;
    } catch (e) {
        console.error('[AdoleAPI] Failed to register machine:', e);
        return false;
    }
}

/**
 * Get last user who logged in on this machine
 * @returns {Promise<{userId: string|null, lastLogin: string|null}>}
 */
async function get_machine_last_user() {
    const machineId = getOrCreateMachineId();

    try {
        const result = await get_atome(machineId);
        const particles = result?.tauri?.data?.particles ||
            result?.fastify?.data?.particles ||
            result?.tauri?.atome?.particles ||
            result?.fastify?.atome?.particles ||
            {};

        return {
            userId: particles.last_user_id || null,
            lastLogin: particles.last_login || null
        };
    } catch (e) {
        console.warn('[AdoleAPI] Could not get machine last user:', e.message);
        return { userId: null, lastLogin: null };
    }
}

// ============================================
// CURRENT USER STATE
// ============================================

/**
 * Get current user info from memory
 * @returns {{id: string|null, name: string|null, phone: string|null}}
 */
function get_current_user_info() {
    return {
        id: _currentUserId,
        name: _currentUserName,
        phone: _currentUserPhone
    };
}

/**
 * Set current user in memory and optionally persist machine association
 * @param {string} userId - User ID
 * @param {string} [userName] - Username
 * @param {string} [userPhone] - Phone number
 * @param {boolean} [persistMachine=true] - Whether to update machine's last_user
 * @returns {Promise<boolean>}
 */
async function set_current_user_state(userId, userName = null, userPhone = null, persistMachine = true) {
    _currentUserId = userId;
    _currentUserName = userName;
    _currentUserPhone = userPhone;

    console.log(`[AdoleAPI] Current user set: ${userName || 'unnamed'} (${userId ? userId.substring(0, 8) + '...' : 'none'})`);

    if (persistMachine && userId) {
        // Update machine with this user
        await register_machine(userId);

        // Update user with this machine
        const machineId = getOrCreateMachineId();
        const particleData = {
            current_machine_id: machineId,
            last_machine_login: new Date().toISOString()
        };

        try {
            await TauriAdapter.atome.alter(userId, particleData);
        } catch (e) { }

        try {
            await FastifyAdapter.atome.alter(userId, particleData);
        } catch (e) { }

        console.log(`[AdoleAPI] User-machine association updated`);
    }

    return true;
}

/**
 * Try to auto-login based on machine's last user
 * Called at app startup before manual login
 * @returns {Promise<{success: boolean, userId: string|null, userName: string|null}>}
 */
async function try_auto_login() {
    try {
        // First check if already logged in via token
        const currentResult = await current_user();
        if (currentResult.logged && currentResult.user) {
            const user = currentResult.user;
            await set_current_user_state(
                user.user_id || user.id,
                user.username,
                user.phone,
                true
            );
            console.log(`[AdoleAPI] Already logged in: ${user.username}`);
            return { success: true, userId: user.user_id || user.id, userName: user.username };
        }

        // Check machine's last user
        const machineUser = await get_machine_last_user();
        if (machineUser.userId) {
            console.log(`[AdoleAPI] Machine's last user: ${machineUser.userId.substring(0, 8)}... (${machineUser.lastLogin})`);
            // Note: We don't auto-login here, just return the info
            // The app can decide whether to auto-login or show login screen
            return { success: false, userId: machineUser.userId, userName: null, hint: 'last_user_known' };
        }

        return { success: false, userId: null, userName: null };
    } catch (e) {
        console.warn('[AdoleAPI] Auto-login check failed:', e.message);
        return { success: false, userId: null, userName: null };
    }
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
 * @param {Object} [options] - Additional options
 * @param {string} [options.visibility='private'] - Account visibility: 'public' or 'private'
 *        - 'public': User appears in user_list, others can see phone and username
 *        - 'private': User is hidden, must be contacted by phone number directly
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function create_user(phone, password, username, options = {}, callback) {
    // Handle legacy signature where 4th param is callback
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    const visibility = options.visibility || 'public';

    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    // Try Tauri first (local SQLite)
    try {
        const tauriResult = await TauriAdapter.auth.register({
            phone,
            password,
            username,
            visibility
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
            username,
            visibility
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
 * Change user account visibility
 * @param {string} visibility - New visibility: 'public' or 'private'
 *        - 'public': User appears in user_list, others can see phone and username
 *        - 'private': User is hidden, must be contacted by phone number directly
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function set_user_visibility(visibility, callback) {
    const normalizedVisibility = (visibility === 'public') ? 'public' : 'private';
    const userId = _currentUserId;

    if (!userId) {
        const error = { success: false, error: 'No user logged in' };
        if (typeof callback === 'function') callback(error);
        return { tauri: error, fastify: error };
    }

    const results = {
        tauri: { success: false, error: null },
        fastify: { success: false, error: null }
    };

    // Update visibility particle on user atome
    // Try Tauri
    try {
        const tauriResult = await TauriAdapter.atome.alter({
            atomeId: userId,
            particles: { visibility: normalizedVisibility }
        });
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, error: null };
        } else {
            results.tauri = { success: false, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, error: e.message };
    }

    // Try Fastify
    try {
        const fastifyResult = await FastifyAdapter.atome.alter({
            atomeId: userId,
            particles: { visibility: normalizedVisibility }
        });
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, error: null };
        } else {
            results.fastify = { success: false, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, error: e.message };
    }

    if (results.tauri.success || results.fastify.success) {
        console.log(`[AdoleAPI] User visibility changed to: ${normalizedVisibility}`);
    }

    if (typeof callback === 'function') callback(results);
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

    // If login succeeded, update current user state and machine association
    if (results.tauri.success || results.fastify.success) {
        const userData = results.tauri.data?.user || results.fastify.data?.user || {};
        const userId = userData.user_id || userData.id || userData.userId;
        const userName = userData.username || username;
        const userPhone = userData.phone || phone;

        if (userId) {
            await set_current_user_state(userId, userName, userPhone, true);
        }
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
    // Uses ownerId: "*" to get ALL atomes, not just current user's
    const fetchAllAtomes = async (adapter, name) => {
        const allAtomes = [];
        for (const type of atomeTypes) {
            try {
                // Include deleted atomes for sync comparison
                // Use ownerId: "*" to get all atomes regardless of owner
                const result = await adapter.atome.list({ type, includeDeleted: true, ownerId: '*' });
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

    // Helper: extract particles from an atome object
    // - Prefers atome.data / atome.particles when present
    // - Falls back to inline fields (Fastify list returns particles inline)
    const extractParticles = (atome) => {
        if (!atome || typeof atome !== 'object') return {};

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

    // Topological sort helper - orders atomes so parents/owners come before children
    const topologicalSort = (atomes) => {
        // Build lookup map
        const atomeMap = new Map();
        atomes.forEach(a => {
            const id = a.atome_id || a.id;
            atomeMap.set(id, a);
        });

        // Priority order by type (users first, then projects, then others)
        const typePriority = {
            'user': 0,
            'tenant': 1,
            'project': 2
        };

        // Calculate depth for each atome based on dependencies
        const getDepth = (atome, visited = new Set()) => {
            const id = atome.atome_id || atome.id;
            if (visited.has(id)) return 0; // Prevent cycles
            visited.add(id);

            let depth = 0;

            // Check parent dependency
            const parentId = atome.parent_id || atome.parentId;
            if (parentId && atomeMap.has(parentId)) {
                depth = Math.max(depth, 1 + getDepth(atomeMap.get(parentId), visited));
            }

            // Check owner dependency
            const ownerId = atome.owner_id || atome.ownerId;
            if (ownerId && atomeMap.has(ownerId)) {
                depth = Math.max(depth, 1 + getDepth(atomeMap.get(ownerId), visited));
            }

            return depth;
        };

        // Sort: first by type priority, then by depth (roots first)
        return [...atomes].sort((a, b) => {
            const typeA = a.atome_type || a.type || 'generic';
            const typeB = b.atome_type || b.type || 'generic';
            const priorityA = typePriority[typeA] ?? 10;
            const priorityB = typePriority[typeB] ?? 10;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            const depthA = getDepth(a);
            const depthB = getDepth(b);
            return depthA - depthB;
        });
    };

    // 1. Push local-only atomes to Fastify (in topological order)
    const sortedToPush = topologicalSort(unsyncedResult.onlyOnTauri);
    console.log('[sync_atomes] Push order:', sortedToPush.map(a => `${a.atome_type}:${(a.atome_id || a.id).substring(0, 8)}`).join(' → '));

    for (const atome of sortedToPush) {
        try {
            const particles = extractParticles(atome);
            const createResult = await FastifyAdapter.atome.create({
                id: atome.atome_id,
                type: atome.atome_type,
                ownerId: atome.owner_id,
                parentId: atome.parent_id,
                particles
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

    // 2. Pull remote-only atomes to Tauri (in topological order)
    const sortedToPull = topologicalSort(unsyncedResult.onlyOnFastify);
    console.log('[sync_atomes] Pull order:', sortedToPull.map(a => `${a.atome_type}:${(a.atome_id || a.id).substring(0, 8)}`).join(' → '));

    for (const atome of sortedToPull) {
        try {
            const particles = extractParticles(atome);
            const createResult = await TauriAdapter.atome.create({
                id: atome.atome_id,
                type: atome.atome_type,
                ownerId: atome.owner_id,
                parentId: atome.parent_id,
                particles
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
    const currentUserId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;

    if (!currentUserId) {
        const error = 'No user logged in. Please log in first.';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    // Use provided ownerId if specified, otherwise use current user
    // This allows creating atomes for other users (e.g., messages to recipients)
    const ownerId = options.ownerId || currentUserId;

    const atomeData = {
        id: options.id || undefined, // Use provided ID if specified
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
    let ownerId = options.ownerId || null;

    const results = {
        tauri: { atomes: [], error: null },
        fastify: { atomes: [], error: null }
    };

    // Default behavior: list current user's atomes.
    // Fastify WS list requires ownerId/userId or atomeType; otherwise it returns [].
    // Exception: when listing global users, do not force owner filtering.
    if (!ownerId && atomeType !== 'user') {
        try {
            const currentUserResult = await current_user();
            const currentUserId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
            if (currentUserId) {
                ownerId = currentUserId;
            }
        } catch (e) {
            // Silent; will fallback to server behavior
        }
    }

    // Build query options with type and ownerId if provided
    const queryOptions = {};
    if (atomeType) queryOptions.type = atomeType;
    if (ownerId) queryOptions.owner_id = ownerId;

    // Try Tauri
    try {
        const tauriResult = await TauriAdapter.atome.list(queryOptions);
        if (tauriResult.ok || tauriResult.success) {
            const rawAtomes = tauriResult.atomes || tauriResult.data || [];
            results.tauri.atomes = Array.isArray(rawAtomes) ? rawAtomes.map(normalizeAtomeRecord) : [];
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
            const rawAtomes = fastifyResult.atomes || fastifyResult.data || [];
            results.fastify.atomes = Array.isArray(rawAtomes) ? rawAtomes.map(normalizeAtomeRecord) : [];
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
        console.log('🔍 Calling TauriAdapter.atome.get for atome ID:', atomeId);
        // Use the proper get API to find the atome by ID
        const tauriResult = await TauriAdapter.atome.get(atomeId);
        console.log('🔍 Tauri raw result:', tauriResult);
        console.log('🔍 Tauri result structure:', {
            hasAtome: !!tauriResult.atome,
            hasData: !!tauriResult.data,
            allKeys: Object.keys(tauriResult)
        });

        if (tauriResult.ok || tauriResult.success) {
            // Extract atome from response
            let extractedAtome = null;

            if (tauriResult.atome) {
                extractedAtome = tauriResult.atome;
                console.log('🔍 Tauri: Found atome in .atome');
            } else if (tauriResult.data && typeof tauriResult.data === 'object') {
                extractedAtome = tauriResult.data;
                console.log('🔍 Tauri: Found atome in .data');
            }

            if (extractedAtome) {
                console.log('🔍 Tauri: Extracted atome type:', extractedAtome.atome_type || extractedAtome.type);
                results.tauri.atome = extractedAtome;
                results.tauri.success = true;
            } else {
                console.log('🔍 Tauri: No atome found with ID:', atomeId);
                results.tauri.error = 'Atome not found';
            }
        } else {
            results.tauri.error = tauriResult.error || 'Atome not found';
        }
    } catch (e) {
        results.tauri.error = e.message;
    }

    // Try Fastify
    try {
        console.log('🔍 Calling FastifyAdapter.atome.get for atome ID:', atomeId);
        // Use the proper get API to find the atome by ID
        const fastifyResult = await FastifyAdapter.atome.get(atomeId);
        console.log('🔍 Fastify raw result:', fastifyResult);
        console.log('🔍 Fastify result structure:', {
            hasAtome: !!fastifyResult.atome,
            hasData: !!fastifyResult.data,
            allKeys: Object.keys(fastifyResult)
        });

        if (fastifyResult.ok || fastifyResult.success) {
            // Extract atome from response
            let extractedAtome = null;

            if (fastifyResult.atome) {
                extractedAtome = fastifyResult.atome;
                console.log('🔍 Fastify: Found atome in .atome');
            } else if (fastifyResult.data && typeof fastifyResult.data === 'object') {
                extractedAtome = fastifyResult.data;
                console.log('🔍 Fastify: Found atome in .data');
            }

            if (extractedAtome) {
                console.log('🔍 Fastify: Extracted atome type:', extractedAtome.atome_type || extractedAtome.type);
                results.fastify.atome = extractedAtome;
                results.fastify.success = true;
            } else {
                console.log('🔍 Fastify: No atome found with ID:', atomeId);
                results.fastify.error = 'Atome not found';
            }
        } else {
            results.fastify.error = fastifyResult.error || 'Atome not found';
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

    let lastLinkedShareError = null;

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

    // First, get the target user by phone number to get their user ID.
    // Optimization: if caller already knows the canonical userId, accept it.
    let targetUserId = null;

    try {
        const hinted = propertyOverrides?.__targetUserId;
        if (hinted && typeof hinted === 'string' && hinted.trim().length > 10) {
            targetUserId = hinted.trim();
            console.log('✅ Using hinted target user ID:', targetUserId.substring(0, 8) + '...');
        }
    } catch (_) { }

    if (targetUserId) {
        // Skip phone lookup.
    } else {
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
                // IMPORTANT: use the same canonical user id as `auth.current()` (user_id)
                // otherwise inbox records can be created under a different id and never show up for the recipient.
                targetUserId = targetUser.user_id || targetUser.atome_id || targetUser.id;
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
    }

    // Get current user as the sharer
    const currentUserResult = await current_user();
    const sharerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
    console.log('🔍 Sharer ID:', sharerId?.substring(0, 8) + '...');

    // Enrich request payload for mailbox/outbox persistence
    shareRequest.sharerId = sharerId;
    shareRequest.targetUserId = targetUserId;

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

    // Now share each atome either as a permission-based link (same atome_id) or as a physical copy
    const sharedAtomes = [];

    // Determine share type (linked vs copy) from propertyOverrides
    const shareType = String((propertyOverrides && propertyOverrides.__shareType) ? propertyOverrides.__shareType : 'linked');

    const permissionPayload = {
        can_read: !!sharePermissions.read,
        can_write: !!sharePermissions.alter,
        can_delete: !!sharePermissions.delete,
        can_share: !!sharePermissions.create
    };

    // Extract particles from an atome object returned by either backend.
    // Keep in sync with the copy-share extraction logic.
    const extractParticles = (atome) => {
        if (!atome || typeof atome !== 'object') return {};

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

    // Linked shares require the original atome to exist on Fastify so that permissions
    // can be granted (Fastify enforces FKs to both atome_id and principal_id).
    async function ensureFastifyAtomeExists(atomeId) {
        try {
            const fastifyGet = await FastifyAdapter.atome.get(atomeId);
            if (fastifyGet?.ok || fastifyGet?.success) {
                const hasAtome = !!(fastifyGet?.atome || fastifyGet?.data);
                if (hasAtome) return { ok: true, existed: true };
            }
        } catch (_) { }

        // If missing on Fastify, try to seed it from Tauri (or from whatever backend has it).
        let sourceAtome = null;
        try {
            const tauriGet = await TauriAdapter.atome.get(atomeId);
            if (tauriGet?.ok || tauriGet?.success) {
                sourceAtome = tauriGet.atome || tauriGet.data || null;
            }
        } catch (_) { }

        if (!sourceAtome) {
            // As a last attempt, re-check Fastify result structure.
            try {
                const fastifyGet2 = await FastifyAdapter.atome.get(atomeId);
                if (fastifyGet2?.ok || fastifyGet2?.success) {
                    sourceAtome = fastifyGet2.atome || fastifyGet2.data || null;
                }
            } catch (_) { }
        }

        if (!sourceAtome) {
            return { ok: false, existed: false, error: 'Atome not found on any backend' };
        }

        const type = sourceAtome.atome_type || sourceAtome.type || 'shape';
        const ownerId = sourceAtome.owner_id || sourceAtome.ownerId || sharerId;
        const parentId = sourceAtome.parent_id || sourceAtome.parentId || sourceAtome.parent || null;
        const particles = extractParticles(sourceAtome);

        try {
            const createRes = await FastifyAdapter.atome.create({
                id: atomeId,
                type,
                ownerId,
                parentId,
                particles
            });

            if (createRes?.ok || createRes?.success) {
                console.log('✅ Seeded missing atome on Fastify for linked share:', atomeId.substring(0, 8) + '...');
                return { ok: true, existed: false, created: true, data: createRes };
            }

            return { ok: false, existed: false, error: createRes?.error || 'Failed to create atome on Fastify' };
        } catch (e) {
            return { ok: false, existed: false, error: e.message };
        }
    }

    async function findExistingSharedCopyIds(originalId) {
        try {
            const existing = { tauriId: null, fastifyId: null };

            // Only dedupe for linked shares; copy mode should create a new independent copy
            if (shareType !== 'linked') return existing;

            const match = (a) => {
                const p = a?.particles || a?.data || {};
                const o = p.originalAtomeId || p.original_atome_id || null;
                const sf = p.sharedFrom || p.shared_from || null;
                const st = p.shareType || p.share_type || 'linked';
                return String(o || '') === String(originalId) &&
                    String(sf || '') === String(sharerId || '') &&
                    String(st || 'linked') === 'linked';
            };

            try {
                const tauriList = await TauriAdapter.atome.list({ ownerId: targetUserId });
                const tauriAtomes = tauriList?.atomes || tauriList?.data || [];
                const found = Array.isArray(tauriAtomes) ? tauriAtomes.find(match) : null;
                if (found) existing.tauriId = found.atome_id || found.id;
            } catch (_) { }

            try {
                const fastifyList = await FastifyAdapter.atome.list({ ownerId: targetUserId });
                const fastifyAtomes = fastifyList?.atomes || fastifyList?.data || [];
                const found = Array.isArray(fastifyAtomes) ? fastifyAtomes.find(match) : null;
                if (found) existing.fastifyId = found.atome_id || found.id;
            } catch (_) { }

            return existing;
        } catch (_) {
            return { tauriId: null, fastifyId: null };
        }
    }

    for (const atomeId of normalizedAtomeIds) {
        try {
            console.log('🔄 Sharing atome:', atomeId.substring(0, 8) + '...');

            // LINKED (standard) share: grant permissions on the original atome (same ID)
            if (shareType === 'linked') {
                let fastifyOk = false;
                let fastifyData = null;

                // Ensure the atome exists on Fastify before granting permissions.
                // Without this, the Fastify permission insert/check can fail (or be denied)
                // and the linked share ends up with 0 shared atomes.
                const ensureRes = await ensureFastifyAtomeExists(atomeId);
                if (!ensureRes.ok) {
                    console.error('❌ Linked share aborted: atome not present on Fastify:', ensureRes.error);
                    continue;
                }

                try {
                    const res = await FastifyAdapter.share.create({
                        userId: sharerId,
                        atomeId,
                        principalId: targetUserId,
                        permission: permissionPayload
                    });
                    fastifyOk = !!(res?.ok || res?.success);
                    fastifyData = res;
                } catch (_) { }

                if (fastifyOk) {
                    sharedAtomes.push({
                        originalId: atomeId,
                        sharedAtomeId: atomeId,
                        sharedAtomeIds: { tauriId: atomeId, fastifyId: atomeId },
                        createdOnTauri: false,
                        createdOnFastify: fastifyOk,
                        shareMode: 'permission',
                        shareType
                    });
                    console.log('✅ Granted permissions for linked share');
                } else {
                    const err = fastifyData?.error || fastifyData?.message || 'Unknown error (no share-response)';
                    lastLinkedShareError = String(err);
                    console.error('❌ Failed to grant permissions (linked share)', {
                        error: lastLinkedShareError,
                        atomeId,
                        principalId: targetUserId,
                        response: fastifyData
                    });
                }

                continue;
            }

            // Dedupe: if linked share copy already exists for this target user, reuse it
            const existingIds = await findExistingSharedCopyIds(atomeId);
            if (existingIds.tauriId || existingIds.fastifyId) {
                console.log('♻️ Reusing existing shared copy for linked share:', {
                    tauri: existingIds.tauriId ? existingIds.tauriId.substring(0, 8) + '...' : null,
                    fastify: existingIds.fastifyId ? existingIds.fastifyId.substring(0, 8) + '...' : null
                });

                sharedAtomes.push({
                    originalId: atomeId,
                    sharedData: null,
                    sharedAtomeId: existingIds.tauriId || existingIds.fastifyId,
                    sharedAtomeIds: existingIds,
                    createdOnTauri: !!existingIds.tauriId,
                    createdOnFastify: !!existingIds.fastifyId,
                    reused: true
                });
                continue;
            }

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
                    shareType: shareType,
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
            let createdTauriId = null;
            let createdFastifyId = null;

            try {
                const tauriResult = await TauriAdapter.atome.create(sharedAtomeData);
                if (tauriResult.ok || tauriResult.success) {
                    console.log('✅ Created shared atome copy on Tauri');
                    createdOnTauri = true;
                    createdTauriId = tauriResult?.atome_id || tauriResult?.id || tauriResult?.data?.atome_id || tauriResult?.data?.id || null;
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
                    createdFastifyId = fastifyResult?.atome_id || fastifyResult?.id || fastifyResult?.data?.atome_id || fastifyResult?.data?.id || null;
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
                    sharedAtomeId: createdTauriId || createdFastifyId,
                    sharedAtomeIds: { tauriId: createdTauriId, fastifyId: createdFastifyId },
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

    // If nothing was actually shared, do not create inbox/outbox requests.
    // Otherwise the receiver ends up with a request that has no importable payload.
    if (sharedAtomes.length === 0) {
        const error = lastLinkedShareError || 'No atomes were shared (permissions grant failed)';
        results.tauri = { success: false, data: null, error };
        results.fastify = { success: false, data: null, error };
        if (typeof callback === 'function') callback(results);
        return results;
    }

    // Share requests must always be approvable by the recipient.
    // Previously, real-time shares were created as `active` which bypassed the Pending panel in the Share UI.
    // We always start as `pending`; the receiver can then accept/import or reject.
    const requestStatus = 'pending';

    const inboxRequestRecord = {
        type: 'share_request',
        ownerId: targetUserId,
        particles: {
            ...shareRequest,
            sharedAtomes: sharedAtomes,
            status: requestStatus,
            box: 'inbox'
        }
    };

    const outboxRequestRecord = {
        type: 'share_request',
        ownerId: sharerId,
        particles: {
            ...shareRequest,
            sharedAtomes: sharedAtomes,
            status: requestStatus,
            box: 'outbox'
        }
    };

    // Tauri (local SQLite): only the outbox record is meaningful on the sharer's device.
    // Creating the recipient inbox locally can fail due to FK constraints (recipient user not present locally).
    try {
        const tauriOutboxResult = await TauriAdapter.atome.create(outboxRequestRecord);

        console.log('🔍 Tauri sharing outbox result:', tauriOutboxResult);

        const outboxOk = !!(tauriOutboxResult?.ok || tauriOutboxResult?.success);

        if (outboxOk) {
            results.tauri = {
                success: true,
                data: { inbox: null, outbox: tauriOutboxResult },
                shareRequest: shareRequest,
                sharedAtomes: sharedAtomes,
                error: null
            };
        } else {
            results.tauri = {
                success: false,
                data: null,
                error: (tauriOutboxResult?.error) || 'Tauri sharing failed'
            };
        }
    } catch (e) {
        console.error('❌ Tauri sharing error:', e);
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Try Fastify (LibSQL) - Create inbox/outbox sharing request records
    try {
        const fastifyInboxResult = await FastifyAdapter.atome.create(inboxRequestRecord);
        const fastifyOutboxResult = await FastifyAdapter.atome.create(outboxRequestRecord);

        console.log('🔍 Fastify sharing inbox result:', fastifyInboxResult);
        console.log('🔍 Fastify sharing outbox result:', fastifyOutboxResult);

        const inboxOk = !!(fastifyInboxResult?.ok || fastifyInboxResult?.success);
        const outboxOk = !!(fastifyOutboxResult?.ok || fastifyOutboxResult?.success);

        if (inboxOk || outboxOk) {
            results.fastify = {
                success: true,
                data: { inbox: fastifyInboxResult, outbox: fastifyOutboxResult },
                shareRequest: shareRequest,
                sharedAtomes: sharedAtomes,
                error: null
            };
        } else {
            results.fastify = {
                success: false,
                data: null,
                error: (fastifyInboxResult?.error || fastifyOutboxResult?.error) || 'Fastify sharing failed'
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
        list: user_list,
        // Current user state management
        getCurrentInfo: get_current_user_info,
        setCurrentState: set_current_user_state,
        tryAutoLogin: try_auto_login,
        // Visibility management
        setVisibility: set_user_visibility
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
    machine: {
        getCurrent: get_current_machine,
        register: register_machine,
        getLastUser: get_machine_last_user
    },
    debug: {
        listTables: list_tables
    }
};

export default AdoleAPI;
