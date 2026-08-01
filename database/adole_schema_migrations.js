async function ensureColumn({ query, table, column, ddl }) {
    const columns = await query('all', `PRAGMA table_info(${table})`);
    const names = new Set((columns || []).map((col) => col.name));
    if (!names.has(column)) await query('run', ddl);
}

async function ensurePermissionsColumns(query) {
    await ensureColumn({
        query,
        table: 'permissions',
        column: 'can_create',
        ddl: "ALTER TABLE permissions ADD COLUMN can_create INTEGER NOT NULL DEFAULT 0"
    });
    await ensureColumn({
        query,
        table: 'permissions',
        column: 'share_mode',
        ddl: "ALTER TABLE permissions ADD COLUMN share_mode TEXT DEFAULT 'real-time'"
    });
    await ensureColumn({
        query,
        table: 'permissions',
        column: 'conditions',
        ddl: "ALTER TABLE permissions ADD COLUMN conditions TEXT"
    });
}

async function ensureSnapshotColumns(query) {
    await ensureColumn({ query, table: 'snapshots', column: 'project_id', ddl: "ALTER TABLE snapshots ADD COLUMN project_id TEXT" });
    await ensureColumn({ query, table: 'snapshots', column: 'state_blob', ddl: "ALTER TABLE snapshots ADD COLUMN state_blob TEXT" });
    await ensureColumn({ query, table: 'snapshots', column: 'label', ddl: "ALTER TABLE snapshots ADD COLUMN label TEXT" });
    await ensureColumn({ query, table: 'snapshots', column: 'actor', ddl: "ALTER TABLE snapshots ADD COLUMN actor TEXT" });
}

async function ensureEventColumns(query) {
    await ensureColumn({ query, table: 'events', column: 'project_id', ddl: "ALTER TABLE events ADD COLUMN project_id TEXT" });
    await ensureColumn({ query, table: 'events', column: 'actor', ddl: "ALTER TABLE events ADD COLUMN actor TEXT" });
    await ensureColumn({ query, table: 'events', column: 'tx_id', ddl: "ALTER TABLE events ADD COLUMN tx_id TEXT" });
    await ensureColumn({ query, table: 'events', column: 'gesture_id', ddl: "ALTER TABLE events ADD COLUMN gesture_id TEXT" });
}

async function ensureStateCurrentColumns(query) {
    const columns = await query('all', "PRAGMA table_info(state_current)");
    const names = new Set((columns || []).map((col) => col.name));
    if (names.has('owner_id')) return;
    await query('run', "ALTER TABLE state_current ADD COLUMN owner_id TEXT");
    await query(
        'run',
        "UPDATE state_current SET owner_id = (SELECT owner_id FROM atomes WHERE atomes.atome_id = state_current.atome_id) WHERE owner_id IS NULL"
    );
}

async function ensurePrincipalIdentityTables(query) {
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(operation_digest) REFERENCES guest_adoption_operations(operation_digest) ON DELETE CASCADE
    )`);
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

async function refreshUsersView(query) {
    await query('run', 'DROP VIEW IF EXISTS users_view');
    await query('run', `CREATE VIEW users_view AS
        SELECT a.atome_id AS user_id,
            MAX(CASE WHEN p.particle_key = 'username' THEN JSON_EXTRACT(p.particle_value, '$') END) AS username,
            MAX(CASE WHEN p.particle_key = 'password_hash' THEN JSON_EXTRACT(p.particle_value, '$') END) AS password_hash,
            a.created_at, a.updated_at, a.last_sync, a.created_source
        FROM atomes a LEFT JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'user' AND a.deleted_at IS NULL
        GROUP BY a.atome_id`);
}

async function runAdoleSchemaMigrations(query) {
    await ensurePermissionsColumns(query);
    await ensureSnapshotColumns(query);
    await ensureEventColumns(query);
    await ensureStateCurrentColumns(query);
    await ensurePrincipalIdentityTables(query);
    await refreshUsersView(query);
}

export { runAdoleSchemaMigrations };
