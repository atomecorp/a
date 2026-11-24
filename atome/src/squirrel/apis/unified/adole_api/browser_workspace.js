// Browser persistence uses the existing per-identity IndexedDB event store.
// Local commits never wait for a remote session; only this outbox needs network.
import { getSessionState } from './session.js';
import { isTauriRuntime } from './runtime.js';
import { getFastifyHttpBaseUrl } from '../adole_backend.js';
import { commitWorkspaceEvents, createWorkspaceSnapshot, getGuestAtome, listGuestAtomes, listWorkspaceEvents,
    oldestPendingWorkspaceEvent, acknowledgeWorkspaceEvent, logAcknowledgedWorkspaceEvents, parkRefusedWorkspaceEvent, requeueRefusedWorkspaceEvents, importWorkspaceStates, listGuestFiles, acknowledgeWorkspaceFile,
    parkRefusedWorkspaceFile, requeueRefusedWorkspaceFiles } from './guest_workspace_store.js';

const owns = message => ['events', 'state-current', 'atome'].includes(message?.type)
    || (message?.type === 'snapshot' && message.action === 'create');
export function ownsBrowserWorkspaceMessage(message) { return !isTauriRuntime() && owns(message); }

// A realtime frame names the Atome another device changed: only those states are read
// again (`{ pull: ids }`), never the whole workspace; a replay burst is coalesced into one pass.
export function subscribeBrowserWorkspaceChanges(env, requestSync) {
    if (isTauriRuntime() || !env?.addEventListener) return () => {};
    let timer = null, ids = new Set();
    const cancel = () => { clearTimeout(timer); timer = null; ids = new Set(); };
    const changed = event => {
        const id = String(event.detail?.atome_id || '');
        if (event.detail?.origin !== 'ws/sync' || event.detail?.durable !== true || !id) return;
        ids.add(id);
        if (!timer) timer = setTimeout(() => { const pull = ids; timer = null; ids = new Set(); requestSync({ pull }); }, 250);
    };
    const names = ['squirrel:atome-updated', 'squirrel:atome-restored', 'squirrel:atome-deleted'];
    for (const name of names) env.addEventListener(name, changed);
    env.addEventListener('squirrel:user-logged-out', cancel);
    return () => {
        cancel();
        for (const name of names) env.removeEventListener(name, changed);
        env.removeEventListener('squirrel:user-logged-out', cancel);
    };
}

// Local storage authorizes by the session's owner namespace. Project that
// existing authority for readers such as contextual menus; never persist it or
// replace an access projection already supplied by the server.
const projectLocalOwnerAccess = (state, owner) => {
    if (String(state?.owner_id || '') !== owner) throw new Error('workspace_identity_mismatch');
    if (state.capabilities) return state;
    return { ...state, capabilities: {
        read: true, write: true, create: true, delete: true, share: true,
        properties: Object.fromEntries(Object.keys(state.properties || {}).map(name =>
            [name, { write: true, delete: true, share: true }]))
    } };
};

