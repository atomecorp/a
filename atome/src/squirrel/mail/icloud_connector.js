import {
    MAIL_V1_ARCHITECTURE_DECISION,
    createMailConnectorContract
} from './connector_contract.js';
import {
    DEFAULT_LOCAL_ARCHIVE_MAILBOX,
    DEFAULT_LOCAL_TRASH_MAILBOX,
    DEFAULT_REMOTE_ARCHIVE_MAILBOX,
    DEFAULT_REMOTE_MAILBOX,
    DEFAULT_REMOTE_TRASH_MAILBOX,
    normalizeConnectorMessage,
    normalizeIcloudMailConnectorConfig,
    normalizeLocalMailbox,
    normalizeReadPayload,
    normalizeRemoteMailbox,
    normalizeText,
    resolveRemoteDestinationMailbox,
    toFiniteNumber
} from './icloud_connector_normalization.js';

const isNodeRuntime = () => typeof process !== 'undefined' && !!process.versions?.node;

const createFactoryError = (code, message, extra = {}) => ({
    ok: false,
    error: code,
    message,
    ...extra
});

const withProtocolClient = async ({
    role,
    factory,
    config
} = {}, callback) => {
    if (typeof factory !== 'function') {
        throw new Error(`${role}_client_factory_missing`);
    }
    const client = await factory(config);
    if (!client || typeof client !== 'object') {
        throw new Error(`${role}_client_missing`);
    }
    try {
        if (typeof client.connect === 'function') {
            await client.connect();
        }
        return await callback(client);
    } finally {
        if (typeof client.close === 'function') {
            await client.close();
        }
    }
};

const callFirstAvailable = async (client, methodNames = [], payload = {}) => {
    for (const methodName of methodNames) {
        if (typeof client?.[methodName] === 'function') {
            return client[methodName](payload);
        }
    }
    throw new Error(`missing_client_method:${methodNames.join(',')}`);
};

let nodeFactoriesPromise = null;

const getNodeProtocolFactories = async () => {
    if (!isNodeRuntime()) return null;
    if (!nodeFactoriesPromise) {
        nodeFactoriesPromise = import('./node_protocol_clients.js');
    }
    return nodeFactoriesPromise;
};

