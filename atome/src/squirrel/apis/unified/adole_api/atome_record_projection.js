import { sanitizeAtomeProperties } from '../../../../shared/atome_contract.js';
import { getSessionState } from './session.js';

function normalizeAtomeRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const id = record.atome_id || record.id || null;
    const type = record.atome_type || record.type || record.kind || null;
    const ownerId = record.owner_id || record.ownerId || record.owner || null;
    const parentId = record.parent_id || record.parentId || record.parent || null;
    const properties = record.particles || record.properties || record.data || {};
    return {
        ...record,
        id: id || record.atome_id,
        type: type || record.atome_type,
        meta: {
            ...(record.meta && typeof record.meta === 'object' ? record.meta : {}),
            owner_id: ownerId || record?.meta?.owner_id || null,
            parent_id: parentId || record?.meta?.parent_id || null
        },
        properties
    };
}

function extractUserId(user) {
    if (!user) return null;
    return user.user_id || user.userId || user.id || user.atome_id || null;
}

function getCurrentUserId() {
    const state = getSessionState();
    return state?.user?.id || null;
}

const isAnonymous = () => getSessionState().mode === 'anonymous';
const isLoggedOut = () => getSessionState().mode === 'logged_out';

function filterByOwner(records, userId, { allowCreator = false } = {}) {
    if (!Array.isArray(records) || !userId) return [];
    const resolved = String(userId);
    return records.filter((record) => {
        const ownerId = record.owner_id || record.ownerId || record.owner || record?.meta?.owner_id || record?.properties?.owner_id || null;
        if (ownerId && String(ownerId) === resolved) return true;
        if (allowCreator && !ownerId) {
            const creatorId = record.creator_id || record.creatorId || record?.properties?.creator_id || null;
            if (creatorId && String(creatorId) === resolved) return true;
        }
        const pendingOwner = record._pending_owner_id || record.pending_owner_id || record?.properties?._pending_owner_id || null;
        return !!(pendingOwner && String(pendingOwner) === resolved);
    });
}

const resolveAtomeType = (record) => String(record?.type || record?.atome_type || record?.kind || '').toLowerCase();
const resolveAtomeId = (record) => record?.id || record?.atome_id || null;

const resolveAtomeParentId = (record) => (
    record?.meta?.parent_id
    || record?.parent_id
    || record?.parentId
    || record?.parent
    || record?.properties?.parent_id
    || record?.properties?.parentId
    || null
);

const resolveAtomeProjectId = (record) => (
    record?.project_id
    || record?.projectId
    || record?.meta?.project_id
    || record?.meta?.projectId
    || record?.properties?.project_id
    || record?.properties?.projectId
    || null
);

function buildUpsertPayload(record, ownerIdFallback) {
    const id = resolveAtomeId(record);
    if (!id) return null;
    const type = String(record?.type || record?.atome_type || record?.kind || '').trim().toLowerCase();
    if (!type || type === 'atome') return null;
    const ownerId = record?.meta?.owner_id || record?.owner_id || record?.ownerId || record?.owner || ownerIdFallback || null;
    const parentId = resolveAtomeParentId(record);
    const properties = sanitizeAtomeProperties(record?.properties || record?.particles || record?.data || {});
    return {
        id,
        type,
        kind: record?.kind || properties.kind || null,
        renderer: record?.renderer || null,
        meta: {},
        traits: Array.isArray(record?.traits) ? record.traits : [],
        owner_id: ownerId,
        project_id: resolveAtomeProjectId(record),
        parent_id: parentId,
        properties
    };
}

