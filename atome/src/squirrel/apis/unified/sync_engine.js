import { socketHealthMixin } from './websocket_health.js';
import { CONFIG } from './adole_backend.js';
import { getToken } from './adole_connection.js';

// A key-bound token (`cnf.pop`) is accepted only after this connection signs a
// fresh challenge with the session key; the account owner registers the signer.
let connectionSigner = null;
export const setSyncConnectionSigner = (signer) => { connectionSigner = typeof signer === 'function' ? signer : null; };
const boundToKey = (token) => {
    try { return JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).cnf?.pop === true; } catch (_) { return false; }
};

const DEVICE_KEY = 'squirrel_sync_device_id_v1';
const STREAMS_KEY = 'squirrel_sync_streams_v1';
const CURSORS_KEY = 'squirrel_sync_cursors_v1';
const PERSIST_DELAY_MS = 250;
// Streams announced within this window go out in one `subscribe`.
const SUBSCRIBE_COALESCE_MS = 50;
// Server limit for one `subscribe` carrying many cursors (`subscribe-batch` capability).
const SUBSCRIBE_BATCH_SIZE = 500;

const readJson = (storage, key, fallback) => {
    try {
        const value = JSON.parse(storage?.getItem?.(key) || 'null');
        return value && typeof value === 'object' ? value : fallback;
    } catch (_) {
        return fallback;
    }
};

const writeJson = (storage, key, value) => {
    storage?.setItem?.(key, JSON.stringify(value));
};

const syncUrl = (env) => {
    const explicit = String(env?.__SQUIRREL_FASTIFY_WS_SYNC_URL__ || '').trim();
    if (explicit) return explicit;
    const api = String(env?.__SQUIRREL_FASTIFY_WS_API_URL__ || '').trim();
    return api ? api.replace(/\/ws\/api$/, '/ws/sync') : '';
};

const principalId = (env) => String(
    env?.__currentUser?.id || env?.__authCheckResult?.userId || ''
).trim();

