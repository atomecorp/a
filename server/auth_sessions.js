/**
 * auth refresh-session lifecycle & auth cookies — ADOLE v3.0.
 */

import crypto from 'crypto';
import { hashRefreshSecret, createRefreshSecret , REFRESH_SESSION_PARTICLE_KEY } from './auth_crypto.js';
import { updateUserParticle } from './auth_users.js';

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds
export const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_SESSION_TTL_MS = 60 * 60 * 24 * 7 * 1000;
const MAX_REFRESH_SESSIONS_PER_USER = 8;

export function readRefreshTokenFromRequest(request) {
    const cookieToken = request.cookies?.[REFRESH_COOKIE_NAME];
    if (cookieToken) return String(cookieToken);
    const bodyToken = request.body?.refresh_token || request.body?.refreshToken;
    if (bodyToken) return String(bodyToken);
    const headerToken = request.headers?.['x-refresh-token'];
    return headerToken ? String(headerToken) : '';
}

export async function readRefreshSessions(dataSource, userId) {
    const rows = await dataSource.query(
        'SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ? LIMIT 1',
        [userId, REFRESH_SESSION_PARTICLE_KEY]
    );
    if (!rows?.[0]?.particle_value) return [];
    try {
        const parsed = JSON.parse(rows[0].particle_value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function writeRefreshSessions(dataSource, userId, sessions) {
    const nowMs = Date.now();
    const retained = (Array.isArray(sessions) ? sessions : [])
        .filter((session) => session && typeof session === 'object')
        .filter((session) => session.revoked_at || Date.parse(session.expires_at || '') > nowMs)
        .slice(-(MAX_REFRESH_SESSIONS_PER_USER * 2));
    await updateUserParticle(dataSource, userId, retained);
    return retained;
}

export async function createRefreshSession(dataSource, userId, reason = 'login') {
    const now = new Date();
    const secret = createRefreshSecret();
    const session = {
        session_id: crypto.randomUUID(),
        token_hash: hashRefreshSecret(secret),
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + REFRESH_SESSION_TTL_MS).toISOString(),
        last_used_at: null,
        revoked_at: null,
        reason
    };
    const existing = await readRefreshSessions(dataSource, userId);
    await writeRefreshSessions(dataSource, userId, [...existing, session]);
    return {
        session_id: session.session_id,
        refresh_token: `${session.session_id}.${secret}`
    };
}

export async function consumeRefreshSession(dataSource, userId, refreshToken) {
    const [sessionId, secret] = String(refreshToken || '').split('.');
    if (!sessionId || !secret) {
        return { ok: false, error: 'Invalid refresh session' };
    }
    const sessions = await readRefreshSessions(dataSource, userId);
    const now = new Date();
    const tokenHash = hashRefreshSecret(secret);
    let matched = null;
    const updatedSessions = sessions.map((session) => {
        if (session?.session_id !== sessionId) return session;
        matched = session;
        return {
            ...session,
            last_used_at: now.toISOString(),
            revoked_at: now.toISOString(),
            revoke_reason: 'rotated'
        };
    });
    if (!matched || matched.revoked_at || matched.token_hash !== tokenHash || Date.parse(matched.expires_at || '') <= now.getTime()) {
        return { ok: false, error: 'Refresh session rejected' };
    }
    const next = await createRefreshSession(dataSource, userId, 'rotation');
    await writeRefreshSessions(dataSource, userId, [
        ...updatedSessions,
        {
            session_id: next.session_id,
            token_hash: hashRefreshSecret(next.refresh_token.split('.')[1]),
            created_at: now.toISOString(),
            expires_at: new Date(now.getTime() + REFRESH_SESSION_TTL_MS).toISOString(),
            last_used_at: null,
            revoked_at: null,
            reason: 'rotation'
        }
    ]);
    return { ok: true, session_id: next.session_id, refresh_token: next.refresh_token };
}

export async function revokeRefreshToken(dataSource, userId, refreshToken, reason = 'logout') {
    const [sessionId] = String(refreshToken || '').split('.');
    if (!sessionId) return false;
    const now = new Date().toISOString();
    const sessions = await readRefreshSessions(dataSource, userId);
    let changed = false;
    const updated = sessions.map((session) => {
        if (session?.session_id !== sessionId || session.revoked_at) return session;
        changed = true;
        return { ...session, revoked_at: now, revoke_reason: reason };
    });
    if (changed) await updateUserParticle(dataSource, userId, REFRESH_SESSION_PARTICLE_KEY, updated);
    return changed;
}

export function setAuthCookies(reply, accessToken, refreshToken, isProduction) {
    reply.setCookie('access_token', accessToken, {
        path: '/',
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE
    });
    reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
        path: '/api/auth/refresh',
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE
    });
}
