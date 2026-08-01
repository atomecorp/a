// Extracted from auth.js: anonymous→account workspace migration + previous-session workspace recovery.
import { adapters, getPrimaryBackend } from './auth_core.js';
import { syncLocalProjectsToFastify } from './atomes.js';
import { clearGuestWorkspace, guestAdoptionPayload, listGuestFiles } from './guest_workspace_store.js';

const bytesToBase64 = (bytes) => {
    let value = '';
    const view = new Uint8Array(bytes);
    for (let offset = 0; offset < view.length; offset += 0x8000) value += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
    return globalThis.btoa(value);
};

const adoptBrowserGuestWorkspace = async (adapter, fromUserId, toUserId, operationId = null) => {
    const resolvedOperationId = operationId || globalThis.crypto?.randomUUID?.();
    if (!resolvedOperationId) return { ok: false, reason: 'secure_random_unavailable' };
    const payload = await guestAdoptionPayload(fromUserId);
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((value) => value.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const prepare = await adapter.ws.send({ type: 'guest-adoption', action: 'prepare', operation_id: resolvedOperationId, guest_principal_id: fromUserId, manifest_digest: digest, expires_at: expiresAt, confirmed: true });
    if (!prepare?.ok && !prepare?.success) return { ok: false, reason: prepare?.error || 'guest_adoption_prepare_failed' };
    const imported = await adapter.ws.send({ type: 'guest-adoption', action: 'import', operation_id: resolvedOperationId, payload, payload_digest: digest });
    if (!imported?.ok && !imported?.success) return { ok: false, reason: imported?.error || 'guest_adoption_import_failed' };
    const files = await listGuestFiles(fromUserId);
    for (const file of files) {
        const contentBase64 = bytesToBase64(await file.blob.arrayBuffer());
        const staged = await adapter.ws.send({ type: 'guest-adoption', action: 'stage-file', operation_id: resolvedOperationId, file_id: file.file_id, content_base64: contentBase64 });
        if (!staged?.ok && !staged?.success) return { ok: false, reason: staged?.error || 'guest_adoption_file_stage_failed' };
    }
    const finalized = await adapter.ws.send({ type: 'guest-adoption', action: 'finalize', operation_id: resolvedOperationId });
    if (!finalized?.ok && !finalized?.success) return { ok: false, reason: finalized?.error || 'guest_adoption_finalize_failed' };
    await clearGuestWorkspace(fromUserId);
    return { ok: true, adopted: payload.atomes.length, operationId: resolvedOperationId };
};
const transferGuestWorkspace = async (fromUserId, toUserId, { operationId = null } = {}) => {
    if (!fromUserId || !toUserId || String(fromUserId) === String(toUserId)) {
        return { ok: false, reason: 'invalid_ids' };
    }
    const backend = getPrimaryBackend();
    if (backend === 'fastify') {
        if (!operationId) return { ok: false, reason: 'guest_adoption_operation_required' };
        const adapter = adapters.fastify;
        if (!adapter?.atome?.commit) return { ok: false, reason: 'transfer_unavailable' };
        return adoptBrowserGuestWorkspace(adapter, fromUserId, toUserId, operationId);
    }
    const adapter = adapters[backend];
    if (!adapter?.atome?.transferOwner) {
        return { ok: false, reason: 'transfer_unavailable' };
    }
    if (!operationId) return { ok: false, reason: 'guest_adoption_operation_required' };
    try {
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
            sync = await syncLocalProjectsToFastify({ reason: 'guest-adoption' });
        }
        return { ok, raw: res, sync };
    } catch (e) {
        return { ok: false, reason: 'transfer_failed', error: e?.message || String(e) };
    }
};

export { transferGuestWorkspace };
