# Complete Atome / ADOLE Architecture (SQLite + libSQL)

Below is the full database schema rewritten **in English**, with a clear explanation of the **role of every field**.

---

# 1. TABLE `objects`

Represents the identity, category, and ownership of an Atome object. No properties are stored here.

```sql
CREATE TABLE objects (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  kind TEXT,
  parent TEXT,
  owner TEXT NOT NULL,
  creator TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_objects_parent ON objects(parent);
CREATE INDEX idx_objects_owner ON objects(owner);
```

### Field roles

* **id**: Unique identifier (UUID) of the object.
* **type**: Technical category (shape, text, sound, image…). Determines rendering + engine behavior.
* **kind**: Semantic role (button, logo, layer…). Does not affect rendering; helps logic & filtering.
* **parent**: Parent object ID for hierarchy (null for root objects/projects).
* **owner**: User who currently owns the object.
* **creator**: User who originally created the object.
* **created_at**: Timestamp of object creation.
* **updated_at**: Timestamp of last structural update.

---

# 2. TABLE `properties`

Stores the **current live state** of every property of an object.
One row = one property.

```sql
CREATE TABLE properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE
);

CREATE INDEX idx_properties_object ON properties(object_id);
CREATE INDEX idx_properties_name ON properties(name);
```

### Field roles

* **id**: Internal DB ID for the property.
* **object_id**: The object to which the property belongs.
* **name**: Property name (x, y, width, color, opacity, text, src…).
* **value**: Current value (TEXT or JSON-encoded).
* **version**: Current version number of this property.
* **updated_at**: Timestamp of last property change.

---

# 3. TABLE `property_versions`

Full historical record of every property change.
Used for: undo/redo, branching timelines, retro-editing, diff-based sync.

```sql
CREATE TABLE property_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  object_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  value TEXT,
  author TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE
);

CREATE INDEX idx_prop_versions_property ON property_versions(property_id);
CREATE INDEX idx_prop_versions_object ON property_versions(object_id);
```

### Field roles

* **id**: Internal ID of the version entry.
* **property_id**: Link to the `properties` table entry.
* **object_id**: Redundant link for fast lookup.
* **name**: Name of the property at the time of the version.
* **version**: Version number captured (incremented on each change).
* **value**: The exact value at this version.
* **author**: User who performed the change.
* **created_at**: Exact timestamp of the property modification.

---

# 4. TABLE `permissions`

Used for **fine-grained property-level sharing**.
Allows controlling read/write access per object or per specific property.

```sql
CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,
  property_name TEXT,
  user_id TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 1,
  can_write INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_permissions_object ON permissions(object_id);
CREATE INDEX idx_permissions_user ON permissions(user_id);
```

### Field roles

* **id**: Internal permission rule ID.
* **object_id**: Object this permission applies to.
* **property_name**: If NULL → rule applies to whole object.
  If set → applies only to this property.
* **user_id**: User impacted by this permission.
* **can_read**: 1 = allowed, 0 = denied.
* **can_write**: 1 = allowed, 0 = denied.

---

# 5. TABLE `snapshots`

Stores stable snapshots of an object for full-restore operations, exports, backups.

```sql
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_snapshots_object ON snapshots(object_id);
```

### Field roles

* **id**: Snapshot ID.
* **object_id**: Target object.
* **snapshot**: Serialized JSON of the full state at snapshot time.
* **created_at**: Timestamp when snapshot was taken.

---

# Summary

This schema enables:

* Full property-level versioning
* Fine-grained permissions
* Delta-based real-time sync
* Time travel (restore any property version)
* Branching timelines
* Offline sync resolution
* SQLite + libSQL compatibility
* Zero ORM → fast, predictable, minimal code
