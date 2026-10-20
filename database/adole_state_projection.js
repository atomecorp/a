// ============================================================================
// ADOLE STATE PROJECTION — event → state_current projection (ADOLE v3.0)
// ============================================================================
// Projects events and direct mutations into `state_current` (and the atome
// envelope), and rebuilds the projection from the append-only `events` log.

import { query, safeParseJson, withTransaction } from './adole_db_core.js';
import { sanitizeAtomeProperties } from '../atome/src/shared/atome_contract.js';
import {
    eventDeletedPropertyKeys,
    extractEventPatch,
    stripEventMetaPatch
} from '../atome/src/shared/adole_event_contract.js';
import { upsertAtomeFromEvent } from './adole_event_atome_upsert.js';
import { eventMutations } from './adole_api_instances.js';

export function resolveActorId(actor) {
    if (!actor || typeof actor !== 'object') return null;
    return actor.id || actor.user_id || actor.userId || null;
}

export function resolveEventType(patch) {
    if (!patch || typeof patch !== 'object') return null;
    const declaredType = patch.type || patch.atome_type || null;
    const kind = patch.kind || null;
    return declaredType && String(declaredType).toLowerCase() !== 'generic'
        ? declaredType
        : (kind || declaredType);
}

function resolveEventParentId(patch) {
    if (!patch || typeof patch !== 'object') return null;
    return patch.parent_id || patch.parentId || patch.project_id || patch.projectId || null;
}

function resolveStateProjectId({ atomeId, atomeType, parentId, properties }) {
    const props = properties && typeof properties === 'object' ? properties : {};
    const explicitProject = props.projectId || props.project_id || null;
    if (explicitProject) return explicitProject;
    if (atomeType === 'project' && atomeId) return atomeId;
    const explicitParent = props.parentId || props.parent_id || null;
    if (explicitParent) return explicitParent;
    return parentId || null;
}

function buildStatePatch({ atomeType, kind, parentId, projectId, properties }) {
    const patch = properties && typeof properties === 'object' ? { ...properties } : {};
    if (atomeType && patch.type == null && patch.atome_type == null && patch.kind == null) {
        patch.type = atomeType;
    }
    if (kind && patch.kind == null) {
        patch.kind = kind;
    }
    if (parentId && patch.parent_id == null && patch.parentId == null) {
        patch.parent_id = parentId;
    }
    if (projectId && patch.project_id == null && patch.projectId == null) {
        patch.project_id = projectId;
    }
    return patch;
}

export async function upsertStateCurrentFromMutation({
    atomeId,
    type,
    kind,
    parentId,
    properties,
    projectId,
    ts
}) {
    if (!atomeId) return null;
    const resolvedProjectId = projectId || resolveStateProjectId({
        atomeId,
        atomeType: type,
        parentId,
        properties
    });
    const patch = buildStatePatch({
        atomeType: type,
        kind,
        parentId,
        projectId: resolvedProjectId,
        properties
    });
    if (!patch || Object.keys(patch).length === 0) return null;
    return applyEventToStateCurrent({
        atome_id: atomeId,
        project_id: resolvedProjectId,
        kind: 'set',
        payload: { props: patch },
        ts: ts || new Date().toISOString()
    });
}

