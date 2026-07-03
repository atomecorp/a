/**
 * auth user particle projection & optional normalization — ADOLE v3.0.
 */

import { appendEvent } from '../database/adole.js';
import { normalizePhone , REFRESH_SESSION_PARTICLE_KEY } from './auth_crypto.js';
import { updateUserParticle } from './auth_users.js';

export const RESERVED_USER_PARTICLE_KEYS = new Set([
    'id',
    'atome_id',
    'user_id',
    'type',
    'kind',
    'owner_id',
    'creator_id',
    'created_at',
    'updated_at',
    'deleted_at',
    'sync_status',
    'last_sync',
    'password_hash',
    'phone',
    'username',
    'visibility',
    'access',
    REFRESH_SESSION_PARTICLE_KEY
]);

export function normalizeUserOptional(optional) {
    if (!optional || typeof optional !== 'object' || Array.isArray(optional)) {
        return {};
    }
    const cleaned = {};
    for (const [key, value] of Object.entries(optional)) {
        if (!key || RESERVED_USER_PARTICLE_KEYS.has(key)) continue;
        cleaned[key] = value;
    }
    return cleaned;
}

export function normalizeAccessValue(value) {
    return String(value || '').toLowerCase() === 'public' ? 'public' : 'private';
}

export async function getUserOptionalParticles(dataSource, userId) {
    if (!dataSource || !userId) return {};
    try {
        const rows = await dataSource.query(
            'SELECT particle_key, particle_value FROM particles WHERE atome_id = ?',
            [String(userId)]
        );
        const optional = {};
        for (const row of rows || []) {
            const key = row?.particle_key ? String(row.particle_key) : '';
            if (!key) continue;
            if (RESERVED_USER_PARTICLE_KEYS.has(key)) continue;
            if (key.startsWith('_')) continue;
            let value = row?.particle_value;
            if (typeof value === 'string') {
                try { value = JSON.parse(value); } catch (error) {
        console.warn("[cleanup] operation failed", error); }
            }
            optional[key] = value;
        }
        return optional;
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        return {};
    }
}

export async function ensureUserAtomeType(dataSource, userId, currentType = null) {
    if (!dataSource || !userId) return false;
    if (currentType === 'user') return false;
    const now = new Date().toISOString();
    try {
        await dataSource.query(
            "UPDATE atomes SET atome_type = 'user', updated_at = ?, sync_status = 'local' WHERE atome_id = ? AND atome_type != 'user'",
            [now, userId]
        );
        return true;
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        return false;
    }
}

export async function repairMistypedUserAtomes(dataSource) {
    if (!dataSource) return 0;
    try {
        const rows = await dataSource.query(
            `SELECT a.atome_id, a.atome_type
             FROM atomes a
             WHERE a.deleted_at IS NULL
               AND a.atome_type != 'user'
               AND EXISTS (
                   SELECT 1 FROM particles p
                   WHERE p.atome_id = a.atome_id
                     AND p.particle_key = 'password_hash'
               )
               AND EXISTS (
                   SELECT 1 FROM particles p
                   WHERE p.atome_id = a.atome_id
                     AND p.particle_key = 'phone'
               )`
        );
        let repaired = 0;
        for (const row of rows || []) {
            if (!row?.atome_id) continue;
            const changed = await ensureUserAtomeType(dataSource, row.atome_id, row.atome_type || null);
            if (changed) repaired += 1;
        }
        return repaired;
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        return 0;
    }
}

export async function upsertUserStateCurrent(dataSource, userId, username, phone, visibility, now, optional = {}) {
    if (!dataSource || !userId) return;
    const patch = {
        type: 'user',
        name: username,
        username,
        phone,
        visibility,
        access: visibility
    };
    const optionalPatch = normalizeUserOptional(optional);
    await appendEvent({
        atome_id: userId,
        kind: 'set',
        ts: now,
        payload: {
            props: { ...patch, ...optionalPatch }
        },
        actor: { type: 'user', id: userId }
    });
}
