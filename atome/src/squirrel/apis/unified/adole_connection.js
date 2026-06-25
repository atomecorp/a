// Extracted from adole.js: connection probing, backend availability, token storage, id generation.
import {
    alignLoopbackUrlToPageHost,
    isLocalAxumPage,
    getLocalServerUrl
} from '../serverUrls.js';
import {
    CONFIG,
    _connectionState,
    silentPing,
    isInTauri,
    hasInjectedLocalTauriPort,
    getFastifyHttpBaseUrl,
    shouldAttemptFastify
} from './adole_backend.js';

async function checkFastifyViaTauri(fastifyBaseUrl) {
    const localBase = getLocalServerUrl();
    if (!localBase) return null;

    // This check only reports whether the LOCAL Fastify process (spawned by the Tauri local server)
    // is available. If the selected Fastify target is cloud, this must be skipped.
    try {
        if (fastifyBaseUrl) {
            const parsed = new URL(fastifyBaseUrl);
            const host = parsed.hostname;
            const isLocalHost = host === '127.0.0.1' || host === 'localhost';
            if (!isLocalHost) return null;
        }
    } catch (error) {
    }

    try {
        const res = await fetch(`${alignLoopbackUrlToPageHost(localBase)}/api/fastify-status`, {
            method: 'GET',
            credentials: 'omit',
            headers: { 'Accept': 'application/json' }
        });
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (data && typeof data.available === 'boolean') {
            return data.available;
        }
    } catch (error) {
        return null;
    }
    return null;
}

/**
 * Check connection state with caching to avoid spamming
 * @param {'tauri'|'fastify'} backend - Backend to check
 * @returns {Promise<boolean>} - true if online
 */
async function checkConnection(backend) {
    const state = _connectionState[backend];
    const now = Date.now();

    // TAURI: Only consider Tauri available inside a real Tauri runtime.
    // Browser/production must never assume localhost Tauri exists.
    if (backend === 'tauri') {
        const hasLocalRuntime = hasInjectedLocalTauriPort();
        const browserOnLocalAxum = isLocalAxumPage();
        if (isInTauri() || hasLocalRuntime || browserOnLocalAxum) {
            // In Tauri app, or embedded iOS with injected local AiS port, assume local server is available
            state.online = true;
            state.lastCheck = now;
            return true;
        } else {
            // Not in Tauri: don't try to ping/connect
            state.online = false;
            state.lastCheck = now;
            return false;
        }
    }

    // FASTIFY: allow same-origin production OR configured URL; avoid localhost assumptions
    if (backend === 'fastify' && (!getFastifyHttpBaseUrl() || !shouldAttemptFastify())) {
        state.online = false;
        state.lastCheck = now;
        return false;
    }

    // Use cached state if recently checked
    if (state.lastCheck && (now - state.lastCheck < CONFIG.OFFLINE_CACHE_DURATION)) {
        return state.online;
    }

    // If we've failed multiple times, extend cache duration
    const cacheMultiplier = Math.min(state.failCount + 1, 6); // Max 60 seconds cache
    const effectiveCacheDuration = CONFIG.OFFLINE_CACHE_DURATION * cacheMultiplier;

    if (state.lastCheck && (now - state.lastCheck < effectiveCacheDuration)) {
        return state.online;
    }

    // Perform silent ping (only for Fastify at this point)
    const baseUrl = getFastifyHttpBaseUrl();
    if (!baseUrl) {
        state.online = false;
        state.lastCheck = now;
        return false;
    }
    let isOnline = false;
    const tauriFastify = await checkFastifyViaTauri(baseUrl);
    if (tauriFastify === true || tauriFastify === false) {
        isOnline = tauriFastify;
    } else {
        isOnline = await silentPing(baseUrl);
    }

    // Update state
    state.online = isOnline;
    state.lastCheck = now;
    state.failCount = isOnline ? 0 : state.failCount + 1;

    return isOnline;
}

/**
 * Reset connection state (call when network changes)
 */
function resetConnectionState() {
    _connectionState.tauri = { online: null, lastCheck: 0, failCount: 0 };
    _connectionState.fastify = { online: null, lastCheck: 0, failCount: 0 };
}

/**
 * Get current connection state (synchronous, uses cache)
 * @returns {{tauri: boolean|null, fastify: boolean|null}}
 */
function getConnectionState() {
    return {
        tauri: _connectionState.tauri.online,
        fastify: _connectionState.fastify.online
    };
}

// ============================================
// BACKEND AVAILABILITY CACHE (Singleton)
// ============================================

const _backendState = {
    tauri: null,
    fastify: null,
    lastCheck: 0
};

