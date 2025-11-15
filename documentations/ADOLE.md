### Specification Document: ADOLE (Atome Description Object Language Engine)

---

#### 1. Global Objective

ADOLE is a universal description and execution engine designed to describe, render, and manipulate any kind of object — visual, textual, audio, or conceptual — in a structured, declarative, and AI-friendly form. It forms the foundation of the **Atome** ecosystem and interacts closely with Atome’s system layers (distributed database, user jails, historization, and granular data sharing).

---

#### 2. Core Principles

* **Agnostic**: An object can represent any type of entity (text, sound, shape, abstract logic).
* **Modular**: Each property category is grouped into distinct modules (geometry, visual, spatial, layout, events, meta, etc.).
* **Hierarchical**: Objects can contain children, forming a nested tree structure.
* **Declarative**: Structures are defined by data, not imperative code.
* **Human & AI Readable**: JSON-like format with a consistent schema.
* **Persistent & Distributed**: Objects can be stored, versioned, and shared between Atome instances through a network of PostgreSQL-based jails.

---

#### 3. Canonical Object Structure

```json
{
  "type": "text",
  "content": "Hello World",
  "geometry": {
    "width": "auto",
    "height": "auto",
    "units": { "width": "px", "height": "px" }
  },
  "spatial": {
    "left": 50,
    "top": 100,
    "units": { "left": "px", "top": "px" }
  },
  "visual": {
    "color": "#000",
    "background": "#f0f0f0",
    "borderRadius": "8px"
  },
  "layout": {
    "display": "flex",
    "alignItems": "center",
    "justifyContent": "center",
    "position": "relative"
  },
  "events": {
    "draggable": {
      "on": {
        "start": "(event, atome) => puts('Drag started')",
        "drag": "(event, atome) => puts('Dragging')"
      }
    }
  },
  "meta": {
    "version": 42,
    "author": "user123",
    "history_ref": "uuid-xyz",
    "permissions": { "read": ["public"], "write": ["owner"] }
  },
  "tag": "headline"
}
```

---

#### 4. Property Categories

* **geometry** → width, height, depth, radius
* **spatial** → position, anchor, z-index
* **visual** → color, background, border, shadow, opacity
* **layout** → display, flex/grid configuration, alignment
* **events** → modular interaction systems (draggable, touchable, resizable...)
* **meta** → identifiers, version, author, permissions, links, constraints

---

#### 5. Historization & Versioning

* Each object is **automatically versioned** upon modification.
* The history is **granular**: individual properties can be reverted or reapplied independently.
* Versions are **branchable**: new variants can be derived from any past state.
* ADOLE integrates with a **distributed PostgreSQL versioning engine** capable of reconstructing any object state at any point in time.

---

#### 6. User Jails & Isolated Environments

* Each user runs within an isolated **jail** (FreeBSD concept) hosting their local Atome instance.
* Each jail contains:

  * A local PostgreSQL instance
  * Its own ADOLE engine
  * A cache of used objects
* Jails can **synchronize their databases** according to defined permissions and conditions.
* Computational workloads can be shared between jails when necessary.

---

#### 7. Distributed & Granular Sharing

* Sharing occurs **per property**: every object element can be independently exposed or protected.
* Jails communicate through **secure channels**.
* Public spaces may use shared databases, but architecture remains decentralized.
* Version conflicts are automatically resolved using timestamps and configurable priority rules.

---

#### 8. Use Cases

* Visual editors (canvas/UI builders)
* Data-driven UI rendering
* Interactive and multimedia installations
* Code-to-UI interpreters
* AI-driven UI generation systems
* Runtime descriptors for audio/video tools
* Modular, collaborative operating systems

---

#### 9. Technical Architecture

1. **Core Engine**:

   * Parses and validates structures.
   * Builds a hierarchical object graph.
   * Maps property categories to capability modules.
   * Supports introspection, dynamic extensions, and network synchronization.

2. **Capability System (Modules)**:

   * Each module defines a schema, rules, and runtime hooks.
   * Examples: `draggable`, `touchable`, `audio-reactive`, `network-shared`, `versioned`.

3. **Schema & Validation**:

   * Based on JSON Schema or TypeScript.
   * Ensures consistency and completeness across tools.

4. **Persistence & Multi-Context Execution**:

   * Distributed PostgreSQL between jails.
   * Execution contexts: DOM/Canvas, WebGL, AudioGraph, ConceptGraph.
   * ADOLE → runtime mapping via specific interpreters.

---

#### 10. Extension & Future

* Native DSL language (simplified textual syntax)
* Runtime compiler/interpreter
* Graphical debugging and visualization tools
* TypeScript/JSON Schema typings
* Full support for distributed, versioned, and shared objects

---

#### 11. Status & Objective

ADOLE is the foundation of the **Atome** ecosystem. Its purpose is to provide a generic, readable, executable, and synchronizable framework for describing, versioning, and sharing interactive objects within a modular, distributed environment.

---

### PostgreSQL Schema

