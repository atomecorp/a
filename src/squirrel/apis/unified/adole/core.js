

// ============================================
// ADOLE v3.0 - Canonical Data Layer (WS + HTTP)
//
// Role:
// - Single source of truth for CRUD + auth + sync helpers.
// - Normalizes backend payloads (Tauri/Fastify) into consistent shapes.
// - Used by UI-facing unified modules (UnifiedAuth/UnifiedAtome/etc.).
// ============================================

import {
    TauriAdapter,
    FastifyAdapter,
    CONFIG,
    generateUUID,
    checkBackends,
    resolveAuthSource,
    resolveProfileSource,
    resolveDataSource,
    resolveSyncDirection
} from '../adole.js';

const FILE_ASSET_TYPES = new Set([
    'file', 'image', 'video', 'sound', 'text', 'shape', 'raw',
    'audio_recording', 'video_recording'
]);

function is_file_asset_type(value) {
    const type = String(value || '').trim().toLowerCase();
    return FILE_ASSET_TYPES.has(type);
}

function normalize_phone_input(phone) {
    if (phone === null || phone === undefined) return '';
    const trimmed = String(phone).trim();
    if (!trimmed) return '';
    const cleaned = trimmed.replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) {
        return `+${cleaned.slice(1).replace(/\+/g, '')}`;
    }
    return cleaned.replace(/\+/g, '');
}

const ANONYMOUS_USERNAME = 'anonymous';
const ANONYMOUS_PASSWORD = 'anonymous';
const ANONYMOUS_VISIBILITY = 'private';
const ANONYMOUS_OPTIONAL = { anonymous: true, local_only: true };

const ANONYMOUS_PHONE_TAURI = '0000000000';
const ANONYMOUS_PHONE_FASTIFY = '0000000001';
const ANONYMOUS_PHONE_FASTIFY_KEY = 'anonymous_phone_fastify_v1';

function generate_anonymous_phone() {
    const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
    return `9${digits}`;
}

function read_stored_anonymous_phone() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const stored = localStorage.getItem(ANONYMOUS_PHONE_FASTIFY_KEY);
        if (stored && String(stored).trim()) return String(stored).trim();
    } catch { }
    return null;
}

function store_anonymous_phone(phone) {
    if (typeof localStorage === 'undefined' || !phone) return;
    try { localStorage.setItem(ANONYMOUS_PHONE_FASTIFY_KEY, String(phone)); } catch { }
}

function rotate_anonymous_phone() {
    const fresh = generate_anonymous_phone();
    store_anonymous_phone(fresh);
    return fresh;
}

const resolve_anonymous_phone = () => {
    // IMPORTANT: Keep anonymous identities isolated per runtime.
    // Tauri local: 0000000000 (local-only).
    // Browser/Fastify: 0000000001 (server-only).
    if (is_tauri_runtime()) return ANONYMOUS_PHONE_TAURI;
    const stored = read_stored_anonymous_phone();
    if (stored) return stored;
    const fresh = generate_anonymous_phone();
    store_anonymous_phone(fresh);
    return fresh;
};

const is_any_anonymous_phone = (phone) => {
    if (!phone) return false;
    const clean = String(phone).trim();
    if (clean === ANONYMOUS_PHONE_TAURI || clean === ANONYMOUS_PHONE_FASTIFY) return true;
    const stored = read_stored_anonymous_phone();
    return stored ? clean === stored : false;
};

const FLOW_LOG_TOKEN = '[AdoleFlow]';

function now_ms() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

function is_flow_logging_enabled() {
    if (typeof window === 'undefined') return false;
    return window.__CHECK_DEBUG__ === true;
}

function create_flow(scope) {
    return {
        id: generateUUID(),
        scope: scope || 'flow',
        startedAt: now_ms()
    };
}

function log_flow() { }

function sleep_ms(durationMs) {
    return new Promise((resolve) => {
        setTimeout(resolve, durationMs);
    });
}

async function with_timeout(promise, timeoutMs, label = 'operation') {
    let timeoutId;
    const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
            resolve({ ok: false, success: false, error: `${label}_timeout` });
        }, timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeout]);
        clearTimeout(timeoutId);
        return result;
    } catch (e) {
        clearTimeout(timeoutId);
        return { ok: false, success: false, error: e?.message || String(e) };
    }
}

function get_anonymous_identity() {
    return {
        phone: resolve_anonymous_phone(),
        username: ANONYMOUS_USERNAME,
        password: ANONYMOUS_PASSWORD,
        visibility: ANONYMOUS_VISIBILITY,
        optional: {
            ...ANONYMOUS_OPTIONAL,
            scope: is_tauri_runtime() ? 'tauri' : 'fastify'
        }
    };
}

function is_anonymous_identity({ userId = null, phone = null, username = null } = {}) {
    const normalizedPhone = phone ? String(phone).trim() : null;
    const normalizedName = username ? String(username).trim().toLowerCase() : null;
    const normalizedId = userId ? String(userId).trim() : null;

    if (normalizedPhone && is_any_anonymous_phone(normalizedPhone)) return true;
    if (normalizedId && _anonymousUserId && normalizedId === String(_anonymousUserId)) return true;
    if (normalizedId && normalizedId === 'anonymous') return true;
    if (!normalizedPhone && normalizedName && normalizedName === ANONYMOUS_USERNAME) return true;
    return false;
}

function is_anonymous_mode() {
    return is_anonymous_identity({
        userId: _currentUserId,
        phone: _currentUserPhone,
        username: _currentUserName
    });
}

function get_anonymous_user_id() {
    return _anonymousUserId;
}

function resolve_anonymous_backend_plan() {
    const source = is_tauri_runtime() ? 'tauri' : 'fastify';
    const primary = source === 'tauri' ? TauriAdapter : FastifyAdapter;
    const secondary = source === 'tauri' ? FastifyAdapter : TauriAdapter;
    const secondaryName = source === 'tauri' ? 'fastify' : 'tauri';
    return { source, primary, secondary, secondaryName, anonymous: true };
}

function resolve_backend_plan(kind) {
    const key = String(kind || '').toLowerCase();
    const baseSource = key === 'auth'
        ? resolveAuthSource()
        : (key === 'profile' ? resolveProfileSource() : resolveDataSource());
    const source = (key !== 'auth' && is_anonymous_mode())
        ? (is_tauri_runtime() ? 'tauri' : 'fastify')
        : baseSource;
    const primary = source === 'fastify' ? FastifyAdapter : TauriAdapter;
    const secondary = source === 'fastify' ? TauriAdapter : FastifyAdapter;
    const secondaryName = source === 'fastify' ? 'tauri' : 'fastify';
    return { source, primary, secondary, secondaryName };
}

function resolve_sync_policy() {
    if (is_anonymous_mode()) {
        return { from: null, to: null, anonymous: true };
    }
    const direction = resolveSyncDirection();
    if (direction === 'tauri_to_fastify') {
        return { from: 'tauri', to: 'fastify' };
    }
    if (direction === 'fastify_to_tauri') {
        return { from: 'fastify', to: 'tauri' };
    }
    return { from: null, to: null };
}

const ATOME_METADATA_FIELDS = new Set([
    'atome_id', 'atome_type', 'atomeId', 'atomeType',
    'parent_id', 'parentId', 'owner_id', 'ownerId', 'creator_id', 'userId',
    'sync_status', 'created_at', 'updated_at', 'deleted_at', 'last_sync',
    'createdAt', 'updatedAt', 'deletedAt', 'lastSync',
    'created_source', 'id', 'type', 'data', 'particles', 'properties', 'snapshot',
    '_pending_owner_id', '_pending_parent_id', 'pending_owner_id', 'pending_parent_id', 'pendingOwnerId', 'pendingParentId'
]);

function normalize_ref_id(value) {
    if (value === null || value === undefined) return null;
    const str = String(value);
    if (!str || str === 'anonymous') return null;
    return str;
}

function extract_atome_properties(atome) {
    if (!atome || typeof atome !== 'object') return {};
    if (atome.properties && typeof atome.properties === 'object' && Object.keys(atome.properties).length > 0) {
        return atome.properties;
    }
    if (atome.data && typeof atome.data === 'object' && Object.keys(atome.data).length > 0) {
        return atome.data;
    }
    if (atome.particles && typeof atome.particles === 'object' && Object.keys(atome.particles).length > 0) {
        return atome.particles;
    }

    const inlineProps = {};
    for (const [key, value] of Object.entries(atome)) {
        if (!ATOME_METADATA_FIELDS.has(key) && value !== null && value !== undefined) {
            inlineProps[key] = value;
        }
    }
    return inlineProps;
}

function resolve_owner_for_sync(atome) {
    if (!atome || typeof atome !== 'object') return null;
    return normalize_ref_id(
        atome.owner_id ||
        atome.ownerId ||
        atome.owner ||
        atome.userId ||
        atome.pending_owner_id ||
        atome.pendingOwnerId
    );
}

function resolve_parent_for_sync(atome) {
    if (!atome || typeof atome !== 'object') return null;
    return normalize_ref_id(
        atome.parent_id ||
        atome.parentId ||
        atome.parent ||
        atome.pending_parent_id ||
        atome.pendingParentId
    );
}

function extract_created_atome_id(res) {
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
}

function normalizeAtomeRecord(raw) {
    if (!raw || typeof raw !== 'object') return raw;

    const propertiesFromPropertiesField = (raw.properties && typeof raw.properties === 'object')
        ? raw.properties
        : null;

    const particlesFromParticlesField = (raw.particles && typeof raw.particles === 'object')
        ? raw.particles
        : null;

    // Tauri returns dynamic properties under `data` (legacy naming).
    // Fastify typically returns them flattened at top-level.
    const particlesFromDataField = (raw.data && typeof raw.data === 'object')
        ? raw.data
        : null;
    const propertiesFromSnapshotField = (raw.snapshot && typeof raw.snapshot === 'object')
        ? raw.snapshot
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
        'data', 'particles', 'properties', 'snapshot', 'atomes', 'count',
        '_pending_owner_id', '_pending_parent_id', 'pending_owner_id', 'pending_parent_id', 'pendingOwnerId', 'pendingParentId'
    ]);

    // Fastify WS list flattens properties at top-level (e.g. atome.left/top/color).
    // Rehydrate them into `properties` so UI persistence works.
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

    const properties = {};
    const mergeProperties = (source) => {
        if (!source || typeof source !== 'object') return;
        for (const [key, val] of Object.entries(source)) {
            if (properties[key] === undefined) {
                properties[key] = val;
            }
        }
    };

    mergeProperties(stripPending(propertiesFromPropertiesField));
    mergeProperties(stripPending(particlesFromParticlesField));
    mergeProperties(stripPending(particlesFromDataField));
    mergeProperties(stripPending(propertiesFromSnapshotField));

    for (const key of Object.keys(raw)) {
        if (coreKeys.has(key)) continue;
        const val = raw[key];
        if (val === undefined) continue;
        if (properties[key] === undefined) {
            properties[key] = val;
        }
    }

    const createdAt = raw.created_at ?? raw.createdAt;
    const updatedAt = raw.updated_at ?? raw.updatedAt;
    const deletedAt = raw.deleted_at ?? raw.deletedAt;
    const lastSync = raw.last_sync ?? raw.lastSync;

    const atomeId = raw.atome_id || raw.atomeId || raw.id;
    const atomeType = raw.atome_type || raw.atomeType || raw.type;
    const resolvedOwnerId = normalize_ref_id(
        raw.owner_id ||
        raw.ownerId ||
        raw.owner ||
        raw.userId ||
        raw.user_id ||
        pendingOwnerId
    );
    const resolvedParentId = normalize_ref_id(raw.parent_id || raw.parentId || raw.parent || pendingParentId);

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
        properties
    };
}

const resolveAtomePropertiesInput = (input) => {
    if (!input || typeof input !== 'object') return {};
    const fromProperties = (input.properties && typeof input.properties === 'object') ? input.properties : null;
    const fromParticles = (input.particles && typeof input.particles === 'object') ? input.particles : null;
    if (fromProperties && fromParticles) {
        return { ...fromParticles, ...fromProperties };
    }
    return fromProperties || fromParticles || {};
};

const resolveAtomePropertiesPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.properties && typeof payload.properties === 'object') return payload.properties;
    if (payload.particles && typeof payload.particles === 'object') return payload.particles;
    return payload;
};

// ============================================
// CURRENT STATE (Project, User, Machine)
// ============================================

// Global current project state (accessible everywhere)
let _currentProjectId = null;
let _currentProjectName = null;
let _currentProjectOwnerId = null;

// Global current user state
let _currentUserId = null;
let _currentUserName = null;
let _currentUserPhone = null;
let _anonymousUserId = null;
let _anonymousEnsurePromise = null;

// Global current machine state
let _currentMachineId = null;
let _currentMachinePlatform = null;

// Public user directory cache (safe fields only; never store password hashes here)
const PUBLIC_USER_DIRECTORY_CACHE_KEY = 'public_user_directory_cache_v1';
const AUTH_PENDING_SYNC_KEY = 'auth_pending_sync';
const PUBLIC_USER_DIRECTORY_LAST_SYNC_KEY = 'public_user_directory_last_sync_iso_v1';
const ATOME_PENDING_DELETE_KEY = 'atome_pending_delete_ops_v1';
const FASTIFY_LOGIN_CACHE_KEY = 'fastify_login_cache_v1';
const CURRENT_PROJECT_CACHE_KEY = 'current_project_cache_v1';
const TAURI_USER_SESSION_KEY = 'tauri_user_session_v1'; // Persisted session state

// ============================================
// AUTH GATE: Block project loading until auth verified
// ============================================
if (typeof window !== 'undefined') {
    window.__authCheckComplete = false;
    window.__authCheckResult = null; // { authenticated: boolean, userId: string|null }
}

/**
 * Signal that auth check is complete. Dispatches 'squirrel:auth-checked' event.
 * @param {boolean} authenticated - Whether a user is logged in
 * @param {string|null} userId - The logged-in user ID (or null)
 */
function signal_auth_check_complete(authenticated, userId = null) {
    if (typeof window === 'undefined') return;
    try {
        console.log('[AuthGate] signal_auth_check_complete', {
            authenticated,
            userId
        });
    } catch { }
    window.__authCheckComplete = true;
    window.__authCheckResult = { authenticated, userId };
    window.dispatchEvent(new CustomEvent('squirrel:auth-checked', {
        detail: { authenticated, userId }
    }));
}

/**
 * Wait for auth check to complete. Returns immediately if already done.
 * @param {number} timeoutMs - Max wait time (default 10s)
 * @returns {Promise<{authenticated: boolean, userId: string|null}>}
 */
function wait_for_auth_check(timeoutMs = 10000) {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') {
            resolve({ authenticated: false, userId: null });
            return;
        }
        if (window.__authCheckComplete) {
            resolve(window.__authCheckResult || { authenticated: false, userId: null });
            return;
        }
        let resolved = false;
        const handler = (event) => {
            if (resolved) return;
            resolved = true;
            window.removeEventListener('squirrel:auth-checked', handler);
            resolve(event?.detail || { authenticated: false, userId: null });
        };
        window.addEventListener('squirrel:auth-checked', handler);
        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            window.removeEventListener('squirrel:auth-checked', handler);
            console.warn('[Auth] Auth check timeout - proceeding as not authenticated');
            resolve({ authenticated: false, userId: null });
        }, timeoutMs);
    });
}

let _syncAtomesInProgress = false;
let _lastSyncAtomesAttempt = 0;
let _lastFastifyAutoLoginAttempt = 0;
let _lastFastifyAssetSync = 0;
const _anonMigrationDone = new Set();

// ============================================
// SESSION PERSISTENCE (Same strategy as Fastify)
// ============================================

/**
 * Save user session to localStorage (called on successful login)
 * This allows session to persist across page refreshes
 * @param {string} userId
 * @param {string} userName
 * @param {string} userPhone
 */
function save_user_session(userId, userName, userPhone) {
    if (typeof localStorage === 'undefined' || !userId) return;
    try {
        const session = {
            userId,
            userName: userName || null,
            userPhone: userPhone || null,
            loggedAt: new Date().toISOString()
        };
        localStorage.setItem(TAURI_USER_SESSION_KEY, JSON.stringify(session));
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(TAURI_USER_SESSION_KEY, JSON.stringify(session));
        }
    } catch (e) {
        console.warn('[Session] Failed to save user session:', e?.message);
    }
}