function topologicalSortByParent(items = []) {
    const byId = new Map();
    items.forEach((item) => {
        const id = resolveAtomeId(item);
        if (id) byId.set(id, item);
    });
    const visited = new Set();
    const sorted = [];

    const visit = (item, stack = new Set()) => {
        const id = resolveAtomeId(item);
        if (!id || visited.has(id)) return;
        if (stack.has(id)) {
            sorted.push(item);
            visited.add(id);
            return;
        }
        stack.add(id);
        const parentId = resolveAtomeParentId(item);
        if (parentId && byId.has(parentId)) visit(byId.get(parentId), stack);
        stack.delete(id);
        if (!visited.has(id)) {
            sorted.push(item);
            visited.add(id);
        }
    };

    items.forEach((item) => visit(item));
    return sorted;
}

function mapStateCurrentToAtome(state) {
    if (!state || typeof state !== 'object') return null;
    const properties = state.properties || {};
    const id = state.atome_id || state.atomeId || state.id || properties.id || null;
    return normalizeAtomeRecord({
        id,
        atome_id: id,
        type: state.atome_type || state.atomeType || state.type || properties.type || properties.kind || null,
        owner_id: state.owner_id || state.ownerId || state.meta?.owner_id || null,
        parent_id: state.parent_id || state.parentId || state.meta?.parent_id || properties.parent_id || properties.parentId || null,
        meta: {
            owner_id: state.meta?.owner_id || state.owner_id || state.ownerId || null,
            parent_id: state.meta?.parent_id || properties.parent_id || properties.parentId || null,
            project_id: state.meta?.project_id || state.meta?.projectId || state.project_id || state.projectId || properties.project_id || properties.projectId || null
        },
        project_id: state.project_id || state.projectId || state.meta?.project_id || state.meta?.projectId || properties.project_id || properties.projectId || null,
        properties
    });
}

async function listOnBackend(adapters, backend, options, currentUserId, skipOwner) {
    const adapter = adapters[backend];
    if (!adapter?.atome?.list) return { ok: false, list: [], error: 'backend_unavailable' };
    const explicitOwner = options.ownerId || options.owner_id || null;
    const query = {
        atome_type: options.atome_type || options.type || options.atomeType || null,
        owner_id: skipOwner ? (explicitOwner || null) : (explicitOwner || currentUserId || null),
        parent_id: options.project_id || options.projectId || options.parent_id || options.parentId || null,
        limit: options.limit,
        offset: options.offset,
        include_deleted: options.include_deleted ?? options.includeDeleted
    };
    const result = await adapter.atome.list(query);
    const ok = !!(result?.ok || result?.success);
    const list = Array.isArray(result?.atomes) ? result.atomes : Array.isArray(result?.data) ? result.data : [];
    return { ok, list: list.map(normalizeAtomeRecord).filter(Boolean), raw: result, error: ok ? null : (result?.error || 'list_failed') };
}

async function listStateCurrentOnBackend(adapters, backend, options) {
    const adapter = adapters[backend];
    if (!adapter?.atome?.listStateCurrent) {
        return { ok: false, list: [], error: 'state_current_unavailable' };
    }
    try {
        const payload = await adapter.atome.listStateCurrent(options);
        if (payload?.ok === false || payload?.success === false) {
            return { ok: false, list: [], error: payload?.error || 'state_current_failed' };
        }
        const listRaw = Array.isArray(payload?.states)
            ? payload.states
            : Array.isArray(payload?.data?.states)
                ? payload.data.states
                : [];
        const list = listRaw.map(mapStateCurrentToAtome).filter(Boolean);
        return { ok: true, list, raw: payload };
    } catch (error) {
        return { ok: false, list: [], error: error?.message || 'state_current_failed' };
    }
}

export {
    buildUpsertPayload,
    extractUserId,
    filterByOwner,
    getCurrentUserId,
    isAnonymous,
    isLoggedOut,
    listOnBackend,
    listStateCurrentOnBackend,
    mapStateCurrentToAtome,
    normalizeAtomeRecord,
    resolveAtomeId,
    resolveAtomeParentId,
    resolveAtomeProjectId,
    resolveAtomeType,
    topologicalSortByParent
};
