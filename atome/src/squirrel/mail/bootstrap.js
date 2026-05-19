import { createIcloudMailConnector } from './icloud_connector.js';
import { createMailService } from './service.js';
import {
    normalizeRuntimeMailPreferences,
    persistRuntimeMailPreferences,
    readPersistedRuntimeMailPreferences
} from './runtime_preferences.js';

const SERVICE_KEY = '__SQUIRREL_MAIL_SERVICE__';
const API_KEY = '__SQUIRREL_MAIL_API__';
const REMOTE_SYNC_TIMEOUT_MS = 12000;
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

const callRemoteMailEndpoint = async (env, path, {
    body = {},
    unavailableError = 'mail_remote_unavailable',
    timeoutError = 'mail_remote_timeout',
    failedError = 'mail_remote_failed'
} = {}) => {
    const fetchImpl = resolveFetch(env);
    const baseUrl = resolveMailSyncBase(env);
    if (!fetchImpl || !baseUrl) {
        return { ok: false, error: unavailableError };
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
        ? setTimeout(() => controller.abort(), REMOTE_SYNC_TIMEOUT_MS)
        : null;
    try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(body),
            ...(controller ? { signal: controller.signal } : {})
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) {
            return {
                ok: false,
                error: payload?.error || `${failedError}_http_${response.status}`,
                message: payload?.message || null
            };
        }
        return payload;
    } catch (error) {
        return {
            ok: false,
            error: error?.name === 'AbortError' ? timeoutError : failedError,
            message: error?.message || String(error)
        };
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

const buildRemoteMailCredentials = ({
    provider = 'custom_imap_smtp',
    auth = {},
    imap = {},
    smtp = {},
    mailbox = 'INBOX'
} = {}) => {
    const email = String(auth?.username || auth?.email || '').trim();
    return {
        provider: String(provider || 'custom_imap_smtp').trim() || 'custom_imap_smtp',
        email,
        username: email,
        password: String(auth?.password || '').trim(),
        mailbox: String(mailbox || 'INBOX').trim() || 'INBOX',
        imap: {
            host: String(imap?.host || '').trim(),
            port: Number(imap?.port) || 993,
            security: String(imap?.security || 'tls').trim() || 'tls'
        },
        smtp: {
            host: String(smtp?.host || '').trim(),
            port: Number(smtp?.port) || 587,
            security: String(smtp?.security || 'starttls').trim() || 'starttls'
        }
    };
};

const buildRemoteMailMessage = (request = {}) => ({
    message_id: String(request?.message_id || '').trim() || null,
    mailbox: String(request?.local_mailbox || request?.mailbox || '').trim() || null,
    source: {
        provider: String(request?.provider || 'custom_imap_smtp').trim() || 'custom_imap_smtp',
        mailbox: String(request?.local_mailbox || request?.mailbox || '').trim() || null,
        remote_mailbox: String(request?.mailbox || '').trim() || null
    },
    meta: {
        uid: String(request?.uid || '').trim() || null
    }
});

const mergeRemoteMailConnectorRequest = (baseConfig = {}, request = {}) => ({
    provider: request?.provider || baseConfig?.provider,
    auth: request?.auth && typeof request.auth === 'object'
        ? { ...(baseConfig?.auth || {}), ...request.auth }
        : { ...(baseConfig?.auth || {}) },
    imap: request?.imap && typeof request.imap === 'object'
        ? { ...(baseConfig?.imap || {}), ...request.imap }
        : { ...(baseConfig?.imap || {}) },
    smtp: request?.smtp && typeof request.smtp === 'object'
        ? { ...(baseConfig?.smtp || {}), ...request.smtp }
        : { ...(baseConfig?.smtp || {}) },
    mailbox: request?.mailbox || request?.local_mailbox || baseConfig?.mailbox || 'INBOX',
    local_mailbox: request?.local_mailbox || request?.mailbox || baseConfig?.mailbox || 'INBOX',
    uid: request?.uid,
    read: request?.read,
    destination_mailbox: request?.destination_mailbox,
    destination_local_mailbox: request?.destination_local_mailbox,
    message_id: request?.message_id
});

const createRemoteImapClientFactory = (env, baseConfig = {}) => async () => ({
    async fetchInitialMailbox(request = {}) {
        const remoteRequest = mergeRemoteMailConnectorRequest(baseConfig, request);
        return callRemoteMailEndpoint(env, '/api/eve/mail/sync', {
            body: {
                initial: true,
                mailbox: remoteRequest.local_mailbox,
                limit: Number.isFinite(Number(request?.limit)) ? Math.max(1, Number(request.limit)) : 20,
                credentials: buildRemoteMailCredentials(remoteRequest)
            },
            unavailableError: 'mail_remote_sync_unavailable',
            timeoutError: 'mail_remote_sync_timeout',
            failedError: 'mail_remote_sync_failed'
        });
    },
    async fetchDelta(request = {}) {
        const remoteRequest = mergeRemoteMailConnectorRequest(baseConfig, request);
        return callRemoteMailEndpoint(env, '/api/eve/mail/sync', {
            body: {
                initial: false,
                mailbox: remoteRequest.local_mailbox,
                limit: Number.isFinite(Number(request?.limit)) ? Math.max(1, Number(request.limit)) : 20,
                cursor: request?.cursor ?? null,
                credentials: buildRemoteMailCredentials(remoteRequest)
            },
            unavailableError: 'mail_remote_sync_unavailable',
            timeoutError: 'mail_remote_sync_timeout',
            failedError: 'mail_remote_sync_failed'
        });
    },
    async markRead(request = {}) {
        const remoteRequest = mergeRemoteMailConnectorRequest(baseConfig, request);
        return callRemoteMailEndpoint(env, '/api/eve/mail/mark-read', {
            body: {
                message: buildRemoteMailMessage(remoteRequest),
                read: request?.read !== false,
                credentials: buildRemoteMailCredentials(remoteRequest)
            },
            unavailableError: 'mail_remote_mark_read_unavailable',
            timeoutError: 'mail_remote_mark_read_timeout',
            failedError: 'mail_remote_mark_read_failed'
        });
    },
    async moveMessage(request = {}) {
        const remoteRequest = mergeRemoteMailConnectorRequest(baseConfig, request);
        const action = String(request?.destination_local_mailbox || '').trim().toLowerCase() === 'trash'
            ? 'delete'
            : 'archive';
        return callRemoteMailEndpoint(env, `/api/eve/mail/${action}`, {
            body: {
                message: buildRemoteMailMessage(remoteRequest),
                mailbox: request?.destination_local_mailbox,
                remote_mailbox: request?.destination_mailbox,
                credentials: buildRemoteMailCredentials(remoteRequest)
            },
            unavailableError: `mail_remote_${action}_unavailable`,
            timeoutError: `mail_remote_${action}_timeout`,
            failedError: `mail_remote_${action}_failed`
        });
    }
});

const createRemoteSmtpClientFactory = (env, baseConfig = {}) => async () => ({
    async sendDraft(request = {}) {
        const remoteRequest = mergeRemoteMailConnectorRequest(baseConfig, request);
        return callRemoteMailEndpoint(env, '/api/eve/mail/send', {
            body: {
                draft: request?.draft,
                confirmed: request?.confirmed !== false,
                credentials: buildRemoteMailCredentials(remoteRequest)
            },
            unavailableError: 'mail_remote_send_unavailable',
            timeoutError: 'mail_remote_send_timeout',
            failedError: 'mail_remote_send_failed'
        });
    }
});

const installMailGlobals = (env, api) => {
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.mail = api;

    env.atome = env.atome || {};
    env.atome.mail = api;
    env.atome.tools = env.atome.tools || {};
    env.atome.tools.mail = api;

    env.AtomeMail = api;
    return api;
};

const getOrCreateService = (env) => {
    if (env[SERVICE_KEY]) return env[SERVICE_KEY];
    const service = createMailService();
    env[SERVICE_KEY] = service;
    return service;
};

const resolveSecureAuthOptions = async (env, options = {}) => {
    const authRef = String(options?.auth_ref || options?.authRef || '').trim();
    if (!authRef) {
        return { ...options };
    }
    const securityApi = env?.Squirrel?.security || env?.atome?.security || env?.AtomeSecurity || null;
    if (!securityApi || typeof securityApi.readToken !== 'function') {
        throw new Error('security_token_vault_unavailable');
    }
    const stored = await securityApi.readToken(authRef);
    if (!stored || stored.ok !== true) {
        throw new Error(stored?.error || 'security_token_read_failed');
    }
    return {
        ...options,
        auth: stored.value
    };
};

const createRuntimeMailConnector = async (env, options = {}) => {
    const runtimeCredentials = await resolveRuntimeMailCredentials(env, options);
    if (!hasCompleteRuntimeMailCredentials(runtimeCredentials)) {
        return null;
    }
    const connectorOptions = {
        provider: runtimeCredentials.provider,
        auth: {
            username: runtimeCredentials.username || runtimeCredentials.email,
            password: runtimeCredentials.password
        },
        imap: runtimeCredentials.imap,
        smtp: runtimeCredentials.smtp,
        mailbox: runtimeCredentials.mailbox
    };
    if (!isNodeRuntime(env)) {
        connectorOptions.imapClientFactory = createRemoteImapClientFactory(env, connectorOptions);
        connectorOptions.smtpClientFactory = createRemoteSmtpClientFactory(env, connectorOptions);
    }
    return createIcloudMailConnector(connectorOptions);
};

const createConfiguredMailConnector = async (env, options = {}) => {
    const resolvedOptions = await resolveSecureAuthOptions(env, options);
    const connectorOptions = {
        provider: resolvedOptions.provider,
        auth: resolvedOptions.auth,
        imap: resolvedOptions.imap,
        smtp: resolvedOptions.smtp,
        mailbox: resolvedOptions.mailbox
    };
    if (typeof resolvedOptions.imapClientFactory === 'function') {
        connectorOptions.imapClientFactory = resolvedOptions.imapClientFactory;
    } else if (!isNodeRuntime(env)) {
        connectorOptions.imapClientFactory = createRemoteImapClientFactory(env, connectorOptions);
    }
    if (typeof resolvedOptions.smtpClientFactory === 'function') {
        connectorOptions.smtpClientFactory = resolvedOptions.smtpClientFactory;
    } else if (!isNodeRuntime(env)) {
        connectorOptions.smtpClientFactory = createRemoteSmtpClientFactory(env, connectorOptions);
    }
    return createIcloudMailConnector(connectorOptions);
};

const ensureMailConnector = async (env, options = {}) => {
    const service = getOrCreateService(env);
    if (service.connectorStatus().configured) {
        return service.getConnector();
    }
    const connector = await createRuntimeMailConnector(env, options);
    if (!connector) {
        return null;
    }
    service.setConnector(connector);
    return connector;
};

export const createGlobalMailApi = ({
    env = globalThis
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global mail bootstrap requires an object-like environment');
    }
    if (env[API_KEY]) return env[API_KEY];

    const api = {
        get service() {
            return getOrCreateService(env);
        },
        ingest(messages = []) {
            return getOrCreateService(env).ingest(messages);
        },
        list(options = {}) {
            return getOrCreateService(env).mailList(options);
        },
        read(messageId) {
            return getOrCreateService(env).mailRead(messageId);
        },
        async markRead(messageId, options = {}) {
            const service = getOrCreateService(env);
            await ensureMailConnector(env, options);
            return service.mailMarkRead(messageId, options);
        },
        async markUnread(messageId, options = {}) {
            return this.markRead(messageId, {
                ...options,
                read: false
            });
        },
        search(query, options = {}) {
            return getOrCreateService(env).mailSearch(query, options);
        },
        nextUnread(options = {}) {
            return getOrCreateService(env).mailNextUnread(options);
        },
        summarize(options = {}) {
            return getOrCreateService(env).mailSummarize(options);
        },
        replyDraft(messageId, options = {}) {
            return getOrCreateService(env).mailReplyDraft(messageId, options);
        },
        composeDraft(options = {}) {
            return getOrCreateService(env).mailComposeDraft(options);
        },
        getDraft(draftId) {
            return getOrCreateService(env).mailGetDraft(draftId);
        },
        setConnector(connector) {
            return getOrCreateService(env).setConnector(connector);
        },
        async configureIcloudConnector(options = {}) {
            const connector = await createConfiguredMailConnector(env, options);
            return getOrCreateService(env).setConnector(connector);
        },
        connectorStatus() {
            return getOrCreateService(env).connectorStatus();
        },
        async archive(messageId, options = {}) {
            const service = getOrCreateService(env);
            await ensureMailConnector(env, options);
            return service.mailArchive(messageId, options);
        },
        async delete(messageId, options = {}) {
            const service = getOrCreateService(env);
            await ensureMailConnector(env, options);
            return service.mailDelete(messageId, options);
        },
        async send(draftId, options = {}) {
            const service = getOrCreateService(env);
            await ensureMailConnector(env, options);
            return service.mailSend(draftId, options);
        },
        syncApply(messages = [], options = {}) {
            return getOrCreateService(env).syncApply(messages, options);
        },
        async syncInitial(options = {}) {
            const service = getOrCreateService(env);
            await ensureMailConnector(env, options);
            return service.syncInitial(options);
        },
        async syncIncremental(options = {}) {
            const service = getOrCreateService(env);
            await ensureMailConnector(env, options);
            return service.syncIncremental(options);
        },
        async syncPull(options = {}) {
            const service = getOrCreateService(env);
            const connector = await ensureMailConnector(env, options);
            if (connector) {
                return service.syncPull(options);
            }
            return { ok: false, error: 'mail_connector_missing' };
        },
        async ensureReady(options = {}) {
            const service = getOrCreateService(env);
            const hasIndexedMail = Array.isArray(service.mailList({ limit: 1 })?.items)
                && service.mailList({ limit: 1 }).items.length > 0;

            // Pre-check credentials and produce an explicit diagnostic if missing.
            const creds = await resolveRuntimeMailCredentials(env, options);
            const missingFields = [];
            if (!creds || !String(creds.email || '').trim()) missingFields.push('email');
            if (!creds || !String(creds.password || '').trim()) missingFields.push('password');
            if (!creds || !String(creds.imap?.host || '').trim()) missingFields.push('imap_host');
            if (!creds || !String(creds.smtp?.host || '').trim()) missingFields.push('smtp_host');

            if (missingFields.length > 0 && !hasIndexedMail) {
                return {
                    ok: false,
                    error: 'mail_credentials_missing',
                    message: `Missing mail settings: ${missingFields.join(', ')}`,
                    missing_fields: missingFields
                };
            }

            const connector = await ensureMailConnector(env, options);
            if (connector) {
                const syncResult = await service.syncPull(options);
                if (syncResult?.ok === true) return syncResult;
                if (hasIndexedMail) {
                    return {
                        ok: true,
                        cached: true,
                        sync_error: syncResult?.error || null,
                        items: service.mailList({
                            limit: Number.isFinite(Number(options?.limit)) ? Math.max(1, Number(options.limit)) : 20
                        }).items,
                        stats: service.mailList({ limit: 1 }).stats || null
                    };
                }
                return syncResult;
            }
            if (hasIndexedMail) {
                return {
                    ok: true,
                    cached: true,
                    items: service.mailList({
                        limit: Number.isFinite(Number(options?.limit)) ? Math.max(1, Number(options.limit)) : 20
                    }).items,
                    stats: service.mailList({ limit: 1 }).stats || null
                };
            }
            return { ok: false, error: 'mail_connector_missing' };
        },
        syncStatus() {
            return getOrCreateService(env).syncStatus();
        },
        buildReadout(messageId, options = {}) {
            return getOrCreateService(env).mailBuildReadout(messageId, options);
        },
        async voiceReadout(messageId, options = {}) {
            const result = getOrCreateService(env).mailBuildReadout(messageId, options);
            if (result?.ok !== true) return result;
            const voiceApi = options.voiceApi
                || env?.Squirrel?.voice
                || env?.AtomeVoice
                || env?.atome?.voice
                || null;
            if (!voiceApi || typeof voiceApi.speak !== 'function') {
                return {
                    ok: true,
                    spoken: false,
                    text: result.text,
                    item: result.item
                };
            }
            const spoken = await voiceApi.speak(result.text, {
                session_id: options.session_id,
                voiceId: options.voiceId
            });
            return {
                ok: true,
                spoken: true,
                text: result.text,
                item: result.item,
                result: spoken
            };
        }
    };

    env[API_KEY] = installMailGlobals(env, api);
    return env[API_KEY];
};

export const bootstrapGlobalMail = ({
    env = (typeof window !== 'undefined' ? window : globalThis)
} = {}) => createGlobalMailApi({ env });

if (typeof window !== 'undefined') {
    bootstrapGlobalMail({ env: window });
}
