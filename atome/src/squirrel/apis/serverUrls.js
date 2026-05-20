/**
 * Server URL Resolution Module
 * 
 * Centralized URL resolution for Squirrel servers.
 * Handles both Tauri (local Axum) and browser (Fastify) modes.
 * 
 * Ports:
 * - 3000: Tauri/Axum local server (auth, atomes, static files)
 * - 3001: Fastify cloud server (auth, atomes, sync, WebSocket)
 * 
 * @module src/squirrel/apis/serverUrls
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', 'tauri.localhost']);

const normalizePositivePort = (value, fallback) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return fallback;
};

const normalizeNoTrailingSlash = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\/$/, '');
};

const getCurrentLocation = () => {
    if (typeof window === 'undefined') return null;
    return window.location || null;
};

const readOrigin = (locationLike) => {
    const origin = normalizeNoTrailingSlash(String(locationLike?.origin || ''));
    return origin && origin !== 'null' ? origin : '';
};

function isCrossOriginLoopbackUrlForBrowser(url) {
    if (typeof window === 'undefined') return false;
    if (isTauri()) return false;
    if (typeof url !== 'string' || !url.trim()) return false;
    try {
        const parsed = new URL(url.trim(), window.location.href);
        if (!isLoopbackHost(parsed.hostname)) return false;
        return parsed.origin !== window.location.origin;
    } catch (_) {
        return false;
    }
}

function isPrivateIpv4Host(hostname) {
    const value = String(hostname || '').trim().toLowerCase();
    const parts = value.split('.');
    if (parts.length !== 4) return false;
    const numbers = parts.map((part) => Number(part));
    if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    if (numbers[0] === 10) return true;
    if (numbers[0] === 127) return true;
    if (numbers[0] === 192 && numbers[1] === 168) return true;
    if (numbers[0] === 169 && numbers[1] === 254) return true;
    if (numbers[0] === 172 && numbers[1] >= 16 && numbers[1] <= 31) return true;
    return false;
}

function isLikelyLocalDevHost(hostname) {
    const value = String(hostname || '').trim().toLowerCase();
    if (!value) return false;
    if (isLoopbackHost(value)) return true;
    if (value === '::1' || value === '[::1]') return true;
    if (isPrivateIpv4Host(value)) return true;
    if (value.endsWith('.local') || value.endsWith('.lan') || value.endsWith('.home')) return true;
    if (!value.includes('.')) return true;
    return false;
}

export function isLoopbackHost(hostname) {
    return LOOPBACK_HOSTS.has(String(hostname || '').trim().toLowerCase());
}

export function getBrowserSameOriginServerUrl() {
    const loc = getCurrentLocation();
    const origin = readOrigin(loc);
    const host = String(loc?.hostname || '').trim().toLowerCase();
    if (!origin) return null;
    if (isTauri()) return null;
    if (isLoopbackHost(host)) return null;
    return origin;
}

export function getLocalServerPort() {
    if (typeof window === 'undefined') return 3000;
    const allowCustomPort = window.__SQUIRREL_ALLOW_CUSTOM_TAURI_PORT__ === true;
    const forcedPort = Number(window.__SQUIRREL_TAURI_LOCAL_PORT__);
    if (allowCustomPort && Number.isFinite(forcedPort) && forcedPort > 0) {
        return forcedPort;
    }
    const customPort = Number(window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__);
    if (Number.isFinite(customPort) && customPort > 0) {
        return customPort;
    }
    return 3000;
}

export function getCloudServerPort() {
    if (typeof window === 'undefined') return 3001;
    const raw = window.__SQUIRREL_SERVER_CONFIG__?.fastify?.port ?? 3001;
    let port = normalizePositivePort(raw, 3001);
    const localPort = getLocalServerPort();
    if (port === localPort) port = 3001;
    return port;
}

export function isCurrentLoopbackPagePort(port) {
    const loc = getCurrentLocation();
    if (!loc || !isLoopbackHost(loc.hostname)) return false;
    const effectivePort = Number(loc.port || (String(loc.protocol || '').toLowerCase() === 'https:' ? 443 : 80));
    return effectivePort === normalizePositivePort(port, effectivePort);
}

export function isLocalAxumPage() {
    const loc = getCurrentLocation();
    const host = String(loc?.hostname || '').trim().toLowerCase();
    const protocol = String(loc?.protocol || '').trim().toLowerCase();
    const effectivePort = Number(loc?.port || (protocol === 'https:' ? 443 : 80));
    if (host === 'tauri.localhost' && (protocol === 'http:' || protocol === 'https:')) {
        return true;
    }
    if (isLikelyLocalDevHost(host) && effectivePort === getLocalServerPort()) {
        return true;
    }
    if (isCurrentLoopbackPagePort(getLocalServerPort())) {
        return true;
    }
    // Loopback page on a port that is NOT the cloud server (e.g. Tauri devUrl 1430):
    // treat as local Axum page so backend resolution never routes to Fastify.
    if (isLoopbackHost(host)) {
        if (effectivePort > 0 && effectivePort !== getCloudServerPort()) return true;
    }
    return false;
}

export function canUseFastifyPrimaryOnLocalAxumPage() {
    if (typeof window === 'undefined') return false;
    if (window.__SQUIRREL_ALLOW_FASTIFY_PRIMARY_ON_LOCAL_AXUM__ !== true) return false;
    if (!isLocalAxumPage()) return false;

    const host = String(window.location?.hostname || '').trim().toLowerCase();
    if (host !== 'tauri.localhost') return false;

    const cloudBase = getCloudServerUrl();
    if (!cloudBase) return false;
    try {
        const parsed = new URL(cloudBase);
        return !isLoopbackHost(parsed.hostname);
    } catch (_) {
        return false;
    }
}

const buildLoopbackOrigin = (port) => {
    const normalizedPort = normalizePositivePort(port, 0);
    const loc = getCurrentLocation();
    const pageProtocol = String(loc?.protocol || '').toLowerCase();
    const protocol = pageProtocol === 'https:' ? 'https:' : 'http:';
    const pageHost = String(loc?.hostname || '').trim().toLowerCase();
    const host = isLikelyLocalDevHost(pageHost)
        ? (pageHost === '0.0.0.0' ? '127.0.0.1' : pageHost)
        : '127.0.0.1';
    return `${protocol}//${host}:${normalizedPort}`;
};

export function alignLoopbackUrlToPageHost(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/\/$/, '');
    const loc = getCurrentLocation();
    const pageHost = String(loc?.hostname || '').trim().toLowerCase();
    if (!loc || !isLikelyLocalDevHost(pageHost)) return normalized;
    try {
        const parsed = new URL(normalized);
        if (!isLoopbackHost(parsed.hostname)) return normalized;
        parsed.protocol = String(loc.protocol || '').toLowerCase() === 'https:' ? 'https:' : parsed.protocol;
        parsed.hostname = pageHost === '0.0.0.0' ? '127.0.0.1' : pageHost;
        return parsed.toString().replace(/\/$/, '');
    } catch (_) {
        return normalized;
    }
}

export function resolveCanonicalFastifyHttpBase(url) {
    const sameOriginBase = getBrowserSameOriginServerUrl();
    const normalized = alignLoopbackUrlToPageHost(normalizeNoTrailingSlash(url || ''));

    if (sameOriginBase) {
        if (!normalized) return sameOriginBase;
        try {
            const parsed = new URL(normalized, window.location.href);
            return parsed.origin === sameOriginBase ? normalizeNoTrailingSlash(parsed.toString()) : sameOriginBase;
        } catch (_) {
            return sameOriginBase;
        }
    }

    return normalized || null;
}

/**
 * Check if running in Tauri environment
 */
