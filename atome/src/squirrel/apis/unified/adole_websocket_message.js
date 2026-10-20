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
    'sync:status': message => ({ principal_id: message.data?.principal_id || null }),
    'visio-event': message => ({ roomId: message.room_id, event: message.data }),
    // Native SQLite has committed the cloud projection; consumers re-read the canonical API.
    // A replay announces every stream it changed at once (`streams`), a live event its own `stream`.
    'sync:projection-ready': message => ({
        stream: message.stream || null,
        streams: Array.isArray(message.streams) ? message.streams : [],
        replay: message.replay === true
    }),
    'phone-link-ready': message => ({ attemptId: message.attemptId }),
    // Authentication V1: notices to an account's devices and the answer to a waiting new device.
    'auth-notice': message => ({ kind: message.kind || null, pairId: message.pairId || null, recoveryId: message.recoveryId || null,
        deviceId: message.deviceId || null, label: message.label || '', platform: message.platform || '',
        notBefore: message.notBefore || null, reason: message.reason || null }),
    'auth-pair-update': message => ({ pairId: message.pairId || null, state: message.state || null }),
    'ai-realtime-event': message => ({ session_id: message.session_id, event: message.event }),
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
    'remote-control-preview-stopped': remoteControlDetail,
    'remote-control-command': message => ({
        commandId: message.command_id || null,
        toolId: message.tool_id || null,
        toolAction: message.tool_action || null,
        input: message.input || {},
        confirmed: message.confirmed === true,
        fromSurfaceId: message.from_surface_id || null,
        fromUserId: message.from_user_id || null,
        fromLabel: message.from_label || null,
        timestamp: message.timestamp || null
    })
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
    // Relations pair-a-pair et News diffusees (done/communication_news_broadcast_2026-09-30.md).
    'contact-response': (message) => ({
        status: message.status,
        statuses: message.statuses,
        contacts: message.contacts,
        pending: message.pending,
        refused: message.refused,
        blocked: message.blocked,
        acceptUnknown: message.acceptUnknown,
        count: message.count
    }),
    // La pile renvoyee par le serveur fait foi (lecture, mise a jour, retrait).
    'notification-stack-response': (message) => ({
        stack: message.stack,
        count: message.count,
        notification: message.notification
    }),
    'news-response': (message) => ({
        news_id: message.news_id,
        tags: message.tags,
        delivered: message.delivered,
        filtered: message.filtered,
        blocked: message.blocked,
        failed: message.failed,
        recipients: message.recipients
    }),
    // Communities (server/communities.js): membership, the thread, the host's moderation.
    'community-response': (message) => ({
        joined: message.joined,
        member: message.member,
        host: message.host,
        host_id: message.host_id,
        publications: message.publications,
        members: message.members
    }),
    'surface-grant-response': (message) => ({
        grant: message.grant,
        grants: message.grants,
        reused: message.reused,
        revokedBy: message.revoked_by
    }),
    'remote-control-response': (message) => ({
        session: message.session,
        localSession: message.localSession,
        users: message.users,
        sessions: message.sessions,
        delivered: message.delivered,
        commandId: message.command_id,
        targetSurfaceId: message.target_surface_id,
        targetLabel: message.target_label,
        result: message.result
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
        paymentRequired: message.paymentRequired,
        payment: message.payment,
        developmentLink: message.developmentLink,
        newAccount: message.newAccount,
        attemptId: message.attemptId,
        expiresAt: message.expiresAt,
        serverNow: message.serverNow,
        pairingCode: message.pairingCode,
        challenge: message.challenge,
        session: message.session,
        pending: message.pending,
        approved: message.approved,
        user: message.user,
        token: message.token,
        userId: message.userId,
        // Authentication V1: approve-key registration, pairing, devices, recovery.
        register: message.register,
        credentialId: message.credentialId,
        canApprove: message.canApprove,
        probationUntil: message.probationUntil,
        pairId: message.pairId,
        code: message.code,
        matchNumber: message.matchNumber,
        request: message.request,
        requests: message.requests,
        state: message.state,
        rejected: message.rejected,
        recoveryId: message.recoveryId,
        notBefore: message.notBefore,
        recoveryPending: message.recoveryPending,
        phoneTaken: message.phoneTaken,
        recoveryCodeRequired: message.recoveryCodeRequired,
        devices: message.devices,
        handle: message.handle,
        recoveryCode: message.recoveryCode,

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
        granted: message.granted,
        requests: message.requests ?? message.data?.requests,
        request: message.request ?? message.data?.request,
        revoked: message.revoked ?? message.data?.revoked
    }),
    'direct-message-response': (message) => ({ delivered: message.delivered, receiver_id: message.receiver_id,
        message_id: message.message_id, queued: message.queued, duplicate: message.duplicate }),
    'conversation-response': message => ({ items: message.items, nextCursor: message.nextCursor }),
    'visio-response': message => ({ data: message })
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

    if (typeof window !== 'undefined' && command.command === 'eve-comm-share') {
        dispatchWindowEvent('adole-new-message', {
            ...params,
            // L'identite authentifiee par le serveur fait foi ; celle du payload est ecrite
            // par l'expediteur et ne sert que de repli.
            fromId: senderInfo.userId || params.fromId,
            fromPhone: senderInfo.phone || null,
            fromName: senderInfo.username || params.fromName,
            date: params.date || senderInfo.timestamp,
            persisted: true
        });
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
            reportRuntimeError(new Error('websocket_frame_invalid'), 'adole:ws:parse', { length: String(data).length });
            return;
        }

        try {
            const type = message.type;
            if (type === 'pong') { this.finishHeartbeat?.(true); return; }

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
            if (type === 'ai-provider-progress') {
                this.pendingRequests.get(requestId)?.onProgress?.(message.event);
                return;
            }

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
                http_status: message.http_status,
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
