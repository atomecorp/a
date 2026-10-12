// Extracted from auth.js: anonymous→account workspace migration + previous-session workspace recovery.
import { createWebSocketAdapter } from '../adole.js';
import { mergeGuestProfileProperties, personalProfileFromProperties } from '../../../../shared/profile_sharing.js';
import { getSessionState, getGuestWorkspace, setGuestWorkspace } from './session.js';
import { adapters, getPrimaryBackend } from './auth_core.js';
import { completeBrowserGuestAdoption, guestAdoptionPayload, listGuestFiles } from './guest_workspace_store.js';

const bytesToBase64 = (bytes) => {
    let value = '';
    const view = new Uint8Array(bytes);
    for (let offset = 0; offset < view.length; offset += 0x8000) value += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
    return globalThis.btoa(value);
};

const adoptRemoteGuestPayload = async (adapter, fromUserId, toUserId, payload, files, resolvedOperationId) => {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((value) => value.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    assertAdoptionIdentity(fromUserId, toUserId);
    const prepare = await adapter.ws.send({ type: 'guest-adoption', action: 'prepare', operation_id: resolvedOperationId, guest_principal_id: fromUserId, manifest_digest: digest, expires_at: expiresAt, confirmed: true });
    if (!prepare?.ok && !prepare?.success) return { ok: false, reason: prepare?.error || 'guest_adoption_prepare_failed' };
    assertAdoptionIdentity(fromUserId, toUserId);
    const imported = await adapter.ws.send({ type: 'guest-adoption', action: 'import', operation_id: resolvedOperationId, payload, payload_digest: digest });
    if (!imported?.ok && !imported?.success) return { ok: false, reason: imported?.error || 'guest_adoption_import_failed' };
    for (const file of files) {
        const contentBase64 = bytesToBase64(await file.blob.arrayBuffer());
        assertAdoptionIdentity(fromUserId, toUserId);
        const staged = await adapter.ws.send({ type: 'guest-adoption', action: 'stage-file', operation_id: resolvedOperationId, file_id: file.file_id, content_base64: contentBase64 });
        if (!staged?.ok && !staged?.success) return { ok: false, reason: staged?.error || 'guest_adoption_file_stage_failed' };
    }
    assertAdoptionIdentity(fromUserId, toUserId);
    const finalized = await adapter.ws.send({ type: 'guest-adoption', action: 'finalize', operation_id: resolvedOperationId });
    if (!finalized?.ok && !finalized?.success) return { ok: false, reason: finalized?.error || 'guest_adoption_finalize_failed' };
    return finalized;
};

const adoptBrowserGuestWorkspace = async (adapter, fromUserId, toUserId, operationId) => {
    const payload = await guestAdoptionPayload(fromUserId, toUserId);
    const finalized = await adoptRemoteGuestPayload(adapter, fromUserId, toUserId, payload, await listGuestFiles(fromUserId), operationId);
    if (!finalized?.ok && !finalized?.success) return finalized;
    assertAdoptionIdentity(fromUserId, toUserId);
    if (payload.profile) {
        const guest = getGuestWorkspace();
        let event = guest.adoptionProfileEvent;
        if (!Object.prototype.hasOwnProperty.call(guest, 'adoptionProfileEvent')) {
            const confirmed = await readConfirmedRemoteProfile(adapter, toUserId, !Object.keys(payload.profile).length);
            assertAdoptionIdentity(fromUserId, toUserId);
            const local = await readAdoptionState(adapter, toUserId);
            const props = mergeGuestProfileProperties(local?.properties || {}, confirmed);
            const id = (finalized.profile_event?.id || 'guest-profile:' + operationId) + ':local';
            event = props ? { id, tx_id: id, kind: 'set', type: 'user', atome_id: toUserId,
                scope: 'global', project_id: null, actor: { type: 'user', id: toUserId }, ts: new Date().toISOString(), payload: { scope: 'global', props,
                    ...(local?.property_versions ? { expected_versions: Object.fromEntries(Object.keys(props).map(key => [key, local.property_versions[key] || 0])) } : {}) } } : null;
            assertAdoptionIdentity(fromUserId, toUserId);
            setGuestWorkspace({ ...guest, adoptionProfileEvent: event });
        }
        if (event) {
            const committed = await commitProfileIntent(event, 'fastify');
            if (!committed?.ok) {
                if (committed?.error === 'property_version_conflict') {
                    const { adoptionProfileEvent, ...retained } = getGuestWorkspace();
                    setGuestWorkspace(retained);
                }
                return { ok: false, reason: committed?.error || 'guest_adoption_profile_local_failed' };
            }
        }
    }
    assertAdoptionIdentity(fromUserId, toUserId);
    await completeBrowserGuestAdoption(fromUserId, toUserId);
    await globalThis.window?.__eveLoadUserProfile?.(toUserId, { eventSource: 'guest_adoption' });
    return { ok: true, adopted: payload.atomes.length, operationId };
};
const assertAdoptionIdentity = (fromId, toId) => {
    if (getSessionState().mode !== 'authenticated' || String(getSessionState().user?.id) !== String(toId)
        || String(getGuestWorkspace()?.user?.id) !== String(fromId)) throw new Error('workspace_identity_changed');
};
const commitProfileIntent = (event, backend) => {
    const commit = globalThis.window?.Atome?.commit;
    if (typeof commit !== 'function') throw new Error('commit_unavailable');
    return commit(event, { backend });
};
const readAdoptionState = async (adapter, id) => {
    let result;
    try { result = await adapter.atome.getStateCurrent(id); }
    catch (error) {
        if (['state not found', 'atome_not_available_locally'].includes(error.message.toLowerCase())) return null;
        throw error;
    }
    if (result?.ok === false || result?.success === false) {
        if (result.error === 'State not found') return null;
        throw new Error(result.error || 'guest_adoption_profile_read_failed');
    }
    return result.state || result.data?.state || result.data || null;
};

const readConfirmedRemoteProfile = async (adapter, id, allowMissing = false) => {
    const reply = await adapter.ws.send({ type: 'state-current', action: 'get', atome_id: id });
    if (allowMissing && reply?.error === 'State not found') return {};
    const state = reply?.state || reply?.data?.state;
    if ((!reply?.ok && !reply?.success) || !state?.properties) throw new Error(reply?.error || 'guest_adoption_profile_remote_read_failed');
    return personalProfileFromProperties(state.properties);
};

// The native guest registry already authorizes a detached local read. Its
// temporary adapter never changes the authenticated account's token or session.
// Only the immutable adoption intent is journaled, not a second editable profile.
const prepareNativeProfileIntent = async (fromId, toId, operationId, targetAdapter) => {
    const guest = getGuestWorkspace();
    if (Object.prototype.hasOwnProperty.call(guest, 'adoptionProfileEvent')) return guest.adoptionProfileEvent;
    let personal = guest.adoptionPersonalProfile;
    if (!personal) {
        const sourceAdapter = createWebSocketAdapter('guest_profile_read_' + operationId, 'tauri');
        try {
            const authorization = await sourceAdapter.auth.startGuest({ guestId: fromId });
            if (!authorization?.ok && !authorization?.success) throw new Error(authorization?.error || 'guest_adoption_profile_authorization_failed');
            const source = await readAdoptionState(sourceAdapter, fromId);
            personal = personalProfileFromProperties(source?.properties || {});
            const workspace = await sourceAdapter.atome.list({ owner_id: fromId, include_deleted: true, limit: 5000 });
            if ((!workspace?.ok && !workspace?.success) || !Array.isArray(workspace.atomes)) throw new Error(workspace?.error || 'guest_adoption_projects_read_failed');
            if (workspace.atomes?.length >= 5000) throw new Error('guest_adoption_projects_limit');
            const events = [];
            for (const row of workspace.atomes || []) {
                const id = row.atome_id || row.id;
                if (['user', 'guest_workspace'].includes(row.atome_type || row.type) || String(id) === fromId) continue;
                const state = await readAdoptionState(sourceAdapter, id);
                if (!state) throw new Error('guest_adoption_project_state_missing');
                const props = structuredClone(state.properties || {});
                const type = row.atome_type || row.type || props.type || props.kind;
                const projectId = state.project_id || (type === 'project' ? id : null);
                for (const key of ['file_path', 'filePath', 'path', 'media_url', 'mediaUrl']) {
                    if (typeof props[key] === 'string') props[key] = props[key].replace('data/users/' + fromId + '/', 'data/users/' + toId + '/');
                }
                if (props.media_user_id === fromId) props.media_user_id = toId;
                if (props.mediaUserId === fromId) props.mediaUserId = toId;
                events.push({ id: 'guest-project:' + operationId + ':' + id, tx_id: 'guest-project:' + operationId,
                    kind: row.deleted_at || props.__deleted ? 'delete' : 'set', atome_id: id, type,
                    project_id: projectId, ...(row.parent_id ? { parent_id: row.parent_id } : {}),
                    ...(!projectId ? { scope: 'global' } : {}), actor: { type: 'user', id: toId }, ts: new Date().toISOString(), payload: { props: row.deleted_at || props.__deleted ? {} : props } });
            }
            assertAdoptionIdentity(fromId, toId);
            setGuestWorkspace({ ...getGuestWorkspace(), adoptionProjectEvents: events });
        } finally { sourceAdapter.clearToken(); }
        assertAdoptionIdentity(fromId, toId);
        setGuestWorkspace({ ...getGuestWorkspace(), adoptionPersonalProfile: personal });
    }
    let confirmed = personal;
    if (Object.keys(personal).length) {
        const remote = adapters.fastify;
        const session = await remote.auth.me();
        const remoteId = session?.user?.id || session?.user?.user_id || session?.data?.user?.id;
        if ((!session?.ok && !session?.success) || !remoteId) throw new Error('guest_adoption_remote_account_required');
        const finalized = await adoptRemoteGuestPayload(remote, fromId, toId, { atomes: [], events: [], snapshots: [], sync_queue: [], permissions: [], files: [], profile: personal }, [], operationId);
        if (!finalized?.ok && !finalized?.success) throw new Error(finalized?.reason || finalized?.error || 'guest_adoption_profile_remote_failed');
        assertAdoptionIdentity(fromId, toId);
        confirmed = await readConfirmedRemoteProfile(remote, remoteId);
    }
    const target = await readAdoptionState(targetAdapter, toId);
    const props = mergeGuestProfileProperties(target?.properties || {}, confirmed);
    const versions = target?.property_versions;
    const event = props ? { id: 'guest-profile:' + operationId, tx_id: 'guest-profile:' + operationId,
        kind: 'set', type: 'user', atome_id: toId, scope: 'global', project_id: null, actor: { type: 'user', id: toId },
        ts: new Date().toISOString(), payload: { scope: 'global', props,
            ...(versions ? { expected_versions: Object.fromEntries(Object.keys(props).map(key => [key, versions[key] || 0])) } : {}) } } : null;
    assertAdoptionIdentity(fromId, toId);
    setGuestWorkspace({ ...getGuestWorkspace(), adoptionProfileEvent: event });
    return event;
};

const transferGuestWorkspace = async (fromUserId, toUserId, { operationId = null } = {}) => {
    if (!fromUserId || !toUserId || String(fromUserId) === String(toUserId)) {
        return { ok: false, reason: 'invalid_ids' };
    }
    assertAdoptionIdentity(fromUserId, toUserId);
    const backend = getPrimaryBackend();
    if (backend === 'fastify') {
        if (!operationId) return { ok: false, reason: 'guest_adoption_operation_required' };
        const adapter = adapters.fastify;
        if (!adapter?.atome?.commit) return { ok: false, reason: 'transfer_unavailable' };
        try { return await adoptBrowserGuestWorkspace(adapter, fromUserId, toUserId, operationId); }
        catch (error) { return { ok: false, reason: 'transfer_failed', error: error?.message || String(error) }; }
    }
    const adapter = adapters[backend];
    if (!adapter?.atome?.transferOwner) {
        return { ok: false, reason: 'transfer_unavailable' };
    }
    if (!operationId) return { ok: false, reason: 'guest_adoption_operation_required' };
    try {
        const profileEvent = await prepareNativeProfileIntent(fromUserId, toUserId, operationId, adapter);
        assertAdoptionIdentity(fromUserId, toUserId);
        if (profileEvent) {
            const committed = await commitProfileIntent(profileEvent, backend);
            if (!committed?.ok) {
                if (committed?.error === 'property_version_conflict') {
                    const guest = getGuestWorkspace();
                    const { adoptionProfileEvent, ...retained } = guest;
                    setGuestWorkspace(retained);
                }
                return { ok: false, reason: committed?.error || 'guest_adoption_profile_commit_failed' };
            }
        }
        const res = await adapter.atome.transferOwner({
            fromOwnerId: fromUserId,
            toOwnerId: toUserId,
            includeCreator: true,
            operation_id: operationId,
            adoption_confirmed: true
        });
        const ok = !!(res?.ok || res?.success);
        let sync = null;
        if (ok) {
            for (const event of getGuestWorkspace().adoptionProjectEvents || []) {
                assertAdoptionIdentity(fromUserId, toUserId);
                const committed = await commitProfileIntent(event, backend);
                if (!committed?.ok) return { ok: false, reason: committed?.error || 'guest_adoption_project_commit_failed' };
            }
            const pending = await adapter.sync.getPending();
            const count = pending?.data?.pending_delivery_count ?? pending?.pending_delivery_count;
            sync = (pending?.ok || pending?.success) && count === 0
                ? { ok: true } : { ok: false, reason: pending?.error || 'guest_adoption_sync_incomplete' };
        }
        assertAdoptionIdentity(fromUserId, toUserId);
        if (ok && sync?.ok === true) await globalThis.window?.__eveLoadUserProfile?.(toUserId, { eventSource: 'guest_adoption' });
        return { ok: ok && sync?.ok === true, raw: res, sync,
            ...(!sync?.ok ? { reason: sync?.reason || 'guest_adoption_sync_incomplete' } : {}) };
    } catch (e) {
        return { ok: false, reason: 'transfer_failed', error: e?.message || String(e) };
    }
};

export { transferGuestWorkspace };
