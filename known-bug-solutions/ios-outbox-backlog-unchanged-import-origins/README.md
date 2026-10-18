# iOS: hundreds of thousands of pending deliveries, slow listings, daily disk-write reports

## Symptom

On the iPhone the native sync status reports `pending_delivery_count` around
300 000 and keeps growing; state listings take seconds; `adole.db` is busy
almost all the time (which made the `0xDEAD10CC` kills of
[ios-app-restarts-after-switching-apps](../ios-app-restarts-after-switching-apps/README.md)
frequent); iOS files `atome.diskwrites_resource` reports every day. The other
devices of the account (iPad, Mac) write several MB/s while they replay what
the iPhone delivered.

## Measured signature (2026-10-17, iPhone 17 Pro database copy + iPad)

- `sync_queue`: 283 526 `pending` (all `attempts = 0`), 151 `rejected`,
  256 566 `synced`. Delivery was not stalled: it runs in creation order and was
  still working through the 2026-10-14 02:31 burst.
- 276 609 of the pending rows are `set` events whose props are only
  `{"type":"import_origin"}`; one origin had `state_current.version` 553.
- Outbox reads decoded the JSON of the whole ledger: pending count 965 ms,
  legacy repair scan 1.7 s, at every drain (each batch of 50 and every 20 s
  heartbeat); `get-pending` serialized every pending row to the page, polled
  by the Dashboard every 2 s.
- Listing: page choice sorted all of `state_current` (245 ms on the Mac copy);
  293 of the 300 most recent rows were churned origins.
- iPad (same account): 5.94 MB/s logical writes, 25 952 inbound envelopes in
  869 s at ~200 KB written each (~100 KB at `COMMIT`); the per-envelope
  `particles_versions` lookup cost 70 s of that time (no index). After the
  index: 48.8 envelopes/s instead of 29.9, same bytes per envelope.

## Root cause

`canonical_import.js` compared each origin with the stored one as whole
objects. The iOS read projection (`serializeStateCurrentRow`) adds `type` to
`properties`; the rebuilt origin has no `type`, so every origin looked changed
and every import pass (each return to the foreground, `online`, timer)
rewrote all 18 350 origins. The native `withoutUnchangedProperties` dropped
the unchanged keys but keeps identity keys (`type`), so each rewrite still
appended an event, rewrote the `state_current` blob and queued a delivery.
Verified on 200 real iPad origins: all carry `type`; the old comparison says
200 changed, the per-key comparison 0.

## Fix

- `atome/src/squirrel/shared/import_reconciliation.js#importPatchChanges`: a
  `set` changes something only when one of its own keys differs from the
  stored record; used for origins (against the record stored under that id)
  and for `replace`.
- `Common/AiSRuntimeOutbox.swift` (outbox storage moved out of
  `AiSRuntimeSync.swift`): partial index `idx_sync_queue_undelivered` serves
  every outbox read; a new `unchanged` status for a `set` whose patch is only
  the Atome's type, with no deletion, version check or move, after a
  `create`/`set` of the same type (the event history is kept, nothing is
  delivered, nothing is replayed on the other devices); rows queued before
  are classified in 2 000-row chunks per outbox read; the legacy send-once
  repair walks the event log in chunks once per connection instead of fully
  at every read; `get-pending` returns the count and the 100 oldest rows.
- `Common/AiSRuntimeSchema.swift` (schema moved out of `LocalHTTPServer.swift`):
  `idx_state_current_updated` for listings by recency and
  `idx_particles_versions_atome` (same as `database/schema.sql`).

## Follow-up fix (same day): no-op writes are not created at all

The iPad copy showed other daily sources of the same churn, all from the
devices' local commits: `set` events carrying only `kind`/`type` already
stored (Mac: tools, activities, contacts, calendar events, projects, users,
2 000–3 000 a day), empty profile sets at every session renewal, and runtime
tools whose registry record flipped twice per boot (prompter: `label_key`
`prompter_transport` ↔ `eve.tool.prompter.transport.label`).

- Tauri `local_atome_history.rs#capture_before` and iOS
  `AiSRuntimeEvents.swift#withoutUnchangedProperties`: identity keys equal to
  the stored identity are unchanged, and a `set` of an existing Atome left with
  no property, deletion, expected version or envelope move is not an event
  (nothing written, projected, queued or replayed). Fastify keeps writing what
  it receives: device receipts must name every delivered event.
- `eVe/intuition/runtime/tool_persistence.js#normalizeToolRecordFromAtome`
  reads a stored tool's `tool_key` and `label_key` back, so a tool rebuilt from
  its record equals its code registration (`repairToolIdentity` no longer runs).
- `eVe/intuition/tools/activities.js#ensureDefaultActivities` creates the
  default activities only when the listing's primary backend answered (its
  first listing at boot answers `Access denied`, before the session check),
  and `activities_duplicates.js` merges the copies already created (1 147 → 6
  on one account, 2026-10-18).
- Inbound envelopes are persisted in runs (`AiSRuntime.persistRemoteSyncEnvelopes`,
  `Common/FastifySyncInbound.swift`): one transaction per run of up to 64, one
  savepoint per envelope, acks after the COMMIT. Fastify's `acked` and `pong`
  answers do not close a run (closing on `acked` left runs of ~6 on the iPad).
  Logical writes per envelope with the real owners on a Mac: 166 KB alone,
  101 KB in runs of 6, 65 KB in runs of 64; the journal mode does not matter.
- A transient storage failure (`SQLITE_BUSY`, ...) inside an inbound envelope
  was rejected for good: the code was read after `appendEvent`'s rollback had
  reset it. `AiSError.sqliteCode` keeps the failing statement's code.

## Rejected hypotheses

- Rows that can never be delivered: none among the pending ones (0 attempts,
  0 errors); the 151 `rejected` rows are terminal refusals from 2026-10-13.
- Re-enqueued legacy events: the 679 unqueued events of the copy are all from
  its last second (the copy is truncated, see below), not a repair loop.
- Deleting the no-op rows or events: history is immutable; classification
  keeps both.
- WAL for `adole.db`: an idle WAL connection keeps shared locks on the
  database file and on the `-shm` (checked with `F_GETLK`); the single handle
  stays open, so every suspension would hold a lock in the App Group container
  (0xDEAD10CC). The rollback journal stays.

## Pitfalls

- `devicectl device copy from` stops at the size it displays (rounded to three
  significant digits: 2 060 000 000 bytes for a 2 063 564 800-byte database);
  pad the copy to the header size and use `sqlite3 .recover`; directory copies
  fail.
- `Atome.listStateCurrent(projectId, options)`: `listStateCurrent({limit: 300})`
  lists 1 000 rows.

## Regression checks

- `npx vitest run tests/eve/canonical_contact_import.test.mjs` (an unchanged
  pass with the iOS read projection writes nothing).
- `node tests/probes/ios_sync_recovery.probe.mjs` (compiles the real Swift
  outbox: unchanged set classified at enqueue and from the backlog, type change
  and first event delivered, count and `get-pending` agree).
- `node tests/probes/ios_sync_batch_subscribe.probe.mjs` (replay persisted in
  runs despite interleaved `acked`/`pong`, every ack already durable) and
  `ios_sync_recovery` (busy/interrupt inside a run keep nothing and are thrown).
- Device: Web Inspector probes in `temp/ios_outbox_2026-10-17/`
  (`measure.js`, `premise.js`, `versions.js`); `atome_disk_write_probe.txt`
  in the App Group Documents (Debug builds).
