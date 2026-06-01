import crypto from 'crypto';
import db from '../database/adole.js';
import { getABoxEventBus } from './aBoxServer.js';
import {
    formatAtome,
    resolveSyncAtomeType,
    sanitizeBoundaryAtomeProperties
} from './atomeRouteContract.js';

const SYNC_DEBUG =
    process.env.SQUIRREL_SYNC_DEBUG === '1'
    || process.env.SQUIRREL_SYNC_DEBUG === 'true';

function syncDebugLog(message, data = null) {
    if (!SYNC_DEBUG) return;
    if (data === null || data === undefined) {
        console.log(`[SyncDebug] ${message}`);
        return;
    }
    console.log(`[SyncDebug] ${message}`, data);
}

const hasSoftDeleteMarker = (atome, properties) => {
    if (atome?.deleted === true) return true;
    if (atome?.deleted_at || atome?.deletedAt) return true;
    if (!properties || typeof properties !== 'object') return false;
    return properties.__deleted === true || !!properties.deleted_at || !!properties.deletedAt;
};

const normalizeSyncOperation = (operation, atome, properties) => {
    const raw = String(operation || 'update').trim().toLowerCase();
    const normalized = raw === 'create' || raw === 'delete' || raw === 'update'
        ? raw
        : 'update';
    if (normalized !== 'create' && hasSoftDeleteMarker(atome, properties)) return 'delete';
    return normalized;
};

function syncAtomeViaWebSocket(atome, operation = 'create') {
    try {
        const eventBus = getABoxEventBus();
        if (!eventBus) {
            syncDebugLog('EventBus not available for sync');
            return;
        }

        const atomeId = atome?.id || atome?.atome_id;
        if (!atomeId) {
            syncDebugLog('Missing atome id for sync payload');
            return;
        }
        const properties = sanitizeBoundaryAtomeProperties(atome);
        const atomeType = resolveSyncAtomeType(atome?.type, atome?.atome_type, properties.kind);
        const parentId = atome?.parent_id || atome?.parent || atome?.meta?.parent_id || null;
        const ownerId = atome?.owner_id || atome?.owner || atome?.meta?.owner_id || null;
        const resolvedOperation = normalizeSyncOperation(operation, atome, properties);
        if (resolvedOperation === 'create' && !atomeType) {
            syncDebugLog('Skipping create sync payload without valid atome type');
            return;
        }
        const formatted = formatAtome({
            id: atomeId,
            type: atomeType || null,
            kind: atome?.kind || properties.kind || null,
            renderer: atome?.renderer || null,
            meta: {
                owner_id: ownerId,
                parent_id: parentId,
                created_at: atome.created_at || atome?.meta?.created_at || null,
                updated_at: atome.updated_at || atome?.meta?.updated_at || null,
                deleted: resolvedOperation === 'delete',
                deleted_at: atome?.deleted_at || atome?.deletedAt || properties?.deleted_at || properties?.deletedAt || null
            },
            traits: Array.isArray(atome?.traits) ? atome.traits : [],
            properties
        });

        eventBus.emit('event', {
            type: 'atome-sync',
            operation: resolvedOperation,
            atome: formatted,
            timestamp: new Date().toISOString()
        });

        syncDebugLog('atome sync emitted', {
            operation: resolvedOperation,
            atome_id: atomeId,
            atome_type: atomeType,
            parent_id: parentId,
            owner_id: ownerId
        });
    } catch (error) {
        console.error(`[SyncDebug] WebSocket emit failed: ${error.message}`);
    }
}

async function updateUserSyncHash(userId) {
    const atomes = await db.query('all', `
        SELECT a.atome_id, a.updated_at
        FROM atomes a
        WHERE a.owner_id = ?
        ORDER BY a.atome_id
    `, [userId]);

    let hasherInput = '';
    let count = 0;

    for (const atome of atomes) {
        hasherInput += `${atome.atome_id}:${atome.updated_at};`;
        count++;
    }

    const hash = crypto.createHash('sha256').update(hasherInput).digest('hex').substring(0, 16);
    const now = new Date().toISOString();

    await db.query('run', `
        INSERT INTO sync_state (atome_id, local_hash, sync_status, last_sync_at)
        VALUES (?, ?, 'synced', ?)
        ON CONFLICT(atome_id) DO UPDATE SET
            local_hash = excluded.local_hash,
            sync_status = excluded.sync_status,
            last_sync_at = excluded.last_sync_at
    `, [`user_sync_${userId}`, hash, now]);

    return { hash, count };
}

export {
    syncDebugLog,
    syncAtomeViaWebSocket,
    updateUserSyncHash
};
