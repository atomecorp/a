import crypto from 'node:crypto';
import { wsSendJson } from './wsSend.js';

const CONTROL_TYPES = new Set(['auth', 'register', 'subscribe', 'unsubscribe', 'ack', 'ping']);
const SUBSCRIBE_BATCH_LIMIT = 500;
const DIRECTORY_STREAM = 'directory.public';

const numberCursor = (value) => {
    const cursor = Number(value);
    return Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
};

const eventEnvelope = (event, replay = false) => ({
    type: 'event',
    event_id: event.id,
    stream: event.stream_id || event.stream,
    sequence: Number(event.sequence),
    source: event.source || null,
    project_id: event.project_id || null,
    atome_id: event.atome_id || null,
    vault_principal_id: event.vault_principal_id || null,
    tx_id: event.tx_id || null,
    gesture_id: event.gesture_id || null,
    kind: event.kind,
    patch: event.payload || null,
    projection: event.projection || null,
    lww_decisions: event.lww_decisions || null,
    timestamp: event.ts,
    replay
});

export class WsSyncRuntime {
    constructor(options = {}) {
        this.authenticateRequest = options.authenticateRequest;
        this.authenticateMessage = options.authenticateMessage;
        this.validatePrincipal = options.validatePrincipal;
        this.isProvisioned = options.isProvisioned;
        this.getVersion = options.getVersion || (async () => ({}));
        this.vaultRouter = options.vaultRouter;
        this.directoryService = options.directoryService || null;
        this.send = options.send || wsSendJson;
        this.reportFailure = options.reportFailure || (() => {});
        this.authTimeoutMs = Math.max(100, Number(options.authTimeoutMs) || 5000);
        this.idleTimeoutMs = Math.max(1000, Number(options.idleTimeoutMs) || 45_000);
        this.records = new Map();
        this.sweepTimer = setInterval(() => this.sweep(), Math.min(15_000, this.idleTimeoutMs));
        this.sweepTimer.unref?.();
    }

    safeSend(connection, payload) {
        return this.send(connection, payload, { scope: 'ws/sync', op: payload?.type || 'send' });
    }

    close(record, code, reason) {
        if (!record || record.closed) return;
        if (code) this.safeSend(record.connection, { type: 'error', code });
        this.cleanup(record.connection);
        record.connection.close?.(4401, reason || code || 'closed');
    }

    cleanup(connection) {
        const record = this.records.get(connection);
        if (!record) return;
        record.closed = true;
        if (record.authTimer) clearTimeout(record.authTimer);
        if (record.expiryTimer) clearTimeout(record.expiryTimer);
        this.records.delete(connection);
    }

    async activate(record, principalId) {
        if (!principalId || record.closed) return false;
        if (!await this.isProvisioned(principalId)) {
            this.close(record, 'remote_account_not_provisioned');
            return false;
        }
        record.principalId = String(principalId);
        record.authenticated = true;
        record.lastSeenAt = Date.now();
        if (record.authTimer) clearTimeout(record.authTimer);
        record.authTimer = null;
        const expiry = Number(record.connection?._wsApiAuthExpMs);
        if (Number.isFinite(expiry)) {
            const remaining = expiry - Date.now();
            if (remaining <= 0) {
                this.close(record, 'authentication_expired');
                return false;
            }
            record.expiryTimer = setTimeout(
                () => this.close(record, 'authentication_expired'),
                Math.min(remaining, 2_147_483_647)
            );
            record.expiryTimer.unref?.();
        }
        const version = await this.getVersion();
        this.safeSend(record.connection, {
            type: 'welcome',
            connection_id: record.connectionId,
            server: 'fastify',
            version: version?.version || null,
            capabilities: ['register', 'subscribe', 'subscribe-batch', 'unsubscribe', 'ack', 'ping', 'replay'],
            timestamp: new Date().toISOString()
        });
        return true;
    }

