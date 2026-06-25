// Extracted from adole.js: backend detection, source/URL resolution, connection-state container, media-patch hints.
import {
    alignLoopbackUrlToPageHost,
    canUseFastifyPrimaryOnLocalAxumPage,
    getCloudServerPort,
    getCloudServerUrl,
    isLocalAxumPage,
    getLocalServerPort,
    getLocalServerUrl,
    isTauri as isCanonicalTauriRuntime
} from '../serverUrls.js';

const CONFIG = {
    TAURI_BASE_URL: 'http://127.0.0.1:3000',
    FASTIFY_BASE_URL: null,
    TAURI_TOKEN_KEY: 'local_auth_token',
    FASTIFY_TOKEN_KEY: 'cloud_auth_token',
    AUTH_SOURCE: 'auto',          // 'auto' | 'tauri' | 'fastify'
    PROFILE_SOURCE: 'auto',       // defaults to AUTH_SOURCE if auto
    DATA_SOURCE: 'auto',          // defaults to AUTH_SOURCE if auto
    SYNC_DIRECTION: 'auto',       // 'auto' | 'tauri_to_fastify' | 'fastify_to_tauri' | 'off'
    CHECK_INTERVAL: 30000,      // 30 seconds backend check cache
    SYNC_COOLDOWN: 5000,        // 5 seconds cooldown between syncs
    RECONNECT_INITIAL_DELAY: 30000,
    RECONNECT_MAX_DELAY: 3600000,
    HEARTBEAT_INTERVAL: 30000,
    MAX_RECONNECT_ATTEMPTS: 3,
    LONG_POLL_INTERVAL: 300000,
    SILENT_MODE_AFTER_FAILURES: 1,
    PING_TIMEOUT: 2000,         // 2 seconds timeout for ping
    OFFLINE_CACHE_DURATION: 10000 // 10 seconds cache for offline state
};

// ============================================
// SILENT CONNECTION STATE (No console errors)
// ============================================

const _connectionState = {
    tauri: { online: null, lastCheck: 0, failCount: 0 },
    fastify: { online: null, lastCheck: 0, failCount: 0 }
};
const MEDIA_PATCH_KIND_HINTS = new Set(['video', 'audio', 'sound', 'image']);
const mediaPatchHintsByAtomeId = new Map();
const normalizeMediaPatchKindHint = (value) => String(value || '').trim().toLowerCase();
const hasMediaSourceHintsInPatch = (properties = {}) => {
    if (!properties || typeof properties !== 'object') return false;
    const direct = (
        properties.media_url
        || properties.mediaUrl
        || properties.src
        || properties.url
        || properties.file_path
        || properties.filePath
        || ''
    );
    if (String(direct || '').trim()) return true;
    const mime = String(
        properties.mime_type
        || properties.mimeType
        || properties.content_type
        || properties.contentType
        || ''
    ).trim().toLowerCase();
    return mime.startsWith('video/') || mime.startsWith('audio/') || mime.startsWith('image/');
};
const rememberMediaPatchHint = (atomeId, kindHint = '') => {
    const id = String(atomeId || '').trim();
    const kind = normalizeMediaPatchKindHint(kindHint);
    if (!id || !MEDIA_PATCH_KIND_HINTS.has(kind)) return;
    mediaPatchHintsByAtomeId.set(id, kind);
    if (mediaPatchHintsByAtomeId.size > 2000) {
        const first = mediaPatchHintsByAtomeId.keys().next();
        if (first && !first.done) mediaPatchHintsByAtomeId.delete(first.value);
    }
};

function isAnonymousLogin(phone, username, password) {
    if (typeof window === 'undefined') return false;
    const cleanPhone = phone ? String(phone).trim() : '';
    if (!cleanPhone && !username) return false;
    if (cleanPhone === '0000000000' || cleanPhone === '0000000001') return true;
    try {
        const stored = localStorage.getItem('anonymous_phone_fastify_v1');
        if (stored && cleanPhone && String(stored).trim() === cleanPhone) {
            return true;
        }
    } catch (error) {
    }
    const cleanUsername = username ? String(username).trim().toLowerCase() : '';
    if (cleanUsername === 'anonymous') return true;
    const cleanPassword = password ? String(password).trim().toLowerCase() : '';
    if (cleanPassword === 'anonymous' && (!cleanUsername || cleanUsername === 'anonymous')) return true;
    return false;
}

// Real-time dedupe is handled by realtime_dedupe.js

/**
 * Silent ping - checks server availability WITHOUT console errors
 * Uses fetch with GET request which is less intrusive than WebSocket
 * @param {string} baseUrl - Server base URL (http://...)
 * @returns {Promise<boolean>} - true if online, false otherwise
 */
