import {
    MAIL_V1_ARCHITECTURE_DECISION,
    createMailConnectorContract
} from './connector_contract.js';

const DEFAULT_REMOTE_MAILBOX = 'INBOX';
const DEFAULT_LOCAL_MAILBOX = 'inbox';
const DEFAULT_REMOTE_ARCHIVE_MAILBOX = 'Archive';
const DEFAULT_REMOTE_TRASH_MAILBOX = 'Trash';
const DEFAULT_LOCAL_ARCHIVE_MAILBOX = 'archive';
const DEFAULT_LOCAL_TRASH_MAILBOX = 'trash';

const normalizeText = (value) => String(value || '').trim();

const normalizeRemoteMailbox = (value) => normalizeText(value).toUpperCase() || DEFAULT_REMOTE_MAILBOX;
const normalizeLocalMailbox = (value) => normalizeText(value).toLowerCase() || DEFAULT_LOCAL_MAILBOX;
const isNodeRuntime = () => typeof process !== 'undefined' && !!process.versions?.node;

const toFiniteNumber = (value, fallback = null) => {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const toTimestamp = (value, fallback = 0) => {
    const direct = toFiniteNumber(value, null);
    if (direct != null) return direct;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeEmailAddress = (value) => {
    if (!value) return null;
    if (Array.isArray(value)) {
        return normalizeEmailAddress(value[0]);
    }
    if (typeof value === 'string') {
        const address = normalizeText(value);
        if (!address) return null;
        return { name: null, address };
    }
    const address = normalizeText(value.address || value.email || '');
    if (!address && value.mailbox && value.host) {
        return {
            name: normalizeText(value.name) || null,
            address: `${String(value.mailbox)}@${String(value.host)}`
        };
    }
    if (!address) return null;
    return {
        name: normalizeText(value.name || value.displayName || '') || null,
        address
    };
};

const normalizeEmailList = (value) => {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list.map((entry) => normalizeEmailAddress(entry)).filter(Boolean);
};

const getMessageId = (record = {}, mailbox = DEFAULT_LOCAL_MAILBOX) => {
    const direct = normalizeText(
        record.message_id
        || record.messageId
        || record.id
        || record?.envelope?.messageId
        || record?.headers?.['message-id']
        || record?.headers?.messageId
        || record.uid
    );
    if (direct) return direct;
    const fallbackUid = normalizeText(record.uid || record.seq || record.sequence);
    if (!fallbackUid) {
        throw new Error('icloud connector record is missing both message id and uid');
    }
    return `icloud:${mailbox}:${fallbackUid}`;
};

const getThreadId = (record = {}, messageId) => {
    const reference = Array.isArray(record.references) ? record.references[0] : null;
    const envelopeReference = Array.isArray(record?.envelope?.references) ? record.envelope.references[0] : null;
    return normalizeText(
        record.thread_id
        || record.threadId
        || record.in_reply_to
        || record.inReplyTo
        || reference
        || envelopeReference
        || record?.envelope?.inReplyTo
        || messageId
    ) || messageId;
};

const getUnreadState = (record = {}) => {
    if (typeof record.unread === 'boolean') return record.unread;
    const flags = Array.isArray(record.flags) ? record.flags.map((entry) => String(entry).toLowerCase()) : [];
    return !flags.includes('\\seen') && !flags.includes('seen');
};

const normalizeConnectorMessage = (record = {}, {
    provider = MAIL_V1_ARCHITECTURE_DECISION.provider,
    mailbox = DEFAULT_LOCAL_MAILBOX
} = {}) => {
    const localMailbox = normalizeLocalMailbox(record.mailbox || record.folder || mailbox);
    const messageId = getMessageId(record, localMailbox);
    const envelope = record.envelope && typeof record.envelope === 'object' ? record.envelope : {};
    const from = normalizeEmailAddress(record.from || envelope.from || record.sender || envelope.sender);
    const to = normalizeEmailList(record.to || envelope.to);
    const cc = normalizeEmailList(record.cc || envelope.cc);
    const bcc = normalizeEmailList(record.bcc || envelope.bcc);
    const uid = normalizeText(record.uid || record.meta?.uid || '');
    const modseq = normalizeText(record.modseq || record.modSeq || record.meta?.modseq || '');

    return {
        message_id: messageId,
        thread_id: getThreadId(record, messageId),
        mailbox: localMailbox,
        subject: normalizeText(record.subject || envelope.subject),
        preview: normalizeText(record.preview || record.snippet || record.textSnippet || record.text_preview || ''),
        body_text: normalizeText(record.body_text || record.bodyText || record.text || record.textPlain || record.plain || ''),
        received_at: toTimestamp(record.received_at || record.receivedAt || record.internalDate || envelope.date || record.date),
        unread: getUnreadState(record),
        flags: Array.isArray(record.flags) ? record.flags.map((entry) => String(entry)) : [],
        from,
        to,
        cc,
        bcc,
        source: {
            provider,
            mailbox: localMailbox,
            remote_mailbox: normalizeRemoteMailbox(record.mailbox || record.folder || mailbox)
        },
        meta: {
            uid: uid || null,
            modseq: modseq || null,
            cursor: normalizeText(record.cursor || record.meta?.cursor || '') || null
        }
    };
};

const toMessageList = (payload) => {
    if (Array.isArray(payload?.messages)) return payload.messages;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload)) return payload;
    return [];
};

