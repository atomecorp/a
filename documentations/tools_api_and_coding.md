# Atome Tools API (v1)

Goal: a minimal, standardized tool surface to manipulate Atomes with CRUD,
patch, share, duplicate, history, and hierarchy operations. All writes are
translated internally to Command Bus / ADOLE (append-only).

Atome format references:
- `documentations/atome_object.md`
- `documentations/ADOLE.md`

## Canonical Atome Shape

```jsonc
{
  "id": "uuid",
  "type": "shape.rect",
  "kind": "shape",           // optional, validated or derived
  "renderer": "dom",         // optional UI hint
  "meta": {
    "name": "Box",
    "tags": ["draft"],
    "created_by": "user_id", // immutable
    "created_at": "iso",     // immutable
    "updated_at": "iso"
  },
  "properties": { "layout": { "size": [100, 80] } }
}
```

System invariants:
- `meta.created_by` and `meta.created_at` are immutable.
- Writes attempting to change immutable fields must be rejected by the Command Bus.

## Tool List (minimal)

1) `atome.create`
2) `atome.get`
3) `atome.list`
4) `atome.patch`
5) `atome.delete`
6) `atome.share`
7) `atome.duplicate`
8) `atome.history`
9) `atome.batch` (optional but recommended)

## Tool Schemas

### atome.create
```jsonc
{
  "type": "shape.rect",
  "kind": "shape",
  "renderer": "dom",
  "properties": { ... },
  "meta": { "name": "Box", "tags": ["draft"] },
  "parent_id": "uuid?"
}
```

Default parent rule:
- If `parent_id` is omitted, the system attaches the new Atome to the current
  project layer.

Creation completeness rule:
- `atome.create` must include all physical characteristics needed to recreate
  the object from history (geometry, layout, style, media references, etc.).
  Missing essential properties is treated as invalid for persistence/replay.

### atome.get
```jsonc
{ "id": "uuid", "include": ["properties", "meta", "children"] }
```

### atome.list
```jsonc
{ "type": "shape.rect?", "kind": "shape?", "parent_id": "uuid?", "limit": 100, "offset": 0 }
```

### atome.patch
```jsonc
{
  "id": "uuid",
  "patch": {
    "properties.layout.size": [300,120],
    "properties.paint.fill": "#ff0000",
    "meta.tags": { "$add": ["featured"] }
  }
}
```

### atome.delete
```jsonc
{ "id": "uuid", "mode": "soft|hard" }
```

### atome.share
```jsonc
{
  "id": "uuid",
  "target_user_id": "user_2",
  "permissions": {
    "properties.paint.fill": "write",
    "properties.layout.size": "read"
  }
}
```

### atome.duplicate
```jsonc
{
  "id": "uuid",
  "mode": "copy",            // copy | clone | fork
  "new_id": "uuid?",
  "parent_id": "uuid?",
  "include_history": false
}
```

Duplicate modes:
- `copy`: new object, new `id`, new `meta.created_by`, clean history.
- `clone`: new object, same `properties`, same `meta.created_by`, clean history.
- `fork`: new object, same `properties`, preserves history (or a bounded subset if policy requires).

### atome.history
```jsonc
{ "id": "uuid", "key": "properties.paint.fill?", "limit": 50 }
```

### atome.batch
```jsonc
{
  "commands": [
    { "action": "PATCH", "id": "a1", "patch": { "properties.layout.size": [200,100] } },
    { "action": "PATCH", "id": "a2", "patch": { "properties.paint.fill": "#00ff00" } }
  ]
}
```

## Patch Operators (minimal)

- Replace: `"properties.layout.size": [200,100]`
- Increment: `"properties.audio.gain": { "$inc": 0.1 }`
- Add to list: `"properties.children": { "$add": ["child_id"] }`
- Remove from list: `"properties.children": { "$remove": ["child_id"] }`

## Coverage Mapping

- CRUD: create/get/list/patch/delete
- Alterations: patch (translated to ADOLE)
- Share: share
- Duplicate: duplicate
- History: history
- Add child: create with parent_id, or patch properties.children
- Property mutations: patch
 - Immutable creator: enforced via meta.created_by + meta.created_at invariants

## Internal Rule

CRUD endpoints are a facade. Every write is converted into Command Bus
intentions and stored append-only via ADOLE.

## MCP / AI Access

All tools above must be exposed to AI via MCP, with the same validation,
policy, and audit guarantees as human/UI usage. MCP calls are treated as
first-class inputs and must not bypass Command Bus or immutable field rules.

## Project Snapshot + Validation Points

A project is an Atome. The system must maintain a snapshot of the latest
project state (similar to a virtual DOM) for fast restore and sync. Validation
points act as savepoints and include a serialized snapshot to restore the
project quickly without replaying the full history. Snapshots must be derived
from canonical Atome data and remain compatible with ADOLE history.
See `documentations/Adole Time Machine.md` for the snapshot format and MCP
event schema.

## Hierarchy Rules

Any Atome can contain another Atome. A project is an Atome and can contain
other Atomes. An Atome may appear under a parent as a:
- copy (new id, new creator),
- clone (new id, same creator),
- moved instance (same id, re-parented).
By default, newly created Atomes are attached to the current project unless a
parent is explicitly provided.
