import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createIcloudMailConnector } from '../atome/src/squirrel/mail/icloud_connector.js';
import { createMailService } from '../atome/src/squirrel/mail/service.js';
import { resolveMailCredentials } from '../scripts/icloud_live_credentials.mjs';
import { publicDavAddress as publicAddress } from './ws_personal_import.js';
import { resolveUserId } from './server_utils.js';

const DEFAULT_LIMIT = 20;
// The standard mail ports: IMAP (TLS, STARTTLS) and SMTP (TLS, submission, relay).
const MAIL_PORTS = Object.freeze({ imap: [993, 143], smtp: [465, 587, 25] });

// The server only connects to a mail server named by a DNS name, on a mail port, whose every address is public:
// the credentials come from the caller, so an IP literal, a private or loopback address, or another port would
// let any caller make this server reach its own network (SSRF).
export const checkMailHosts = async (credentials, { resolve = lookup } = {}) => {
    for (const protocol of ['imap', 'smtp']) {
        const host = String(credentials?.[protocol]?.host || '').trim().toLowerCase();
        const port = Number(credentials?.[protocol]?.port);
        if (!host || isIP(host) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) throw new Error(`mail_${protocol}_host_invalid`);
        if (!MAIL_PORTS[protocol].includes(port)) throw new Error(`mail_${protocol}_port_not_allowed`);
        const addresses = await resolve(host, { all: true });
        if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) throw new Error(`mail_${protocol}_address_not_public`);
    }
};

const toLimit = (value, secondary = DEFAULT_LIMIT) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : secondary;
};

export const createMailGateway = ({
    resolveCredentials = resolveMailCredentials,
    connectorFactory = createIcloudMailConnector,
    serviceFactory = createMailService,
    resolveMailbox = (credentials = null) => credentials?.mailbox || 'INBOX',
    checkHosts = checkMailHosts
} = {}) => {
    let cachedRuntime = null;

    // `userId`: the verified caller. The open connection is reused only by the same person with the same
    // credentials, the password included (hashed): never by another caller naming the same address.
    const getRuntime = async (options = {}, userId) => {
        if (!userId) throw new Error('mail_auth_required');
        const credentials = resolveCredentials(options?.credentials || null);
        await checkHosts(credentials);
        const mailbox = String(options?.mailbox || resolveMailbox(credentials) || 'INBOX').trim() || 'INBOX';
        const cacheKey = JSON.stringify({
            user: userId,
            secret: createHash('sha256').update(String(credentials?.password || credentials?.appPassword || '')).digest('hex'),
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
        async sync(options = {}, userId = null) {
            try {
                const { service, connector, credentials, mailbox } = await getRuntime(options, userId);
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
        async send(options = {}, userId = null) {
            try {
                const { connector, credentials } = await getRuntime(options, userId);
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
        async markRead(options = {}, userId = null) {
            try {
                const { connector, credentials } = await getRuntime(options, userId);
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
        async archive(options = {}, userId = null) {
            try {
                const { connector, credentials } = await getRuntime(options, userId);
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
        async delete(options = {}, userId = null) {
            try {
                const { connector, credentials } = await getRuntime(options, userId);
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

// `identify(request)`: the verified device session of the caller (server.js `validateToken`), or null.
export const registerMailRoutes = (server, {
    gateway = createMailGateway(),
    identify
} = {}) => {
    if (typeof identify !== 'function') throw new Error('mail_routes_identity_required');
    const route = (path, action) => server.post(path, async (request, reply) => {
        const user = await identify(request);
        const userId = user ? resolveUserId(user) : null;
        if (!userId) {
            reply.code(401);
            return { ok: false, error: 'mail_auth_required' };
        }
        const result = await gateway[action](request.body || {}, userId);
        if (result?.ok === true) {
            return result;
        }
        reply.code(503);
        return result;
    });
    route('/api/eve/mail/sync', 'sync');
    route('/api/eve/mail/send', 'send');
    route('/api/eve/mail/mark-read', 'markRead');
    route('/api/eve/mail/archive', 'archive');
    route('/api/eve/mail/delete', 'delete');
};