const normalizeReadPayload = (payload, {
    provider,
    mailbox,
    mode
} = {}) => ({
    ok: true,
    provider,
    mailbox: normalizeLocalMailbox(payload?.mailbox || mailbox),
    cursor: normalizeText(payload?.cursor || payload?.next_cursor || payload?.nextCursor || '') || null,
    mode,
    messages: toMessageList(payload).map((entry) => normalizeConnectorMessage(entry, {
        provider,
        mailbox
    }))
});

const normalizeAuthConfig = (auth = {}) => {
    const username = normalizeText(auth.username || auth.user || auth.apple_id || auth.appleId || auth.email);
    const password = normalizeText(auth.password || auth.app_password || auth.appPassword);
    return {
        username: username || null,
        password: password || null
    };
};

const resolveRemoteDestinationMailbox = (mailbox = DEFAULT_LOCAL_MAILBOX) => {
    const normalized = normalizeLocalMailbox(mailbox);
    if (normalized === DEFAULT_LOCAL_ARCHIVE_MAILBOX) return DEFAULT_REMOTE_ARCHIVE_MAILBOX;
    if (normalized === DEFAULT_LOCAL_TRASH_MAILBOX) return DEFAULT_REMOTE_TRASH_MAILBOX;
    if (normalized === DEFAULT_LOCAL_MAILBOX) return DEFAULT_REMOTE_MAILBOX;
    return normalizeText(mailbox) || DEFAULT_REMOTE_MAILBOX;
};

export const normalizeIcloudMailConnectorConfig = ({
    provider = MAIL_V1_ARCHITECTURE_DECISION.provider,
    auth = {},
    imap = {},
    smtp = {},
    mailbox = DEFAULT_REMOTE_MAILBOX
} = {}) => {
    const authConfig = normalizeAuthConfig(auth);
    const normalizeTransport = (input = {}, defaults = {}) => ({
        host: normalizeText(input.host || defaults.host) || defaults.host,
        port: toFiniteNumber(input.port, defaults.port),
        security: normalizeText(input.security || defaults.security).toLowerCase() || defaults.security,
        servername: normalizeText(input.servername || input.serverName || '') || null,
        timeout_ms: toFiniteNumber(input.timeout_ms || input.timeoutMs, 15000),
        reject_unauthorized: input.reject_unauthorized !== false && input.rejectUnauthorized !== false,
        client_hostname: normalizeText(input.client_hostname || input.clientHostName || '') || null
    });
    return {
        provider: String(provider || MAIL_V1_ARCHITECTURE_DECISION.provider),
        mailbox: normalizeRemoteMailbox(mailbox),
        auth: authConfig,
        imap: normalizeTransport(imap, MAIL_V1_ARCHITECTURE_DECISION.read_path),
        smtp: normalizeTransport(smtp, MAIL_V1_ARCHITECTURE_DECISION.send_path)
    };
};

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