export async function browserWorkspaceRequest(message) {
    const session = getSessionState();
    if (!['anonymous', 'authenticated'].includes(session.mode) || !session.user?.id) throw new Error('local_authorization_required');
    const owner = String(session.user.id);
    let result;
    if (message.type === 'events' && ['commit', 'commit-batch'].includes(message.action)) {
        result = await commitWorkspaceEvents(owner, message.action === 'commit' ? [message.event] : message.events,
            { actorType: session.mode === 'anonymous' ? 'guest' : 'user' });
        globalThis.window?.dispatchEvent(new CustomEvent('squirrel:workspace-outbox-ready'));
    } else if (message.type === 'snapshot') {
        result = await createWorkspaceSnapshot(owner, message, { actorType: session.mode === 'anonymous' ? 'guest' : 'user' });
        globalThis.window?.dispatchEvent(new CustomEvent('squirrel:workspace-outbox-ready'));
    } else if (message.type === 'events' && message.action === 'list') {
        result = { events: await listWorkspaceEvents(owner, message) };
    } else if (['state-current', 'atome'].includes(message.type) && message.action === 'get') {
        const record = await getGuestAtome(owner, message.atome_id);
        if (!record) throw new Error('atome_not_available_locally');
        const state = projectLocalOwnerAccess(record, owner);
        result = { state, atome: state, data: state };
    } else if (['state-current', 'atome'].includes(message.type) && message.action === 'list') {
        const records = (await listGuestAtomes(owner, { include_deleted: message.include_deleted, type: message.atome_type }))
            .filter(row => !message.project_id || row.project_id === message.project_id || row.atome_id === message.project_id)
            .filter(row => !message.parent_id || row.parent_id === message.parent_id)
            .map(row => projectLocalOwnerAccess(row, owner));
        const offset = Math.max(0, Number(message.offset) || 0), limit = Math.max(1, Number(message.limit) || 1000);
        result = { states: records.slice(offset, offset + limit), atomes: records.slice(offset, offset + limit), total: records.length };
    } else throw new Error('workspace_action_unsupported');
    if (getSessionState().user?.id !== owner || getSessionState().mode !== session.mode) throw new Error('workspace_identity_changed');
    return { ok: true, success: true, ...result };
}

// An undo or a redo runs on the server's history (`atome_commit.js#executeHistoryCommand`): what it committed joins
// this device's journal and its projections the device's states, so the next undo reads it and walks one step further.
export async function recordServerHistoryEvents(events) {
    if (isTauriRuntime()) return { ok: true, skipped: true };
    const owner = getSessionState().user?.id;
    if (!owner) throw new Error('local_authorization_required');
    if (!Array.isArray(events) || !events.length) return { ok: true, count: 0 };
    await logAcknowledgedWorkspaceEvents(String(owner), events);
    await importWorkspaceStates(String(owner), events.map(event => event.projection).filter(Boolean));
    return { ok: true, count: events.length };
}

// A row is parked only on the server's verdict about that row. No response, a
// lost socket or a timeout (status 0) and an authentication refusal say
// nothing about the row: the pass stops and the row keeps its place.
const AUTHENTICATION_REFUSAL = /auth|token|session|unauthori[sz]ed|login|credential/i;
const isRowRefusal = (response) => !!response && response.ok !== true && response.offline !== true
    && Number(response.status) !== 0 && Number(response.status) !== 401
    && !AUTHENTICATION_REFUSAL.test(String(response.error || ''));

// Refused rows (and refused files) go back in the outbox once a session is (re)established: a right
// granted meanwhile, or a server-side repair, lets them through in order.
export async function requeueRefusedBrowserWorkspaceEvents() {
    const owner = getSessionState().user?.id;
    if (isTauriRuntime() || !owner || getSessionState().mode !== 'authenticated') return 0;
    return (await requeueRefusedWorkspaceEvents(String(owner))) + (await requeueRefusedWorkspaceFiles(String(owner)));
}

let synchronization;
let progress = null;
const environment = () => String(globalThis.window?.__SQUIRREL_ENVIRONMENT_FINGERPRINT__ || getFastifyHttpBaseUrl() || '');
export const readBrowserWorkspaceSyncProgress = () => progress?.principal_id === getSessionState().user?.id
    && progress.environment_fingerprint === environment() ? { ...progress } : null;
const publishProgress = (owner, fingerprint, restore, error = null) => {
    if (getSessionState().user?.id !== owner || environment() !== fingerprint) return;
    progress = { principal_id: owner, environment_fingerprint: fingerprint, restore_state: restore, last_error_code: error };
    globalThis.window?.dispatchEvent(new CustomEvent('squirrel:sync:status', { detail: { principal_id: owner } }));
};
// What a pass reads back after sending the outbox: `'all'` walks the whole workspace (a recovery: sign-in,
// reconnection, back online), a Set reads only those Atome (a realtime frame), `'none'` nothing (a local commit:
// this device already holds what it wrote). Requests met during a pass are merged into the next one, so a commit
// arriving while a pass runs is still sent (the last change before closing or disconnecting always leaves),
// and what a failed pass did not read is kept for the next.
const mergePull = (a, b) => (a === 'all' || b === 'all' ? 'all'
    : a === 'none' ? b : b === 'none' ? a : new Set([...a, ...b]));
