-- ============================================================================
-- ADOLE Schema v3.0 - UNIFIED (Atome-Particle Model)
-- Single source of truth for Tauri (SQLite) and Fastify (LibSQL)
-- ============================================================================
--
-- Canonical Atome mapping:
--   - `atomes.atome_id` stores canonical envelope `id`.
--   - `atomes.atome_type` stores canonical envelope `type`.
--   - `particles` stores canonical `properties` only; envelope fields must not be
--     inserted as particle keys.
--   - `events` stores append-only canonical mutations and is the durable history
--     source for replay.
--   - `state_current` stores a materialized projection cache derived from events
--     and particles; it is not an authoritative write source.
--   - `snapshots` are acceleration or restoration checkpoints and must not
--     replace append-only history.
--   - `permissions`, `sync_queue`, and `sync_state` attach operational metadata to
--     canonical Atome ids without becoming Atome properties.
-- 
-- PRINCIPE: Tout est un ATOME (users, documents, organizations, etc.)
-- Les propriétés sont stockées dans PARTICLES (clé-valeur dynamique)
--
-- Tables:
--   1. atomes              - Identité de tous les objets (users inclus)
--   2. particles           - Propriétés des atomes
--   3. particles_versions  - Historique des modifications
--   4. snapshots           - Backups complets
--   5. events              - Event log append-only (source de verite)
--   6. state_current       - Projection materialisee (cache)
--   7. permissions         - Contrôle d'accès
--   8. sync_queue          - File de synchronisation
--   9. sync_state          - État de synchronisation
--
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ============================================================================
-- 1. TABLE atomes
-- Représente TOUT: users, documents, organizations, folders, etc.
-- Un user EST un atome avec atome_type = 'user'
-- ============================================================================

