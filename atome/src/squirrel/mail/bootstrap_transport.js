import {
    normalizeRuntimeMailPreferences,
    persistRuntimeMailPreferences,
    readPersistedRuntimeMailPreferences
} from './runtime_preferences.js';

const FASTIFY_FALLBACK = 'http://127.0.0.1:3001';
const TAURI_LOCAL_FALLBACK = 'http://127.0.0.1:3000';

const resolveTransportHost = (env = globalThis) => {
    const fallback = typeof window !== 'undefined' ? window : globalThis;
    if (!env || typeof env !== 'object') return fallback;
    const shouldInheritHostTransport = (
        env.__SQUIRREL_FORCE_BROWSER_RUNTIME__ === true
        || env.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true
    );
    if (
        env.location
        || env.fetch
        || env.document
        || env.navigator
        || env.__TAURI__
        || env.__TAURI_INTERNALS__
    ) {
        return env;
    }
    return shouldInheritHostTransport ? fallback : env;
};

const isNodeRuntime = (env = globalThis) => {
    const host = resolveTransportHost(env);
    if (env?.__SQUIRREL_FORCE_BROWSER_RUNTIME__ === true || host?.__SQUIRREL_FORCE_BROWSER_RUNTIME__ === true) return false;
    if (typeof window !== 'undefined' && (host === window || host?.window === window)) return false;
    if (host?.location || host?.document || host?.navigator) return false;
    if (isTauriRuntime(host)) return false;
    return typeof process !== 'undefined' && !!process.versions?.node;
};

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

const resolveLoopbackOrigin = (env) => {
    const host = resolveTransportHost(env);
    const rawOrigin = String(
        host?.location?.origin
        || host?.location?.href
        || ''
    ).trim();
    if (!rawOrigin) return '';
    try {
        const parsed = new URL(rawOrigin);
        const protocol = String(parsed.protocol || '').toLowerCase();
        if (protocol !== 'http:' && protocol !== 'https:') return '';
        if (!['127.0.0.1', 'localhost', '0.0.0.0'].includes(String(parsed.hostname || '').toLowerCase())) {
            return '';
        }
        return `${parsed.protocol}//${parsed.host}`.replace(/\/$/, '');
    } catch (_) {
        return '';
    }
};

