/**
 * project_scene_collector.js
 *
 * Collects live project, user, selection, and recent-event context
 * for injection into the AI planner. Each collector reads existing runtime
 * APIs — no new stores are created.
 */

const safeGet = (fn) => {
    try { return fn(); } catch (_) { return null; }
};

const resolveRuntimeEnv = (runtimeEnv = null) => runtimeEnv
    || (typeof window !== 'undefined' ? window : globalThis);

const toKey = (value) => String(value == null ? '' : value).trim();

const toFiniteOrNull = (value) => {
    if (value == null || value === '') return null;
    const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(numeric) ? numeric : null;
};

const isUserSceneRecord = (record = {}) => {
    const id = toKey(record.id ?? record.atome_id ?? record.atomeId);
    if (!id || record?.properties?.ephemeral === true) return false;
    return !id.startsWith('__eve_') && !id.startsWith('mol:');
};

const compactSceneAtome = (record = {}, selectedIds = new Set()) => {
    if (!isUserSceneRecord(record)) return null;
    const properties = record.properties && typeof record.properties === 'object'
        ? record.properties
        : {};
    const id = toKey(record.id ?? record.atome_id ?? record.atomeId);
    const type = toKey(
        record.atome_type ?? record.atomeType ?? record.type ?? record.kind
        ?? properties.atome_type ?? properties.type ?? properties.kind
    ).toLowerCase() || 'unknown';
    const text = toKey(
        properties.text ?? properties.content ?? properties.value
        ?? record.text ?? record.content ?? record.value
    );
    const name = toKey(
        record.name ?? record.title ?? record.label
        ?? properties.name ?? properties.title ?? properties.label
    );
    const left = toFiniteOrNull(properties.left ?? properties.x ?? record.left ?? record.x);
    const top = toFiniteOrNull(properties.top ?? properties.y ?? record.top ?? record.y);
    return {
        id,
        type,
        ...(text ? { text } : {}),
        ...(name ? { name } : {}),
        position: { left, top },
        selected: selectedIds.has(id)
    };
};

// ---------------------------------------------------------------------------
// P1 — Project + Scene + Selection + User
// ---------------------------------------------------------------------------

const collectProjectContext = (runtimeEnv) => {
    const w = resolveRuntimeEnv(runtimeEnv);
    const proj = w.__currentProject;
    if (!proj?.id) return null;
    return {
        id: proj.id || null,
        name: proj.name || null,
        owner_id: proj.owner_id || proj.ownerId || null
    };
};

const collectUserContext = (runtimeEnv) => {
    const w = resolveRuntimeEnv(runtimeEnv);
    const user = w.__currentUser;
    if (!user?.id) return null;
    return {
        id: user.id || null,
        name: user.name || null,
        phone: user.phone || null
    };
};

const collectSelectionContext = (runtimeEnv) => {
    const w = resolveRuntimeEnv(runtimeEnv);
    const ids = w.__selectedAtomeIds;
    const lastId = w.__selectedAtomeId || null;
    if (!Array.isArray(ids) || !ids.length) {
        return lastId ? { selected_ids: [lastId], last_id: lastId } : null;
    }
    return {
        selected_ids: ids.slice(0, 20),
        last_id: lastId,
        count: ids.length
    };
};

const collectSceneAtomes = (runtimeEnv, project, selection) => {
    const w = resolveRuntimeEnv(runtimeEnv);
    const projectId = toKey(project?.id);
    if (!projectId || typeof w.eveToolBase?.getProjectSceneState !== 'function') return null;
    const state = w.eveToolBase.getProjectSceneState(projectId);
    const records = Array.isArray(state?.records) ? state.records : [];
    const selectedIds = new Set(Array.isArray(selection?.selected_ids) ? selection.selected_ids.map(toKey) : []);
    const selected = [];
    const remaining = [];
    for (const record of records) {
        const atome = compactSceneAtome(record, selectedIds);
        if (!atome) continue;
        if (atome.selected) selected.push(atome);
        else if (remaining.length < 64) remaining.push(atome);
    }
    const atomes = [...selected, ...remaining].slice(0, 64);
    return atomes.length ? atomes : null;
};

// ---------------------------------------------------------------------------
// P3 — Recent mutations + errors (stubs — populated by orchestrator)
// ---------------------------------------------------------------------------

let _recentMutations = [];
let _recentErrors = [];

const pushMutation = (entry) => {
    if (!entry) return;
    _recentMutations.push({
        ts: Date.now(),
        action: entry.action || null,
        domain: entry.domain || null,
        atome_id: entry.atome_id || null,
        summary: entry.summary || null
    });
    if (_recentMutations.length > 10) _recentMutations = _recentMutations.slice(-10);
};

const pushError = (entry) => {
    if (!entry) return;
    _recentErrors.push({
        ts: Date.now(),
        code: entry.code || entry.error || null,
        message: entry.message || null,
        domain: entry.domain || null
    });
    if (_recentErrors.length > 5) _recentErrors = _recentErrors.slice(-5);
};

const collectRecentMutations = () => {
    return _recentMutations.length ? _recentMutations.slice() : null;
};

const collectRecentErrors = () => {
    return _recentErrors.length ? _recentErrors.slice() : null;
};

// ---------------------------------------------------------------------------
// Main collector — returns a compact context object
// ---------------------------------------------------------------------------

const collectProjectSceneContext = (runtimeEnv = null) => {
    const snapshot = {};

    // P1
    const project = safeGet(() => collectProjectContext(runtimeEnv));
    if (project) snapshot.project = project;

    const user = safeGet(() => collectUserContext(runtimeEnv));
    if (user) snapshot.user = user;

    const selection = safeGet(() => collectSelectionContext(runtimeEnv));
    if (selection) snapshot.selection = selection;

    const atomes = safeGet(() => collectSceneAtomes(runtimeEnv, project, selection));
    if (atomes) snapshot.atomes = atomes;

    // P3
    const mutations = safeGet(collectRecentMutations);
    if (mutations) snapshot.recent_mutations = mutations;

    const errors = safeGet(collectRecentErrors);
    if (errors) snapshot.recent_errors = errors;

    return Object.keys(snapshot).length ? snapshot : null;
};

export {
    compactSceneAtome,
    collectProjectSceneContext,
    pushMutation,
    pushError
};