    async attach(connection, request = {}) {
        const record = {
            connection,
            connectionId: `sync_${crypto.randomUUID()}`,
            principalId: null,
            source: null,
            capabilities: [],
            authenticated: false,
            subscriptions: new Map(),
            lastSeenAt: Date.now(),
            authTimer: null,
            expiryTimer: null,
            messageQueue: Promise.resolve(),
            closed: false
        };
        this.records.set(connection, record);
        connection.on('message', (raw) => {
            record.messageQueue = record.messageQueue
                .then(() => this.receive(record, raw))
                .catch((error) => {
                    // The client reconnects and replays every stream it holds: the cause must be traceable.
                    this.reportFailure({ principal_id: record.principalId, error: error?.message || String(error) });
                    this.close(record, 'sync_processing_failed');
                });
        });
        connection.on('close', () => this.cleanup(connection));
        connection.on('error', () => this.cleanup(connection));
        try {
            const principalId = await this.authenticateRequest(connection, request);
            if (principalId) await this.activate(record, principalId);
        } catch (_) {
            this.close(record, 'authentication_invalid');
            return;
        }
        if (!record.authenticated && !record.closed) {
            record.authTimer = setTimeout(
                () => this.close(record, 'authentication_required'),
                this.authTimeoutMs
            );
            record.authTimer.unref?.();
        }
    }

    async receive(record, raw) {
        if (record.closed) return;
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch (_) {
            this.close(record, 'invalid_json');
            return;
        }
        record.lastSeenAt = Date.now();
        const type = String(message?.type || '').trim();
        if (!CONTROL_TYPES.has(type)) {
            if (!record.authenticated) this.close(record, 'authentication_required');
            else this.safeSend(record.connection, { type: 'error', code: 'operation_not_allowed' });
            return;
        }
        if (!record.authenticated) {
            if (type !== 'auth') {
                this.close(record, 'authentication_required');
                return;
            }
            try {
                const principalId = await this.authenticateMessage(record.connection, message);
                if (!principalId) this.close(record, 'authentication_required');
                else await this.activate(record, principalId);
            } catch (_) {
                this.close(record, 'authentication_invalid');
            }
            return;
        }
        const validated = await this.validatePrincipal(record.connection);
        if (!validated || String(validated) !== record.principalId) {
            this.close(record, 'authentication_expired');
            return;
        }
        if (type === 'auth') {
            this.safeSend(record.connection, { type: 'error', code: 'already_authenticated' });
        } else if (type === 'register') {
            await this.register(record, message);
        } else if (type === 'subscribe') {
            await this.subscribe(record, message);
        } else if (type === 'unsubscribe') {
            this.unsubscribe(record, message);
        } else if (type === 'ack') {
            this.ack(record, message);
        } else {
            this.safeSend(record.connection, { type: 'pong', timestamp: new Date().toISOString() });
        }
    }

    async register(record, message) {
        const source = String(message.source || message.client_id || message.clientId || '').trim();
        if (!source) {
            this.safeSend(record.connection, { type: 'error', code: 'source_required' });
            return;
        }
        record.source = source;
        record.capabilities = Array.isArray(message.capabilities)
            ? message.capabilities.map(String).slice(0, 32)
            : [];
        const streams = typeof this.vaultRouter.listAuthorizedStreams === 'function'
            ? await this.vaultRouter.listAuthorizedStreams(record.principalId)
            : [];
        this.safeSend(record.connection, {
            type: 'registered',
            connection_id: record.connectionId,
            principal_id: record.principalId,
            source,
            streams
        });
    }

    async subscribe(record, message) {
        if (Array.isArray(message.streams)) {
            await this.subscribeBatch(record, message.streams);
            return;
        }
        const stream = String(message.stream || message.stream_id || '').trim();
        if (!stream) {
            this.safeSend(record.connection, { type: 'error', code: 'stream_required' });
            return;
        }
        if (!record.source) {
            this.safeSend(record.connection, { type: 'error', code: 'register_required' });
            return;
        }
        const directory = stream === DIRECTORY_STREAM;
        if (!directory && !await this.vaultRouter.streamAccess(record.principalId, stream)) {
            this.safeSend(record.connection, { type: 'error', code: 'stream_access_denied', stream });
            return;
        }
        const cursor = numberCursor(message.cursor);
        record.subscriptions.set(stream, { cursor, acked: cursor });
        this.safeSend(record.connection, { type: 'subscribed', stream, cursor });
        if (directory) await this.replayDirectory(record);
        else await this.replay(record, stream);
    }

