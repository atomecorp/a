// Surface grants — cross-user authorization for teleport and remote control.
//
// §11.3 is the whole point of this module: "accepter un objet" must not silently mean
// "donner le contrôle total de la machine". Capabilities are therefore separate and
// each one is checked on its own; a grant to receive an object confers nothing about
// driving the pointer.
//
// §23 is the other half: owner, host and controller are different roles. A grant says
// what a *grantee* may do on an *owner's* surface. It never transfers ownership of
// anything, and it never touches the object's `owner_id`.

import crypto from 'crypto';
import db from '../database/adole.js';

export const SURFACE_CAPABILITIES = Object.freeze({
    TELEPORT_RECEIVE: 'teleport_receive',
    TELEPORT_DISPLAY: 'teleport_display',
    TELEPORT_MANIPULATE: 'teleport_manipulate',
    TELEPORT_PERSIST: 'teleport_persist',
    TELEPORT_RETURN: 'teleport_return',
    REMOTE_POINTER: 'remote_pointer',
    REMOTE_SURFACE: 'remote_surface'
});

const KNOWN_CAPABILITIES = new Set(Object.values(SURFACE_CAPABILITIES));

// Receiving an object is the smallest useful grant, and it is deliberately not enough
// to control anything. Asking for more is allowed, but it must be asked for.
export const DEFAULT_REQUESTED_CAPABILITIES = Object.freeze([
    SURFACE_CAPABILITIES.TELEPORT_RECEIVE,
    SURFACE_CAPABILITIES.TELEPORT_DISPLAY
]);

export function normalizeCapabilities(values) {
    const list = Array.isArray(values) ? values : [];
    const normalized = new Set();
    for (const value of list) {
        const key = String(value || '').trim().toLowerCase();
        if (KNOWN_CAPABILITIES.has(key)) normalized.add(key);
    }
    return [...normalized];
}

function rowToGrant(row) {
    if (!row) return null;
    let capabilities = [];
    try {
        capabilities = normalizeCapabilities(JSON.parse(row.capabilities || '[]'));
    } catch {
        capabilities = [];
    }
    return {
        grant_id: row.grant_id,
        owner_id: String(row.owner_id),
        surface_id: String(row.surface_id),
        grantee_id: String(row.grantee_id),
        capabilities,
        status: row.status,
        requested_at: row.requested_at,
        decided_at: row.decided_at || null,
        revoked_at: row.revoked_at || null,
        expires_at: row.expires_at || null
    };
}

function isLive(grant, now = Date.now()) {
    if (!grant || grant.status !== 'granted') return false;
    if (!grant.expires_at) return true;
    return Date.parse(grant.expires_at) > now;
}

/** Ask an owner for capabilities on one of their surfaces. Returns the pending grant.
 *  Re-asking while a request is pending returns that request rather than stacking
 *  duplicates the owner would have to refuse one by one. */
