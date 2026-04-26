import { getLocalServerUrl, isLocalAxumPage } from '../squirrel/apis/serverUrls.js';

const isLoopbackHost = (hostname) => {
    const value = String(hostname || '').trim().toLowerCase();
    return value === '127.0.0.1' || value === 'localhost' || value === '0.0.0.0' || value === 'tauri.localhost';
};

const isPrivateIpv4Host = (hostname) => {
    const parts = String(hostname || '').trim().toLowerCase().split('.');
    if (parts.length !== 4) return false;
    const numbers = parts.map((part) => Number(part));
    if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    if (numbers[0] === 10 || numbers[0] === 127) return true;
    if (numbers[0] === 192 && numbers[1] === 168) return true;
    if (numbers[0] === 169 && numbers[1] === 254) return true;
    if (numbers[0] === 172 && numbers[1] >= 16 && numbers[1] <= 31) return true;
    return false;
};

const isLikelyLocalHost = (hostname) => {
    const value = String(hostname || '').trim().toLowerCase();
    if (!value) return false;
    if (isLoopbackHost(value)) return true;
    if (value === '::1' || value === '[::1]') return true;
    if (isPrivateIpv4Host(value)) return true;
    if (value.endsWith('.local') || value.endsWith('.lan') || value.endsWith('.home')) return true;
    if (!value.includes('.')) return true;
    return false;
};

const readLocationPort = (locationLike) => {
    const rawPort = String(locationLike?.port || '').trim();
    if (rawPort) {
        const parsed = Number(rawPort);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return String(locationLike?.protocol || '').toLowerCase() === 'https:' ? 443 : 80;
};

const readFastifyLoopbackPort = () => {
    if (typeof window === 'undefined') return 3001;
    const raw = window.__SQUIRREL_SERVER_CONFIG__?.fastify?.port ?? 3001;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3001;
};

const readLocalAxumPort = () => {
    if (typeof window === 'undefined') return 3000;
    const allowCustomPort = window.__SQUIRREL_ALLOW_CUSTOM_TAURI_PORT__ === true;
    const forcedPort = Number(window.__SQUIRREL_TAURI_LOCAL_PORT__);
    if (allowCustomPort && Number.isFinite(forcedPort) && forcedPort > 0) return forcedPort;
    const runtimePort = Number(window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__ || null);
    if (Number.isFinite(runtimePort) && runtimePort > 0) return runtimePort;
    return 3000;
};

const readLocalAuthToken = () => {
    if (typeof localStorage !== 'undefined') {
        const fromLocal = localStorage.getItem('local_auth_token');
        if (fromLocal) return fromLocal;
    }
    if (typeof sessionStorage !== 'undefined') {
        const fromSession = sessionStorage.getItem('local_auth_token');
        if (fromSession) return fromSession;
    }
    return '';
};

const isProtectedMutationPath = (pathname) => {
    const value = String(pathname || '').trim();
    if (!value) return false;
    return value.startsWith('/api/events/commit') || value.startsWith('/api/state_current');
};

const normalizeNoTrailingSlash = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\/$/, '');
};

const readLocalAxumBaseUrl = () => {
    const localBase = normalizeNoTrailingSlash(getLocalServerUrl() || '');
    if (localBase) return localBase;
    if (typeof window === 'undefined') return '';
    const pageHost = String(window.location?.hostname || '').trim().toLowerCase();
    const nextHost = isLikelyLocalHost(pageHost)
        ? (pageHost === '0.0.0.0' ? '127.0.0.1' : pageHost)
        : '127.0.0.1';
    const nextProtocol = String(window.location?.protocol || '').toLowerCase() === 'https:' ? 'https:' : 'http:';
    const nextPort = readLocalAxumPort();
    return normalizeNoTrailingSlash(`${nextProtocol}//${nextHost}:${nextPort}`);
};

const buildLocalAxumRequestUrl = (targetUrl) => {
    if (typeof window === 'undefined') return '';
    const localBase = readLocalAxumBaseUrl();
    if (!localBase) return '';
    const parsed = new URL(targetUrl, window.location.href);
    const baseUrl = new URL(localBase, window.location.href);
    if (baseUrl.origin === window.location.origin) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    parsed.protocol = baseUrl.protocol;
    parsed.hostname = baseUrl.hostname;
    parsed.port = baseUrl.port;
    return parsed.toString();
};

