import { withTransaction } from '../database/adole.js';
import { normalizePhone, generateOpaquePrincipalId } from './auth_crypto.js';

const REQUIRED_IDENTITY_TABLES = [
    'principal_phone_credentials',
    'principal_identity_aliases',
    'principal_identity_migrations',
    'guest_workspace_principals'
];

function nowIso() {
    return new Date().toISOString();
}

async function rows(dataSource, sql, params = []) {
    return dataSource.query(sql, params);
}

async function one(dataSource, sql, params = []) {
    const result = await rows(dataSource, sql, params);
    return result?.[0] || null;
}

async function assertIdentitySchema(dataSource) {
    for (const table of REQUIRED_IDENTITY_TABLES) {
        const found = await one(
            dataSource,
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            [table]
        );
        if (!found) throw new Error(`identity_schema_missing:${table}`);
    }
}

function parseParticleValue(value) {
    if (typeof value !== 'string') return value || null;
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`invalid_identity_particle:${error.message}`);
    }
}

export async function findPrincipalByPhone(dataSource, phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;
    return one(dataSource, `SELECT a.atome_id AS user_id, a.atome_type, a.created_at,
        a.updated_at, a.last_sync, a.created_source,
        MAX(CASE WHEN p.particle_key = 'username' THEN p.particle_value END) AS username,
        MAX(CASE WHEN p.particle_key = 'password_hash' THEN p.particle_value END) AS password_hash,
        MAX(CASE WHEN p.particle_key = 'visibility' THEN p.particle_value END) AS visibility
        FROM principal_phone_credentials c
        JOIN atomes a ON a.atome_id = c.principal_id
        LEFT JOIN particles p ON p.atome_id = a.atome_id
        WHERE c.normalized_phone = ? AND c.revoked_at IS NULL
          AND a.atome_type = 'user' AND a.deleted_at IS NULL
        GROUP BY a.atome_id`, [normalizedPhone]).then((record) => {
        if (!record) return null;
        return {
            ...record,
            phone: normalizedPhone,
            username: parseParticleValue(record.username),
            password_hash: parseParticleValue(record.password_hash),
            visibility: parseParticleValue(record.visibility) || 'private'
        };
    });
}

export async function readPrincipalPhone(dataSource, principalId) {
    const record = await one(dataSource, `SELECT normalized_phone FROM principal_phone_credentials
        WHERE principal_id = ? AND revoked_at IS NULL ORDER BY credential_id DESC LIMIT 1`, [principalId]);
    return record?.normalized_phone || null;
}

export async function assignVerifiedPhone(dataSource, principalId, phone, options = {}) {
    const normalizedPhone = normalizePhone(phone);
    if (!principalId || !normalizedPhone) throw new Error('invalid_phone_credential');
    const now = options.now || nowIso();
    const existing = await one(dataSource, `SELECT principal_id FROM principal_phone_credentials
        WHERE normalized_phone = ? AND revoked_at IS NULL LIMIT 1`, [normalizedPhone]);
    if (existing && String(existing.principal_id) !== String(principalId)) {
        throw new Error('phone_credential_already_assigned');
    }
    if (existing) return normalizedPhone;
    await rows(dataSource, `INSERT INTO principal_phone_credentials
        (principal_id, normalized_phone, verified_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`, [principalId, normalizedPhone, now, now, now]);
    return normalizedPhone;
}

export async function revokeVerifiedPhone(dataSource, principalId, reason = 'credential_removed') {
    const now = nowIso();
    await rows(dataSource, `UPDATE principal_phone_credentials
        SET revoked_at = ?, revoked_reason = ?, updated_at = ?
        WHERE principal_id = ? AND revoked_at IS NULL`, [now, reason, now, principalId]);
}

export async function replaceVerifiedPhone(dataSource, principalId, phone) {
    if (!principalId) throw new Error('missing_authenticated_principal');
    return withTransaction(async () => {
        const principal = await one(dataSource, `SELECT atome_id FROM atomes
            WHERE atome_id = ? AND atome_type = 'user' AND deleted_at IS NULL`, [principalId]);
        if (!principal) throw new Error('principal_not_found');
        await revokeVerifiedPhone(dataSource, principalId, 'credential_changed');
        return assignVerifiedPhone(dataSource, principalId, phone);
    });
}

