// Surface grants — renderer side of the §11.2 flow.
//
// Asking, deciding and revoking are ordinary requests; what matters here is that the
// *decision* is only ever the owner's, so this module never auto-accepts anything.
// Compare with teleport between a user's own devices, where auto-accept is correct
// (§11.1): across accounts, silence is not consent.

import { FastifyAdapter } from '../apis/unified/adole.js';
import { ensureRemoteSurfacePrincipal } from '../apis/unified/adole_api/surfaces.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

export const SURFACE_CAPABILITIES = Object.freeze({
    TELEPORT_RECEIVE: 'teleport_receive',
    TELEPORT_DISPLAY: 'teleport_display',
    TELEPORT_MANIPULATE: 'teleport_manipulate',
    TELEPORT_PERSIST: 'teleport_persist',
    TELEPORT_RETURN: 'teleport_return',
    REMOTE_POINTER: 'remote_pointer',
    REMOTE_SURFACE: 'remote_surface',
    // Running one canonical tool on the surface (remoteCommandRelay.js). Separate from
    // the pointer: being allowed to move a cursor is not being allowed to act.
    REMOTE_COMMAND: 'remote_command'
});

const isAuthenticated = () => getSessionState()?.mode === 'authenticated';

const state = {
    lifecycleInstalled: false,
    // Requests waiting for this user's decision, keyed by grant id.
    incoming: new Map(),
    // Requests this user sent and that are not yet decided.
    outgoing: new Map()
};

const send = async (action, fields = {}) => {
    if (!isAuthenticated()) return { ok: false, success: false, error: 'not_authenticated' };
    const principal = await ensureRemoteSurfacePrincipal();
    if (!principal.ok) return { ok: false, success: false, error: principal.error };
    try {
        // A grant is written in the server's vaults, its owner's inbox card too (several seconds each on the hosted server).
        return await FastifyAdapter.ws.send({ type: 'surface-grant', action, ...fields }, { timeoutMs: 30000 });
    } catch (error) {
        return { ok: false, success: false, error: error?.message || String(error) };
    }
};

/** Ask another user for capabilities on one of their surfaces. */
export const requestSurfaceAccess = async ({ ownerId, surfaceId, capabilities = [] } = {}) => {
    const owner = String(ownerId || '').trim();
    const surface = String(surfaceId || '').trim();
    if (!owner) return { ok: false, error: 'surface_grant_owner_required' };
    if (!surface) return { ok: false, error: 'surface_grant_surface_required' };
    const result = await send('request', {
        owner_id: owner,
        surface_id: surface,
        ...(capabilities.length ? { capabilities } : {})
    });
    if (result?.success === true && result.grant) state.outgoing.set(result.grant.grant_id, result.grant);
    return { ok: result?.success === true, error: result?.error || null, grant: result?.grant || null };
};

/** Approve a request. `capabilities` may narrow it — the owner is never forced to
 *  grant everything that was asked for (§11.3). */
/** `expiresAt` (ISO): the grant ends then (« for the session », R-248: 3 h at most); `once`: it is spent by its first use. */
export const acceptSurfaceGrant = async (grantId, capabilities = null, { expiresAt = '', once = false } = {}) => {
    const id = String(grantId || '').trim();
    if (!id) return { ok: false, error: 'surface_grant_id_required' };
    const result = await send('accept', {
        grant_id: id,
        ...(Array.isArray(capabilities) ? { capabilities } : {}),
        ...(expiresAt ? { expires_at: String(expiresAt) } : {}),
        ...(once ? { once: true } : {})
    });
    if (result?.success === true) state.incoming.delete(id);
    return { ok: result?.success === true, error: result?.error || null, grant: result?.grant || null };
};

export const denySurfaceGrant = async (grantId) => {
    const id = String(grantId || '').trim();
    if (!id) return { ok: false, error: 'surface_grant_id_required' };
    const result = await send('deny', { grant_id: id });
    if (result?.success === true) state.incoming.delete(id);
    return { ok: result?.success === true, error: result?.error || null, grant: result?.grant || null };
};

export const revokeSurfaceGrant = async (grantId) => {
    const id = String(grantId || '').trim();
    if (!id) return { ok: false, error: 'surface_grant_id_required' };
    const result = await send('revoke', { grant_id: id });
    state.incoming.delete(id);
    state.outgoing.delete(id);
    return { ok: result?.success === true, error: result?.error || null, grant: result?.grant || null };
};

export const installSurfaceGrantLifecycle = () => {
    if (typeof window === 'undefined' || state.lifecycleInstalled) return false;
    state.lifecycleInstalled = true;

    window.addEventListener('squirrel:surface-grant-request', (event) => {
        const grant = event?.detail?.grant;
        if (!grant?.grant_id) return;
        // Never auto-answered: across accounts, the owner decides (eVe's teleport_grant_notifications.js asks them).
        state.incoming.set(grant.grant_id, grant);
    });

    ['squirrel:surface-grant-granted', 'squirrel:surface-grant-denied', 'squirrel:surface-grant-revoked']
        .forEach((type) => {
            window.addEventListener(type, (event) => {
                const grant = event?.detail?.grant;
                if (!grant?.grant_id) return;
                state.incoming.delete(grant.grant_id);
                if (type === 'squirrel:surface-grant-revoked') state.outgoing.delete(grant.grant_id);
                else state.outgoing.set(grant.grant_id, grant);
            });
        });

    window.addEventListener('squirrel:user-logged-out', () => {
        state.incoming.clear();
        state.outgoing.clear();
    });
    return true;
};

installSurfaceGrantLifecycle();