CREATE TABLE IF NOT EXISTS atomes (
    atome_id TEXT PRIMARY KEY,                      -- UUID unique
    atome_type TEXT NOT NULL,                       -- 'user', 'document', 'folder', 'organization', etc.
    parent_id TEXT,                                 -- Atome parent (hiérarchie)
    owner_id TEXT,                                  -- Atome propriétaire (user qui possède)
    creator_id TEXT,                                -- Atome créateur original
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,                                -- Soft delete
    -- Sync columns
    last_sync TEXT,                                 -- Dernière synchronisation
    created_source TEXT DEFAULT 'unknown',          -- 'tauri', 'fastify', 'sync'
    sync_status TEXT DEFAULT 'local',               -- 'local', 'synced', 'pending', 'conflict'
    
    FOREIGN KEY(parent_id) REFERENCES atomes(atome_id) ON DELETE SET NULL,
    FOREIGN KEY(owner_id) REFERENCES atomes(atome_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_atomes_type ON atomes(atome_type);
CREATE INDEX IF NOT EXISTS idx_atomes_parent ON atomes(parent_id);
CREATE INDEX IF NOT EXISTS idx_atomes_owner ON atomes(owner_id);
CREATE INDEX IF NOT EXISTS idx_atomes_sync_status ON atomes(sync_status);

-- ============================================================================
-- 2. TABLE particles
-- Propriétés des atomes (système clé-valeur dynamique)
-- Exemple pour un user: phone, username, password_hash
-- Exemple pour un document: title, content, color
-- ============================================================================

CREATE TABLE IF NOT EXISTS particles (
    particle_id INTEGER PRIMARY KEY AUTOINCREMENT,
    atome_id TEXT NOT NULL,                         -- L'atome auquel appartient cette propriété
    particle_key TEXT NOT NULL,                     -- Nom de la propriété: phone, username, title, x, y...
    particle_value TEXT,                            -- Valeur (TEXT ou JSON)
    value_type TEXT DEFAULT 'string',               -- 'string', 'number', 'boolean', 'json', 'binary'
    version INTEGER NOT NULL DEFAULT 1,             -- Version actuelle
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
    UNIQUE(atome_id, particle_key)
);

CREATE INDEX IF NOT EXISTS idx_particles_atome ON particles(atome_id);
CREATE INDEX IF NOT EXISTS idx_particles_key ON particles(particle_key);

-- ============================================================================
-- 3. TABLE particles_versions
-- Historique complet de toutes les modifications de particles
-- Utilisé pour: undo/redo, timelines, sync basé sur diff
-- ============================================================================

CREATE TABLE IF NOT EXISTS particles_versions (
    version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    particle_id INTEGER NOT NULL,                   -- Référence à particles
    atome_id TEXT NOT NULL,                         -- Redondant pour lookup rapide
    particle_key TEXT NOT NULL,                     -- Nom de la propriété au moment de la version
    version INTEGER NOT NULL,                       -- Numéro de version
    old_value TEXT,                                 -- Valeur avant modification
    new_value TEXT,                                 -- Valeur après modification
    changed_by TEXT,                                -- atome_id de l'utilisateur qui a modifié
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY(particle_id) REFERENCES particles(particle_id) ON DELETE CASCADE,
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_particles_versions_particle ON particles_versions(particle_id);
CREATE INDEX IF NOT EXISTS idx_particles_versions_atome ON particles_versions(atome_id);

-- ============================================================================
-- 4. TABLE snapshots
-- Snapshots complets d'un atome à un instant T
-- Utilisé pour: backups, exports, restauration
-- ============================================================================

CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    atome_id TEXT NOT NULL,                         -- L'atome concerné (fallback project)
    project_id TEXT,                                -- Projet associé
    snapshot_data TEXT NOT NULL,                    -- JSON complet (legacy atome + particles)
    state_blob TEXT,                                -- JSON complet (snapshot pipeline)
    label TEXT,                                     -- Label utilisateur
    snapshot_type TEXT DEFAULT 'manual',            -- 'manual', 'auto', 'sync', 'export'
    actor TEXT,                                     -- JSON actor (pipeline)
    created_by TEXT,                                -- atome_id de l'utilisateur
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_atome ON snapshots(atome_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project_id);

-- ============================================================================
-- 5. TABLE events
-- Event log append-only (source de verite)
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,                            -- UUID event id
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    atome_id TEXT,
    project_id TEXT,
    kind TEXT NOT NULL,
    payload TEXT,                                   -- JSON payload
    actor TEXT,                                     -- JSON actor
    tx_id TEXT,
    gesture_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_project_ts ON events(project_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_atome_ts ON events(atome_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_tx ON events(tx_id);

-- ============================================================================
-- 6. TABLE state_current
-- Projection materialisee (cache)
-- ============================================================================

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

-- ============================================================================
-- 7. TABLE permissions
-- Contrôle d'accès granulaire (par atome ou par particle)
-- Utilisé pour: partage ADOLE, multi-tenant via hiérarchie
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissions (
    permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
    atome_id TEXT NOT NULL,                         -- L'atome concerné
    particle_key TEXT,                              -- NULL = tout l'atome, sinon = particle spécifique
    principal_id TEXT NOT NULL,                     -- L'atome (user) qui a la permission
    can_read INTEGER NOT NULL DEFAULT 1,            -- 1 = autorisé, 0 = refusé
    can_write INTEGER NOT NULL DEFAULT 0,           -- 1 = autorisé, 0 = refusé
    can_delete INTEGER NOT NULL DEFAULT 0,          -- 1 = autorisé, 0 = refusé
    can_share INTEGER NOT NULL DEFAULT 0,           -- 1 = peut partager, 0 = non
    can_create INTEGER NOT NULL DEFAULT 0,          -- 1 = peut creer des enfants, 0 = non
    share_mode TEXT DEFAULT 'real-time',            -- 'real-time' | 'validation-based'
    conditions TEXT,                                -- JSON rules for conditional access
    granted_by TEXT,                                -- atome_id de celui qui a donné la permission
    granted_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,                                -- NULL = permanent, sinon = expiration
    
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
    FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_permissions_atome ON permissions(atome_id);
CREATE INDEX IF NOT EXISTS idx_permissions_principal ON permissions(principal_id);

-- ============================================================================
-- 8. TABLE sync_queue
-- File d'attente de synchronisation persistante
-- Garantit la fiabilité de la sync même en cas de déconnexion
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_queue (
    queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    atome_id TEXT NOT NULL,                         -- L'atome à synchroniser
    operation TEXT NOT NULL,                        -- 'create', 'update', 'delete'
    payload TEXT NOT NULL,                          -- JSON complet des données
    target_server TEXT NOT NULL DEFAULT 'fastify',  -- 'tauri', 'fastify'
    status TEXT NOT NULL DEFAULT 'pending',         -- 'pending', 'syncing', 'done', 'error'
    attempts INTEGER NOT NULL DEFAULT 0,            -- Nombre de tentatives
    max_attempts INTEGER NOT NULL DEFAULT 5,        -- Max avant échec définitif
    last_attempt_at TEXT,                           -- Dernière tentative
    next_retry_at TEXT,                             -- Prochaine tentative (backoff)
    error_message TEXT,                             -- Dernier message d'erreur
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_next_retry ON sync_queue(next_retry_at);

-- ============================================================================
-- 9. Principal identity and credential aliases
-- Canonical principals are opaque Atome ids. Credentials and migration aliases
-- are private authentication records and are never projected as Atome particles.
-- ============================================================================

CREATE TABLE IF NOT EXISTS principal_phone_credentials (
    credential_id INTEGER PRIMARY KEY AUTOINCREMENT,
    principal_id TEXT NOT NULL,
    normalized_phone TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    revoked_at TEXT,
    revoked_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_principal_phone_active_unique
    ON principal_phone_credentials(normalized_phone)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_principal_phone_principal
    ON principal_phone_credentials(principal_id, revoked_at);

-- Local guest workspaces are never credentials or remote accounts. The marker
-- is also used to quarantine historical user rows that never had credentials.
CREATE TABLE IF NOT EXISTS guest_workspace_principals (
    guest_principal_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    adopted_principal_id TEXT,
    adoption_operation_digest TEXT UNIQUE,
    classified_at TEXT NOT NULL DEFAULT (datetime('now')),
    adopted_at TEXT,
    CHECK(status IN ('active', 'adopted'))
);

-- Idempotency journal for explicit remote account provisioning. It stores no
-- credential, phone number, JWT, local principal or file data.
CREATE TABLE IF NOT EXISTS account_provision_operations (
    operation_digest TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    status TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
    CHECK(status IN ('completed'))
);

-- Explicit adoption journal. Browser guest data is staged under this durable
-- operation before the authenticated principal imports it atomically.
CREATE TABLE IF NOT EXISTS guest_adoption_operations (
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
);

CREATE TABLE IF NOT EXISTS guest_adoption_payloads (
    operation_digest TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    payload_digest TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(operation_digest) REFERENCES guest_adoption_operations(operation_digest) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guest_adoption_files (
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
);

CREATE TABLE IF NOT EXISTS principal_identity_aliases (
    alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias_value TEXT NOT NULL UNIQUE,
    principal_id TEXT NOT NULL,
    alias_kind TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
    CHECK(alias_kind IN ('legacy_principal'))
);

CREATE TABLE IF NOT EXISTS principal_identity_migrations (
    migration_id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_principal_id TEXT NOT NULL UNIQUE,
    principal_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    failure_code TEXT,
    CHECK(status IN ('prepared', 'completed', 'failed'))
);

-- ============================================================================
-- 9. TABLE sync_state
-- État de synchronisation par atome (avec hash pour détecter les changements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_state (
    atome_id TEXT PRIMARY KEY,                      -- L'atome concerné
    local_hash TEXT,                                -- Hash des données locales
    remote_hash TEXT,                               -- Hash des données distantes
    local_version INTEGER DEFAULT 0,                -- Version locale
    remote_version INTEGER DEFAULT 0,               -- Version distante
    last_sync_at TEXT,                              -- Dernière sync réussie
    sync_status TEXT DEFAULT 'unknown',             -- 'synced', 'local_ahead', 'remote_ahead', 'conflict'
    
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
);

-- ============================================================================
-- VUES UTILITAIRES (pour compatibilité et facilité d'usage)
-- ============================================================================

-- Vue pour lister les users (atomes de type 'user')
CREATE VIEW IF NOT EXISTS users_view AS
SELECT 
    a.atome_id AS user_id,
    MAX(CASE WHEN p.particle_key = 'username' THEN JSON_EXTRACT(p.particle_value, '$') END) AS username,
    MAX(CASE WHEN p.particle_key = 'password_hash' THEN JSON_EXTRACT(p.particle_value, '$') END) AS password_hash,
    a.created_at,
    a.updated_at,
    a.last_sync,
    a.created_source
FROM atomes a
LEFT JOIN particles p ON a.atome_id = p.atome_id
WHERE a.atome_type = 'user' AND a.deleted_at IS NULL
GROUP BY a.atome_id;

-- ============================================================================
-- FIN DU SCHÉMA UNIFIÉ ADOLE v3.0
-- Pas de table users séparée: les users sont des atomes avec atome_type='user'
-- Utilisez la vue users_view pour la compatibilité
-- ============================================================================