export async function removeVerifiedPhone(dataSource, principalId) {
    if (!principalId) throw new Error('missing_authenticated_principal');
    return withTransaction(async () => {
        const principal = await one(dataSource, `SELECT atome_id FROM atomes
            WHERE atome_id = ? AND atome_type = 'user' AND deleted_at IS NULL`, [principalId]);
        if (!principal) throw new Error('principal_not_found');
        await revokeVerifiedPhone(dataSource, principalId, 'credential_removed');
        return true;
    });
}

export async function resolveLegacyPrincipalAlias(dataSource, legacyPrincipalId) {
    const alias = await one(dataSource, `SELECT principal_id FROM principal_identity_aliases
        WHERE alias_kind = 'legacy_principal' AND alias_value = ? LIMIT 1`, [legacyPrincipalId]);
    return alias?.principal_id || null;
}

async function moveActiveReferences(dataSource, legacyId, principalId) {
    const updates = [
        ['UPDATE atomes SET owner_id = ? WHERE owner_id = ?', [principalId, legacyId]],
        ['UPDATE atomes SET creator_id = ? WHERE creator_id = ?', [principalId, legacyId]],
        ['UPDATE atomes SET parent_id = ? WHERE parent_id = ?', [principalId, legacyId]],
        ['UPDATE permissions SET principal_id = ? WHERE principal_id = ?', [principalId, legacyId]],
        ['UPDATE permissions SET granted_by = ? WHERE granted_by = ?', [principalId, legacyId]],
        ['UPDATE state_current SET owner_id = ? WHERE owner_id = ?', [principalId, legacyId]],
        ['UPDATE sync_queue SET atome_id = ? WHERE atome_id = ?', [principalId, legacyId]],
        ['UPDATE sync_state SET atome_id = ? WHERE atome_id = ?', [principalId, legacyId]]
    ];
    for (const [sql, params] of updates) await rows(dataSource, sql, params);
}

async function isCredentiallessLegacyUser(dataSource, legacyId) {
    const records = await rows(dataSource, `SELECT particle_key FROM particles
        WHERE atome_id = ? AND particle_key IN ('phone', 'password_hash')`, [legacyId]);
    const keys = new Set((records || []).map((record) => record.particle_key));
    if (!keys.size) return true;
    if (keys.has('phone') && keys.has('password_hash')) return false;
    throw new Error(`legacy_principal_credential_ambiguous:${legacyId}`);
}

async function classifyLegacyGuestWorkspace(dataSource, legacy) {
    const now = nowIso();
    await rows(dataSource, `INSERT INTO guest_workspace_principals
        (guest_principal_id, status, classified_at) VALUES (?, 'active', ?)
        ON CONFLICT(guest_principal_id) DO NOTHING`, [legacy.atome_id, now]);
    await rows(dataSource, `UPDATE atomes SET atome_type = 'guest_workspace',
        updated_at = ? WHERE atome_id = ? AND atome_type = 'user'`, [now, legacy.atome_id]);
    return legacy.atome_id;
}

