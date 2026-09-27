import db from '../database/adole.js';
import jwt from 'jsonwebtoken';
import { AUTH_LINK_ORIGIN } from '../atome/src/shared/auth_link_contract.js';

export async function assertDeviceSessionClaims(claims, query = db.query, now = Date.now()) {
    if (claims.auth_version !== 1 || claims.iss !== AUTH_LINK_ORIGIN || claims.aud !== 'atome-ws'
        || typeof claims.sid !== 'string' || typeof claims.cnf?.kid !== 'string') throw new Error('auth_session_invalid');
    const row = await query('get', `SELECT s.principal_id, s.key_id, s.revoked_ms, s.idle_expires_ms, s.expires_ms,
        k.revoked_ms AS key_revoked_ms FROM auth_device_sessions s
        JOIN auth_device_keys k ON k.key_id = s.key_id WHERE s.session_id = ?`, [claims.sid]);
    if (!row || row.principal_id !== claims.sub || row.key_id !== claims.cnf.kid || row.revoked_ms !== null
        || row.key_revoked_ms !== null || row.idle_expires_ms <= now || row.expires_ms <= now) throw new Error('auth_session_invalid');
    return claims;
}

export async function validateConnectionDeviceSession(connection, token, secret) {
    if (token) {
        const claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
        await assertDeviceSessionClaims(claims);
        connection._wsApiSessionId = claims.sid || null;
        connection._wsApiDeviceClaims = claims.sid ? claims : null;
        return claims;
    }
    if (connection?._wsApiDeviceClaims) {
        if (connection._wsApiDeviceClaims.exp * 1000 <= Date.now()) throw new Error('auth_session_invalid');
        await assertDeviceSessionClaims(connection._wsApiDeviceClaims);
    }
    return null;
}
