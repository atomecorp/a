

// ============================================
// ADOLE v3.0 - WebSocket API Functions
// ============================================

import { TauriAdapter, FastifyAdapter, CONFIG, generateUUID, checkBackends } from './adole.js';

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

/**
 * Grant Fastify share permissions WITHOUT creating share_request atomes.
 * Useful for project collaboration where children are added over time.
 * @param {string} atomeId
 * @param {string} principalId
 * @param {{read?:boolean, alter?:boolean, delete?:boolean, create?:boolean}} sharePermissions
 * @param {object} [options]
 * @param {string|null} [options.particleKey]
 * @param {string|null} [options.expiresAt]
 */
async function grant_share_permission(atomeId, principalId, sharePermissions, options = {}, callback) {
    const results = {
        tauri: { success: false, data: null, error: 'Not supported (permissions are managed on Fastify)' },
        fastify: { success: false, data: null, error: null }
    };

    try {
        const currentUserResult = await current_user();
        const sharerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
        if (!sharerId) {
            const error = 'No user logged in. Please log in first.';
            results.fastify.error = error;
            if (typeof callback === 'function') callback(results);
            return results;
        }

        if (!atomeId || !principalId) {
            results.fastify.error = 'Missing atomeId or principalId';
            if (typeof callback === 'function') callback(results);
            return results;
        }

        // Ensure the atome exists on Fastify before granting permissions.
        const ensureRes = await ensureFastifyAtomeExists(String(atomeId));
        if (!ensureRes.ok) {
            results.fastify.error = ensureRes.error || 'Atome not present on Fastify';
            if (typeof callback === 'function') callback(results);
            return results;
        }

        const permissionPayload = {
            can_read: !!sharePermissions?.read,
            can_write: !!sharePermissions?.alter,
            can_delete: !!sharePermissions?.delete,
            can_share: false,
            can_create: !!sharePermissions?.create
        };

        const particleKey = options?.particleKey || options?.particle_key || null;
        const expiresAt = options?.expiresAt || options?.expires_at || null;

        const res = await FastifyAdapter.share.create({
            userId: sharerId,
            atomeId: String(atomeId),
            principalId: String(principalId),
            permission: permissionPayload,
            particleKey,
            expiresAt
        });

        const ok = !!(res?.ok || res?.success);
        results.fastify = { success: ok, data: res, error: ok ? null : (res?.error || res?.message || 'Permission grant failed') };
    } catch (e) {
        results.fastify.error = e.message;
    }

    if (typeof callback === 'function') callback(results);
    return results;
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

// Public user directory cache (safe fields only; never store password hashes here)
const PUBLIC_USER_DIRECTORY_CACHE_KEY = 'public_user_directory_cache_v1';
const AUTH_PENDING_SYNC_KEY = 'auth_pending_sync';
const PUBLIC_USER_DIRECTORY_LAST_SYNC_KEY = 'public_user_directory_last_sync_iso_v1';

function is_tauri_runtime() {
    try {
        return typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    } catch {
        return false;
    }
}

function safe_parse_json(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
        return value;
    }
    try { return JSON.parse(trimmed); } catch { return value; }
}

function normalize_user_entry(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const particles = raw.particles || raw.data?.particles || raw.data || raw;
    const userId = raw.user_id || raw.userId || raw.atome_id || raw.id || null;
    const username = safe_parse_json(particles?.username) || raw.username || null;
    const phone = safe_parse_json(particles?.phone) || raw.phone || null;
    const visibility = safe_parse_json(particles?.visibility) || raw.visibility || 'public';

    // Phone number is the stable lookup key for sharing/discovery.
    // Drop entries that do not have a usable phone.
    const phoneStr = (phone === null || phone === undefined) ? '' : String(phone).trim();
    if (!phoneStr || phoneStr.toLowerCase() === 'unknown') return null;

    return {
        user_id: userId,
        username: (username && String(username).trim()) ? username : 'Unknown',
        phone: phoneStr,
        visibility: visibility === 'private' ? 'private' : 'public'
    };
}

