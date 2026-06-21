import {
    normalizeText,
    toFiniteNumber,
    resolveServername,
    connectSocket
} from './mail_socket.js';
import {
    quoteImapString,
    parseRawEmail,
    buildDestinationMailboxCandidates,
    buildPlainTextMessage,
    dotStuffMessage
} from './mail_mime.js';

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
