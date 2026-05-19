/**
 * project_scene_collector.js
 *
 * Collects live project, user, selection, mtrack, and recent-event context
 * for injection into the AI planner. Each collector reads existing runtime
 * APIs — no new stores are created.
 */

const safeGet = (fn) => {
    try { return fn(); } catch (_) { return null; }
};

const env = () => (typeof window !== 'undefined' ? window : globalThis);

// ---------------------------------------------------------------------------
// P1 — Project + Scene + Selection + User
// ---------------------------------------------------------------------------

const collectProjectContext = () => {
    const w = env();
    const proj = w.__currentProject;
    if (!proj?.id) return null;
    return {
        id: proj.id || null,
        name: proj.name || null,
        owner_id: proj.owner_id || proj.ownerId || null
    };
};

const collectUserContext = () => {
    const w = env();
    const user = w.__currentUser;
    if (!user?.id) return null;
    return {
        id: user.id || null,
        name: user.name || null,
        phone: user.phone || null
    };
};

const collectSelectionContext = () => {
    const w = env();
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

// ---------------------------------------------------------------------------
// P2 — Mtrack / Timeline + Recent Entities
// ---------------------------------------------------------------------------

const collectMtrackContext = () => {
    const w = env();
    const api = w.eveMtrackApi;
    if (!api || typeof api.getState !== 'function') return null;
    const state = safeGet(() => api.getState());
    if (!state) return null;
    const selectedClips = state.selectedClipIds instanceof Set
        ? [...state.selectedClipIds].slice(0, 20)
        : [];
    return {
        is_playing: !!state.isPlaying,
        playhead: state.playhead ?? null,
        tempo: state.tempo ?? null,
        clip_count: state.clipCount ?? (Array.isArray(state.clips) ? state.clips.length : 0),
        selected_clips: selectedClips.length ? selectedClips : null,
        active_group_id: state.activeGroupId ?? null
    };
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

const collectProjectSceneContext = () => {
    const snapshot = {};

    // P1
    const project = safeGet(collectProjectContext);
    if (project) snapshot.project = project;

    const user = safeGet(collectUserContext);
    if (user) snapshot.user = user;

    const selection = safeGet(collectSelectionContext);
    if (selection) snapshot.selection = selection;

    // P2
    const mtrack = safeGet(collectMtrackContext);
    if (mtrack) snapshot.mtrack = mtrack;

    // P3
    const mutations = safeGet(collectRecentMutations);
    if (mutations) snapshot.recent_mutations = mutations;

    const errors = safeGet(collectRecentErrors);
    if (errors) snapshot.recent_errors = errors;

    return Object.keys(snapshot).length ? snapshot : null;
};

export {
    collectProjectSceneContext,
    pushMutation,
    pushError
};
