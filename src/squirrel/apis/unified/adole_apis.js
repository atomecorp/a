

// ============================================
// ADOLE v3.0 - WebSocket API Functions
// ============================================

import { TauriAdapter, FastifyAdapter, CONFIG, generateUUID, checkBackends } from './adole.js';

const FILE_ASSET_TYPES = new Set([
    'file', 'image', 'video', 'sound', 'text', 'shape', 'raw',
    'audio_recording', 'video_recording'
]);

function is_file_asset_type(value) {
    const type = String(value || '').trim().toLowerCase();
    return FILE_ASSET_TYPES.has(type);
}

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

    const parsePendingId = (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            try {
                return JSON.parse(trimmed);
            } catch {
                return trimmed;
            }
        }
        return value;
    };

    const pendingOwnerRaw =
        raw._pending_owner_id ??
        raw.pending_owner_id ??
        raw.pendingOwnerId ??
        particlesFromParticlesField?._pending_owner_id ??
        particlesFromDataField?._pending_owner_id;
    const pendingParentRaw =
        raw._pending_parent_id ??
        raw.pending_parent_id ??
        raw.pendingParentId ??
        particlesFromParticlesField?._pending_parent_id ??
        particlesFromDataField?._pending_parent_id;

    const pendingOwnerId = parsePendingId(pendingOwnerRaw);
    const pendingParentId = parsePendingId(pendingParentRaw);

    const coreKeys = new Set([
        'atome_id', 'atome_type', 'atomeId', 'atomeType', 'parent_id', 'owner_id', 'creator_id',
        'created_at', 'updated_at', 'deleted_at',
        'createdAt', 'updatedAt', 'deletedAt', 'lastSync', 'last_sync',
        // common aliases
        'id', 'type', 'kind', 'parent', 'parentId', 'owner', 'ownerId', 'userId',
        // response/meta
        'data', 'particles', 'atomes', 'count',
        '_pending_owner_id', '_pending_parent_id', 'pending_owner_id', 'pending_parent_id', 'pendingOwnerId', 'pendingParentId'
    ]);

    // Fastify WS list flattens particles at top-level (e.g. atome.left/top/color).
    // Rehydrate them into `particles` so UI persistence works.
    const stripPending = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const copy = { ...obj };
        delete copy._pending_owner_id;
        delete copy._pending_parent_id;
        delete copy.pending_owner_id;
        delete copy.pending_parent_id;
        delete copy.pendingOwnerId;
        delete copy.pendingParentId;
        return copy;
    };

    const particles = particlesFromParticlesField
        ? stripPending(particlesFromParticlesField)
        : (particlesFromDataField ? stripPending(particlesFromDataField) : {});

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

    const createdAt = raw.created_at ?? raw.createdAt;
    const updatedAt = raw.updated_at ?? raw.updatedAt;
    const deletedAt = raw.deleted_at ?? raw.deletedAt;
    const lastSync = raw.last_sync ?? raw.lastSync;

    const normalizeId = (value) => {
        if (value === null || value === undefined) return null;
        const str = String(value);
        if (!str || str === 'anonymous') return null;
        return str;
    };

    const atomeId = raw.atome_id || raw.atomeId || raw.id;
    const atomeType = raw.atome_type || raw.atomeType || raw.type;
    const resolvedOwnerId = normalizeId(raw.owner_id || raw.ownerId || raw.owner || raw.userId || pendingOwnerId);
    const resolvedParentId = normalizeId(raw.parent_id || raw.parentId || raw.parent || pendingParentId);

    return {
        ...raw,
        id: raw.id || atomeId,
        atome_id: atomeId,
        type: atomeType,
        atome_type: atomeType,
        parentId: resolvedParentId,
        parent_id: resolvedParentId,
        ownerId: resolvedOwnerId,
        owner_id: resolvedOwnerId,
        pending_owner_id: pendingOwnerId || null,
        pending_parent_id: pendingParentId || null,
        created_at: createdAt,
        updated_at: updatedAt,
        deleted_at: deletedAt,
        last_sync: lastSync,
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
        const authCheck = await ensure_fastify_ws_auth();
        if (!authCheck.ok) {
            results.fastify.error = authCheck.error;
            if (typeof callback === 'function') callback(results);
            return results;
        }

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
const ATOME_PENDING_DELETE_KEY = 'atome_pending_delete_ops_v1';
const FASTIFY_LOGIN_CACHE_KEY = 'fastify_login_cache_v1';

let _syncAtomesInProgress = false;
let _lastSyncAtomesAttempt = 0;
let _lastFastifyAutoLoginAttempt = 0;
let _lastFastifyAssetSync = 0;

function is_tauri_runtime() {
    try {
        return typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    } catch {
        return false;
    }
}

function save_fastify_login_cache({ phone, password }) {
    if (!is_tauri_runtime() || !phone || !password || typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(FASTIFY_LOGIN_CACHE_KEY, JSON.stringify({
            phone: String(phone),
            password: String(password),
            savedAt: new Date().toISOString()
        }));
    } catch {
        // Ignore
    }
}

function load_fastify_login_cache() {
    if (!is_tauri_runtime() || typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(FASTIFY_LOGIN_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.phone || !parsed?.password) return null;
        return parsed;
    } catch {
        return null;
    }
}

function clear_fastify_login_cache() {
    if (!is_tauri_runtime() || typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(FASTIFY_LOGIN_CACHE_KEY);
    } catch {
        // Ignore
    }
}

async function ensure_fastify_token() {
    if (!is_tauri_runtime()) return { ok: !!FastifyAdapter.getToken?.(), reason: 'not_tauri' };

    const existing = FastifyAdapter.getToken?.();
    if (existing) return { ok: true, reason: 'token_present' };

    const now = Date.now();
    if (_lastFastifyAutoLoginAttempt && (now - _lastFastifyAutoLoginAttempt < 15000)) {
        return { ok: false, reason: 'cooldown' };
    }

    const cached = load_fastify_login_cache();

    const attemptLogin = async (phone, password, reasonLabel) => {
        if (!phone || !password) return { ok: false, reason: reasonLabel };
        _lastFastifyAutoLoginAttempt = now;
        try {
            const res = await FastifyAdapter.auth.login({ phone, password });
            if (res && (res.ok || res.success)) {
                return { ok: true, reason: 'login_ok' };
            }
            return { ok: false, reason: res?.error || reasonLabel || 'login_failed', error: res?.error };
        } catch (e) {
            return { ok: false, reason: e.message || reasonLabel || 'login_failed', error: e.message };
        }
    };

    if (cached?.phone && cached?.password) {
        const result = await attemptLogin(cached.phone, cached.password, 'login_failed');
        if (result.ok) return result;

        const errMsg = String(result?.reason || '').toLowerCase();
        const shouldRegister = errMsg.includes('user not found')
            || errMsg.includes('no user')
            || errMsg.includes('not found')
            || errMsg.includes('invalid credentials');

        if (shouldRegister) {
            try {
                const current = await current_user();
                const registerUsername = current?.user?.username || cached.phone;
                const reg = await FastifyAdapter.auth.register({
                    phone: cached.phone,
                    password: cached.password,
                    username: registerUsername,
                    visibility: 'public'
                });
                if (reg && (reg.ok || reg.success || is_already_exists_error(reg))) {
                    const retry = await attemptLogin(cached.phone, cached.password, 'login_after_register_failed');
                    if (retry.ok) return retry;
                }
            } catch { }
        }
    }

    // Fallback: in this app the password is typically the phone number.
    // This allows Tauri to re-auth Fastify after offline use without a manual login.
    try {
        const current = await current_user();
        const phone = current?.user?.phone || null;
        if (phone) {
            return await attemptLogin(phone, phone, 'fallback_phone_password_failed');
        }
    } catch { }

    return { ok: false, reason: cached ? 'login_failed' : 'no_cached_credentials' };
}

async function ensure_fastify_ws_auth() {
    let token = FastifyAdapter.getToken?.();
    if (!token && is_tauri_runtime()) {
        try { await ensure_fastify_token(); } catch { }
        token = FastifyAdapter.getToken?.();
    }

    if (!token) {
        return { ok: false, error: 'Fastify auth required (login first)' };
    }

    try {
        const res = await FastifyAdapter.auth.me();
        if (res && (res.ok || res.success)) {
            return { ok: true };
        }
        return { ok: false, error: res?.error || 'Fastify auth failed' };
    } catch (e) {
        return { ok: false, error: e.message || 'Fastify auth failed' };
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
    let listOk = false;
    let listError = null;
    try {
        const res = await FastifyAdapter.atome.list({ type: 'user', limit, offset: 0, since: lastSync });
        if (res && (res.ok || res.success)) {
            fastifyUsers = res.atomes || res.data || [];
            listOk = true;
        } else {
            listError = res?.error || 'list_failed';
        }
    } catch {
        listError = 'list_failed';
    }

    if (!listOk) {
        return { ok: false, error: listError || 'list_failed' };
    }

    if (fastifyUsers.length === 0) {
        // Only advance the sync cursor if Fastify is actually reachable and list succeeded.
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

async function maybe_sync_atomes(reason = 'auto') {
    if (_syncAtomesInProgress) return { skipped: true, reason: 'in_progress' };
    if (!_currentUserId) {
        try {
            const currentResult = await current_user();
            if (currentResult?.logged && currentResult.user) {
                _currentUserId = currentResult.user.user_id || currentResult.user.atome_id || currentResult.user.id || null;
            }
        } catch { }
        if (!_currentUserId) return { skipped: true, reason: 'no_user' };
    }

    const now = Date.now();
    if (_lastSyncAtomesAttempt && (now - _lastSyncAtomesAttempt < 5000)) {
        return { skipped: true, reason: 'cooldown' };
    }

    let backends;
    try {
        backends = await checkBackends(true);
    } catch {
        return { skipped: true, reason: 'backend_check_failed' };
    }

    if (!backends.tauri || !backends.fastify) {
        return { skipped: true, reason: 'backend_unavailable' };
    }

    const tauriToken = TauriAdapter.getToken?.();
    let fastifyToken = FastifyAdapter.getToken?.();
    if (!fastifyToken && backends.fastify) {
        try { await ensure_fastify_token(); } catch { }
        fastifyToken = FastifyAdapter.getToken?.();
    }
    if (!tauriToken || !fastifyToken) {
        return { skipped: true, reason: 'missing_token' };
    }

    _syncAtomesInProgress = true;
    _lastSyncAtomesAttempt = now;
    try {
        await process_pending_deletes();
        return await sync_atomes();
    } catch (e) {
        return { skipped: false, error: e.message, reason };
    } finally {
        _syncAtomesInProgress = false;
    }
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

function load_pending_deletes() {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(ATOME_PENDING_DELETE_KEY);
        const queue = raw ? JSON.parse(raw) : [];
        return Array.isArray(queue) ? queue : [];
    } catch {
        return [];
    }
}

function save_pending_deletes(queue) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(ATOME_PENDING_DELETE_KEY, JSON.stringify(queue));
    } catch {
        // Ignore
    }
}

function get_pending_delete_ids() {
    const ids = new Set();
    const queue = load_pending_deletes();
    queue.forEach(item => {
        if (item?.atomeId) ids.add(String(item.atomeId));
    });
    return ids;
}

function queue_pending_delete({ atomeId, ownerId, type }) {
    if (!atomeId || typeof localStorage === 'undefined') return;
    const queue = load_pending_deletes();
    const entry = {
        atomeId: String(atomeId),
        ownerId: ownerId || null,
        type: type || null,
        queuedAt: new Date().toISOString()
    };
    const index = queue.findIndex(item => String(item?.atomeId) === String(atomeId));
    if (index >= 0) {
        queue[index] = { ...queue[index], ...entry };
    } else {
        queue.push(entry);
    }
    save_pending_deletes(queue);
}

function is_delete_already_applied(errorMessage) {
    const msg = String(errorMessage || '').toLowerCase();
    return msg.includes('not found') || msg.includes('deleted') || msg.includes('missing');
}

async function process_pending_deletes() {
    const queue = load_pending_deletes();
    if (!queue.length) return { processed: 0, remaining: 0 };

    if (is_tauri_runtime() && !FastifyAdapter.getToken?.()) {
        try { await ensure_fastify_token(); } catch { }
    }
    if (!FastifyAdapter.getToken?.()) {
        return { processed: 0, remaining: queue.length, error: 'missing_token' };
    }

    const remaining = [];
    let processed = 0;

    for (const item of queue) {
        const atomeId = item?.atomeId;
        if (!atomeId) continue;

        try {
            const res = await FastifyAdapter.atome.softDelete(atomeId);
            if (res?.ok || res?.success || is_delete_already_applied(res?.error)) {
                processed += 1;
                continue;
            }
        } catch (e) {
            if (is_delete_already_applied(e?.message)) {
                processed += 1;
                continue;
            }
        }

        remaining.push(item);
    }

    save_pending_deletes(remaining);
    return { processed, remaining: remaining.length };
}

let pendingRegisterMonitorStarted = false;
let pendingRegisterMonitorId = null;
let periodicSyncStarted = false;
let periodicSyncId = null;

function start_pending_register_monitor() {
    if (pendingRegisterMonitorStarted || typeof window === 'undefined') return;
    pendingRegisterMonitorStarted = true;

    const pollInterval = Math.max(CONFIG.CHECK_INTERVAL || 30000, 15000);
    pendingRegisterMonitorId = setInterval(async () => {
        const hasRegisters = has_pending_registers();
        const hasDeletes = load_pending_deletes().length > 0;
        if (!hasRegisters && !hasDeletes) return;
        try {
            const { fastify } = await checkBackends(true);
            if (fastify) {
                if (hasRegisters) await process_pending_registers();
                if (hasDeletes) await process_pending_deletes();
            }
        } catch {
            // Ignore
        }
    }, pollInterval);
}

function start_periodic_sync_monitor() {
    if (periodicSyncStarted || typeof window === 'undefined') return;
    periodicSyncStarted = true;

    const pollInterval = Math.max(CONFIG.CHECK_INTERVAL || 30000, 15000);
    periodicSyncId = setInterval(async () => {
        if (!is_tauri_runtime()) return;
        try {
            await maybe_sync_atomes('periodic');
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
    const loginSuccess = results?.login?.tauri?.success || results?.login?.fastify?.success;
    if (!loginSuccess && is_tauri_runtime()) {
        const registeredUser = results.tauri?.data?.user || results.fastify?.data?.user || null;
        const registeredId = registeredUser?.user_id || registeredUser?.id || registeredUser?.atome_id || null;
        if (registeredId) {
            try {
                await set_current_user_state(
                    registeredId,
                    registeredUser?.username || username || null,
                    registeredUser?.phone || phone || null,
                    false
                );
            } catch { }
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

    // If running in Tauri and the account exists locally but not on Fastify yet,
    // bootstrap the cloud account so sync can resume.
    try {
        const isTauriRuntime = is_tauri_runtime();
        const fastifyLoginError = String(results.fastify?.error || '').toLowerCase();
        const shouldBootstrapFastify = isTauriRuntime
            && results.tauri.success
            && !results.fastify.success
            && (fastifyLoginError.includes('user not found')
                || fastifyLoginError.includes('no user')
                || fastifyLoginError.includes('not found')
                || fastifyLoginError.includes('invalid credentials')
                || fastifyLoginError.includes('server unreachable')
                || fastifyLoginError.includes('failed to fetch'));

        if (shouldBootstrapFastify) {
            const tauriUser = results.tauri.data?.user || {};
            const registerUsername = tauriUser.username || username || phone;
            const shouldAttemptRegister = !!(phone && password && registerUsername);

            if (shouldAttemptRegister) {
                try {
                    const reg = await FastifyAdapter.auth.register({
                        phone,
                        password,
                        username: registerUsername,
                        visibility: 'public'
                    });

                    if (reg && (reg.ok || reg.success || is_already_exists_error(reg))) {
                        const retry = await FastifyAdapter.auth.login({ phone, password });
                        if (retry && (retry.ok || retry.success)) {
                            results.fastify = { success: true, data: retry, error: null };
                        }
                    }
                } catch (_) {
                    // Ignore; we'll fall back to pending register queue.
                }
            }

            if (!results.fastify.success) {
                queue_pending_register({ username: registerUsername, phone, password, createdOn: 'tauri' });
            }
        }
    } catch (_) {
        // Never fail login flow because of bootstrap attempt.
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
            && (tauriLoginError.includes('user not found') || tauriLoginError.includes('no user') || tauriLoginError.includes('not found') || tauriLoginError.includes('invalid credentials'))
            && !tauriLoginError.includes('server unreachable');

        if (canBootstrap) {
            const fastifyUser = results.fastify.data?.user || {};
            const registerUsername = fastifyUser.username || username;
            let bootstrapOk = false;

            try {
                const reg = await TauriAdapter.auth.bootstrap({
                    phone,
                    password,
                    username: registerUsername,
                    visibility: 'public'
                });

                const regOk = reg && (reg.ok || reg.success);
                const regErr = String(reg?.error || '').toLowerCase();
                if (regOk) {
                    results.tauri = { success: true, data: reg, error: null };
                    bootstrapOk = true;
                } else if (!regErr || !(regErr.includes('already') || regErr.includes('exists') || regErr.includes('registered'))) {
                    // Keep original tauri error; bootstrap failed.
                }
            } catch (_) {
                // Ignore bootstrap errors; we'll return original login results.
            }

            if (!bootstrapOk) {
                try {
                    const tauriRetry = await TauriAdapter.auth.login({ phone, password });
                    if (tauriRetry && (tauriRetry.ok || tauriRetry.success)) {
                        results.tauri = { success: true, data: tauriRetry, error: null };
                    }
                } catch (_) {
                    // Ignore
                }
            }
        }
    } catch (_) {
        // Never fail login flow because of bootstrap attempt.
    }

    // If login succeeded, update current user state and machine association
    if (results.tauri.success || results.fastify.success) {
        save_fastify_login_cache({ phone, password });

        const userData = results.tauri.data?.user || results.fastify.data?.user || {};
        const userId = userData.user_id || userData.id || userData.userId;
        const userName = userData.username || username;
        const userPhone = userData.phone || phone;

        if (userId) {
            await set_current_user_state(userId, userName, userPhone, true);
        }

        try { await maybe_sync_atomes('login'); } catch { }
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
    const hydrateCurrentUserState = async (user) => {
        if (!user || typeof user !== 'object') return;
        const userId = user.user_id || user.atome_id || user.id || null;
        if (!userId) return;
        if (_currentUserId !== userId || !_currentUserName || !_currentUserPhone) {
            try {
                await set_current_user_state(
                    userId,
                    user.username || _currentUserName || null,
                    user.phone || _currentUserPhone || null,
                    false
                );
            } catch { }
        }
    };

    // Try Tauri first
    try {
        const tauriResult = await TauriAdapter.auth.me();
        if (tauriResult.ok || tauriResult.success) {
            if (tauriResult.user) {
                result.logged = true;
                result.user = tauriResult.user;
                result.source = 'tauri';
                await hydrateCurrentUserState(tauriResult.user);

                if (is_tauri_runtime()) {
                    try {
                        await syncFastifyFileAssetsToTauri();
                    } catch (_) { }
                }

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
                await hydrateCurrentUserState(fastifyResult.user);

                if (is_tauri_runtime()) {
                    try {
                        await syncFastifyFileAssetsToTauri();
                    } catch (_) { }
                }

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
    if (_currentUserId && is_tauri_runtime()) {
        result.logged = true;
        result.user = {
            user_id: _currentUserId,
            username: _currentUserName || null,
            phone: _currentUserPhone || null
        };
        result.source = 'memory';
    }

    if (typeof callback === 'function') {
        callback(result);
    }

    if (is_tauri_runtime()) {
        try {
            await syncFastifyFileAssetsToTauri();
        } catch (_) { }
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

    clear_fastify_login_cache();
    _currentUserId = null;
    _currentUserName = null;
    _currentUserPhone = null;
    _currentProjectId = null;
    _currentProjectName = null;

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
        fastify: { users: [], error: null },
        directory: []
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

        // Expose the public directory separately to keep account lists clean.
        results.directory = merged;
        if (is_tauri_runtime()) {
            const cache = load_public_user_directory_cache();
            if (cache.length > 0) {
                results.directory = merge_user_directories(cache, merged);
            }
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
            try { await process_pending_deletes(); } catch { }
            try { await maybe_sync_atomes('fastify-available'); } catch { }
        });

        window.addEventListener('squirrel:sync-connected', async (event) => {
            if (event?.detail?.backend && event.detail.backend !== 'fastify') return;
            if (!is_tauri_runtime()) return;
            try { await maybe_sync_atomes('sync-connected'); } catch { }
        });

        window.addEventListener('squirrel:atome-deleted', async (event) => {
            if (!is_tauri_runtime()) return;
            const detail = event?.detail || {};
            const atomeId = detail.id || detail.atome_id || detail.atomeId;
            if (!atomeId) return;

            try {
                const res = await TauriAdapter.atome.softDelete(atomeId);
                if (!(res?.ok || res?.success || is_delete_already_applied(res?.error))) {
                    console.warn('[AdoleAPI] Failed to apply remote delete locally:', res?.error || 'unknown');
                }
            } catch (e) {
                if (!is_delete_already_applied(e?.message)) {
                    console.warn('[AdoleAPI] Failed to apply remote delete locally:', e?.message || 'unknown');
                }
            }
        });

        start_pending_register_monitor();
        start_periodic_sync_monitor();
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

    let ownerId = null;
    try {
        const currentUserResult = await current_user();
        ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
    } catch {
        ownerId = null;
    }
    console.log('[sync_atomes] list_unsynced start', { ownerId });

    // Known atome types to query (server requires a type when no owner specified)
    const atomeTypes = [
        'user', 'tenant', 'project', 'machine', 'atome', 'shape', 'color', 'text',
        'image', 'audio', 'video', 'code', 'data',
        'file', 'sound', 'raw', 'audio_recording', 'video_recording'
    ];
    const listLimit = 2000;

    let tauriAtomes = [];
    let fastifyAtomes = [];

    if (is_tauri_runtime() && !FastifyAdapter.getToken?.()) {
        try { await ensure_fastify_token(); } catch { }
    }
    console.log('[sync_atomes] fastify token', { present: !!FastifyAdapter.getToken?.() });

    // Helper to fetch all atomes of all types from an adapter (including deleted for sync)
    // Uses ownerId: "*" to get ALL atomes, not just current user's
    const fetchAllAtomes = async (adapter, name, owner) => {
        const allAtomes = [];
        let successCount = 0;
        let lastError = null;
        for (const type of atomeTypes) {
            try {
                // Include deleted atomes for sync comparison
                // Use ownerId: current user when available, otherwise fallback to "*"
                const result = await adapter.atome.list({
                    type,
                    includeDeleted: true,
                    ownerId: owner || '*',
                    limit: listLimit,
                    offset: 0
                });
                if (result.ok || result.success) {
                    successCount += 1;
                    const atomes = result.atomes || result.data || [];
                    allAtomes.push(...atomes);
                } else {
                    lastError = result.error || lastError;
                }
            } catch (e) {
                // Ignore errors for individual types
                lastError = e.message || lastError;
            }
        }
        if (successCount === 0) {
            throw new Error(lastError || `${name} list failed`);
        }
        return allAtomes;
    };

    const normalizeRefId = (value) => {
        if (value === null || value === undefined) return null;
        const str = String(value);
        if (!str || str === 'anonymous') return null;
        return str;
    };

    const resolveOwnerForSync = (atome) => {
        if (!atome || typeof atome !== 'object') return null;
        return normalizeRefId(
            atome.owner_id ||
            atome.ownerId ||
            atome.owner ||
            atome.userId ||
            atome.pending_owner_id ||
            atome.pendingOwnerId
        );
    };

    const resolveParentForSync = (atome) => {
        if (!atome || typeof atome !== 'object') return null;
        return normalizeRefId(
            atome.parent_id ||
            atome.parentId ||
            atome.parent ||
            atome.pending_parent_id ||
            atome.pendingParentId
        );
    };

    const filterOwnedAtomes = (atomes, owner) => {
        if (!owner) return atomes;
        return (Array.isArray(atomes) ? atomes : []).filter((atome) => {
            const atomeId = atome?.atome_id || atome?.id;
            const atomeType = atome?.atome_type || atome?.type;
            if (atomeType === 'user') {
                return normalizeRefId(atomeId) === owner;
            }
            const ownerId = resolveOwnerForSync(atome);
            return ownerId === owner;
        });
    };

    // Fetch all atomes from Tauri
    try {
        tauriAtomes = await fetchAllAtomes(TauriAdapter, 'Tauri', ownerId);
        tauriAtomes = tauriAtomes.map(normalizeAtomeRecord);
        tauriAtomes = filterOwnedAtomes(tauriAtomes, ownerId);
        console.log('[sync_atomes] list_unsynced tauri count', { count: tauriAtomes.length });
    } catch (e) {
        result.error = 'Tauri connection failed: ' + e.message;
        console.log('[sync_atomes] list_unsynced tauri error', { error: result.error });
        if (typeof callback === 'function') callback(result);
        return result;
    }

    // Fetch all atomes from Fastify
    try {
        fastifyAtomes = await fetchAllAtomes(FastifyAdapter, 'Fastify', ownerId);
        fastifyAtomes = fastifyAtomes.map(normalizeAtomeRecord);
        fastifyAtomes = filterOwnedAtomes(fastifyAtomes, ownerId);
        console.log('[sync_atomes] list_unsynced fastify count', { count: fastifyAtomes.length });
    } catch (e) {
        // If Fastify is offline, all Tauri atomes are "unsynced"
        result.onlyOnTauri = tauriAtomes.filter(a => !a.deleted_at);
        result.error = 'Fastify connection failed - all local atomes considered unsynced';
        console.log('[sync_atomes] list_unsynced fastify error', { error: result.error });
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
            'atome_id', 'atome_type', 'atomeId', 'atomeType',
            'parent_id', 'parentId', 'owner_id', 'ownerId', 'creator_id', 'userId',
            'sync_status', 'created_at', 'updated_at', 'deleted_at', 'last_sync',
            'createdAt', 'updatedAt', 'deletedAt', 'lastSync',
            'created_source', 'id', 'type', 'data', 'particles',
            '_pending_owner_id', '_pending_parent_id', 'pending_owner_id', 'pending_parent_id', 'pendingOwnerId', 'pendingParentId'
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
    const compareMetadata = (atome1, atome2) => {
        const type1 = atome1.atome_type || atome1.atomeType || atome1.type || null;
        const type2 = atome2.atome_type || atome2.atomeType || atome2.type || null;
        const owner1 = resolveOwnerForSync(atome1);
        const owner2 = resolveOwnerForSync(atome2);
        const parent1 = resolveParentForSync(atome1);
        const parent2 = resolveParentForSync(atome2);

        const typeDiff = type1 && type2 && type1 !== type2;
        const ownerDiff = owner1 !== owner2;
        const parentDiff = parent1 !== parent2;

        if (!typeDiff && !ownerDiff && !parentDiff) {
            return 'equal';
        }

        if (!owner1 && owner2) return 'fastify_newer';
        if (owner1 && !owner2) return 'tauri_newer';
        if (!parent1 && parent2) return 'fastify_newer';
        if (parent1 && !parent2) return 'tauri_newer';
        if (type1 && !type2) return 'tauri_newer';
        if (!type1 && type2) return 'fastify_newer';

        const updated1 = atome1.updated_at || atome1.updatedAt;
        const updated2 = atome2.updated_at || atome2.updatedAt;
        if (updated1 && updated2) {
            const date1 = new Date(updated1).getTime();
            const date2 = new Date(updated2).getTime();
            if (date1 > date2) return 'tauri_newer';
            if (date2 > date1) return 'fastify_newer';
        }

        return 'conflict';
    };

    const compareAtomes = (atome1, atome2) => {
        // Compare metadata first (owner/parent/type). If different, sync metadata.
        const metadataComparison = compareMetadata(atome1, atome2);
        if (metadataComparison !== 'equal') return metadataComparison;

        // Then compare particles content (the actual data)
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
        const tauriDeleted = tauriAtome?.deleted_at != null || tauriAtome?.deletedAt != null;
        const fastifyDeleted = fastifyAtome?.deleted_at != null || fastifyAtome?.deletedAt != null;

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

    console.log('[sync_atomes] list_unsynced summary', {
        onlyOnTauri: result.onlyOnTauri.length,
        onlyOnFastify: result.onlyOnFastify.length,
        modifiedOnTauri: result.modifiedOnTauri.length,
        modifiedOnFastify: result.modifiedOnFastify.length,
        deletedOnTauri: result.deletedOnTauri.length,
        deletedOnFastify: result.deletedOnFastify.length,
        conflicts: result.conflicts.length,
        synced: result.synced.length,
        error: result.error
    });

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
        deleted: {
            onFastify: { success: 0, failed: 0, errors: [] },
            onTauri: { success: 0, failed: 0, errors: [] }
        },
        conflicts: { count: 0, items: [] },
        alreadySynced: 0,
        error: null
    };

    if (!is_tauri_runtime()) {
        result.skipped = true;
        result.reason = 'not_tauri';
        console.log('[sync_atomes] sync skipped (not tauri)');
        if (typeof callback === 'function') callback(result);
        return result;
    }

    try {
        const fastifyBase = (FastifyAdapter && typeof FastifyAdapter.baseUrl === 'string')
            ? FastifyAdapter.baseUrl.trim()
            : '';
        const uploadBase = resolveFastifyUploadBase();
        const tokenPresent = !!FastifyAdapter.getToken?.();
        console.log('[sync_atomes] sync start', { fastifyBase, uploadBase, tokenPresent });
    } catch (_) { }

    // First, get the list of unsynced atomes
    let unsyncedResult;
    try {
        unsyncedResult = await list_unsynced_atomes();
        if (unsyncedResult.error) {
            result.error = unsyncedResult.error;
            console.log('[sync_atomes] sync aborted', { error: result.error });
            if (typeof callback === 'function') callback(result);
            return result;
        }
    } catch (e) {
        result.error = 'Failed to list unsynced atomes: ' + e.message;
        console.log('[sync_atomes] sync failed', { error: result.error });
        if (typeof callback === 'function') callback(result);
        return result;
    }

    result.alreadySynced = unsyncedResult.synced.length;
    console.log('[sync_atomes] unsynced counts', {
        onlyOnTauri: unsyncedResult.onlyOnTauri.length,
        onlyOnFastify: unsyncedResult.onlyOnFastify.length,
        modifiedOnTauri: unsyncedResult.modifiedOnTauri.length,
        modifiedOnFastify: unsyncedResult.modifiedOnFastify.length,
        deletedOnTauri: unsyncedResult.deletedOnTauri.length,
        deletedOnFastify: unsyncedResult.deletedOnFastify.length,
        conflicts: unsyncedResult.conflicts.length,
        synced: unsyncedResult.synced.length
    });

    let currentUserId = _currentUserId;
    if (!currentUserId) {
        try {
            const currentResult = await current_user();
            currentUserId = currentResult.user?.user_id || currentResult.user?.atome_id || currentResult.user?.id || null;
        } catch { }
    }

    // 0. Propagate deletions before any create/update to prevent resurrecting records.
    for (const item of unsyncedResult.deletedOnTauri || []) {
        try {
            const deleteResult = await FastifyAdapter.atome.softDelete(item.id);
            if (deleteResult.ok || deleteResult.success || is_delete_already_applied(deleteResult.error)) {
                result.deleted.onFastify.success++;
            } else {
                result.deleted.onFastify.failed++;
                result.deleted.onFastify.errors.push({ id: item.id, error: deleteResult.error });
                queue_pending_delete({ atomeId: item.id, ownerId: item.tauri?.owner_id, type: item.tauri?.atome_type || null });
            }
        } catch (e) {
            if (is_delete_already_applied(e?.message)) {
                result.deleted.onFastify.success++;
            } else {
                result.deleted.onFastify.failed++;
                result.deleted.onFastify.errors.push({ id: item.id, error: e.message });
                queue_pending_delete({ atomeId: item.id, ownerId: item.tauri?.owner_id, type: item.tauri?.atome_type || null });
            }
        }
    }

    for (const item of unsyncedResult.deletedOnFastify || []) {
        try {
            const deleteResult = await TauriAdapter.atome.softDelete(item.id);
            if (deleteResult.ok || deleteResult.success || is_delete_already_applied(deleteResult.error)) {
                result.deleted.onTauri.success++;
            } else {
                result.deleted.onTauri.failed++;
                result.deleted.onTauri.errors.push({ id: item.id, error: deleteResult.error });
            }
        } catch (e) {
            if (is_delete_already_applied(e?.message)) {
                result.deleted.onTauri.success++;
            } else {
                result.deleted.onTauri.failed++;
                result.deleted.onTauri.errors.push({ id: item.id, error: e.message });
            }
        }
    }

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
            'atome_id', 'atome_type', 'atomeId', 'atomeType',
            'parent_id', 'parentId', 'owner_id', 'ownerId', 'creator_id', 'userId',
            'sync_status', 'created_at', 'updated_at', 'deleted_at', 'last_sync',
            'createdAt', 'updatedAt', 'deletedAt', 'lastSync',
            'created_source', 'id', 'type', 'data', 'particles',
            '_pending_owner_id', '_pending_parent_id', 'pending_owner_id', 'pending_parent_id', 'pendingOwnerId', 'pendingParentId'
        ];

        const inlineParticles = {};
        for (const [key, value] of Object.entries(atome)) {
            if (!metadataFields.includes(key) && value !== null && value !== undefined) {
                inlineParticles[key] = value;
            }
        }
        return inlineParticles;
    };

    const normalizeRefId = (value) => {
        if (value === null || value === undefined) return null;
        const str = String(value);
        if (!str || str === 'anonymous') return null;
        return str;
    };

    const resolveOwnerForSync = (atome) => normalizeRefId(
        atome?.owner_id ||
        atome?.ownerId ||
        atome?.owner ||
        atome?.userId ||
        atome?.pending_owner_id ||
        atome?.pendingOwnerId ||
        null
    );

    const resolveParentForSync = (atome) => normalizeRefId(
        atome?.parent_id ||
        atome?.parentId ||
        atome?.parent ||
        atome?.pending_parent_id ||
        atome?.pendingParentId ||
        null
    );

    const buildUpsertPayload = (atome) => {
        const id = atome?.atome_id || atome?.id;
        const type = atome?.atome_type || atome?.type || atome?.atomeType || atome?.kind;
        const ownerId = resolveOwnerForSync(atome) || currentUserId || null;
        const parentId = resolveParentForSync(atome);
        const particles = extractParticles(atome);

        return {
            id,
            type,
            ownerId,
            parentId,
            particles
        };
    };

    const normalizePath = (value) => {
        if (!value) return '';
        return String(value).trim().replace(/\\/g, '/').replace(/^file:\/\//i, '');
    };

    const isAbsolutePath = (value) => {
        if (!value) return false;
        const str = String(value);
        return str.startsWith('/') || /^[A-Za-z]:[\\/]/.test(str);
    };

    const resolveProjectRoot = () => {
        if (typeof window === 'undefined') return '';
        const root = window.__ATOME_PROJECT_ROOT__;
        if (typeof root !== 'string') return '';
        const cleaned = root.trim().replace(/\\/g, '/').replace(/\/$/, '');
        return cleaned;
    };

    const ensureProjectRoot = async () => {
        if (!is_tauri_runtime()) return resolveProjectRoot();
        const current = resolveProjectRoot();
        if (current) return current;
        if (ensureProjectRoot.pending) return ensureProjectRoot.pending;

        const invoke = (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function')
            ? window.__TAURI__.invoke.bind(window.__TAURI__)
            : (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function')
                ? window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__)
                : null;

        ensureProjectRoot.pending = (async () => {
            if (!invoke) return '';
            try {
                const result = await invoke('project_root');
                if (typeof result === 'string' && result.trim()) {
                    window.__ATOME_PROJECT_ROOT__ = result;
                }
            } catch (_) { }
            return resolveProjectRoot();
        })();

        return ensureProjectRoot.pending;
    };

    const qualifyProjectPath = (value) => {
        if (!value) return value;
        if (isAbsolutePath(value)) return value;
        const root = resolveProjectRoot();
        if (!root) return value;
        return `${root}/${String(value).replace(/^\/+/, '')}`;
    };

    const normalizeUserRelativePath = (value, userId) => {
        if (!value) return '';
        const safeUser = String(userId || '').trim();
        let cleaned = normalizePath(value);
        if (!cleaned) return '';
        const anchor = `/data/users/${safeUser}/`;
        const altAnchor = `data/users/${safeUser}/`;
        if (safeUser && cleaned.includes(anchor)) {
            cleaned = cleaned.slice(cleaned.indexOf(anchor) + anchor.length);
        } else if (safeUser && cleaned.startsWith(altAnchor)) {
            cleaned = cleaned.slice(altAnchor.length);
        } else if (safeUser && cleaned.startsWith(`${safeUser}/`)) {
            cleaned = cleaned.slice(`${safeUser}/`.length);
        }
        cleaned = cleaned.replace(/^\/+/, '');
        return cleaned;
    };

    const resolveLocalAssetPath = (value, userId, fallbackName) => {
        if (value) {
            const normalized = normalizePath(value);
            if (normalized) {
                if (isAbsolutePath(normalized)) return normalized;
                if (normalized.startsWith('data/users/')) return qualifyProjectPath(normalized);
                if (userId) return qualifyProjectPath(`data/users/${userId}/${normalized}`);
                return qualifyProjectPath(normalized);
            }
        }
        if (userId && fallbackName) {
            return qualifyProjectPath(`data/users/${userId}/Downloads/${fallbackName}`);
        }
        return fallbackName ? qualifyProjectPath(fallbackName) : '';
    };

    const resolveFastifyUploadBase = () => {
        const adapterBase = (FastifyAdapter && typeof FastifyAdapter.baseUrl === 'string')
            ? FastifyAdapter.baseUrl.trim()
            : '';
        if (adapterBase) {
            return adapterBase
                .replace(/^wss:/, 'https:')
                .replace(/^ws:/, 'http:')
                .replace(/\/$/, '');
        }
        const explicit = (typeof window !== 'undefined' && typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
            ? window.__SQUIRREL_FASTIFY_URL__.trim()
            : '';
        if (explicit) return explicit.replace(/\/$/, '');
        try {
            return String(location.origin || '').replace(/\/$/, '');
        } catch {
            return '';
        }
    };

    const isLocalFastifyBase = (base) => {
        if (!base) return false;
        try {
            const parsed = new URL(base);
            return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
        } catch {
            return false;
        }
    };

    const resolveLocalAxumBase = () => {
        if (typeof window !== 'undefined' && window.__ATOME_LOCAL_HTTP_PORT__) {
            return `http://127.0.0.1:${window.__ATOME_LOCAL_HTTP_PORT__}`;
        }
        const base = CONFIG?.TAURI_BASE_URL || 'http://127.0.0.1:3000';
        return base.replace(/\/$/, '');
    };

    const buildLocalAuthHeaders = (ownerId) => {
        const headers = {};
        const token = TauriAdapter?.getToken?.();
        if (token) headers.Authorization = `Bearer ${token}`;
        if (ownerId) headers['X-User-Id'] = ownerId;
        return headers;
    };

    const resolveLocalRelativePath = (value, ownerId, fallbackName) => {
        let relative = normalizeUserRelativePath(value || '', ownerId);
        if (!relative && fallbackName) {
            relative = `Downloads/${fallbackName}`;
        }
        if (!relative) return '';
        const normalized = normalizePath(relative) || relative;
        const lower = normalized.toLowerCase();
        if (lower.startsWith('downloads/')) return `Downloads/${normalized.slice('downloads/'.length)}`;
        if (lower.startsWith('recordings/')) return `recordings/${normalized.slice('recordings/'.length)}`;
        if (lower === 'downloads' || lower === 'recordings') return lower;
        return `Downloads/${normalized.replace(/^\/+/, '')}`;
    };

    const fetchLocalJson = async (url, options = {}) => {
        try {
            const response = await fetch(url, {
                credentials: 'include',
                ...options
            });
            const text = await response.text().catch(() => '');
            let data = null;
            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                data = text;
            }
            return {
                ok: response.ok,
                status: response.status,
                data
            };
        } catch (e) {
            return {
                ok: false,
                status: 0,
                data: e?.message || 'local_fetch_failed'
            };
        }
    };

    const fetchLocalBinary = async (url, options = {}) => {
        try {
            const response = await fetch(url, {
                credentials: 'include',
                ...options
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                return {
                    ok: false,
                    status: response.status,
                    error: text || `HTTP ${response.status}`
                };
            }
            const buffer = await response.arrayBuffer();
            return {
                ok: true,
                status: response.status,
                bytes: new Uint8Array(buffer)
            };
        } catch (e) {
            return {
                ok: false,
                status: 0,
                error: e?.message || 'local_fetch_failed'
            };
        }
    };

    const readTauriBinaryFile = async (localPath, ownerId, filePath, fallbackName) => {
        if (!is_tauri_runtime()) return null;
        const relativePath = resolveLocalRelativePath(filePath || localPath, ownerId, fallbackName);
        if (!relativePath) return null;
        const base = resolveLocalAxumBase();
        const headers = buildLocalAuthHeaders(ownerId);
        const url = `${base}/api/local-files?path=${encodeURIComponent(relativePath)}`;
        const result = await fetchLocalBinary(url, { method: 'GET', headers });
        if (!result.ok) {
            console.log('[sync_atomes] local_axum read_failed', {
                path: relativePath,
                error: result.error || result.data || 'local_read_failed'
            });
            return null;
        }
        return result.bytes || null;
    };

const WS_FILE_CHUNK_SIZE = 256 * 1024;
const _localFsLogState = { pull: false, push: false };

const listTauriDirEntries = async (ownerId, relativePath) => {
    if (!is_tauri_runtime()) {
        return { ok: false, error: 'not_tauri', entries: [] };
    }
    const base = resolveLocalAxumBase();
    const headers = buildLocalAuthHeaders(ownerId);
    const url = `${base}/api/local-files/list?path=${encodeURIComponent(relativePath || '')}`;
    const result = await fetchLocalJson(url, { method: 'GET', headers });
    if (!result.ok) {
        return {
            ok: false,
            error: result.data?.error || result.data || 'local_list_failed',
            entries: []
        };
    }
    const entries = Array.isArray(result.data?.entries) ? result.data.entries : [];
    return { ok: true, entries };
};

const logLocalDownloadsSnapshot = async (ownerId, filePath, reason) => {
    if (!is_tauri_runtime()) return;
    const relativePath = resolveLocalRelativePath(filePath || '', ownerId, null);
    const result = await listTauriDirEntries(ownerId, relativePath);
    const entries = result.entries.slice(0, 50).map((entry) => entry.name || entry.path || '');
    console.log('[sync_atomes] local_dir_snapshot', {
        reason,
        ownerId,
        dir: relativePath || 'Downloads',
        ok: result.ok,
        error: result.error,
        entries
    });
};

const logTauriFsStatusOnce = (mode, localPath) => {
    if (!is_tauri_runtime()) return;
    if (_localFsLogState[mode]) return;
    console.log('[sync_atomes] local_fs', {
        mode,
        base: resolveLocalAxumBase(),
        hasToken: !!TauriAdapter?.getToken?.(),
        projectRoot: resolveProjectRoot(),
        localPath
    });
    _localFsLogState[mode] = true;
};

    const bytesToBase64 = (bytes) => {
        if (!bytes || !bytes.length) return '';
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64');
        }
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const slice = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, slice);
        }
        return btoa(binary);
    };

    const base64ToBytes = (base64) => {
        if (!base64) return new Uint8Array(0);
        if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(base64, 'base64'));
        }
        const binary = atob(base64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            out[i] = binary.charCodeAt(i);
        }
        return out;
    };

    const concatChunks = (chunks, total) => {
        if (!chunks || !chunks.length) return new Uint8Array(0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    };

    const tryTauriWriteBinaryFile = async (localPath, bytes, ownerId, filePath, fallbackName) => {
        if (!is_tauri_runtime()) {
            return { ok: false, error: 'not_tauri' };
        }
        const relativePath = resolveLocalRelativePath(filePath || localPath, ownerId, fallbackName);
        if (!relativePath) {
            return { ok: false, error: 'local_path_missing' };
        }
        const base = resolveLocalAxumBase();
        const headers = {
            'Content-Type': 'application/octet-stream',
            ...buildLocalAuthHeaders(ownerId)
        };
        const url = `${base}/api/local-files?path=${encodeURIComponent(relativePath)}`;
        const payload = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
        const result = await fetchLocalJson(url, { method: 'POST', headers, body: payload });
        if (!result.ok) {
            console.log('[sync_atomes] local_axum write_failed', {
                path: relativePath,
                error: result.data?.error || result.data || 'local_write_failed'
            });
            return { ok: false, error: result.data?.error || result.data || 'local_write_failed' };
        }
        return { ok: true, data: result.data };
    };

    const tryTauriStat = async (localPath, ownerId, filePath, fallbackName) => {
        if (!is_tauri_runtime()) return null;
        const relativePath = resolveLocalRelativePath(filePath || localPath, ownerId, fallbackName);
        if (!relativePath) return null;
        const base = resolveLocalAxumBase();
        const headers = buildLocalAuthHeaders(ownerId);
        const url = `${base}/api/local-files/meta?path=${encodeURIComponent(relativePath)}`;
        const result = await fetchLocalJson(url, { method: 'GET', headers });
        if (!result.ok) return null;
        if (result.data?.exists === false || result.data?.success === false) return null;
        return result.data;
    };

    const isFileAssetAtome = (atome) => {
        if (!is_file_asset_type(atome?.atome_type || atome?.type)) return false;
        const { fileName, originalName, filePath } = extractFileMeta(atome);
        return Boolean(filePath || fileName || originalName);
    };

    const extractFileMeta = (atome) => {
        const particles = extractParticles(atome);
        const fileName = particles.file_name || particles.fileName || atome?.file_name || '';
        const originalName = particles.original_name || particles.originalName || fileName;
        const filePath = particles.file_path || particles.filePath || particles.path || particles.rel_path || '';
        const mimeType = particles.mime_type || particles.mimeType || '';
        const sizeBytes = particles.size_bytes || particles.sizeBytes || particles.size || null;
        return { particles, fileName, originalName, filePath, mimeType, sizeBytes };
    };

    const downloadFileAssetFromFastify = async (atome) => {
        if (!is_tauri_runtime()) {
            console.log('[sync_atomes] asset pull blocked: not_tauri');
            return { ok: false, error: 'not_tauri' };
        }
        await ensureProjectRoot();
        const atomeId = atome?.atome_id || atome?.id;
        if (!atomeId) {
            console.log('[sync_atomes] asset pull blocked: missing_atome_id');
            return { ok: false, error: 'missing_atome_id' };
        }

        const ownerId = resolveOwnerForSync(atome) || currentUserId || null;
        const { fileName, originalName, filePath, sizeBytes } = extractFileMeta(atome);
        const safeFileName = fileName || originalName || atomeId;
        const localPath = resolveLocalAssetPath(filePath, ownerId, safeFileName);
        logTauriFsStatusOnce('pull', localPath);
        if (!localPath) {
            console.log('[sync_atomes] asset pull blocked: local_path_missing', {
                atomeId,
                ownerId,
                fileName: safeFileName,
                filePath
            });
            return { ok: false, error: 'local_path_missing' };
        }

        const token = FastifyAdapter?.getToken ? FastifyAdapter.getToken() : null;
        if (!token) {
            console.log('[sync_atomes] asset pull blocked: fastify_token_missing', { atomeId, ownerId });
            return { ok: false, error: 'fastify_token_missing' };
        }

        if (sizeBytes != null) {
            const meta = await tryTauriStat(localPath, ownerId, filePath, safeFileName);
            const localSize = typeof meta?.size === 'number'
                ? meta.size
                : (typeof meta?.len === 'number' ? meta.len : null);
            if (localSize != null && Number(localSize) === Number(sizeBytes)) {
                console.log('[sync_atomes] asset pull skipped: size_match', {
                    atomeId,
                    ownerId,
                    sizeBytes,
                    localPath
                });
                return { ok: true, skipped: true, reason: 'size_match' };
            }
        }

        console.log('[sync_atomes] asset pull attempt', {
            atomeId,
            ownerId,
            fileName: safeFileName,
            filePath,
            localPath,
            sizeBytes
        });

        try {
            const infoResult = await FastifyAdapter.file.downloadInfo({
                atomeId,
                chunkSize: WS_FILE_CHUNK_SIZE,
                debug: true
            });

            if (!(infoResult?.ok || infoResult?.success)) {
                const error = infoResult?.error || 'download_info_failed';
                console.log('[sync_atomes] asset pull failed', {
                    atomeId,
                    fileName: safeFileName,
                    error
                });
                return { ok: false, error };
            }

            const info = infoResult?.data || {};
            if (info?.downloadsSnapshot) {
                console.log('[sync_atomes] server_dir_snapshot', info.downloadsSnapshot);
            }
            const totalSize = Number(info.sizeBytes ?? info.size ?? sizeBytes ?? 0);
            const chunkSize = Number(info.chunkSize) || WS_FILE_CHUNK_SIZE;
            let chunkCount = Number(info.chunkCount);
            if (!Number.isFinite(chunkCount) || chunkCount < 0) {
                chunkCount = totalSize ? Math.ceil(totalSize / chunkSize) : 0;
            } else if (chunkCount === 0 && totalSize) {
                chunkCount = Math.ceil(totalSize / chunkSize);
            }
            const useFixedSize = totalSize > 0;
            const fixedBuffer = useFixedSize ? new Uint8Array(totalSize) : null;
            const chunks = useFixedSize ? null : [];
            let collectedSize = 0;

            for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
                const chunkResult = await FastifyAdapter.file.downloadChunk({
                    atomeId,
                    chunkIndex,
                    chunkSize
                });

                if (!(chunkResult?.ok || chunkResult?.success)) {
                    const error = chunkResult?.error || 'download_chunk_failed';
                    console.log('[sync_atomes] asset pull failed', {
                        atomeId,
                        fileName: safeFileName,
                        error,
                        chunkIndex
                    });
                    return { ok: false, error };
                }

                const chunkPayload = chunkResult?.data || {};
                const chunkBase64 = chunkPayload.chunkBase64 || chunkPayload.chunk_base64 || '';
                const chunkBytes = base64ToBytes(chunkBase64);

                if (useFixedSize) {
                    fixedBuffer.set(chunkBytes, chunkIndex * chunkSize);
                } else {
                    chunks.push(chunkBytes);
                    collectedSize += chunkBytes.length;
                }
            }

            const finalBytes = useFixedSize ? fixedBuffer : concatChunks(chunks, collectedSize);
            const writeResult = await tryTauriWriteBinaryFile(localPath, finalBytes, ownerId, filePath, safeFileName);
            if (!writeResult.ok) {
                console.log('[sync_atomes] asset pull failed', {
                    atomeId,
                    fileName: safeFileName,
                    error: writeResult.error || 'write_failed',
                    localPath
                });
                await logLocalDownloadsSnapshot(ownerId, filePath, 'pull_write_failed');
                return { ok: false, error: writeResult.error || 'write_failed' };
            }

            return { ok: true, path: localPath, size: finalBytes.length };
        } catch (e) {
            const error = e?.message || 'download_failed';
            console.log('[sync_atomes] asset pull failed', {
                atomeId,
                fileName: safeFileName,
                error
            });
            return { ok: false, error };
        }
    };

    const listFastifyAtomesByType = async (type, ownerId) => {
        const items = [];
        const seen = new Set();
        const limit = 500;
        let offset = 0;
        let page = 0;

        while (page < 20) {
            const query = { type, owner_id: ownerId, limit, offset };
            let response;
            try {
                response = await FastifyAdapter.atome.list(query);
            } catch (e) {
                return { ok: false, error: e?.message || 'fastify_list_failed', items };
            }

            if (!(response?.ok || response?.success)) {
                const errMsg = String(response?.error || '').toLowerCase();
                const authError = errMsg.includes('unauth') || errMsg.includes('token') || errMsg.includes('login');
                if (is_tauri_runtime() && authError) {
                    try { await ensure_fastify_token(); } catch { }
                    try {
                        response = await FastifyAdapter.atome.list(query);
                    } catch (e) {
                        return { ok: false, error: e?.message || 'fastify_list_failed', items };
                    }
                }
            }

            if (!(response?.ok || response?.success)) {
                return { ok: false, error: response?.error || 'fastify_list_failed', items };
            }

            const raw = response.atomes || response.data || [];
            const normalized = Array.isArray(raw) ? raw.map(normalizeAtomeRecord) : [];

            let added = 0;
            normalized.forEach((item) => {
                const id = item?.atome_id || item?.id;
                if (!id || seen.has(id)) return;
                seen.add(id);
                items.push(item);
                added += 1;
            });

            if (!normalized.length || normalized.length < limit || added === 0) {
                break;
            }

            offset += limit;
            page += 1;
        }

        return { ok: true, items };
    };

    const syncFastifyFileAssetsToTauri = async () => {
        if (!is_tauri_runtime()) return { ok: false, reason: 'not_tauri' };
        if (window?.__SQUIRREL_DISABLE_FILE_ASSET_SYNC__ === true) {
            console.log('[sync_atomes] asset pull skipped: disabled');
            return { ok: false, reason: 'disabled' };
        }

        const now = Date.now();
        if (now - _lastFastifyAssetSync < 30_000) {
            console.log('[sync_atomes] asset pull skipped: throttled');
            return { ok: true, skipped: true, reason: 'throttled' };
        }
        _lastFastifyAssetSync = now;

        if (!FastifyAdapter?.getToken?.()) {
            try { await ensure_fastify_token(); } catch { }
        }
        const token = FastifyAdapter?.getToken?.();
        if (!token) {
            console.log('[sync_atomes] asset pull blocked: fastify_token_missing');
            return { ok: false, reason: 'fastify_token_missing' };
        }

        let ownerId = currentUserId;
        if (!ownerId) {
            try {
                const current = await current_user();
                ownerId = current?.user?.user_id || current?.user?.atome_id || current?.user?.id || null;
            } catch { }
        }
        if (!ownerId) {
            console.log('[sync_atomes] asset pull blocked: owner_missing');
            return { ok: false, reason: 'owner_missing' };
        }

        const fastifyBase = resolveFastifyUploadBase();
        console.log('[sync_atomes] asset pull start', { ownerId, fastifyBase });

        const summary = { ok: true, attempted: 0, downloaded: 0, skipped: 0, failed: 0 };
        for (const type of FILE_ASSET_TYPES) {
            const listResult = await listFastifyAtomesByType(type, ownerId);
            if (!listResult.ok) {
                console.log('[sync_atomes] asset pull list failed', {
                    type,
                    error: listResult.error
                });
                continue;
            }

            for (const atome of listResult.items) {
                const result = await downloadFileAssetFromFastify(atome);
                if (result.ok && result.skipped) {
                    summary.skipped += 1;
                    continue;
                }
                if (result.ok) {
                    summary.downloaded += 1;
                } else {
                    summary.failed += 1;
                }
                summary.attempted += 1;
            }
        }

        console.log('[sync_atomes] asset pull summary', summary);
        return summary;
    };

    const uploadFileAssetToFastify = async (atome) => {
        const atomeId = atome?.atome_id || atome?.id;
        if (!atomeId) return { ok: false, error: 'missing_atome_id' };

        await ensureProjectRoot();
        const ownerId = resolveOwnerForSync(atome) || currentUserId || null;
        const type = String(atome?.atome_type || atome?.type || '').trim().toLowerCase();
        const { fileName, originalName, filePath, mimeType, sizeBytes } = extractFileMeta(atome);
        const safeFileName = fileName || originalName || atomeId;
        const relativePath = normalizeUserRelativePath(filePath || safeFileName, ownerId)
            || (safeFileName ? `Downloads/${safeFileName}` : '');

        const localPath = resolveLocalAssetPath(filePath, ownerId, safeFileName);
        logTauriFsStatusOnce('push', localPath);
        console.log('[sync_atomes] asset push start', {
            atomeId,
            ownerId,
            fileName: safeFileName,
            filePath,
            localPath,
            sizeBytes
        });
        const bytes = await readTauriBinaryFile(localPath, ownerId, filePath, safeFileName);
        if (!bytes || !bytes.length) {
            console.log('[sync_atomes] asset push blocked: local_asset_missing', {
                atomeId,
                ownerId,
                fileName: safeFileName,
                localPath
            });
            await logLocalDownloadsSnapshot(ownerId, filePath, 'push_missing');
            return { ok: false, error: 'local_asset_missing' };
        }

        const token = FastifyAdapter?.getToken ? FastifyAdapter.getToken() : null;
        if (!token) {
            return { ok: false, error: 'fastify_token_missing' };
        }

        try {
            const uploadId = generateUUID ? generateUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const totalSize = bytes.length;
            const chunkCount = totalSize ? Math.ceil(totalSize / WS_FILE_CHUNK_SIZE) : 0;

            for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
                const start = chunkIndex * WS_FILE_CHUNK_SIZE;
                const end = Math.min(totalSize, start + WS_FILE_CHUNK_SIZE);
                const chunkBytes = bytes.subarray(start, end);
                const chunkBase64 = bytesToBase64(chunkBytes);
                const chunkResult = await FastifyAdapter.file.uploadChunk({
                    uploadId,
                    chunkIndex,
                    chunkCount,
                    chunkBase64
                });
                if (!(chunkResult?.ok || chunkResult?.success)) {
                    const msg = chunkResult?.error || 'upload_chunk_failed';
                    console.log('[sync_atomes] asset push failed', {
                        atomeId,
                        fileName: safeFileName,
                        chunkIndex,
                        error: msg
                    });
                    return { ok: false, error: msg };
                }
            }

            const completeResult = await FastifyAdapter.file.uploadComplete({
                uploadId,
                chunkCount,
                fileName: safeFileName,
                filePath: relativePath,
                atomeId,
                atomeType: type || '',
                originalName: originalName || safeFileName,
                mimeType: mimeType || '',
                debug: true
            });

            if (!(completeResult?.ok || completeResult?.success)) {
                const msg = completeResult?.error || 'upload_complete_failed';
                console.log('[sync_atomes] asset push failed', {
                    atomeId,
                    fileName: safeFileName,
                    error: msg
                });
                return { ok: false, error: msg };
            }

            if (completeResult?.data?.downloadsSnapshot) {
                console.log('[sync_atomes] server_dir_snapshot', completeResult.data.downloadsSnapshot);
            }
            console.log('[sync_atomes] asset push ok', {
                atomeId,
                fileName: safeFileName,
                sizeBytes: totalSize,
                path: relativePath
            });
            return { ok: true, createdAtome: false, sizeBytes: totalSize, path: relativePath };
        } catch (e) {
            console.log('[sync_atomes] asset push failed', {
                atomeId,
                fileName: safeFileName,
                error: e?.message || 'upload_failed'
            });
            return { ok: false, error: e?.message || 'upload_failed' };
        }
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
            if (isFileAssetAtome(atome)) {
                const uploadResult = await uploadFileAssetToFastify(atome);
                if (!uploadResult.ok) {
                    result.pushed.failed++;
                    result.pushed.errors.push({ id: atome.atome_id, error: uploadResult.error });
                    continue;
                }
                if (uploadResult.createdAtome) {
                    result.pushed.success++;
                    continue;
                }
            }
            const payload = buildUpsertPayload(atome);
            const createResult = await FastifyAdapter.atome.create(payload);

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
            const payload = buildUpsertPayload(atome);
            const createResult = await TauriAdapter.atome.create(payload);

            if (createResult.ok || createResult.success) {
                result.pulled.success++;
                if (isFileAssetAtome(atome)) {
                    const downloadResult = await downloadFileAssetFromFastify(atome);
                    if (!downloadResult.ok) {
                        result.pulled.errors.push({
                            id: atome.atome_id || atome.id,
                            error: downloadResult.error || 'asset_download_failed',
                            asset: true
                        });
                    }
                }
            } else {
                result.pulled.failed++;
                result.pulled.errors.push({ id: atome.atome_id, error: createResult.error });
            }
        } catch (e) {
            result.pulled.failed++;
            result.pulled.errors.push({ id: atome.atome_id, error: e.message });
        }
    }

    // 3. Update Fastify with newer Tauri modifications (upsert to sync metadata too)
    for (const item of unsyncedResult.modifiedOnTauri) {
        try {
            if (isFileAssetAtome(item.tauri)) {
                const uploadResult = await uploadFileAssetToFastify(item.tauri);
                if (!uploadResult.ok) {
                    result.updated.failed++;
                    result.updated.errors.push({ id: item.id, error: uploadResult.error });
                    continue;
                }
                if (uploadResult.createdAtome) {
                    result.updated.success++;
                    continue;
                }
            }
            const payload = buildUpsertPayload(item.tauri);
            const updateResult = await FastifyAdapter.atome.create(payload);

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

    // 4. Update Tauri with newer Fastify modifications (upsert to sync metadata too)
    for (const item of unsyncedResult.modifiedOnFastify) {
        try {
            const payload = buildUpsertPayload(item.fastify);
            const updateResult = await TauriAdapter.atome.create(payload);

            if (updateResult.ok || updateResult.success) {
                result.updated.success++;
                if (isFileAssetAtome(item.fastify)) {
                    const downloadResult = await downloadFileAssetFromFastify(item.fastify);
                    if (!downloadResult.ok) {
                        result.updated.errors.push({
                            id: item.id,
                            error: downloadResult.error || 'asset_download_failed',
                            asset: true
                        });
                    }
                }
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

    if (is_tauri_runtime()) {
        try {
            await syncFastifyFileAssetsToTauri();
        } catch (_) { }
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

        if (is_tauri_runtime() && !FastifyAdapter.getToken?.()) {
            try { await ensure_fastify_token(); } catch { }
        }

        let fastifyResult = await FastifyAdapter.atome.create(fastifyPayload);
        if (!(fastifyResult.ok || fastifyResult.success)) {
            const errMsg = String(fastifyResult.error || '').toLowerCase();
            const authError = errMsg.includes('unauth') || errMsg.includes('token') || errMsg.includes('login');
            if (is_tauri_runtime() && authError) {
                try { await ensure_fastify_token(); } catch { }
                fastifyResult = await FastifyAdapter.atome.create(fastifyPayload);
            }
        }
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
    }

    if (is_tauri_runtime()) {
        try { await maybe_sync_atomes('create_project'); } catch { }
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

    if (is_tauri_runtime()) {
        try { await maybe_sync_atomes('list_projects'); } catch { }
    }

    // Avoid ownerId filtering so shared projects (owned by others) appear.
    const listResult = await list_atomes({ type: 'project', includeShared: true, skipOwner: true });
    results.tauri.projects = Array.isArray(listResult.tauri.atomes) ? listResult.tauri.atomes : [];
    results.fastify.projects = Array.isArray(listResult.fastify.atomes) ? listResult.fastify.atomes : [];
    results.tauri.error = listResult.tauri.error || null;
    results.fastify.error = listResult.fastify.error || null;
    results.meta = listResult.meta || null;

    // If local deletions are pending, hide those projects from the Fastify list
    // so they don't "reappear" before the delete sync completes.
    try {
        const pendingDeletes = get_pending_delete_ids();
        if (pendingDeletes.size > 0) {
            results.fastify.projects = results.fastify.projects.filter(p => {
                const id = p?.atome_id || p?.id;
                return id ? !pendingDeletes.has(String(id)) : true;
            });
        }
    } catch { }

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

    let ownerId = null;
    try {
        const currentUserResult = await current_user();
        ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
    } catch { }

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
        if (is_tauri_runtime() && !FastifyAdapter.getToken?.()) {
            try { await ensure_fastify_token(); } catch { }
        }

        let fastifyResult = await FastifyAdapter.atome.softDelete(projectId);
        if (!(fastifyResult.ok || fastifyResult.success)) {
            const errMsg = String(fastifyResult.error || '').toLowerCase();
            const authError = errMsg.includes('unauth') || errMsg.includes('token') || errMsg.includes('login');
            if (is_tauri_runtime() && authError) {
                try { await ensure_fastify_token(); } catch { }
                fastifyResult = await FastifyAdapter.atome.softDelete(projectId);
            }
        }

        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
            queue_pending_delete({ atomeId: projectId, ownerId, type: 'project' });
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
        queue_pending_delete({ atomeId: projectId, ownerId, type: 'project' });
    }

    if (is_tauri_runtime()) {
        try { await process_pending_deletes(); } catch { }
        try { await maybe_sync_atomes('delete_project'); } catch { }
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
    const projectId = options.projectId || options.project_id || null;
    const parentId = options.parentId || options.parent_id || projectId || null;
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
        parentId: parentId, // Link to project by default, or to explicit parent
        particles: {
            color: atomeColor,
            created_at: new Date().toISOString(),
            ...options.particles
        }
    };

    const deferFastify = !!(options.deferFastify || options.defer_fastify);
    const shouldDeferFastify = deferFastify
        || (is_tauri_runtime() && is_file_asset_type(atomeType) && (options.particles?.file_path || options.particles?.filePath));

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
    if (shouldDeferFastify) {
        results.fastify = { success: false, data: null, error: 'deferred' };
    } else {
        try {
            const canonicalId = desiredId || tauriCreatedId || null;
            const fastifyPayload = canonicalId
                ? { ...atomeData, id: canonicalId, atome_id: canonicalId }
                : atomeData;

            if (is_tauri_runtime() && !FastifyAdapter.getToken?.()) {
                try { await ensure_fastify_token(); } catch { }
            }

            let fastifyResult = await FastifyAdapter.atome.create(fastifyPayload);
            if (!(fastifyResult.ok || fastifyResult.success)) {
                const errMsg = String(fastifyResult.error || '').toLowerCase();
                const authError = errMsg.includes('unauth') || errMsg.includes('token') || errMsg.includes('login');
                if (is_tauri_runtime() && authError) {
                    try { await ensure_fastify_token(); } catch { }
                    fastifyResult = await FastifyAdapter.atome.create(fastifyPayload);
                }
            }
            if (fastifyResult.ok || fastifyResult.success) {
                results.fastify = { success: true, data: fastifyResult, error: null };
            } else {
                results.fastify = { success: false, data: null, error: fastifyResult.error };
            }
        } catch (e) {
            results.fastify = { success: false, data: null, error: e.message };
        }
    }

    if (is_tauri_runtime()) {
        try { await maybe_sync_atomes('create_atome'); } catch { }
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
    const includeShared = !!options.includeShared;

    const results = {
        tauri: { atomes: [], error: null },
        fastify: { atomes: [], error: null },
        meta: { preferFastify: includeShared }
    };

    // Default behavior: list current user's atomes.
    // Fastify WS list requires ownerId/userId or atomeType; otherwise it returns [].
    // Exception: when listing global users, do not force owner filtering.
    const skipOwnerFilter = !!options.skipOwner;
    if (!ownerId && atomeType !== 'user' && !skipOwnerFilter) {
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
        if (is_tauri_runtime() && !FastifyAdapter.getToken?.()) {
            try { await ensure_fastify_token(); } catch { }
        }

        // Fastify WS list already includes shared atomes via permissions.
        let fastifyResult = await FastifyAdapter.atome.list(queryOptions);
        if (!(fastifyResult.ok || fastifyResult.success)) {
            const errMsg = String(fastifyResult.error || '').toLowerCase();
            const authError = errMsg.includes('unauth') || errMsg.includes('token') || errMsg.includes('login');
            if (is_tauri_runtime() && authError) {
                try { await ensure_fastify_token(); } catch { }
                fastifyResult = await FastifyAdapter.atome.list(queryOptions);
            }
        }

        if (fastifyResult && (fastifyResult.ok || fastifyResult.success)) {
            const rawAtomes = fastifyResult.atomes || fastifyResult.data || [];
            let normalized = Array.isArray(rawAtomes) ? rawAtomes.map(normalizeAtomeRecord) : [];

            if (projectId) {
                const target = String(projectId);
                normalized = normalized.filter((item) => {
                    const parentId = item.parentId || item.parent_id || null;
                    const particles = item.particles || item.data || {};
                    const particleProjectId = particles.projectId || particles.project_id || null;
                    return String(parentId || '') === target || String(particleProjectId || '') === target;
                });
            }

            results.fastify.atomes = normalized;
        } else if (!results.fastify.error) {
            results.fastify.error = fastifyResult?.error || null;
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

    let ownerId = null;
    try {
        const currentUserResult = await current_user();
        ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
    } catch { }

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
        if (is_tauri_runtime() && !FastifyAdapter.getToken?.()) {
            try { await ensure_fastify_token(); } catch { }
        }

        let fastifyResult = await FastifyAdapter.atome.softDelete(atomeId);
        if (!(fastifyResult.ok || fastifyResult.success)) {
            const errMsg = String(fastifyResult.error || '').toLowerCase();
            const authError = errMsg.includes('unauth') || errMsg.includes('token') || errMsg.includes('login');
            if (is_tauri_runtime() && authError) {
                try { await ensure_fastify_token(); } catch { }
                fastifyResult = await FastifyAdapter.atome.softDelete(atomeId);
            }
        }

        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, data: fastifyResult, error: null };
        } else {
            results.fastify = { success: false, data: null, error: fastifyResult.error };
            queue_pending_delete({ atomeId, ownerId, type: null });
        }
    } catch (e) {
        results.fastify = { success: false, data: null, error: e.message };
        queue_pending_delete({ atomeId, ownerId, type: null });
    }

    if (is_tauri_runtime()) {
        try { await process_pending_deletes(); } catch { }
        try { await maybe_sync_atomes('delete_atome'); } catch { }
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

    const shareDebugContext = (extra = {}) => ({
        targetPhone: phoneNumber || null,
        atomeIds: Array.isArray(atomeIds) ? atomeIds : atomeIds ? [atomeIds] : [],
        mode: sharingMode || 'real-time',
        ...extra
    });

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
        const authCheck = await ensure_fastify_ws_auth();
        if (!authCheck.ok) {
            console.warn('[Share] Fastify auth failed', shareDebugContext({
                error: authCheck.error || null,
                targetUserId
            }));
            results.fastify.error = authCheck.error;
            if (typeof callback === 'function') callback(results);
            return results;
        }

        try {
            await maybe_sync_atomes('share');
        } catch (e) {
            console.warn('[Share] Pre-share sync failed', shareDebugContext({
                error: e?.message || String(e),
                targetUserId
            }));
        }

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
        if (!ok) {
            console.warn('[Share] Share request failed', shareDebugContext({
                error: fastifyResult?.error || fastifyResult?.message || 'Share request failed',
                targetUserId,
                payload
            }));
        }
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
        const authCheck = await ensure_fastify_ws_auth();
        if (!authCheck.ok) {
            result = { ok: false, success: false, error: authCheck.error };
        } else {
            result = await FastifyAdapter.share.request(payload || {});
        }
    } catch (e) {
        result = { ok: false, success: false, error: e.message };
    }
    if (typeof callback === 'function') callback(result);
    return result;
}

async function share_respond(payload, callback) {
    let result = null;
    try {
        const authCheck = await ensure_fastify_ws_auth();
        if (!authCheck.ok) {
            result = { ok: false, success: false, error: authCheck.error };
        } else {
            result = await FastifyAdapter.share.respond(payload || {});
        }
    } catch (e) {
        result = { ok: false, success: false, error: e.message };
    }
    if (typeof callback === 'function') callback(result);
    return result;
}

async function share_publish(payload, callback) {
    let result = null;
    try {
        const authCheck = await ensure_fastify_ws_auth();
        if (!authCheck.ok) {
            result = { ok: false, success: false, error: authCheck.error };
        } else {
            result = await FastifyAdapter.share.publish(payload || {});
        }
    } catch (e) {
        result = { ok: false, success: false, error: e.message };
    }
    if (typeof callback === 'function') callback(result);
    return result;
}

async function share_policy(payload, callback) {
    let result = null;
    try {
        const authCheck = await ensure_fastify_ws_auth();
        if (!authCheck.ok) {
            result = { ok: false, success: false, error: authCheck.error };
        } else {
            result = await FastifyAdapter.share.policy(payload || {});
        }
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
        listUnsynced: list_unsynced_atomes,
        maybeSync: maybe_sync_atomes
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
