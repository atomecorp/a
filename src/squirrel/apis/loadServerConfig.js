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

function applyDebugConfig(config) {
    if (typeof window === 'undefined') return;
    const logging = config?.logging;
    if (!logging) return;
    if (!isInTauriRuntime() && typeof window.__CHECK_DEBUG__ === 'boolean') {
        globalThis.__CHECK_DEBUG__ = window.__CHECK_DEBUG__;
        return;
    }
    if (typeof logging.debugEnabled === 'boolean') {
        window.__CHECK_DEBUG__ = logging.debugEnabled;
        globalThis.__CHECK_DEBUG__ = window.__CHECK_DEBUG__;
        return;
    }
    if (logging.disableUiLogs === true) {
        window.__CHECK_DEBUG__ = false;
        globalThis.__CHECK_DEBUG__ = window.__CHECK_DEBUG__;
    }
}

function isInTauriRuntime() {
    if (typeof window === 'undefined') return false;
    if (window.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (window.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = window.location?.protocol || '';
    const host = window.location?.hostname || '';
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:') return true;
    if (host === 'tauri.localhost') return true;
    const hasTauriObjects = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (hasTauriObjects) return true;
    const userAgent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
    return /tauri/i.test(userAgent);
}

function isEmbeddedIOSRuntime() {
    if (typeof window === 'undefined') return false;
    const protocol = window.location?.protocol || '';
    return protocol === 'atome:' || window.__AUV3_MODE__ === true;
}

function isTauriProdWebview() {
    if (!isInTauriRuntime()) return false;
    const host = window.location?.hostname || '';
    return host === 'tauri.localhost';
}

function resolveTauriProdFastifyHttpBase() {
    if (typeof window === 'undefined') return 'https://atome.one';

    const explicit = (typeof window.__SQUIRREL_TAURI_FASTIFY_URL__ === 'string')
        ? window.__SQUIRREL_TAURI_FASTIFY_URL__.trim()
        : '';
    if (explicit) return explicit;

    const override = readTauriFastifyOverride();
    if (override) return override;

    const already = (typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
        ? window.__SQUIRREL_FASTIFY_URL__.trim()
        : '';
    if (already) return already;

    return 'https://atome.one';
}

function normalizeNoTrailingSlash(url) {
    if (typeof url !== 'string') return '';
    return url.trim().replace(/\/$/, '');
}

function readLocalTauriHttpPort() {
    if (typeof window === 'undefined') return null;
    const allowCustomPort = window.__SQUIRREL_ALLOW_CUSTOM_TAURI_PORT__ === true;
    const forcedPort = Number(window.__SQUIRREL_TAURI_LOCAL_PORT__);
    if (allowCustomPort && Number.isFinite(forcedPort) && forcedPort > 0) {
        return forcedPort;
    }
    const raw = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT || null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return isInTauriRuntime() ? 3000 : null;
    }
    return value;
}

function isLoopbackHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0';
}

function readExpectedFastifyLoopbackPort(config = null) {
    const raw = config?.fastify?.port
        ?? window.__SQUIRREL_SERVER_CONFIG__?.fastify?.port
        ?? 3001;
    let expected = Number(raw);
    if (!Number.isFinite(expected) || expected <= 0) expected = 3001;
    const localPort = readLocalTauriHttpPort();
    if (localPort && expected === localPort) {
        expected = 3001;
    }
    return expected;
}

function isDisallowedFastifyLoopbackPort(base, config = null) {
    if (typeof base !== 'string' || !base.trim()) return false;
    if (!isInTauriRuntime()) return false;
    if (window.__SQUIRREL_ALLOW_CUSTOM_FASTIFY_LOOPBACK_PORT__ === true) return false;
    try {
        const parsed = new URL(base.trim());
        if (!isLoopbackHost(parsed.hostname)) return false;
        const candidatePort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
        if (!Number.isFinite(candidatePort) || candidatePort <= 0) return false;
        const expectedPort = readExpectedFastifyLoopbackPort(config);
        return candidatePort !== expectedPort;
    } catch (_) {
        return false;
    }
}

function isInvalidFastifyLoopbackBase(base) {
    if (typeof base !== 'string' || !base.trim()) return false;
    if (!isInTauriRuntime()) return false;
    const localPort = readLocalTauriHttpPort();
    if (isDisallowedFastifyLoopbackPort(base)) return true;
    if (!localPort) return false;
    try {
        const parsed = new URL(base.trim());
        if (!isLoopbackHost(parsed.hostname)) return false;
        const candidatePort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
        return Number.isFinite(candidatePort) && candidatePort === localPort;
    } catch (_) {
        return false;
    }
}

function clearFastifyOverrideStorage() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem('squirrel_tauri_fastify_url_override');
    } catch (_) { }
}