export const createIcloudMailConnector = ({
    provider = MAIL_V1_ARCHITECTURE_DECISION.provider,
    auth = {},
    imap = {},
    smtp = {},
    mailbox = DEFAULT_REMOTE_MAILBOX,
    imapClientFactory = null,
    smtpClientFactory = null,
    now = () => Date.now()
} = {}) => {
    const config = normalizeIcloudMailConnectorConfig({
        provider,
        auth,
        imap,
        smtp,
        mailbox
    });
    const contract = createMailConnectorContract({
        provider: config.provider
    });
    const resolveImapClientFactory = async () => {
        if (typeof imapClientFactory === 'function') return imapClientFactory;
        const nodeFactories = await getNodeProtocolFactories();
        return nodeFactories?.createNodeIcloudImapClient || null;
    };
    const resolveSmtpClientFactory = async () => {
        if (typeof smtpClientFactory === 'function') return smtpClientFactory;
        const nodeFactories = await getNodeProtocolFactories();
        return nodeFactories?.createNodeIcloudSmtpClient || null;
    };

    const createImapRequest = (options = {}, mode = 'initial') => ({
        provider: config.provider,
        mailbox: normalizeRemoteMailbox(options.mailbox || config.mailbox),
        local_mailbox: normalizeLocalMailbox(options.mailbox || config.mailbox),
        limit: toFiniteNumber(options.limit, 50),
        cursor: normalizeText(options.cursor) || null,
        since: options.since || null,
        auth: { ...config.auth },
        imap: { ...config.imap },
        mode
    });

    return {
        provider: config.provider,
        contract,
        config,
        async fetchInitialMailbox(options = {}) {
            const request = createImapRequest(options, 'initial');
            try {
                const payload = await withProtocolClient({
                    role: 'icloud_imap',
                    factory: await resolveImapClientFactory(),
                    config: request
                }, async (client) => callFirstAvailable(client, [
                    'fetchInitialMailbox',
                    'fetchInitial',
                    'listMessages'
                ], request));
                return normalizeReadPayload(payload, {
                    provider: config.provider,
                    mailbox: request.local_mailbox,
                    mode: 'initial'
                });
            } catch (error) {
                return createFactoryError(
                    'icloud_imap_initial_failed',
                    error?.message || 'Unable to fetch the initial mailbox snapshot',
                    {
                        provider: config.provider,
                        mailbox: request.local_mailbox
                    }
                );
            }
        },
        async fetchDelta(options = {}) {
            const request = createImapRequest(options, 'delta');
            try {
                const payload = await withProtocolClient({
                    role: 'icloud_imap',
                    factory: await resolveImapClientFactory(),
                    config: request
                }, async (client) => callFirstAvailable(client, [
                    'fetchDelta',
                    'fetchChanges',
                    'listMessages'
                ], request));
                return normalizeReadPayload(payload, {
                    provider: config.provider,
                    mailbox: request.local_mailbox,
                    mode: 'delta'
                });
            } catch (error) {
                return createFactoryError(
                    'icloud_imap_delta_failed',
                    error?.message || 'Unable to fetch the incremental mailbox delta',
                    {
                        provider: config.provider,
                        mailbox: request.local_mailbox,
                        cursor: request.cursor
                    }
                );
            }
        },
        async sendDraft(draft = {}, options = {}) {
            if (!draft || typeof draft !== 'object') {
                return createFactoryError('icloud_smtp_invalid_draft', 'A draft object is required for SMTP send');
            }
            const request = {
                provider: config.provider,
                auth: { ...config.auth },
                smtp: { ...config.smtp },
                draft: { ...draft },
                requested_at: now(),
                confirmed: options.confirmed !== false
            };
            try {
                const payload = await withProtocolClient({
                    role: 'icloud_smtp',
                    factory: await resolveSmtpClientFactory(),
                    config: request
                }, async (client) => callFirstAvailable(client, [
                    'sendDraft',
                    'sendMessage',
                    'send'
                ], request));
                const remoteId = normalizeText(
                    payload?.message_id
                    || payload?.messageId
                    || payload?.remote_id
                    || payload?.remoteId
                    || payload?.id
                ) || null;
                return {
                    ok: true,
                    provider: config.provider,
                    sent: true,
                    draft_id: normalizeText(draft.draft_id) || null,
                    remote_id: remoteId,
                    message_id: remoteId,
                    accepted_at: toFiniteNumber(payload?.accepted_at, now()),
                    response: payload && typeof payload === 'object' ? { ...payload } : payload
                };
            } catch (error) {
                return createFactoryError(
                    'icloud_smtp_send_failed',
                    error?.message || 'Unable to deliver the draft through SMTP',
                    {
                        provider: config.provider,
                        draft_id: normalizeText(draft.draft_id) || null
                    }
                );
            }
        },
        async markRead(message = {}, options = {}) {
            const uid = normalizeText(message?.meta?.uid || message?.uid || '');
            const remoteMailbox = normalizeRemoteMailbox(
                message?.source?.remote_mailbox
                || message?.source?.mailbox
                || message?.mailbox
                || config.mailbox
            );
            const request = {
                provider: config.provider,
                mailbox: remoteMailbox,
                local_mailbox: normalizeLocalMailbox(message?.mailbox || config.mailbox),
                uid,
                auth: { ...config.auth },
                imap: { ...config.imap },
                read: options?.read !== false
            };
            try {
                const payload = await withProtocolClient({
                    role: 'icloud_imap',
                    factory: await resolveImapClientFactory(),
                    config: request
                }, async (client) => callFirstAvailable(client, [
                    'markRead'
                ], request));
                return {
                    ok: true,
                    provider: config.provider,
                    uid,
                    response: payload && typeof payload === 'object' ? { ...payload } : payload
                };
            } catch (error) {
                return createFactoryError(
                    'icloud_imap_mark_read_failed',
                    error?.message || 'Unable to mark the message as read',
                    {
                        provider: config.provider,
                        uid
                    }
                );
            }
        },
        async moveMessage(message = {}, options = {}) {
            const uid = normalizeText(message?.meta?.uid || message?.uid || '');
            const remoteMailbox = normalizeRemoteMailbox(
                message?.source?.remote_mailbox
                || message?.source?.mailbox
                || message?.mailbox
                || config.mailbox
            );
            const destinationLocalMailbox = normalizeLocalMailbox(
                options?.destination_local_mailbox
                || options?.destinationMailbox
                || options?.destination_mailbox
                || DEFAULT_LOCAL_ARCHIVE_MAILBOX
            );
            const destinationRemoteMailbox = normalizeText(
                options?.destination_remote_mailbox
                || options?.remote_destination_mailbox
                || resolveRemoteDestinationMailbox(destinationLocalMailbox)
            ) || DEFAULT_REMOTE_ARCHIVE_MAILBOX;
            const request = {
                provider: config.provider,
                mailbox: remoteMailbox,
                local_mailbox: normalizeLocalMailbox(message?.mailbox || config.mailbox),
                destination_mailbox: destinationRemoteMailbox,
                destination_local_mailbox: destinationLocalMailbox,
                uid,
                auth: { ...config.auth },
                imap: { ...config.imap }
            };
            try {
                const payload = await withProtocolClient({
                    role: 'icloud_imap',
                    factory: await resolveImapClientFactory(),
                    config: request
                }, async (client) => callFirstAvailable(client, [
                    'moveMessage'
                ], request));
                const resolvedRemoteDestinationMailbox = normalizeText(
                    payload?.destination_remote_mailbox
                    || payload?.destinationRemoteMailbox
                    || destinationRemoteMailbox
                ) || destinationRemoteMailbox;
                return {
                    ok: true,
                    provider: config.provider,
                    uid,
                    mailbox: request.local_mailbox,
                    destination_mailbox: destinationLocalMailbox,
                    destination_remote_mailbox: resolvedRemoteDestinationMailbox,
                    response: payload && typeof payload === 'object' ? { ...payload } : payload
                };
            } catch (error) {
                return createFactoryError(
                    'icloud_imap_move_failed',
                    error?.message || 'Unable to move the message',
                    {
                        provider: config.provider,
                        uid,
                        mailbox: request.local_mailbox,
                        destination_mailbox: destinationLocalMailbox
                    }
                );
            }
        },
        async archiveMessage(message = {}, options = {}) {
            return this.moveMessage(message, {
                ...options,
                destination_local_mailbox: DEFAULT_LOCAL_ARCHIVE_MAILBOX,
                destination_remote_mailbox: DEFAULT_REMOTE_ARCHIVE_MAILBOX
            });
        },
        async deleteMessage(message = {}, options = {}) {
            return this.moveMessage(message, {
                ...options,
                destination_local_mailbox: DEFAULT_LOCAL_TRASH_MAILBOX,
                destination_remote_mailbox: DEFAULT_REMOTE_TRASH_MAILBOX
            });
        }
    };
};

export { normalizeConnectorMessage as normalizeIcloudMailRecord };
export { normalizeIcloudMailConnectorConfig };
