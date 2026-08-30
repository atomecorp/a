// Extracted from adole_websocket.js: TauriWebSocket#handleMessage — inbound WS message dispatch.
// Applied as a prototype mixin so `this` stays bound to the socket instance.
//
// Shape: two tables and two helpers instead of 26 `if (message.type === …)`
// branches. `request_id`/`requestId` is normalised once at the entry (it was read
// 34 times), and the "resolve the pending request" block — 12 near-identical
// copies — lives in `resolvePending` only.
import { reportRuntimeError } from '../../runtime_errors.js';

// Server pushes with no request id: re-emitted on `window` as `squirrel:<type>`.
// Value = how to build the event detail from the message.
const PUSH_EVENTS = {
    'surface-presence': (message) => ({
        event: message.event || null,
        surface: message.surface || null,
        timestamp: message.timestamp || null
    }),
    'teleport-offer': teleportDetail,
    'teleport-arrived': teleportDetail,
    'teleport-cancelled': teleportDetail,
    'surface-grant-request': grantDetail,
    'surface-grant-granted': grantDetail,
    'surface-grant-denied': grantDetail,
    'surface-grant-revoked': grantDetail,
    'remote-control-started': remoteControlDetail,
    'remote-control-input': remoteControlDetail,
    'remote-control-ended': remoteControlDetail,
    'remote-control-preview-request': remoteControlDetail,
    'remote-control-preview-frame': remoteControlDetail,
    'remote-control-preview-stopped': remoteControlDetail
};

PUSH_EVENTS['share-invitation'] = (message) => {
    const streams = Array.isArray(message.streams) ? message.streams : [];
    window.Squirrel?.SyncEngine?.observeEvents?.(streams.map((stream) => ({ stream_id: stream })));
    return { share: message.share || null, streams };
};
PUSH_EVENTS['share-decision'] = (message) => ({ share: message.share || null });
PUSH_EVENTS['share-revoked'] = (message) => ({
    share_id: message.share_id || null,
    stream_id: message.stream_id || null
});

function teleportDetail(message) {
    return {
        atomeId: message.atome_id || null,
        atome_id: message.atome_id || null,
        sessionId: message.session_id || null,
        session_id: message.session_id || null,
        surfaceId: message.surface_id || null,
        fromSurfaceId: message.from_surface_id || null,
        fromUserId: message.from_user_id || null,
        originSurfaceId: message.origin_surface_id || null,
        reason: message.reason || null,
        timestamp: message.timestamp || null
    };
}

function grantDetail(message) {
    return {
        grant: message.grant || null,
        fromUserId: message.from_user_id || null,
        timestamp: message.timestamp || null
    };
}

function remoteControlDetail(message) {
    return {
        session: message.session || null,
        sessionId: message.session_id || message.session?.session_id || null,
        input: message.input || null,
        payload: message.payload || null,
        fromSurfaceId: message.from_surface_id || null,
        reason: message.reason || null,
        frame: message.frame || null,
        width: message.width || null,
        height: message.height || null,
        timestamp: message.timestamp || null
    };
}

// Replies that settle a pending request. Value = the type-specific fields added
// to the common `{ ok, success, status, error }` envelope.
const RESPONSE_PAYLOADS = {
    'surface-grant-response': (message) => ({
        grant: message.grant,
        grants: message.grants,
        reused: message.reused,
        revokedBy: message.revoked_by
    }),
    'remote-control-response': (message) => ({
        session: message.session,
        sessions: message.sessions,
        delivered: message.delivered
    }),
    'teleport-response': (message) => ({
        atomeId: message.atome_id,
        sessionId: message.session_id,
        surfaceId: message.surface_id,
        targetSurfaceId: message.target_surface_id,
        state: message.state,
        teleport: message.teleport,
        surfaces: message.surfaces,
        destination: message.destination,
        reason: message.reason
    }),
    'surface-response': (message) => ({
        surface: message.surface,
        surfaces: message.surfaces,
        shared: message.shared,
        restored_atome_ids: message.restored_atome_ids
    }),
    'auth-response': (message) => ({
        user: message.user,
        token: message.token,
        userId: message.userId,
        code: message.code,
        otpBypassed: message.otpBypassed,
        context: message.context
    }),
    'atome-response': (message) => ({
        // Server may reply with { atome } for create/get
        atome: message.atome,
        data: message.data ?? message.atome ?? message,
        atomes: message.atomes,
        count: message.count,
        history: message.history,
        versions: message.versions,
        events: message.events
    }),
    'file-response': (message) => ({ data: message.data ?? message }),
    'debug-response': (message) => ({ tables: message.tables }),
    'share-response': (message) => ({
        data: message.data,
        count: message.count,
        atome_id: message.atome_id,
        permission: message.permission,
        granted: message.granted
    }),
    'direct-message-response': (message) => ({ delivered: message.delivered })
};

