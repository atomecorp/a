import { createIcloudMailConnector } from './icloud_connector.js';
import { createMailService } from './service.js';
import {
    isNodeRuntime,
    resolveFetch,
    resolveMailSyncBase,
    resolveRuntimeMailCredentials,
    hasCompleteRuntimeMailCredentials
} from './bootstrap_transport.js';

const SERVICE_KEY = '__SQUIRREL_MAIL_SERVICE__';
const REMOTE_SYNC_TIMEOUT_MS = 12000;

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

export {
    getOrCreateService,
    installMailGlobals,
    ensureMailConnector,
    createConfiguredMailConnector
};
