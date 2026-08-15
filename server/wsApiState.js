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
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }

    connection._wsApiUserId = userId;
    if (!wsApiClientsByUserId.has(userId)) wsApiClientsByUserId.set(userId, new Set());
    wsApiClientsByUserId.get(userId).add(connection);

    try {
        const flushed = flushPendingConsoleMessages(connection, userId);
        if (flushed > 0) {
            console.log(`📬 Flushed ${flushed} queued message(s) to user ${userId}`);
        }
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }
}

export function detachWsApiClient(connection) {
    const userId = connection && connection._wsApiUserId;
    if (!userId) return;
    detachWsApiSurface(connection);
    const set = wsApiClientsByUserId.get(userId);
    if (set) {
        set.delete(connection);
        if (set.size === 0) wsApiClientsByUserId.delete(userId);
    }
    connection._wsApiUserId = null;
    connection._wsApiAuthExpMs = null;
}

export function wsSendJsonToUser(userId, payload, meta = null) {
    const targets = wsApiClientsByUserId.get(userId);
    return wsSendJsonToTargets(targets, payload, meta);
}

// Same as wsSendJsonToUser but allows excluding the sender connection (multi-tab).
export function wsSendJsonToUserExcept(userId, payload, excludeConnection, meta = null) {
    const targets = wsApiClientsByUserId.get(userId);
    if (!targets || targets.size === 0) {
        return { delivered: false, recipientConnections: 0 };
    }

    if (!excludeConnection) {
        return wsSendJsonToTargets(targets, payload, meta);
    }

    const filtered = new Set();
    targets.forEach((conn) => {
        if (conn && conn !== excludeConnection) filtered.add(conn);
    });
    return wsSendJsonToTargets(filtered, payload, meta);
}

// ---------------------------------------------------------------------------
// Surface registry
//
// A "surface" is one renderable device seat: a browser tab, a Tauri window, an
// iOS app instance. `wsApiClientsByUserId` only knows principals, so a message
// addressed to one device would fan out to every connection the account owns.
// Teleport needs the opposite: a stable, client-persisted `surface_id` that
// survives a reconnection, so an object can be sent to *that* screen.
//
// The surface id is always scoped under the principal attached to the socket.
// It is never read as an identity of its own: an announce for a surface id that
// belongs to another principal creates a distinct entry under the announcing
// principal instead of hijacking the existing one.
// ---------------------------------------------------------------------------

// userId -> Map<surfaceId, descriptor>
export const wsApiSurfacesByUserId = new Map();

const SURFACE_LABEL_MAX = 120;
const SURFACE_PLATFORMS = new Set(['browser', 'tauri', 'ios', 'android', 'unknown']);
const SURFACE_CAPABILITY_KEYS = Object.freeze([
    'render',
    'pointer_input',
    'audio',
    'video',
    'fullscreen'
]);

export function normalizeSurfaceId(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw.length > 64) return '';
    return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
}

function normalizeSurfaceLabel(value) {
    return String(value ?? '').trim().slice(0, SURFACE_LABEL_MAX);
}

function normalizeSurfacePlatform(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    return SURFACE_PLATFORMS.has(raw) ? raw : 'unknown';
}

function normalizeSurfaceCapabilities(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return SURFACE_CAPABILITY_KEYS.reduce((acc, key) => {
        acc[key] = source[key] === true;
        return acc;
    }, {});
}

function publicSurfaceDescriptor(descriptor) {
    if (!descriptor) return null;
    return {
        surface_id: descriptor.surfaceId,
        user_id: descriptor.userId,
        label: descriptor.label,
        platform: descriptor.platform,
        capabilities: { ...descriptor.capabilities },
        announced_at: descriptor.announcedAt,
        last_seen_at: descriptor.lastSeenAt,
        online: true
    };
}

