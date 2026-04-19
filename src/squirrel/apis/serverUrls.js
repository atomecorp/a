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

const getCurrentLocation = () => {
    if (typeof window === 'undefined') return null;
    return window.location || null;
};

export function isLoopbackHost(hostname) {
    return LOOPBACK_HOSTS.has(String(hostname || '').trim().toLowerCase());
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
    if (host === 'tauri.localhost' && (protocol === 'http:' || protocol === 'https:')) {
        return true;
    }
    return isCurrentLoopbackPagePort(getLocalServerPort());
}

const buildLoopbackOrigin = (port) => {
    const normalizedPort = normalizePositivePort(port, 0);
    const loc = getCurrentLocation();
    const pageProtocol = String(loc?.protocol || '').toLowerCase();
    const protocol = pageProtocol === 'https:' ? 'https:' : 'http:';
    const pageHost = String(loc?.hostname || '').trim().toLowerCase();
    const host = isLoopbackHost(pageHost) ? (pageHost === '0.0.0.0' ? '127.0.0.1' : pageHost) : '127.0.0.1';
    return `${protocol}//${host}:${normalizedPort}`;
};

export function alignLoopbackUrlToPageHost(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/\/$/, '');
    const loc = getCurrentLocation();
    if (!loc || !isLoopbackHost(loc.hostname)) return normalized;
    try {
        const parsed = new URL(normalized);
        if (!isLoopbackHost(parsed.hostname)) return normalized;
        parsed.protocol = String(loc.protocol || '').toLowerCase() === 'https:' ? 'https:' : parsed.protocol;
        parsed.hostname = String(loc.hostname || '').toLowerCase() === '0.0.0.0' ? '127.0.0.1' : String(loc.hostname || '').toLowerCase();
        return parsed.toString().replace(/\/$/, '');
    } catch (_) {
        return normalized;
    }
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
    if (isCurrentLoopbackPagePort(localPort)) {
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
    return null;
}

/**
 * Get the cloud server URL (Fastify on port 3001)
 */
export function getCloudServerUrl() {
    if (typeof window !== 'undefined') {
        // Check for custom Fastify URL
        const tauriProdOverride = (typeof window.__SQUIRREL_TAURI_FASTIFY_URL__ === 'string')
            ? window.__SQUIRREL_TAURI_FASTIFY_URL__.trim()
            : '';
        if (tauriProdOverride) {
            return alignLoopbackUrlToPageHost(tauriProdOverride);
        }

        const customUrl = window.__SQUIRREL_FASTIFY_URL__;
        if (customUrl && typeof customUrl === 'string') {
            return alignLoopbackUrlToPageHost(customUrl);
        }

        const cloudPort = getCloudServerPort();
        if (isCurrentLoopbackPagePort(cloudPort)) {
            return window.location.origin;
        }

        if (isTauri()) {
            return buildLoopbackOrigin(cloudPort);
        }

        // If server_config.json was loaded into a global, derive from it
        const cfg = window.__SQUIRREL_SERVER_CONFIG__;
        if (cfg && cfg.fastify && cfg.fastify.host && cfg.fastify.port) {
            const host = String(cfg.fastify.host || '').trim();
            const port = getCloudServerPort();
            if (isLoopbackHost(host)) {
                return buildLoopbackOrigin(port);
            }
            const protocol = window.location?.protocol || 'http:';
            return `${protocol}//${host}:${port}`;
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
            return `${protocol}//${host}${port}`;
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
    getServerUrl,
    getBothServerUrls,
    buildApiUrl,
    buildLocalApiUrl,
    buildCloudApiUrl
};