export async function requestSurfaceGrant({
    ownerId, surfaceId, granteeId, capabilities, expiresAt = null
} = {}) {
    const owner = String(ownerId || '').trim();
    const surface = String(surfaceId || '').trim();
    const grantee = String(granteeId || '').trim();
    if (!owner || !surface || !grantee) return { ok: false, error: 'surface_grant_target_invalid' };
    if (owner === grantee) return { ok: false, error: 'surface_grant_self' };

    const requested = normalizeCapabilities(capabilities?.length ? capabilities : DEFAULT_REQUESTED_CAPABILITIES);
    if (requested.length === 0) return { ok: false, error: 'surface_grant_capabilities_invalid' };

    const existing = rowToGrant(await db.query(
        'get',
        `SELECT * FROM surface_grants
         WHERE owner_id = ? AND surface_id = ? AND grantee_id = ? AND status = 'pending'
         ORDER BY requested_at DESC LIMIT 1`,
        [owner, surface, grantee]
    ));
    if (existing) return { ok: true, grant: existing, reused: true };

    const grantId = crypto.randomUUID();
    await db.query(
        'run',
        `INSERT INTO surface_grants (grant_id, owner_id, surface_id, grantee_id, capabilities, status, expires_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [grantId, owner, surface, grantee, JSON.stringify(requested), expiresAt]
    );
    const grant = rowToGrant(await db.query('get', 'SELECT * FROM surface_grants WHERE grant_id = ?', [grantId]));
    return { ok: true, grant, reused: false };
}

/** Only the owner decides. `capabilities` lets them grant *less* than was asked —
 *  §11.3 again: accepting a request must not be all-or-nothing. */
export async function decideSurfaceGrant({ grantId, ownerId, accept, capabilities = null } = {}) {
    const id = String(grantId || '').trim();
    const owner = String(ownerId || '').trim();
    const grant = rowToGrant(await db.query('get', 'SELECT * FROM surface_grants WHERE grant_id = ?', [id]));
    if (!grant) return { ok: false, error: 'surface_grant_unknown' };
    if (grant.owner_id !== owner) return { ok: false, error: 'surface_grant_not_owner' };
    if (grant.status !== 'pending') return { ok: false, error: `surface_grant_already_${grant.status}` };

    if (!accept) {
        await db.query(
            'run',
            "UPDATE surface_grants SET status = 'denied', decided_at = datetime('now') WHERE grant_id = ?",
            [id]
        );
        return { ok: true, grant: { ...grant, status: 'denied' } };
    }

    // Never grant more than was requested: the owner approves a request, they do not
    // silently widen it.
    const requested = new Set(grant.capabilities);
    const approved = capabilities === null
        ? grant.capabilities
        : normalizeCapabilities(capabilities).filter((capability) => requested.has(capability));
    if (approved.length === 0) return { ok: false, error: 'surface_grant_capabilities_invalid' };

    await db.query(
        'run',
        "UPDATE surface_grants SET status = 'granted', decided_at = datetime('now'), capabilities = ? WHERE grant_id = ?",
        [JSON.stringify(approved), id]
    );
    return { ok: true, grant: { ...grant, status: 'granted', capabilities: approved } };
}

/** Either party may end it: the owner takes their device back (§11.2), the grantee
 *  gives it up. */
export async function revokeSurfaceGrant({ grantId, principalId } = {}) {
    const id = String(grantId || '').trim();
    const principal = String(principalId || '').trim();
    const grant = rowToGrant(await db.query('get', 'SELECT * FROM surface_grants WHERE grant_id = ?', [id]));
    if (!grant) return { ok: false, error: 'surface_grant_unknown' };
    if (grant.owner_id !== principal && grant.grantee_id !== principal) {
        return { ok: false, error: 'surface_grant_not_party' };
    }
    if (grant.status === 'revoked') return { ok: true, grant };

    await db.query(
        'run',
        "UPDATE surface_grants SET status = 'revoked', revoked_at = datetime('now') WHERE grant_id = ?",
        [id]
    );
    return { ok: true, grant: { ...grant, status: 'revoked' }, revokedBy: grant.owner_id === principal ? 'owner' : 'grantee' };
}

/** The authorization check every cross-user action must go through. Same-principal
 *  actions never reach here — they are allowed by §11.1 without a grant. */
export async function hasSurfaceCapability({ ownerId, surfaceId, granteeId, capability } = {}) {
    const owner = String(ownerId || '').trim();
    const grantee = String(granteeId || '').trim();
    if (!owner || !grantee) return false;
    if (owner === grantee) return true;

    const needed = String(capability || '').trim().toLowerCase();
    if (!KNOWN_CAPABILITIES.has(needed)) return false;

    // Every live grant is considered, not just the most recent one. Capabilities are
    // deliberately separate (§11.3), so an owner who grants "receive an object" and
    // later "move the pointer" holds two concurrent grants — reading only the latest
    // would silently revoke the earlier one.
    const rows = await db.query(
        'all',
        `SELECT * FROM surface_grants
         WHERE owner_id = ? AND surface_id = ? AND grantee_id = ? AND status = 'granted'`,
        [owner, String(surfaceId || '').trim(), grantee]
    ) || [];

    const now = Date.now();
    return rows
        .map(rowToGrant)
        .filter((grant) => isLive(grant, now))
        .some((grant) => grant.capabilities.includes(needed));
}

export async function listSurfaceGrants({ principalId, role = 'all' } = {}) {
    const principal = String(principalId || '').trim();
    if (!principal) return { incoming: [], outgoing: [] };

    const incoming = role === 'outgoing' ? [] : (await db.query(
        'all',
        "SELECT * FROM surface_grants WHERE owner_id = ? AND status IN ('pending', 'granted') ORDER BY requested_at DESC",
        [principal]
    ) || []).map(rowToGrant).filter(Boolean);

    const outgoing = role === 'incoming' ? [] : (await db.query(
        'all',
        "SELECT * FROM surface_grants WHERE grantee_id = ? AND status IN ('pending', 'granted') ORDER BY requested_at DESC",
        [principal]
    ) || []).map(rowToGrant).filter(Boolean);

    return { incoming, outgoing };
}

export async function getSurfaceGrant(grantId) {
    return rowToGrant(await db.query('get', 'SELECT * FROM surface_grants WHERE grant_id = ?', [String(grantId || '')]));
}
