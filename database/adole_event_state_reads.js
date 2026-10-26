// ============================================================================
// ADOLE EVENT + STATE READS — events log and state_current queries (ADOLE v3.0)
// ============================================================================
// Read-only access to the `events` log and the `state_current` projection.

import { query, safeParseJson } from './adole_db_core.js';
import { projectStoredStateCurrent } from './adole_storage_projection.js';

export async function listEvents(options = {}) {
    const {
        projectId = null,
        atomeId = null,
        txId = null,
        gestureId = null,
        since = null,
        until = null,
        limit = 1000,
        offset = 0,
        order = 'asc'
    } = options || {};

    const conditions = [];
    const params = [];

    if (projectId) {
        conditions.push('project_id = ?');
        params.push(projectId);
    }
    if (atomeId) {
        conditions.push('atome_id = ?');
        params.push(atomeId);
    }
    if (txId) {
        conditions.push('tx_id = ?');
        params.push(txId);
    }
    if (gestureId) {
        conditions.push('gesture_id = ?');
        params.push(gestureId);
    }
    if (since) {
        conditions.push('ts >= ?');
        params.push(since);
    }
    if (until) {
        conditions.push('ts <= ?');
        params.push(until);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const rows = await query(
        'all',
        `SELECT * FROM events ${where} ORDER BY ts ${orderBy} LIMIT ? OFFSET ?`,
        [...params, Number(limit) || 1000, Number(offset) || 0]
    );

    return (rows || []).map((row) => ({
        ...row,
        payload: safeParseJson(row.payload),
        actor: safeParseJson(row.actor)
    }));
}

export async function getEvent(eventId) {
    if (!eventId) return null;
    const row = await query('get', 'SELECT * FROM events WHERE id = ?', [eventId]);
    if (!row) return null;
    return {
        ...row,
        payload: safeParseJson(row.payload),
        actor: safeParseJson(row.actor)
    };
}

export async function getStateCurrent(atomeId) {
    if (!atomeId) return null;
    const row = await query(
        'get',
        `SELECT sc.*, a.atome_type, a.parent_id
         FROM state_current sc
         LEFT JOIN atomes a ON a.atome_id = sc.atome_id
         WHERE sc.atome_id = ?`,
        [atomeId]
    );
    if (!row) return null;
    return projectStoredStateCurrent(row);
}

const stateCurrentListScope = (projectId, options = {}) => {
    const ownerId = options.ownerId || options.owner_id || null;
    const atomeType = String(options.atomeType || options.atome_type || '').trim().toLowerCase();
    const includeShared = options.includeShared === true || options.include_shared === true;
    const params = [];
    const conditions = [];
    const includeDeleted = options.includeDeleted === true || options.include_deleted === true;
    if (!includeDeleted) {
        conditions.push('a.deleted_at IS NULL');
        conditions.push("COALESCE(json_extract(sc.properties, '$.__deleted'), 0) <> 1");
    }
    if (projectId) {
        conditions.push('sc.project_id = ?');
        params.push(projectId);
    }
    if (atomeType) {
        // Each term matches one schema expression index: no JSON decode of the whole table.
        conditions.push(`(
            sc.atome_id IN (SELECT atome_id FROM atomes WHERE LOWER(COALESCE(atome_type, '')) = ?)
            OR LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) = ?
            OR LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) = ?
        )`);
        params.push(atomeType, atomeType, atomeType);
    }
    if (ownerId) {
        if (includeShared) {
            conditions.push(`(
                COALESCE(sc.owner_id, a.owner_id) = ?
                OR (
                    p.principal_id = ?
                )
            )`);
            params.push(ownerId, ownerId);
        } else {
            conditions.push('(COALESCE(sc.owner_id, a.owner_id) = ? OR COALESCE(sc.owner_id, a.owner_id) IS NULL)');
            params.push(ownerId);
        }
    }
    if (options.excludeSystem === true || options.exclude_system === true) {
        const excludedTypes = "('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')";
        conditions.push(`LOWER(COALESCE(a.atome_type, '')) NOT IN ${excludedTypes}`);
        conditions.push(`LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) NOT IN ${excludedTypes}`);
        conditions.push(`LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) NOT IN ${excludedTypes}`);
        conditions.push("LOWER(sc.atome_id) NOT LIKE 'tool.ui.%' AND LOWER(sc.atome_id) NOT LIKE 'tool_ui.%'");
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const join = includeShared && ownerId
        ? `LEFT JOIN atomes a ON a.atome_id = sc.atome_id
           LEFT JOIN permissions p ON p.atome_id = sc.atome_id
             AND p.principal_id = ?
             AND p.can_read = 1
             AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))`
        : 'LEFT JOIN atomes a ON a.atome_id = sc.atome_id';
    return { join, where, params: includeShared && ownerId ? [ownerId, ...params] : params };
};

export async function listStateCurrent(projectId, options = {}) {
    const limit = Number(options.limit) || 1000;
    const offset = Number(options.offset) || 0;
    const scope = stateCurrentListScope(projectId, options);
    // `order: 'oldest'` walks the states oldest change first, from after the cursor
    // `{ updated_at, atome_id }` of the last one received: a state changed during the
    // walk moves to its end and is read again, where an offset over the newest first
    // let it, and the one after a page, slip away (a restore missed them).
    const oldest = options.order === 'oldest';
    const after = oldest && options.after && typeof options.after === 'object' ? options.after : null;
    const cursor = after
        ? `${scope.where ? `${scope.where} AND` : 'WHERE'} (COALESCE(sc.updated_at, '') > ? OR (COALESCE(sc.updated_at, '') = ? AND sc.atome_id > ?))`
        : scope.where;
    const cursorParams = after ? [String(after.updated_at || ''), String(after.updated_at || ''), String(after.atome_id || '')] : [];
    const order = oldest ? "COALESCE(sc.updated_at, '') ASC, sc.atome_id ASC" : 'sc.updated_at DESC, sc.atome_id';

    // The page is chosen on ids only: DISTINCT + ORDER BY over whole rows made
    // SQLite spill OFFSET + LIMIT `properties` blobs to a temporary file per page.
    const rows = await query(
        'all',
        `SELECT sc.*, a.atome_type AS atome_type, a.parent_id AS parent_id,
                COALESCE(sc.owner_id, a.owner_id) AS owner_id
         FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id
         WHERE sc.atome_id IN (
             SELECT sc.atome_id FROM state_current sc ${scope.join} ${cursor}
             GROUP BY sc.atome_id ORDER BY ${order} LIMIT ? OFFSET ?)
         ORDER BY ${order}`,
        [...scope.params, ...cursorParams, limit, oldest ? 0 : offset]
    );

    return (rows || []).map((row) => projectStoredStateCurrent(row)).filter(Boolean);
}

export async function countStateCurrent(projectId, options = {}) {
    const scope = stateCurrentListScope(projectId, options);
    const row = await query(
        'get',
        `SELECT COUNT(DISTINCT sc.atome_id) AS total FROM state_current sc ${scope.join} ${scope.where}`,
        scope.params
    );
    return Math.max(0, Number(row?.total) || 0);
}
