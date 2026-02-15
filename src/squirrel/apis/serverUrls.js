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

/**
 * Check if running in Tauri environment
 */
export function isTauri() {
    if (typeof window === 'undefined') return false;
    if (window.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (window.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = String(window.location?.protocol || '').toLowerCase();
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:') return true;
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
    const allowCustomPort = window.__SQUIRREL_ALLOW_CUSTOM_TAURI_PORT__ === true;
    const forcedPort = Number(window.__SQUIRREL_TAURI_LOCAL_PORT__);
    if (allowCustomPort && Number.isFinite(forcedPort) && forcedPort > 0) {
        return `http://127.0.0.1:${forcedPort}`;
    }
    const customPort = Number(window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__);
    if (Number.isFinite(customPort) && customPort > 0) {
        return `http://127.0.0.1:${customPort}`;
    }
    if (isTauri()) {
        return 'http://127.0.0.1:3000';
    }

    // Local server not available (pure browser/Fastify mode)
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
            return tauriProdOverride.replace(/\/$/, '');
        }

        const customUrl = window.__SQUIRREL_FASTIFY_URL__;
        if (customUrl && typeof customUrl === 'string') {
            return customUrl.trim().replace(/\/$/, '');
        }

        // Tauri production webview uses https://tauri.localhost for the UI origin.
        // Cloud (Fastify) must be explicit and should never default to tauri.localhost.
        if (isTauri()) {
            const host = window.location?.hostname || '';
            if (host === 'tauri.localhost') {
                return 'https://atome.one';
            }
        }

        // If server_config.json was loaded into a global, derive from it
        const cfg = window.__SQUIRREL_SERVER_CONFIG__;
        if (cfg && cfg.fastify && cfg.fastify.host && cfg.fastify.port) {
            const protocol = window.location?.protocol || 'http:';
            const host = cfg.fastify.host;
            const port = cfg.fastify.port;
            return `${protocol}//${host}:${port}`;
        }

        // Auto-detect from current page URL (production mode)
        // If we're on https://atome.one, use that as the server
        const loc = window.location;
        if (loc && loc.hostname && loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1') {
            // We're on a real domain - use same origin
            const protocol = loc.protocol; // 'https:' or 'http:'
            const host = loc.hostname;
            // If port is default (80/443), don't include it
            const port = (loc.port && loc.port !== '80' && loc.port !== '443') ? `:${loc.port}` : '';
            return `${protocol}//${host}${port}`;
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
