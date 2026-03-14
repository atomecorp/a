import { createIcloudMailConnector } from './icloud_connector.js';
import { createMailService } from './service.js';

const SERVICE_KEY = '__SQUIRREL_MAIL_SERVICE__';
const API_KEY = '__SQUIRREL_MAIL_API__';

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
        send(draftId, options = {}) {
            return getOrCreateService(env).mailSend(draftId, options);
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
        syncPull(options = {}) {
            return getOrCreateService(env).syncPull(options);
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
