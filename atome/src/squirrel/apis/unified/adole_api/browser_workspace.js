// Browser persistence uses the existing per-identity IndexedDB event store.
// Local commits never wait for a remote session; only this outbox needs network.
import { getSessionState } from './session.js';
import { isTauriRuntime } from './runtime.js';
import { commitWorkspaceEvents, getGuestAtome, listGuestAtomes, listWorkspaceEvents,
    pendingWorkspaceEvents, acknowledgeWorkspaceEvent, importWorkspaceStates, listGuestFiles, acknowledgeWorkspaceFile } from './guest_workspace_store.js';

const owns = message => ['events', 'state-current', 'atome'].includes(message?.type);
export function ownsBrowserWorkspaceMessage(message) { return !isTauriRuntime() && owns(message); }

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

let synchronization;
let synchronizationRequested = false;
// Un commit arrive PENDANT une passe n'est pas dans la liste qu'elle a deja lue : il etait
// laisse en attente jusqu'au commit suivant (la derniere modification avant fermeture ou
// deconnexion ne partait jamais). Une demande recue en cours de passe relance une passe.
export function synchronizeBrowserWorkspace(transport) {
    if (isTauriRuntime()) return Promise.resolve({ ok: true });
    if (synchronization) {
        synchronizationRequested = true;
        return synchronization;
    }
    synchronization = (async () => {
        let result;
        do {
            synchronizationRequested = false;
            result = await synchronizeBrowserWorkspaceOnce(transport);
        } while (synchronizationRequested && result?.ok === true);
        return result;
    })().finally(() => { synchronization = null; });
    return synchronization;
}

async function synchronizeBrowserWorkspaceOnce({ send, ensureSession, uploadFile }) {
    const owner = getSessionState().user?.id;
    if (!owner || getSessionState().mode !== 'authenticated') return { ok: false, reason: 'remote_authentication_required' };
    const stillAuthorized = () => {
        if (getSessionState().mode !== 'authenticated' || getSessionState().user?.id !== owner) throw new Error('workspace_identity_changed');
    };
    await ensureSession(); stillAuthorized();
    for (const file of await listGuestFiles(owner)) {
        if (file.uploaded) continue;
        stillAuthorized();
        if (typeof uploadFile !== 'function') throw new Error('workspace_media_transport_unavailable');
        const result = await uploadFile(file);
        if (!result?.success || result.file_name !== file.file_name || result.owner_id !== owner) throw new Error('workspace_media_sync_failed');
        await acknowledgeWorkspaceFile(owner, file.file_id);
    }
    for (const entry of await pendingWorkspaceEvents(owner)) {
        stillAuthorized();
        const response = await send({ type: 'events', action: 'commit', event: entry.payload });
        if (!response?.ok) throw new Error(response?.error || 'workspace_sync_failed');
        await acknowledgeWorkspaceEvent(owner, entry.payload.id);
    }
    for (let offset = 0; ; offset += 250) {
        stillAuthorized();
        const response = await send({ type: 'state-current', action: 'list', owner_id: owner, include_deleted: true, limit: 250, offset });
        if (!response?.ok || !Array.isArray(response.states)) throw new Error(response?.error || 'workspace_sync_failed');
        await importWorkspaceStates(owner, response.states);
        if (response.states.length < 250) break;
    }
    stillAuthorized();
    globalThis.window?.dispatchEvent(new CustomEvent('squirrel:workspace-synchronized', { detail: { userId: owner } }));
    return { ok: true };
}