async function silentPing(baseUrl) {
    try {
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.PING_TIMEOUT);

        // Choose endpoint based on server role (Tauri local Axum vs Fastify).
        let isTauriServer = false;
        try {
            const parsed = new URL(String(baseUrl || '').trim());
            const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
            const localPort = readLocalTauriHttpPort();
            isTauriServer = !!(localPort && isLoopbackHostname(parsed.hostname) && port === localPort);
        } catch (error) {
            isTauriServer = false;
        }
        const pingEndpoint = isTauriServer ? '/api/auth/local/me' : '/api/auth/me';

        const response = await fetch(`${baseUrl}${pingEndpoint}`, {
            method: 'GET',
            signal: controller.signal,
            // Don't include credentials to avoid CORS preflight complexity
            credentials: 'omit',
            headers: {
                'Accept': 'application/json'
            }
        });

        clearTimeout(timeoutId);
        // Any response (even 401/403) means server is online
        return true;
    } catch (e) {
        // Network error or timeout - server is offline
        // This doesn't show errors in console for network failures
        return false;
    }
}

/**
 * Check if we're in Tauri environment
 */
function isInTauri() {
    return isCanonicalTauriRuntime();
}

function isEmbeddedIOSRuntime() {
    if (typeof window === 'undefined') return false;
    const protocol = String(window.location?.protocol || '').toLowerCase();
    if (protocol === 'atome:') return true;
    if (window.__AUV3_MODE__ === true) return true;
    const hostEnv = String(window.__HOST_ENV || '').trim().toLowerCase();
    return hostEnv === 'app' || hostEnv === 'auv3';
}

function allowFastifyPrimaryOnLocalAxumPage() {
    return canUseFastifyPrimaryOnLocalAxumPage();
}

function readLocalTauriHttpPort() {
    if (typeof window === 'undefined') return null;
    const localUrl = getLocalServerUrl();
    if (!localUrl) {
        if (isEmbeddedIOSRuntime()) return null;
        return isInTauri() ? getLocalServerPort() : null;
    }
    return getLocalServerPort();
}

function hasInjectedLocalTauriPort() {
    return !!readLocalTauriHttpPort();
}

function isLoopbackHostname(hostname) {
    const host = String(hostname || '').trim().toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0';
}

function clearFastifyOverrideStorage() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem('squirrel_tauri_fastify_url_override');
    } catch (error) {
    }
}

function readExpectedFastifyLoopbackPort() {
    return getCloudServerPort();
}

function isDisallowedFastifyLoopbackPort(baseUrl) {
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) return false;
    if (!isInTauri()) return false;
    if (window.__SQUIRREL_ALLOW_CUSTOM_FASTIFY_LOOPBACK_PORT__ === true) return false;
    try {
        const parsed = new URL(baseUrl.trim());
        if (!isLoopbackHostname(parsed.hostname)) return false;
        const candidatePort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
        if (!Number.isFinite(candidatePort) || candidatePort <= 0) return false;
        return candidatePort !== readExpectedFastifyLoopbackPort();
    } catch (error) {
        return false;
    }
}

function isInvalidFastifyHttpBase(baseUrl) {
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) return false;
    if (!isInTauri()) return false;
    if (isDisallowedFastifyLoopbackPort(baseUrl)) return true;
    const localPort = readLocalTauriHttpPort();
    if (!localPort) return false;
    try {
        const parsed = new URL(baseUrl.trim());
        if (!isLoopbackHostname(parsed.hostname)) return false;
        const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
        return Number.isFinite(port) && port === localPort;
    } catch (error) {
        return false;
    }
}

function isInvalidFastifyWsUrl(wsUrl) {
    if (typeof wsUrl !== 'string' || !wsUrl.trim()) return false;
    const normalized = wsUrl.trim()
        .replace(/^wss:/, 'https:')
        .replace(/^ws:/, 'http:');
    return isInvalidFastifyHttpBase(normalized);
}

const BACKEND_SOURCES = new Set(['tauri', 'fastify', 'auto']);
const SYNC_DIRECTIONS = new Set(['tauri_to_fastify', 'fastify_to_tauri', 'off', 'auto']);

function normalizeSource(value) {
    if (!value) return null;
    const normalized = String(value).trim().toLowerCase();
    if (!BACKEND_SOURCES.has(normalized)) return null;
    return normalized;
}

function normalizeSyncDirection(value) {
    if (!value) return null;
    const normalized = String(value).trim().toLowerCase();
    if (!SYNC_DIRECTIONS.has(normalized)) return null;
    return normalized;
}

function readServerConfig() {
    if (typeof window === 'undefined') return null;
    return window.__SQUIRREL_SERVER_CONFIG__ || null;
}

function readGlobalOverride(key) {
    if (typeof window === 'undefined') return null;
    const value = window[key];
    return typeof value === 'string' ? value : null;
}