const pullOf = options => {
    const pull = options?.pull ?? 'all';
    if (pull === 'all' || pull === 'none' || pull instanceof Set) return pull;
    throw new Error('workspace_sync_pull_invalid');
};
let requestedPull = null;
// `untilSent`: the promise settles once the outbox (what was committed before the call) has left, not at the end of
// the pass — an undo waits for its transaction to reach the server, never for a whole workspace walk under way
// (18 s measured on a new account). Waiters are armed when an outbox round starts and settled when it ends.
let sendWaiters = [], armedWaiters = [];
const settleWaiters = (waiters, error, result) => waiters.forEach(waiter => (error ? waiter.reject(error) : waiter.resolve(result)));
export function synchronizeBrowserWorkspace(transport, options = {}) {
    if (isTauriRuntime()) return Promise.resolve({ ok: true });
    const pull = pullOf(options);
    requestedPull = requestedPull ? mergePull(requestedPull, pull) : pull;
    const sent = options.untilSent === true ? new Promise((resolve, reject) => sendWaiters.push({ resolve, reject })) : null;
    const pass = synchronization || runSynchronization(transport);
    return sent || pass;
}
function runSynchronization(transport) {
    synchronization = (async () => {
        let result;
        do {
            const next = requestedPull;
            requestedPull = null;
            const owner = getSessionState().user?.id, fingerprint = environment();
            publishProgress(owner, fingerprint, 'receiving');
            try {
                result = await synchronizeBrowserWorkspaceOnce(transport, next);
                publishProgress(owner, fingerprint, result?.ok ? 'ready' : 'unknown');
            } catch (error) {
                // What this pass did not read stays asked: the next request (the retry) reads it too.
                requestedPull = requestedPull ? mergePull(next, requestedPull) : next;
                publishProgress(owner, fingerprint, 'error', String(error?.message || 'workspace_sync_failed'));
                settleWaiters([...armedWaiters, ...sendWaiters], error);
                armedWaiters = []; sendWaiters = [];
                throw error;
            }
        } while (requestedPull && result?.ok === true);
        // A pass that never reached its outbox (no session) answers its waiters with its result, as before.
        settleWaiters([...armedWaiters, ...sendWaiters], null, result);
        armedWaiters = []; sendWaiters = [];
        return result;
    })().finally(() => { synchronization = null; });
    // An `untilSent` caller holds its waiter, not the pass: its failure reaches that waiter (above), never unhandled.
    synchronization.catch(() => {});
    return synchronization;
}