async function cloneLegacyUser(dataSource, legacy, principalId, phone) {
    const now = nowIso();
    await rows(dataSource, `INSERT INTO atomes
        (atome_id, atome_type, owner_id, creator_id, created_at, updated_at, deleted_at, last_sync, created_source, sync_status)
        VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, ?)`, [
        principalId,
        principalId,
        principalId,
        legacy.created_at,
        now,
        legacy.deleted_at,
        legacy.last_sync,
        legacy.created_source,
        legacy.sync_status
    ]);
    const particleRows = await rows(dataSource, `SELECT particle_key, particle_value, value_type, version,
        created_at, updated_at FROM particles WHERE atome_id = ? AND particle_key != 'phone'`, [legacy.atome_id]);
    for (const particle of particleRows || []) {
        await rows(dataSource, `INSERT INTO particles
            (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            principalId,
            particle.particle_key,
            particle.particle_value,
            particle.value_type,
            particle.version,
            particle.created_at,
            particle.updated_at
        ]);
    }
    const current = await one(dataSource, 'SELECT properties, updated_at, version FROM state_current WHERE atome_id = ?', [legacy.atome_id]);
    if (current) {
        const properties = parseParticleValue(current.properties) || {};
        delete properties.phone;
        await rows(dataSource, `INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version)
            VALUES (?, ?, NULL, ?, ?, ?)`, [principalId, principalId, JSON.stringify(properties), current.updated_at, current.version]);
    }
    await assignVerifiedPhone(dataSource, principalId, phone, { now });
}

async function migrateLegacyUser(dataSource, legacy) {
    const existing = await one(dataSource, `SELECT principal_id, status FROM principal_identity_migrations
        WHERE legacy_principal_id = ?`, [legacy.atome_id]);
    if (existing?.status === 'completed') return existing.principal_id;
    const principalId = existing?.principal_id || generateOpaquePrincipalId();
    const now = nowIso();
    if (!existing) {
        // The journal is deliberately written before any active-state mutation.
        // A rollback leaves no record; a process interruption is resumable from it.
        await rows(dataSource, `INSERT INTO principal_identity_migrations
            (legacy_principal_id, principal_id, status, created_at) VALUES (?, ?, 'prepared', ?)`,
        [legacy.atome_id, principalId, now]);
    }
    const phoneRecord = await one(dataSource, `SELECT particle_value FROM particles
        WHERE atome_id = ? AND particle_key = 'phone' LIMIT 1`, [legacy.atome_id]);
    const phone = normalizePhone(parseParticleValue(phoneRecord?.particle_value));
    if (!phone) throw new Error(`legacy_principal_missing_phone:${legacy.atome_id}`);
    const conflicting = await findPrincipalByPhone(dataSource, phone);
    if (conflicting && String(conflicting.user_id) !== String(principalId)) {
        throw new Error(`legacy_phone_collision:${legacy.atome_id}`);
    }
    const target = await one(dataSource, 'SELECT atome_id FROM atomes WHERE atome_id = ?', [principalId]);
    if (!target) await cloneLegacyUser(dataSource, legacy, principalId, phone);
    await moveActiveReferences(dataSource, legacy.atome_id, principalId);
    await rows(dataSource, `INSERT OR IGNORE INTO principal_identity_aliases
        (alias_value, principal_id, alias_kind, created_at) VALUES (?, ?, 'legacy_principal', ?)`,
    [legacy.atome_id, principalId, now]);
    await rows(dataSource, `UPDATE atomes SET atome_type = 'identity_alias', deleted_at = ?,
        owner_id = NULL, creator_id = NULL, updated_at = ? WHERE atome_id = ?`, [now, now, legacy.atome_id]);
    await rows(dataSource, `UPDATE principal_identity_migrations SET status = 'completed',
        completed_at = ?, failure_code = NULL WHERE legacy_principal_id = ?`, [now, legacy.atome_id]);
    return principalId;
}

export async function migrateLegacyPhonePrincipals(dataSource) {
    await assertIdentitySchema(dataSource);
    return withTransaction(async () => {
        const legacyUsers = await rows(dataSource, `SELECT atome_id, created_at, deleted_at, last_sync,
            created_source, sync_status FROM atomes WHERE atome_type = 'user'
            AND NOT EXISTS (SELECT 1 FROM principal_phone_credentials c
                WHERE c.principal_id = atomes.atome_id)`);
        const migrated = [];
        for (const legacy of legacyUsers || []) {
            if (await isCredentiallessLegacyUser(dataSource, legacy.atome_id)) {
                migrated.push(await classifyLegacyGuestWorkspace(dataSource, legacy));
            } else {
                migrated.push(await migrateLegacyUser(dataSource, legacy));
            }
        }
        return migrated;
    });
}

export async function ensureOpaquePrincipalIdentity(dataSource) {
    await migrateLegacyPhonePrincipals(dataSource);
    return true;
}
