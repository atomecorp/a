/**
 * auth user atome management (CRUD + particles + state projection) — ADOLE v3.0.
 */

import { getABoxEventBus } from './aBoxServer.js';
import { ensureUserHome } from './userHome.js';
import { withTransaction } from '../database/adole.js';
import { normalizePhone } from './auth_crypto.js';
import { ensureUserAtomeType, upsertUserStateCurrent, normalizeUserOptional, normalizeAccessValue } from './auth_user_particles.js';
import {
    assignVerifiedPhone,
    ensureOpaquePrincipalIdentity,
    findPrincipalByPhone,
    readPrincipalPhone,
    revokeVerifiedPhone
} from './auth_identity.js';


export async function createUserAtome(dataSource, userId, username, phone, passwordHash, visibility = 'private', optional = {}) {
    return withTransaction(() => createUserAtomeInTransaction(
        dataSource, userId, username, phone, passwordHash, visibility, optional
    ));
}

async function createUserAtomeInTransaction(dataSource, userId, username, phone, passwordHash, visibility = 'private', optional = {}) {
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

            await assignVerifiedPhone(dataSource, userId, phone, { now });
            await upsertUserStateCurrent(dataSource, userId, username, normalizedVisibility, now, optionalParticles);

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
            await ensureUserAtomeType(dataSource, userId, existingType);

            const particles = [
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

            await assignVerifiedPhone(dataSource, userId, phone, { now });
            await upsertUserStateCurrent(dataSource, userId, username, normalizedVisibility, now, optionalParticles);

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

    await assignVerifiedPhone(dataSource, userId, phone, { now });
    await upsertUserStateCurrent(dataSource, userId, username, normalizedVisibility, now, optionalParticles);

    return {
        user_id: userId,
        username,
        phone,
        created_at: now,
        created_source: 'fastify'
    };
}

export async function findUserByPhone(dataSource, phone) {
    await ensureOpaquePrincipalIdentity(dataSource);
    return findPrincipalByPhone(dataSource, phone);
}

export async function findUserById(dataSource, userId) {
    await ensureOpaquePrincipalIdentity(dataSource);
    const rows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.atome_type, a.created_at, a.updated_at, a.last_sync, a.created_source,
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
            phone: await readPrincipalPhone(dataSource, user.user_id),
            password_hash: user.password_hash ? JSON.parse(user.password_hash) : null,
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_sync: user.last_sync,
            created_source: user.created_source
        };
    }

    const secondary = await dataSource.query(
        `SELECT a.atome_id as user_id, a.atome_type, a.created_at, a.updated_at, a.last_sync, a.created_source,
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
        phone: await readPrincipalPhone(dataSource, user.user_id),
        password_hash: user.password_hash ? JSON.parse(user.password_hash) : null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sync: user.last_sync,
        created_source: user.created_source
    };
}

export async function listAllUsers(dataSource, includePrivate = false) {
    await ensureOpaquePrincipalIdentity(dataSource);

    // Build query with visibility filter
    const visibilityFilter = includePrivate
        ? ''
        : `AND EXISTS (SELECT 1 FROM particles pv WHERE pv.atome_id = a.atome_id AND pv.particle_key = 'visibility' AND pv.particle_value = '"public"')`;

    const rows = await dataSource.query(
        `SELECT a.atome_id as user_id, a.created_at, a.updated_at, a.last_sync, a.created_source,
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
        phone: null,
        visibility: user.visibility ? JSON.parse(user.visibility) : 'private',
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sync: user.last_sync,
        created_source: user.created_source
    }));
}

export async function updateUserParticle(dataSource, userId, key, value) {
    if (key === 'phone') throw new Error('phone_particle_is_not_a_supported_credential_store');
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
    await revokeVerifiedPhone(dataSource, userId, 'account_deleted');
}

export async function syncUserToTauri(username, phone, passwordHash, userId = null, optional = {}, visibility = 'private') {
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
                    userId,
                    username,
                    phone,
                    passwordHash,
                    source: 'fastify',
                    optional: safeOptional,
                    visibility: normalizedVisibility,
                    access: normalizedVisibility
                }
            });
            return { success: true, synced: true };
        } else {
            return { success: false, error: 'EventBus not available' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}