```sql
-- Tenants & identities
CREATE TABLE tenants (
  tenant_id   UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE principals (
  principal_id UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES tenants,
  kind         TEXT CHECK (kind IN ('user','service')),
  email        CITEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Objects & branches
CREATE TABLE objects (
  object_id   UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants,
  type        TEXT NOT NULL,
  created_by  UUID REFERENCES principals,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE branches (
  branch_id   UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants,
  object_id   UUID NOT NULL REFERENCES objects,
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (object_id, name)
);

-- Commits (DAG via parent references)
CREATE TABLE commits (
  commit_id     UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants,
  object_id     UUID NOT NULL REFERENCES objects,
  branch_id     UUID NOT NULL REFERENCES branches,
  author_id     UUID REFERENCES principals,
  logical_clock BIGINT NOT NULL,
  lsn_hint      PG_LSN,
  created_at    TIMESTAMPTZ DEFAULT now(),
  message       TEXT
);

CREATE TABLE commit_parents (
  commit_id  UUID NOT NULL REFERENCES commits ON DELETE CASCADE,
  parent_id  UUID NOT NULL REFERENCES commits,
  PRIMARY KEY (commit_id, parent_id)
);

-- Granular property deltas
CREATE TABLE changes (
  change_id     BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants,
  commit_id     UUID NOT NULL REFERENCES commits ON DELETE CASCADE,
  property_path TEXT NOT NULL,
  patch_op      TEXT NOT NULL,
  patch_value   JSONB,
  prev_hash     BYTEA,
  new_hash      BYTEA
);

-- Materialized state (JSONB snapshot per branch)
CREATE TABLE object_state (
  tenant_id   UUID NOT NULL REFERENCES tenants,
  object_id   UUID NOT NULL REFERENCES objects,
  branch_id   UUID NOT NULL REFERENCES branches,
  version_seq BIGINT NOT NULL,
  snapshot    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, object_id, branch_id)
);

-- Fine-grained ACLs (object or property path)
CREATE TABLE acls (
  acl_id        UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants,
  object_id     UUID NOT NULL REFERENCES objects,
  property_path TEXT,
  principal_id  UUID NOT NULL REFERENCES principals,
  action        TEXT NOT NULL,
  allow         BOOLEAN NOT NULL
);

-- Cross-jail sharing
CREATE TABLE shares (
  share_id      UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants,
  object_id     UUID NOT NULL REFERENCES objects,
  target_tenant UUID NOT NULL REFERENCES tenants,
  mode          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Useful indexes
CREATE INDEX changes_by_commit ON changes (tenant_id, commit_id);
CREATE INDEX changes_by_path   ON changes (tenant_id, property_path);
CREATE INDEX object_state_json ON object_state USING GIN (snapshot jsonb_path_ops);
CREATE INDEX acls_idx          ON acls (tenant_id, object_id, property_path, action, principal_id);
```

---

### 12) Evolution Strategy (MVP → Ultra) — without breaking changes

#### 12.8 Minimal SQL Diff (Extensibility)

```sql
ALTER TABLE objects ADD COLUMN schema_version INT DEFAULT 1;
ALTER TABLE objects ADD COLUMN capability_flags JSONB DEFAULT '{}'::jsonb;
ALTER TABLE objects ADD COLUMN meta JSONB DEFAULT '{}'::jsonb;
ALTER TABLE commits ADD COLUMN meta JSONB DEFAULT '{}'::jsonb;
ALTER TABLE commits ADD COLUMN root_hash BYTEA;
ALTER TABLE changes ADD COLUMN meta JSONB DEFAULT '{}'::jsonb;
ALTER TABLE changes ADD COLUMN inverse_op TEXT;
ALTER TABLE changes ADD COLUMN inverse_value JSONB;

CREATE TABLE IF NOT EXISTS object_snapshots (
  tenant_id   UUID NOT NULL,
  object_id   UUID NOT NULL,
  branch_id   UUID NOT NULL,
  commit_id   UUID NOT NULL,
  version_seq BIGINT NOT NULL,
  snapshot    JSONB NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (tenant_id, object_id, branch_id, commit_id)
);

CREATE TABLE IF NOT EXISTS json_nodes (
  node_hash  BYTEA PRIMARY KEY,
  kind       TEXT NOT NULL,
  data       JSONB,
  children   JSONB
);
```

---

### 13) Multi-Device and Differentiated Storage Extensions

#### 1. Local and Remote Storage Management

* Add an indicator in each object to distinguish between local, remote, or mirrored data.
* Allow the definition of retention rules (time, size, priority, object type).
* Support an on-demand reload mechanism from the online storage hub.

#### 2. Central Online Storage (Shared Hub)

* Create an online PostgreSQL instance containing all synchronizable data.
* This hub stores all commits, snapshots, and changes, serving as the source of truth.
* Local jails only retain the objects or versions required for their active context.

#### 3. Selective and Differential Synchronization

* Each jail (device) defines which objects or properties to synchronize.
* Synchronization is based on deltas (changes), comparing hashes and timestamps.
* Conflicts are resolved by priority rules (timestamp, author, or master device).

#### 4. Multi-Device and Unified Identities

* All devices of a user share the same `tenant_id`.
* Each device has a unique `device_id` to track commits and replication events.
* Data created on one device syncs to the hub, then redistributes to other devices.

#### 5. Local Cache and Automatic Purge

* Locally store only active or recently used objects.
* Purge or archive inactive ones to save disk space.
* Keep a minimal index (UUID, hash, metadata) to retrieve remote objects on demand.

#### 6. SQL Schema Extensions (Recommended)

```sql
ALTER TABLE objects ADD COLUMN is_local BOOLEAN DEFAULT TRUE;
ALTER TABLE objects ADD COLUMN device_id UUID;
ALTER TABLE objects ADD COLUMN last_sync TIMESTAMPTZ;
ALTER TABLE objects ADD COLUMN sync_status TEXT;

CREATE TABLE IF NOT EXISTS sync_queue (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants,
  object_id UUID NOT NULL REFERENCES objects,
  device_id UUID,
  action TEXT NOT NULL,           -- 'push', 'pull', 'merge', etc.
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### 7. Full Offline Mode

* Each jail functions independently without a connection.
* Upon reconnection, the engine reapplies deltas and updates affected branches.

---

This section defines the additional requirements to evolve ADOLE into a hybrid local/online, multi-device, synchronized, and storage-efficient architecture.
