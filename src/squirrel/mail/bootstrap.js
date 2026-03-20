import { createIcloudMailConnector } from './icloud_connector.js';
import { createMailService } from './service.js';

const SERVICE_KEY = '__SQUIRREL_MAIL_SERVICE__';
const API_KEY = '__SQUIRREL_MAIL_API__';
const REMOTE_SYNC_TIMEOUT_MS = 12000;
const FASTIFY_FALLBACK = 'http://127.0.0.1:3001';
const TAURI_LOCAL_FALLBACK = 'http://127.0.0.1:3000';

const isNodeRuntime = (env = globalThis) => {
    if (env?.__SQUIRREL_FORCE_BROWSER_RUNTIME__ === true) return false;
    if (typeof window !== 'undefined' && env === window) return false;
    return typeof process !== 'undefined' && !!process.versions?.node;
};

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

const isTauriRuntime = (env) => {
    if (!env || typeof env !== 'object') return false;
    if (env.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (env.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = String(env.location?.protocol || '').toLowerCase();
    const host = String(env.location?.hostname || '').toLowerCase();
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:') return true;
    if (host === 'tauri.localhost') return true;
    const hasTauriInvoke = !!(env.__TAURI_INTERNALS__ && typeof env.__TAURI_INTERNALS__.invoke === 'function');
    if (hasTauriInvoke) return true;
    const hasTauriObjects = !!(env.__TAURI__ || env.__TAURI_INTERNALS__);
    if (!hasTauriObjects) return false;
    const userAgent = typeof env.navigator !== 'undefined' ? String(env.navigator.userAgent || '') : '';
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
    return TAURI_LOCAL_FALLBACK;
};

const resolveMailSyncBase = (env) => {
    if (isTauriRuntime(env)) {
        return resolveLocalServerBase(env);
    }
    return resolveFastifyBase(env);
};

const resolveFetch = (env) => {
    if (typeof env?.fetch === 'function') return env.fetch.bind(env);
    if (typeof globalThis?.fetch === 'function') return globalThis.fetch.bind(globalThis);
    return null;
};

const applyRemoteSyncPayload = (service, payload = {}, options = {}) => {
    const items = Array.isArray(payload?.items)
        ? payload.items
        : (Array.isArray(payload?.messages) ? payload.messages : []);
    if (!items.length) {
        return {
            ok: true,
            items: [],
            stats: typeof service.mailList === 'function' ? service.mailList({ limit: 1 }).stats || null : null,
            sync: service.syncStatus?.().sync || null,
            remote: payload
        };
    }
    const applied = service.syncApply(items, {
        cursor: payload?.cursor ?? payload?.sync?.cursor ?? null,
        source: {
            provider: String(payload?.provider || 'fastify_remote_mail').trim() || 'fastify_remote_mail',
            mailbox: String(payload?.mailbox || options?.mailbox || '').trim() || null,
            mode: String(payload?.mode || 'remote_sync').trim() || 'remote_sync'
        }
    });
    const listed = service.mailList({
        mailbox: options?.mailbox,
        unread_only: options?.unread_only === true,
        limit: Number.isFinite(Number(options?.limit)) ? Math.max(1, Number(options.limit)) : 20
    });
    return {
        ok: true,
        items: listed?.items || [],
        stats: listed?.stats || applied?.stats || null,
        sync: applied?.sync || null,
        remote: payload
    };
};

const syncThroughFastify = async (env, service, options = {}) => {
    const fetchImpl = resolveFetch(env);
    const baseUrl = resolveMailSyncBase(env);
    if (!fetchImpl || !baseUrl) {
        return { ok: false, error: 'mail_remote_sync_unavailable' };
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
        ? setTimeout(() => controller.abort(), REMOTE_SYNC_TIMEOUT_MS)
        : null;
    try {
        const response = await fetchImpl(`${baseUrl}/api/eve/mail/sync`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                initial: options?.initial === true,
                mailbox: options?.mailbox,
                limit: Number.isFinite(Number(options?.limit)) ? Math.max(1, Number(options.limit)) : 20
            }),
            ...(controller ? { signal: controller.signal } : {})
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) {
            return {
                ok: false,
                error: payload?.error || `mail_remote_sync_http_${response.status}`,
                message: payload?.message || null
            };
        }
        return applyRemoteSyncPayload(service, payload, options);
    } catch (error) {
        return {
            ok: false,
            error: error?.name === 'AbortError' ? 'mail_remote_sync_timeout' : 'mail_remote_sync_failed',
            message: error?.message || String(error)
        };
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

const sendThroughRemote = async (env, service, draftId, options = {}) => {
    const fetchImpl = resolveFetch(env);
    const baseUrl = resolveMailSyncBase(env);
    if (!fetchImpl || !baseUrl) {
        return { ok: false, error: 'mail_remote_send_unavailable' };
    }

    const localDraft = typeof service.mailGetDraft === 'function'
        ? service.mailGetDraft(draftId)
        : { ok: false, error: 'mail_draft_not_found' };
    if (localDraft?.ok !== true || !localDraft?.draft) {
        return {
            ok: false,
            error: localDraft?.error || 'mail_draft_not_found'
        };
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
        ? setTimeout(() => controller.abort(), REMOTE_SYNC_TIMEOUT_MS)
        : null;
    try {
        const response = await fetchImpl(`${baseUrl}/api/eve/mail/send`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                draft: localDraft.draft,
                confirmed: options?.confirmed !== false
            }),
            ...(controller ? { signal: controller.signal } : {})
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) {
            return {
                ok: false,
                error: payload?.error || `mail_remote_send_http_${response.status}`,
                message: payload?.message || null
            };
        }
        const applied = typeof service.mailApplyRemoteDelivery === 'function'
            ? service.mailApplyRemoteDelivery(draftId, payload)
            : null;
        return {
            ok: true,
            delivered: true,
            draft: applied?.draft || localDraft.draft,
            delivery: payload
        };
    } catch (error) {
        return {
            ok: false,
            error: error?.name === 'AbortError' ? 'mail_remote_send_timeout' : 'mail_remote_send_failed',
            message: error?.message || String(error)
        };
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

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
        getDraft(draftId) {
            return getOrCreateService(env).mailGetDraft(draftId);
        },
        setConnector(connector) {
            return getOrCreateService(env).setConnector(connector);
        },
        async configureIcloudConnector(options = {}) {
            const resolvedOptions = await resolveSecureAuthOptions(env, options);
            const connector = createIcloudMailConnector(resolvedOptions);
            return getOrCreateService(env).setConnector(connector);
        },
        connectorStatus() {
            return getOrCreateService(env).connectorStatus();
        },
        async send(draftId, options = {}) {
            const service = getOrCreateService(env);
            if (service.connectorStatus().configured) {
                return service.mailSend(draftId, options);
            }
            if (!isNodeRuntime(env)) {
                return sendThroughRemote(env, service, draftId, options);
            }
            return service.mailSend(draftId, options);
        },
        syncApply(messages = [], options = {}) {
            return getOrCreateService(env).syncApply(messages, options);
        },
        syncInitial(options = {}) {
            return getOrCreateService(env).syncInitial(options);
        },
        syncIncremental(options = {}) {
            return getOrCreateService(env).syncIncremental(options);
        },
        async syncPull(options = {}) {
            const service = getOrCreateService(env);
            if (service.connectorStatus().configured) {
                return service.syncPull(options);
            }
            if (!isNodeRuntime(env)) {
                return syncThroughFastify(env, service, options);
            }
            return { ok: false, error: 'mail_connector_missing' };
        },
        async ensureReady(options = {}) {
            const service = getOrCreateService(env);
            const hasIndexedMail = Array.isArray(service.mailList({ limit: 1 })?.items)
                && service.mailList({ limit: 1 }).items.length > 0;
            if (service.connectorStatus().configured) {
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
            if (!isNodeRuntime(env)) {
                const mirrored = await syncThroughFastify(env, service, options);
                if (mirrored?.ok === true) return mirrored;
                if (hasIndexedMail) {
                    return {
                        ok: true,
                        cached: true,
                        sync_error: mirrored?.error || null,
                        items: service.mailList({
                            limit: Number.isFinite(Number(options?.limit)) ? Math.max(1, Number(options.limit)) : 20
                        }).items,
                        stats: service.mailList({ limit: 1 }).stats || null
                    };
                }
                return mirrored;
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
