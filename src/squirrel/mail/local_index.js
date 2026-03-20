const DEFAULT_MAILBOX = 'inbox';

const normalizeText = (value) => String(value || '').trim();

const decodeBytesToText = (bytes, charset = 'utf-8') => {
    const normalizedCharset = String(charset || 'utf-8').trim().toLowerCase();
    try {
        if (typeof TextDecoder === 'function') {
            const decoder = new TextDecoder(
                normalizedCharset === 'utf8' ? 'utf-8' : normalizedCharset,
                { fatal: false }
            );
            return decoder.decode(bytes);
        }
    } catch (_) {
        // Fall through to Buffer decoding.
    }
    if (typeof Buffer !== 'undefined') {
        if (normalizedCharset.includes('iso-8859-1') || normalizedCharset.includes('latin1')) {
            return Buffer.from(bytes).toString('latin1');
        }
        return Buffer.from(bytes).toString('utf8');
    }
    return String.fromCharCode(...bytes);
};

const decodeBase64Bytes = (value) => {
    const text = String(value || '').trim();
    if (!text) return new Uint8Array();
    if (typeof Buffer !== 'undefined') {
        return Uint8Array.from(Buffer.from(text, 'base64'));
    }
    if (typeof atob === 'function') {
        const binary = atob(text);
        return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }
    return new Uint8Array();
};

const decodeQuotedPrintableBytes = (value) => {
    const text = String(value || '').replace(/_/g, ' ');
    const bytes = [];
    for (let index = 0; index < text.length; index += 1) {
        const current = text[index];
        if (
            current === '='
            && index + 2 < text.length
            && /^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))
        ) {
            bytes.push(Number.parseInt(text.slice(index + 1, index + 3), 16));
            index += 2;
            continue;
        }
        bytes.push(text.charCodeAt(index));
    }
    return Uint8Array.from(bytes);
};

const decodeMimeEncodedWords = (value) => String(value || '').replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_match, charset, encoding, encodedText) => {
        try {
            const bytes = String(encoding || '').toUpperCase() === 'B'
                ? decodeBase64Bytes(encodedText)
                : decodeQuotedPrintableBytes(encodedText);
            return decodeBytesToText(bytes, charset);
        } catch (_) {
            return String(encodedText || '');
        }
    }
).replace(/\s{2,}/g, ' ').trim();

const normalizeSearchText = (value) => normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const parseDateMs = (value) => {
    if (Number.isFinite(Number(value))) return Number(value);
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAddress = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
        const address = normalizeText(value);
        if (!address) return null;
        return { name: null, address };
    }
    const address = normalizeText(value.address || value.email || '');
    const name = normalizeText(value.name || '') || null;
    if (!address) return null;
    return { name, address };
};

const normalizeAddressList = (value) => {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list.map((entry) => normalizeAddress(entry)).filter(Boolean);
};

const buildSearchIndex = (record) => normalizeSearchText([
    record.subject,
    record.preview,
    record.body_text,
    record.from?.name,
    record.from?.address,
    ...record.to.map((entry) => entry.name || ''),
    ...record.to.map((entry) => entry.address || '')
].join(' '));

export const normalizeMailRecord = (record = {}) => {
    const messageId = normalizeText(record.message_id || record.messageId || record.id);
    if (!messageId) {
        throw new Error('mail message_id is required');
    }
    const normalized = {
        message_id: messageId,
        thread_id: normalizeText(record.thread_id || record.threadId || messageId),
        mailbox: normalizeText(record.mailbox || record.folder || DEFAULT_MAILBOX) || DEFAULT_MAILBOX,
        subject: normalizeText(decodeMimeEncodedWords(record.subject)),
        preview: normalizeText(record.preview || record.snippet),
        body_text: normalizeText(record.body_text || record.bodyText || record.body),
        received_at: parseDateMs(record.received_at || record.receivedAt || record.date),
        unread: record.unread !== false,
        flags: Array.isArray(record.flags) ? record.flags.map((entry) => String(entry)) : [],
        from: normalizeAddress(record.from),
        to: normalizeAddressList(record.to),
        cc: normalizeAddressList(record.cc),
        bcc: normalizeAddressList(record.bcc),
        source: record.source && typeof record.source === 'object' ? { ...record.source } : { provider: 'unknown' },
        meta: record.meta && typeof record.meta === 'object' ? { ...record.meta } : {}
    };
    normalized.search_text = buildSearchIndex(normalized);
    return normalized;
};

const sortMessages = (messages) => messages.sort((left, right) => {
    if (right.received_at !== left.received_at) return right.received_at - left.received_at;
    return String(right.message_id).localeCompare(String(left.message_id));
});

export const createMailIndex = () => {
    const records = new Map();

    const getOrdered = () => sortMessages(Array.from(records.values()).map((entry) => ({ ...entry })));

    return {
        upsert(messages = []) {
            const list = Array.isArray(messages) ? messages : [messages];
            const normalized = list.map((entry) => normalizeMailRecord(entry));
            normalized.forEach((entry) => {
                records.set(entry.message_id, entry);
            });
            return normalized.map((entry) => ({ ...entry }));
        },
        read(messageId) {
            const key = normalizeText(messageId);
            const record = records.get(key);
            return record ? { ...record } : null;
        },
        list({
            mailbox = null,
            unread_only = false,
            thread_id = null,
            limit = 50,
            after_id = null
        } = {}) {
            const ordered = getOrdered().filter((entry) => {
                if (mailbox && entry.mailbox !== mailbox) return false;
                if (thread_id && entry.thread_id !== thread_id) return false;
                if (unread_only && entry.unread !== true) return false;
                return true;
            });
            if (after_id) {
                const index = ordered.findIndex((entry) => entry.message_id === after_id);
                if (index >= 0) {
                    return ordered.slice(index + 1, index + 1 + Math.max(1, Number(limit) || 50));
                }
            }
            return ordered.slice(0, Math.max(1, Number(limit) || 50));
        },
        search(query, {
            mailbox = null,
            unread_only = false,
            limit = 50
        } = {}) {
            const needle = normalizeSearchText(query);
            if (!needle) return [];
            return getOrdered()
                .filter((entry) => {
                    if (mailbox && entry.mailbox !== mailbox) return false;
                    if (unread_only && entry.unread !== true) return false;
                    return entry.search_text.includes(needle);
                })
                .slice(0, Math.max(1, Number(limit) || 50));
        },
        nextUnread({
            mailbox = null,
            after_id = null
        } = {}) {
            const unread = this.list({
                mailbox,
                unread_only: true,
                limit: records.size || 50,
                after_id
            });
            return unread[0] || null;
        },
        stats() {
            const all = getOrdered();
            return {
                total: all.length,
                unread: all.filter((entry) => entry.unread === true).length,
                mailboxes: Array.from(new Set(all.map((entry) => entry.mailbox))).sort()
            };
        }
    };
};
