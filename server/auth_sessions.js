/**
 * Refresh-session store — ADOLE v3.0.
 *
 * Only the revoke path survives: session creation, rotation, the
 * `x-refresh-token` reader and the Fastify cookie writer served the deleted
 * HTTP auth routes (WebSocket-only transport doctrine).
 * `setAuthCookies` also carried the last forbidden HTTP business path literal
 * left in `server/`, which is what kept the transport guard red.
 */

import { REFRESH_SESSION_PARTICLE_KEY } from './auth_crypto.js';
import { updateUserParticle } from './auth_users.js';

const MAX_REFRESH_SESSIONS_PER_USER = 8;

async function readRefreshSessions(dataSource, userId) {
    const rows = await dataSource.query(
        'SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ? LIMIT 1',
        [userId, REFRESH_SESSION_PARTICLE_KEY]
    );
    if (!rows?.[0]?.particle_value) return [];
    try {
        const parsed = JSON.parse(rows[0].particle_value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        throw new Error(`invalid_refresh_session_store:${error.message}`);
    }
}

async function writeRefreshSessions(dataSource, userId, sessions) {
    const nowMs = Date.now();
    const retained = (Array.isArray(sessions) ? sessions : [])
        .filter((session) => session && typeof session === 'object')
        .filter((session) => session.revoked_at || Date.parse(session.expires_at || '') > nowMs)
        .slice(-(MAX_REFRESH_SESSIONS_PER_USER * 2));
    await updateUserParticle(dataSource, userId, REFRESH_SESSION_PARTICLE_KEY, retained);
    return retained;
}

export async function revokeAllRefreshSessions(dataSource, userId, reason = 'credential_changed') {
    const now = new Date().toISOString();
    const sessions = await readRefreshSessions(dataSource, userId);
    const revoked = sessions.map((session) => {
        if (!session || typeof session !== 'object' || session.revoked_at) return session;
        return { ...session, revoked_at: now, revoke_reason: reason };
    });
    await writeRefreshSessions(dataSource, userId, revoked);
    return revoked.length;
}