function resolveBackendSource(kind) {
    const key = String(kind || '').toLowerCase();
    const cfg = readServerConfig();
    const configValue = cfg?.[key]?.source || cfg?.sources?.[key] || null;
    const globalKey = `__SQUIRREL_${key.toUpperCase()}_SOURCE__`;
    const globalValue = readGlobalOverride(globalKey);
    const configDefault = CONFIG[`${key.toUpperCase()}_SOURCE`];
    const explicit = normalizeSource(globalValue || configValue || configDefault);
    if (isLocalAxumPage() && !allowFastifyPrimaryOnLocalAxumPage()) {
        return 'tauri';
    }
    if (explicit && explicit !== 'auto') return explicit;
    if (isEmbeddedIOSRuntime()) {
        return 'tauri';
    }
    return isInTauri() ? 'tauri' : 'fastify';
}

function resolveAuthSource() {
    return resolveBackendSource('auth');
}

function resolveProfileSource() {
    const explicit = resolveBackendSource('profile');
    return explicit || resolveAuthSource();
}

function resolveDataSource() {
    const explicit = resolveBackendSource('data');
    return explicit || resolveAuthSource();
}

function resolveSyncDirection() {
    const cfg = readServerConfig();
    const globalValue = readGlobalOverride('__SQUIRREL_SYNC_DIRECTION__');
    const configValue = cfg?.sync?.direction || cfg?.sync?.mode || null;
    const configDefault = CONFIG.SYNC_DIRECTION;
    const explicit = normalizeSyncDirection(globalValue || configValue || configDefault);
    if (explicit && explicit !== 'auto') return explicit;

    const dataSource = resolveDataSource();
    if (dataSource === 'tauri') return 'tauri_to_fastify';
    if (dataSource === 'fastify') return 'fastify_to_tauri';
    return 'off';
}

function getTauriHttpBaseUrl() {
    if (typeof window === 'undefined') return CONFIG.TAURI_BASE_URL;

    const base = getLocalServerUrl();
    if (base) return alignLoopbackUrlToPageHost(base);
    if (isEmbeddedIOSRuntime()) return '';

    return CONFIG.TAURI_BASE_URL;
}

function getTauriWsUrl() {
    const httpBase = getTauriHttpBaseUrl();
    return httpBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws/api';
}

function getFastifyHttpBaseUrl() {
    if (typeof window === 'undefined') return null;
    const base = getCloudServerUrl();
    if (!base) return null;
    const normalized = alignLoopbackUrlToPageHost(base);
    if (isInvalidFastifyHttpBase(normalized)) {
        clearFastifyOverrideStorage();
        return null;
    }
    return normalized;
}

function getFastifyWsApiUrl() {
    if (typeof window === 'undefined') return null;

    const explicit = window.__SQUIRREL_FASTIFY_WS_API_URL__;
    if (typeof explicit === 'string' && explicit.trim()) {
        const normalized = explicit.trim();
        if (isInvalidFastifyWsUrl(normalized)) {
            clearFastifyOverrideStorage();
        } else {
            return normalized;
        }
    }

    const httpBase = getFastifyHttpBaseUrl();
    if (!httpBase) return null;
    const wsUrl = httpBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws/api';
    if (isInvalidFastifyWsUrl(wsUrl)) {
        return null;
    }
    return wsUrl;
}

/**
 * Check if we're on localhost (dev environment)
 */
function isLocalDev() {
    const hostname = window.location?.hostname || '';
    return hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.');
}

function shouldAttemptFastify() {
    if (typeof window === 'undefined') return false;
    if (window.__SQUIRREL_DISABLE_FASTIFY__ === true) return false;
    if (isLocalAxumPage() && !allowFastifyPrimaryOnLocalAxumPage()) return false;
    return !!getFastifyHttpBaseUrl();
}


export {
    CONFIG, _connectionState, MEDIA_PATCH_KIND_HINTS, mediaPatchHintsByAtomeId, normalizeMediaPatchKindHint, hasMediaSourceHintsInPatch, rememberMediaPatchHint, isAnonymousLogin, silentPing, isInTauri, isEmbeddedIOSRuntime, allowFastifyPrimaryOnLocalAxumPage, readLocalTauriHttpPort, hasInjectedLocalTauriPort, isLoopbackHostname, clearFastifyOverrideStorage, readExpectedFastifyLoopbackPort, isDisallowedFastifyLoopbackPort, isInvalidFastifyHttpBase, isInvalidFastifyWsUrl, BACKEND_SOURCES, SYNC_DIRECTIONS, normalizeSource, normalizeSyncDirection, readServerConfig, readGlobalOverride, resolveBackendSource, resolveAuthSource, resolveProfileSource, resolveDataSource, resolveSyncDirection, getTauriHttpBaseUrl, getTauriWsUrl, getFastifyHttpBaseUrl, getFastifyWsApiUrl, isLocalDev, shouldAttemptFastify
};