export function attachWsApiSurface(connection, userId, descriptor = {}) {
    if (!connection || !userId) return null;
    const surfaceId = normalizeSurfaceId(descriptor.surfaceId ?? descriptor.surface_id);
    if (!surfaceId) return null;

    // A socket carries exactly one surface. Re-announcing under a new id retires
    // the previous binding instead of leaving a phantom entry behind.
    if (connection._wsApiSurfaceId && connection._wsApiSurfaceId !== surfaceId) {
        detachWsApiSurface(connection);
    }

    if (!wsApiSurfacesByUserId.has(userId)) wsApiSurfacesByUserId.set(userId, new Map());
    const surfaces = wsApiSurfacesByUserId.get(userId);

    // Reconnection: the same persisted surface id comes back on a fresh socket.
    // The newest socket wins; the stale one keeps working as a plain client
    // connection but no longer answers for the surface.
    const previous = surfaces.get(surfaceId);
    if (previous && previous.connection && previous.connection !== connection) {
        previous.connection._wsApiSurfaceId = null;
    }

    const nowIso = new Date().toISOString();
    const entry = {
        surfaceId,
        userId: String(userId),
        connection,
        label: normalizeSurfaceLabel(descriptor.label) || previous?.label || '',
        platform: normalizeSurfacePlatform(descriptor.platform),
        capabilities: normalizeSurfaceCapabilities(descriptor.capabilities),
        announcedAt: previous?.announcedAt || nowIso,
        lastSeenAt: nowIso
    };
    surfaces.set(surfaceId, entry);
    connection._wsApiSurfaceId = surfaceId;
    return publicSurfaceDescriptor(entry);
}

export function detachWsApiSurface(connection) {
    const surfaceId = connection && connection._wsApiSurfaceId;
    const userId = connection && connection._wsApiUserId;
    connection && (connection._wsApiSurfaceId = null);
    if (!surfaceId || !userId) return null;

    const surfaces = wsApiSurfacesByUserId.get(userId);
    if (!surfaces) return null;
    const entry = surfaces.get(surfaceId);
    // Only the socket that currently owns the surface may retire it. A stale
    // socket closing after a reconnection must not evict the live one.
    if (!entry || entry.connection !== connection) return null;
    surfaces.delete(surfaceId);
    if (surfaces.size === 0) wsApiSurfacesByUserId.delete(userId);
    return publicSurfaceDescriptor(entry);
}

export function touchWsApiSurface(connection) {
    const entry = resolveWsApiSurfaceEntry(connection?._wsApiUserId, connection?._wsApiSurfaceId);
    if (!entry || entry.connection !== connection) return null;
    entry.lastSeenAt = new Date().toISOString();
    return publicSurfaceDescriptor(entry);
}

function resolveWsApiSurfaceEntry(userId, surfaceId) {
    const normalizedId = normalizeSurfaceId(surfaceId);
    if (!userId || !normalizedId) return null;
    return wsApiSurfacesByUserId.get(String(userId))?.get(normalizedId) || null;
}

export function getWsApiSurface(userId, surfaceId) {
    return publicSurfaceDescriptor(resolveWsApiSurfaceEntry(userId, surfaceId));
}

export function listWsApiSurfacesForUser(userId, { excludeSurfaceId = '' } = {}) {
    const surfaces = wsApiSurfacesByUserId.get(String(userId || ''));
    if (!surfaces) return [];
    const excluded = normalizeSurfaceId(excludeSurfaceId);
    const list = [];
    surfaces.forEach((entry) => {
        if (excluded && entry.surfaceId === excluded) return;
        list.push(publicSurfaceDescriptor(entry));
    });
    return list;
}

export function wsSendJsonToSurface(userId, surfaceId, payload, meta = null) {
    const entry = resolveWsApiSurfaceEntry(userId, surfaceId);
    if (!entry) return { delivered: false, recipientConnections: 0 };
    const delivered = wsSendJson(entry.connection, payload, meta);
    return { delivered, recipientConnections: delivered ? 1 : 0 };
}