/**
 * Check which backends are available (cached)
 * Uses silent ping to avoid console errors
 * @param {boolean} force - Force recheck even if recently checked
 * @returns {Promise<{tauri: boolean, fastify: boolean}>}
 */
async function checkBackends(force = false) {
    const now = Date.now();
    if (!force && _backendState.lastCheck && (now - _backendState.lastCheck < CONFIG.CHECK_INTERVAL)) {
        return { tauri: _backendState.tauri, fastify: _backendState.fastify };
    }

    const previousFastify = _backendState.fastify;

    const [tauri, fastify] = await Promise.all([
        checkConnection('tauri'),
        checkConnection('fastify')
    ]);

    _backendState.tauri = tauri;
    _backendState.fastify = fastify;
    _backendState.lastCheck = now;

    if (typeof window !== 'undefined' && fastify && !previousFastify) {
        window.dispatchEvent(new CustomEvent('squirrel:server-available', { detail: { backend: 'fastify' } }));
    }

    return { tauri, fastify };
}

/**
 * Check if a server is available (uses silent ping)
 * @param {string} baseUrl - Server base URL
 * @returns {Promise<boolean>}
 */
async function checkServerAvailable(baseUrl) {
    return silentPing(baseUrl);
}

// ============================================
// UUID GENERATION
// ============================================

/**
 * Generate a valid UUID v4
 * Compatible with both SQLite and PostgreSQL
 * @returns {string} UUID string
 */
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Secondary: generate UUID v4 manually
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate a client ID for WebSocket connections
 * @returns {string} Client ID
 */
function generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

/**
 * Get token from localStorage
 * @param {string} key - Storage key
 * @returns {string|null}
 */
const tokenMemory = new Map();

function clearPreviousFastifyTokenStorage() {
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('auth_token');
    }
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('auth_token');
    }
    tokenMemory.delete('auth_token');
}

function isCloudFastifyTarget() {
    if (typeof window === 'undefined') return false;
    const base = (typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
        ? window.__SQUIRREL_FASTIFY_URL__.trim()
        : '';
    if (!base) return false;
    return base.includes('atome.one') || base.startsWith('https://');
}

function getToken(key) {
    if (typeof localStorage !== 'undefined') {
        const token = localStorage.getItem(key);
        if (token) {
            // Persistent storage is authoritative: native auth can refresh it after JS memory was hydrated.
            tokenMemory.set(key, token);
            return token;
        }
        const localKey = CONFIG.TAURI_TOKEN_KEY || 'local_auth_token';
        const cloudKey = CONFIG.FASTIFY_TOKEN_KEY || 'cloud_auth_token';
        if (key === cloudKey) {
            // Previous migration: use auth_token as cloud token only.
            const previous = localStorage.getItem('auth_token');
            if (previous) {
                localStorage.setItem(cloudKey, previous);
                tokenMemory.set(cloudKey, previous);
                return previous;
            }
        }
    }
    if (typeof sessionStorage !== 'undefined') {
        const token = sessionStorage.getItem(key);
        if (token) {
            tokenMemory.set(key, token);
            return token;
        }
    }
    if (tokenMemory.has(key)) {
        const cached = tokenMemory.get(key);
        if (cached) return cached;
    }
    return null;
}

/**
 * Store token in localStorage
 * @param {string} key - Storage key
 * @param {string} token - Token value
 */
function setToken(key, token) {
    if (typeof localStorage !== 'undefined' && token) {
        localStorage.setItem(key, token);
    }
    if (typeof sessionStorage !== 'undefined' && token) {
        sessionStorage.setItem(key, token);
    }
    if (token) {
        tokenMemory.set(key, token);
    }
}

/**
 * Remove token from localStorage
 * @param {string} key - Storage key
 */
function clearToken(key) {
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
    }
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(key);
    }
    tokenMemory.delete(key);

    const cloudKey = CONFIG.FASTIFY_TOKEN_KEY || 'cloud_auth_token';
    if (key === cloudKey) {
        // Previous Fastify builds stored the same JWT under auth_token.
        // If we only clear cloud_auth_token, getToken() may immediately
        // rehydrate the expired previous token and recreate the 401 loop.
        clearPreviousFastifyTokenStorage();
    }
}

// ============================================
// WEBSOCKET ADAPTER FACTORY (ADOLE v3.0)
// ============================================

/**
 * WebSocket connection manager for Tauri
 * Single connection shared across all requests
 */

export {
    checkFastifyViaTauri, checkConnection, resetConnectionState, getConnectionState, _backendState, checkBackends, checkServerAvailable, generateUUID, generateClientId, tokenMemory, clearPreviousFastifyTokenStorage, isCloudFastifyTarget, getToken, setToken, clearToken
};
