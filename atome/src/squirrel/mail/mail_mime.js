import { normalizeText } from './mail_socket.js';

const quoteImapString = (value) => `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

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
    const text = String(value || '')
        .replace(/=\r?\n/g, '')
        .replace(/=$/, '')
        .replace(/_/g, ' ');
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

const buildDestinationMailboxCandidates = (sourceMailbox, destinationMailbox, error = null) => {
    const requested = normalizeText(destinationMailbox);
    if (!requested) return [];
    const candidates = [requested];
    const source = normalizeText(sourceMailbox).toUpperCase();
    const message = String(error?.message || error || '');
    const hintedPrefix = message.match(/prefixed with:\s*([A-Z0-9._-]+)/i)?.[1] || '';
    if (!requested.includes('.')) {
        if (hintedPrefix) {
            candidates.push(`${hintedPrefix.replace(/\.+$/, '')}.${requested}`);
        } else if (source === 'INBOX' || source.startsWith('INBOX.')) {
            candidates.push(`INBOX.${requested}`);
        }
    }
    return Array.from(new Set(candidates.map((entry) => normalizeText(entry)).filter(Boolean)));
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
);

const decodeLooseQuotedPrintableText = (value, charset = 'utf-8') => {
    const text = String(value || '').trim();
    if (!/=([0-9A-Fa-f]{2})/.test(text)) return text;
    try {
        return decodeBytesToText(decodeQuotedPrintableBytes(text), charset);
    } catch (_) {
        return text;
    }
};

const normalizeHeaderText = (value, charset = 'utf-8') => {
    const decodedWords = decodeMimeEncodedWords(value);
    const looselyDecoded = decodeLooseQuotedPrintableText(decodedWords, charset);
    return String(looselyDecoded || '').replace(/\s{2,}/g, ' ').trim();
};

const readCharsetFromContentType = (value = '') => {
    const match = String(value || '').match(/charset\s*=\s*("?)([^";\s]+)\1/i);
    return String(match?.[2] || 'utf-8').trim() || 'utf-8';
};

const parseAddressToken = (token = '') => {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const angleMatch = raw.match(/^(.*)<([^>]+)>$/);
    if (angleMatch) {
        const name = angleMatch[1].replace(/^"|"$/g, '').trim() || null;
        return {
            name,
            address: angleMatch[2].trim()
        };
    }
    return {
        name: null,
        address: raw.replace(/^<|>$/g, '').trim()
    };
};

const splitAddressTokens = (value = '') => {
    const tokens = [];
    let current = '';
    let quote = false;
    let angle = false;
    for (const char of String(value || '')) {
        if (char === '"') quote = !quote;
        if (char === '<') angle = true;
        if (char === '>') angle = false;
        if (char === ',' && !quote && !angle) {
            tokens.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    if (current) tokens.push(current);
    return tokens.map((entry) => parseAddressToken(entry)).filter(Boolean);
};

const parseHeaders = (headerText = '') => {
    const headers = {};
    let currentKey = null;
    for (const rawLine of String(headerText || '').split(/\r?\n/)) {
        if (!rawLine) continue;
        if (/^\s/.test(rawLine) && currentKey) {
            headers[currentKey] = `${headers[currentKey]} ${rawLine.trim()}`.trim();
            continue;
        }
        const separator = rawLine.indexOf(':');
        if (separator <= 0) continue;
        currentKey = rawLine.slice(0, separator).trim().toLowerCase();
        headers[currentKey] = rawLine.slice(separator + 1).trim();
    }
    return headers;
};

const extractTextFromMultipart = (body, boundary) => {
    const parts = body.split(`--${boundary}`);
    for (const part of parts) {
        if (part.trim() === '--' || !part.trim()) continue;
        const partSepMatch = part.match(/\r?\n\r?\n/);
        if (!partSepMatch) continue;
        const partHeaderText = part.slice(0, partSepMatch.index);
        const partBody = part.slice(partSepMatch.index + partSepMatch[0].length);
        const partHeaders = parseHeaders(partHeaderText);
        const partContentType = (partHeaders['content-type'] || '').toLowerCase();
        // Recurse into nested multipart
        const nestedBoundaryMatch = partContentType.match(/boundary\s*=\s*"?([^";\s]+)"?/i);
        if (partContentType.includes('multipart/') && nestedBoundaryMatch) {
            const nested = extractTextFromMultipart(partBody, nestedBoundaryMatch[1]);
            if (nested) return nested;
            continue;
        }
        if (partContentType.includes('text/plain') || (!partContentType && partBody.trim())) {
            const partCharset = readCharsetFromContentType(partHeaders['content-type'] || '');
            const partEncoding = normalizeText(partHeaders['content-transfer-encoding'] || '').toLowerCase();
            if (partEncoding === 'quoted-printable') return decodeBytesToText(decodeQuotedPrintableBytes(partBody), partCharset);
            if (partEncoding === 'base64') return decodeBytesToText(decodeBase64Bytes(partBody.replace(/\s+/g, '')), partCharset);
            return partBody;
        }
    }
    return null;
};

const parseRawEmail = (raw = '') => {
    const message = String(raw || '');
    const separatorMatch = message.match(/\r?\n\r?\n/);
    const separatorIndex = separatorMatch ? separatorMatch.index : -1;
    const headerText = separatorIndex >= 0 ? message.slice(0, separatorIndex) : message;
    const rawBodyText = separatorIndex >= 0 ? message.slice(separatorIndex + separatorMatch[0].length) : '';
    const headers = parseHeaders(headerText);
    const contentType = headers['content-type'] || '';
    const charset = readCharsetFromContentType(contentType);
    const transferEncoding = normalizeText(headers['content-transfer-encoding'] || '').toLowerCase();
    const boundaryMatch = contentType.match(/boundary\s*=\s*"?([^";\s]+)"?/i);
    let bodyText = rawBodyText;
    if (boundaryMatch) {
        // Multipart MIME: extract only the text/plain part
        bodyText = extractTextFromMultipart(rawBodyText, boundaryMatch[1]) || '';
    } else if (transferEncoding === 'quoted-printable') {
        bodyText = decodeBytesToText(decodeQuotedPrintableBytes(rawBodyText), charset);
    } else if (transferEncoding === 'base64') {
        bodyText = decodeBytesToText(decodeBase64Bytes(rawBodyText.replace(/\s+/g, '')), charset);
    }
    const preview = bodyText.replace(/\s+/g, ' ').trim().slice(0, 240);
    return {
        message_id: normalizeHeaderText(headers['message-id'] || '', charset) || null,
        subject: normalizeHeaderText(headers.subject || '', charset),
        from: splitAddressTokens(normalizeHeaderText(headers.from || '', charset))[0] || null,
        to: splitAddressTokens(normalizeHeaderText(headers.to || '', charset)),
        cc: splitAddressTokens(normalizeHeaderText(headers.cc || '', charset)),
        bcc: splitAddressTokens(normalizeHeaderText(headers.bcc || '', charset)),
        in_reply_to: normalizeHeaderText(headers['in-reply-to'] || '', charset) || null,
        references: normalizeText(normalizeHeaderText(headers.references || '', charset)).split(/\s+/).filter(Boolean),
        date: normalizeHeaderText(headers.date || '', charset) || null,
        preview,
        body_text: bodyText.trim()
    };
};

const buildPlainTextMessage = (draft = {}, auth = {}, {
    now = () => new Date()
} = {}) => {
    const from = Array.isArray(draft.from) && draft.from.length
        ? draft.from[0]
        : (draft.from && typeof draft.from === 'object' ? draft.from : null);
    const senderAddress = from?.address || auth.username || null;
    if (!senderAddress) {
        throw new Error('smtp_sender_missing');
    }
    const senderName = normalizeText(from?.name || '') || null;
    const toList = Array.isArray(draft.to) ? draft.to.filter((entry) => entry?.address) : [];
    if (!toList.length) {
        throw new Error('smtp_recipient_missing');
    }
    const formatAddress = (entry = {}) => {
        const address = normalizeText(entry.address || entry.email || '');
        if (!address) return null;
        const name = normalizeText(entry.name || '') || null;
        return name ? `"${name.replace(/"/g, '\\"')}" <${address}>` : `<${address}>`;
    };
    const domain = senderAddress.includes('@') ? senderAddress.split('@')[1] : 'localhost';
    const messageId = draft.message_id
        || draft.remote_id
        || `<${normalizeText(draft.draft_id || `mail-${Date.now()}`)}@${domain}>`;
    const references = [];
    if (draft.in_reply_to) {
        references.push(String(draft.in_reply_to));
    }
    if (Array.isArray(draft.references)) {
        references.push(...draft.references.map((entry) => String(entry)));
    }
    const headers = [
        `Date: ${now().toUTCString()}`,
        `Message-ID: ${messageId}`,
        `From: ${formatAddress({ name: senderName, address: senderAddress })}`,
        `To: ${toList.map((entry) => formatAddress(entry)).filter(Boolean).join(', ')}`,
        `Subject: ${normalizeText(draft.subject || '(no subject)')}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit'
    ];
    if (draft.in_reply_to) {
        headers.push(`In-Reply-To: ${String(draft.in_reply_to)}`);
    }
    if (references.length) {
        headers.push(`References: ${references.join(' ')}`);
    }
    const body = String(draft.body_text || '').replace(/\r?\n/g, '\r\n');
    return {
        sender: senderAddress,
        recipients: toList.map((entry) => entry.address),
        message_id: messageId,
        raw: `${headers.join('\r\n')}\r\n\r\n${body}\r\n`
    };
};

const dotStuffMessage = (message = '') => String(message || '')
    .replace(/\r?\n/g, '\r\n')
    .replace(/(^|\r\n)\./g, '$1..');

export {
    quoteImapString,
    parseRawEmail,
    buildDestinationMailboxCandidates,
    buildPlainTextMessage,
    dotStuffMessage
};
