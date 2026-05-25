import { MAIL_V1_ARCHITECTURE_DECISION } from './connector_contract.js';

export const DEFAULT_REMOTE_MAILBOX = 'INBOX';
export const DEFAULT_LOCAL_MAILBOX = 'inbox';
export const DEFAULT_REMOTE_ARCHIVE_MAILBOX = 'Archive';
export const DEFAULT_REMOTE_TRASH_MAILBOX = 'Trash';
export const DEFAULT_LOCAL_ARCHIVE_MAILBOX = 'archive';
export const DEFAULT_LOCAL_TRASH_MAILBOX = 'trash';

export const normalizeText = (value) => String(value || '').trim();

export const normalizeRemoteMailbox = (value) => normalizeText(value).toUpperCase() || DEFAULT_REMOTE_MAILBOX;
export const normalizeLocalMailbox = (value) => normalizeText(value).toLowerCase() || DEFAULT_LOCAL_MAILBOX;

export const toFiniteNumber = (value, fallback = null) => {
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

export const normalizeConnectorMessage = (record = {}, {
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

export const normalizeReadPayload = (payload, {
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

export const resolveRemoteDestinationMailbox = (mailbox = DEFAULT_LOCAL_MAILBOX) => {
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