async function synchronizeBrowserWorkspaceOnce({ send, ensureSession, uploadFile }, pull) {
    const owner = getSessionState().user?.id;
    if (!owner || getSessionState().mode !== 'authenticated') return { ok: false, reason: 'remote_authentication_required' };
    const stillAuthorized = () => {
        if (getSessionState().mode !== 'authenticated' || getSessionState().user?.id !== owner) throw new Error('workspace_identity_changed');
    };
    await ensureSession(); stillAuthorized();
    // A file the server refuses is parked as a row is (below); any other failure stops the pass in place.
    const refused = [];
    for (const file of await listGuestFiles(owner)) {
        if (file.uploaded || file.refused) continue;
        stillAuthorized();
        if (typeof uploadFile !== 'function') throw new Error('workspace_media_transport_unavailable');
        const result = await uploadFile(file);
        if (result?.success !== true && isRowRefusal(result)) {
            await parkRefusedWorkspaceFile(owner, file.file_id, result.error);
            refused.push({ file_id: file.file_id, atome_id: file.atome_id, error: String(result.error || 'workspace_media_refused') });
            continue;
        }
        if (!result?.success || result.file_name !== file.file_name || result.owner_id !== owner) throw new Error(result?.error || 'workspace_media_sync_failed');
        await acknowledgeWorkspaceFile(owner, file.file_id);
    }
    armedWaiters.push(...sendWaiters); sendWaiters = [];
    // Oldest first, one row at a time, rows committed during the pass included.
    // A row the server refuses is parked (kept, reported) so it cannot hold
    // back every later change; any other failure stops the pass in place.
    for (let entry = await oldestPendingWorkspaceEvent(owner), previousKey = null; entry;
        previousKey = entry.key, entry = await oldestPendingWorkspaceEvent(owner)) {
        if (entry.key === previousKey) throw new Error('workspace_sync_acknowledgement_failed');
        stillAuthorized();
        // A snapshot row asks the server for its own snapshot; `event_id` makes a resend harmless.
        const response = await send(entry.operation === 'snapshot'
            ? { type: 'snapshot', action: 'create', ...entry.payload.request, event_id: entry.payload.id, ts: entry.payload.ts }
            : { type: 'events', action: 'commit', event: entry.payload });
        if (response?.ok) {
            await acknowledgeWorkspaceEvent(owner, entry.payload.id);
            continue;
        }
        if (!isRowRefusal(response)) throw new Error(response?.error || 'workspace_sync_failed');
        await parkRefusedWorkspaceEvent(owner, entry, response.error);
        refused.push({ id: entry.payload.id, atome_id: entry.payload.atome_id, error: String(response.error || 'workspace_sync_refused') });
    }
    settleWaiters(armedWaiters, null, { ok: true }); armedWaiters = [];
    if (refused.length) {
        globalThis.window?.dispatchEvent(new CustomEvent('squirrel:workspace-sync-refused', { detail: { userId: owner, refused } }));
    }
    if (pull instanceof Set) await pullWorkspaceStates(owner, pull, send, stillAuthorized);
    else if (pull === 'all') await walkWorkspaceStates(owner, send, stillAuthorized);
    stillAuthorized();
    globalThis.window?.dispatchEvent(new CustomEvent('squirrel:workspace-synchronized', { detail: { userId: owner } }));
    return { ok: true };
}

// Readers re-read on `projection-ready` (the Dashboard lists the workspace again): announced once per
// pass, never once per page — a 400-page walk re-read the whole workspace 400 times on the phone.
const announceProjection = owner => globalThis.window?.dispatchEvent(new CustomEvent('squirrel:sync:projection-ready', {
    detail: { principal_id: owner, replay: true }
}));

// The states another device changed, read one by one; one the server no longer serves is left as it is here.
async function pullWorkspaceStates(owner, ids, send, stillAuthorized) {
    const states = [];
    for (const id of ids) {
        stillAuthorized();
        const response = await send({ type: 'state-current', action: 'get', atome_id: id });
        if (response?.ok && response.state) states.push(response.state);
        else if (response?.error !== 'State not found') throw new Error(response?.error || 'workspace_sync_failed');
    }
    await importWorkspaceStates(owner, states);
    stillAuthorized();
    if (states.length) announceProjection(owner);
}

// The whole workspace, oldest change first, from after the last state received: a state changed during
// the walk comes again at its end instead of slipping between two pages. The first page is announced at
// once (a device restoring shows its first states), then the end of the walk.
async function walkWorkspaceStates(owner, send, stillAuthorized) {
    let received = 0;
    for (let after = null; ;) {
        stillAuthorized();
        const response = await send({ type: 'state-current', action: 'list', owner_id: owner, include_deleted: true, limit: 250, order: 'oldest', ...(after ? { after } : {}) });
        if (!response?.ok || !Array.isArray(response.states)) throw new Error(response?.error || 'workspace_sync_failed');
        await importWorkspaceStates(owner, response.states);
        stillAuthorized();
        if (response.states.length && received === 0) announceProjection(owner);
        received += response.states.length;
        if (response.states.length < 250) break;
        const last = response.states[response.states.length - 1];
        after = { updated_at: last.meta?.updated_at || last.updated_at || '', atome_id: last.id || last.atome_id };
    }
    if (received > 250) announceProjection(owner);
}
