// An account's roles, kept in the account store (database/auth_security_schema.sql,
// table `auth_account_roles`): `admin` validates or refuses the feature requests and
// moves them on the Roadmap (server/ws_feature_requests.js). A role is given and taken
// back only on the server (scripts/account_roles_admin.mjs); no frame grants one. The
// HTTP admin routes keep their own admin password (server_utils.js), unchanged.
//
// `account-roles` on /ws/api: the roles of the signed-in account asking, so the app
// shows the admin's views; the server checks the role again on every admin frame.
import db from '../database/adole.js';
import { isWsApiPrincipalProvisioned, resolveWsApiPrincipal } from './wsApiIdentity.js';
import { wsResponse } from './wsResponse.js';

export const ACCOUNT_ROLES = Object.freeze(['admin']);
export const ACCOUNT_ROLES_FRAME = 'account-roles';

const requireRole = (role) => {
    if (!ACCOUNT_ROLES.includes(role)) throw new Error(`account_role_unknown:${role}`);
    return role;
};

export function createAccountRoles({ query = db.query, now = Date.now } = {}) {
    const list = async principalId => (await query('all', 'SELECT role FROM auth_account_roles WHERE principal_id = ? ORDER BY role',
        [String(principalId)])).map(row => row.role);
    const has = async (principalId, role) => Boolean(principalId)
        && Boolean(await query('get', 'SELECT 1 AS found FROM auth_account_roles WHERE principal_id = ? AND role = ?', [String(principalId), requireRole(role)]));
    const grant = async (principalId, role, by) => {
        await query('run', 'INSERT OR IGNORE INTO auth_account_roles (principal_id, role, granted_ms, granted_by) VALUES (?, ?, ?, ?)',
            [String(principalId), requireRole(role), now(), String(by)]);
        return list(principalId);
    };
    const revoke = async (principalId, role) => {
        await query('run', 'DELETE FROM auth_account_roles WHERE principal_id = ? AND role = ?', [String(principalId), requireRole(role)]);
        return list(principalId);
    };
    const holders = async role => query('all', 'SELECT principal_id, granted_ms, granted_by FROM auth_account_roles WHERE role = ? ORDER BY granted_ms',
        [requireRole(role)]);
    return { list, has, grant, revoke, holders };
}

// The signed-in account of a /ws/api frame (its token, else the connection's still valid one), else null:
// a token that does not verify signs nobody in.
export const wsSignedInPrincipal = async (connection, data) => {
    let userId;
    try {
        userId = resolveWsApiPrincipal(connection, data);
    } catch {
        return null;
    }
    return userId && await isWsApiPrincipalProvisioned(userId) ? String(userId) : null;
};

export async function handleWsAccountRoles(data, connection, { roles = createAccountRoles() } = {}) {
    if (data?.type !== ACCOUNT_ROLES_FRAME) return null;
    const principalId = await wsSignedInPrincipal(connection, data);
    // A guest or a visitor has no role: an empty answer, not a failure.
    return wsResponse(ACCOUNT_ROLES_FRAME, data, true, { ok: true, roles: principalId ? await roles.list(principalId) : [] });
}