    // A reconnection subscribes every stream it holds, thousands of them: one message carries
    // up to SUBSCRIBE_BATCH_LIMIT cursors, access and heads are read in bulk, only the streams
    // behind their head are replayed, and one `replay-complete` lists those streams.
    async subscribeBatch(record, entries) {
        if (!record.source) {
            this.safeSend(record.connection, { type: 'error', code: 'register_required' });
            return;
        }
        if (entries.length > SUBSCRIBE_BATCH_LIMIT) {
            this.safeSend(record.connection, { type: 'error', code: 'subscribe_batch_too_large', limit: SUBSCRIBE_BATCH_LIMIT });
            return;
        }
        const cursors = new Map();
        for (const entry of entries) {
            const stream = String(entry?.stream || entry?.stream_id || '').trim();
            if (stream) cursors.set(stream, numberCursor(entry.cursor));
        }
        const directoryCursor = cursors.get(DIRECTORY_STREAM);
        cursors.delete(DIRECTORY_STREAM);
        const heads = await this.vaultRouter.authorizedStreamHeads(record.principalId, Array.from(cursors.keys()));
        const denied = [];
        for (const [stream, cursor] of cursors) {
            if (heads.has(stream)) record.subscriptions.set(stream, { cursor, acked: cursor });
            else denied.push(stream);
        }
        if (denied.length) this.safeSend(record.connection, { type: 'error', code: 'stream_access_denied', streams: denied });
        const replayed = [];
        if (directoryCursor != null) {
            record.subscriptions.set(DIRECTORY_STREAM, { cursor: directoryCursor, acked: directoryCursor });
            const reached = await this.replayDirectory(record, { announce: false });
            if (reached != null) replayed.push({ stream: DIRECTORY_STREAM, cursor: reached });
        }
        for (const [stream, cursor] of cursors) {
            if (record.closed) return;
            if (!heads.has(stream) || heads.get(stream) <= cursor) continue;
            const reached = await this.replay(record, stream, { announce: false });
            if (reached != null) replayed.push({ stream, cursor: reached });
        }
        if (!record.closed) this.safeSend(record.connection, { type: 'replay-complete', streams: replayed });
    }

    unsubscribe(record, message) {
        const stream = String(message.stream || message.stream_id || '').trim();
        record.subscriptions.delete(stream);
        this.safeSend(record.connection, { type: 'unsubscribed', stream });
    }

    ack(record, message) {
        const stream = String(message.stream || message.stream_id || '').trim();
        const subscription = record.subscriptions.get(stream);
        if (!subscription) {
            this.safeSend(record.connection, { type: 'error', code: 'subscription_required', stream });
            return;
        }
        const sequence = numberCursor(message.sequence ?? message.cursor);
        subscription.acked = Math.max(subscription.acked, Math.min(sequence, subscription.cursor));
        this.safeSend(record.connection, { type: 'acked', stream, sequence: subscription.acked });
    }

    // Returns the cursor reached, or null when the stream was revoked or the connection closed.
    async replay(record, stream, { announce = true } = {}) {
        const subscription = record.subscriptions.get(stream);
        if (!subscription) return null;
        while (!record.closed) {
            if (!await this.vaultRouter.streamAccess(record.principalId, stream)) {
                record.subscriptions.delete(stream);
                this.safeSend(record.connection, { type: 'revoked', stream });
                return null;
            }
            const events = await this.vaultRouter.listStreamEvents(record.principalId, stream, {
                cursor: subscription.cursor,
                limit: 500
            });
            if (!events.length) break;
            for (const event of events) {
                if (!await this.vaultRouter.streamAccess(record.principalId, stream)) {
                    record.subscriptions.delete(stream);
                    this.safeSend(record.connection, { type: 'revoked', stream });
                    return null;
                }
                this.safeSend(record.connection, eventEnvelope(event, true));
                subscription.cursor = Math.max(subscription.cursor, Number(event.sequence));
            }
            if (events.length < 500) break;
        }
        if (record.closed) return null;
        if (announce) {
            this.safeSend(record.connection, { type: 'replay-complete', stream, cursor: subscription.cursor });
        }
        return subscription.cursor;
    }