const isTauriRuntime = (env) => {
    const hostEnv = resolveTransportHost(env);
    if (!hostEnv || typeof hostEnv !== 'object') return false;
    if (env?.__SQUIRREL_FORCE_FASTIFY__ === true || hostEnv.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (env?.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true || hostEnv.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = String(hostEnv.location?.protocol || '').toLowerCase();
    const host = String(hostEnv.location?.hostname || '').toLowerCase();
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:') return true;
    if (host === 'tauri.localhost') return true;
    const hasTauriInvoke = !!(hostEnv.__TAURI_INTERNALS__ && typeof hostEnv.__TAURI_INTERNALS__.invoke === 'function');
    if (hasTauriInvoke) return true;
    const hasTauriObjects = !!(hostEnv.__TAURI__ || hostEnv.__TAURI_INTERNALS__);
    if (!hasTauriObjects) return false;
    const userAgent = typeof hostEnv.navigator !== 'undefined' ? String(hostEnv.navigator.userAgent || '') : '';
    return /tauri/i.test(userAgent);
};

const resolveFastifyBase = (env) => {
    const candidates = [
        readEnv(env, '__SQUIRREL_FASTIFY_URL__'),
        readEnv(env, '__FASTIFY_BASE_URL__'),
        readEnv(env, '__serverConfig')?.serverUrl,
        readEnv(env, '__SQUIRREL_SERVER_CONFIG__')?.serverUrl
    ];
    const found = candidates
        .map((value) => String(value || '').trim().replace(/\/$/, ''))
        .find(Boolean);
    if (found) return found;
    const currentOrigin = resolveLoopbackOrigin(env);
    if (currentOrigin) return currentOrigin;
    if (isTauriRuntime(env)) return FASTIFY_FALLBACK;
    return '';
};

const resolveLocalServerBase = (env) => {
    const candidates = [
        readEnv(env, '__SQUIRREL_MAIL_SYNC_URL__'),
        readEnv(env, '__SQUIRREL_LOCAL_SERVER_URL__'),
        readEnv(env, '__ATOME_LOCAL_HTTP_BASE__')
    ];
    const found = candidates
        .map((value) => String(value || '').trim().replace(/\/$/, ''))
        .find(Boolean);
    if (found) return found;
    const forcedPort = Number(readEnv(env, '__SQUIRREL_TAURI_LOCAL_PORT__'));
    if (Number.isFinite(forcedPort) && forcedPort > 0) {
        return `http://127.0.0.1:${forcedPort}`;
    }
    const dynamicPort = Number(
        readEnv(env, 'ATOME_LOCAL_HTTP_PORT')
        || readEnv(env, '__LOCAL_HTTP_PORT')
        || readEnv(env, '__ATOME_LOCAL_HTTP_PORT__')
    );
    if (Number.isFinite(dynamicPort) && dynamicPort > 0) {
        return `http://127.0.0.1:${dynamicPort}`;
    }
    const currentOrigin = resolveLoopbackOrigin(env);
    if (currentOrigin) return currentOrigin;
    return TAURI_LOCAL_FALLBACK;
};

const resolveMailSyncBase = (env) => {
    if (isTauriRuntime(env)) {
        const localBase = resolveLocalServerBase(env);
        if (localBase) return localBase;
        // In Tauri, if no local server port is detected, try the Fastify endpoint
        // instead of silently returning an unreachable fallback.
        const fastifyBase = resolveFastifyBase(env);
        if (fastifyBase) return fastifyBase;
        return TAURI_LOCAL_FALLBACK;
    }
    return resolveFastifyBase(env);
};

const resolveFetch = (env) => {
    const host = resolveTransportHost(env);
    if (typeof env?.fetch === 'function') return env.fetch.bind(env);
    if (typeof host?.fetch === 'function') return host.fetch.bind(host);
    if (typeof globalThis?.fetch === 'function') return globalThis.fetch.bind(globalThis);
    return null;
};

const mergeMailCredentialSources = (...sources) => {
    const merged = {};
    const applyValue = (target, key, value) => {
        if (value === undefined || value === null) return;
        if (typeof value === 'string' && !value.trim()) return;
        target[key] = value;
    };
    sources.forEach((source) => {
        if (!source || typeof source !== 'object') return;
        applyValue(merged, 'provider', source.provider);
        applyValue(merged, 'email', source.email);
        applyValue(merged, 'username', source.username);
        applyValue(merged, 'password', source.password);
        applyValue(merged, 'mailbox', source.mailbox);
        if (source.imap && typeof source.imap === 'object') {
            merged.imap = merged.imap || {};
            applyValue(merged.imap, 'host', source.imap.host);
            applyValue(merged.imap, 'port', source.imap.port);
            applyValue(merged.imap, 'security', source.imap.security);
        }
        if (source.smtp && typeof source.smtp === 'object') {
            merged.smtp = merged.smtp || {};
            applyValue(merged.smtp, 'host', source.smtp.host);
            applyValue(merged.smtp, 'port', source.smtp.port);
            applyValue(merged.smtp, 'security', source.smtp.security);
        }
    });
    return Object.keys(merged).length ? merged : null;
};

const hasCompleteRuntimeMailCredentials = (source) => !!(
    source
    && typeof source === 'object'
    && String(source.email || '').trim()
    && String(source.password || '').trim()
    && String(source?.imap?.host || '').trim()
    && String(source?.smtp?.host || '').trim()
);

const loadPersistedMailPreferences = async (env) => {
    const localSettings = readPersistedRuntimeMailPreferences(env);
    if (hasCompleteRuntimeMailCredentials(localSettings)) {
        return localSettings;
    }
    const explicitLoader = env?.__eveLoadUserProfile;
    if (typeof explicitLoader === 'function') {
        try {
            const result = await explicitLoader();
            const profile = result?.profile && typeof result.profile === 'object' ? result.profile : null;
            if (!profile) return null;
            return persistRuntimeMailPreferences(env, mergeMailCredentialSources(
                profile?.preferences?.mail && typeof profile.preferences.mail === 'object' ? profile.preferences.mail : null,
                profile?.email ? { email: profile.email } : null
            ));
        } catch (_) {
            return null;
        }
    }
    return null;
};

const resolveRuntimeMailCredentials = async (env, options = {}) => {
    const prefs = env?.__eveProfilePreferences;
    let source = mergeMailCredentialSources(
        prefs?.mail && typeof prefs.mail === 'object' ? prefs.mail : null,
        readPersistedRuntimeMailPreferences(env),
        options?.credentials && typeof options.credentials === 'object' ? options.credentials : null
    );
    if (!hasCompleteRuntimeMailCredentials(source)) {
        source = mergeMailCredentialSources(
            await loadPersistedMailPreferences(env),
            source
        );
    }
    if (!source) return null;
    source = normalizeRuntimeMailPreferences(source);
    persistRuntimeMailPreferences(env, source);
    const email = String(source.email || '').trim();
    const password = String(source.password || '').trim();
    const imapHost = String(source?.imap?.host || '').trim();
    const smtpHost = String(source?.smtp?.host || '').trim();
    return {
        provider: String(source.provider || 'custom_imap_smtp').trim() || 'custom_imap_smtp',
        email,
        username: String(source.username || '').trim() || email,
        password,
        mailbox: String(source.mailbox || 'INBOX').trim() || 'INBOX',
        imap: {
            host: imapHost,
            port: Number(source?.imap?.port) || 993,
            security: String(source?.imap?.security || 'tls').trim() || 'tls'
        },
        smtp: {
            host: smtpHost,
            port: Number(source?.smtp?.port) || 587,
            security: String(source?.smtp?.security || 'starttls').trim() || 'starttls'
        }
    };
};

export {
    isNodeRuntime,
    resolveFetch,
    resolveMailSyncBase,
    resolveRuntimeMailCredentials,
    hasCompleteRuntimeMailCredentials
};
