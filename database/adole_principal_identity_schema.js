import { ensureColumn } from './adole_schema_migrations.js';
import { isE164Phone } from '../atome/src/shared/phone_number.js';

// Private principal identity records (verified phones, aliases, guest adoption):
// authentication tables, never projected as Atome particles.

// A national spelling (`06…`) escaped the unique index next to its E.164 twin and
// never matched a lookup (the SMS flow sends E.164). The region of such a value
// is unknown, so it is retired, never rewritten; the record stays for audit.
async function revokeNonE164PhoneCredentials(query) {
    const active = await query('all', 'SELECT credential_id, normalized_phone FROM principal_phone_credentials WHERE revoked_at IS NULL');
    const now = new Date().toISOString();
    for (const row of active || []) {
        if (isE164Phone(row.normalized_phone)) continue;
        await query('run', `UPDATE principal_phone_credentials SET revoked_at = ?, revoked_reason = 'not_e164', updated_at = ?
            WHERE credential_id = ?`, [now, now, row.credential_id]);
    }
}

export async function ensurePrincipalIdentityTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS principal_phone_credentials (
        credential_id INTEGER PRIMARY KEY AUTOINCREMENT,
        principal_id TEXT NOT NULL,
        normalized_phone TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        revoked_at TEXT,
        revoked_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
    )`);
    await query('run', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_principal_phone_active_unique ON principal_phone_credentials(normalized_phone) WHERE revoked_at IS NULL');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_principal_phone_principal ON principal_phone_credentials(principal_id, revoked_at)');
    await revokeNonE164PhoneCredentials(query);
    await query('run', `CREATE TABLE IF NOT EXISTS guest_workspace_principals (
        guest_principal_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        adopted_principal_id TEXT,
        adoption_operation_digest TEXT UNIQUE,
        classified_at TEXT NOT NULL DEFAULT (datetime('now')),
        adopted_at TEXT,
        CHECK(status IN ('active', 'adopted'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS principal_identity_aliases (
        alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
        alias_value TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL,
        alias_kind TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(alias_kind IN ('legacy_principal'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS principal_identity_migrations (
        migration_id INTEGER PRIMARY KEY AUTOINCREMENT,
        legacy_principal_id TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        failure_code TEXT,
        CHECK(status IN ('prepared', 'completed', 'failed'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS principal_file_migrations (
        migration_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atome_id TEXT NOT NULL,
        legacy_principal_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        source_path TEXT NOT NULL,
        target_path TEXT NOT NULL,
        content_digest TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        failure_code TEXT,
        UNIQUE(atome_id, source_path, target_path),
        FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(status IN ('prepared', 'completed', 'failed'))
    )`);
    // Property privacy rules — §12.5 of `todo/1- condition.md`.
    //
    // `permissions` cannot express "my photo, for whoever reads it": `principal_id` is
    // NOT NULL with a foreign key, so every row targets one reader. A profile rule
    // targets *all* readers, which is a different shape and gets its own table.
    //
    // A rule is strictly RESTRICTIVE: it can only narrow an access that already exists.
    // Its absence changes nothing, and it can never grant what a permission refused —
    // otherwise a privacy feature would become a privilege-escalation path.
    await query('run', `CREATE TABLE IF NOT EXISTS property_privacy_rules (
        rule_id TEXT PRIMARY KEY,
        atome_id TEXT NOT NULL,
        particle_key TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        conditions TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(atome_id, particle_key),
        FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        FOREIGN KEY(owner_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_privacy_rules_atome ON property_privacy_rules(atome_id, particle_key)');

    // Surface grants — cross-user teleport and remote-control authorization.
    //
    // Not stored in `permissions`: that table is atome-scoped, and its `conditions`
    // column belongs to the versioned Conditions schema. A grant here is a different
    // thing — one principal authorising another to act on a *device seat*, with the
    // separate capabilities §11.3 requires. Bending `conditions` into that shape would
    // both misuse the Conditions owner and be normalised away by it.
    //
    // `grantee_id` is the principal receiving the authorization; `owner_id` owns the
    // surface and is the only one who can grant. `status` keeps a refused request
    // visible rather than deleting it, so a refusal is not silently re-askable.
    await query('run', `CREATE TABLE IF NOT EXISTS surface_grants (
        grant_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        surface_id TEXT NOT NULL,
        grantee_id TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        decided_at TEXT,
        revoked_at TEXT,
        expires_at TEXT,
        FOREIGN KEY(owner_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        FOREIGN KEY(grantee_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(status IN ('pending', 'granted', 'denied', 'revoked'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_surface_grants_owner ON surface_grants(owner_id, surface_id)');
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_surface_grants_grantee ON surface_grants(grantee_id, status)');

    await query('run', `CREATE TABLE IF NOT EXISTS account_provision_operations (
        operation_digest TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(status IN ('completed'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS guest_adoption_operations (
        operation_digest TEXT PRIMARY KEY,
        guest_principal_id TEXT NOT NULL,
        target_principal_id TEXT NOT NULL,
        manifest_digest TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        committed_at TEXT,
        completed_at TEXT,
        failure_code TEXT,
        FOREIGN KEY(target_principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(status IN ('prepared', 'importing', 'committed', 'completed', 'failed'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS guest_adoption_payloads (
        operation_digest TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        payload_digest TEXT NOT NULL,
        profile_event_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(operation_digest) REFERENCES guest_adoption_operations(operation_digest) ON DELETE CASCADE
    )`);
    await ensureColumn({ query, table: 'guest_adoption_payloads', column: 'profile_event_json', ddl: 'ALTER TABLE guest_adoption_payloads ADD COLUMN profile_event_json TEXT' });
    await query('run', `CREATE TABLE IF NOT EXISTS guest_adoption_files (
        operation_digest TEXT NOT NULL,
        file_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        status TEXT NOT NULL,
        staged_path TEXT,
        target_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(operation_digest, file_id),
        FOREIGN KEY(operation_digest) REFERENCES guest_adoption_operations(operation_digest) ON DELETE CASCADE,
        CHECK(status IN ('declared', 'staged', 'moved'))
    )`);
}
