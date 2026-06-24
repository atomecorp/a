// Extracted from auth.js: anonymous→account workspace migration + previous-session workspace recovery.
import { adapters, getPrimaryBackend } from './auth_core.js';
import { isTauriRuntime } from './runtime.js';
import { syncLocalProjectsToFastify } from './atomes.js';
import {
    clearCurrentProjectCache,
    setCurrentProjectCache
} from './session.js';

const migrateAnonymousWorkspace = async (fromUserId, toUserId) => {
    if (!fromUserId || !toUserId || String(fromUserId) === String(toUserId)) {
        return { ok: false, reason: 'invalid_ids' };
    }
    const backend = getPrimaryBackend();
    const adapter = adapters[backend];
    if (!adapter?.atome?.transferOwner) {
        return { ok: false, reason: 'transfer_unavailable' };
    }
    try {
        const res = await adapter.atome.transferOwner({
            fromOwnerId: fromUserId,
            toOwnerId: toUserId,
            includeCreator: true
        });
        const ok = !!(res?.ok || res?.success);
        if (ok) {
            
                syncLocalProjectsToFastify({ reason: 'anonymous-migration' }).catch(() => { });
            
        }
        return { ok, raw: res };
    } catch (e) {
        return { ok: false, reason: 'transfer_failed', error: e?.message || String(e) };
    }
};

const RECOVERABLE_RENDER_TYPES = ['image', 'video', 'shape', 'sound', 'text', 'audio_recording'];

const pickAtomeArray = (result) => {
    if (Array.isArray(result?.atomes)) return result.atomes;
    if (Array.isArray(result?.data?.atomes)) return result.data.atomes;
    return [];
};

const resolveAtomeOwnerId = (record) => {
    if (!record || typeof record !== 'object') return null;
    const props = record.data || record.properties || record.particles || {};
    const ownerId = record.owner_id || record.ownerId || props.owner_id || props.ownerId || null;
    return ownerId ? String(ownerId) : null;
};

const resolveAtomeProjectId = (record) => {
    if (!record || typeof record !== 'object') return null;
    const props = record.data || record.properties || record.particles || {};
    const projectId = record.project_id || record.projectId || props.project_id || props.projectId || record.parent_id || record.parentId || null;
    return projectId ? String(projectId) : null;
};

const listLocalRenderableAtomes = async (adapter, ownerId) => {
    const records = [];
    for (const type of RECOVERABLE_RENDER_TYPES) {
        const result = await adapter.atome.list({
            type,
            owner_id: ownerId,
            limit: 1000
        });
        pickAtomeArray(result).forEach((record) => records.push(record));
    }
    return records;
};

const recoverSingleLocalWorkspaceCandidate = async (toUserId) => {
    if (!toUserId || !isTauriRuntime()) {
        return { ok: false, reason: 'not_tauri' };
    }
    const adapter = adapters[getPrimaryBackend()];
    if (!adapter?.atome?.list || !adapter?.atome?.transferOwner) {
        return { ok: false, reason: 'adapter_unavailable' };
    }
    const currentRecords = await listLocalRenderableAtomes(adapter, toUserId);
    if (currentRecords.length > 0) {
        return { ok: false, reason: 'current_workspace_has_renderables' };
    }

    const byOwner = new Map();
    for (const type of RECOVERABLE_RENDER_TYPES) {
        const result = await adapter.atome.list({
            type,
            owner_id: '*',
            limit: 2000
        });
        pickAtomeArray(result).forEach((record) => {
            const ownerId = resolveAtomeOwnerId(record);
            if (!ownerId || String(ownerId) === String(toUserId)) return;
            if (!byOwner.has(ownerId)) byOwner.set(ownerId, []);
            byOwner.get(ownerId).push(record);
        });
    }

    if (byOwner.size !== 1) {
        return { ok: false, reason: 'ambiguous_or_missing_source' };
    }
    const [fromOwnerId, records] = Array.from(byOwner.entries())[0];
    const migration = await migrateAnonymousWorkspace(fromOwnerId, toUserId);
    if (!migration.ok) return migration;

    const returnedProjectId = migration.raw?.data?.project_id
        || migration.raw?.data?.projectId
        || migration.raw?.project_id
        || migration.raw?.projectId
        || null;
    const projectId = returnedProjectId || records.map(resolveAtomeProjectId).find(Boolean);
    if (projectId) {
        setCurrentProjectCache({
            id: projectId,
            name: null,
            userId: toUserId,
            updatedAt: Date.now()
        });
    }
    return { ok: true, sourceId: fromOwnerId, projectId: projectId || null };
};

const resolveWorkspaceMigrationSourceId = (prevSession, prevProjectCache, nextUserId) => {
    const explicitAnonymousId = prevSession?.mode === 'anonymous' ? prevSession.user?.id : null;
    if (explicitAnonymousId && String(explicitAnonymousId) !== String(nextUserId)) {
        return String(explicitAnonymousId);
    }
    const cachedUserId = prevProjectCache?.userId || null;
    if (cachedUserId && String(cachedUserId) !== String(nextUserId)) {
        return String(cachedUserId);
    }
    return null;
};

const migratePreviousWorkspace = async (prevSession, prevProjectCache, nextUserId) => {
    const sourceId = resolveWorkspaceMigrationSourceId(prevSession, prevProjectCache, nextUserId);
    if (!sourceId) {
        const recovered = await recoverSingleLocalWorkspaceCandidate(nextUserId);
        if (!recovered.ok) clearCurrentProjectCache();
        return;
    }
    const migration = await migrateAnonymousWorkspace(sourceId, nextUserId);
    if (migration.ok && prevProjectCache?.id) {
        setCurrentProjectCache({
            id: prevProjectCache.id,
            name: prevProjectCache.name || null,
            userId: nextUserId,
            updatedAt: Date.now()
        });
        return;
    }
    clearCurrentProjectCache();
};


export { migrateAnonymousWorkspace, migratePreviousWorkspace };
