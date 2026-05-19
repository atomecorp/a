const DEFAULT_TIMEOUT_MS = 15000;

const normalizeText = (value) => String(value || '').trim();
const isIpLikeHost = (value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(value || '')) || String(value || '').includes(':');
const resolveServername = (transport = {}) => {
    const explicit = normalizeText(transport.servername || '');
    if (explicit) return explicit;
    const host = normalizeText(transport.host || '');
    return host && !isIpLikeHost(host) ? host : undefined;
};

const toFiniteNumber = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const waitForEvent = (emitter, successEvent, errorEvent = 'error') => new Promise((resolve, reject) => {
    const onSuccess = (...args) => {
        cleanup();
        resolve(args);
    };
    const onError = (error) => {
        cleanup();
        reject(error);
    };
    const cleanup = () => {
        emitter.off(successEvent, onSuccess);
        emitter.off(errorEvent, onError);
    };
    emitter.once(successEvent, onSuccess);
    emitter.once(errorEvent, onError);
});

class BufferedSocket {
    constructor(socket) {
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.closed = false;
        this.ended = false;
        this.error = null;
        this.pendingWaiter = null;
        this.listeners = null;
        this.attach(socket);
    }

    attach(socket) {
        if (!socket) {
            throw new Error('buffered_socket_requires_socket');
        }
        this.detach();
        this.socket = socket;
        const onData = (chunk) => {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            this.buffer = Buffer.concat([this.buffer, data]);
            this.flushWaiter();
        };
        const onError = (error) => {
            this.error = error || new Error('socket_error');
            this.flushWaiter();
        };
        const onClose = () => {
            this.closed = true;
            this.flushWaiter();
        };
        const onEnd = () => {
            this.ended = true;
            this.flushWaiter();
        };
        this.listeners = { onData, onError, onClose, onEnd };
        socket.on('data', onData);
        socket.on('error', onError);
        socket.on('close', onClose);
        socket.on('end', onEnd);
    }

    detach() {
        if (!this.socket || !this.listeners) return;
        this.socket.off('data', this.listeners.onData);
        this.socket.off('error', this.listeners.onError);
        this.socket.off('close', this.listeners.onClose);
        this.socket.off('end', this.listeners.onEnd);
        this.listeners = null;
    }

    flushWaiter() {
        if (!this.pendingWaiter) return;
        const waiter = this.pendingWaiter;
        this.pendingWaiter = null;
        waiter.resolve();
    }

    async waitFor(predicate) {
        while (!predicate()) {
            if (this.error) throw this.error;
            if ((this.closed || this.ended) && this.buffer.length === 0) {
                throw new Error('socket_closed');
            }
            await new Promise((resolve) => {
                this.pendingWaiter = { resolve };
            });
        }
    }

    async readLine() {
        await this.waitFor(() => this.buffer.includes(0x0a) || this.error || this.closed || this.ended);
        const newlineIndex = this.buffer.indexOf(0x0a);
        if (newlineIndex < 0) {
            if (this.buffer.length === 0) throw new Error('socket_closed');
            const line = this.buffer.toString('utf8');
            this.buffer = Buffer.alloc(0);
            return line.replace(/\r$/, '');
        }
        const lineBuffer = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        return lineBuffer.toString('utf8').replace(/\r$/, '');
    }

    async readBytes(length) {
        const size = Math.max(0, Number(length) || 0);
        await this.waitFor(() => this.buffer.length >= size || this.error || this.closed || this.ended);
        if (this.buffer.length < size) {
            throw new Error(`socket_closed_before_${size}_bytes`);
        }
        const chunk = this.buffer.slice(0, size);
        this.buffer = this.buffer.slice(size);
        return chunk;
    }

