import db from '../database/adole.js';
import { canAccessFile } from './userFiles.js';
import { resolveWsApiPrincipal } from './wsApiIdentity.js';
import {
    projectAtomeForRead
} from './atomePropertySecurity.js';

const REALTIME_MODES = new Set(['', 'real-time', 'realtime']);

function requestToken(request) {
    const authorization = String(request?.headers?.authorization || '').trim();
    if (authorization.toLowerCase().startsWith('bearer ')) {
        return authorization.slice(7).trim();
    }
    return String(request?.cookies?.access_token || request?.cookies?.token || '').trim();
}

export function authenticateWsSyncRequest(connection, request) {
    const token = requestToken(request);
    if (!token) return null;
    try {
        return resolveWsApiPrincipal(connection, { token }, { registerClient: false });
    } catch (_) {
        return null;
    }
}

export function authenticateWsSyncMessage(connection, message = {}) {
    if (message?.type !== 'auth') return null;
    try {
        return resolveWsApiPrincipal(connection, { token: message.token }, { registerClient: false });
    } catch (_) {
        return null;
    }
}

export function validateWsSyncPrincipal(connection) {
    return resolveWsApiPrincipal(connection, {});
}

async function canReceiveRealtimeAtome(userId, atomeId) {
    if (!userId || !atomeId) return false;
    const atome = await db.query(
        'get',
        'SELECT owner_id FROM atomes WHERE atome_id = ?',
        [atomeId]
    );
    if (!atome) return false;
    if (String(atome.owner_id || '') === String(userId)) return true;
    const permissions = await db.query(
        'all',
        `SELECT particle_key, can_read, share_mode
         FROM permissions
         WHERE atome_id = ?
           AND principal_id = ?
           AND can_read = 1
           AND (expires_at IS NULL OR expires_at > datetime('now'))`,
        [atomeId, userId]
    );
    for (const permission of permissions || []) {
        if (!REALTIME_MODES.has(String(permission.share_mode || '').trim().toLowerCase())) continue;
        if (await db.canRead(atomeId, userId, permission.particle_key || null)) return true;
    }
    return false;
}

async function redactAtomeEvent(payload, userId) {
    const operation = String(payload?.operation || 'update').toLowerCase();
    const sourceAtome = payload?.atome || null;
    const atome = operation === 'delete' && sourceAtome
        ? {
            atome_id: sourceAtome.atome_id || sourceAtome.id || null,
            id: sourceAtome.id || sourceAtome.atome_id || null,
            type: sourceAtome.type || sourceAtome.atome_type || null
        }
        : await projectAtomeForRead(sourceAtome, userId);
    if (!atome) return null;
    return {
        operation,
        atome,
        timestamp: payload?.timestamp || new Date().toISOString()
    };
}

function redactFileEvent(payload) {
    return {
        action: payload?.action || null,
        atome_id: payload?.atome_id || null,
        atome_type: payload?.atome_type || null,
        file_name: payload?.file_name || null,
        is_public: payload?.is_public === true,
        timestamp: payload?.timestamp || new Date().toISOString()
    };
}

export async function filterWsSyncEventForPrincipal(payload, userId) {
    const type = String(payload?.type || '').trim();
    if (!type || !userId) return null;

    if (type === 'atome-sync') {
        const atomeId = payload?.atome?.atome_id || payload?.atome_id || null;
        const operation = String(payload.operation || 'update').toLowerCase();
        if (operation === 'delete') {
            if (!await canReceiveRealtimeAtome(userId, atomeId)) return null;
        } else if (!await canReceiveRealtimeAtome(userId, atomeId)) return null;
        const projectedPayload = await redactAtomeEvent(payload, userId);
        if (!projectedPayload) return null;
        return {
            eventType: operation === 'create'
                ? 'atome:created'
                : (operation === 'delete' ? 'atome:deleted' : 'atome:updated'),
            payload: projectedPayload
        };
    }

    if (type === 'sync:file-event' || type === 'file-event') {
        const atomeId = payload?.atome_id || null;
        if (!atomeId || !await canAccessFile(atomeId, userId, 'read')) return null;
        return { eventType: 'sync:file-event', payload: redactFileEvent(payload) };
    }

    if (type === 'permission-change') {
        const permission = payload?.permission || {};
        const atomeId = permission.atome_id || null;
        const affectedPrincipal = String(permission.principal_id || '') === String(userId);
        if (!affectedPrincipal && !await canReceiveRealtimeAtome(userId, atomeId)) return null;
        return {
            eventType: 'permission-change',
            payload: {
                action: payload.action || null,
                atome_id: atomeId,
                can_read: permission.can_read === 1,
                share_mode: permission.share_mode || null,
                expires_at: permission.expires_at || null,
                timestamp: payload.timestamp || new Date().toISOString()
            }
        };
    }

    return null;
}

export function buildWsSyncWelcome(clientId, version = {}) {
    return {
        type: 'welcome',
        clientId,
        server: 'fastify',
        version: version.version || null,
        timestamp: new Date().toISOString(),
        capabilities: ['events', 'atome-events', 'file-events', 'ping']
    };
}

export function handleWsSyncControlMessage(connection, message = {}) {
    const userId = validateWsSyncPrincipal(connection);
    if (!userId) return { type: 'error', code: 'authentication_required' };
    if (message.type === 'ping') return { type: 'pong' };
    if (message.type === 'register') return { type: 'registered', principal_id: userId };
    return { type: 'error', code: 'operation_not_allowed' };
}