/**
 * Load user session from localStorage
 * @returns {{userId: string, userName: string|null, userPhone: string|null, loggedAt: string}|null}
 */
function load_user_session() {
    if (typeof localStorage === 'undefined' && typeof sessionStorage === 'undefined') return null;
    try {
        const raw = (typeof localStorage !== 'undefined')
            ? localStorage.getItem(TAURI_USER_SESSION_KEY)
            : null;
        const fallback = (!raw && typeof sessionStorage !== 'undefined')
            ? sessionStorage.getItem(TAURI_USER_SESSION_KEY)
            : null;
        const payload = raw || fallback;
        if (!payload) return null;
        const session = JSON.parse(payload);
        if (!session?.userId) return null;
        return session;
    } catch (e) {
        return null;
    }
}

/**
 * Clear user session from localStorage (called on logout)
 */
function clear_user_session() {
    try {
        // Clear session data
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(TAURI_USER_SESSION_KEY);
        }
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(TAURI_USER_SESSION_KEY);
        }

        // CRITICAL: Clear ALL auth tokens to prevent cross-user data leakage
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('cloud_auth_token');
            localStorage.removeItem('local_auth_token');
            localStorage.removeItem('eve_current_project_id');
            localStorage.removeItem('eve_last_project_id');
        }
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('cloud_auth_token');
            sessionStorage.removeItem('local_auth_token');
            sessionStorage.removeItem('eve_current_project_id');
            sessionStorage.removeItem('eve_last_project_id');
        }

    } catch (e) {
        console.warn('[Session] Failed to clear user session:', e?.message);
    }
}

async function validate_saved_session({ userId, userName, userPhone } = {}) {
    if (!userId) return;
    const authPlan = resolve_backend_plan('auth');
    try {
        const meResult = await with_timeout(authPlan.primary.auth.me(), 4000, 'startup_me');
        if (meResult?.ok || meResult?.success) {
            const user = meResult.user || meResult.data?.user || null;
            if (user) {
                const resolvedId = user.user_id || user.atome_id || user.id || userId;
                const resolvedName = user.username || user.name || userName || null;
                const resolvedPhone = user.phone || userPhone || null;
                await set_current_user_state(resolvedId, resolvedName, resolvedPhone, false);
            }
            return;
        }

        const err = String(meResult?.error || '').toLowerCase();
        const offline = meResult?.offline === true || err.includes('unreachable') || err.includes('timeout');
        if (offline || !err) {
            return;
        }

        const invalid = err.includes('invalid')
            || err.includes('expired')
            || err.includes('user not found')
            || err.includes('no token')
            || err.includes('unauthenticated');
        if (invalid) {
            clear_user_session();
            clear_ui_on_logout({ preserveLocalData: true });
            try {
                const anon = await ensure_anonymous_user({ reason: 'startup' });
                if (anon?.ok && anon.user) {
                    const anonId = anon.user.user_id || anon.user.id || null;
                    signal_auth_check_complete(true, anonId);
                } else {
                    signal_auth_check_complete(false, null);
                }
            } catch {
                signal_auth_check_complete(false, null);
            }
        }
    } catch { }
}

function clear_all_storage() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.clear();
        }
    } catch (e) {
        console.warn('[Session] Failed to clear localStorage:', e?.message);
    }
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
        }
    } catch (e) {
        console.warn('[Session] Failed to clear sessionStorage:', e?.message);
    }
}

/**
 * Check if a valid user session exists in localStorage
 * @returns {boolean}
 */
function has_user_session() {
    const session = load_user_session();
    return !!session?.userId;
}

// ============================================
// SECURITY GUARDS
// ============================================

/**
 * Check if user is authenticated. Returns user info if yes, null if no.
 * @returns {{id: string, name: string|null, phone: string|null}|null}
 */
function get_authenticated_user() {
    if (_currentUserId) {
        return {
            id: _currentUserId,
            name: _currentUserName,
            phone: _currentUserPhone
        };
    }
    return null;
}

/**
 * Require authenticated user for an operation.
 * Throws an error result if no user is logged in.
 * @param {string} operation - Name of the operation (for error messages)
 * @returns {{authenticated: boolean, user: object|null, error: string|null}}
 */
function require_authenticated_user(operation = 'operation') {
    const user = get_authenticated_user();
    if (!user) {
        console.warn(`[Security] Blocked ${operation}: No authenticated user`);
        return {
            authenticated: false,
            user: null,
            error: `Authentication required for ${operation}. Please log in first.`
        };
    }
    return {
        authenticated: true,
        user,
        error: null
    };
}

/**
 * Create a blocked result object for unauthenticated operations
 * @param {string} errorMessage - Error message
 * @returns {Object} Results object with errors
 */
function create_unauthenticated_result(errorMessage) {
    return {
        tauri: { success: false, data: null, error: errorMessage },
        fastify: { success: false, data: null, error: errorMessage },
        blocked: true,
        reason: 'unauthenticated'
    };
}

async function ensure_anonymous_user({ reason = 'anonymous', maxAttempts = 3 } = {}) {
    if (_currentUserId && !is_anonymous_mode()) {
        return { ok: false, reason: 'authenticated_user_present', user: get_authenticated_user() };
    }
    if (_currentUserId && is_any_anonymous_phone(_currentUserPhone) && _currentUserPhone !== resolve_anonymous_phone()) {
        try {
            console.warn('[Auth] Anonymous scope mismatch; resetting session', {
                currentPhone: _currentUserPhone,
                expected: resolve_anonymous_phone()
            });
        } catch { }
        try { clear_user_session(); } catch { }
        try { TauriAdapter.clearToken?.(); } catch { }
        try { FastifyAdapter.clearToken?.(); } catch { }
        _currentUserId = null;
        _currentUserName = null;
        _currentUserPhone = null;
    }
    if (_anonymousEnsurePromise) {
        return _anonymousEnsurePromise;
    }

    _anonymousEnsurePromise = (async () => {
        let identity = get_anonymous_identity();
        const plan = resolve_anonymous_backend_plan();
        const adapter = plan.primary;
        let lastError = null;

        const noteError = (stage, result) => {
            if (!result) return;
            const error = result.error || result.message || result.reason || null;
            if (error) {
                lastError = { stage, error };
            }
        };

        const tryLogin = async () => {
            if (!adapter?.auth?.login) return null;
            return await with_timeout(
                adapter.auth.login({ phone: identity.phone, password: identity.password }),
                2500,
                'anonymous_login'
            );
        };

        const tryRegister = async () => {
            if (!adapter?.auth?.register) return null;
            return await with_timeout(
                adapter.auth.register({
                    phone: identity.phone,
                    password: identity.password,
                    username: identity.username,
                    visibility: identity.visibility,
                    optional: identity.optional
                }),
                2500,
                'anonymous_register'
            );
        };

        let loginResult = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            loginResult = await tryLogin();
            noteError('login_ws', loginResult);
            if (loginResult?.ok || loginResult?.success) {
                lastError = null;
                break;
            }

            const registerResult = await tryRegister();
            noteError('register_ws', registerResult);
            if (registerResult?.ok || registerResult?.success || is_already_exists_error(registerResult)) {
                loginResult = await tryLogin();
                noteError('login_ws', loginResult);
                if (loginResult?.ok || loginResult?.success) {
                    lastError = null;
                    break;
                }
            }

            if (!is_tauri_runtime() && plan.source === 'fastify') {
                const httpRegister = await fastify_http_register(identity.phone, identity.password, identity.username);
                noteError('register_http', httpRegister);
                if (httpRegister?.success || httpRegister?.alreadyExists) {
                    const httpLogin = await fastify_http_login(identity.phone, identity.password);
                    noteError('login_http', httpLogin);
                    if (httpLogin?.success) {
                        loginResult = httpLogin;
                        lastError = null;
                        break;
                    }
                    const loginErr = String(httpLogin?.error || '').toLowerCase();
                    if (loginErr.includes('invalid') || httpRegister?.alreadyExists) {
                        identity = { ...identity, phone: rotate_anonymous_phone() };
                    }
                }
            }

            if (attempt < maxAttempts) {
                await sleep_ms(250);
            }
        }

        let user = loginResult?.user || loginResult?.data?.user || null;
        if (!user && adapter?.auth?.me) {
            try {
                const meResult = await with_timeout(adapter.auth.me(), 2000, 'anonymous_me');
                noteError('me', meResult);
                if (meResult?.ok || meResult?.success) {
                    user = meResult.user || null;
                    lastError = null;
                }
            } catch { }
        }

        const userId = user?.user_id || user?.atome_id || user?.id || null;
        if (userId) {
            await set_current_user_state(userId, identity.username, identity.phone, false);
        }

        if (typeof window !== 'undefined') {
            window.__anonymousUser = {
                id: userId,
                phone: identity.phone,
                name: identity.username,
                scope: is_tauri_runtime() ? 'tauri' : 'fastify'
            };
        }

        return {
            ok: !!userId,
            user: userId ? { user_id: userId, username: identity.username, phone: identity.phone } : null,
            source: plan.source,
            reason,
            error: lastError
        };
    })();

    try {
        return await _anonymousEnsurePromise;
    } finally {
        _anonymousEnsurePromise = null;
    }
}

async function ensure_user_for_operation(operation, { allowAnonymous = true } = {}) {
    const existing = get_authenticated_user();
    if (existing) {
        return { ok: true, user: existing, anonymous: is_anonymous_mode() };
    }
    if (!allowAnonymous) {
        return { ok: false, user: null, error: `Authentication required for ${operation}. Please log in first.` };
    }

    const anon = await ensure_anonymous_user({ reason: operation });
    if (anon?.ok && anon.user) {
        return {
            ok: true,
            user: {
                id: anon.user.user_id || anon.user.id || anon.user.atome_id,
                name: anon.user.username || ANONYMOUS_USERNAME,
                phone: anon.user.phone || resolve_anonymous_phone()
            },
            anonymous: true
        };
    }
    return { ok: false, user: null, error: `Authentication required for ${operation}. Please log in first.` };
}

