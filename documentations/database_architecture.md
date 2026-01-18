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

---

# 6. AiS — Apple iOS Server (AUV3 Platform)

## Overview

**AiS (Apple iOS Server)** is the native HTTP server embedded in the AUV3 (Audio Unit V3) plugin for iOS. Unlike the standard Fastify (Node.js) or Axum (Rust/Tauri) servers used on other platforms, AiS is a **lightweight Swift-based HTTP 1.1 server** that runs in-process within the iOS Audio Unit extension sandbox.

### Why AiS exists

* **iOS extensions cannot run Node.js or Rust runtimes** (security + sandboxing restrictions)
* **Audio Units require ultra-low latency** and minimal memory footprint
* **WebView needs local HTTP access** for serving assets and media files
* **Custom URL schemes (file://) have limitations** in WKWebView for audio playback

AiS bridges the gap by providing a minimal HTTP endpoint that emulates essential Fastify routes, allowing the Squirrel frontend to work seamlessly across all platforms.

---

## Location in Codebase

```
/src-Auv3/Common/LocalHTTPServer.swift
```

This file contains the complete implementation of AiS.

**Key components:**

* **NWListener (Network framework)**: Handles TCP connections on `127.0.0.1`
* **Dynamic port allocation**: Auto-selects available port (usually 8080 or fallback)
* **Range request support**: Enables audio streaming with seek
* **FastStart optimization**: Reorganizes M4A/MP4 atoms for progressive playback
* **Extension-only context**: Only runs in AUv3 plugin, not in main app

---

## Database Architecture

### Primary Storage: **WKWebView LocalStorage + App Group Shared Container**

AiS **does not use SQLite directly**. Instead:

1. **WebView LocalStorage** (persistent via `WKWebsiteDataStore.default()`)
   - Used in **main app** only (companion app outside AUv3)
   - Stores UI state, user preferences, temporary data

2. **WKWebsiteDataStore.nonPersistent()** in AUv3 extension
   - LocalStorage is **not persistent** across AUv3 reloads
   - This is an iOS limitation for extension sandboxing

3. **App Group Shared Container** (`FileManager.containerURL`)
   - Shared folder between main app and AUv3 extension
   - Used for:
     - Audio files (M4A, MP3, WAV)
     - Project data (JSON serialization)
     - User-created media assets

4. **iCloud Drive** (optional, user-configurable)
   - Via `iCloudFileManager.swift`
   - Enables cross-device sync for projects

### Data Persistence Strategy

```
┌─────────────────────────────────────────────┐
│  AUV3 Extension (AiS Environment)           │
├─────────────────────────────────────────────┤
│  WebView (nonPersistent storage)            │
│  ↓ writes to ↓                              │
│  App Group Shared Container                 │
│    - /audio/                                │
│    - /projects/                             │
│    - /cache/                                │
│  ↓ optionally syncs to ↓                    │
│  iCloud Drive (user choice)                 │
└─────────────────────────────────────────────┘
```

**No SQLite in AiS** because:
- Audio Unit extensions prioritize **real-time performance**
- File-based storage is simpler and faster for media-heavy workflows
- Synchronization happens at the **App Group level** (shared folder)

---

## API Endpoints

AiS emulates these essential routes for frontend compatibility:

### 1. `/api/server-info`
Returns server metadata (version, platform, allowed paths)

### 2. `/audio/*`
Serves audio files with HTTP Range support for streaming

### 3. `/api/file/*`
Reads/writes files in App Group Shared Container

### 4. `/api/projects/*` (if implemented)
CRUD operations for project data (JSON serialization)

---

## Key Features

* **In-memory request handling** (no disk I/O for HTTP protocol)
* **Range request support** (`Content-Range`, `Accept-Ranges`)
* **FastStart optimization** for M4A files (moov atom reordering)
* **Minimal attack surface** (only serves whitelisted audio extensions)
* **Automatic cleanup** on extension lifecycle events

---

## Comparison with Other Servers

| Feature | Fastify (Node.js) | Axum (Rust/Tauri) | AiS (Swift/iOS) |
|---------|-------------------|-------------------|-----------------|
| Platform | Web, Server | Desktop (Tauri) | iOS AUv3 only |
| Database | PostgreSQL (Eden) | SQLite (libSQL) | App Group Files |
| Runtime | Node.js | Rust | Native Swift |
| Port | 8080 | 3000 | Dynamic (8080+) |
| Persistence | Full SQL | Full SQL | File-based |
| Use case | Production server | Desktop offline | Audio plugin |

---

## Integration with Squirrel Framework

The frontend detects AiS via platform detection:

```javascript
// In kickstart.js or spark.js
const platform = current_platform();
if (platform.toLowerCase().includes('auv3')) {
  window.__SQUIRREL_SERVER__ = 'AiS';
  window.__SQUIRREL_FASTIFY_URL__ = `http://127.0.0.1:${AiS_PORT}`;
}
```

All API calls (`fetch`, `XMLHttpRequest`) transparently use AiS when running in AUV3 context.

### Real-time Sync Alignment (AiS ↔ Fastify)

- AiS should implement the same `/ws/sync` protocol as Axum (see `documentations/sync_protocol.md`).
- Fastify remains the **authoritative sync hub**; AiS should relay or mirror realtime events with Fastify when network is available.
- When offline, AiS remains the local authority for read/write, and replays to Fastify once reconnected.

---

## Performance Characteristics

* **Startup time**: < 50ms (native Swift, no runtime initialization)
* **Memory footprint**: ~2-5 MB (depends on active connections)
* **Latency**: < 1ms for local requests (loopback interface)
* **Audio streaming**: Supports gapless playback with Range requests

---

## Limitations

* **No WebSocket support** (use `window.webkit.messageHandlers` for bidirectional communication)
* **Extension lifecycle**: Server stops when host app terminates AUv3
* **Sandboxed I/O**: Can only access App Group Shared Container + scoped bookmarks
* **No external network**: Bound to `127.0.0.1` only (security requirement)

---

## Developer Notes

When developing features that involve AUV3:

1. **Always test persistence** (extension reload = data loss in LocalStorage)
2. **Use App Group Shared Container** for critical data
3. **Avoid SQLite unless absolutely necessary** (file-based storage is preferred)
4. **Check `current_platform()` before making API assumptions**
5. **Use `iCloudFileManager` for cross-device sync** (optional feature)

AiS is intentionally minimal. For complex database operations, use the main app or defer to cloud sync (Fastify/Eden) when network is available.
