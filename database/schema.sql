-- ============================================================================
-- ADOLE Schema v2.0 (Append-only Distributed Object Ledger Engine)
-- SQLite + libSQL compatible
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ============================================================================
-- TENANTS TABLE (for auth.js compatibility)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PRINCIPALS TABLE (for auth.js compatibility)
-- ============================================================================

CREATE TABLE IF NOT EXISTS principals (
  principal_id TEXT PRIMARY KEY,
  tenant_id TEXT,
  type TEXT DEFAULT 'user',
  name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 1. TABLE objects
-- Represents the identity, category, and ownership of an Atome object.
-- No properties are stored here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,                              -- UUID of the object
  type TEXT NOT NULL,                               -- Technical category: shape, text, sound, image, project...
  kind TEXT,                                        -- Semantic role: button, logo, layer, container...
  parent TEXT,                                      -- Parent object ID (NULL for root/projects)
  owner TEXT NOT NULL,                              -- User who currently owns the object
  creator TEXT,                                     -- User who originally created the object
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY(parent) REFERENCES objects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_objects_parent ON objects(parent);
CREATE INDEX IF NOT EXISTS idx_objects_owner ON objects(owner);

-- ============================================================================
-- 2. TABLE properties
-- Stores the CURRENT LIVE STATE of every property of an object.
-- One row = one property.
-- ============================================================================

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,                          -- The object this property belongs to
  name TEXT NOT NULL,                               -- Property name: x, y, width, color, opacity, text, src...
  value TEXT,                                       -- Current value (TEXT or JSON-encoded)
  version INTEGER NOT NULL DEFAULT 1,               -- Current version number
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE,
  UNIQUE(object_id, name)
);

CREATE INDEX IF NOT EXISTS idx_properties_object ON properties(object_id);
CREATE INDEX IF NOT EXISTS idx_properties_name ON properties(name);

-- ============================================================================
-- 3. TABLE property_versions
-- Full historical record of every property change.
-- Used for: undo/redo, branching timelines, retro-editing, diff-based sync.
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,                     -- Link to properties table
  object_id TEXT NOT NULL,                          -- Redundant for fast lookup
  name TEXT NOT NULL,                               -- Property name at time of version
  version INTEGER NOT NULL,                         -- Version number captured
  value TEXT,                                       -- Exact value at this version
  author TEXT,                                      -- User who performed the change
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prop_versions_property ON property_versions(property_id);
CREATE INDEX IF NOT EXISTS idx_prop_versions_object ON property_versions(object_id);

-- ============================================================================
-- 4. TABLE permissions
-- Fine-grained property-level sharing.
-- Controls read/write access per object or per specific property.
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,                          -- Object this permission applies to
  property_name TEXT,                               -- NULL = whole object, set = specific property
  user_id TEXT NOT NULL,                            -- User impacted by this permission
  can_read INTEGER NOT NULL DEFAULT 1,              -- 1 = allowed, 0 = denied
  can_write INTEGER NOT NULL DEFAULT 0,             -- 1 = allowed, 0 = denied
  
  FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_permissions_object ON permissions(object_id);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);

-- ============================================================================
-- 5. TABLE snapshots
-- Stores stable snapshots for full-restore operations, exports, backups.
-- ============================================================================

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,                          -- Target object
  snapshot TEXT NOT NULL,                           -- Serialized JSON of full state
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_object ON snapshots(object_id);

-- ============================================================================
-- 6. TABLE users (UNIFIED SCHEMA for Tauri + Fastify)
-- Single source of truth for user accounts
-- Compatible with both local_auth.rs (Tauri) and auth.js (Fastify)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,                         -- UUID (deterministic from phone)
  principal_id TEXT,                                -- Same as user_id (Fastify compatibility)
  tenant_id TEXT,                                   -- Tenant ID (Fastify multi-tenant)
  phone TEXT UNIQUE NOT NULL,                       -- Phone number (login identifier)
  username TEXT NOT NULL,                           -- Display name
  password_hash TEXT NOT NULL,                      -- Bcrypt hashed password
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Sync-related columns (used by Tauri)
  cloud_id TEXT,                                    -- ID on remote server if synced
  last_sync TEXT,                                   -- Last sync timestamp
  created_source TEXT DEFAULT 'unknown',            -- Where user was created: tauri, fastify, sync
  -- Optional data (used by Fastify)
  optional TEXT                                     -- JSON blob for extra user data
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ============================================================================
-- 7. TABLE sync_state (for cross-server sync)
-- Tracks sync progress with remote servers
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL UNIQUE,                   -- Remote server identifier
  last_sync_version INTEGER NOT NULL DEFAULT 0,     -- Last synced property_version id
  last_sync_at TEXT                                 -- Timestamp of last sync
);

-- ============================================================================
-- 8. TABLE sync_queue (for reliable cross-server sync)
-- Persistent queue for sync operations that failed or are pending
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,                          -- ID of the object to sync
  object_type TEXT NOT NULL DEFAULT 'atome',        -- Type: atome, user, property
  operation TEXT NOT NULL,                          -- Operation: create, update, delete
  payload TEXT NOT NULL,                            -- Full JSON payload for sync
  target_server TEXT NOT NULL DEFAULT 'tauri',      -- Target: tauri, fastify
  attempts INTEGER NOT NULL DEFAULT 0,              -- Number of sync attempts
  max_attempts INTEGER NOT NULL DEFAULT 5,          -- Max attempts before marking failed
  last_attempt_at TEXT,                             -- Last attempt timestamp
  next_retry_at TEXT,                               -- Next retry timestamp (for backoff)
  status TEXT NOT NULL DEFAULT 'pending',           -- pending, syncing, failed, success
  error_message TEXT,                               -- Last error message
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(object_id, operation, target_server)
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_next_retry ON sync_queue(next_retry_at);

-- ============================================================================
-- 9. TABLE sync_state_hash (for integrity verification)
-- Per-user hash for quick sync state comparison
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_state_hash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,                     -- User ID
  hash TEXT NOT NULL,                               -- Hash of all user's atomes
  atome_count INTEGER NOT NULL DEFAULT 0,           -- Number of atomes
  max_logical_clock INTEGER NOT NULL DEFAULT 0,     -- Max logical clock value
  last_update TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_hash_user ON sync_state_hash(user_id);
