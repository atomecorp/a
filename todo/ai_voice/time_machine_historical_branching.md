# Time Machine historical branching

Status: Actif

## Product decision

Time Machine must support editing a historical state on a persistent branch and deterministically recomputing the branch forward.

This requirement extends the already implemented capabilities:

- append-only event replay;
- historical-state preview;
- restoration of a past state as new present events;
- deterministic replay checks;
- transaction-aware undo and redo.

Historical branching must never rewrite, delete, or silently replace the original event timeline.

## Task 1 — Define and validate the branch model

The model must be decided with the product owner before implementation begins.

It must define:

- stable branch identity and ownership;
- parent timeline or parent branch;
- exact divergence event and state boundary;
- immutable relationship to original events;
- branch-local event ordering and transaction identifiers;
- deterministic treatment of events after the divergence point;
- behavior for non-deterministic or external side effects;
- conflict detection and resolution;
- merge, rebase-like recomputation, abandonment, and archival semantics;
- permissions, sharing, offline behavior, and synchronization;
- snapshot use and projection rebuilding;
- branch selection and presentation in Time Machine;
- API, script, MCP, AI, and UI access;
- audit evidence and recovery after interruption.

### Exit criteria

- A versioned branch schema and lifecycle are documented.
- Every operation has explicit inputs, outputs, permissions, history effects, and typed failure modes.
- Original-history immutability is guaranteed.
- Merge and conflict semantics are deterministic.
- Fastify, Tauri, offline, sync, sharing, MCP, and UI implications are resolved.
- The product owner explicitly validates the model.

## Task 2 — Implement historical editing and deterministic branch replay

This task may begin only after Task 1 is complete and validated.

Implementation must:

- create and persist branches through the canonical append-only model;
- edit branch history without mutating original events;
- recompute forward branch state deterministically;
- expose branch creation, reading, editing, comparison, merge, abandonment, and archival through the canonical `/ws/api` transport;
- project the selected branch without introducing a parallel state authority;
- integrate permissions, sharing, synchronization, offline queues, snapshots, undo/redo, MCP, AI, and Time Machine UI;
- reject unsupported external or non-deterministic effects explicitly.

### Exit criteria

- Original and branch histories remain independently traceable and reproducible.
- Reload and cross-runtime synchronization reconstruct the same selected branch state.
- Conflicts and non-deterministic events produce explicit, testable outcomes.
- Merge never rewrites existing history and produces new auditable events.
- UI, API, MCP, and AI use the same branch contract and permissions.

## Required validation

- Pure schema, lifecycle, ordering, conflict, and merge tests.
- Database replay and projection tests.
- `/ws/api` Fastify and Tauri integration tests.
- Offline/reconnect and multi-client synchronization tests.
- Permission and sharing tests.
- Snapshot, undo/redo, reload, MCP, and AI parity tests.
- Real Time Machine interaction validation on the shared Bevy UI path.
- Permanent guardrails against original-event mutation or a parallel branch state store.
