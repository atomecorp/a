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
-- 6. TABLE users (for local auth)
-- Stores local user accounts for offline authentication
-- Compatible with auth.js column names
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,                         -- UUID (used as principal ID)
  principal_id TEXT,                                -- Same as user_id (compatibility)
  tenant_id TEXT,                                   -- Tenant ID (default: squirrel-main)
  phone TEXT UNIQUE,                                -- Phone number (login)
  username TEXT,                                    -- Display name
  password_hash TEXT,                               -- Hashed password
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

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