async function ensure_secondary_user_match(secondaryName, currentUserId) {
    if (!secondaryName || !currentUserId) return false;
    const expected = String(currentUserId);

    const getUserIdFromMe = (me) => {
        return me?.user?.user_id || me?.user?.id || me?.user?.atome_id || null;
    };

    if (secondaryName === 'fastify') {
        const token = FastifyAdapter.getToken?.();
        if (!token || !FastifyAdapter?.auth?.me) return false;
        try {
            const me = await FastifyAdapter.auth.me();
            const id = getUserIdFromMe(me);
            if (!id || String(id) !== expected) {
                try { FastifyAdapter.clearToken?.(); } catch { }
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    if (secondaryName === 'tauri') {
        const token = TauriAdapter.getToken?.();
        if (!token || !TauriAdapter?.auth?.me) return false;
        try {
            const me = await TauriAdapter.auth.me();
            const id = getUserIdFromMe(me);
            if (!id || String(id) !== expected) {
                try { TauriAdapter.clearToken?.(); } catch { }
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    return false;
}

/**
 * Clear the UI by dispatching an event that removes all atomes from view.
 * Called on logout to prevent displaying previous user's data.
 */
function clear_ui_on_logout(options = {}) {
    if (typeof window === 'undefined') return;

    const preserveLocalData = options.preserveLocalData === true;

    _currentUserId = null;
    _currentUserName = null;
    _currentUserPhone = null;
    _currentProjectId = null;
    _currentProjectName = null;
    _currentProjectOwnerId = null;

    if (window.__currentUser) {
        delete window.__currentUser;
    }
    if (window.__currentProject) {
        delete window.__currentProject;
    }
    if (window.__selectedAtomeIds) {
        delete window.__selectedAtomeIds;
    }
    if (window.__selectedAtomeId) {
        delete window.__selectedAtomeId;
    }
    if (window.__eveProfilePreferences) {
        delete window.__eveProfilePreferences;
    }
    if (window.__authCheckComplete !== undefined) {
        window.__authCheckComplete = true;
    }
    if (window.__authCheckResult !== undefined) {
        window.__authCheckResult = { authenticated: false, userId: null };
    }

    // Clear matrix UI state without removing the element entirely.
    // The matrix will be recreated/repopulated when the next user opens it.
    if (typeof document !== 'undefined') {
        const matrixRoot = document.getElementById('eve_project_matrix');
        if (matrixRoot) {
            if (!preserveLocalData) {
                matrixRoot.classList.remove('is-active');
                matrixRoot.style.display = 'none';
                matrixRoot.style.opacity = '';
                matrixRoot.style.transform = '';
                matrixRoot.style.transformOrigin = '';
            }
            // Clear children but keep the container for re-use
            const scroll = matrixRoot.querySelector('#eve_project_matrix_scroll');
            if (scroll) {
                scroll.innerHTML = '';
            }
        }
        if (!preserveLocalData) {
            const matrixTool = document.getElementById('_intuition_matrix');
            if (matrixTool) {
                delete matrixTool.dataset.simpleActive;
                delete matrixTool.dataset.activeTag;
                matrixTool.style.removeProperty('background');
            }
        }
    }

    // Dispatch event for UI to clear all rendered atomes
    window.dispatchEvent(new CustomEvent('squirrel:user-logged-out', {
        detail: {
            reason: 'logout',
            timestamp: Date.now(),
            action: 'clear_all_atomes'
        }
    }));

    // Also dispatch a more specific event for view cleanup
    window.dispatchEvent(new CustomEvent('squirrel:clear-view', {
        detail: {
            reason: 'user_logout',
            clearAtomes: true,
            clearProject: true
        }
    }));

    // Clear all local/session storage to avoid cross-user residue.
    if (!preserveLocalData) {
        clear_all_storage();
    }
}

/**
 * Clear UI and cached project state when switching between users (without wiping auth tokens).
 * This avoids cross-user project/matrix leakage after a successful login.
 * @param {string} prevUserId
 * @param {string} nextUserId
 */
function clear_ui_for_user_switch(prevUserId, nextUserId) {
    if (typeof window === 'undefined') return;

    _currentProjectId = null;
    _currentProjectName = null;
    _currentProjectOwnerId = null;

    if (window.__currentProject) {
        delete window.__currentProject;
    }
    if (window.__selectedAtomeIds) {
        delete window.__selectedAtomeIds;
    }
    if (window.__selectedAtomeId) {
        delete window.__selectedAtomeId;
    }
    if (window.__eveProfilePreferences) {
        delete window.__eveProfilePreferences;
    }
    if (window.__authCheckComplete !== undefined) {
        window.__authCheckComplete = true;
    }
    if (window.__authCheckResult !== undefined) {
        window.__authCheckResult = { authenticated: false, userId: null };
    }

    // Clear matrix UI state without removing the element entirely.
    if (typeof document !== 'undefined') {
        const matrixRoot = document.getElementById('eve_project_matrix');
        if (matrixRoot) {
            matrixRoot.classList.remove('is-active');
            matrixRoot.style.display = 'none';
            matrixRoot.style.opacity = '';
            matrixRoot.style.transform = '';
            matrixRoot.style.transformOrigin = '';
            // Clear children but keep the container for re-use
            const scroll = matrixRoot.querySelector('#eve_project_matrix_scroll');
            if (scroll) {
                scroll.innerHTML = '';
            }
        }
        const matrixTool = document.getElementById('_intuition_matrix');
        if (matrixTool) {
            delete matrixTool.dataset.simpleActive;
            delete matrixTool.dataset.activeTag;
            matrixTool.style.removeProperty('background');
        }
    }

    // Clear all local/session storage to avoid cross-user residue.
    clear_cached_current_project();

    window.dispatchEvent(new CustomEvent('squirrel:clear-view', {
        detail: {
            reason: 'user_switch',
            clearAtomes: true,
            clearProject: true
        }
    }));
}

const read_cached_current_project = () => {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(CURRENT_PROJECT_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.id) return null;
        return {
            id: String(parsed.id),
            name: parsed.name ? String(parsed.name) : null,
            userId: parsed.userId ? String(parsed.userId) : null
        };
    } catch {
        return null;
    }
};

const write_cached_current_project = (projectId, projectName, userId = null) => {
    if (typeof localStorage === 'undefined' || !projectId || !userId) return;
    try {
        const payload = {
            id: String(projectId),
            name: projectName ? String(projectName) : null,
            userId: String(userId),
            ts: new Date().toISOString()
        };
        localStorage.setItem(CURRENT_PROJECT_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore cache failures.
    }
};

const clear_cached_current_project = () => {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(CURRENT_PROJECT_CACHE_KEY);
    } catch {
        // Ignore cache failures.
    }
};

const cachedProjectBootstrap = read_cached_current_project();
const cachedProjectSession = load_user_session();
if (cachedProjectBootstrap?.id && cachedProjectBootstrap.userId && cachedProjectSession?.userId) {
    if (String(cachedProjectBootstrap.userId) === String(cachedProjectSession.userId)) {
        _currentProjectId = cachedProjectBootstrap.id;
        _currentProjectName = cachedProjectBootstrap.name || null;
    }
}

function is_tauri_runtime() {
    try {
        return typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    } catch {
        return false;
    }
}

function save_fastify_login_cache({ phone, password }) {
    if (!phone || !password || typeof localStorage === 'undefined') return;
    const normalizedPhone = normalize_phone_input(phone) || String(phone).trim();
    const normalizedPassword = String(password).trim().toLowerCase();
    if (is_any_anonymous_phone(normalizedPhone) || normalizedPassword === 'anonymous') return;
    try {
        localStorage.setItem(FASTIFY_LOGIN_CACHE_KEY, JSON.stringify({
            phone: normalizedPhone || String(phone),
            password: String(password),
            savedAt: new Date().toISOString()
        }));
    } catch {
        // Ignore
    }
}

function load_fastify_login_cache() {
    if (typeof localStorage === 'undefined') return null;
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

function load_pending_register_credentials() {
    if (!is_tauri_runtime() || typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(AUTH_PENDING_SYNC_KEY);
        if (!raw) return null;
        const queue = JSON.parse(raw);
        if (!Array.isArray(queue) || queue.length === 0) return null;
        for (let i = queue.length - 1; i >= 0; i -= 1) {
            const data = queue[i]?.data;
            if (data?.phone && data?.password) {
                return {
                    phone: data.phone,
                    password: data.password,
                    username: data.username || null
                };
            }
        }
    } catch {
        return null;
    }
    return null;
}

function clear_fastify_login_cache() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(FASTIFY_LOGIN_CACHE_KEY);
    } catch {
        // Ignore
    }
}

function clear_pending_register_queue(phone) {
    if (!is_tauri_runtime() || typeof localStorage === 'undefined') return;
    try {
        const raw = localStorage.getItem(AUTH_PENDING_SYNC_KEY);
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (!Array.isArray(queue) || queue.length === 0) return;
        const normalizedPhone = normalize_phone_input(phone);
        const filtered = queue.filter((item) => {
            const itemPhone = normalize_phone_input(item?.data?.phone);
            if (!normalizedPhone) return true;
            return itemPhone !== normalizedPhone;
        });
        localStorage.setItem(AUTH_PENDING_SYNC_KEY, JSON.stringify(filtered));
    } catch {
        // Ignore
    }
}

function clear_auth_credentials_for_phone(phone) {
    if (!is_tauri_runtime() || typeof localStorage === 'undefined') return;
    const normalizedPhone = normalize_phone_input(phone);
    if (!normalizedPhone) return;
    try {
        const raw = localStorage.getItem(FASTIFY_LOGIN_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const cachedPhone = normalize_phone_input(parsed?.phone);
            if (cachedPhone && cachedPhone === normalizedPhone) {
                localStorage.removeItem(FASTIFY_LOGIN_CACHE_KEY);
            }
        }
    } catch {
        // Ignore
    }
    clear_pending_register_queue(normalizedPhone);
}

// Helper to get stored Fastify token from Axum backend (persists even if localStorage is cleared)
async function get_stored_fastify_token_from_axum() {
    if (!is_tauri_runtime()) return null;
    try {
        const localToken = TauriAdapter.getToken?.();
        if (!localToken) return null;

        const result = await TauriAdapter.send({
            type: 'auth',
            action: 'get-fastify-token',
            token: localToken
        });

        if (result?.success && result?.token) {
            return result.token;
        }
        return null;
    } catch {
        return null;
    }
}

// Helper to save Fastify token to Axum backend (persists even if localStorage is cleared)
async function save_fastify_token_to_axum(fastifyToken) {
    if (!is_tauri_runtime() || !fastifyToken) return false;
    try {
        const localToken = TauriAdapter.getToken?.();
        if (!localToken) return false;

        const result = await TauriAdapter.send({
            type: 'auth',
            action: 'save-fastify-token',
            localToken: localToken,
            token: fastifyToken
        });

        return result?.success === true;
    } catch {
        return false;
    }
}

// Helper to clear stored Fastify token in Axum (delete particle)
// Note: The Fastify token in Axum SQLite is automatically invalidated when the user logs out
// from Fastify. We only need to clear the client-side token which is done via FastifyAdapter.clearToken().
// This function is a no-op as there's no WebSocket endpoint for this operation.
async function clear_stored_fastify_token_in_axum() {
    if (!is_tauri_runtime()) return false;
    // The Fastify token stored in Axum's SQLite was for persistence across app restarts.
    // On logout, we clear the localStorage token (FastifyAdapter.clearToken) which is sufficient.
    // The SQLite particle will be overwritten on next successful Fastify login.
    return true;
}

function resolve_fastify_http_base() {
    let baseUrl = '';

    if (!is_tauri_runtime() && typeof window !== 'undefined') {
        const origin = typeof window.location?.origin === 'string' ? window.location.origin : '';
        if (origin && origin !== 'null' && !origin.startsWith('file:')) {
            baseUrl = origin.replace(/\/$/, '');
        }
    }

    if (!baseUrl && typeof window !== 'undefined' && window.__SQUIRREL_FASTIFY_URL__) {
        baseUrl = String(window.__SQUIRREL_FASTIFY_URL__).trim().replace(/\/$/, '');
    }

    if (!baseUrl) {
        const config = (typeof window !== 'undefined') ? window.__SQUIRREL_SERVER_CONFIG__ : null;
        const port = config?.fastify?.port || 3001;
        baseUrl = `http://127.0.0.1:${port}`;
    }

    return baseUrl;
}

/**
 * Attempt direct HTTP login to Fastify (bypasses WebSocket).
 * Useful when the WebSocket is not yet connected but HTTP is reachable.
 * @param {string} phone
 * @param {string} password
 * @returns {Promise<{success: boolean, data: object|null, error: string|null, token: string|null}>}
 */
async function fastify_http_login(phone, password) {
    const cleanPhone = normalize_phone_input(phone) || String(phone || '').trim();
    if (!cleanPhone || !password) {
        return { success: false, data: null, error: 'Phone and password required', token: null };
    }
    let timeoutId = null;
    try {
        const baseUrl = resolve_fastify_http_base();
        const url = `${baseUrl}/api/auth/login`;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: cleanPhone, password }),
            credentials: 'omit',
            signal: controller?.signal
        });
        if (timeoutId) clearTimeout(timeoutId);
        if (!res || !res.ok) {
            const errBody = await res.text().catch(() => '');
            console.warn('[Auth] Fastify HTTP login failed:', res?.status, errBody);
            return { success: false, data: null, error: errBody || `HTTP ${res?.status}`, token: null };
        }
        const data = await res.json();
        const token = data?.token || null;
        const ok = !!(data?.ok || data?.success || token);
        if (ok && token) {
            FastifyAdapter.setToken?.(token);
        }
        return { success: ok, data, error: ok ? null : (data?.error || 'Login failed'), token };
    } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn('[Auth] Fastify HTTP login threw:', e?.message || e);
        return { success: false, data: null, error: e?.message || String(e), token: null };
    }
}

/**
 * Attempt direct HTTP registration on Fastify (bypasses WebSocket).
 * Useful for Tauri→Fastify user sync when user was created offline on Tauri.
 * @param {string} phone
 * @param {string} password
 * @param {string} [username]
 * @returns {Promise<{success: boolean, data: object|null, error: string|null, alreadyExists: boolean}>}
 */
async function fastify_http_register(phone, password, username) {
    const cleanPhone = normalize_phone_input(phone) || String(phone || '').trim();
    if (!cleanPhone || !password) {
        return { success: false, data: null, error: 'Phone and password required', alreadyExists: false };
    }
    let timeoutId = null;
    try {
        const baseUrl = resolve_fastify_http_base();
        const url = `${baseUrl}/api/auth/register`;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: cleanPhone,
                password,
                username: username || cleanPhone,
                visibility: 'public'
            }),
            credentials: 'omit',
            signal: controller?.signal
        });
        if (timeoutId) clearTimeout(timeoutId);
        const data = await res.json().catch(() => null);
        // Check for "already exists" which is fine for sync
        if (
            res.status === 409
            || data?.alreadyExists === true
            || (data?.error && String(data.error).toLowerCase().includes('already'))
        ) {
            return { success: true, data, error: null, alreadyExists: true };
        }
        if (!res.ok) {
            console.warn('[Auth] Fastify HTTP register failed:', res.status, data?.error);
            return { success: false, data: null, error: data?.error || `HTTP ${res.status}`, alreadyExists: false };
        }
        return { success: true, data, error: null, alreadyExists: false };
    } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn('[Auth] Fastify HTTP registration threw:', e?.message || e);
        return { success: false, data: null, error: e?.message || String(e), alreadyExists: false };
    }
}

/**
 * Sync the current Tauri user to Fastify when Fastify becomes available.
 * This ensures users created on Tauri while Fastify was offline get synced.
 * @returns {Promise<{synced: boolean, reason: string}>}
 */
async function sync_current_user_to_fastify() {
    if (!is_tauri_runtime()) {
        return { synced: false, reason: 'not_tauri_runtime' };
    }
    if (is_anonymous_mode()) {
        return { synced: false, reason: 'anonymous_mode' };
    }
    const syncPolicy = resolve_sync_policy();
    if (syncPolicy.from !== 'tauri' || syncPolicy.to !== 'fastify') {
        return { synced: false, reason: 'sync_direction_not_tauri_to_fastify' };
    }

    // Get current logged-in user from Tauri
    const userInfo = get_current_user_info();
    if (!userInfo?.id || !userInfo?.phone) {
        // No user logged in or no phone - cannot sync
        return { synced: false, reason: 'no_current_user' };
    }

    // Check if we already have a Fastify token (user already synced)
    const existingFastifyToken = FastifyAdapter.getToken?.();
    if (existingFastifyToken) {
        // Already connected to Fastify - user likely exists there
        return { synced: false, reason: 'already_has_fastify_token' };
    }


    // Try to get cached credentials for this user
    const cachedCreds = load_cached_credentials();
    if (!cachedCreds || cachedCreds.phone !== userInfo.phone || !cachedCreds.password) {
        return { synced: false, reason: 'no_cached_credentials' };
    }

    // Try to login on Fastify first
    const loginResult = await fastify_http_login(userInfo.phone, cachedCreds.password);
    if (loginResult.success && loginResult.token) {
        // User exists on Fastify - login succeeded
        FastifyAdapter.setToken?.(loginResult.token);
        try { await store_fastify_token_in_axum(loginResult.token); } catch { }
        return { synced: true, reason: 'user_exists_login_succeeded' };
    }

    // User doesn't exist on Fastify - register them
    const registerResult = await fastify_http_register(
        userInfo.phone,
        cachedCreds.password,
        userInfo.name || userInfo.phone
    );

    if (!registerResult.success && !registerResult.alreadyExists) {
        console.warn('[Auth] Failed to sync user to Fastify:', registerResult.error);
        // Mark as pending for retry
        mark_user_sync_pending();
        return { synced: false, reason: 'registration_failed', error: registerResult.error };
    }


    // Now login to get the token
    const postRegisterLogin = await fastify_http_login(userInfo.phone, cachedCreds.password);
    if (postRegisterLogin.success && postRegisterLogin.token) {
        FastifyAdapter.setToken?.(postRegisterLogin.token);
        try { await store_fastify_token_in_axum(postRegisterLogin.token); } catch { }
        return { synced: true, reason: 'user_synced' };
    }

    return { synced: false, reason: 'post_register_login_failed' };
}