const buildBrowserSameOriginRequestUrl = (targetUrl) => {
    if (typeof window === 'undefined') return '';
    const parsed = new URL(targetUrl, window.location.href);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

const buildProtectedLoopbackCandidateUrls = (parsedUrl) => {
    const candidates = [];
    const pushCandidate = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized) return;
        if (candidates.includes(normalized)) return;
        candidates.push(normalized);
    };
    const originalUrl = parsedUrl?.toString?.() || '';
    const sameOriginUrl = buildBrowserSameOriginRequestUrl(originalUrl);
    const localAxumUrl = buildLocalAxumRequestUrl(originalUrl);

    if (isLocalAxumPage()) {
        pushCandidate(localAxumUrl);
        pushCandidate(sameOriginUrl);
    } else {
        pushCandidate(sameOriginUrl);
        pushCandidate(localAxumUrl);
    }

    return candidates;
};

const readOrigin = (locationLike) => {
    try {
        const origin = String(locationLike?.origin || '').trim();
        if (origin && origin !== 'null') return origin;
    } catch (_) { }
    return '';
};

const installLoopbackMutationFetchGuard = () => {
    if (typeof window === 'undefined' || window._squirrelLoopbackMutationFetchGuardInstalled) return;
    if (typeof globalThis.fetch !== 'function') return;

    const nativeFetch = globalThis.fetch.bind(globalThis);
    window._squirrelLoopbackMutationFetchGuardInstalled = true;

    globalThis.fetch = async function squirrelGuardedFetch(input, init) {
        let parsedUrl = null;
        try {
            const rawUrl = typeof input === 'string' || input instanceof URL
                ? String(input)
                : input?.url;
            if (!rawUrl) {
                return nativeFetch(input, init);
            }
            parsedUrl = new URL(rawUrl, window.location.href);
        } catch (_) {
            return nativeFetch(input, init);
        }

        const pageOrigin = readOrigin(window.location);
        const fastifyPort = readFastifyLoopbackPort();
        const targetOrigin = readOrigin(parsedUrl);
        const sameOrigin = !!(pageOrigin && targetOrigin && pageOrigin === targetOrigin);
        const protectedLoopbackRequest = (
            isLoopbackHost(parsedUrl.hostname)
            && isProtectedMutationPath(parsedUrl.pathname)
        );
        const shouldIntercept = protectedLoopbackRequest && !sameOrigin;

        if (!shouldIntercept) {
            return nativeFetch(input, init);
        }

        const candidateUrls = buildProtectedLoopbackCandidateUrls(parsedUrl);
        if (!candidateUrls.length) {
            throw new Error(`Blocked loopback Fastify request: ${parsedUrl.toString()}`);
        }

        const headers = new Headers(input instanceof Request ? input.headers : (init?.headers || undefined));
        const localToken = readLocalAuthToken();
        if (localToken) {
            headers.set('Authorization', `Bearer ${localToken}`);
        }

        if (input instanceof Request) {
            let lastError = null;
            for (const candidateUrl of candidateUrls) {
                try {
                    const nextRequest = new Request(candidateUrl, {
                        method: init?.method || input.method,
                        headers,
                        body: init?.body,
                        mode: init?.mode || input.mode,
                        credentials: init?.credentials || input.credentials,
                        cache: init?.cache || input.cache,
                        redirect: init?.redirect || input.redirect,
                        referrer: init?.referrer || input.referrer,
                        referrerPolicy: init?.referrerPolicy || input.referrerPolicy,
                        integrity: init?.integrity || input.integrity,
                        keepalive: init?.keepalive ?? input.keepalive,
                        signal: init?.signal || input.signal
                    });
                    return await nativeFetch(nextRequest);
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error(`Blocked loopback Fastify request: ${parsedUrl.toString()}`);
        }

        let lastError = null;
        for (const candidateUrl of candidateUrls) {
            try {
                return await nativeFetch(candidateUrl, {
                    ...(init || {}),
                    headers
                });
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error(`Blocked loopback Fastify request: ${parsedUrl.toString()}`);
    };
};

export const installWebViewErrorGuards = () => {
    if (typeof window === 'undefined' || window._squirrelErrorHandlerInstalled) return;

    window._squirrelErrorHandlerInstalled = true;
    installLoopbackMutationFetchGuard();

    window.addEventListener('unhandledrejection', function onUnhandledRejectionCapture(event) {
        console.error('[Squirrel] Unhandled Promise Rejection caught:', event.reason);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
    }, true);

    window.addEventListener('unhandledrejection', function onUnhandledRejectionBubble(event) {
        event.preventDefault();
        return false;
    }, false);

    window.onerror = function onWindowError(message, url, line, column) {
        console.error('[Squirrel] Uncaught error:', message, 'at', url, line, column);
        return true;
    };
};