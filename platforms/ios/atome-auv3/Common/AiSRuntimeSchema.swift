import Foundation

// Schema of `adole.db`, applied by `openDatabase` each time the process opens the handle.
// Outbox and synchronization additions are in `ensureSyncSchema`.
extension AiSRuntime {
    static let schemaSQL = """
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS atomes (
        atome_id TEXT PRIMARY KEY,
        atome_type TEXT NOT NULL,
        parent_id TEXT,
        owner_id TEXT,
        creator_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        last_sync TEXT,
        created_source TEXT DEFAULT 'ais',
        sync_status TEXT DEFAULT 'local'
    );
    CREATE INDEX IF NOT EXISTS idx_atomes_type ON atomes(atome_type);
    CREATE INDEX IF NOT EXISTS idx_atomes_parent ON atomes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_atomes_owner ON atomes(owner_id);
    CREATE INDEX IF NOT EXISTS idx_atomes_type_lower ON atomes(LOWER(COALESCE(atome_type, '')));
    CREATE TABLE IF NOT EXISTS principal_phone_credentials (
        credential_id INTEGER PRIMARY KEY AUTOINCREMENT,
        principal_id TEXT NOT NULL,
        normalized_phone TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        revoked_at TEXT,
        revoked_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_principal_phone_active_unique
        ON principal_phone_credentials(normalized_phone) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_principal_phone_principal
        ON principal_phone_credentials(principal_id, revoked_at);
    CREATE TABLE IF NOT EXISTS guest_workspace_principals (
        guest_principal_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        adopted_principal_id TEXT,
        adoption_operation_digest TEXT UNIQUE,
        classified_at TEXT NOT NULL DEFAULT (datetime('now')),
        adopted_at TEXT,
        CHECK(status IN ('active', 'adopted'))
    );
    CREATE TABLE IF NOT EXISTS principal_identity_aliases (
        alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
        alias_value TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL,
        alias_kind TEXT NOT NULL CHECK(alias_kind IN ('legacy_principal')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS principal_identity_migrations (
        migration_id INTEGER PRIMARY KEY AUTOINCREMENT,
        legacy_principal_id TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('prepared', 'completed', 'failed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        failure_code TEXT
    );
    CREATE TABLE IF NOT EXISTS particles (
        particle_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atome_id TEXT NOT NULL,
        particle_key TEXT NOT NULL,
        particle_value TEXT,
        value_type TEXT DEFAULT 'string',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(atome_id, particle_key)
    );
    CREATE INDEX IF NOT EXISTS idx_particles_atome ON particles(atome_id);
    CREATE INDEX IF NOT EXISTS idx_particles_key ON particles(particle_key);
    CREATE TABLE IF NOT EXISTS particles_versions (
        version_id INTEGER PRIMARY KEY AUTOINCREMENT,
        particle_id INTEGER NOT NULL,
        atome_id TEXT NOT NULL,
        particle_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT,
        changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Same index as database/schema.sql: each delivered envelope reads its Atome's removed
    -- particles here, a full scan of the history (2.7 ms per envelope on an iPad).
    CREATE INDEX IF NOT EXISTS idx_particles_versions_atome ON particles_versions(atome_id);
    CREATE TABLE IF NOT EXISTS state_current (
        atome_id TEXT PRIMARY KEY,
        owner_id TEXT,
        project_id TEXT,
        properties TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        version INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_state_current_project ON state_current(project_id);
    CREATE INDEX IF NOT EXISTS idx_state_current_owner ON state_current(owner_id);
    CREATE INDEX IF NOT EXISTS idx_state_current_json_type ON state_current(LOWER(COALESCE(json_extract(properties, '$.type'), '')));
    CREATE INDEX IF NOT EXISTS idx_state_current_json_kind ON state_current(LOWER(COALESCE(json_extract(properties, '$.kind'), '')));
    -- Listings page by recency: without it every page decoded and sorted the whole table.
    CREATE INDEX IF NOT EXISTS idx_state_current_updated ON state_current(updated_at DESC, atome_id);
    CREATE TABLE IF NOT EXISTS permissions (
        permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atome_id TEXT NOT NULL,
        particle_key TEXT,
        principal_id TEXT NOT NULL,
        can_read INTEGER NOT NULL DEFAULT 1,
        can_write INTEGER NOT NULL DEFAULT 0,
        can_delete INTEGER NOT NULL DEFAULT 0,
        can_share INTEGER NOT NULL DEFAULT 0,
        can_create INTEGER NOT NULL DEFAULT 0,
        share_mode TEXT DEFAULT 'real-time',
        conditions TEXT,
        granted_by TEXT,
        granted_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_permissions_atome ON permissions(atome_id);
    CREATE INDEX IF NOT EXISTS idx_permissions_principal ON permissions(principal_id);
    CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        atome_id TEXT,
        project_id TEXT,
        kind TEXT NOT NULL,
        payload TEXT,
        actor TEXT,
        tx_id TEXT,
        gesture_id TEXT,
        stream_id TEXT,
        sequence INTEGER,
        source TEXT,
        lww_decisions TEXT,
        projection TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_atome ON events(atome_id);
    CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_stream_sequence
        ON events(stream_id, sequence) WHERE stream_id IS NOT NULL AND sequence IS NOT NULL;
    CREATE TABLE IF NOT EXISTS snapshots (
        snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atome_id TEXT,
        project_id TEXT,
        snapshot_data TEXT,
        state_blob TEXT,
        label TEXT,
        snapshot_type TEXT DEFAULT 'manual',
        actor TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
        queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atome_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT,
        target_server TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_atome ON sync_queue(atome_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    """
}