// Data-plane replies that may carry their payload either inline or under `data`.
const DATA_PAYLOAD_TYPES = ['events-response', 'state-current-response', 'snapshot-response',
    'user-data-response', 'sync-response', 'conditions-response', 'history-response', 'directory-response'];
const DATA_PAYLOAD_KEYS = ['event', 'events', 'state', 'states', 'snapshot', 'snapshots',
    'snapshot_id', 'atomes', 'changes', 'deleted', 'acknowledged', 'items', 'ids', 'total',
    'cursor', 'revision', 'entries'];

for (const type of DATA_PAYLOAD_TYPES) {
    RESPONSE_PAYLOADS[type] = (message) => {
        const payload = message.data && typeof message.data === 'object' ? message.data : message;
        const fields = { data: message };
        for (const key of DATA_PAYLOAD_KEYS) fields[key] = message[key] ?? payload[key];
        return fields;
    };
}

const dispatchWindowEvent = (name, detail) => {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
        reportRuntimeError(error, 'adole:ws:dispatch', { event: name });
    }
};

// Console messages remain a command/notification surface. Durable Atome changes
// are owned exclusively by SyncEngine on /ws/sync.
const handleConsoleMessage = (message) => {
    const text = message.message;
    if (typeof text !== 'string' || !text.trim().startsWith('{')) return;

    let command = null;
    try {
        command = JSON.parse(text);
    } catch (error) {
        reportRuntimeError(error, 'adole:ws:console-message-json', { from: message.from?.phone || null });
        return;
    }
    if (!command || typeof command.command !== 'string') return;

    const params = command.params || {};
    const senderInfo = {
        userId: message.from?.userId || message.from?.user_id || null,
        phone: message.from?.phone || null,
        username: message.from?.username || null,
        timestamp: message.timestamp || null
    };

    if (typeof window !== 'undefined' && command.command === 'share-create') {
        const detail = { ...params, sender: senderInfo };
        dispatchWindowEvent('adole-share-create', detail);
        if (detail?.atomeId || detail?.atome_id) dispatchWindowEvent('squirrel:atome-created', detail);
        return;
    }

    const camel = String(command.command).replace(/-([a-z])/g, (_, c) => String(c).toUpperCase());
    const handler = globalThis.BuiltinHandlers?.handlers?.[camel] || null;
    if (typeof handler === 'function') handler(params, senderInfo);
};

export const messageHandlerMixin = {
    handleMessage(data) {
        let message;
        try {
            message = JSON.parse(data);
        } catch (error) {
            // A malformed frame used to vanish without a trace in a transport layer.
            reportRuntimeError(error, 'adole:ws:parse', { preview: String(data).slice(0, 120) });
            return;
        }

        try {
            const type = message.type;
            if (type === 'pong') return;

            if (type === 'console-message') {
                handleConsoleMessage(message);
                return;
            }

            const push = PUSH_EVENTS[type];
            if (push) {
                dispatchWindowEvent(`squirrel:${type}`, push(message));
                return;
            }

            // Normalised once, instead of `message.request_id || message.requestId`
            // repeated at every branch.
            const requestId = message.request_id || message.requestId;
            if (!requestId) return;

            const buildPayload = RESPONSE_PAYLOADS[type];
            if (buildPayload) {
                this.resolvePending(requestId, {
                    ok: message.success,
                    success: message.success,
                    status: message.success ? 200 : 400,
                    error: message.error,
                    ...buildPayload(message)
                });
                return;
            }

            // Unknown reply type carrying a request id: settle it generically so the
            // caller never hangs on its timeout.
            const success = message.success ?? message.ok;
            this.resolvePending(requestId, {
                ok: success !== false,
                success: success !== false,
                status: success === false ? 400 : 200,
                error: message.error,
                data: message.data ?? message
            });
        } catch (error) {
            reportRuntimeError(error, 'adole:ws:handleMessage', { type: message?.type || null });
        }
    },

    resolvePending(requestId, result) {
        const pending = this.pendingRequests.get(requestId);
        if (!pending) return false;
        this.pendingRequests.delete(requestId);
        clearTimeout(pending.timeout);
        pending.resolve(result);
        return true;
    }
};