export function isTauri() {
    if (typeof window === 'undefined') return false;
    if (window.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (window.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = String(window.location?.protocol || '').toLowerCase();
    const host = String(window.location?.hostname || '').toLowerCase();
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:' || protocol === 'atome:') return true;
    if (host === 'tauri.localhost') return true;
    const hasTauriInvoke = !!(window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function');
    if (hasTauriInvoke) return true;
    const hasTauriObjects = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (!hasTauriObjects) return false;
    const userAgent = (typeof navigator !== 'undefined') ? String(navigator.userAgent || '') : '';
    return /tauri/i.test(userAgent);
}

/**
 * Check if local server (Axum on 3000) is likely available
 * This is a heuristic based on environment, not a real connection test
 */
export function isLocalServerLikely() {
    if (typeof window === 'undefined') return false;

    // Tauri always has local server
    if (isTauri()) return true;

    return false;
}

/**
 * Get the local server URL (Tauri Axum on port 3000)
 * Returns null if local server is not available
 */
export function getLocalServerUrl() {
    if (typeof window === 'undefined') return null;
    const localPort = getLocalServerPort();
    const host = String(window.location?.hostname || '').trim().toLowerCase();
    const protocol = String(window.location?.protocol || '').trim().toLowerCase();
    const effectivePort = Number(window.location?.port || (protocol === 'https:' ? 443 : 80));
    if (effectivePort === localPort && isLikelyLocalDevHost(host)) {
        return window.location.origin;
    }
    if (host === 'tauri.localhost') {
        return window.location.origin;
    }
    const hasInjectedLocalPort = Number.isFinite(Number(window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__))
        || (window.__SQUIRREL_ALLOW_CUSTOM_TAURI_PORT__ === true && Number.isFinite(Number(window.__SQUIRREL_TAURI_LOCAL_PORT__)));
    if (hasInjectedLocalPort || isTauri()) {
        return buildLoopbackOrigin(localPort);
    }
    // Tauri dev mode: page on loopback but on a non-standard port (e.g. 1430).
    // Axum still listens on the canonical local port so return its origin.
    if (isLocalAxumPage() && isLikelyLocalDevHost(host)) {
        return buildLoopbackOrigin(localPort);
    }
    return null;
}

/**
 * Get the cloud server URL (Fastify on port 3001)
 */
export function getCloudServerUrl() {
    if (typeof window !== 'undefined') {
        const sameOriginBase = getBrowserSameOriginServerUrl();
        if (sameOriginBase) {
            return sameOriginBase;
        }

        // Check for custom Fastify URL
        const tauriProdOverride = (typeof window.__SQUIRREL_TAURI_FASTIFY_URL__ === 'string')
            ? window.__SQUIRREL_TAURI_FASTIFY_URL__.trim()
            : '';
        if (tauriProdOverride) {
            const normalized = resolveCanonicalFastifyHttpBase(tauriProdOverride);
            if (isCrossOriginLoopbackUrlForBrowser(normalized) && !canUseFastifyPrimaryOnLocalAxumPage()) {
                return null;
            }
            return normalized;
        }

        const customUrl = window.__SQUIRREL_FASTIFY_URL__;
        if (customUrl && typeof customUrl === 'string') {
            const normalized = resolveCanonicalFastifyHttpBase(customUrl);
            if (isCrossOriginLoopbackUrlForBrowser(normalized) && !canUseFastifyPrimaryOnLocalAxumPage()) {
                return null;
            }
            return normalized;
        }

        const cloudPort = getCloudServerPort();
        if (isCurrentLoopbackPagePort(cloudPort)) {
            return resolveCanonicalFastifyHttpBase(window.location.origin);
        }

        if (isTauri()) {
            return resolveCanonicalFastifyHttpBase(buildLoopbackOrigin(cloudPort));
        }

        // If server_config.json was loaded into a global, derive from it
        const cfg = window.__SQUIRREL_SERVER_CONFIG__;
        if (cfg && cfg.fastify && cfg.fastify.host && cfg.fastify.port) {
            const host = String(cfg.fastify.host || '').trim();
            const port = getCloudServerPort();
            if (isLoopbackHost(host)) {
                const normalized = resolveCanonicalFastifyHttpBase(buildLoopbackOrigin(port));
                if (isCrossOriginLoopbackUrlForBrowser(normalized) && !canUseFastifyPrimaryOnLocalAxumPage()) {
                    return null;
                }
                return normalized;
            }
            const protocol = window.location?.protocol || 'http:';
            return resolveCanonicalFastifyHttpBase(`${protocol}//${host}:${port}`);
        }

        // Auto-detect from current page URL (production mode)
        // If we're on https://atome.one, use that as the server
        const loc = window.location;
        if (loc && loc.hostname && !isLoopbackHost(loc.hostname)) {
            // We're on a real domain - use same origin
            const protocol = loc.protocol; // 'https:' or 'http:'
            const host = loc.hostname;
            // If port is default (80/443), don't include it
            const port = (loc.port && loc.port !== '80' && loc.port !== '443') ? `:${loc.port}` : '';
            return resolveCanonicalFastifyHttpBase(`${protocol}//${host}${port}`);
        }

        const protocol = window.location?.protocol || '';
        const isEmbeddedIos = protocol === 'atome:' || window.__AUV3_MODE__ === true;
        if (isEmbeddedIos) {
            return 'https://atome.one';
        }
    }

    // No implicit localhost fallback: Fastify URL must be configured
    return null;
}

/**
 * Get the best available server URL for API calls
 * Prefers local server if available, falls back to cloud
 * 
 * @param {object} options - Options
 * @param {boolean} options.preferCloud - Prefer cloud server even if local is available
 * @param {boolean} options.requireLocal - Require local server (returns null if not available)
 * @returns {string|null} Server URL or null if not available
 */
export function getServerUrl(options = {}) {
    const { preferCloud = false, requireLocal = false } = options;

    const localUrl = getLocalServerUrl();
    const cloudUrl = getCloudServerUrl();

    if (requireLocal) {
        return localUrl;
    }

    if (preferCloud) {
        return cloudUrl || localUrl;
    }

    // Default: prefer local if available
    return localUrl || cloudUrl;
}

/**
 * Get URLs for both local and cloud servers
 * Used when operations need to sync to both
 * 
 * @returns {object} { local: string|null, cloud: string }
 */
export function getBothServerUrls() {
    return {
        local: getLocalServerUrl(),
        cloud: getCloudServerUrl()
    };
}

/**
 * Build an API URL for the appropriate server
 * 
 * @param {string} path - API path (e.g., '/api/auth/login')
 * @param {object} options - Options for getServerUrl
 * @returns {string|null} Full URL or null
 */
export function buildApiUrl(path, options = {}) {
    const baseUrl = getServerUrl(options);
    if (!baseUrl) return null;

    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
}

/**
 * Build a local API URL (Tauri/Axum)
 * Returns null if local server is not available
 * 
 * @param {string} path - API path
 * @returns {string|null} Full URL or null
 */
export function buildLocalApiUrl(path) {
    return buildApiUrl(path, { requireLocal: true });
}

/**
 * Build a cloud API URL (Fastify)
 * 
 * @param {string} path - API path
 * @returns {string} Full URL
 */
export function buildCloudApiUrl(path) {
    const baseUrl = getCloudServerUrl();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
}

// Export as default object for convenience
export default {
    isTauri,
    isLocalServerLikely,
    getLocalServerUrl,
    getCloudServerUrl,
    getBrowserSameOriginServerUrl,
    getServerUrl,
    getBothServerUrls,
    buildApiUrl,
    buildLocalApiUrl,
    buildCloudApiUrl,
    resolveCanonicalFastifyHttpBase
};
