import {
    getOrCreateService,
    installMailGlobals,
    ensureMailConnector,
    createConfiguredMailConnector
} from './bootstrap_connector.js';
import { resolveRuntimeMailCredentials } from './bootstrap_transport.js';

const API_KEY = '__SQUIRREL_MAIL_API__';

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
