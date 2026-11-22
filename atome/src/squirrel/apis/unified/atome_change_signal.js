// The one signal every view follows when an Atome changes, whatever the change came from: a commit of this
// device (`origin: 'commit'`, eVe/core/atome_commit_effects.js) or an event delivered by /ws/sync
// (`origin: 'ws/sync'`, sync_engine.js). Both publish the same window events with the same detail, so a list,
// a cache or a panel subscribed once is refreshed by a local action at once and by another device's on delivery.
// The bus `atome:changed` (eVe/core/event_bus.js) stays the commit pipeline's own report to the project scene,
// the history and the journals; a view never needs it to know that its data changed.
export const ATOME_CHANGE_EVENTS = Object.freeze({
    updated: 'squirrel:atome-updated',
    deleted: 'squirrel:atome-deleted',
    restored: 'squirrel:atome-restored'
});
// A frame of a gesture in progress (a drag, a resize): where the gesture draws the Atome now, before it commits. It is
// not durable and changes no view: only what draws the same scene elsewhere follows it live (a connected screen's
// page, R-212, external_display_changes.js). Detail: `{ atome_id, project_id, gesture_id, props }`.
export const ATOME_FRAME_EVENT = 'squirrel:atome-frame';
export const dispatchAtomeFrame = (env, detail) => dispatchAtomeChange(env, ATOME_FRAME_EVENT, detail);
// The events this page has just committed, each by its id (a gesture's frames included, which no view is told of): the
// account hands them back to every page of the device a moment later, and a page that never saw them would draw them
// again, late. A connected screen's page tells the device's page of its own (R-212, external_display_changes.js).
// Detail: `{ event_ids }`.
export const ATOME_COMMITTED_EVENT = 'squirrel:atome-committed';

// A view also hears the creations announced by the owners that write outside the commit pipeline
// (adole_api/projects.js, tool_genesis_create_runtime.js); the pipeline itself announces a creation as `updated`.
const NAMES = Object.freeze(['squirrel:atome-created', ...Object.values(ATOME_CHANGE_EVENTS)]);

// The window event an Atome event announces, or null when it changes nothing a view shows: a restore its lifecycle
// decision lost, or a patch that writes and removes no property (a lost deletion still announces its winning props).
export const atomeChangeEventName = ({ kind, props = {}, deleteKeys = [], lifecycleWins = true }) => {
    const normalized = String(kind || '').toLowerCase();
    if (normalized === 'delete' && lifecycleWins) return ATOME_CHANGE_EVENTS.deleted;
    if (normalized === 'restore') return lifecycleWins ? ATOME_CHANGE_EVENTS.restored : null;
    return Object.keys(props).length || deleteKeys.length ? ATOME_CHANGE_EVENTS.updated : null;
};

export const dispatchAtomeChange = (env, name, detail) => {
    if (!name || !env?.dispatchEvent || !env?.CustomEvent) return;
    env.dispatchEvent(new env.CustomEvent(name, { detail }));
};

// On the Web, a delivered event reaches this device's own store a moment after its signal: the workspace
// imports what the server holds (adole_api/browser_workspace.js), then announces `squirrel:sync:projection-ready`.
// A view reading this device first would read the old state at the signal: it hears that announcement too, as a
// change of anything (`{ bulk: true }`).
export const ATOME_PROJECTION_READY_EVENT = 'squirrel:sync:projection-ready';

// `listener(detail, eventName)` for every change; returns the release.
export const subscribeAtomeChanges = (listener, env = globalThis.window) => {
    if (typeof listener !== 'function') throw new Error('atome_change_listener_required');
    if (!env?.addEventListener) return () => {};
    const handler = event => listener(event?.detail || {}, event?.type || '');
    const bulk = event => listener({ ...(event?.detail || {}), bulk: true }, event?.type || '');
    NAMES.forEach(name => env.addEventListener(name, handler));
    env.addEventListener(ATOME_PROJECTION_READY_EVENT, bulk);
    return () => { NAMES.forEach(name => env.removeEventListener?.(name, handler)); env.removeEventListener?.(ATOME_PROJECTION_READY_EVENT, bulk); };
};
