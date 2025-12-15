import { wsSendJson, wsSendJsonToTargets } from './wsSend.js';

// WS API client registry (for targeted, user-scoped messages)
// userId -> Set<WebSocketConnection>
export const wsApiClientsByUserId = new Map();

// All ws/api connections (authenticated or not)
// Used for debug broadcast probes
export const wsApiConnections = new Set();

// Pending targeted console messages (in-memory)
// userId -> Array<payload>
const pendingConsoleMessagesByUserId = new Map();

export function enqueuePendingConsoleMessage(userId, payload) {
    if (!userId || !payload) return 0;
    if (!pendingConsoleMessagesByUserId.has(userId)) pendingConsoleMessagesByUserId.set(userId, []);
    const queue = pendingConsoleMessagesByUserId.get(userId);
    queue.push({ ...payload, _queuedAt: new Date().toISOString() });
    if (queue.length > 200) queue.splice(0, queue.length - 200);
    return queue.length;
}

export function flushPendingConsoleMessages(connection, userId) {
    if (!userId) return 0;
    const queue = pendingConsoleMessagesByUserId.get(userId);
    if (!queue || queue.length === 0) return 0;

    let sent = 0;
    while (queue.length > 0) {
        const payload = queue.shift();
        const ok = wsSendJson(connection, payload, { scope: 'ws/api', op: 'flush-queued', userId });
        if (!ok) break;
        sent += 1;
    }

    if (queue.length === 0) pendingConsoleMessagesByUserId.delete(userId);
    return sent;
}

export function attachWsApiClientToUser(connection, userId) {
    if (!userId) return;

    try {
        if (connection._wsApiUserId && connection._wsApiUserId !== userId) {
            detachWsApiClient(connection);
        }
    } catch (_) { }

    connection._wsApiUserId = userId;
    if (!wsApiClientsByUserId.has(userId)) wsApiClientsByUserId.set(userId, new Set());
    wsApiClientsByUserId.get(userId).add(connection);

    try {
        const flushed = flushPendingConsoleMessages(connection, userId);
        if (flushed > 0) {
            console.log(`📬 Flushed ${flushed} queued message(s) to user ${userId}`);
        }
    } catch (_) { }
}

export function detachWsApiClient(connection) {
    const userId = connection && connection._wsApiUserId;
    if (!userId) return;
    const set = wsApiClientsByUserId.get(userId);
    if (set) {
        set.delete(connection);
        if (set.size === 0) wsApiClientsByUserId.delete(userId);
    }
    connection._wsApiUserId = null;
}

export function wsSendJsonToUser(userId, payload, meta = null) {
    const targets = wsApiClientsByUserId.get(userId);
    return wsSendJsonToTargets(targets, payload, meta);
}