export async function applyEventToStateCurrent(event, options = {}) {
    const atomeId = event.atome_id;
    if (!atomeId) return null;

    const ts = event.ts || new Date().toISOString();
    const sourcePatch = extractEventPatch(event.kind, event.payload, ts);
    if (!sourcePatch) return null;
    const patch = { ...sourcePatch };

    const actorId = resolveActorId(event.actor);
    const patchOwnerId = patch.owner_id || patch.ownerId || patch.owner || null;
    const eventOwnerId = event.owner_id || event.ownerId || event.owner || null;
    const patchType = resolveEventType(patch);
    const patchParent = resolveEventParentId(patch);
    const deleted = patch.__deleted === true;
    const restored = patch.__deleted === false && String(event.kind || '').toLowerCase() === 'restore';
    const particlePatch = sanitizeAtomeProperties(stripEventMetaPatch(patch));
    const deletedKeys = eventDeletedPropertyKeys(event);

    const ownerFromEvent = eventOwnerId || patchOwnerId || actorId || null;
    await upsertAtomeFromEvent({
        atomeId,
        atomeType: patchType,
        parentId: patchParent,
        ownerId: ownerFromEvent,
        ts,
        deleted,
        restored,
        properties: particlePatch,
        writeParticles: options.writeParticles !== false,
        eventId: event.id || null
    });
    if (options.writeParticles !== false && deletedKeys.length) {
        await eventMutations.applyDeletes({
            atomeId,
            keys: deletedKeys,
            author: actorId,
            timestamp: ts,
            eventId: event.id || null
        });
    }

    if (patch.type == null && patch.atome_type == null && patch.kind == null) {
        const row = await query(
            'get',
            'SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?',
            [atomeId]
        );
        if (row?.atome_type) {
            patch.type = row.atome_type;
        }
        if (row?.parent_id && patch.parent_id == null && patch.parentId == null) {
            patch.parent_id = row.parent_id;
        }
    }

    const existing = await query(
        'get',
        'SELECT properties, version, project_id, owner_id FROM state_current WHERE atome_id = ?',
        [atomeId]
    );

    let resolvedOwnerId = eventOwnerId || patchOwnerId || actorId || existing?.owner_id || null;
    try {
        const ownerRow = await query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
        if (ownerRow?.owner_id) {
            resolvedOwnerId = ownerRow.owner_id;
        }
    } catch (error) {
        if (process.env.SQUIRREL_ADOLE_DEBUG === '1') {
            console.warn('[ADOLE] state owner lookup failed:', error.message);
        }
    }

    const parsed = safeParseJson(existing?.properties);
    const currentProps = parsed && typeof parsed === 'object' ? parsed : {};
    const nextProps = { ...currentProps, ...sanitizeAtomeProperties(patch) };
    deletedKeys.forEach((key) => delete nextProps[key]);
    const nextVersion = (existing?.version || 0) + 1;
    const globalScope = event.payload?.scope === 'global';
    const projectId = globalScope ? null : (event.project_id || existing?.project_id || null);

    if (existing) {
        await query(
            'run',
            'UPDATE state_current SET properties = ?, updated_at = ?, version = ?, project_id = ?, owner_id = COALESCE(?, owner_id) WHERE atome_id = ?',
            [JSON.stringify(nextProps), ts, nextVersion, projectId, resolvedOwnerId, atomeId]
        );
    } else {
        await query(
            'run',
            'INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES (?, ?, ?, ?, ?, ?)',
            [atomeId, resolvedOwnerId, projectId, JSON.stringify(nextProps), ts, nextVersion]
        );
    }

    return {
        atome_id: atomeId,
        owner_id: resolvedOwnerId,
        project_id: projectId,
        properties: nextProps,
        updated_at: ts,
        version: nextVersion
    };
}

export async function rebuildStateCurrentFromEvents(options = {}) {
    const all = options.all === true || options.scope === 'all';
    const projectId = options.projectId || options.project_id || null;
    const atomeId = options.atomeId || options.atome_id || null;
    const limit = Math.max(1, Math.min(Number(options.limit) || 100000, 1000000));
    if (!all && !projectId && !atomeId) {
        throw new Error('rebuild_state_current_scope_required');
    }

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
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const scope = all ? 'all' : (projectId && atomeId ? 'project_and_atome' : (projectId ? 'project' : 'atome'));
    const applied = [];
    let eventCount = 0;

    await withTransaction(async () => {
        if (all) {
            await query('run', 'DELETE FROM state_current');
        } else if (projectId && atomeId) {
            await query('run', 'DELETE FROM state_current WHERE project_id = ? OR atome_id = ?', [projectId, atomeId]);
        } else if (projectId) {
            await query('run', 'DELETE FROM state_current WHERE project_id = ?', [projectId]);
        } else {
            await query('run', 'DELETE FROM state_current WHERE atome_id = ?', [atomeId]);
        }

        const rows = await query(
            'all',
            `SELECT * FROM events ${where}
             ORDER BY CASE WHEN julianday(ts) IS NULL THEN 0 ELSE 1 END ASC,
                      julianday(ts) ASC, id ASC LIMIT ?`,
            [...params, limit]
        );
        eventCount = rows.length;
        for (const row of rows) {
            const projected = await applyEventToStateCurrent({
                ...row,
                payload: safeParseJson(row.payload),
                actor: safeParseJson(row.actor)
            }, {
                writeParticles: false
            });
            if (projected) applied.push(projected);
        }
    });

    return {
        ok: true,
        scope,
        project_id: projectId,
        atome_id: atomeId,
        event_count: eventCount,
        projection_count: applied.length
    };
}
