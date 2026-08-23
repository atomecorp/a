import db from '../database/adole.js';
import {
    eventDeletedPropertyKeys,
    eventPropertyPatch,
    eventTouchedPropertyKeys
} from '../database/adole_event_contract.js';

function idOfAtome(atome) {
    return atome?.atome_id || atome?.id || null;
}

function propertiesOfAtome(atome) {
    if (!atome || typeof atome !== 'object') return {};
    const properties = atome.properties || atome.data || {};
    return properties && typeof properties === 'object' && !Array.isArray(properties)
        ? properties
        : {};
}

async function atomeExists(atomeId) {
    if (!atomeId) return false;
    return Boolean(await db.getAtomeById(atomeId));
}

export async function authorizeAtomeEventWrite(event, principalId, { batchCreateIds = null } = {}) {
    const atomeId = event?.atome_id || event?.atomeId || null;
    if (!atomeId || !principalId) {
        return { allowed: false, reason: 'invalid_write_target', deniedKeys: [] };
    }

    const eventKind = String(event.kind || '').toLowerCase();
    if (eventKind === 'restore') {
        const deletedTarget = await db.query(
            'get',
            'SELECT deleted_at FROM atomes WHERE atome_id = ?',
            [atomeId]
        );
        if (!deletedTarget?.deleted_at) {
            return { allowed: false, reason: 'restore_target_not_deleted', deniedKeys: [] };
        }
        const allowed = await db.canDelete(atomeId, principalId);
        return {
            allowed,
            reason: allowed ? 'restore_allowed' : 'restore_denied',
            deniedKeys: allowed ? [] : ['__deleted']
        };
    }

    const exists = await atomeExists(atomeId);
    if (!exists) {
        const patch = eventPropertyPatch(event);
        if (!patch || eventKind === 'delete') {
            return { allowed: false, reason: 'invalid_create_event', deniedKeys: [] };
        }
        const requestedOwner = patch.owner_id || patch.ownerId || patch.owner || principalId;
        if (String(requestedOwner) !== String(principalId)) {
            return { allowed: false, reason: 'create_owner_mismatch', deniedKeys: [] };
        }
        const parentId = patch.parent_id || patch.parentId || patch.project_id || patch.projectId
            || event.parent_id || event.parentId || event.project_id || event.projectId || null;
        const parentCreatedByBatch = parentId && batchCreateIds?.has(String(parentId));
        if (parentId && !parentCreatedByBatch && !await db.canCreate(parentId, principalId)) {
            return { allowed: false, reason: 'parent_create_denied', deniedKeys: [] };
        }
        return { allowed: true, reason: 'owner_create', deniedKeys: [] };
    }

    if (eventKind === 'delete') {
        const allowed = await db.canDelete(atomeId, principalId);
        return {
            allowed,
            reason: allowed ? 'delete_allowed' : 'delete_denied',
            deniedKeys: allowed ? [] : ['__deleted']
        };
    }

    if (String(event.kind || '').toLowerCase() === 'snapshot') {
        const allowed = await db.canWrite(atomeId, principalId);
        return {
            allowed,
            reason: allowed ? 'snapshot_write_allowed' : 'snapshot_write_denied',
            deniedKeys: []
        };
    }

    const parentId = event.parent_id || event.parentId || null;
    if (parentId) {
        if (String(parentId) === String(atomeId)) {
            return { allowed: false, reason: 'parent_cycle_forbidden', deniedKeys: [] };
        }
        const parentCreatedByBatch = batchCreateIds?.has(String(parentId));
        if (!parentCreatedByBatch && !await db.canCreate(parentId, principalId)) {
            return { allowed: false, reason: 'parent_create_denied', deniedKeys: [] };
        }
        if (!await db.canWrite(atomeId, principalId)) {
            return { allowed: false, reason: 'parent_write_denied', deniedKeys: ['parent_id'] };
        }
    }

    const keys = eventTouchedPropertyKeys(event);
    if (!keys.length) {
        if (parentId) {
            return { allowed: true, reason: 'parent_write_allowed', deniedKeys: [] };
        }
        return { allowed: false, reason: 'missing_property_patch', deniedKeys: [] };
    }

    const deniedKeys = [];
    for (const key of keys) {
        if (!await db.canWrite(atomeId, principalId, key)) deniedKeys.push(key);
    }
    return {
        allowed: deniedKeys.length === 0,
        reason: deniedKeys.length ? 'property_write_denied' : 'property_write_allowed',
        deniedKeys
    };
}