function isLocalFastifyBase(base) {
    if (typeof base !== 'string' || !base.trim()) return false;
    try {
        const parsed = new URL(base.trim());
        const host = parsed.hostname;
        return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0';
    } catch (_) {
        return false;
    }
}

function readTauriFastifyOverride() {
    if (typeof window === 'undefined') return '';
    try {
        const stored = localStorage.getItem('squirrel_tauri_fastify_url_override');
        const normalized = normalizeNoTrailingSlash(stored);
        if (!normalized) return '';
        if (isInvalidFastifyLoopbackBase(normalized)) {
            clearFastifyOverrideStorage();
            return '';
        }
        return normalized;
    } catch (_) {
        return '';
    }
}

function toWsBase(httpBase) {
    return normalizeNoTrailingSlash(httpBase)
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:');
}

function applyFastifyGlobalsFromHttpBase(httpBase, config = null) {
    const base = normalizeNoTrailingSlash(httpBase);
    if (!base) return;
    if (isInvalidFastifyLoopbackBase(base) || isDisallowedFastifyLoopbackPort(base, config)) {
        clearFastifyOverrideStorage();
        return;
    }

    window.__SQUIRREL_FASTIFY_URL__ = base;

    const apiWsPath = config?.fastify?.apiWsPath || '/ws/api';
    const syncWsPath = config?.fastify?.syncWsPath || '/ws/sync';

    window.__SQUIRREL_FASTIFY_WS_API_URL__ = buildFastifyWsUrl(base, apiWsPath);
    window.__SQUIRREL_FASTIFY_WS_SYNC_URL__ = buildFastifyWsUrl(base, syncWsPath);
}