function get_public_user_directory_last_sync() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(PUBLIC_USER_DIRECTORY_LAST_SYNC_KEY);
        return raw ? String(raw) : null;
    } catch {
        return null;
    }
}

function set_public_user_directory_last_sync(isoString) {
    try {
        if (typeof localStorage === 'undefined') return;
        if (!isoString) return;
        localStorage.setItem(PUBLIC_USER_DIRECTORY_LAST_SYNC_KEY, String(isoString));
    } catch {
        // Ignore
    }
}

async function sync_public_user_directory_delta({ limit = 500 } = {}) {
    const lastSync = get_public_user_directory_last_sync();
    const nowIso = new Date().toISOString();

    let fastifyUsers = [];
    try {
        const res = await FastifyAdapter.atome.list({ type: 'user', limit, offset: 0, since: lastSync });
        if (res && (res.ok || res.success)) {
            fastifyUsers = res.atomes || res.data || [];
        }
    } catch {
        // Ignore
    }

    if (fastifyUsers.length === 0) {
        // Only advance the sync cursor if Fastify is actually reachable.
        try {
            const reachable = await FastifyAdapter.isAvailable();
            if (reachable) set_public_user_directory_last_sync(nowIso);
        } catch { }
        return { ok: true, added: 0 };
    }

    const existing = load_public_user_directory_cache();
    const merged = merge_user_directories(existing, fastifyUsers);
    save_public_user_directory_cache(merged);
    set_public_user_directory_last_sync(nowIso);
    return { ok: true, added: fastifyUsers.length };
}

async function seed_public_user_directory_if_needed() {
    try {
        const cache = load_public_user_directory_cache();
        if (cache.length > 0) return;
        // Pull a first delta page only to avoid heavy operations in large directories.
        await sync_public_user_directory_delta({ limit: 500 });
    } catch {
        // Ignore
    }
}

async function lookup_user_by_phone(phone) {
    if (!phone) return null;
    const clean = String(phone).trim().replace(/\s+/g, '');
    if (!clean) return null;

    try {
        if (FastifyAdapter?.auth?.lookupPhone) {
            const res = await FastifyAdapter.auth.lookupPhone({ phone: clean });
            if (res && (res.ok || res.success) && res.user) {
                const entry = normalize_user_entry(res.user);
                if (entry) {
                    const existing = load_public_user_directory_cache();
                    existing.push(entry);
                    save_public_user_directory_cache(existing);
                }
                return {
                    id: res.user.user_id || res.user.id,
                    user_id: res.user.user_id || res.user.id,
                    username: res.user.username,
                    phone: res.user.phone,
                    visibility: res.user.visibility
                };
            }
        }
    } catch {
        // Ignore
    }

    // Offline-only: use directory cache.
    const cache = load_public_user_directory_cache();
    const hit = cache.find(u => String(u.phone).trim() === clean);
    if (!hit) return null;
    return { id: hit.user_id, user_id: hit.user_id, username: hit.username, phone: hit.phone, visibility: hit.visibility };
}

