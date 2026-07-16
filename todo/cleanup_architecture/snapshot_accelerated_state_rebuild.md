# Snapshot-accelerated `state_current` rebuild

Status: Actif

## Product decision

`state_current` must be reconstructible from a trusted snapshot followed by deterministic replay of only the events that occurred after that snapshot.

The current full-event rebuild remains the safe reference behavior until the accelerated path is completely implemented and verified.

No event compaction, archival removal, or retention-based deletion may begin before snapshot-based reconstruction has passed all integrity, parity, recovery, and replay validations.

## Required model

Every reconstruction snapshot must carry or resolve:

- an immutable snapshot identifier;
- its project and scope;
- a deterministic event cursor or ordered event boundary;
- the schema and projection version used to create it;
- an integrity digest for the state blob and cursor metadata;
- creation actor and timestamp;
- compatibility and migration information;
- an explicit trust/validation state.

The event boundary must not depend on timestamps alone. It must remain deterministic when events share timestamps, arrive after offline operation, or synchronize between runtimes.

## Executable scope

1. Define a stable ordered event cursor shared by SQLite and PostgreSQL.
2. Store the cursor and integrity metadata with state snapshots.
3. Validate snapshot scope, schema version, digest, permissions, and cursor continuity before use.
4. Rebuild a temporary projection from the snapshot plus subsequent events.
5. Compare accelerated reconstruction against a full replay before replacing `state_current`.
6. Fall back with an explicit typed integrity result to full replay when a snapshot is absent, incompatible, incomplete, or corrupt.
7. Expose reconstruction diagnostics through the canonical `/ws/api` administration/runtime boundary where required.
8. Define archival and compaction eligibility, but do not delete or make historical events unavailable during this task.
9. Update persistence, database, Time Machine, API, architecture, synchronization, and operational documentation.
10. Install a guardrail preventing event retention or archival deletion without a validated restorable snapshot boundary.

## Exit criteria

- Full replay and snapshot-plus-tail replay produce byte-equivalent normalized projections for the same event boundary.
- Cursor ordering is deterministic across Fastify/PostgreSQL and Tauri/SQLite.
- Offline, delayed, duplicated, and synchronized events cannot be skipped by the snapshot cursor.
- Corrupt or incompatible snapshots never replace a valid projection.
- Recovery after interruption is atomic and restart-safe.
- Property history and the immutable event timeline remain queryable.
- No archival/deletion policy is activated until a separate, explicitly validated retention task authorizes it.

## Required validation

- Pure cursor ordering and integrity tests.
- Database full-replay versus snapshot-tail equivalence tests.
- SQLite/PostgreSQL parity tests.
- Offline/reconnect, late-event, duplicate-event, and sync-conflict tests.
- Corrupt snapshot, incompatible schema, missing cursor, and interrupted-rebuild tests.
- `/ws/api` integration tests after the WebSocket-only migration.
- Performance measurements demonstrating the acceleration without weakening correctness.
- Permanent guardrails against unsafe event deletion or timestamp-only cursors.