function resolveConfigUrl() {
    const isTauri = isInTauriRuntime();
    if (isTauri) {
        const localPort = readLocalTauriHttpPort() || 3000;
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
    const rawPort = config?.fastify?.port;
    const parsedPort = Number(rawPort);
    if (!Number.isFinite(parsedPort) || parsedPort <= 0) return rawPort;

    if (isInTauriRuntime()) {
        const localPort = readLocalTauriHttpPort();
        const host = resolveFastifyHostFromConfig(config);
        if (localPort && parsedPort === localPort && isLoopbackHost(host)) {
            return 3001;
        }
    }

    return parsedPort;
}

function resolveProtocolBase() {
    const proto = window.location?.protocol === 'https:' ? 'https:' : 'http:';
    return proto;
}

function buildFastifyHttpBase(config) {
    if (isEmbeddedIOSRuntime()) {
        return resolveTauriProdFastifyHttpBase();
    }

    // In browser mode (behind nginx), Fastify is reached via same-origin.
    // Never force :3001 in production web deployments, otherwise HTTPS pages will
    // attempt to talk TLS directly to the Fastify HTTP port and fail.
    if (!isInTauriRuntime()) {
        const origin = window.location?.origin;
        const host = window.location?.hostname || '';
        const isLocalHost = host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || host === '';

        if (!isLocalHost) {
            if (typeof origin === 'string' && origin && origin !== 'null') {
                return normalizeNoTrailingSlash(origin);
            }
        }

        const protocol = resolveProtocolBase();
        const cfgHost = resolveFastifyHostFromConfig(config);
        const cfgPort = resolveFastifyPortFromConfig(config);
        if (cfgHost && cfgPort) {
            return `${protocol}//${cfgHost}:${cfgPort}`;
        }

        if (typeof origin === 'string' && origin && origin !== 'null') {
            return normalizeNoTrailingSlash(origin);
        }
    }

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

function buildDefaultServerConfig() {
    return {
        fastify: {
            host: '127.0.0.1',
            port: 3001,
            serverInfoPath: '/api/server-info',
            syncWsPath: '/ws/sync',
            apiWsPath: '/ws/api'
        },
        generated: true
    };
}

export async function loadServerConfigOnce() {
    if (typeof window === 'undefined') return null;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const isTauriRuntime = isInTauriRuntime();
        const forceFetch = window.__SQUIRREL_FORCE_SERVER_CONFIG_FETCH__ === true;
        let tauriOverride = isTauriRuntime ? readTauriFastifyOverride() : '';
        const applyFallbackBase = () => {
            if (typeof window === 'undefined') return;
            const existing = (typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
                ? window.__SQUIRREL_FASTIFY_URL__.trim()
                : '';
            if (existing) return;
            if (isEmbeddedIOSRuntime()) {
                const fallback = resolveTauriProdFastifyHttpBase();
                if (fallback) {
                    applyFastifyGlobalsFromHttpBase(fallback, window.__SQUIRREL_SERVER_CONFIG__ || null);
                }
                return;
            }
            if (isTauriRuntime) {
                const fallback = resolveTauriProdFastifyHttpBase();
                if (fallback) {
                    applyFastifyGlobalsFromHttpBase(fallback, window.__SQUIRREL_SERVER_CONFIG__ || null);
                }
                return;
            }
            const origin = window.location?.origin;
            if (typeof origin === 'string' && origin && origin !== 'null') {
                applyFastifyGlobalsFromHttpBase(origin, window.__SQUIRREL_SERVER_CONFIG__ || null);
            }
        };

        if (isTauriRuntime && !forceFetch) {
            const config = buildDefaultServerConfig();
            window.__SQUIRREL_SERVER_CONFIG__ = config;
            applyDebugConfig(config);
            if (tauriOverride) {
                window.__SQUIRREL_TAURI_FASTIFY_URL__ = tauriOverride;
                applyFastifyGlobalsFromHttpBase(tauriOverride, config);
            } else {
                const httpBase = buildFastifyHttpBase(config);
                if (httpBase) {
                    applyFastifyGlobalsFromHttpBase(httpBase, config);
                }
            }
            return config;
        }

        if (tauriOverride) {
            window.__SQUIRREL_TAURI_FASTIFY_URL__ = tauriOverride;
            applyFastifyGlobalsFromHttpBase(tauriOverride, window.__SQUIRREL_SERVER_CONFIG__ || null);
        }

        if (isTauriProdWebview()) {
            applyFastifyGlobalsFromHttpBase(resolveTauriProdFastifyHttpBase(), window.__SQUIRREL_SERVER_CONFIG__ || null);
        }

        const configUrl = resolveConfigUrl();

        try {
            const res = await fetch(configUrl, { cache: 'no-store' });
            if (!res || !res.ok) {
                applyFallbackBase();
                return null;
            }

            const config = await res.json();
            window.__SQUIRREL_SERVER_CONFIG__ = config;
            applyDebugConfig(config);

            if (isTauriProdWebview()) {
                applyFastifyGlobalsFromHttpBase(resolveTauriProdFastifyHttpBase(), config);
                return config;
            }

            if (isTauriRuntime) {
                tauriOverride = readTauriFastifyOverride() || tauriOverride;
            }
            if (tauriOverride) {
                applyFastifyGlobalsFromHttpBase(tauriOverride, config);
                return config;
            }

            const httpBase = buildFastifyHttpBase(config);
            if (httpBase) {
                applyFastifyGlobalsFromHttpBase(httpBase, config);
            }

            return config;
        } catch {
            applyFallbackBase();
            return null;
        }
    })();

    return _loadPromise;
}

export function getServerConfigSync() {
    if (typeof window === 'undefined') return null;
    return window.__SQUIRREL_SERVER_CONFIG__ || null;
}
