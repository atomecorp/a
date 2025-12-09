-- ============================================================================
-- ADOLE Unified Schema for SQLite / libSQL (Turso)
-- ============================================================================
-- 
-- This schema implements the ADOLE (Append-only Distributed Object Ledger Engine)
-- data model. All operations are append-only with full versioning support.
--
-- Compatible with:
-- - SQLite native (iOS, Desktop, Node.js)
-- - SQLite WASM (Browser)
-- - libSQL (Turso cloud)
--
-- NO PostgreSQL-specific features used.
-- ============================================================================

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Tenants: Multi-tenant isolation
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Principals: Users and service accounts
CREATE TABLE IF NOT EXISTS principals (
    principal_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('user', 'service', 'system')),
    name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_principals_tenant ON principals(tenant_id);

-- Users: Authentication data (extends principals)
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    principal_id TEXT UNIQUE REFERENCES principals(principal_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    username TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ============================================================================
-- ADOLE OBJECT MODEL
-- ============================================================================

-- Objects: Base table for all entities (atomes, files, etc.)
CREATE TABLE IF NOT EXISTS objects (
    object_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    type TEXT NOT NULL,              -- 'atome', 'file', 'folder', etc.
    kind TEXT,                       -- sub-type (e.g., 'document', 'image')
    created_by TEXT REFERENCES principals(principal_id),
    parent_id TEXT REFERENCES objects(object_id),
    meta TEXT DEFAULT '{}',          -- JSON metadata
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT                  -- Soft delete (append-only)
);

CREATE INDEX IF NOT EXISTS idx_objects_tenant ON objects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type);
CREATE INDEX IF NOT EXISTS idx_objects_parent ON objects(parent_id);
CREATE INDEX IF NOT EXISTS idx_objects_created_by ON objects(created_by);

-- Properties: Key-value storage per object (ADOLE property model)
CREATE TABLE IF NOT EXISTS properties (
    property_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL REFERENCES objects(object_id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,                      -- JSON-serialized value
    value_type TEXT,                 -- 'string', 'number', 'boolean', 'object', 'array'
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(object_id, key)
);

CREATE INDEX IF NOT EXISTS idx_properties_object ON properties(object_id);
CREATE INDEX IF NOT EXISTS idx_properties_key ON properties(key);

-- Property Versions: Append-only history for time-travel
CREATE TABLE IF NOT EXISTS property_versions (
    version_id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    object_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,                      -- JSON-serialized new value
    previous_value TEXT,             -- JSON-serialized previous value
    changed_by TEXT REFERENCES principals(principal_id),
    change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete')),
    changed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_property_versions_property ON property_versions(property_id);
CREATE INDEX IF NOT EXISTS idx_property_versions_object ON property_versions(object_id);
CREATE INDEX IF NOT EXISTS idx_property_versions_key ON property_versions(object_id, key);
CREATE INDEX IF NOT EXISTS idx_property_versions_time ON property_versions(changed_at);

-- ============================================================================
-- ACL (Access Control List)
-- ============================================================================

-- ACLs: Granular permissions per property
CREATE TABLE IF NOT EXISTS acls (
    acl_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    object_id TEXT NOT NULL REFERENCES objects(object_id) ON DELETE CASCADE,
    principal_id TEXT NOT NULL REFERENCES principals(principal_id) ON DELETE CASCADE,
    property_path TEXT,              -- Specific property or NULL for whole object
    action TEXT NOT NULL CHECK (action IN ('read', 'write', 'delete', 'admin')),
    allow INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    created_by TEXT REFERENCES principals(principal_id),
    UNIQUE(tenant_id, object_id, principal_id, property_path, action)
);

CREATE INDEX IF NOT EXISTS idx_acls_object ON acls(object_id);
CREATE INDEX IF NOT EXISTS idx_acls_principal ON acls(principal_id);

-- ============================================================================
-- SYNCHRONIZATION
-- ============================================================================

-- Sync Queue: Pending sync operations
CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
    object_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('push', 'pull', 'merge')),
    device_id TEXT,
    payload TEXT DEFAULT '{}',       -- JSON payload
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_device ON sync_queue(device_id);

-- Sync State: Track last sync per device
CREATE TABLE IF NOT EXISTS sync_state (
    device_id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(tenant_id),
    last_sync_at TEXT,
    last_sync_version TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- ATOMES (High-level wrapper for objects)
-- ============================================================================

-- Atomes: Convenience view/table for atome-type objects
CREATE TABLE IF NOT EXISTS atomes (
    atome_id TEXT PRIMARY KEY,
    object_id TEXT UNIQUE NOT NULL REFERENCES objects(object_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    owner_id TEXT REFERENCES principals(principal_id),
    atome_type TEXT NOT NULL,
    name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_atomes_tenant ON atomes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_atomes_owner ON atomes(owner_id);
CREATE INDEX IF NOT EXISTS idx_atomes_type ON atomes(atome_type);
CREATE INDEX IF NOT EXISTS idx_atomes_object ON atomes(object_id);

-- ============================================================================
-- SCHEMA MIGRATIONS
-- ============================================================================

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- DEFAULT TENANT (for single-tenant mode)
-- ============================================================================

INSERT OR IGNORE INTO tenants (tenant_id, name) 
VALUES ('default', 'Default Tenant');
