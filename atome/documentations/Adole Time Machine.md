# Atome / ADOLE — Historical Model & Time Manipulation

Core principle

In Atome / ADOLE, history is a first‑class concept. Every object is fully traceable at property level, not only at object level. Each property (color, position, text, image prompt, etc.) has its own independent timeline.

Nothing is ever overwritten or deleted. All states remain accessible.

⸻

Granular history (property‑level)

An object is composed of properties. Each property:
 • Has its own version history
 • Can be inspected, reverted, forked, or replayed independently
 • Can be shared or restricted independently (permissions)

This allows extremely precise control over time and evolution.

⸻

Two distinct time‑editing modes

1. Restore a past state into the present (state copy)

You select a past state (date/version) and apply it as a new present state.
 • The past remains unchanged
 • The present receives a copy of the selected state
 • A new version is appended at the end of the timeline

No historical replay occurs.

Example
 • 14:00 → Object is red
 • 15:00 → Object is blue
 • 16:00 → Object is scaled ×2

You restore the state from 14:00 at 17:00:
 • 17:00 → Object becomes red again

The intermediate steps (blue, scale ×2) are not replayed. They remain in history, but the present is simply updated with the selected state.

Use case
 • Quick undo
 • Visual rollback
 • Creative branching without rewriting history

⸻

2. Modify the past and replay history (temporal rewrite)

You edit a property at a past time, and the system recomputes all subsequent states deterministically.
 • A new branch is created
 • Every step between the edited time and now is replayed
 • Only the modified value changes; the sequence remains identical

This is not a simple revert — it is a causal rewrite.

Example
Original timeline:
 • 14:00 → color = red
 • 15:00 → color = blue
 • 16:00 → scale = ×2
 • 17:00 → rotation = 30°

You modify 14:00 and change color from red → green.

New branch result:
 • 14:00 → color = green (edited)
 • 15:00 → color = blue (recomputed from green base)
 • 16:00 → scale = ×2
 • 17:00 → rotation = 30°

The object arrives at the present fully recomposed, but with the corrected past.

Use case
 • Correcting an early mistake
 • Fixing an initial prompt or parameter
 • Deterministic regeneration (DALL·E, generative objects, procedural content)

⸻

Viewing history at a specific date

Atome allows you to:
 • Inspect the exact state of an object at any timestamp
 • Preview it visually or logically
 • Compare multiple branches

This works:
 • Per object
 • Per property
 • Per user (depending on permissions)

Example
“Show me the object exactly as it was on 2025‑03‑12 at 09:42.”

The system reconstructs the object from property histories only — no snapshots required.

⸻

DALL·E / generative Atome specific case

For a DALL·E Atome (image generation):

Tracked properties may include:
 • Prompt text
 • Seed
 • Style parameters
 • Resolution
 • Variations

What history enables
 • Modify an old prompt and regenerate all later variations
 • Re‑apply a previous generated image as a new starting point
 • Compare alternative creative branches
 • Share only prompt history without image rights

This makes generative content fully reproducible and editable over time.

⸻

Key guarantees
 • History is immutable
 • Branches never overwrite each other
 • Past, present, and future coexist
 • Deterministic replay ensures consistency across devices
 • Offline and online histories reconcile automatically

⸻

Short summary
 • Every property has its own timeline
 • You can either copy a past state into the present
 • Or edit the past and replay history forward
 • Nothing is lost, everything is traceable
 • This enables true time‑travel, branching, and causal editing for objects, including generative ones

This is the foundation of Atome’s temporal and creative power.

⸻

Snapshot format (v1)

Snapshots are optional caches used to restore a project quickly. They are
derived from canonical Atome data and do not replace ADOLE history.

```jsonc
{
  "snapshot_id": "uuid",
  "project_id": "uuid",
  "created_at": "iso",
  "created_by": "user_id",
  "validation": {
    "id": "uuid",
    "status": "validated",
    "reason": "manual|auto",
    "created_at": "iso"
  },
  "history_pointer": {
    "at": "iso",
    "last_event_id": "uuid"
  },
  "hash": "sha256",
  "state": {
    "atomes": [
      {
        "id": "uuid",
        "type": "shape.rect",
        "kind": "shape",
        "renderer": "dom",
        "parent_id": "uuid?",
        "meta": { "name": "Box", "tags": ["draft"] },
        "properties": { "layout": { "size": [100, 80] } }
      }
    ]
  }
}
```

Rules:
 • Snapshots are immutable once created.
 • Validation points always include a snapshot payload.
 • Restore can use the snapshot for speed, then verify with history_pointer.

⸻

MCP event schema (history + snapshots)

All history/snapshot actions must be exposed to AI through MCP and routed
through the same Command Bus validation.

Generic MCP envelope:

```jsonc
{
  "tool": "atome.history.get",
  "params": { ... },
  "meta": { "trace_id": "uuid", "actor_id": "user_id", "source": "ai" }
}
```

Supported MCP tools (v1):
 • `atome.history.get` { id, key?, branch?, limit? }
 • `atome.history.restore` { id, key, at?, version_index?, mode: "copy|replay" }
 • `atome.snapshot.create` { project_id, reason?, validation?: { status, reason } }
 • `atome.snapshot.list` { project_id, limit?, offset? }
 • `atome.snapshot.get` { snapshot_id }
 • `atome.snapshot.restore` { snapshot_id, mode: "fast|verify" }