async function ensure_fastify_token() {
    const authSource = resolveAuthSource();
    const dataSource = resolveDataSource();
    const syncPolicy = resolve_sync_policy();
    const needsFastify = authSource === 'fastify'
        || dataSource === 'fastify'
        || syncPolicy.from === 'fastify'
        || syncPolicy.to === 'fastify';

    if (!needsFastify) return { ok: false, reason: 'fastify_not_required' };
    if (!is_tauri_runtime()) {
        const existing = FastifyAdapter.getToken?.();
        if (existing) return { ok: true, reason: 'token_present' };
        const cached = load_fastify_login_cache();
        if (cached?.phone && is_any_anonymous_phone(cached.phone)) {
            return { ok: false, reason: 'cached_anonymous' };
        }
        if (cached?.phone && cached?.password) {
            try {
                const httpLogin = await fastify_http_login(cached.phone, cached.password);
                if (httpLogin.success && httpLogin.token) {
                    return { ok: true, reason: 'token_http_login' };
                }
                return { ok: false, reason: 'http_login_failed', error: httpLogin.error || null };
            } catch (e) {
                return { ok: false, reason: 'http_login_failed', error: e?.message || String(e) };
            }
        }
        return { ok: false, reason: 'not_tauri' };
    }

    const existing = FastifyAdapter.getToken?.();
    if (existing) return { ok: true, reason: 'token_present' };

    const now = Date.now();
    if (_lastFastifyAutoLoginAttempt && (now - _lastFastifyAutoLoginAttempt < 15000)) {
        return { ok: false, reason: 'cooldown' };
    }

    // Step 1: Try to get stored Fastify token from Axum (survives localStorage clear)
    try {
        const storedToken = await get_stored_fastify_token_from_axum();
        if (storedToken) {
            // Additional safety: only accept a stored Fastify token if the local Tauri
            // session (local token + current user) can be validated. Otherwise clear
            // the stored token in Axum to avoid cross-user leakage after resets.
            const localTauriToken = TauriAdapter.getToken?.();
            if (!localTauriToken) {
                console.warn('[Auth] Found stored Fastify token but no local Tauri token; clearing stored mapping');
                try { await clear_stored_fastify_token_in_axum(); } catch { };
                FastifyAdapter.clearToken?.();
            } else {
                // Validate the token by setting it and checking with /me
                FastifyAdapter.setToken?.(storedToken);
                try {
                    const meResult = await FastifyAdapter.auth.me();
                    if (meResult?.ok || meResult?.success) {
                        // If we have a local Tauri identity, ensure the Fastify token maps to the same user.
                        try {
                            const tauriMe = await TauriAdapter.auth.me?.();
                            const fastifyUserId = meResult?.user?.user_id || meResult?.user?.id || null;
                            const tauriUserId = tauriMe?.user?.user_id || tauriMe?.user?.id || null;
                            if (tauriUserId && fastifyUserId && tauriUserId !== fastifyUserId) {
                                console.warn('[Auth] Fastify token restored but user mismatch with Tauri user; refusing token and clearing stored mapping');
                                try { await clear_stored_fastify_token_in_axum(); } catch { };
                                FastifyAdapter.clearToken?.();
                            } else {
                                return { ok: true, reason: 'token_restored_from_axum' };
                            }
                        } catch (e) {
                            // If Tauri.me check fails, be conservative and refuse the token to avoid cross-user leaks.
                            console.warn('[Auth] Could not validate Tauri user when restoring Fastify token:', e?.message || e);
                            try { await clear_stored_fastify_token_in_axum(); } catch { };
                            FastifyAdapter.clearToken?.();
                        }
                    }
                } catch {
                    // Token expired or invalid, continue to login
                }
                // Token invalid or refused, clear it
                FastifyAdapter.clearToken?.();
            }
        }
    } catch {
        // Ignore errors from Axum token retrieval
    }

    // Step 2: Fallback to localStorage credentials
    const cached = load_fastify_login_cache();
    if (cached?.phone && is_any_anonymous_phone(cached.phone)) {
        return { ok: false, reason: 'cached_anonymous' };
    }

    const attemptLogin = async (phone, password, reasonLabel) => {
        const normalizedPhone = normalize_phone_input(phone);
        const resolvedPhone = normalizedPhone || phone;
        if (!resolvedPhone || !password) return { ok: false, reason: reasonLabel };
        _lastFastifyAutoLoginAttempt = now;
        try {
            const res = await FastifyAdapter.auth.login({ phone: resolvedPhone, password });
            if (res && (res.ok || res.success)) {
                // SECURITY: Verify the Fastify user matches the Tauri user to prevent cross-user data leakage
                try {
                    const tauriMe = await TauriAdapter.auth.me?.();
                    const tauriUserId = tauriMe?.user?.user_id || tauriMe?.user?.id || null;
                    const fastifyMe = await FastifyAdapter.auth.me?.();
                    const fastifyUserId = fastifyMe?.user?.user_id || fastifyMe?.user?.id || null;

                    if (tauriUserId && fastifyUserId && String(tauriUserId) !== String(fastifyUserId)) {
                        console.warn('[Auth] SECURITY: Fastify login succeeded but user ID mismatch with Tauri user. Clearing token.');
                        console.warn(`[Auth] Tauri user: ${tauriUserId}, Fastify user: ${fastifyUserId}`);
                        try { FastifyAdapter.clearToken?.(); } catch { }
                        try { await clear_stored_fastify_token_in_axum(); } catch { }
                        return { ok: false, reason: 'user_id_mismatch', error: 'Fastify user does not match Tauri user' };
                    }
                } catch (verifyErr) {
                    // If we can't verify, be conservative and clear the token
                    console.warn('[Auth] Could not verify user identity after Fastify login:', verifyErr?.message || verifyErr);
                }

                // Save the new Fastify token to Axum for persistence
                const newToken = FastifyAdapter.getToken?.();
                if (newToken) {
                    save_fastify_token_to_axum(newToken).then(saved => {
                    }).catch(() => { });
                }
                return { ok: true, reason: 'login_ok' };
            }
            return { ok: false, reason: res?.error || reasonLabel || 'login_failed', error: res?.error };
        } catch (e) {
            return { ok: false, reason: e.message || reasonLabel || 'login_failed', error: e.message };
        }
    };

    const tryRegisterAndLogin = async (phone, password, username) => {
        const normalizedPhone = normalize_phone_input(phone);
        const resolvedPhone = normalizedPhone || phone;
        try {
            const reg = await FastifyAdapter.auth.register({
                phone: resolvedPhone,
                password,
                username: username || resolvedPhone,
                visibility: 'public'
            });
            if (reg && (reg.ok || reg.success || is_already_exists_error(reg))) {
                const retry = await attemptLogin(resolvedPhone, password, 'login_after_register_failed');
                if (retry.ok) return retry;
            }
        } catch { }
        return { ok: false, reason: 'register_failed' };
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
                const retry = await tryRegisterAndLogin(cached.phone, cached.password, registerUsername);
                if (retry.ok) return retry;
            } catch { }
        }
    }

    const pendingCreds = load_pending_register_credentials();
    if (pendingCreds?.phone && pendingCreds?.password) {
        const result = await attemptLogin(pendingCreds.phone, pendingCreds.password, 'pending_login_failed');
        if (result.ok) {
            save_fastify_login_cache({ phone: normalize_phone_input(pendingCreds.phone) || pendingCreds.phone, password: pendingCreds.password });
            return result;
        }

        const errMsg = String(result?.reason || '').toLowerCase();
        const shouldRegister = errMsg.includes('user not found')
            || errMsg.includes('no user')
            || errMsg.includes('not found')
            || errMsg.includes('invalid credentials');

        if (shouldRegister) {
            const retry = await tryRegisterAndLogin(
                pendingCreds.phone,
                pendingCreds.password,
                pendingCreds.username || pendingCreds.phone
            );
            if (retry.ok) {
                save_fastify_login_cache({ phone: normalize_phone_input(pendingCreds.phone) || pendingCreds.phone, password: pendingCreds.password });
                return retry;
            }
        }
    }

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

    const properties = raw.properties || raw.particles || raw.data?.particles || raw.data || raw;
    const userId = raw.user_id || raw.userId || raw.atome_id || raw.id || null;
    const username = safe_parse_json(properties?.username) || raw.username || null;
    const phone = safe_parse_json(properties?.phone) || raw.phone || null;
    const visibility = safe_parse_json(properties?.visibility) || raw.visibility || 'public';
    const profileRaw = safe_parse_json(properties?.eve_profile || properties?.profile || raw.eve_profile || raw.profile || null);
    const profile = (profileRaw && typeof profileRaw === 'object' && !Array.isArray(profileRaw)) ? profileRaw : null;
    const firstName = safe_parse_json(properties?.first_name || properties?.firstname || properties?.firstName
        || profile?.first_name || profile?.firstname || profile?.firstName
        || raw.first_name || raw.firstname || raw.firstName || null);
    const name = safe_parse_json(properties?.name || profile?.name || raw.name || null);

    // Phone number is the stable lookup key for sharing/discovery.
    // Drop entries that do not have a usable phone.
    const phoneStr = normalize_phone_input(phone);
    if (!phoneStr || phoneStr.toLowerCase() === 'unknown') return null;

    return {
        user_id: userId,
        username: (username && String(username).trim()) ? username : 'Unknown',
        name: (name && String(name).trim()) ? name : undefined,
        first_name: (firstName && String(firstName).trim()) ? firstName : undefined,
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
    if (is_anonymous_mode()) {
        return { skipped: true, reason: 'anonymous_mode' };
    }

    if (_syncAtomesInProgress) {
        return { skipped: true, reason: 'in_progress' };
    }
    const syncPolicy = resolve_sync_policy();
    if (!syncPolicy.from || !syncPolicy.to) {
        return { skipped: true, reason: 'sync_off' };
    }
    if (!is_tauri_runtime()) {
        return { skipped: true, reason: 'not_tauri' };
    }
    if (!_currentUserId) {
        try {
            const currentResult = await current_user();
            if (currentResult?.logged && currentResult.user) {
                _currentUserId = currentResult.user.user_id || currentResult.user.atome_id || currentResult.user.id || null;
            }
        } catch { }
        if (!_currentUserId) {
            return { skipped: true, reason: 'no_user' };
        }
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

    if (syncPolicy.from === 'tauri' && !backends.tauri) {
        return { skipped: true, reason: 'source_unavailable' };
    }
    if (syncPolicy.from === 'fastify' && !backends.fastify) {
        return { skipped: true, reason: 'source_unavailable' };
    }
    if (syncPolicy.to === 'tauri' && !backends.tauri) {
        return { skipped: true, reason: 'target_unavailable' };
    }
    if (syncPolicy.to === 'fastify' && !backends.fastify) {
        return { skipped: true, reason: 'target_unavailable' };
    }

    const sourceToken = syncPolicy.from === 'tauri' ? TauriAdapter.getToken?.() : FastifyAdapter.getToken?.();
    let targetToken = syncPolicy.to === 'fastify' ? FastifyAdapter.getToken?.() : TauriAdapter.getToken?.();

    if (!targetToken && syncPolicy.to === 'fastify') {
        try { await ensure_fastify_token(); } catch { }
        targetToken = FastifyAdapter.getToken?.();
    }
    if (!sourceToken || !targetToken) {
        return { skipped: true, reason: 'missing_token' };
    }

    _syncAtomesInProgress = true;
    _lastSyncAtomesAttempt = now;
    try {
        if (syncPolicy.to === 'fastify') {
            await process_pending_deletes();
        }
        return await sync_atomes();
    } catch (e) {
        return { skipped: false, error: e.message, reason };
    } finally {
        _syncAtomesInProgress = false;
    }
}

// Alias for maybe_sync_atomes - used throughout the codebase for triggering sync
const request_sync = maybe_sync_atomes;

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
    const clean = normalize_phone_input(phone);
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
    const hit = cache.find((u) => normalize_phone_input(u.phone) === clean);
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
            const key = normalize_phone_input(nu.phone) || String(nu.user_id || '').trim();
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
        const key = normalize_phone_input(nu.phone) || String(nu.user_id || '').trim();
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

function queue_pending_register({ username, phone, password, createdOn, optional }) {
    if (typeof localStorage === 'undefined') return;
    try {
        const queue = JSON.parse(localStorage.getItem(AUTH_PENDING_SYNC_KEY) || '[]');
        queue.push({
            operation: 'register',
            data: { username, phone, password, createdOn, optional },
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
    const syncPolicy = resolve_sync_policy();
    if (syncPolicy.to !== 'fastify') {
        return { processed: 0, remaining: queue.length, error: 'sync_off' };
    }

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
let userSyncPollingStarted = false;
let userSyncPollingId = null;
let _pendingUserSync = false; // Flag: user sync pending when Fastify becomes available
let _fastifyConnectionPollingStarted = false; // Flag: aggressive polling for Fastify connection
let _fastifyConnectionPollingId = null;

function start_pending_register_monitor() {
    if (pendingRegisterMonitorStarted || typeof window === 'undefined') return;
    pendingRegisterMonitorStarted = true;

    const pollInterval = Math.max(CONFIG.CHECK_INTERVAL || 30000, 15000);
    pendingRegisterMonitorId = setInterval(async () => {
        const syncPolicy = resolve_sync_policy();
        if (!syncPolicy.from || !syncPolicy.to) return;
        const hasRegisters = has_pending_registers();
        const hasDeletes = load_pending_deletes().length > 0;
        if (!hasRegisters && !hasDeletes) return;
        try {
            const { fastify } = await checkBackends(true);
            if (syncPolicy.to === 'fastify' && fastify) {
                if (hasRegisters) await process_pending_registers();
                if (hasDeletes) await process_pending_deletes();
            }
            if (syncPolicy.to === 'tauri' && syncPolicy.from === 'fastify') {
                const { tauri } = await checkBackends(true);
                if (tauri && hasRegisters) await process_pending_registers();
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
            await request_sync('periodic');
        } catch {
            // Ignore
        }
    }, pollInterval);
}

/**
 * Mark that user sync to Fastify is pending (will retry when Fastify becomes available)
 */
function mark_user_sync_pending() {
    _pendingUserSync = true;
    start_user_sync_polling();
}

/**
 * Clear the pending user sync flag
 */
function clear_user_sync_pending() {
    _pendingUserSync = false;
}

/**
 * Check if user sync to Fastify is pending
 */
function is_user_sync_pending() {
    return _pendingUserSync;
}

/**
 * Start AGGRESSIVE polling for Fastify connection (every 1 second).
 * This ensures that when a user is created on Tauri while Fastify is offline,
 * the sync happens as soon as Fastify becomes available without needing a refresh.
 */
function start_fastify_connection_polling() {
    if (_fastifyConnectionPollingStarted || typeof window === 'undefined') return;
    if (!is_tauri_runtime()) return;

    const syncPolicy = resolve_sync_policy();
    if (syncPolicy.to !== 'fastify') return; // Only needed for tauri→fastify sync

    _fastifyConnectionPollingStarted = true;
    const pollInterval = 1000; // Check EVERY SECOND

    _fastifyConnectionPollingId = setInterval(async () => {
        // Check if we already have a Fastify token
        const existingToken = FastifyAdapter.getToken?.();
        if (existingToken) {
            // We have a token - Fastify is connected
            // But we should still check if there are pending syncs
            if (_pendingUserSync) {
                clear_user_sync_pending();
            }
            return;
        }

        // No Fastify token - check if Fastify is now available
        try {
            const { fastify } = await checkBackends(true);
            if (fastify) {

                // Try to sync the current user to Fastify
                const result = await sync_current_user_to_fastify();
                if (result.synced) {
                    clear_user_sync_pending();

                    // CRITICAL: Now sync all existing atomes
                    setTimeout(async () => {
                        try {
                            const syncResult = await maybe_sync_atomes('fastify_connection_restored');

                            // If sync failed due to cooldown or was skipped, retry after a short delay
                            if (syncResult.skipped && syncResult.reason === 'cooldown') {
                                setTimeout(async () => {
                                    try {
                                        const retryResult = await maybe_sync_atomes('fastify_connection_restored_retry');
                                    } catch (e) {
                                        console.warn('[Sync] Atomes sync retry failed:', e?.message || e);
                                    }
                                }, 6000); // Wait for cooldown to expire
                            }
                        } catch (e) {
                            console.warn('[Sync] Atomes sync failed after Fastify connection:', e?.message || e);
                        }
                    }, 500);
                } else {
                }
            }
        } catch (e) {
            // Fastify still not available, will retry in 1 second
        }
    }, pollInterval);
}

/**
 * Stop aggressive Fastify connection polling
 */
function stop_fastify_connection_polling() {
    if (_fastifyConnectionPollingId) {
        clearInterval(_fastifyConnectionPollingId);
        _fastifyConnectionPollingId = null;
    }
    _fastifyConnectionPollingStarted = false;
}

/**
 * Start polling for Fastify availability to sync the current user.
 * This runs independently of pending registers and ensures user sync happens
 * when Fastify comes online after user was created on Tauri.
 */
function start_user_sync_polling() {
    if (userSyncPollingStarted || typeof window === 'undefined') return;
    if (!is_tauri_runtime()) return;
    userSyncPollingStarted = true;

    const pollInterval = 1000; // Check EVERY SECOND (was 10s, now 1s for faster reconnection)

    userSyncPollingId = setInterval(async () => {
        // Only proceed if we have a pending user sync and no Fastify token
        if (!_pendingUserSync) return;
        const existingToken = FastifyAdapter.getToken?.();
        if (existingToken) {
            // Already have token, clear pending flag
            clear_user_sync_pending();
            return;
        }

        // Check if Fastify is now available
        try {
            const { fastify } = await checkBackends(true);
            if (fastify) {
                const result = await sync_current_user_to_fastify();
                if (result.synced) {
                    clear_user_sync_pending();

                    // CRITICAL: Trigger atomes sync after user sync
                    setTimeout(async () => {
                        try {
                            const syncResult = await maybe_sync_atomes('user_synced_to_fastify');
                        } catch (e) {
                            console.warn('[Auth] Atomes sync failed:', e?.message || e);
                        }
                    }, 500);
                } else {
                    // Keep retrying unless it's a permanent failure
                    if (result.reason === 'no_current_user' || result.reason === 'no_cached_credentials') {
                        clear_user_sync_pending();
                    }
                }
            }
        } catch (e) {
            // Ignore errors, will retry
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

    const syncPolicy = resolve_sync_policy();
    if (!syncPolicy.from || !syncPolicy.to) {
        return { processed: 0, remaining: queue.length, error: 'sync_off' };
    }

    const remaining = [];
    let processed = 0;

    for (const item of queue) {
        if (!item || item.operation !== 'register' || !item.data) {
            continue;
        }

        const data = item.data;
        const username = data.username;
        const phone = data.phone;
        const cleanPhone = normalize_phone_input(phone) || phone;
        const password = data.password;
        const createdOn = data.createdOn;
        const optional = data.optional || null;

        if (!username || !phone || !password) {
            continue;
        }

        // Only sync to the configured target backend.
        try {
            if (createdOn === syncPolicy.from && syncPolicy.to === 'fastify') {
                const r = await FastifyAdapter.auth.register({ username, phone: cleanPhone, password, visibility: 'public', optional });
                if (r && (r.ok || r.success || is_already_exists_error(r))) {
                    processed += 1;
                    if (is_tauri_runtime() && syncPolicy.to === 'fastify') {
                        save_fastify_login_cache({ phone: cleanPhone, password });
                        if (!FastifyAdapter.getToken?.()) {
                            try { await FastifyAdapter.auth.login({ phone: cleanPhone, password }); } catch { }
                        }
                    }
                    continue;
                }
            } else if (createdOn === syncPolicy.from && syncPolicy.to === 'tauri') {
                const r = await TauriAdapter.auth.register({ username, phone: cleanPhone, password, visibility: 'public', optional });
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
        get name() { return _currentProjectName; },
        get owner_id() { return _currentProjectOwnerId; },
        get ownerId() { return _currentProjectOwnerId; }
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
        const properties = result?.tauri?.data?.properties ||
            result?.fastify?.data?.properties ||
            result?.tauri?.atome?.properties ||
            result?.fastify?.atome?.properties ||
            result?.tauri?.data?.particles ||
            result?.fastify?.data?.particles ||
            result?.tauri?.atome?.particles ||
            result?.fastify?.atome?.particles ||
            {};

        return {
            userId: properties.last_user_id || null,
            lastLogin: properties.last_login || null
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
    const previousUserId = _currentUserId;
    const previousUserName = _currentUserName;
    const previousUserPhone = _currentUserPhone;
    const switchingUser = previousUserId && userId && String(previousUserId) !== String(userId);
    // Always clear UI when logging in a user (even if no previous user), to prevent stale data leakage
    const isNewLogin = userId && !previousUserId;
    try {
        console.log('[AuthState] set_current_user_state', {
            previousUserId,
            userId,
            userName,
            userPhone,
            switchingUser,
            isNewLogin,
            persistMachine
        });
    } catch { }
    if (switchingUser) {
        clear_ui_for_user_switch(previousUserId, userId);
    } else if (isNewLogin) {
        // First login - clear any stale UI from previous session
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('squirrel:clear-view', {
                detail: {
                    reason: 'first_login',
                    clearAtomes: true,
                    clearProject: true
                }
            }));
        }
    }

    _currentUserId = userId;
    _currentUserName = userName;
    _currentUserPhone = userPhone;

    if (userId && is_anonymous_identity({ userId, phone: userPhone, username: userName })) {
        _anonymousUserId = userId;
    }

    const wasAnonymous = is_anonymous_identity({
        userId: previousUserId,
        phone: previousUserPhone,
        username: previousUserName
    });
    const nowAnonymous = is_anonymous_identity({ userId, phone: userPhone, username: userName });
    if (switchingUser && wasAnonymous && !nowAnonymous) {
        try {
            await migrate_anonymous_workspace(previousUserId, userId);
        } catch (e) {
            console.warn('[Auth] Anonymous workspace migration failed:', e?.message || e);
        }
    }


    // PERSIST SESSION: Save to localStorage so session survives page refresh
    if (userId) {
        save_user_session(userId, userName, userPhone);
        try { signal_auth_check_complete(true, userId); } catch { }
        // Dispatch user-logged-in event only when switching or first login
        if ((switchingUser || isNewLogin) && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('squirrel:user-logged-in', {
                detail: {
                    userId,
                    user_id: userId,
                    userName,
                    userPhone,
                    timestamp: Date.now(),
                    isSwitch: switchingUser,
                    isFirstLogin: isNewLogin
                }
            }));
        } else {
            try {
                console.log('[AuthState] user-logged-in suppressed (no change)', {
                    userId,
                    switchingUser,
                    isNewLogin
                });
            } catch { }
        }
    }

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

    }

    return true;
}

async function migrate_anonymous_workspace(fromUserId, toUserId) {
    if (!is_tauri_runtime()) {
        return { ok: false, reason: 'not_tauri' };
    }
    if (!fromUserId || !toUserId) {
        return { ok: false, reason: 'missing_user' };
    }
    if (String(fromUserId) === String(toUserId)) {
        return { ok: true, skipped: true, reason: 'same_user' };
    }
    const key = `${fromUserId}->${toUserId}`;
    if (_anonMigrationDone.has(key)) {
        return { ok: true, skipped: true, reason: 'already_migrated' };
    }

    const transferResult = await TauriAdapter.atome.transferOwner({
        fromOwnerId: fromUserId,
        toOwnerId: toUserId,
        includeCreator: true
    });
    const ok = !!(transferResult?.ok || transferResult?.success);
    if (ok) {
        _anonMigrationDone.add(key);
        try {
            const syncPolicy = resolve_sync_policy();
            if (syncPolicy.from && syncPolicy.to && syncPolicy.to === 'fastify' && !is_anonymous_mode()) {
                try { await ensure_fastify_token(); } catch { }
                try { await request_sync('anonymous-migration'); } catch { }
            }
        } catch { }
    }
    return {
        ok,
        data: transferResult?.data || null,
        error: transferResult?.error || null
    };
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

            // P0 FIX: Ensure Fastify token is obtained for sync mirroring
            const syncPolicy = resolve_sync_policy();
            if (syncPolicy.to === 'fastify' && is_tauri_runtime()) {
                try {
                    const fastifyResult = await ensure_fastify_token();
                    if (fastifyResult.ok) {
                    } else {
                        console.warn('[Auth] Could not get Fastify token:', fastifyResult.reason);
                    }
                } catch (e) {
                    console.warn('[Auth] ensure_fastify_token failed:', e.message);
                }
            }

            return { success: true, userId: user.user_id || user.id, userName: user.username };
        }

        // Check machine's last user
        const machineUser = await get_machine_last_user();
        if (machineUser.userId) {
            // Note: We don't auto-login here, just return the info
            // The app can decide whether to auto-login or show login screen
            return { success: false, userId: machineUser.userId, userName: null, hint: 'last_user_known' };
        }

        // If we reach here there's no current user and no machine last-user hint.
        // Clear any persisted Fastify token mapping on Axum to avoid accidental
        // cross-user restoration after resets.
        try {
            if (is_tauri_runtime()) {
                await clear_stored_fastify_token_in_axum();
            }
        } catch (e) { }

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
 * @returns {{id: string|null, name: string|null, owner_id: string|null}} Current project info
 */
function get_current_project() {
    return {
        id: _currentProjectId,
        name: _currentProjectName,
        owner_id: _currentProjectOwnerId
    };
}

/**
 * Set the current project (in memory and persist to user particle)
 * @param {string} projectId - Project ID
 * @param {string} [projectName] - Project name (optional)
 * @param {string} [ownerId] - Owner ID (required for security)
 * @param {boolean} [persist=true] - Whether to save to database
 * @returns {Promise<boolean>} Success status
 */
async function set_current_project(projectId, projectName = null, ownerId = null, persist = true) {
    // SECURITY: Validate owner matches current user before setting project
    const allowAnonymousLocal = is_tauri_runtime() && is_anonymous_mode();
    if (!allowAnonymousLocal && ownerId && _currentUserId && String(ownerId) !== String(_currentUserId)) {
        console.error('[AdoleAPI] SECURITY: Cannot set project with different owner', {
            projectId,
            projectOwner: ownerId,
            currentUser: _currentUserId
        });
        return false;
    }

    _currentProjectId = projectId;
    _currentProjectName = projectName;
    _currentProjectOwnerId = ownerId || _currentUserId;

    // Do not write a project cache when there's no logged user to avoid cross-user leakage.
    if (_currentUserId) {
        write_cached_current_project(projectId, projectName, _currentUserId);
    }


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

        const anonymous = is_anonymous_mode();
        const allowTauri = !anonymous || is_tauri_runtime();
        const allowFastify = !anonymous || !is_tauri_runtime();

        // Try to update via both adapters (respect anonymous local-only mode)
        if (allowTauri) {
            try {
                await TauriAdapter.atome.alter(userId, particleData);
            } catch (e) {
                console.warn('[AdoleAPI] Tauri persist current project failed:', e.message);
            }
        }

        if (allowFastify) {
            try {
                await FastifyAdapter.atome.alter(userId, particleData);
            } catch (e) {
                console.warn('[AdoleAPI] Fastify persist current project failed:', e.message);
            }
        }

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
    const cached = read_cached_current_project();
    // Accept cached only if it's not user-scoped OR it matches the currently logged user.
    const cacheMatchesUser = cached?.id && cached.userId && _currentUserId && cached.userId === _currentUserId;
    if (cacheMatchesUser) {
        _currentProjectId = cached.id;
        _currentProjectName = cached.name || null;
    }

    const refresh = async () => {
        try {
            // Get current user
            const userResult = await current_user();
            const userId = userResult?.user?.user_id || userResult?.user?.id;

            if (!userId) {
                return { id: null, name: null };
            }

            // Get user atome to read current_project_id particle
            const atomeResult = await get_atome(userId);
            const properties = atomeResult?.tauri?.data?.properties ||
                atomeResult?.fastify?.data?.properties ||
                atomeResult?.tauri?.properties ||
                atomeResult?.fastify?.properties ||
                atomeResult?.tauri?.data?.particles ||
                atomeResult?.fastify?.data?.particles ||
                atomeResult?.tauri?.particles ||
                atomeResult?.fastify?.particles ||
                {};

            const savedProjectId = properties.current_project_id || null;
            const savedProjectName = properties.current_project_name || null;

            if (savedProjectId) {
                _currentProjectId = savedProjectId;
                _currentProjectName = savedProjectName;
                write_cached_current_project(savedProjectId, savedProjectName, userId);
            }

            return { id: savedProjectId, name: savedProjectName };
        } catch (e) {
            console.warn('[AdoleAPI] Could not load saved current project:', e.message);
            return { id: null, name: null };
        }
    };

    if (cached?.id && cacheMatchesUser) {
        refresh().catch(() => { });
        return { id: _currentProjectId, name: _currentProjectName };
    }

    return refresh();
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

    // NOTE: We no longer call clear_ui_on_logout() here because:
    // 1. It was too aggressive - it deleted the matrix root element entirely
    // 2. set_current_user_state() handles the user state after successful registration
    // 3. If registration fails, the previous user's session should remain intact

    const visibility = options.visibility || 'public';
    const optional = options.optional || null;
    const autoLogin = options.autoLogin !== false;
    const clearAuthTokens = options.clearAuthTokens !== false;
    const rawPhone = String(phone ?? '').trim();
    const normalizedPhone = normalize_phone_input(phone) || rawPhone;
    const resolvedUsername = username || normalizedPhone;
    const flow = create_flow('auth:create');
    const authPlan = resolve_backend_plan('auth');
    const syncPolicy = resolve_sync_policy();

    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    log_flow(flow, 'start', {
        source: authPlan.source,
        sync: resolveSyncDirection()
    });

    if (clearAuthTokens) {
        try { TauriAdapter.clearToken?.(); } catch { }
        try { FastifyAdapter.clearToken?.(); } catch { }
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('auth_token');
            }
        } catch { }
    }

    const registerWith = async (adapter, phoneValue) => {
        if (!adapter?.auth?.register) {
            return { success: false, data: null, error: 'Auth register unavailable' };
        }
        try {
            const res = await adapter.auth.register({
                phone: phoneValue,
                password,
                username: resolvedUsername,
                visibility,
                optional
            });
            const ok = !!(res.ok || res.success);
            const already = is_already_exists_error(res);
            if (ok || already) {
                return { success: true, data: res, error: null, alreadyExists: already && !ok };
            }
            return { success: false, data: null, error: res.error };
        } catch (e) {
            return { success: false, data: null, error: e.message };
        }
    };

    const primaryStart = now_ms();
    let primaryResult = await registerWith(authPlan.primary, normalizedPhone);
    log_flow(flow, 'primary_register', {
        source: authPlan.source,
        ok: !!primaryResult?.success,
        ms: Math.round(now_ms() - primaryStart),
        error: primaryResult?.error || null
    });

    // Fallback to HTTP register in browser/Fastify if WS registration fails.
    if (!primaryResult.success && authPlan.source === 'fastify') {
        try {
            const httpReg = await fastify_http_register(normalizedPhone, password, resolvedUsername);
            log_flow(flow, 'fastify_http_register_fallback', {
                ok: !!httpReg?.success,
                alreadyExists: !!httpReg?.alreadyExists,
                error: httpReg?.error || null
            });
            if (httpReg.success || httpReg.alreadyExists) {
                primaryResult = {
                    success: true,
                    data: httpReg.data,
                    error: null,
                    alreadyExists: !!httpReg.alreadyExists
                };
            } else {
                primaryResult = {
                    success: false,
                    data: null,
                    error: httpReg?.error || primaryResult?.error || 'register_failed'
                };
            }
        } catch (e) {
            log_flow(flow, 'fastify_http_register_fallback', {
                ok: false,
                error: e?.message || String(e)
            });
        }
    }

    results[authPlan.source] = primaryResult;
    results[authPlan.secondaryName] = {
        success: false,
        data: null,
        error: 'skipped',
        skipped: true
    };

    // Unidirectional auth sync: queue a register for the secondary backend if configured.
    if (primaryResult.success && syncPolicy.from === authPlan.source && syncPolicy.to === authPlan.secondaryName) {
        queue_pending_register({
            username: resolvedUsername,
            phone: normalizedPhone,
            password,
            createdOn: authPlan.source,
            optional
        });
        log_flow(flow, 'queued_secondary_register', { target: authPlan.secondaryName });
    }

    // IMPORTANT (browser/Fastify): auth.register may not issue a usable JWT for ws/api.
    // Ensure we explicitly login to get a token and set current user state.
    if (autoLogin && primaryResult.success) {
        try {
            const loginResults = await log_user(normalizedPhone, password, resolvedUsername);
            results.login = loginResults;
        } catch (e) {
            results.login = { error: e.message };
        }
    }
    const loginSuccess = results?.login?.tauri?.success || results?.login?.fastify?.success;
    if (!loginSuccess && authPlan.source === 'fastify') {
        try {
            const httpLogin = await fastify_http_login(normalizedPhone, password);
            if (httpLogin.success) {
                results.login = results.login || {};
                results.login.fastify = { success: true, data: httpLogin.data, error: null };
            } else {
                results.login = results.login || {};
                results.login.fastify = { success: false, data: null, error: httpLogin.error || 'Login failed' };
            }
        } catch (e) {
            results.login = results.login || {};
            results.login.fastify = { success: false, data: null, error: e?.message || String(e) };
        }
    }

    const loginSuccessFinal = results?.login?.tauri?.success || results?.login?.fastify?.success;
    if (!loginSuccessFinal && is_tauri_runtime()) {
        const registeredUser = results[authPlan.source]?.data?.user || null;
        const registeredId = registeredUser?.user_id || registeredUser?.id || registeredUser?.atome_id || null;
        if (registeredId) {
            try {
                await set_current_user_state(
                    registeredId,
                    registeredUser?.username || resolvedUsername || null,
                    registeredUser?.phone || normalizedPhone || null,
                    false
                );
            } catch { }
        }
    }

    // Call callback if provided
    if (typeof callback === 'function') {
        callback(results);
    }

    log_flow(flow, 'done', {
        ok: !!primaryResult.success,
        login: !!loginSuccessFinal
    });
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
        const tauriResult = await TauriAdapter.atome.alter(userId, { visibility: normalizedVisibility });
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
        const fastifyResult = await FastifyAdapter.atome.alter(userId, { visibility: normalizedVisibility });
        if (fastifyResult.ok || fastifyResult.success) {
            results.fastify = { success: true, error: null };
        } else {
            results.fastify = { success: false, error: fastifyResult.error };
        }
    } catch (e) {
        results.fastify = { success: false, error: e.message };
    }

    if (results.tauri.success || results.fastify.success) {
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
    // NOTE: We no longer call clear_ui_on_logout() here because:
    // 1. It was too aggressive - it deleted the matrix root element entirely
    // 2. set_current_user_state() already handles user switching via clear_ui_for_user_switch()
    // 3. If login fails, the previous user's session should remain intact

    const rawPhone = String(phone ?? '').trim();
    const normalizedPhone = normalize_phone_input(phone) || rawPhone;
    const resolvedUsername = username || normalizedPhone;
    const flow = create_flow('auth:login');
    const authPlan = resolve_backend_plan('auth');
    const syncPolicy = resolve_sync_policy();
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };

    log_flow(flow, 'start', {
        source: authPlan.source,
        sync: resolveSyncDirection()
    });

    const loginWith = async (adapter, phoneValue) => {
        if (!adapter?.auth?.login) {
            return { success: false, data: null, error: 'Auth login unavailable' };
        }
        try {
            const res = await adapter.auth.login({ phone: phoneValue, password });
            if (res.ok || res.success) {
                return { success: true, data: res, error: null };
            }
            return { success: false, data: null, error: res.error };
        } catch (e) {
            return { success: false, data: null, error: e.message };
        }
    };

    const primaryStart = now_ms();
    let primaryResult = await loginWith(authPlan.primary, normalizedPhone);
    log_flow(flow, 'primary_login', {
        source: authPlan.source,
        ok: !!primaryResult?.success,
        ms: Math.round(now_ms() - primaryStart),
        error: primaryResult?.error || null
    });

    results[authPlan.source] = primaryResult;
    results[authPlan.secondaryName] = {
        success: false,
        data: null,
        error: 'skipped',
        skipped: true
    };

    // ─────────────────────────────────────────────────────────────────────────
    // FASTIFY → TAURI SYNC: If primary is Tauri and login failed (user not found),
    // try to login on Fastify via HTTP (reliable even if WS not connected).
    // If that succeeds, bootstrap the user locally so subsequent logins work on Tauri.
    // ─────────────────────────────────────────────────────────────────────────
    if (!primaryResult.success && authPlan.source === 'tauri' && is_tauri_runtime()) {
        const errorMsg = String(primaryResult.error || '').toLowerCase();
        const isUserNotFound = errorMsg.includes('user not found') || errorMsg.includes('invalid credentials') || errorMsg.includes('phone');
        if (isUserNotFound) {
            try {
                // Use direct HTTP login (more reliable than WebSocket which may not be connected)
                const fastifyLoginResult = await fastify_http_login(normalizedPhone, password);
                if (fastifyLoginResult.success) {
                    // Bootstrap the user on Tauri so future logins work locally
                    try {
                        const bootstrapRes = await TauriAdapter.auth.register({
                            phone: normalizedPhone,
                            password,
                            username: resolvedUsername,
                            visibility: 'public'
                        });
                        if (bootstrapRes?.ok || bootstrapRes?.success || is_already_exists_error(bootstrapRes)) {
                            // Retry local login now that user exists
                            primaryResult = await loginWith(authPlan.primary, normalizedPhone);
                            results[authPlan.source] = primaryResult;
                            if (primaryResult.success) {
                            }
                        } else {
                            console.warn('[Auth] Bootstrap on Tauri failed:', bootstrapRes?.error);
                        }
                    } catch (bootstrapErr) {
                        console.warn('[Auth] Bootstrap on Tauri threw:', bootstrapErr?.message || bootstrapErr);
                    }
                    // Keep Fastify result for reference
                    results.fastify = { success: true, data: fastifyLoginResult.data, error: null };
                } else {
                }
            } catch (e) {
                console.warn('[Auth] Fastify HTTP fallback login threw:', e?.message || e);
            }
        }
    }

    // If login succeeded, ensure Fastify token exists when Fastify is the auth source.
    // Without a token, all Fastify data operations will fail.
    if (primaryResult.success && authPlan.source === 'fastify') {
        let fastifyToken = FastifyAdapter.getToken?.();
        if (!fastifyToken) {
            const tokenFromResult = primaryResult?.data?.token
                || primaryResult?.data?.data?.token
                || primaryResult?.data?.result?.token
                || null;
            if (tokenFromResult) {
                try { FastifyAdapter.setToken?.(tokenFromResult); } catch { }
                fastifyToken = tokenFromResult;
            }
        }

        if (!fastifyToken) {
            try {
                const httpLogin = await fastify_http_login(normalizedPhone, password);
                if (httpLogin.success && httpLogin.token) {
                    results.fastify = { success: true, data: httpLogin.data, error: null };
                    fastifyToken = httpLogin.token;
                    log_flow(flow, 'fastify_http_login_fallback', { ok: true });
                } else {
                    log_flow(flow, 'fastify_http_login_fallback', { ok: false, error: httpLogin.error || null });
                }
            } catch (e) {
                log_flow(flow, 'fastify_http_login_fallback', { ok: false, error: e?.message || String(e) });
            }
        }

        if (!fastifyToken) {
            primaryResult.success = false;
            primaryResult.error = primaryResult.error || 'Auth token is missing';
            results[authPlan.source] = primaryResult;
        }
    }

    // If login succeeded, update current user state and machine association
    if (primaryResult.success) {
        if (authPlan.source === 'fastify' || syncPolicy.to === 'fastify') {
            save_fastify_login_cache({ phone: normalizedPhone, password });
        }

        const userData = primaryResult.data?.user || {};
        const userId = userData.user_id || userData.id || userData.userId;
        const userName = userData.username || resolvedUsername;
        const userPhone = userData.phone || normalizedPhone;

        if (userId) {
            await set_current_user_state(userId, userName, userPhone, true);
        }

        // P0 FIX: After successful Tauri login, also login to Fastify to get token for mirroring
        // TAURI→FASTIFY SYNC: If Tauri login succeeded, try to ensure Fastify has this user too
        if (authPlan.source === 'tauri' && syncPolicy.to === 'fastify') {
            try {
                const fastifyResult = await ensure_fastify_token();
                if (fastifyResult.ok) {
                } else {
                    // Fastify login failed - user might not exist on Fastify yet
                    // Trigger HTTP sync regardless of reason (could be login_failed, no_cached_credentials, etc.)
                    const reasonLower = String(fastifyResult.reason || '').toLowerCase();
                    const shouldSync = reasonLower.includes('login_failed')
                        || reasonLower.includes('no_cached')
                        || reasonLower.includes('user not found')
                        || reasonLower.includes('register_failed')
                        || reasonLower === 'cooldown'; // Even on cooldown, try HTTP sync once
                    if (shouldSync || !fastifyResult.ok) {
                        try {
                            const syncResult = await fastify_http_register(normalizedPhone, password, resolvedUsername);
                            if (syncResult.success) {
                                // Now try to get Fastify token via HTTP login
                                const retryResult = await fastify_http_login(normalizedPhone, password);
                                if (retryResult.success) {
                                    results.fastify = { success: true, data: retryResult.data, error: null };
                                    // Save token to Axum for persistence
                                    if (retryResult.token) {
                                        save_fastify_token_to_axum(retryResult.token).catch(() => { });
                                    }
                                }
                            } else {
                                console.warn('[Auth] Could not sync user to Fastify:', syncResult.error);
                                // Mark as pending - will retry when Fastify becomes available
                                mark_user_sync_pending();
                            }
                        } catch (syncErr) {
                            console.warn('[Auth] Tauri→Fastify sync threw:', syncErr?.message || syncErr);
                            // Mark as pending - will retry when Fastify becomes available
                            mark_user_sync_pending();
                        }
                    }
                }
            } catch (e) {
                console.warn('[Auth] ensure_fastify_token failed:', e.message);
            }
        }

        if (syncPolicy.from === authPlan.source) {
            try { await request_sync('login'); } catch { }
        }
    }

    // Call callback if provided
    if (typeof callback === 'function') {
        callback(results);
    }

    log_flow(flow, 'done', { ok: !!primaryResult.success });
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
    const flow = create_flow('auth:me');
    const authPlan = resolve_backend_plan('auth');
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

    result.source = authPlan.source;
    log_flow(flow, 'start', { source: authPlan.source });

    // Query primary auth backend only.
    try {
        const primaryResult = await authPlan.primary.auth.me();
        if (primaryResult.ok || primaryResult.success) {
            if (primaryResult.user) {
                result.logged = true;
                result.user = primaryResult.user;
                await hydrateCurrentUserState(primaryResult.user);
                log_flow(flow, 'ok', { source: authPlan.source });
                if (typeof callback === 'function') {
                    callback(result);
                }
                return result;
            }
        }
        if (primaryResult?.error && typeof primaryResult.error === 'string') {
            const msg = primaryResult.error.toLowerCase();
            if (msg.includes('user not found') || msg.includes('invalid token') || msg.includes('token')) {
                try { authPlan.primary.clearToken?.(); } catch { }
                if (authPlan.source === 'fastify') {
                    try {
                        if (typeof localStorage !== 'undefined') {
                            localStorage.removeItem('auth_token');
                        }
                    } catch { }
                }
            }
        }
    } catch (e) {
        log_flow(flow, 'error', { source: authPlan.source, error: e?.message || String(e) });
    }

    // No user logged in on backend; fall back to memory or anonymous mode.
    if (_currentUserId) {
        result.logged = true;
        result.user = {
            user_id: _currentUserId,
            username: _currentUserName || null,
            phone: _currentUserPhone || null
        };
        result.source = 'memory';
    } else {
        try {
            const anon = await ensure_anonymous_user({ reason: 'current_user' });
            if (anon?.ok && anon.user) {
                result.logged = true;
                result.user = anon.user;
                result.source = 'anonymous';
            }
        } catch { }
    }

    if (typeof callback === 'function') {
        callback(result);
    }

    log_flow(flow, 'done', { logged: result.logged });
    return result;
}

async function unlog_user(callback = null) {
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };
    const flow = create_flow('auth:logout');
    const authPlan = resolve_backend_plan('auth');

    log_flow(flow, 'start', { source: authPlan.source });

    // Primary logout
    try {
        const primaryResult = await authPlan.primary.auth.logout();
        const target = authPlan.source;
        if (primaryResult.ok && primaryResult.success) {
            results[target] = { success: true, data: primaryResult, error: null };
        } else {
            results[target] = { success: false, data: null, error: primaryResult.error };
        }
    } catch (e) {
        results[authPlan.source] = { success: false, data: null, error: e.message };
    }

    results[authPlan.secondaryName] = {
        success: false,
        data: null,
        error: 'skipped',
        skipped: true
    };

    // CRITICAL: Clear ALL tokens from both adapters to prevent cross-user leakage
    try { TauriAdapter.clearToken?.(); } catch (e) { console.warn('[Logout] TauriAdapter.clearToken failed:', e); }
    try { FastifyAdapter.clearToken?.(); } catch (e) { console.warn('[Logout] FastifyAdapter.clearToken failed:', e); }

    clear_fastify_login_cache();
    _currentUserId = null;
    _currentUserName = null;
    _currentUserPhone = null;
    _currentProjectId = null;
    _currentProjectName = null;
    _currentProjectOwnerId = null;
    clear_cached_current_project();

    // CLEAR SESSION: Remove persisted session from localStorage
    clear_user_session();

    // Clear UI - remove all atomes from view to prevent showing previous user's data
    clear_ui_on_logout({ preserveLocalData: true });

    // Clear any pending user sync
    clear_user_sync_pending();

    // Also clear any persisted Fastify token mapping on the Axum side to avoid leaking
    // a Fastify session to another user on this machine after logout/reset.
    try {
        if (is_tauri_runtime()) {
            await clear_stored_fastify_token_in_axum();
        }
    } catch (e) { }

    // Switch to anonymous workspace after logout
    try {
        await ensure_anonymous_user({ reason: 'logout' });
    } catch { }

    // Execute callback if provided
    if (callback && typeof callback === 'function') {
        callback(results);
    }

    log_flow(flow, 'done', { ok: !!results[authPlan.source]?.success });
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
    const cleanPhone = normalize_phone_input(phone) || phone;
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };
    const flow = create_flow('auth:delete');
    const authPlan = resolve_backend_plan('auth');

    log_flow(flow, 'start', { source: authPlan.source });

    // Primary delete
    try {
        const primaryResult = await authPlan.primary.auth.deleteAccount({
            phone: cleanPhone,
            password
        });
        if (primaryResult.ok || primaryResult.success) {
            results[authPlan.source] = { success: true, data: primaryResult, error: null };
        } else {
            results[authPlan.source] = { success: false, data: null, error: primaryResult.error };
        }
    } catch (e) {
        results[authPlan.source] = { success: false, data: null, error: e.message };
    }

    results[authPlan.secondaryName] = {
        success: false,
        data: null,
        error: 'skipped',
        skipped: true
    };

    if (results[authPlan.source]?.success) {
        clear_auth_credentials_for_phone(cleanPhone);
    }

    // Call callback if provided
    if (typeof callback === 'function') {
        callback(results);
    }

    log_flow(flow, 'done', { ok: !!results[authPlan.source]?.success });
    return results;
}

/**
 * Change password for the currently authenticated user
 * @param {Object} data - Password change data
 * @param {string} data.currentPassword - Current password (for verification)
 * @param {string} data.newPassword - New password (min 6 chars)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{success: boolean, message: string, backends: Object}>}
 */
async function change_password(data, callback) {
    if (!data?.currentPassword || !data?.newPassword) {
        const result = { success: false, message: 'Current and new passwords are required', backends: { tauri: null, fastify: null } };
        if (typeof callback === 'function') callback(result);
        return result;
    }
    if (String(data.newPassword).length < 6) {
        const result = { success: false, message: 'New password must be at least 6 characters', backends: { tauri: null, fastify: null } };
        if (typeof callback === 'function') callback(result);
        return result;
    }

    const authPlan = resolve_backend_plan('auth');
    const results = { tauri: null, fastify: null };
    let anySuccess = false;

    try {
        results[authPlan.source] = await authPlan.primary.auth.changePassword(data);
        if (results[authPlan.source]?.success || results[authPlan.source]?.ok) anySuccess = true;
    } catch (error) {
        results[authPlan.source] = { success: false, error: error.message };
    }

    results[authPlan.secondaryName] = { success: false, error: 'skipped' };

    const result = {
        success: anySuccess,
        message: anySuccess ? 'Password updated' : 'Password change failed',
        backends: results
    };
    if (typeof callback === 'function') callback(result);
    return result;
}

/**
 * Delete the currently authenticated account
 * @param {Object} data - Deletion data
 * @param {string} data.password - Password (for verification)
 * @param {boolean} [data.deleteData=true] - Also delete all user data
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{success: boolean, message: string, backends: Object}>}
 */
async function delete_account(data, callback) {
    if (!data?.password) {
        const result = { success: false, message: 'Password is required to delete account', backends: { tauri: null, fastify: null } };
        if (typeof callback === 'function') callback(result);
        return result;
    }

    const authPlan = resolve_backend_plan('auth');
    const results = { tauri: null, fastify: null };
    let anySuccess = false;

    try {
        results[authPlan.source] = await authPlan.primary.auth.deleteAccount(data);
        if (results[authPlan.source]?.success || results[authPlan.source]?.ok) {
            try { authPlan.primary.clearToken?.(); } catch { }
            anySuccess = true;
        }
    } catch (error) {
        results[authPlan.source] = { success: false, error: error.message };
    }

    results[authPlan.secondaryName] = { success: false, error: 'skipped' };

    const result = {
        success: anySuccess,
        message: anySuccess ? 'Account deleted' : 'Account deletion failed',
        backends: results
    };
    if (typeof callback === 'function') callback(result);
    return result;
}

/**
 * Refresh authentication tokens for authenticated backends
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{success: boolean, token: string|null, backends: Object}>}
 */
async function refresh_token(callback) {
    const authPlan = resolve_backend_plan('auth');
    const results = { tauri: null, fastify: null };
    let primaryToken = null;

    try {
        results[authPlan.source] = await authPlan.primary.auth.refreshToken();
        if ((results[authPlan.source]?.success || results[authPlan.source]?.ok) && results[authPlan.source]?.token) {
            primaryToken = results[authPlan.source].token;
        }
    } catch (error) {
        results[authPlan.source] = { success: false, error: error.message };
    }

    results[authPlan.secondaryName] = { success: false, error: 'skipped' };

    const result = {
        success: !!primaryToken,
        token: primaryToken,
        backends: results
    };
    if (typeof callback === 'function') callback(result);
    return result;
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
            try { await sync_current_user_to_fastify(); } catch { }
            try { await request_sync('fastify-available'); } catch { }
        });

        window.addEventListener('squirrel:sync-connected', async (event) => {
            if (event?.detail?.backend && event.detail.backend !== 'fastify') return;
            if (!is_tauri_runtime()) return;
            try { await sync_current_user_to_fastify(); } catch { }
            try { await request_sync('sync-connected'); } catch { }
        });

        const build_remote_atome_payload = (detail = {}) => {
            const normalized = normalizeAtomeRecord(detail);
            const fromAtome = detail && typeof detail === 'object' ? detail.atome : null;
            const normalizedFromAtome = fromAtome && typeof fromAtome === 'object'
                ? normalizeAtomeRecord(fromAtome)
                : null;
            if (!normalized || typeof normalized !== 'object') return null;
            const id = normalized.id || normalized.atome_id || normalized.atomeId || null;
            if (!id) return null;
            let properties = normalized.properties || normalized.data || normalized.particles || {};
            if ((!properties || Object.keys(properties).length === 0) && detail?.newName) {
                properties = { name: detail.newName };
            }
            return {
                id,
                type: normalized.type || normalized.atome_type || normalized.kind
                    || normalizedFromAtome?.type || normalizedFromAtome?.atome_type
                    || properties.type || properties.kind || 'atome',
                parentId: normalized.parentId || normalized.parent_id
                    || normalizedFromAtome?.parentId || normalizedFromAtome?.parent_id
                    || properties.parent_id || properties.parentId || null,
                ownerId: normalized.ownerId || normalized.owner_id
                    || normalizedFromAtome?.ownerId || normalizedFromAtome?.owner_id
                    || properties.owner_id || properties.ownerId || null,
                properties
            };
        };

        const apply_remote_atome_upsert = async (detail) => {
            if (!is_tauri_runtime()) return;
            if (is_anonymous_mode()) return;
            const payload = build_remote_atome_payload(detail);
            if (!payload) return;
            try {
                const res = await TauriAdapter.atome.create({ ...payload, sync: true });
                if (!(res?.ok || res?.success)) {
                    console.warn('[AdoleAPI] Failed to apply remote upsert locally:', res?.error || 'unknown');
                }
            } catch (e) {
                console.warn('[AdoleAPI] Failed to apply remote upsert locally:', e?.message || 'unknown');
            }
        };

        window.addEventListener('squirrel:atome-deleted', async (event) => {
            if (!is_tauri_runtime()) return;
            if (is_anonymous_mode()) return;
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

        ['squirrel:atome-created',
            'squirrel:atome-updated',
            'squirrel:atome-altered',
            'squirrel:atome-renamed',
            'squirrel:atome-restored'
        ].forEach((evt) => {
            window.addEventListener(evt, (event) => {
                apply_remote_atome_upsert(event?.detail || {});
            });
        });

        start_pending_register_monitor();
        start_periodic_sync_monitor();

        // Start aggressive Fastify connection polling for offline-first sync
        start_fastify_connection_polling();

        // SECURITY: On app startup/refresh, check if user session is persisted.
        // If a session exists in localStorage AND the token is valid, restore the logged-in state.
        // Otherwise, clear the view to prevent showing previous user's atomes.
        // CRITICAL: This MUST complete and signal before any project loading happens.
        if (is_tauri_runtime()) {
            // Use squirrel:ready event which fires reliably after DOM is ready
            window.addEventListener('squirrel:ready', async function onSquirrelReadyAuthCheck() {
                window.removeEventListener('squirrel:ready', onSquirrelReadyAuthCheck);

                const savedSession = load_user_session();
                const authSource = resolveAuthSource();
                let token = authSource === 'fastify'
                    ? FastifyAdapter.getToken?.()
                    : TauriAdapter.getToken?.();
                const hasFastifyToken = !!FastifyAdapter.getToken?.();

                // === DETAILED STARTUP STATE LOG ===
                if (savedSession) {
                }

                // Check if local_auth_token actually exists in localStorage (not fallback)
                const realLocalToken = localStorage.getItem('local_auth_token');
                const isTokenFromFallback = authSource === 'tauri' && token && !realLocalToken;
                if (isTokenFromFallback) {
                    console.warn('[Auth] ⚠️ Token is from fallback (cloud_auth_token), not local_auth_token!');
                    console.warn('[Auth] → This may cause auth issues with local Fastify. Re-login recommended.');
                }

                const fallbackToAnonymous = async () => {
                    clear_user_session();
                    clear_ui_on_logout({ preserveLocalData: true });
                    const anon = await ensure_anonymous_user({ reason: 'startup' });
                    if (anon?.ok && anon.user) {
                        const anonId = anon.user.user_id || anon.user.id || null;
                        signal_auth_check_complete(true, anonId);
                    } else {
                        signal_auth_check_complete(false, null);
                    }
                };

                const savedSessionPhone = savedSession?.userPhone || null;
                const isSavedAnon = is_any_anonymous_phone(savedSessionPhone);
                const anonScopeMismatch = isSavedAnon && savedSessionPhone !== resolve_anonymous_phone();

                if (savedSession?.userId && !isSavedAnon && !anonScopeMismatch) {
                    // If we're in Tauri mode but missing a local token, try to re-login using cached credentials.
                    if (authSource === 'tauri' && !token) {
                        try {
                            const cached = load_fastify_login_cache();
                            const savedPhone = normalize_phone_input(savedSession.userPhone) || savedSession.userPhone || null;
                            const cachedPhone = normalize_phone_input(cached?.phone) || cached?.phone || null;
                            const cacheMatches = !savedPhone || !cachedPhone || String(savedPhone) === String(cachedPhone);
                            const cacheUsable = cached?.phone && cached?.password && cacheMatches && !is_any_anonymous_phone(cachedPhone);
                            if (cacheUsable) {
                                const relogin = await TauriAdapter.auth.login({ phone: cachedPhone || savedPhone, password: cached.password });
                                if (relogin?.ok || relogin?.success) {
                                    token = TauriAdapter.getToken?.();
                                }
                            }
                        } catch { }
                    }

                    if (authSource === 'tauri' && !token) {
                        // If a Fastify token exists and matches the saved session, prefer restoring via Fastify
                        // rather than falling back to anonymous.
                        try {
                            const cloudToken = FastifyAdapter.getToken?.() || (typeof localStorage !== 'undefined' ? localStorage.getItem('cloud_auth_token') : null);
                            if (cloudToken) {
                                FastifyAdapter.setToken?.(cloudToken);
                                const meResult = await FastifyAdapter.auth.me?.();
                                const meUser = meResult?.user || null;
                                const meUserId = meUser?.user_id || meUser?.id || meUser?.atome_id || null;
                                const mePhone = meUser?.phone || null;
                                const savedPhone = normalize_phone_input(savedSession.userPhone) || savedSession.userPhone || null;
                                const mePhoneNorm = normalize_phone_input(mePhone) || mePhone || null;
                                const sameUser = (savedSession.userId && meUserId && String(savedSession.userId) === String(meUserId))
                                    || (savedPhone && mePhoneNorm && String(savedPhone) === String(mePhoneNorm));
                                if (meResult?.ok || meResult?.success) {
                                    if (sameUser) {
                                        if (typeof window !== 'undefined') {
                                            window.__SQUIRREL_AUTH_SOURCE__ = 'fastify';
                                            window.__SQUIRREL_DATA_SOURCE__ = 'fastify';
                                            window.__SQUIRREL_PROFILE_SOURCE__ = 'fastify';
                                        }
                                        token = cloudToken;
                                    } else {
                                        try { FastifyAdapter.clearToken?.(); } catch { }
                                    }
                                }
                            }
                        } catch { }
                    }

                    if (authSource === 'tauri' && !token) {
                        await fallbackToAnonymous();
                        return;
                    }
                    set_current_user_state(savedSession.userId, savedSession.userName, savedSession.userPhone);
                    signal_auth_check_complete(true, savedSession.userId);

                    if (!hasFastifyToken) {
                        const syncPolicy = resolve_sync_policy();
                        if (syncPolicy.to === 'fastify') {
                            mark_user_sync_pending();
                        }
                    }

                    if (!hasFastifyToken && !is_tauri_runtime()) {
                        try {
                            const tokenResult = await ensure_fastify_token();
                            if (!tokenResult?.ok) {
                                await fallbackToAnonymous();
                                return;
                            }
                        } catch {
                            await fallbackToAnonymous();
                            return;
                        }
                    }

                    validate_saved_session({
                        userId: savedSession.userId,
                        userName: savedSession.userName,
                        userPhone: savedSession.userPhone
                    }).catch(() => { });
                    return;
                }

                // If we have a persisted anonymous session but no token yet,
                // restore it immediately to keep local workspace stable.
                if (savedSession?.userId && isSavedAnon && !anonScopeMismatch && !token) {
                    set_current_user_state(savedSession.userId, savedSession.userName, savedSession.userPhone);
                    signal_auth_check_complete(true, savedSession.userId);
                    try { await ensure_anonymous_user({ reason: 'startup' }); } catch { }
                    return;
                }

                if (!savedSession || !savedSession.userId || !token || anonScopeMismatch) {
                    // Check if we have a token but no session (legacy login before session persistence was added)
                    if (token && (!savedSession || !savedSession.userId)) {
                        current_user().then(function (currentResult) {
                            const resolvedUserId = currentResult?.user?.user_id || currentResult?.user?.atome_id || currentResult?.user?.id || null;
                            if (currentResult?.logged && resolvedUserId) {
                                set_current_user_state(resolvedUserId, currentResult.user.username, currentResult.user.phone);
                                signal_auth_check_complete(true, resolvedUserId);

                                // Check Fastify token sync
                                if (!hasFastifyToken) {
                                    const syncPolicy = resolve_sync_policy();
                                    if (syncPolicy.to === 'fastify') {
                                        mark_user_sync_pending();
                                    }
                                }
                            } else {
                                fallbackToAnonymous();
                            }
                        }).catch(function (e) {
                            console.warn('[Auth] Startup: Token validation failed:', e?.message || e);
                            fallbackToAnonymous();
                        });
                        return;
                    }

                    await fallbackToAnonymous();
                    return;
                }

                // Session AND token exist - trust the saved session without backend validation
                // The token will be validated on the first actual API call
                // This avoids hanging on backend calls during early startup
                set_current_user_state(savedSession.userId, savedSession.userName, savedSession.userPhone);
                signal_auth_check_complete(true, savedSession.userId);

                // Check Fastify token sync
                if (!hasFastifyToken) {
                    const syncPolicy = resolve_sync_policy();
                    if (syncPolicy.to === 'fastify') {
                        mark_user_sync_pending();
                    }
                }
            }, true); // capture phase to run early
        } else {
            // Browser/Fastify mode - also check auth state on startup
            setTimeout(async function browserStartupAuthCheck() {
                try {
                    const savedSession = load_user_session();
                    const savedPhone = savedSession?.userPhone || null;
                    const savedIsAnon = is_any_anonymous_phone(savedPhone);
                    const savedMismatch = savedIsAnon && savedPhone !== resolve_anonymous_phone();
                    if (savedSession?.userId && !savedIsAnon && !savedMismatch) {
                        try {
                            const cachedCreds = load_fastify_login_cache();
                            const savedPhoneNormalized = normalize_phone_input(savedPhone) || savedPhone || null;
                            if (cachedCreds?.phone) {
                                const cachedPhoneNormalized = normalize_phone_input(cachedCreds.phone) || cachedCreds.phone || null;
                                if (is_any_anonymous_phone(cachedPhoneNormalized)) {
                                    try { localStorage.removeItem(FASTIFY_LOGIN_CACHE_KEY); } catch { }
                                } else if (savedPhoneNormalized && cachedPhoneNormalized && savedPhoneNormalized !== cachedPhoneNormalized) {
                                    try { localStorage.removeItem(FASTIFY_LOGIN_CACHE_KEY); } catch { }
                                }
                            }
                        } catch { }
                        try {
                            const tokenResult = await ensure_fastify_token();
                            if (!tokenResult?.ok) {
                                clear_user_session();
                                clear_ui_on_logout({ preserveLocalData: true });
                                signal_auth_check_complete(false, null);
                                return;
                            }
                        } catch {
                            clear_user_session();
                            clear_ui_on_logout({ preserveLocalData: true });
                            signal_auth_check_complete(false, null);
                            return;
                        }
                        try {
                            const meResult = await FastifyAdapter.auth.me?.();
                            const meUser = meResult?.user || null;
                            const meUserId = meUser?.user_id || meUser?.atome_id || meUser?.id || null;
                            const mePhone = meUser?.phone || null;
                            const savedPhoneNormalized = normalize_phone_input(savedPhone) || savedPhone || null;
                            const mePhoneNormalized = normalize_phone_input(mePhone) || mePhone || null;
                            const sameUserId = savedSession?.userId && meUserId && String(meUserId) === String(savedSession.userId);
                            const samePhone = savedPhoneNormalized && mePhoneNormalized
                                ? String(savedPhoneNormalized) === String(mePhoneNormalized)
                                : true;
                            if (!(meResult?.ok || meResult?.success) || !meUserId || !sameUserId || !samePhone) {
                                clear_user_session();
                                clear_ui_on_logout({ preserveLocalData: true });
                                signal_auth_check_complete(false, null);
                                return;
                            }
                        } catch {
                            clear_user_session();
                            clear_ui_on_logout({ preserveLocalData: true });
                            signal_auth_check_complete(false, null);
                            return;
                        }
                        await set_current_user_state(savedSession.userId, savedSession.userName, savedSession.userPhone, false);
                        signal_auth_check_complete(true, savedSession.userId);
                        validate_saved_session({
                            userId: savedSession.userId,
                            userName: savedSession.userName,
                            userPhone: savedSession.userPhone
                        }).catch(() => { });
                        return;
                    }
                    if (savedSession?.userId && savedIsAnon && !savedMismatch) {
                        await set_current_user_state(savedSession.userId, savedSession.userName, savedSession.userPhone, false);
                        signal_auth_check_complete(true, savedSession.userId);
                        try { await ensure_anonymous_user({ reason: 'startup' }); } catch { }
                        return;
                    }

                    const currentResult = await current_user();

                    const resolvedUserId = currentResult?.user?.user_id || currentResult?.user?.atome_id || currentResult?.user?.id || null;
                    const currentPhone = currentResult?.user?.phone || null;
                    const isAnon = is_any_anonymous_phone(currentPhone);
                    const anonScopeMismatch = isAnon && currentPhone !== resolve_anonymous_phone();
                    if (!currentResult?.logged || !resolvedUserId || anonScopeMismatch) {
                        clear_ui_on_logout({ preserveLocalData: true });
                        const anon = await ensure_anonymous_user({ reason: 'startup' });
                        if (anon?.ok && anon.user) {
                            const anonId = anon.user.user_id || anon.user.id || null;
                            signal_auth_check_complete(true, anonId);
                        } else {
                            signal_auth_check_complete(false, null);
                        }
                    } else {
                        signal_auth_check_complete(true, resolvedUserId);
                    }
                } catch (e) {
                    console.warn('[Auth] Browser startup security check failed:', e?.message || e);
                    clear_ui_on_logout({ preserveLocalData: true });
                    try {
                        const anon = await ensure_anonymous_user({ reason: 'startup' });
                        if (anon?.ok && anon.user) {
                            const anonId = anon.user.user_id || anon.user.id || null;
                            signal_auth_check_complete(true, anonId);
                        } else {
                            signal_auth_check_complete(false, null);
                        }
                    } catch {
                        signal_auth_check_complete(false, null);
                    }
                }
            }, 500);
        }
    }
} catch (moduleInitError) {
    console.error('[AdoleAPI] Module initialization error:', moduleInitError);
}

/**
 * List all unsynced atomes between Tauri (local) and Fastify (remote)
 * Compares both presence and content (properties) to detect modifications
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

    if (is_anonymous_mode()) {
        result.error = 'sync_disabled_anonymous';
        if (typeof callback === 'function') callback(result);
        return result;
    }

    let ownerId = null;
    try {
        const currentUserResult = await current_user();
        ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
    } catch {
        ownerId = null;
    }

    if (ownerId && FastifyAdapter.getToken?.()) {
        const fastifyMatch = await ensure_secondary_user_match('fastify', ownerId);
        if (!fastifyMatch) {
            result.error = 'fastify_user_mismatch';
            if (typeof callback === 'function') callback(result);
            return result;
        }
    }

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

    // SECURITY: If no owner is identified, abort sync to prevent cross-user data leakage
    if (!ownerId) {
        result.error = 'No authenticated user - cannot sync without valid owner';
        if (typeof callback === 'function') callback(result);
        return result;
    }

    // Helper to fetch all atomes of all types from an adapter (including deleted for sync)
    // SECURITY: Always filter by ownerId - never use '*' to prevent cross-user data leakage
    const fetchAllAtomes = async (adapter, name, owner) => {
        // SECURITY: Require valid owner to prevent fetching other users' atomes
        if (!owner) {
            throw new Error('owner_required_for_sync');
        }
        const allAtomes = [];
        let successCount = 0;
        let lastError = null;
        for (const type of atomeTypes) {
            try {
                // Include deleted atomes for sync comparison
                // SECURITY: Always use specific owner, never '*'
                const result = await adapter.atome.list({
                    type,
                    includeDeleted: true,
                    ownerId: owner,
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

    const filterOwnedAtomes = (atomes, owner) => {
        if (!owner) return atomes;
        return (Array.isArray(atomes) ? atomes : []).filter((atome) => {
            const atomeId = atome?.atome_id || atome?.id;
            const atomeType = atome?.atome_type || atome?.type;
            if (atomeType === 'user') {
                return normalize_ref_id(atomeId) === owner;
            }
            const ownerId = resolve_owner_for_sync(atome);
            return ownerId === owner;
        });
    };

    // Fetch all atomes from Tauri
    try {
        tauriAtomes = await fetchAllAtomes(TauriAdapter, 'Tauri', ownerId);
        tauriAtomes = tauriAtomes.map(normalizeAtomeRecord);
        tauriAtomes = filterOwnedAtomes(tauriAtomes, ownerId);
    } catch (e) {
        result.error = 'Tauri connection failed: ' + e.message;
        if (typeof callback === 'function') callback(result);
        return result;
    }

    // Fetch all atomes from Fastify
    try {
        fastifyAtomes = await fetchAllAtomes(FastifyAdapter, 'Fastify', ownerId);
        fastifyAtomes = fastifyAtomes.map(normalizeAtomeRecord);
        fastifyAtomes = filterOwnedAtomes(fastifyAtomes, ownerId);
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

    // Helper function to compare atome content
    const compareMetadata = (atome1, atome2) => {
        const type1 = atome1.atome_type || atome1.atomeType || atome1.type || null;
        const type2 = atome2.atome_type || atome2.atomeType || atome2.type || null;
        const owner1 = resolve_owner_for_sync(atome1);
        const owner2 = resolve_owner_for_sync(atome2);
        const parent1 = resolve_parent_for_sync(atome1);
        const parent2 = resolve_parent_for_sync(atome2);

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

        // Then compare properties content (the actual data)
        const properties1 = extract_atome_properties(atome1);
        const properties2 = extract_atome_properties(atome2);

        const count1 = Object.keys(properties1).length;
        const count2 = Object.keys(properties2).length;

        // Sort keys for consistent comparison
        const sortedP1 = JSON.stringify(properties1, Object.keys(properties1).sort());
        const sortedP2 = JSON.stringify(properties2, Object.keys(properties2).sort());

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
    const syncPolicy = resolve_sync_policy();
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
        error: null,
        direction: { from: syncPolicy.from, to: syncPolicy.to }
    };
    const flow = create_flow('sync:atomes');

    if (is_anonymous_mode()) {
        result.skipped = true;
        result.reason = 'anonymous_mode';
        result.error = 'sync_disabled_anonymous';
        log_flow(flow, 'skipped', { reason: result.reason });
        if (typeof callback === 'function') callback(result);
        return result;
    }

    if (!syncPolicy.from || !syncPolicy.to) {
        result.skipped = true;
        result.reason = 'sync_off';
        log_flow(flow, 'skipped', { reason: result.reason });
        if (typeof callback === 'function') callback(result);
        return result;
    }

    if (!is_tauri_runtime()) {
        result.skipped = true;
        result.reason = 'not_tauri';
        log_flow(flow, 'skipped', { reason: result.reason });
        if (typeof callback === 'function') callback(result);
        return result;
    }

    try {
        const fastifyBase = (FastifyAdapter && typeof FastifyAdapter.baseUrl === 'string')
            ? FastifyAdapter.baseUrl.trim()
            : '';
        const uploadBase = resolveFastifyUploadBase();
        const tokenPresent = !!FastifyAdapter.getToken?.();
        log_flow(flow, 'start', { fastifyBase, uploadBase, tokenPresent });
    } catch (_) { }

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

    const buildUpsertPayload = (atome) => {
        const id = atome?.atome_id || atome?.id;
        const type = atome?.atome_type || atome?.type || atome?.atomeType || atome?.kind;
        const ownerId = resolve_owner_for_sync(atome) || currentUserId || null;
        const parentId = resolve_parent_for_sync(atome);
        const properties = extract_atome_properties(atome);

        return {
            id,
            type,
            ownerId,
            parentId,
            properties
        };
    };

    const isUserAtome = (atome) => {
        const type = String(atome?.atome_type || atome?.type || atome?.atomeType || '').trim().toLowerCase();
        return type === 'user';
    };

    const hasValidPasswordHash = (properties) => {
        const value = properties?.password_hash;
        return typeof value === 'string' && value.trim().length > 0;
    };

    const unwrapAtomeResponse = (response) => {
        if (!response || typeof response !== 'object') return null;
        if (response.atome && typeof response.atome === 'object') return response.atome;
        if (response.data && typeof response.data === 'object') return response.data;
        if (Array.isArray(response.atomes) && response.atomes[0]) return response.atomes[0];
        return null;
    };

    const ensureUserAtomeProperties = async (atome, adapter) => {
        const base = extract_atome_properties(atome);
        if (hasValidPasswordHash(base)) return base;

        const id = atome?.atome_id || atome?.id;
        if (!id || !adapter?.atome?.get) return base;

        try {
            const fetched = await adapter.atome.get(id);
            const rawAtome = unwrapAtomeResponse(fetched);
            if (!rawAtome) return base;
            const normalized = normalizeAtomeRecord(rawAtome);
            const full = extract_atome_properties(normalized);
            if (!hasValidPasswordHash(full)) return base;
            return { ...base, ...full };
        } catch (_) {
            return base;
        }
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
    };

    const logTauriFsStatusOnce = (mode, localPath) => {
        if (!is_tauri_runtime()) return;
        if (_localFsLogState[mode]) return;
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
        const properties = extract_atome_properties(atome);
        const fileName = properties.file_name || properties.fileName || atome?.file_name || '';
        const originalName = properties.original_name || properties.originalName || fileName;
        const filePath = properties.file_path || properties.filePath || properties.path || properties.rel_path || '';
        const mimeType = properties.mime_type || properties.mimeType || '';
        const sizeBytes = properties.size_bytes || properties.sizeBytes || properties.size || null;
        return { properties, fileName, originalName, filePath, mimeType, sizeBytes };
    };

    const downloadFileAssetFromFastify = async (atome) => {
        if (!is_tauri_runtime()) {
            return { ok: false, error: 'not_tauri' };
        }
        await ensureProjectRoot();
        const atomeId = atome?.atome_id || atome?.id;
        if (!atomeId) {
            return { ok: false, error: 'missing_atome_id' };
        }

        const ownerId = resolve_owner_for_sync(atome) || currentUserId || null;
        const { fileName, originalName, filePath, sizeBytes } = extractFileMeta(atome);
        const safeFileName = fileName || originalName || atomeId;
        const localPath = resolveLocalAssetPath(filePath, ownerId, safeFileName);
        logTauriFsStatusOnce('pull', localPath);
        if (!localPath) {
            return { ok: false, error: 'local_path_missing' };
        }

        const token = FastifyAdapter?.getToken ? FastifyAdapter.getToken() : null;
        if (!token) {
            return { ok: false, error: 'fastify_token_missing' };
        }

        if (sizeBytes != null) {
            const meta = await tryTauriStat(localPath, ownerId, filePath, safeFileName);
            const localSize = typeof meta?.size === 'number'
                ? meta.size
                : (typeof meta?.len === 'number' ? meta.len : null);
            if (localSize != null && Number(localSize) === Number(sizeBytes)) {
                return { ok: true, skipped: true, reason: 'size_match' };
            }
        }


        try {
            const infoResult = await FastifyAdapter.file.downloadInfo({
                atomeId,
                chunkSize: WS_FILE_CHUNK_SIZE,
                debug: true
            });

            if (!(infoResult?.ok || infoResult?.success)) {
                const error = infoResult?.error || 'download_info_failed';
                return { ok: false, error };
            }

            const info = infoResult?.data || {};
            if (info?.downloadsSnapshot) {
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
                await logLocalDownloadsSnapshot(ownerId, filePath, 'pull_write_failed');
                return { ok: false, error: writeResult.error || 'write_failed' };
            }

            return { ok: true, path: localPath, size: finalBytes.length };
        } catch (e) {
            const error = e?.message || 'download_failed';
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
            return { ok: false, reason: 'disabled' };
        }

        const now = Date.now();
        if (now - _lastFastifyAssetSync < 30_000) {
            return { ok: true, skipped: true, reason: 'throttled' };
        }
        _lastFastifyAssetSync = now;

        if (!FastifyAdapter?.getToken?.()) {
            try { await ensure_fastify_token(); } catch { }
        }
        const token = FastifyAdapter?.getToken?.();
        if (!token) {
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
            return { ok: false, reason: 'owner_missing' };
        }

        const fastifyBase = resolveFastifyUploadBase();

        const summary = { ok: true, attempted: 0, downloaded: 0, skipped: 0, failed: 0 };
        for (const type of FILE_ASSET_TYPES) {
            const listResult = await listFastifyAtomesByType(type, ownerId);
            if (!listResult.ok) {
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

        return summary;
    };

    const uploadFileAssetToFastify = async (atome) => {
        const atomeId = atome?.atome_id || atome?.id;
        if (!atomeId) return { ok: false, error: 'missing_atome_id' };

        await ensureProjectRoot();
        const ownerId = resolve_owner_for_sync(atome) || currentUserId || null;
        const type = String(atome?.atome_type || atome?.type || '').trim().toLowerCase();
        const { fileName, originalName, filePath, mimeType, sizeBytes } = extractFileMeta(atome);
        const safeFileName = fileName || originalName || atomeId;
        const relativePath = normalizeUserRelativePath(filePath || safeFileName, ownerId)
            || (safeFileName ? `Downloads/${safeFileName}` : '');

        const localPath = resolveLocalAssetPath(filePath, ownerId, safeFileName);
        logTauriFsStatusOnce('push', localPath);
        const bytes = await readTauriBinaryFile(localPath, ownerId, filePath, safeFileName);
        if (!bytes || !bytes.length) {
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
                return { ok: false, error: msg };
            }

            if (completeResult?.data?.downloadsSnapshot) {
            }
            return { ok: true, createdAtome: false, sizeBytes: totalSize, path: relativePath };
        } catch (e) {
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
            if (isUserAtome(atome)) {
                payload.properties = await ensureUserAtomeProperties(atome, TauriAdapter);
            }
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
    // SECURITY: Only pull atomes owned by the current user to prevent cross-user data leakage
    const sortedToPull = topologicalSort(unsyncedResult.onlyOnFastify);

    for (const atome of sortedToPull) {
        try {
            // SECURITY: Verify ownership before pulling to local DB
            const atomeOwnerId = resolve_owner_for_sync(atome);
            const atomeType = String(atome?.atome_type || atome?.type || '').toLowerCase();

            // Allow user atomes if they match current user, otherwise require owner match
            const isCurrentUserAtome = atomeType === 'user' &&
                (normalize_ref_id(atome?.atome_id || atome?.id) === currentUserId);
            const isOwnedByCurrentUser = atomeOwnerId && currentUserId &&
                String(atomeOwnerId) === String(currentUserId);

            if (!isCurrentUserAtome && !isOwnedByCurrentUser) {
                // Skip this atome - it belongs to another user
                result.pulled.failed++;
                result.pulled.errors.push({
                    id: atome.atome_id || atome.id,
                    error: 'security_blocked_wrong_owner',
                    expected: currentUserId,
                    actual: atomeOwnerId
                });
                continue;
            }

            const payload = buildUpsertPayload(atome);
            if (isUserAtome(atome)) {
                payload.properties = await ensureUserAtomeProperties(atome, FastifyAdapter);
            }
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
            if (isUserAtome(item.tauri)) {
                payload.properties = await ensureUserAtomeProperties(item.tauri, TauriAdapter);
            }
            const updateResult = isUserAtome(item.tauri)
                ? await FastifyAdapter.atome.alter(payload.id, payload.properties)
                : await FastifyAdapter.atome.create(payload);

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
    // SECURITY: Only update atomes owned by the current user
    for (const item of unsyncedResult.modifiedOnFastify) {
        try {
            // SECURITY: Verify ownership before updating local DB
            const atomeOwnerId = resolve_owner_for_sync(item.fastify);
            const atomeType = String(item.fastify?.atome_type || item.fastify?.type || '').toLowerCase();

            const isCurrentUserAtome = atomeType === 'user' &&
                (normalize_ref_id(item.fastify?.atome_id || item.fastify?.id) === currentUserId);
            const isOwnedByCurrentUser = atomeOwnerId && currentUserId &&
                String(atomeOwnerId) === String(currentUserId);

            if (!isCurrentUserAtome && !isOwnedByCurrentUser) {
                result.updated.failed++;
                result.updated.errors.push({
                    id: item.id,
                    error: 'security_blocked_wrong_owner',
                    expected: currentUserId,
                    actual: atomeOwnerId
                });
                continue;
            }

            const payload = buildUpsertPayload(item.fastify);
            if (isUserAtome(item.fastify)) {
                payload.properties = await ensureUserAtomeProperties(item.fastify, FastifyAdapter);
            }
            const updateResult = isUserAtome(item.fastify)
                ? await TauriAdapter.atome.alter(payload.id, payload.properties)
                : await TauriAdapter.atome.create(payload);

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

async function get_atome(atomeId, callback) {
    // Handle callback as first argument
    if (typeof atomeId === 'function') {
        callback = atomeId;
        atomeId = null;
    }

    // Security guard: require authenticated user for getting atomes (anonymous allowed)
    const authCheck = await ensure_user_for_operation('get_atome', { allowAnonymous: true });
    if (!authCheck.ok) {
        const blockedResult = create_unauthenticated_result(authCheck.error);
        blockedResult.atome = null;
        if (typeof callback === 'function') callback(blockedResult);
        return blockedResult;
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
    const dataPlan = resolve_backend_plan('data');

    const DEBUG = (typeof window !== 'undefined' && window.__ADOLE_API_DEBUG__ === true);

    // Query only the primary backend.
    try {
        const isFastify = dataPlan.source === 'fastify';
        if (DEBUG) {
        }
        const primaryResult = await dataPlan.primary.atome.get(atomeId);
        if (DEBUG) {
        }

        if (primaryResult.ok || primaryResult.success) {
            let extractedAtome = null;

            if (primaryResult.atome) {
                extractedAtome = primaryResult.atome;
            } else if (primaryResult.data && typeof primaryResult.data === 'object') {
                extractedAtome = primaryResult.data;
            }

            if (extractedAtome) {
                results[dataPlan.source].atome = extractedAtome;
                results[dataPlan.source].success = true;
            } else {
                results[dataPlan.source].error = 'Atome not found';
            }
        } else {
            results[dataPlan.source].error = primaryResult.error || 'Atome not found';
        }
    } catch (e) {
        results[dataPlan.source].error = e.message;
    }

    results[dataPlan.secondaryName] = { atome: null, error: 'skipped', skipped: true };

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

export {
  ANONYMOUS_USERNAME,
  resolve_anonymous_phone,
  is_anonymous_mode,
  is_tauri_runtime,
  normalize_phone_input,
  normalizeAtomeRecord,
  resolveAtomePropertiesInput,
  resolveAtomePropertiesPayload,
  extract_atome_properties,
  normalize_ref_id,
  resolve_owner_for_sync,
  resolve_parent_for_sync,
  extract_created_atome_id,
  resolve_backend_plan,
  resolve_sync_policy,
  ensure_user_for_operation,
  ensure_secondary_user_match,
  ensure_fastify_token,
  ensure_fastify_ws_auth,
  get_authenticated_user,
  require_authenticated_user,
  create_unauthenticated_result,
  current_user,
  create_user,
  log_user,
  unlog_user,
  delete_user,
  change_password,
  delete_account,
  refresh_token,
  set_user_visibility,
  user_list,
  lookup_user_by_phone,
  get_atome,
  get_current_user_info,
  set_current_user_state,
  migrate_anonymous_workspace,
  try_auto_login,
  get_current_project_id,
  get_current_project,
  set_current_project,
  load_saved_current_project,
  clear_ui_on_logout,
  wait_for_auth_check,
  signal_auth_check_complete,
  ensure_anonymous_user,
  get_anonymous_user_id,
  sync_atomes,
  list_unsynced_atomes,
  maybe_sync_atomes,
  request_sync,
  queue_pending_delete,
  process_pending_deletes,
  get_pending_delete_ids,
  is_already_exists_error,
  get_current_machine,
  register_machine,
  get_machine_last_user
};
