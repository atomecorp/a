import { createIcloudMailConnector } from '../src/squirrel/mail/icloud_connector.js';
import { createMailService } from '../src/squirrel/mail/service.js';
import { readEnv, resolveMailCredentials } from '../tools/icloud_live_credentials.mjs';

const DEFAULT_LIMIT = 20;

const toLimit = (value, fallback = DEFAULT_LIMIT) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : fallback;
};

export const createMailGateway = ({
    resolveCredentials = resolveMailCredentials,
    connectorFactory = createIcloudMailConnector,
    serviceFactory = createMailService,
    resolveMailbox = () => readEnv('MAIL_MAILBOX', 'MAILBOX', 'ICLOUD_MAILBOX') || 'INBOX'
} = {}) => {
    let cachedRuntime = null;

    const getRuntime = async () => {
        const credentials = resolveCredentials();
        const mailbox = String(resolveMailbox() || 'INBOX').trim() || 'INBOX';
        const cacheKey = JSON.stringify({
            email: credentials?.email || '',
            mailbox
        });
        if (cachedRuntime?.key === cacheKey) {
            return cachedRuntime.runtime;
        }
        const connector = connectorFactory({
            provider: credentials.provider,
            auth: {
                email: credentials.email,
                username: credentials.username || credentials.email,
                password: credentials.password || credentials.appPassword,
                appPassword: credentials.password || credentials.appPassword
            },
            imap: credentials.imap || {},
            smtp: credentials.smtp || {},
            mailbox
        });
        const service = serviceFactory();
        service.setConnector(connector);
        cachedRuntime = {
            key: cacheKey,
            runtime: {
                service,
                connector,
                credentials,
                mailbox
            }
        };
        return cachedRuntime.runtime;
    };

    return {
        async sync(options = {}) {
            try {
                const { service, connector, credentials, mailbox } = await getRuntime();
                const syncStatus = service.syncStatus?.().sync || null;
                const shouldRunInitial = options?.initial === true || !String(syncStatus?.cursor || '').trim();
                const syncResult = shouldRunInitial
                    ? await service.syncInitial({
                        mailbox,
                        limit: toLimit(options?.limit)
                    })
                    : await service.syncPull({
                        mailbox,
                        limit: toLimit(options?.limit)
                    });
                if (syncResult?.ok !== true) {
                    return {
                        ok: false,
                        error: syncResult?.error || 'mail_sync_failed',
                        message: syncResult?.message || null
                    };
                }
                const listed = service.mailList({
                    mailbox: String(options?.mailbox || '').trim().toLowerCase() || null,
                    unread_only: options?.unread_only === true,
                    limit: toLimit(options?.limit)
                });
                return {
                    ok: true,
                    provider: connector?.provider || credentials?.provider || 'remote_imap_smtp',
                    mailbox: String(options?.mailbox || 'inbox').trim().toLowerCase() || 'inbox',
                    mode: shouldRunInitial ? 'initial' : 'delta',
                    cursor: service.syncStatus?.().sync?.cursor || null,
                    items: listed?.items || [],
                    stats: listed?.stats || null,
                    email: credentials?.email || null
                };
            } catch (error) {
                return {
                    ok: false,
                    error: error?.message || 'mail_gateway_unavailable',
                    message: error?.message || String(error)
                };
            }
        },
        async send(options = {}) {
            try {
                const { connector, credentials } = await getRuntime();
                const draft = options?.draft && typeof options.draft === 'object' ? options.draft : null;
                if (!draft) {
                    return {
                        ok: false,
                        error: 'mail_draft_missing',
                        message: 'A draft payload is required.'
                    };
                }
                const delivery = await connector.sendDraft(draft, {
                    confirmed: options?.confirmed !== false
                });
                if (delivery?.ok !== true) {
                    return {
                        ok: false,
                        error: delivery?.error || 'mail_send_failed',
                        message: delivery?.message || null
                    };
                }
                return {
                    ok: true,
                    sent: true,
                    provider: connector?.provider || credentials?.provider || 'remote_imap_smtp',
                    email: credentials?.email || null,
                    draft_id: draft?.draft_id || null,
                    remote_id: delivery?.remote_id || delivery?.message_id || null,
                    message_id: delivery?.message_id || delivery?.remote_id || null,
                    accepted_at: delivery?.accepted_at || Date.now()
                };
            } catch (error) {
                return {
                    ok: false,
                    error: error?.message || 'mail_gateway_unavailable',
                    message: error?.message || String(error)
                };
            }
        }
    };
};

export const registerMailRoutes = (server, {
    gateway = createMailGateway()
} = {}) => {
    server.post('/api/eve/mail/sync', async (request, reply) => {
        const result = await gateway.sync(request.body || {});
        if (result?.ok === true) {
            return result;
        }
        reply.code(503);
        return result;
    });
    server.post('/api/eve/mail/send', async (request, reply) => {
        const result = await gateway.send(request.body || {});
        if (result?.ok === true) {
            return result;
        }
        reply.code(503);
        return result;
    });
};
