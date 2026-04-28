import { createIcloudMailConnector } from '../src/squirrel/mail/icloud_connector.js';
import { createMailService } from '../src/squirrel/mail/service.js';
import { resolveMailCredentials } from '../scripts/icloud_live_credentials.mjs';

const DEFAULT_LIMIT = 20;

const toLimit = (value, secondary = DEFAULT_LIMIT) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : secondary;
};

export const createMailGateway = ({
    resolveCredentials = resolveMailCredentials,
    connectorFactory = createIcloudMailConnector,
    serviceFactory = createMailService,
    resolveMailbox = (credentials = null) => credentials?.mailbox || 'INBOX'
} = {}) => {
    let cachedRuntime = null;

    const getRuntime = async (options = {}) => {
        const credentials = resolveCredentials(options?.credentials || null);
        const mailbox = String(options?.mailbox || resolveMailbox(credentials) || 'INBOX').trim() || 'INBOX';
        const cacheKey = JSON.stringify({
            provider: credentials?.provider || '',
            email: credentials?.email || '',
            username: credentials?.username || '',
            imap_host: credentials?.imap?.host || '',
            smtp_host: credentials?.smtp?.host || '',
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
                const { service, connector, credentials, mailbox } = await getRuntime(options);
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
                const { connector, credentials } = await getRuntime(options);
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
        },
        async markRead(options = {}) {
            try {
                const { connector, credentials } = await getRuntime(options);
                const message = options?.message && typeof options.message === 'object' ? options.message : null;
                if (!message) {
                    return {
                        ok: false,
                        error: 'mail_message_missing',
                        message: 'A message payload is required.'
                    };
                }
                const result = typeof connector?.markRead === 'function'
                    ? await connector.markRead(message, {
                        read: options?.read !== false
                    })
                    : { ok: false, error: 'mail_mark_read_not_supported' };
                if (result?.ok !== true) {
                    return {
                        ok: false,
                        error: result?.error || 'mail_mark_read_failed',
                        message: result?.message || null
                    };
                }
                return {
                    ok: true,
                    read: options?.read !== false,
                    provider: connector?.provider || credentials?.provider || 'remote_imap_smtp',
                    email: credentials?.email || null,
                    message_id: message?.message_id || null,
                    uid: message?.meta?.uid || null
                };
            } catch (error) {
                return {
                    ok: false,
                    error: error?.message || 'mail_gateway_unavailable',
                    message: error?.message || String(error)
                };
            }
        },
        async archive(options = {}) {
            try {
                const { connector, credentials } = await getRuntime(options);
                const message = options?.message && typeof options.message === 'object' ? options.message : null;
                if (!message) {
                    return {
                        ok: false,
                        error: 'mail_message_missing',
                        message: 'A message payload is required.'
                    };
                }
                const result = typeof connector?.archiveMessage === 'function'
                    ? await connector.archiveMessage(message, {
                        remote_mailbox: options?.remote_mailbox || 'Archive'
                    })
                    : (typeof connector?.moveMessage === 'function'
                        ? await connector.moveMessage(message, {
                            destination_local_mailbox: 'archive',
                            destination_remote_mailbox: options?.remote_mailbox || 'Archive'
                        })
                        : { ok: false, error: 'mail_archive_not_supported' });
                if (result?.ok !== true) {
                    return {
                        ok: false,
                        error: result?.error || 'mail_archive_failed',
                        message: result?.message || null
                    };
                }
                return {
                    ok: true,
                    archived: true,
                    provider: connector?.provider || credentials?.provider || 'remote_imap_smtp',
                    email: credentials?.email || null,
                    message_id: message?.message_id || null,
                    uid: message?.meta?.uid || null
                };
            } catch (error) {
                return {
                    ok: false,
                    error: error?.message || 'mail_gateway_unavailable',
                    message: error?.message || String(error)
                };
            }
        },
        async delete(options = {}) {
            try {
                const { connector, credentials } = await getRuntime(options);
                const message = options?.message && typeof options.message === 'object' ? options.message : null;
                if (!message) {
                    return {
                        ok: false,
                        error: 'mail_message_missing',
                        message: 'A message payload is required.'
                    };
                }
                const result = typeof connector?.deleteMessage === 'function'
                    ? await connector.deleteMessage(message, {
                        remote_mailbox: options?.remote_mailbox || 'Trash'
                    })
                    : (typeof connector?.moveMessage === 'function'
                        ? await connector.moveMessage(message, {
                            destination_local_mailbox: 'trash',
                            destination_remote_mailbox: options?.remote_mailbox || 'Trash'
                        })
                        : { ok: false, error: 'mail_delete_not_supported' });
                if (result?.ok !== true) {
                    return {
                        ok: false,
                        error: result?.error || 'mail_delete_failed',
                        message: result?.message || null
                    };
                }
                return {
                    ok: true,
                    deleted: true,
                    provider: connector?.provider || credentials?.provider || 'remote_imap_smtp',
                    email: credentials?.email || null,
                    message_id: message?.message_id || null,
                    uid: message?.meta?.uid || null
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
    server.post('/api/eve/mail/mark-read', async (request, reply) => {
        const result = await gateway.markRead(request.body || {});
        if (result?.ok === true) {
            return result;
        }
        reply.code(503);
        return result;
    });
    server.post('/api/eve/mail/archive', async (request, reply) => {
        const result = await gateway.archive(request.body || {});
        if (result?.ok === true) {
            return result;
        }
        reply.code(503);
        return result;
    });
    server.post('/api/eve/mail/delete', async (request, reply) => {
        const result = await gateway.delete(request.body || {});
        if (result?.ok === true) {
            return result;
        }
        reply.code(503);
        return result;
    });
};