export async function authorizeAtomeEventBatch(events, principalId) {
    const batchCreateIds = new Set();
    for (const event of events || []) {
        const atomeId = event?.atome_id || event?.atomeId || null;
        const patch = eventPropertyPatch(event);
        const requestedOwner = patch?.owner_id || patch?.ownerId || patch?.owner || principalId;
        const exists = atomeId ? await atomeExists(atomeId) : true;
        if (
            atomeId
            && !exists
            && patch
            && String(event.kind || '').toLowerCase() !== 'delete'
            && String(requestedOwner) === String(principalId)
        ) {
            batchCreateIds.add(String(atomeId));
        }
    }
    const decisions = [];
    for (const event of events || []) {
        const decision = await authorizeAtomeEventWrite(event, principalId, { batchCreateIds });
        decisions.push({
            atomeId: event?.atome_id || event?.atomeId || null,
            eventId: event?.id || event?.event_id || null,
            ...decision
        });
    }
    const denied = decisions.find((decision) => !decision.allowed) || null;
    return { allowed: !denied, denied, decisions };
}

export async function projectAtomePropertiesForRead(atomeId, properties, principalId) {
    if (!atomeId || !principalId || !properties || typeof properties !== 'object') return {};
    const projected = {};
    for (const [key, value] of Object.entries(properties)) {
        if (await db.canRead(atomeId, principalId, key)) projected[key] = value;
    }
    return projected;
}

export async function projectAtomePropertyVersionsForRead(atomeId, propertyKeys, principalId) {
    if (!atomeId || !principalId || !Array.isArray(propertyKeys)) return {};
    const projected = {};
    for (const key of propertyKeys) {
        if (!await db.canRead(atomeId, principalId, key)) continue;
        const row = await db.query(
            'get',
            'SELECT version FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, key]
        );
        projected[key] = Number(row?.version || 0);
    }
    return projected;
}

export async function projectAtomeCapabilitiesForRead(atomeId, propertyKeys, principalId) {
    if (!atomeId || !principalId || !Array.isArray(propertyKeys)) return {};
    const properties = {};
    for (const key of propertyKeys) {
        if (!await db.canRead(atomeId, principalId, key)) continue;
        properties[key] = {
            write: await db.canWrite(atomeId, principalId, key),
            delete: await db.canDelete(atomeId, principalId, key),
            share: await db.canShare(atomeId, principalId, key)
        };
    }
    return {
        properties,
        create: await db.canCreate(atomeId, principalId),
        delete: await db.canDelete(atomeId, principalId),
        share: await db.canShare(atomeId, principalId)
    };
}

export async function canReadAnyAtomeProperty(atomeId, principalId, propertyKeys = null) {
    if (!atomeId || !principalId) return false;
    if (await db.canRead(atomeId, principalId)) return true;
    let keys = Array.isArray(propertyKeys) ? propertyKeys : null;
    if (!keys) {
        const state = await db.getStateCurrent(atomeId);
        keys = Object.keys(state?.properties || {});
    }
    for (const key of keys) {
        if (await db.canRead(atomeId, principalId, key)) return true;
    }
    return false;
}

export async function projectAtomeForRead(atome, principalId) {
    const atomeId = idOfAtome(atome);
    if (!atomeId || !principalId) return null;
    const properties = await projectAtomePropertiesForRead(
        atomeId,
        propertiesOfAtome(atome),
        principalId
    );
    if (!Object.keys(properties).length) return null;
    return {
        ...atome,
        properties,
        data: atome?.data && typeof atome.data === 'object' ? properties : atome?.data
    };
}

export async function projectEventForRead(event, principalId) {
    const atomeId = event?.atome_id || event?.atomeId || null;
    if (!atomeId || !principalId) return null;
    const patch = eventPropertyPatch(event) || {};
    const projectedPatch = await projectAtomePropertiesForRead(atomeId, patch, principalId);
    const projectedDeletes = [];
    for (const key of eventDeletedPropertyKeys(event)) {
        if (await db.canRead(atomeId, principalId, key)) projectedDeletes.push(key);
    }
    const keys = [...Object.keys(projectedPatch), ...projectedDeletes];
    if (!keys.length) {
        if (
            String(event?.kind || '').toLowerCase() === 'delete'
            && await canReadAnyAtomeProperty(atomeId, principalId)
        ) {
            return {
                ...event,
                payload: { props: {}, delete_keys: [], property_versions: {} }
            };
        }
        return null;
    }
    const baseVersions = event?.payload?.base_versions || {};
    const propertyVersions = {};
    keys.forEach((key) => {
        const base = Number(baseVersions[key]);
        if (Number.isInteger(base) && base >= 0) propertyVersions[key] = base + 1;
    });
    return {
        ...event,
        payload: {
            props: projectedPatch,
            delete_keys: projectedDeletes,
            property_versions: propertyVersions
        }
    };
}