const randomId = (env) => env?.crypto?.randomUUID?.()
    || `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const winningPatch = (message) => {
    const patch = message?.patch && typeof message.patch === 'object' ? message.patch : {};
    const decisions = message?.lww_decisions && typeof message.lww_decisions === 'object'
        ? message.lww_decisions
        : {};
    const props = Object.fromEntries(Object.entries(patch.props || {}).filter(([key]) => (
        decisions[key]?.winner !== false
    )));
    const deleteKeys = (patch.delete_keys || patch.deleteKeys || []).filter((key) => (
        decisions[key]?.winner !== false
    ));
    return { props, deleteKeys };
};

export class SyncEngine {
    constructor(options = {}) {
        this.env = options.env || globalThis.window || globalThis;
        this.WebSocketClass = options.WebSocketClass || this.env?.WebSocket;
        this.token = options.token || (() => getToken(CONFIG.FASTIFY_TOKEN_KEY));
        this.socket = null;
        this.connected = false;
        this.serverVersion = null;
        this.registered = false;
        this.error = '';
        this.reconnectTimer = null;
        this.reconnectAttempt = 0;
        this.batchSubscribe = false;
        this.pendingReplays = 0;
        this.batchSettlement = false;
        this.pendingSubscriptions = new Set();
        this.subscribedStreams = new Set();
        this.subscribeQueue = new Set();
        this.subscribeTimer = null;
        this.subscriptionSerial = 0;
        this.seenEventIds = new Set();
        this.streams = new Set();
        this.cursors = {};
        this.installed = false;
        this.persistTimer = null;
        this.loadedScopeKey = '';
        this.boundLogin = () => this.retry();
        this.boundLogout = () => this.disconnect();
        this.boundOnline = () => this.retry();
        this.boundForeground = () => { if (this.env?.document?.visibilityState !== 'hidden') void this.verifyConnection(); };
        this.boundPageHide = () => this.flushPersist();
        this.source = this.loadDeviceSource();
        this.loadScope();
        this.streams.add('directory.public');
    }

    scopeKey() {
        const environment = String(this.env?.__SQUIRREL_ENVIRONMENT_FINGERPRINT__ || '').trim()
            || syncUrl(this.env);
        return `${environment}|${principalId(this.env) || 'anonymous'}`;
    }

    loadDeviceSource() {
        const storage = this.env?.localStorage;
        let source = String(storage?.getItem?.(DEVICE_KEY) || '').trim();
        if (!source) {
            source = randomId(this.env);
            storage?.setItem?.(DEVICE_KEY, source);
        }
        return source;
    }

    loadScope() {
        const key = this.scopeKey();
        this.loadedScopeKey = key;
        const streamScopes = readJson(this.env?.localStorage, STREAMS_KEY, {});
        const cursorScopes = readJson(this.env?.localStorage, CURSORS_KEY, {});
        this.streams = new Set(Array.isArray(streamScopes[key]) ? streamScopes[key] : []);
        this.streams.add('directory.public');
        this.cursors = cursorScopes[key] && typeof cursorScopes[key] === 'object'
            ? { ...cursorScopes[key] }
            : {};
    }

    // The streams and cursors in memory belong to the scope they were loaded from: they are
    // never written under another account's key (a commit observed before this account's
    // scope was loaded erased its 9 831 streams, iPhone 2026-10-13).
    persistScope() {
        const key = this.loadedScopeKey;
        const storage = this.env?.localStorage;
        const streamScopes = readJson(storage, STREAMS_KEY, {});
        const cursorScopes = readJson(storage, CURSORS_KEY, {});
        streamScopes[key] = Array.from(this.streams);
        cursorScopes[key] = { ...this.cursors };
        writeJson(storage, STREAMS_KEY, streamScopes);
        writeJson(storage, CURSORS_KEY, cursorScopes);
    }

    // A (re)connection delivers one message per stream, thousands of them: the scope is
    // written once per burst instead of once per message.
    schedulePersist() {
        if (this.persistTimer) return;
        this.persistTimer = setTimeout(() => { this.persistTimer = null; this.persistScope(); }, PERSIST_DELAY_MS);
    }

    flushPersist() {
        if (!this.persistTimer) return;
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
        this.persistScope();
    }

    install() {
        if (this.installed) return this;
        this.installed = true;
        this.env?.addEventListener?.('squirrel:user-logged-in', this.boundLogin);
        this.env?.addEventListener?.('squirrel:user-logged-out', this.boundLogout);
        this.env?.addEventListener?.('online', this.boundOnline);
        this.env?.addEventListener?.('pagehide', this.boundPageHide);
        this.env?.document?.addEventListener?.('visibilitychange', this.boundForeground);
        if (principalId(this.env) && this.token()) void this.connect();
        return this;
    }

    getState() {
        return {
            connected: this.connected,
            serverVersion: this.connected ? this.serverVersion : null,
            registered: this.registered,
            pending_replay_count: this.pendingReplays,
            source: this.source,
            principal_id: principalId(this.env) || null,
            environment_fingerprint: this.scopeKey(),
            url: syncUrl(this.env) || null,
            streams: Array.from(this.streams),
            cursors: { ...this.cursors },
            error: this.error || null
        };
    }

    getSource() {
        return this.source;
    }

    async connect() {
        const url = syncUrl(this.env);
        const authToken = this.token();
        if (!url || !authToken || !principalId(this.env) || !this.WebSocketClass) return false;
        if (this.socket && [0, this.WebSocketClass.OPEN].includes(this.socket.readyState)) return true;
        this.disconnect({ reconnect: false });
        this.flushPersist();
        this.loadScope();
        const socket = new this.WebSocketClass(url);
        this.socket = socket;
        socket.onopen = () => {
            if (this.socket !== socket) return;
            this.error = '';
            this.pendingReplays = 0;
            this.pendingSubscriptions.clear();
            this.subscribedStreams.clear();
            socket.send(JSON.stringify(boundToKey(authToken) ? { type: 'auth-challenge', token: authToken } : { type: 'auth', token: authToken }));
        };
        this.authToken = authToken;
        // A replaced socket still delivers its in-flight frames; they belong to no current subscription.
        socket.onmessage = (event) => {
            if (this.socket !== socket) return;
            this.noteInbound();
            this.handleMessage(event.data);
        };
        socket.onerror = () => { this.error = 'sync_connection_error'; };
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.disconnect({ reconnect: true });
        };
        return true;
    }

    send(message) {
        if (!this.socket || this.socket.readyState !== this.WebSocketClass.OPEN) return false;
        this.socket.send(JSON.stringify(message));
        return true;
    }

    handleMessage(raw) {
        let message;
        try { message = JSON.parse(raw); } catch (_) { this.error = 'sync_invalid_json'; return; }
        if (message.type === 'pong') { this.finishHeartbeat(true); return; }
        if (message.type === 'auth-challenge') {
            const socket = this.socket, token = this.authToken;
            if (!connectionSigner) { this.error = 'sync_connection_proof_unavailable'; this.disconnect({ reconnect: true }); return; }
            void Promise.resolve(connectionSigner(message.challenge)).then((signed) => {
                if (this.socket === socket) this.send({ type: 'auth', token, ...signed });
            }, (error) => { this.error = error?.message || 'sync_connection_proof_failed'; if (this.socket === socket) this.disconnect({ reconnect: true }); });
            return;
        }
        if (message.type === 'welcome') {
            this.connected = true;
            this.publishStatus();
            if (this.installed && !this.healthTimer) { this.healthTimer = setInterval(() => { void this.verifyConnection(); }, 30000); this.healthTimer.unref?.(); }
            this.serverVersion = typeof message.version === 'string' && message.version.trim()
                ? message.version.trim() : null;
            this.batchSubscribe = Array.isArray(message.capabilities) && message.capabilities.includes('subscribe-batch');
            this.batchSettlement = Array.isArray(message.capabilities) && message.capabilities.includes('subscribe-batch-settlement');
            this.send({ type: 'register', source: this.source, capabilities: ['events', 'replay'] });
            return;
        }
        if (message.type === 'registered') {
            this.observeEvents((message.streams || []).map((stream) => ({ stream_id: stream })));
            this.registered = true;
            this.subscribeAll();
            this.publishStatus();
            return;
        }
        if (message.type === 'stream-available') {
            this.observeEvents([{ stream_id: message.stream }]);
            return;
        }
        if (message.type === 'event') {
            this.applyEvent(message);
            return;
        }
        if (message.type === 'replay-complete') {
            if (this.batchSubscribe && this.batchSettlement && !message.subscription_id) return;
            if (message.subscription_id && !this.pendingSubscriptions.delete(message.subscription_id)) return;
            const completed = message.settled_streams || (Array.isArray(message.streams) ? message.streams : [message]);
            for (const entry of completed) this.persistCursor(entry?.stream, entry?.cursor);
            this.settleReplay();
            return;
        }
        if (message.type === 'revoked') {
            this.streams.delete(String(message.stream || ''));
            this.persistScope();
            if (!this.batchSubscribe) this.settleReplay();
            return;
        }
        if (message.type === 'error') {
            this.error = String(message.code || 'sync_error');
            this.publishStatus();
            if (message.code !== 'stream_access_denied') return;
            // A batch denial names streams this account no longer reaches: stop resubscribing them.
            if (Array.isArray(message.streams)) {
                for (const stream of message.streams) this.streams.delete(String(stream));
                this.schedulePersist();
            } else if (!this.batchSubscribe) this.settleReplay();
        }
    }

    applyEvent(message) {
        const eventId = String(message.event_id || '').trim();
        const stream = String(message.stream || '').trim();
        const sequence = Number(message.sequence);
        if (!eventId || !stream || !Number.isInteger(sequence)) return;
        if (this.seenEventIds.has(eventId)) {
            this.ack(stream, sequence);
            return;
        }
        this.seenEventIds.add(eventId);
        while (this.seenEventIds.size > 2000) this.seenEventIds.delete(this.seenEventIds.values().next().value);
        const { props, deleteKeys } = winningPatch(message);
        const kind = String(message.kind || '').toLowerCase();
        if (this.env?.__SQUIRREL_SYNC_DEBUG__ === true) {
            this.dispatch('squirrel:sync-debug-event', {
                event_id: eventId, stream, sequence, kind,
                replay: message.replay === true, origin: 'ws/sync'
            });
        }
        if (kind === 'directory.invalidate') {
            this.dispatch('squirrel:directory-invalidated', {
                principal_id: message.patch?.principal_id || null,
                action: message.patch?.action || null,
                revision: message.patch?.revision || null,
                source: 'realtime', origin: 'ws/sync'
            });
            this.persistCursor(stream, sequence);
            this.ack(stream, sequence);
            return;
        }
        const lifecycleWins = message.lww_decisions?.__lifecycle__?.winner !== false;
        const projection = message.projection && typeof message.projection === 'object'
            ? message.projection
            : {};
        const projectionProperties = projection.properties && typeof projection.properties === 'object'
            ? projection.properties
            : {};
        const common = {
            id: message.atome_id,
            atome_id: message.atome_id,
            project_id: message.project_id || projection.project_id || null,
            atome_type: message.atome_type || projection.atome_type || projectionProperties.type || projectionProperties.kind || null,
            event_id: eventId,
            tx_id: message.tx_id,
            gesture_id: message.gesture_id,
            properties: props,
            delete_keys: deleteKeys,
            projection,
            source: 'realtime',
            origin: 'ws/sync',
            durable: true
        };
        if (kind === 'delete' && lifecycleWins) this.dispatch('squirrel:atome-deleted', common);
        else if (kind === 'restore') {
            if (lifecycleWins) this.dispatch('squirrel:atome-restored', {
                ...common, properties: { ...projectionProperties, ...props }
            });
        }
        else if (Object.keys(props).length || deleteKeys.length) this.dispatch('squirrel:atome-updated', common);
        this.persistCursor(stream, sequence);
        this.ack(stream, sequence);
    }

    dispatch(name, detail) {
        if (!this.env?.dispatchEvent || !this.env?.CustomEvent) return;
        this.env.dispatchEvent(new this.env.CustomEvent(name, { detail }));
    }

    persistCursor(stream, sequence) {
        const normalized = Number(sequence);
        if (!stream || !Number.isInteger(normalized)) return;
        // Every (re)connection ends one replay per stream, mostly unchanged: rewriting the
        // whole scope for each of thousands of streams kept the phone busy at idle.
        if (normalized <= (Number(this.cursors[stream]) || 0)) return;
        this.cursors[stream] = normalized;
        this.schedulePersist();
    }

    ack(stream, sequence) {
        this.send({ type: 'ack', stream, sequence });
    }

    // Streams announced one by one (`stream-available`, local commits) are subscribed
    // together: an import creating thousands of Atomes sent one `subscribe` each.
    subscribe(stream) {
        const id = String(stream || '').trim();
        if (!id || !this.registered) return false;
        this.subscribeQueue.add(id);
        if (!this.subscribeTimer) this.subscribeTimer = setTimeout(() => {
            this.subscribeTimer = null;
            const ids = Array.from(this.subscribeQueue);
            this.subscribeQueue.clear();
            if (this.registered) this.subscribeStreams(ids);
        }, SUBSCRIBE_COALESCE_MS);
        return true;
    }

    // One message per SUBSCRIBE_BATCH_SIZE streams when the server accepts it, instead of one per stream.
    subscribeAll() {
        this.subscribeStreams(Array.from(this.streams));
    }

    subscribeStreams(candidates) {
        const streams = candidates.filter(stream => !this.subscribedStreams.has(stream));
        const size = this.batchSubscribe ? SUBSCRIBE_BATCH_SIZE : 1;
        for (let index = 0; index < streams.length; index += size) {
            const batch = streams.slice(index, index + size)
                .map((stream) => ({ stream, cursor: Number(this.cursors[stream]) || 0 }));
            const id = this.batchSubscribe && this.batchSettlement ? `${this.source}:${++this.subscriptionSerial}` : null;
            const message = this.batchSubscribe ? { streams: batch } : batch[0];
            if (this.send({ type: 'subscribe', ...message, ...(id ? { subscription_id: id } : {}) })) {
                batch.forEach(entry => this.subscribedStreams.add(entry.stream));
                if (id) this.pendingSubscriptions.add(id);
                this.pendingReplays += 1;
            }
        }
    }

    // Every subscription of this connection has been answered: only then is the connection
    // proven useful, so a server closing right after authentication keeps backing off.
    settleReplay() {
        this.pendingReplays = Math.max(0, this.pendingReplays - 1);
        if (this.pendingReplays === 0) this.reconnectAttempt = 0;
        this.publishStatus();
    }

    publishStatus() { this.dispatch('squirrel:sync:status', { principal_id: principalId(this.env) }); }

    observeEvents(events = []) {
        if (this.scopeKey() !== this.loadedScopeKey) {
            this.flushPersist();
            this.loadScope();
        }
        let added = false;
        for (const event of events || []) {
            const stream = String(event?.stream_id || event?.stream || '').trim();
            if (!stream) continue;
            if (!this.streams.has(stream)) { this.streams.add(stream); added = true; }
            if (this.registered) this.subscribe(stream);
        }
        if (added) this.schedulePersist();
    }

    async requestSync() {
        const connected = await this.connect();
        return { ok: connected !== false, streams: Array.from(this.streams) };
    }

    scheduleReconnect() {
        if (this.reconnectTimer || !this.installed || !principalId(this.env)) return;
        const delay = Math.min(30_000, 1000 * (2 ** this.reconnectAttempt++));
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect();
        }, delay);
    }

    onHealthTimeout() { this.disconnect({ reconnect: true }); }

    disconnect({ reconnect = false } = {}) {
        this.finishHeartbeat(false);
        clearTimeout(this.subscribeTimer); this.subscribeTimer = null; this.subscribeQueue.clear();
        clearInterval(this.healthTimer); this.healthTimer = null;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        const socket = this.socket;
        this.socket = null;
        this.connected = false;
        this.registered = false;
        this.publishStatus();
        if (socket) socket.close();
        if (reconnect) this.scheduleReconnect();
    }

    retry() {
        this.disconnect({ reconnect: false });
        return this.connect();
    }

    clearFastifyAvailabilityCache() {
        this.error = '';
    }
}

Object.assign(SyncEngine.prototype, socketHealthMixin);

let singleton = null;

export const installSyncEngine = (env = globalThis.window || globalThis) => {
    if (!singleton || singleton.env !== env) singleton = new SyncEngine({ env });
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.SyncEngine = singleton.install();
    return singleton;
};

export default installSyncEngine;