    async write(data) {
        const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
        await new Promise((resolve, reject) => {
            this.socket.write(payload, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    async upgradeToTls(options = {}) {
        const tls = await import('node:tls');
        const tlsSocket = tls.connect({
            socket: this.socket,
            ...(options.servername ? { servername: options.servername } : {}),
            rejectUnauthorized: options.rejectUnauthorized !== false
        });
        this.closed = false;
        this.ended = false;
        this.error = null;
        this.attach(tlsSocket);
        await waitForEvent(tlsSocket, 'secureConnect');
        return this;
    }

    async end() {
        if (!this.socket) return;
        await new Promise((resolve) => {
            this.socket.end(() => resolve());
        });
    }
}

const connectSocket = async (transport = {}) => {
    const security = normalizeText(transport.security || 'plain').toLowerCase();
    const timeoutMs = toFiniteNumber(transport.timeout_ms || transport.timeoutMs, DEFAULT_TIMEOUT_MS);
    let socket;
    if (security === 'tls') {
        const tls = await import('node:tls');
        socket = tls.connect({
            host: transport.host,
            port: transport.port,
            ...(resolveServername(transport) ? { servername: resolveServername(transport) } : {}),
            rejectUnauthorized: transport.reject_unauthorized !== false && transport.rejectUnauthorized !== false
        });
        if (timeoutMs > 0) {
            socket.setTimeout(timeoutMs, () => socket.destroy(new Error('socket_timeout')));
        }
        const buffered = new BufferedSocket(socket);
        await waitForEvent(socket, 'secureConnect');
        return buffered;
    }
    const net = await import('node:net');
    socket = net.createConnection({
        host: transport.host,
        port: transport.port
    });
    if (timeoutMs > 0) {
        socket.setTimeout(timeoutMs, () => socket.destroy(new Error('socket_timeout')));
    }
    const buffered = new BufferedSocket(socket);
    await waitForEvent(socket, 'connect');
    return buffered;
};

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

class NodeImapClient {
    constructor(config = {}) {
        this.config = config;
        this.socket = null;
        this.tagSeq = 0;
        this.selectedMailbox = null;
        this.selectedMailboxReadOnly = true;
    }

    async connect() {
        this.socket = await connectSocket(this.config.imap);
        const greeting = await this.socket.readLine();
        if (!/^\* OK/i.test(greeting)) {
            throw new Error(`imap_bad_greeting:${greeting}`);
        }
        await this.command(`LOGIN ${quoteImapString(this.config.auth.username)} ${quoteImapString(this.config.auth.password)}`);
        await this.selectMailbox(this.config.mailbox);
    }

    async close() {
        if (!this.socket) return;
        try {
            await this.command('LOGOUT');
        } catch {
            // Ignore logout failures during shutdown.
        }
        await this.socket.end();
        this.socket = null;
    }

    nextTag() {
        this.tagSeq += 1;
        return `A${String(this.tagSeq).padStart(4, '0')}`;
    }

    async selectMailbox(mailbox, {
        readOnly = true
    } = {}) {
        const normalized = normalizeText(mailbox || this.config.mailbox) || 'INBOX';
        if (normalized === this.selectedMailbox && this.selectedMailboxReadOnly === readOnly) return;
        await this.command(`${readOnly ? 'EXAMINE' : 'SELECT'} ${quoteImapString(normalized)}`);
        this.selectedMailbox = normalized;
        this.selectedMailboxReadOnly = readOnly;
    }

    async command(commandText) {
        const tag = this.nextTag();
        await this.socket.write(`${tag} ${commandText}\r\n`);
        const response = await this.collectTaggedResponse(tag);
        if (!new RegExp(`^${tag} OK`, 'i').test(response.completion)) {
            throw new Error(`imap_command_failed:${response.completion}`);
        }
        return response;
    }

    async collectTaggedResponse(tag) {
        const lines = [];
        const fetchBlocks = [];
        while (true) {
            const line = await this.socket.readLine();
            if (line.startsWith(`${tag} `)) {
                return {
                    lines,
                    fetchBlocks,
                    completion: line
                };
            }
            if (/^\* \d+ FETCH \(/i.test(line)) {
                fetchBlocks.push(await this.readFetchBlock(line));
                continue;
            }
            lines.push(line);
        }
    }

    async readFetchBlock(firstLine) {
        const lines = [firstLine];
        const literals = [];
        let current = firstLine;
        while (true) {
            const literalMatch = current.match(/\{(\d+)\}$/);
            if (literalMatch) {
                literals.push(await this.socket.readBytes(Number(literalMatch[1])));
                current = await this.socket.readLine();
                lines.push(current);
                continue;
            }
            if (current.trim().endsWith(')')) {
                return { lines, literals };
            }
            current = await this.socket.readLine();
            lines.push(current);
        }
    }

    parseSearch(lines = []) {
        const searchLine = lines.find((entry) => /^\* SEARCH/i.test(entry));
        if (!searchLine) return [];
        return searchLine
            .replace(/^\* SEARCH\s*/i, '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((entry) => Number(entry))
            .filter((entry) => Number.isFinite(entry));
    }

    parseFetchBlock(block = {}) {
        const merged = Array.isArray(block.lines) ? block.lines.join('\n') : '';
        const rawMessage = block.literals?.[0] ? block.literals[0].toString('utf8') : '';
        const parsed = parseRawEmail(rawMessage);
        const uid = Number((merged.match(/\bUID (\d+)/i) || [])[1] || 0);
        const internalDate = (merged.match(/\bINTERNALDATE "([^"]+)"/i) || [])[1] || parsed.date || null;
        const flagsMatch = (merged.match(/\bFLAGS \(([^)]*)\)/i) || [])[1] || '';
        const flags = flagsMatch.split(/\s+/).filter(Boolean);
        return {
            uid,
            message_id: parsed.message_id || `imap:${uid}`,
            subject: parsed.subject,
            from: parsed.from,
            to: parsed.to,
            cc: parsed.cc,
            bcc: parsed.bcc,
            body_text: parsed.body_text,
            preview: parsed.preview,
            flags,
            unread: !flags.map((entry) => entry.toLowerCase()).includes('\\seen'),
            internalDate,
            date: parsed.date || internalDate,
            in_reply_to: parsed.in_reply_to,
            references: parsed.references
        };
    }

    async searchUids({ cursor = null } = {}) {
        const cursorNumber = toFiniteNumber(cursor, null);
        const response = cursorNumber != null && cursorNumber >= 0
            ? await this.command(`UID SEARCH UID ${cursorNumber + 1}:*`)
            : await this.command('UID SEARCH ALL');
        return this.parseSearch(response.lines);
    }

    async fetchUidSet(uids = []) {
        if (!Array.isArray(uids) || !uids.length) return [];
        const uidSet = uids.join(',');
        const response = await this.command(`UID FETCH ${uidSet} (UID FLAGS INTERNALDATE BODY.PEEK[])`);
        return response.fetchBlocks.map((entry) => this.parseFetchBlock(entry));
    }

    async fetchInitialMailbox(request = {}) {
        await this.selectMailbox(request.mailbox || this.config.mailbox, { readOnly: true });
        const limit = Math.max(1, toFiniteNumber(request.limit, 50));
        const uids = await this.searchUids();
        const selected = uids.slice(-limit);
        const messages = await this.fetchUidSet(selected);
        const cursor = selected.length ? String(Math.max(...selected)) : normalizeText(request.cursor) || null;
        return {
            ok: true,
            mailbox: request.local_mailbox || request.mailbox || this.config.mailbox,
            cursor,
            messages
        };
    }

    async fetchDelta(request = {}) {
        await this.selectMailbox(request.mailbox || this.config.mailbox, { readOnly: true });
        const limit = Math.max(1, toFiniteNumber(request.limit, 50));
        const cursorNumber = toFiniteNumber(request.cursor, null);
        const uids = await this.searchUids({
            cursor: cursorNumber
        });
        const selected = uids.slice(-limit);
        const messages = await this.fetchUidSet(selected);
        const cursor = selected.length
            ? String(Math.max(...selected))
            : (cursorNumber != null ? String(cursorNumber) : null);
        return {
            ok: true,
            mailbox: request.local_mailbox || request.mailbox || this.config.mailbox,
            cursor,
            messages
        };
    }

    async markRead(request = {}) {
        const uid = Number(request.uid || request?.meta?.uid || 0);
        if (!Number.isFinite(uid) || uid <= 0) {
            throw new Error('imap_uid_required');
        }
        await this.selectMailbox(request.mailbox || this.config.mailbox, { readOnly: false });
        const read = request?.read !== false;
        await this.command(`UID STORE ${uid} ${read ? '+FLAGS.SILENT' : '-FLAGS.SILENT'} (\\Seen)`);
        return {
            ok: true,
            uid,
            mailbox: request.local_mailbox || request.mailbox || this.config.mailbox,
            read
        };
    }

    async moveMessage(request = {}) {
        const uid = Number(request.uid || request?.meta?.uid || 0);
        if (!Number.isFinite(uid) || uid <= 0) {
            throw new Error('imap_uid_required');
        }
        const sourceMailbox = normalizeText(request.mailbox || this.config.mailbox) || 'INBOX';
        const destinationMailbox = normalizeText(request.destination_mailbox || request.destinationMailbox || '');
        if (!destinationMailbox) {
            throw new Error('imap_destination_mailbox_required');
        }
        await this.selectMailbox(sourceMailbox, { readOnly: false });
        let resolvedDestination = destinationMailbox;
        let lastError = null;
        const attemptMove = async (targetMailbox) => {
            try {
                await this.command(`UID MOVE ${uid} ${quoteImapString(targetMailbox)}`);
                return;
            } catch (error) {
                const message = String(error?.message || '');
                if (!message.startsWith('imap_command_failed:')) {
                    throw error;
                }
                await this.command(`UID COPY ${uid} ${quoteImapString(targetMailbox)}`);
                await this.command(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted \\Seen)`);
                await this.command('EXPUNGE');
            }
        };
        const queue = buildDestinationMailboxCandidates(sourceMailbox, destinationMailbox);
        const tried = new Set();
        while (queue.length) {
            const candidate = queue.shift();
            if (!candidate || tried.has(candidate)) continue;
            tried.add(candidate);
            try {
                await attemptMove(candidate);
                resolvedDestination = candidate;
                lastError = null;
                break;
            } catch (error) {
                lastError = error;
                for (const retryCandidate of buildDestinationMailboxCandidates(sourceMailbox, destinationMailbox, error)) {
                    if (!retryCandidate || tried.has(retryCandidate) || queue.includes(retryCandidate)) continue;
                    queue.push(retryCandidate);
                }
            }
        }
        if (lastError) throw lastError;
        return {
            ok: true,
            uid,
            mailbox: request.local_mailbox || sourceMailbox,
            remote_mailbox: sourceMailbox,
            destination_mailbox: request.destination_local_mailbox || request.destinationLocalMailbox || destinationMailbox,
            destination_remote_mailbox: resolvedDestination
        };
    }
}

class NodeSmtpClient {
    constructor(config = {}) {
        this.config = config;
        this.socket = null;
        this.upgraded = false;
    }

    async connect() {
        this.socket = await connectSocket(this.config.smtp);
        const greeting = await this.readResponse();
        if (greeting.code !== 220) {
            throw new Error(`smtp_bad_greeting:${greeting.lines.join(' | ')}`);
        }
        const capabilities = await this.ehlo();
        if (normalizeText(this.config.smtp.security).toLowerCase() === 'starttls') {
            if (!capabilities.has('STARTTLS')) {
                throw new Error('smtp_starttls_not_supported');
            }
            const startTls = await this.sendCommand('STARTTLS');
            if (startTls.code !== 220) {
                throw new Error(`smtp_starttls_failed:${startTls.lines.join(' | ')}`);
            }
            await this.socket.upgradeToTls({
                host: this.config.smtp.host,
                ...(resolveServername(this.config.smtp) ? { servername: resolveServername(this.config.smtp) } : {}),
                rejectUnauthorized: this.config.smtp.reject_unauthorized !== false && this.config.smtp.rejectUnauthorized !== false
            });
            this.upgraded = true;
            await this.ehlo();
        }
        await this.authenticate();
    }

    async close() {
        if (!this.socket) return;
        try {
            await this.sendCommand('QUIT');
        } catch {
            // Ignore shutdown errors.
        }
        await this.socket.end();
        this.socket = null;
    }

    async readResponse() {
        const lines = [];
        let code = null;
        while (true) {
            const line = await this.socket.readLine();
            lines.push(line);
            const match = line.match(/^(\d{3})([\s-])(.*)$/);
            if (!match) continue;
            code = Number(match[1]);
            if (match[2] === ' ') {
                return { code, lines };
            }
        }
    }

    async sendCommand(command) {
        await this.socket.write(`${command}\r\n`);
        return this.readResponse();
    }

    async ehlo() {
        const host = normalizeText(this.config.smtp.client_hostname || this.config.smtp.clientHostName || 'localhost');
        const response = await this.sendCommand(`EHLO ${host}`);
        if (response.code !== 250) {
            throw new Error(`smtp_ehlo_failed:${response.lines.join(' | ')}`);
        }
        const capabilities = new Set();
        response.lines.forEach((line) => {
            const capability = line.replace(/^250[\s-]?/i, '').trim().split(/\s+/)[0];
            if (capability) capabilities.add(capability.toUpperCase());
        });
        return capabilities;
    }

    async authenticate() {
        const username = normalizeText(this.config.auth.username);
        const password = normalizeText(this.config.auth.password);
        if (!username || !password) {
            throw new Error('smtp_auth_missing');
        }
        let response = await this.sendCommand('AUTH LOGIN');
        if (response.code !== 334) {
            throw new Error(`smtp_auth_login_failed:${response.lines.join(' | ')}`);
        }
        response = await this.sendCommand(Buffer.from(username).toString('base64'));
        if (response.code !== 334) {
            throw new Error(`smtp_auth_username_failed:${response.lines.join(' | ')}`);
        }
        response = await this.sendCommand(Buffer.from(password).toString('base64'));
        if (response.code !== 235) {
            throw new Error(`smtp_auth_password_failed:${response.lines.join(' | ')}`);
        }
    }

    async sendDraft(request = {}) {
        const built = buildPlainTextMessage(request.draft, request.auth);
        let response = await this.sendCommand(`MAIL FROM:<${built.sender}>`);
        if (response.code !== 250) {
            throw new Error(`smtp_mail_from_failed:${response.lines.join(' | ')}`);
        }
        for (const recipient of built.recipients) {
            response = await this.sendCommand(`RCPT TO:<${recipient}>`);
            if (response.code !== 250 && response.code !== 251) {
                throw new Error(`smtp_rcpt_to_failed:${response.lines.join(' | ')}`);
            }
        }
        response = await this.sendCommand('DATA');
        if (response.code !== 354) {
            throw new Error(`smtp_data_failed:${response.lines.join(' | ')}`);
        }
        await this.socket.write(`${dotStuffMessage(built.raw)}\r\n.\r\n`);
        response = await this.readResponse();
        if (response.code !== 250) {
            throw new Error(`smtp_data_commit_failed:${response.lines.join(' | ')}`);
        }
        const remoteId = (response.lines.join(' ').match(/<[^>]+>/) || [])[0] || built.message_id;
        return {
            ok: true,
            message_id: remoteId,
            accepted_at: Date.now()
        };
    }
}

export const createNodeIcloudImapClient = async (config = {}) => new NodeImapClient(config);
export const createNodeIcloudSmtpClient = async (config = {}) => new NodeSmtpClient(config);