    async replayDirectory(record, { announce = true } = {}) {
        const stream = DIRECTORY_STREAM;
        const subscription = record.subscriptions.get(stream);
        if (!subscription || !this.directoryService) return null;
        const events = await this.directoryService.listEvents(subscription.cursor, 1000);
        for (const event of events) {
            this.safeSend(record.connection, eventEnvelope(event, true));
            subscription.cursor = Math.max(subscription.cursor, Number(event.sequence));
        }
        if (announce) this.safeSend(record.connection, { type: 'replay-complete', stream, cursor: subscription.cursor });
        return subscription.cursor;
    }

    async publish(event) {
        const stream = String(event?.stream_id || event?.stream || '').trim();
        if (!stream) return 0;
        let delivered = 0;
        for (const record of this.records.values()) {
            if (!record.authenticated || record.closed) continue;
            if (await this.validatePrincipal(record.connection) !== record.principalId) {
                this.close(record, 'authentication_expired');
                continue;
            }
            const access = await this.vaultRouter.streamAccess(record.principalId, stream);
            if (!record.subscriptions.has(stream)) {
                if (access) {
                    this.safeSend(record.connection, { type: 'stream-available', stream });
                    delivered += 1;
                }
                continue;
            }
            if (!access) {
                record.subscriptions.delete(stream);
                this.safeSend(record.connection, { type: 'revoked', stream });
                delivered += 1;
                continue;
            }
            if (record.source && event.source && record.source === String(event.source)) continue;
            const projected = await this.vaultRouter.projectEventForPrincipal(record.principalId, event);
            if (!projected) continue;
            const subscription = record.subscriptions.get(stream);
            if (Number(event.sequence) <= subscription.cursor) continue;
            this.safeSend(record.connection, eventEnvelope(projected, false));
            subscription.cursor = Number(event.sequence);
            delivered += 1;
        }
        return delivered;
    }

    async publishDirectory(event) {
        let delivered = 0;
        for (const record of this.records.values()) {
            const subscription = record.subscriptions.get(DIRECTORY_STREAM);
            if (!record.authenticated || record.closed || !subscription) continue;
            if (Number(event.sequence) <= subscription.cursor) continue;
            this.safeSend(record.connection, eventEnvelope(event, false));
            subscription.cursor = Number(event.sequence);
            delivered += 1;
        }
        return delivered;
    }

    setDirectoryService(service) {
        this.directoryService = service;
    }

    async replayPrincipalStream(principalId, stream) {
        const tasks = [];
        for (const record of this.records.values()) {
            if (record.principalId !== String(principalId) || !record.subscriptions.has(String(stream))) continue;
            tasks.push(this.replay(record, String(stream)));
        }
        await Promise.all(tasks);
        return tasks.length;
    }

    async grantStream(principalId, stream) {
        let delivered = 0;
        for (const record of this.records.values()) {
            if (record.principalId !== String(principalId) || record.closed) continue;
            this.safeSend(record.connection, { type: 'stream-available', stream: String(stream) });
            delivered += 1;
        }
        return delivered;
    }

    revokeStream(principalId, stream) {
        let delivered = 0;
        for (const record of this.records.values()) {
            if (record.principalId !== String(principalId) || record.closed) continue;
            record.subscriptions.delete(String(stream));
            this.safeSend(record.connection, { type: 'revoked', stream: String(stream) });
            delivered += 1;
        }
        return delivered;
    }

    sweep(now = Date.now()) {
        for (const record of this.records.values()) {
            if (now - record.lastSeenAt > this.idleTimeoutMs) this.close(record, 'heartbeat_timeout');
        }
    }

    stop() {
        clearInterval(this.sweepTimer);
        for (const record of Array.from(this.records.values())) this.close(record, null, 'server_shutdown');
    }

    snapshot() {
        return Array.from(this.records.values()).map((record) => ({
            connection_id: record.connectionId,
            principal_id: record.principalId,
            source: record.source,
            authenticated: record.authenticated,
            streams: Array.from(record.subscriptions.keys())
        }));
    }
}

export const createWsSyncRuntime = (options) => new WsSyncRuntime(options);