function load_public_user_directory_cache() {
    try {
        if (typeof localStorage === 'undefined') return [];
        const raw = localStorage.getItem(PUBLIC_USER_DIRECTORY_CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function save_public_user_directory_cache(users) {
    try {
        if (typeof localStorage === 'undefined') return;
        const unique = new Map();
        for (const u of (Array.isArray(users) ? users : [])) {
            const nu = normalize_user_entry(u);
            if (!nu) continue;
            const key = String(nu.phone || nu.user_id || '').trim();
            if (!key) continue;
            unique.set(key, nu);
        }
        localStorage.setItem(PUBLIC_USER_DIRECTORY_CACHE_KEY, JSON.stringify(Array.from(unique.values())));
    } catch {
        // Ignore
    }
}

function merge_user_directories(tauriUsers, fastifyUsers) {
    const byPhoneOrId = new Map();
    const add = (u) => {
        const nu = normalize_user_entry(u);
        if (!nu) return;
        const key = String(nu.phone || nu.user_id || '').trim();
        if (!key) return;
        const existing = byPhoneOrId.get(key);
        if (!existing) {
            byPhoneOrId.set(key, nu);
            return;
        }
        // Prefer entries with a user_id and non-Unknown username
        const merged = {
            user_id: existing.user_id || nu.user_id,
            username: (existing.username && existing.username !== 'Unknown') ? existing.username : nu.username,
            phone: existing.phone || nu.phone,
            visibility: existing.visibility || nu.visibility
        };
        byPhoneOrId.set(key, merged);
    };

    (Array.isArray(tauriUsers) ? tauriUsers : []).forEach(add);
    (Array.isArray(fastifyUsers) ? fastifyUsers : []).forEach(add);

    return Array.from(byPhoneOrId.values());
}

function queue_pending_register({ username, phone, password, createdOn }) {
    if (typeof localStorage === 'undefined') return;
    try {
        const queue = JSON.parse(localStorage.getItem(AUTH_PENDING_SYNC_KEY) || '[]');
        queue.push({
            operation: 'register',
            data: { username, phone, password, createdOn },
            queuedAt: new Date().toISOString()
        });
        localStorage.setItem(AUTH_PENDING_SYNC_KEY, JSON.stringify(queue));
    } catch {
        // Ignore
    }
}

function has_pending_registers() {
    if (typeof localStorage === 'undefined') return false;
    try {
        const raw = localStorage.getItem(AUTH_PENDING_SYNC_KEY);
        if (!raw) return false;
        const queue = JSON.parse(raw);
        return Array.isArray(queue) && queue.length > 0;
    } catch {
        return false;
    }
}

let pendingRegisterMonitorStarted = false;
let pendingRegisterMonitorId = null;

function start_pending_register_monitor() {
    if (pendingRegisterMonitorStarted || typeof window === 'undefined') return;
    pendingRegisterMonitorStarted = true;

    const pollInterval = Math.max(CONFIG.CHECK_INTERVAL || 30000, 15000);
    pendingRegisterMonitorId = setInterval(async () => {
        if (!has_pending_registers()) return;
        try {
            const { fastify } = await checkBackends(true);
            if (fastify) {
                await process_pending_registers();
            }
        } catch {
            // Ignore
        }
    }, pollInterval);
}

function is_already_exists_error(payload) {
    if (!payload) return false;
    if (payload.alreadyExists === true) return true;
    const msg = String(payload.error || payload.message || payload).toLowerCase();
    return msg.includes('already') || msg.includes('exists') || msg.includes('registered');
}

async function process_pending_registers() {
    if (typeof localStorage === 'undefined') return { processed: 0, remaining: 0 };
    let queue;
    try {
        queue = JSON.parse(localStorage.getItem(AUTH_PENDING_SYNC_KEY) || '[]');
    } catch {
        queue = [];
    }
    if (!Array.isArray(queue) || queue.length === 0) return { processed: 0, remaining: 0 };

    const remaining = [];
    let processed = 0;

    for (const item of queue) {
        if (!item || item.operation !== 'register' || !item.data) {
            continue;
        }

        const data = item.data;
        const username = data.username;
        const phone = data.phone;
        const password = data.password;
        const createdOn = data.createdOn;

        if (!username || !phone || !password) {
            continue;
        }

        // Only sync to the opposite backend.
        try {
            if (createdOn === 'tauri') {
                const r = await FastifyAdapter.auth.register({ username, phone, password, visibility: 'public' });
                if (r && (r.ok || r.success || is_already_exists_error(r))) {
                    processed += 1;
                    continue;
                }
            } else if (createdOn === 'fastify') {
                const r = await TauriAdapter.auth.register({ username, phone, password, visibility: 'public' });
                if (r && (r.ok || r.success || is_already_exists_error(r))) {
                    processed += 1;
                    continue;
                }
            }
        } catch {
            // Keep in remaining.
        }

        remaining.push(item);
    }

    try {
        localStorage.setItem(AUTH_PENDING_SYNC_KEY, JSON.stringify(remaining));
    } catch {
        // Ignore
    }

    return { processed, remaining: remaining.length };
}

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
        // Opportunistically process queued register operations when the app starts.
        try { await process_pending_registers(); } catch { }

        // Seed directory cache if empty (lightweight: one page).
        try { await seed_public_user_directory_if_needed(); } catch { }

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
    const autoLogin = options.autoLogin !== false;
    const clearAuthTokens = options.clearAuthTokens !== false;

    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    if (clearAuthTokens) {
        try { TauriAdapter.clearToken?.(); } catch { }
        try { FastifyAdapter.clearToken?.(); } catch { }
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('auth_token');
            }
        } catch { }
    }

    // Try Tauri first (local SQLite)
    try {
        const tauriResult = await TauriAdapter.auth.register({
            phone,
            password,
            username,
            visibility
        });
        const tauriOk = !!(tauriResult.ok || tauriResult.success);
        const tauriAlready = is_already_exists_error(tauriResult);
        if (tauriOk || tauriAlready) {
            results.tauri = { success: true, data: tauriResult, error: null, alreadyExists: tauriAlready && !tauriOk };
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
        const fastifyOk = !!(fastifyResult.ok || fastifyResult.success);
        const fastifyAlready = is_already_exists_error(fastifyResult);
        if (fastifyOk || fastifyAlready) {
            results.fastify = { success: true, data: fastifyResult, error: null, alreadyExists: fastifyAlready && !fastifyOk };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    // Bidirectional reliability: if one backend was offline, queue a register for later.
    // This keeps "created offline in Tauri" and "created in Fastify" converging over time.
    if (results.tauri.success && !results.fastify.success) {
        queue_pending_register({ username, phone, password, createdOn: 'tauri' });
    } else if (results.fastify.success && !results.tauri.success) {
        queue_pending_register({ username, phone, password, createdOn: 'fastify' });
    }

    // IMPORTANT (browser/Fastify): auth.register may not issue a usable JWT for ws/api.
    // Ensure we explicitly login to get a token and set current user state.
    if (autoLogin && (results.tauri.success || results.fastify.success)) {
        try {
            const loginResults = await log_user(phone, password, username);
            results.login = loginResults;
        } catch (e) {
            results.login = { error: e.message };
        }
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

    // If running in Tauri and the account exists on Fastify but not yet locally,
    // bootstrap the local account on first login using the provided credentials.
    // This makes "created in browser/Fastify" accounts usable in Tauri without manual re-creation.
    try {
        const isTauriRuntime = typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
        const tauriLoginError = String(results.tauri?.error || '').toLowerCase();
        const canBootstrap = isTauriRuntime
            && results.fastify.success
            && !results.tauri.success
            && (tauriLoginError.includes('user not found') || tauriLoginError.includes('no user') || tauriLoginError.includes('not found'));

        if (canBootstrap) {
            const fastifyUser = results.fastify.data?.user || {};
            const registerUsername = fastifyUser.username || username;

            try {
                const reg = await TauriAdapter.auth.register({
                    phone,
                    password,
                    username: registerUsername,
                    visibility: 'public'
                });

                const regOk = reg && (reg.ok || reg.success);
                const regErr = String(reg?.error || '').toLowerCase();
                if (!regOk && regErr && !(regErr.includes('already') || regErr.includes('exists') || regErr.includes('registered'))) {
                    // Keep original tauri error; bootstrap failed.
                }
            } catch (_) {
                // Ignore bootstrap errors; we'll return original login results.
            }

            try {
                const tauriRetry = await TauriAdapter.auth.login({ phone, password });
                if (tauriRetry && (tauriRetry.ok || tauriRetry.success)) {
                    results.tauri = { success: true, data: tauriRetry, error: null };
                }
            } catch (_) {
                // Ignore
            }
        }
    } catch (_) {
        // Never fail login flow because of bootstrap attempt.
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
        if (tauriResult?.error && typeof tauriResult.error === 'string') {
            const msg = tauriResult.error.toLowerCase();
            if (msg.includes('user not found') || msg.includes('invalid token') || msg.includes('token')) {
                try { TauriAdapter.clearToken?.(); } catch { }
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
        if (fastifyResult?.error && typeof fastifyResult.error === 'string') {
            const msg = fastifyResult.error.toLowerCase();
            if (msg.includes('user not found') || msg.includes('invalid token') || msg.includes('token')) {
                try { FastifyAdapter.clearToken?.(); } catch { }
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.removeItem('auth_token');
                    }
                } catch { }
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

    // Scalable: refresh public directory cache using deltas first.
    try { await sync_public_user_directory_delta({ limit: 500 }); } catch { }

    // Try Tauri
    try {
        const tauriResult = await TauriAdapter.atome.list({ type: 'user', limit: 500, offset: 0 });
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
        const fastifyResult = await FastifyAdapter.atome.list({ type: 'user', limit: 500, offset: 0 });
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify.users = fastifyResult.atomes || fastifyResult.data || [];
        } else {
            results.fastify.error = fastifyResult.error;
        }
    } catch (e) {
        results.fastify.error = e.message;
    }

    // Merge + cache (safe directory) so Tauri can still "see" Fastify-created users offline.
    try {
        const merged = merge_user_directories(results.tauri.users, results.fastify.users);
        // Cache only if we got something meaningful from any backend.
        if (merged.length > 0) {
            save_public_user_directory_cache(merged);
        }

        // If Tauri backend is unavailable (or empty) but we have cache, use it as a directory fallback.
        // This is a visibility feature only; it does not create local accounts.
        if (is_tauri_runtime()) {
            const cache = load_public_user_directory_cache();
            if ((results.tauri.users.length === 0) && cache.length > 0) {
                results.tauri.users = cache;
            }

            // In Tauri, expose the merged directory through the Tauri slot so UI code that
            // expects to read "Tauri users" also sees Fastify-created users.
            results.tauri.users = merge_user_directories(results.tauri.users, results.fastify.users);
        }
    } catch {
        // Ignore
    }

    return results;
}

// Keep user directory fresh when the sync engine reports new accounts.
// This is intentionally lightweight: it updates the local cache, it does not create accounts.
try {
    if (typeof window !== 'undefined' && !window.__ADOLE_USER_DIRECTORY_LISTENERS__) {
        window.__ADOLE_USER_DIRECTORY_LISTENERS__ = true;
        window.addEventListener('squirrel:account-created', async (evt) => {
            try {
                const detail = evt?.detail || {};
                const entry = normalize_user_entry({ user_id: detail.userId, username: detail.username, phone: detail.phone, visibility: 'public' });
                if (!entry) return;
                const existing = load_public_user_directory_cache();
                existing.push(entry);
                save_public_user_directory_cache(existing);
            } catch {
                // Ignore
            }
        });

        window.addEventListener('squirrel:sync-ready', async () => {
            try { await process_pending_registers(); } catch { }
            try { await seed_public_user_directory_if_needed(); } catch { }
            try { await sync_public_user_directory_delta({ limit: 500 }); } catch { }
        });

        window.addEventListener('squirrel:server-available', async (event) => {
            if (event?.detail?.backend && event.detail.backend !== 'fastify') return;
            try { await process_pending_registers(); } catch { }
        });

        start_pending_register_monitor();
    }
} catch {
    // Ignore
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

    const extractCreatedAtomeId = (res) => {
        try {
            return (
                res?.atome_id || res?.id ||
                res?.data?.atome_id || res?.data?.id ||
                res?.data?.data?.atome_id || res?.data?.data?.id ||
                res?.atome?.atome_id || res?.atome?.id ||
                res?.data?.atome?.atome_id || res?.data?.atome?.id ||
                null
            );
        } catch (_) {
            return null;
        }
    };

    let tauriCreatedId = null;

    // Create on Tauri
    try {
        const tauriResult = await TauriAdapter.atome.create(projectData);
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
            tauriCreatedId = extractCreatedAtomeId(tauriResult);
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Create on Fastify (reuse the Tauri-generated ID when available to avoid duplicates)
    try {
        const fastifyPayload = tauriCreatedId
            ? { ...projectData, id: tauriCreatedId, atome_id: tauriCreatedId }
            : projectData;

        const fastifyResult = await FastifyAdapter.atome.create(fastifyPayload);
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
 * List all projects accessible to the current user (owned + shared)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} List of projects from both backends
 */
async function list_projects(callback) {
    const results = {
        tauri: { projects: [], error: null },
        fastify: { projects: [], error: null }
    };

    const currentUserResult = await current_user();
    const currentUserId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;

    if (!currentUserId || currentUserId === 'anonymous') {
        const error = 'No user logged in. Cannot list projects.';
        results.tauri.error = error;
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    const listResult = await list_atomes({ type: 'project', ownerId: currentUserId });
    results.tauri.projects = Array.isArray(listResult.tauri.atomes) ? listResult.tauri.atomes : [];
    results.fastify.projects = Array.isArray(listResult.fastify.atomes) ? listResult.fastify.atomes : [];
    results.tauri.error = listResult.tauri.error || null;
    results.fastify.error = listResult.fastify.error || null;

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
    const desiredId = options.id || generateUUID();

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
        id: desiredId, // Always use a UUID so both backends match
        type: atomeType,
        ownerId: ownerId,
        parentId: projectId, // Link to project if provided
        particles: {
            color: atomeColor,
            created_at: new Date().toISOString(),
            ...options.particles
        }
    };

    const extractCreatedAtomeId = (res) => {
        try {
            return (
                res?.atome_id || res?.id ||
                res?.data?.atome_id || res?.data?.id ||
                res?.data?.data?.atome_id || res?.data?.data?.id ||
                res?.atome?.atome_id || res?.atome?.id ||
                res?.data?.atome?.atome_id || res?.data?.atome?.id ||
                null
            );
        } catch (_) {
            return null;
        }
    };

    let tauriCreatedId = null;

    // Create on Tauri
    try {
        const tauriResult = await TauriAdapter.atome.create(atomeData);
        if (tauriResult.ok || tauriResult.success) {
            results.tauri = { success: true, data: tauriResult, error: null };
            tauriCreatedId = extractCreatedAtomeId(tauriResult);
        } else {
            results.tauri = { success: false, data: null, error: tauriResult.error };
        }
    } catch (e) {
        results.tauri = { success: false, data: null, error: e.message };
    }

    // Create on Fastify (reuse the Tauri-generated ID when available to avoid duplicates)
    try {
        const canonicalId = desiredId || tauriCreatedId || null;
        const fastifyPayload = canonicalId
            ? { ...atomeData, id: canonicalId, atome_id: canonicalId }
            : atomeData;

        const fastifyResult = await FastifyAdapter.atome.create(fastifyPayload);
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
    const projectId = options.projectId || options.project_id || null;
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
    if (projectId) queryOptions.parentId = projectId;
    if (options.limit !== undefined) queryOptions.limit = options.limit;
    if (options.offset !== undefined) queryOptions.offset = options.offset;
    if (options.includeDeleted !== undefined) queryOptions.includeDeleted = options.includeDeleted;
    if (projectId && queryOptions.limit === undefined) queryOptions.limit = 1000;

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
 * Broadcast-only realtime patch for an atome (no DB write)
 * Used for continuous drag so collaborators see movement immediately.
 * @param {string} atomeId
 * @param {Object} particles
 * @param {Function} [callback]
 */
async function realtime_patch(atomeId, particles, callback) {
    if (typeof particles === 'function') {
        callback = particles;
        particles = null;
    }

    if (!atomeId || !particles || typeof particles !== 'object') {
        const error = !atomeId ? 'atomeId parameter is required' : 'particles object is required';
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

    const isTauriRuntime = !!(typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__));

    const tasks = [];

    // Only call Tauri realtime when actually inside Tauri.
    if (isTauriRuntime && TauriAdapter?.atome?.realtime) {
        tasks.push((async () => {
            try {
                const tauriResult = await TauriAdapter.atome.realtime(atomeId, particles);
                if (tauriResult.ok || tauriResult.success) {
                    results.tauri = { success: true, data: tauriResult, error: null };
                } else {
                    results.tauri = { success: false, data: null, error: tauriResult.error };
                }
            } catch (e) {
                results.tauri = { success: false, data: null, error: e.message };
            }
        })());
    }

    if (FastifyAdapter?.atome?.realtime) {
        tasks.push((async () => {
            try {
                const fastifyResult = await FastifyAdapter.atome.realtime(atomeId, particles);
                if (fastifyResult.ok || fastifyResult.success) {
                    results.fastify = { success: true, data: fastifyResult, error: null };
                } else {
                    results.fastify = { success: false, data: null, error: fastifyResult.error };
                }
            } catch (e) {
                results.fastify = { success: false, data: null, error: e.message };
            }
        })());
    }

    if (tasks.length > 0) {
        try { await Promise.allSettled(tasks); } catch { }
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

    const DEBUG = (typeof window !== 'undefined' && window.__ADOLE_API_DEBUG__ === true);

    // Try Tauri
    try {
        if (DEBUG) console.log('🔍 Calling TauriAdapter.atome.get for atome ID:', atomeId);
        // Use the proper get API to find the atome by ID
        const tauriResult = await TauriAdapter.atome.get(atomeId);
        if (DEBUG) console.log('🔍 Tauri raw result:', tauriResult);
        if (DEBUG) console.log('🔍 Tauri result structure:', {
            hasAtome: !!tauriResult.atome,
            hasData: !!tauriResult.data,
            allKeys: Object.keys(tauriResult)
        });

        if (tauriResult.ok || tauriResult.success) {
            // Extract atome from response
            let extractedAtome = null;

            if (tauriResult.atome) {
                extractedAtome = tauriResult.atome;
                if (DEBUG) console.log('🔍 Tauri: Found atome in .atome');
            } else if (tauriResult.data && typeof tauriResult.data === 'object') {
                extractedAtome = tauriResult.data;
                if (DEBUG) console.log('🔍 Tauri: Found atome in .data');
            }

            if (extractedAtome) {
                if (DEBUG) console.log('🔍 Tauri: Extracted atome type:', extractedAtome.atome_type || extractedAtome.type);
                results.tauri.atome = extractedAtome;
                results.tauri.success = true;
            } else {
                if (DEBUG) console.log('🔍 Tauri: No atome found with ID:', atomeId);
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
        if (DEBUG) console.log('🔍 Calling FastifyAdapter.atome.get for atome ID:', atomeId);
        // Use the proper get API to find the atome by ID
        const fastifyResult = await FastifyAdapter.atome.get(atomeId);
        if (DEBUG) console.log('🔍 Fastify raw result:', fastifyResult);
        if (DEBUG) console.log('🔍 Fastify result structure:', {
            hasAtome: !!fastifyResult.atome,
            hasData: !!fastifyResult.data,
            allKeys: Object.keys(fastifyResult)
        });

        if (fastifyResult.ok || fastifyResult.success) {
            // Extract atome from response
            let extractedAtome = null;

            if (fastifyResult.atome) {
                extractedAtome = fastifyResult.atome;
                if (DEBUG) console.log('🔍 Fastify: Found atome in .atome');
            } else if (fastifyResult.data && typeof fastifyResult.data === 'object') {
                extractedAtome = fastifyResult.data;
                if (DEBUG) console.log('🔍 Fastify: Found atome in .data');
            }

            if (extractedAtome) {
                if (DEBUG) console.log('🔍 Fastify: Extracted atome type:', extractedAtome.atome_type || extractedAtome.type);
                results.fastify.atome = extractedAtome;
                results.fastify.success = true;
            } else {
                if (DEBUG) console.log('🔍 Fastify: No atome found with ID:', atomeId);
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
        tauri: { success: false, data: null, error: 'Share requests are handled by Fastify' },
        fastify: { success: false, data: null, error: null }
    };

    if (!phoneNumber) {
        const error = 'Phone number is required';
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    const ids = Array.isArray(atomeIds) ? atomeIds.map(String).filter(Boolean) : (atomeIds ? [String(atomeIds)] : []);
    if (!ids.length) {
        const error = 'At least one Atome ID is required';
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    if (!sharePermissions || typeof sharePermissions !== 'object') {
        const error = 'Share permissions object is required';
        results.fastify.error = error;
        if (typeof callback === 'function') callback(results);
        return results;
    }

    const mode = sharingMode || 'real-time';

    const permissions = {
        read: !!sharePermissions.read,
        alter: !!sharePermissions.alter,
        delete: !!sharePermissions.delete,
        create: !!sharePermissions.create
    };

    const overrides = propertyOverrides && typeof propertyOverrides === 'object'
        ? { ...propertyOverrides }
        : {};

    const shareType = String(overrides.__shareType || overrides.shareType || 'linked');
    if (!overrides.__shareType) overrides.__shareType = shareType;

    let targetUserId = overrides.__targetUserId || null;
    if (!targetUserId) {
        try {
            const found = await lookup_user_by_phone(phoneNumber);
            targetUserId = found?.user_id || found?.id || null;
        } catch (_) {
            targetUserId = null;
        }
    }

    try {
        const payload = {
            targetUserId: targetUserId || null,
            targetPhone: phoneNumber,
            atomeIds: ids,
            permissions,
            mode,
            shareType,
            propertyOverrides: overrides
        };

        const fastifyResult = await FastifyAdapter.share.request(payload);
        const ok = !!(fastifyResult?.ok || fastifyResult?.success);
        results.fastify = {
            success: ok,
            data: fastifyResult,
            error: ok ? null : (fastifyResult?.error || fastifyResult?.message || 'Share request failed')
        };
    } catch (e) {
        results.fastify.error = e.message;
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

async function share_request(payload, callback) {
    let result = null;
    try {
        result = await FastifyAdapter.share.request(payload || {});
    } catch (e) {
        result = { ok: false, success: false, error: e.message };
    }
    if (typeof callback === 'function') callback(result);
    return result;
}

async function share_respond(payload, callback) {
    let result = null;
    try {
        result = await FastifyAdapter.share.respond(payload || {});
    } catch (e) {
        result = { ok: false, success: false, error: e.message };
    }
    if (typeof callback === 'function') callback(result);
    return result;
}

async function share_publish(payload, callback) {
    let result = null;
    try {
        result = await FastifyAdapter.share.publish(payload || {});
    } catch (e) {
        result = { ok: false, success: false, error: e.message };
    }
    if (typeof callback === 'function') callback(result);
    return result;
}

async function share_policy(payload, callback) {
    let result = null;
    try {
        result = await FastifyAdapter.share.policy(payload || {});
    } catch (e) {
        result = { ok: false, success: false, error: e.message };
    }
    if (typeof callback === 'function') callback(result);
    return result;
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
        lookupPhone: lookup_user_by_phone,
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
        alter: alter_atome,
        realtimePatch: realtime_patch
    },
    sharing: {
        share: share_atome,
        request: share_request,
        respond: share_respond,
        publish: share_publish,
        policy: share_policy,
        grantPermission: grant_share_permission
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
