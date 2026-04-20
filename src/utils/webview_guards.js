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
    try {
        const fromLocal = localStorage.getItem('local_auth_token');
        if (fromLocal) return fromLocal;
    } catch (_) { }
    try {
        const fromSession = sessionStorage.getItem('local_auth_token');
        if (fromSession) return fromSession;
    } catch (_) { }
    return '';
};

const isProtectedMutationPath = (pathname) => {
    const value = String(pathname || '').trim();
    if (!value) return false;
    return value.startsWith('/api/events/commit') || value.startsWith('/api/state_current');
};

const buildLocalAxumRequestUrl = (targetUrl) => {
    if (typeof window === 'undefined') return '';
    const pageHost = String(window.location?.hostname || '').trim().toLowerCase();
    const nextHost = isLikelyLocalHost(pageHost)
        ? (pageHost === '0.0.0.0' ? '127.0.0.1' : pageHost)
        : '127.0.0.1';
    const nextProtocol = String(window.location?.protocol || '').toLowerCase() === 'https:' ? 'https:' : 'http:';
    const nextPort = readLocalAxumPort();
    try {
        const parsed = new URL(targetUrl, window.location.href);
        parsed.protocol = nextProtocol;
        parsed.hostname = nextHost;
        parsed.port = String(nextPort);
        return parsed.toString();
    } catch (_) {
        return '';
    }
};

const readOrigin = (locationLike) => {
    try {
        const origin = String(locationLike?.origin || '').trim();
        if (origin && origin !== 'null') return origin;
    } catch (_) { }
    return '';
};

const emitFetchGuardLog = (stage, payload = {}) => {
    if (typeof console === 'undefined') return;
    try {
        const message = `[SquirrelFetchGuard] ${String(stage || 'stage')} ${JSON.stringify(payload || {})}`;
        if (String(stage || '').includes('passthrough') || String(stage || '').includes('blocked') || String(stage || '').includes('unexpected')) {
            console.error(message);
        } else {
            console.warn(message);
        }
        const bridge = window.webkit?.messageHandlers?.console;
        if (bridge && typeof bridge.postMessage === 'function') {
            bridge.postMessage(message);
        }
        const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.invoke;
        if (typeof invoke === 'function') {
            Promise.resolve(invoke('log_from_webview', {
                payload: {
                    level: 'warn',
                    source: 'ios_webview',
                    component: 'fetch_guard',
                    message,
                    data: payload,
                    timestamp: new Date().toISOString()
                }
            })).catch(() => { });
        }
    } catch (_) { }
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
        const targetPort = readLocationPort(parsedUrl);
        const shouldRewrite = (
            isLoopbackHost(parsedUrl.hostname)
            && targetPort === fastifyPort
            && !sameOrigin
            && isProtectedMutationPath(parsedUrl.pathname)
        );

        const snapshot = {
            when: new Date().toISOString(),
            inputUrl: parsedUrl.toString(),
            page: window.location?.href || null,
            pageOrigin,
            targetOrigin,
            sameOrigin,
            targetPort,
            fastifyPort,
            shouldRewrite
        };

        const protectedLoopbackFastifyRequest = (
            isLoopbackHost(parsedUrl.hostname)
            && isProtectedMutationPath(parsedUrl.pathname)
            && targetPort === fastifyPort
        );

        if (protectedLoopbackFastifyRequest) {
            try {
                window.__SQUIRREL_FETCH_GUARD_LAST__ = snapshot;
            } catch (_) { }
            emitFetchGuardLog('decision', snapshot);
        }

        if (
            protectedLoopbackFastifyRequest
            && window.__CHECK_DEBUG__ === true
            && window.__SQUIRREL_FETCH_GUARD_TRIPWIRE__ !== false
        ) {
            emitFetchGuardLog('tripwire', snapshot);
            throw new Error(`[SquirrelFetchGuard] tripwire ${JSON.stringify(snapshot)}`);
        }

        const suspiciousPassthrough = (
            protectedLoopbackFastifyRequest
            && (!pageOrigin || !targetOrigin || pageOrigin !== targetOrigin)
            && !shouldRewrite
        );

        if (suspiciousPassthrough) {
            emitFetchGuardLog('unexpected_passthrough', snapshot);
            throw new Error(`[SquirrelFetchGuard] unexpected_passthrough ${JSON.stringify(snapshot)}`);
        }

        if (!shouldRewrite) {
            emitFetchGuardLog('passthrough', snapshot);
            return nativeFetch(input, init);
        }

        const rewrittenUrl = buildLocalAxumRequestUrl(parsedUrl.toString());
        if (!rewrittenUrl) {
            emitFetchGuardLog('blocked_no_rewrite_target', snapshot);
            console.warn('[Squirrel] Blocked loopback Fastify request without local rewrite target', {
                url: parsedUrl.toString(),
                page: window.location?.href || null
            });
            throw new Error(`Blocked loopback Fastify request: ${parsedUrl.toString()}`);
        }

        const headers = new Headers(input instanceof Request ? input.headers : (init?.headers || undefined));
        const localToken = readLocalAuthToken();
        if (localToken) {
            headers.set('Authorization', `Bearer ${localToken}`);
        }

        emitFetchGuardLog('rewritten', {
            ...snapshot,
            from: parsedUrl.toString(),
            to: rewrittenUrl,
            hasLocalToken: !!localToken
        });

        if (window.__CHECK_DEBUG__ === true && window.__SQUIRREL_FETCH_GUARD_DIAG_THROW__ !== false) {
            throw new Error(`[SquirrelFetchGuard] rewritten ${JSON.stringify({
                ...snapshot,
                from: parsedUrl.toString(),
                to: rewrittenUrl,
                hasLocalToken: !!localToken
            })}`);
        }

        console.warn('[Squirrel] Rewriting loopback Fastify request to local Axum', {
            from: parsedUrl.toString(),
            to: rewrittenUrl,
            page: window.location?.href || null
        });

        if (input instanceof Request) {
            const nextRequest = new Request(rewrittenUrl, {
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
            return nativeFetch(nextRequest);
        }

        return nativeFetch(rewrittenUrl, {
            ...(init || {}),
            headers
        });
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