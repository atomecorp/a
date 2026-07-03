/**
 * auth user atome management (CRUD + particles + state projection) — ADOLE v3.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { getABoxEventBus } from './aBoxServer.js';
import { ensureUserHome } from './userHome.js';
import { appendEvent } from '../database/adole.js';
import { normalizePhone, generateDeterministicUserId, hashPassword } from './auth_crypto.js';
import { getUserOptionalParticles, ensureUserAtomeType, upsertUserStateCurrent, normalizeUserOptional, normalizeAccessValue } from './auth_user_particles.js';

export const ANONYMOUS_PHONE = '0000000000';
export const ANONYMOUS_USERNAME = 'anonymous';
export const ANONYMOUS_PASSWORD = 'anonymous';
export const ANONYMOUS_VISIBILITY = 'private';
export const ANONYMOUS_OPTIONAL = { anonymous: true, local_only: true };

export async function createUserAtome(dataSource, userId, username, phone, passwordHash, visibility = 'public', optional = {}) {
    const now = new Date().toISOString();
    // Normalize visibility value
    const normalizedVisibility = normalizeAccessValue(visibility);
    const optionalParticles = normalizeUserOptional(optional);

    // Check if user exists (including soft-deleted)
    const existingRows = await dataSource.query(
        `SELECT atome_id, deleted_at, atome_type FROM atomes WHERE atome_id = ?`,
        [userId]
    );

    if (existingRows.length > 0) {
        const existing = existingRows[0];
        const existingType = existing.atome_type || null;
        const needsTypeRepair = !existingType || existingType !== 'user';
        if (existing.deleted_at) {
            // Reactivate soft-deleted user
            console.log(`🔄 [ADOLE] Reactivating soft-deleted user: ${userId}`);

            if (needsTypeRepair) {
                await ensureUserAtomeType(dataSource, userId, existingType);
            }

            // Clear deleted_at and update timestamp
            await dataSource.query(
                `UPDATE atomes SET deleted_at = NULL, updated_at = ?, sync_status = 'local' WHERE atome_id = ?`,
                [now, userId]
            );

            // Update particles (username and password might have changed)
            await dataSource.query(
                `UPDATE particles SET particle_value = ?, updated_at = ? WHERE atome_id = ? AND particle_key = 'username'`,
                [JSON.stringify(username), now, userId]
            );
            await dataSource.query(
                `UPDATE particles SET particle_value = ?, updated_at = ? WHERE atome_id = ? AND particle_key = 'password_hash'`,
                [JSON.stringify(passwordHash), now, userId]
            );
            await dataSource.query(
                `UPDATE particles SET particle_value = ?, updated_at = ? WHERE atome_id = ? AND particle_key = 'visibility'`,
                [JSON.stringify(normalizedVisibility), now, userId]
            );
            await dataSource.query(
                `UPDATE particles SET particle_value = ?, updated_at = ? WHERE atome_id = ? AND particle_key = 'access'`,
                [JSON.stringify(normalizedVisibility), now, userId]
            );

            for (const [key, value] of Object.entries(optionalParticles)) {
                await updateUserParticle(dataSource, userId, key, value);
            }

            await upsertUserStateCurrent(dataSource, userId, username, phone, normalizedVisibility, now, optionalParticles);

            console.log(`✅ [ADOLE] User reactivated: ${username} (${phone}) [${userId}]`);

            return {
                user_id: userId,
                username,
                phone,
                created_at: now,
                created_source: 'fastify',
                reactivated: true
            };
        }

        if (needsTypeRepair) {
            console.log(`🧩 [ADOLE] Repairing mistyped user atome: ${userId}`);
            await ensureUserAtomeType(dataSource, userId, existingType);

            const particles = [
                { key: 'phone', value: JSON.stringify(phone) },
                { key: 'username', value: JSON.stringify(username) },
                { key: 'password_hash', value: JSON.stringify(passwordHash) },
                { key: 'visibility', value: JSON.stringify(normalizedVisibility) },
                { key: 'access', value: JSON.stringify(normalizedVisibility) }
            ];

            for (const p of particles) {
                await dataSource.query(
                    `INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                        particle_value = excluded.particle_value,
                        updated_at = excluded.updated_at`,
                    [userId, p.key, p.value, now]
                );
            }

            for (const [key, value] of Object.entries(optionalParticles)) {
                await updateUserParticle(dataSource, userId, key, value);
            }

            await upsertUserStateCurrent(dataSource, userId, username, phone, normalizedVisibility, now, optionalParticles);

            return {
                user_id: userId,
                username,
                phone,
                created_at: now,
                created_source: 'fastify',
                repaired: true
            };
        }

        // User exists and is not deleted - throw error
        throw new Error('User already exists');
    }

    // Create the atome with type 'user'
    await dataSource.query(
        `INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, sync_status, created_source, created_at, updated_at)
         VALUES (?, 'user', ?, ?, 'local', 'fastify', ?, ?)`,
        [userId, userId, userId, now, now]
    );

    // Create particles for user properties (particle_id is auto-increment)
    const particles = [
        { key: 'phone', value: JSON.stringify(phone) },
        { key: 'username', value: JSON.stringify(username) },
        { key: 'password_hash', value: JSON.stringify(passwordHash) },
        { key: 'visibility', value: JSON.stringify(normalizedVisibility) },
        { key: 'access', value: JSON.stringify(normalizedVisibility) }
    ];

    for (const p of particles) {
        await dataSource.query(
            `INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
             VALUES (?, ?, ?, ?)`,
            [userId, p.key, p.value, now]
        );
    }

    for (const [key, value] of Object.entries(optionalParticles)) {
        await updateUserParticle(dataSource, userId, key, value);
    }

    await upsertUserStateCurrent(dataSource, userId, username, phone, normalizedVisibility, now, optionalParticles);

    try {
        const accessRows = await dataSource.query(
            'SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ?',
            [userId, 'access']
        );
        const storedAccess = accessRows?.[0]?.particle_value ? JSON.parse(accessRows[0].particle_value) : null;
        console.log(`✅ [ADOLE] User atome created: ${username} (${phone}) [${userId}] access=${storedAccess}`);
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        console.log(`✅ [ADOLE] User atome created: ${username} (${phone}) [${userId}] access=${normalizedVisibility}`);
    }

    return {
        user_id: userId,
        username,
        phone,
        created_at: now,
        created_source: 'fastify'
    };
}

export async function findUserByPhone(dataSource, phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;

    const parseUserRow = (user) => ({
        user_id: user.user_id,
        username: user.username ? JSON.parse(user.username) : null,
        phone: user.phone ? JSON.parse(user.phone) : null,
        password_hash: user.password_hash ? JSON.parse(user.password_hash) : null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sync: user.last_sync,
        created_source: user.created_source,
        atome_type: user.atome_type || 'user'
    });

    const directRows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.atome_type, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'password_hash' THEN p.particle_value END) AS password_hash
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id
         WHERE a.atome_type = 'user' AND a.deleted_at IS NULL
         GROUP BY a.atome_id
         HAVING MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) = ?`,
        [JSON.stringify(normalizedPhone)]
    );

    if (directRows.length > 0) {
        const hit = parseUserRow(directRows[0]);
        if (hit.atome_type !== 'user') {
            await ensureUserAtomeType(dataSource, hit.user_id, hit.atome_type);
        }
        return hit;
    }

    const rows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.atome_type, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'password_hash' THEN p.particle_value END) AS password_hash
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id
         WHERE a.deleted_at IS NULL
         GROUP BY a.atome_id`
    );

    const match = rows.find((row) => {
        if (!row?.phone || !row?.password_hash) return false;
        try {
            const storedPhone = JSON.parse(row.phone);
            return normalizePhone(storedPhone) === normalizedPhone;
        } catch (error) {
        console.warn("[cleanup] operation failed", error);
            return false;
        }
    });

    if (!match) return null;
    const parsed = parseUserRow(match);
    if (parsed.atome_type !== 'user') {
        await ensureUserAtomeType(dataSource, parsed.user_id, parsed.atome_type);
    }
    return parsed;
}

export async function ensureAnonymousUser(dataSource) {
    if (!dataSource) return { ok: false, error: 'no_datasource' };
    const phone = normalizePhone(ANONYMOUS_PHONE);
    if (!phone) return { ok: false, error: 'invalid_phone' };

    const deterministicId = generateDeterministicUserId(phone);

    try {
        const existingByPhone = await findUserByPhone(dataSource, phone);
        if (existingByPhone?.user_id) {
            return { ok: true, userId: existingByPhone.user_id, exists: true };
        }

        const existingById = await dataSource.query(
            'SELECT atome_id, deleted_at FROM atomes WHERE atome_id = ?',
            [deterministicId]
        );
        if (existingById.length > 0) {
            if (existingById[0]?.deleted_at) {
                await dataSource.query(
                    `UPDATE atomes SET deleted_at = NULL, updated_at = ?, sync_status = 'local' WHERE atome_id = ?`,
                    [new Date().toISOString(), deterministicId]
                );
            }
            return { ok: true, userId: deterministicId, exists: true };
        }

        const passwordHash = await hashPassword(ANONYMOUS_PASSWORD);
        await createUserAtome(
            dataSource,
            deterministicId,
            ANONYMOUS_USERNAME,
            phone,
            passwordHash,
            ANONYMOUS_VISIBILITY,
            ANONYMOUS_OPTIONAL
        );

        console.log(`[Auth] Anonymous user ensured: ${ANONYMOUS_USERNAME} (${phone}) [${deterministicId}]`);
        return { ok: true, userId: deterministicId, created: true };
    } catch (error) {
        console.warn('[Auth] Failed to ensure anonymous user:', error?.message || error);
        return { ok: false, error: error?.message || String(error) };
    }
}

export async function findUserById(dataSource, userId) {
    const rows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.atome_type, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'password_hash' THEN p.particle_value END) AS password_hash
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id
         WHERE a.atome_id = ? AND a.atome_type = 'user' AND a.deleted_at IS NULL
         GROUP BY a.atome_id`,
        [userId]
    );

    if (rows.length > 0) {
        const user = rows[0];
        return {
            user_id: user.user_id,
            username: user.username ? JSON.parse(user.username) : null,
            phone: user.phone ? JSON.parse(user.phone) : null,
            password_hash: user.password_hash ? JSON.parse(user.password_hash) : null,
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_sync: user.last_sync,
            created_source: user.created_source
        };
    }

    const secondary = await dataSource.query(
        `SELECT a.atome_id as user_id, a.atome_type, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'password_hash' THEN p.particle_value END) AS password_hash
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id
         WHERE a.atome_id = ? AND a.deleted_at IS NULL
         GROUP BY a.atome_id`,
        [userId]
    );

    if (secondary.length === 0) return null;
    const user = secondary[0];
    if (!user.password_hash) return null;
    if (user.atome_type && user.atome_type !== 'user') {
        await ensureUserAtomeType(dataSource, user.user_id, user.atome_type);
    }
    return {
        user_id: user.user_id,
        username: user.username ? JSON.parse(user.username) : null,
        phone: user.phone ? JSON.parse(user.phone) : null,
        password_hash: user.password_hash ? JSON.parse(user.password_hash) : null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sync: user.last_sync,
        created_source: user.created_source
    };
}

export async function listAllUsers(dataSource, includePrivate = false) {
    await repairMistypedUserAtomes(dataSource);

    // Build query with visibility filter
    const visibilityFilter = includePrivate
        ? ''
        : `AND EXISTS (SELECT 1 FROM particles pv WHERE pv.atome_id = a.atome_id AND pv.particle_key = 'visibility' AND pv.particle_value = '"public"')`;

    const rows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.created_at, a.updated_at, a.last_sync, a.created_source,
                MAX(CASE WHEN p.particle_key = 'phone' THEN p.particle_value END) AS phone,
                MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
                MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id
         WHERE a.atome_type = 'user' AND a.deleted_at IS NULL ${visibilityFilter}
         GROUP BY a.atome_id
         ORDER BY a.created_at DESC`
    );

    return rows.map(user => ({
        user_id: user.user_id,
        username: user.username ? JSON.parse(user.username) : null,
        phone: user.phone ? JSON.parse(user.phone) : null,
        visibility: user.visibility ? JSON.parse(user.visibility) : 'private',
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sync: user.last_sync,
        created_source: user.created_source
    }));
}

export async function updateUserParticle(dataSource, userId, key, value) {
    const now = new Date().toISOString();
    const valueStr = JSON.stringify(value);

    // Check if particle exists
    const existing = await dataSource.query(
        `SELECT particle_id, version FROM particles WHERE atome_id = ? AND particle_key = ?`,
        [userId, key]
    );

    if (existing.length > 0) {
        const newVersion = (existing[0].version || 1) + 1;
        await dataSource.query(
            `UPDATE particles SET particle_value = ?, version = ?, updated_at = ? WHERE atome_id = ? AND particle_key = ?`,
            [valueStr, newVersion, now, userId, key]
        );
    } else {
        // particle_id is auto-increment, don't specify it
        await dataSource.query(
            `INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
             VALUES (?, ?, ?, 'string', 1, ?, ?)`,
            [userId, key, valueStr, now, now]
        );
    }

    // Update atome's updated_at
    await dataSource.query(
        `UPDATE atomes SET updated_at = ?, sync_status = 'pending' WHERE atome_id = ?`,
        [now, userId]
    );
}

export async function deleteUserAtome(dataSource, userId) {
    const now = new Date().toISOString();
    await dataSource.query(
        `UPDATE atomes SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE atome_id = ?`,
        [now, now, userId]
    );
    console.log(`🗑️ [ADOLE] User atome soft-deleted: ${userId}`);
}

export async function syncUserToTauri(username, phone, passwordHash, userId = null, optional = {}, visibility = 'public') {
    try {
        const eventBus = getABoxEventBus();
        if (eventBus) {
            const safeOptional = normalizeUserOptional(optional);
            const normalizedVisibility = normalizeAccessValue(visibility);
            eventBus.emit('event', {
                type: 'sync:account-created',
                timestamp: new Date().toISOString(),
                runtime: 'Fastify',
                payload: {
                    userId: userId || generateDeterministicUserId(phone),
                    username,
                    phone,
                    passwordHash,
                    source: 'fastify',
                    optional: safeOptional,
                    visibility: normalizedVisibility,
                    access: normalizedVisibility
                }
            });
            console.log(`🔄 [WebSocket] User sync event emitted: ${username} (${phone})`);
            return { success: true, synced: true };
        } else {
            console.warn(`⚠️ EventBus not available for sync`);
            return { success: false, error: 'EventBus not available' };
        }
    } catch (error) {
        console.warn(`⚠️ WebSocket sync failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}
