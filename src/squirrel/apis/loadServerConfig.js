/**
 * loadServerConfig.js
 *
 * Loads `/server_config.json` once and exposes it through window globals.
 * This keeps the Fastify endpoint fully configuration-driven.
 *
 * Globals set when available:
 * - window.__SQUIRREL_SERVER_CONFIG__
 * - window.__SQUIRREL_FASTIFY_URL__ (http/https base)
 * - window.__SQUIRREL_FASTIFY_WS_API_URL__ (ws/wss full URL)
 * - window.__SQUIRREL_FASTIFY_WS_SYNC_URL__ (ws/wss full URL)
 */

let _loadPromise = null;

function isInTauriRuntime() {
    if (typeof window === 'undefined') return false;
    return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

function normalizeNoTrailingSlash(url) {
    if (typeof url !== 'string') return '';
    return url.trim().replace(/\/$/, '');
}

function toWsBase(httpBase) {
    return normalizeNoTrailingSlash(httpBase)
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:');
}

function resolveConfigUrl() {
    const isTauri = isInTauriRuntime();
    if (isTauri) {
        const localPort = window.__ATOME_LOCAL_HTTP_PORT__ || 3000;
        return `http://127.0.0.1:${localPort}/server_config.json`;
    }
    // Use absolute path so it works when the app is served from a sub-route.
    return '/server_config.json';
}

function resolveFastifyHostFromConfig(config) {
    const host = config?.fastify?.host;

    // If config says localhost/127.0.0.1 but we're on a real domain,
    // prefer same-origin hostname to avoid broken production deployments.
    const pageHost = window.location?.hostname || '';
    const isLocalHost = host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0';
    const isPageLocal = pageHost === '127.0.0.1' || pageHost === 'localhost' || pageHost === '';

    if (isLocalHost && !isPageLocal) {
        return pageHost;
    }

    return host || pageHost || '127.0.0.1';
}

function resolveFastifyPortFromConfig(config) {
    return config?.fastify?.port;
}

function resolveProtocolBase() {
    const proto = window.location?.protocol === 'https:' ? 'https:' : 'http:';
    return proto;
}

function buildFastifyHttpBase(config) {
    const protocol = resolveProtocolBase();
    const host = resolveFastifyHostFromConfig(config);
    const port = resolveFastifyPortFromConfig(config);

    if (!host) return '';

    if (!port) {
        // No implicit fallback here: if port isn't configured and we can't infer,
        // use same-origin base.
        const origin = window.location?.origin;
        return typeof origin === 'string' ? normalizeNoTrailingSlash(origin) : '';
    }

    // If this matches same-origin default ports, origin may be cleaner, but keep explicit.
    return `${protocol}//${host}:${port}`;
}

function buildFastifyWsUrl(httpBase, path) {
    const wsBase = toWsBase(httpBase);
    const p = typeof path === 'string' && path.startsWith('/') ? path : '/ws/api';
    return `${wsBase}${p}`;
}

export async function loadServerConfigOnce() {
    if (typeof window === 'undefined') return null;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const configUrl = resolveConfigUrl();

        try {
            const res = await fetch(configUrl, { cache: 'no-store' });
            if (!res || !res.ok) {
                return null;
            }

            const config = await res.json();
            window.__SQUIRREL_SERVER_CONFIG__ = config;

            const httpBase = buildFastifyHttpBase(config);
            if (httpBase) {
                window.__SQUIRREL_FASTIFY_URL__ = normalizeNoTrailingSlash(httpBase);

                const apiWsPath = config?.fastify?.apiWsPath || '/ws/api';
                const syncWsPath = config?.fastify?.syncWsPath || '/ws/sync';

                window.__SQUIRREL_FASTIFY_WS_API_URL__ = buildFastifyWsUrl(httpBase, apiWsPath);
                window.__SQUIRREL_FASTIFY_WS_SYNC_URL__ = buildFastifyWsUrl(httpBase, syncWsPath);
            }

            return config;
        } catch {
            return null;
        }
    })();

    return _loadPromise;
}

export function getServerConfigSync() {
    if (typeof window === 'undefined') return null;
    return window.__SQUIRREL_SERVER_CONFIG__ || null;
}
