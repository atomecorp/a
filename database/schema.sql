-- ============================================================================
-- ADOLE Schema v3.0 - UNIFIED (Atome-Particle Model)
-- Single source of truth for Tauri (SQLite) and Fastify (LibSQL)
-- ============================================================================
-- 
-- PRINCIPE: Tout est un ATOME (users, documents, organizations, etc.)
-- Les propriétés sont stockées dans PARTICLES (clé-valeur dynamique)
--
-- Tables:
--   1. atomes              - Identité de tous les objets (users inclus)
--   2. particles           - Propriétés des atomes
--   3. particles_versions  - Historique des modifications
--   4. snapshots           - Backups complets
--   5. permissions         - Contrôle d'accès
--   6. sync_queue          - File de synchronisation
--   7. sync_state          - État de synchronisation
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
    cloud_id TEXT,                                  -- ID sur serveur distant
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
    key TEXT NOT NULL,                              -- Nom de la propriété: phone, username, title, x, y...
    value TEXT,                                     -- Valeur (TEXT ou JSON)
    value_type TEXT DEFAULT 'string',               -- 'string', 'number', 'boolean', 'json', 'binary'
    version INTEGER NOT NULL DEFAULT 1,             -- Version actuelle
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
    UNIQUE(atome_id, key)
);

CREATE INDEX IF NOT EXISTS idx_particles_atome ON particles(atome_id);
CREATE INDEX IF NOT EXISTS idx_particles_key ON particles(key);

-- ============================================================================
-- 3. TABLE particles_versions
-- Historique complet de toutes les modifications de particles
-- Utilisé pour: undo/redo, timelines, sync basé sur diff
-- ============================================================================

CREATE TABLE IF NOT EXISTS particles_versions (
    version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    particle_id INTEGER NOT NULL,                   -- Référence à particles
    atome_id TEXT NOT NULL,                         -- Redondant pour lookup rapide
    key TEXT NOT NULL,                              -- Nom de la propriété au moment de la version
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
    atome_id TEXT NOT NULL,                         -- L'atome concerné
    snapshot_data TEXT NOT NULL,                    -- JSON complet (atome + toutes ses particles)
    snapshot_type TEXT DEFAULT 'manual',            -- 'manual', 'auto', 'sync', 'export'
    created_by TEXT,                                -- atome_id de l'utilisateur
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_atome ON snapshots(atome_id);

-- ============================================================================
-- 5. TABLE permissions
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
    granted_by TEXT,                                -- atome_id de celui qui a donné la permission
    granted_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,                                -- NULL = permanent, sinon = expiration
    
    FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
    FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_permissions_atome ON permissions(atome_id);
CREATE INDEX IF NOT EXISTS idx_permissions_principal ON permissions(principal_id);

-- ============================================================================
-- 6. TABLE sync_queue
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
-- 7. TABLE sync_state
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
    MAX(CASE WHEN p.key = 'phone' THEN JSON_EXTRACT(p.value, '$') END) AS phone,
    MAX(CASE WHEN p.key = 'username' THEN JSON_EXTRACT(p.value, '$') END) AS username,
    MAX(CASE WHEN p.key = 'password_hash' THEN JSON_EXTRACT(p.value, '$') END) AS password_hash,
    a.created_at,
    a.updated_at,
    a.cloud_id,
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
