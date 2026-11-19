# Ghost atomes in a project (a selection frame around nothing); video takes that disappear

## Symptom

A project's background selected, then « select all »: dashed frames appear around
nothing. The objects can be selected and moved, but they draw nothing and have no type.
Often a video capture taken on the iPhone or iPad is missing at the same time, sometimes
its frame is the ghost. Deleting a duplicate of a video also takes the original's video.

## Cause

Three faults, found together:

1. **A partial `set` created an atome.** A move, a colour or an order aimed at an id the
   store did not hold (a stale selection, a creation still waiting in the device's queue)
   was upserted as a new atome holding only that fragment (`{ left, top }`): no type, no
   kind, no media. This happened in the three commit owners: the cloud engine
   (`database/adole_event_log.js#appendEvent`), the native store (`atome-store`
   `append.rs`, used by the local Axum/iOS server) and the browser workspace
   (`guest_workspace_store.js#commitWorkspaceEvents`).
2. **The creation was dropped for good.** The local sync worker
   (`local_atome_sync_worker.rs`) marked an outbox row `failed` (never retried) when the
   take's file could not be read yet (`media_read_failed`: the recorder still writing,
   the file moved by the iCloud copy). The moves after it still went out, so the server
   held them as a ghost and never received the take itself.
3. **A shared file was deleted with one of its atomes.** A duplicate keeps the original's
   `file_path`/`file_name` (`tool_runtime_atome_duplicate.js`); deleting either one removed
   the bytes (`local_atome_media_removal.rs#remove_deleted_media`, and the browser's
   `dropDeletedFiles`).

## Fix

- `atome/src/shared/atome_type_gate.js#assertSetTargetDeclared` (code
  `atome_set_target_missing`, also in `eVe/registry/generated/atome_types.json` and
  `atome-store/src/type_gate.rs#assert_set_target_declared`): a `set` into a project on an
  id held nowhere is refused unless it declares a type or a kind. Account-global and
  project-less records keep their own rules. Called by the three commit owners.
- Sync worker: `media_read_failed` is transient (retried with backoff); after
  `TARGET_WAIT_ATTEMPTS` (21) attempts, or once the atome is deleted locally, the event
  goes out without its bytes. `requeue_media_read_failures` sends rows failed that way back
  to the queue at start, so queues already stuck on a device are delivered (and the server
  ghost receives its type). `atome_set_target_missing` is permanent only after the same
  number of attempts, so a move waits for its creation.
- Media removal: a file whose name another live atome still holds is kept (native
  `names_held_by_others`, browser `dropDeletedFiles`).
- Undo of a delete: the bytes of a deleted media are no longer erased at once. They move
  to the home's `.deleted/<atome>/` (`atome-server/src/media/trash.rs`, used by the local
  server and the cloud; the browser marks its file `deleted_at`), out of every listing and
  recovery; a `restore` (the undo, `history_command.rs`) puts them back, dated now so the
  iOS file mirror does not erase them again; a purge erases them after 30 days
  (`trash::KEEP`, `FILE_TRASH_KEEP_MS`). The cloud also keeps a file another live atome
  of the vault names (`vault_router#file_held_elsewhere`, vault `files:described`).

- A `set` that changes nothing (every key, its type and parent included, equal to what the
  atome holds) records no event in either engine, only a delivery receipt, so a resent
  partial set can neither recreate nor overwrite anything (R-189, 2026-11-16; details in
  [ios-outbox-backlog-unchanged-import-origins](../ios-outbox-backlog-unchanged-import-origins/README.md)).

## Regression

- `npx vitest run tests/eve/ghost_atome_guard.test.mjs` (cloud engine and browser
  workspace, shared file).
- `cargo test -p atome-store` (`gate_follows_the_generated_types`, commit parity case
  `set_target_missing` in `tests/fixtures/atome_store/commit_cases.*`).
- `cargo test -p atome-store unchanged_receipts` and `node --test tests/server/event_receipts.test.mjs`
  (an unchanged set: no event, a receipt; its resend never overwrites a later change).
- `cargo test -p atome-server --lib` (`a_file_another_live_atome_holds_stays` with its undo,
  `an_unreadable_media_file_is_retried_and_old_failures_go_back_to_the_queue`,
  `media::trash` tests).

## Stored ghosts (production cleanup, 2026-11-14)

On the server a ghost is an atome of type `generic` with no `kind` (the vault projection
gives `generic` to a typeless creation), not a row without type. 13 were found (strict
criteria: live, in an existing project, keys of geometry/timing only, no creation in the
event log; 11 were audio takes `audio_recording_…`) and soft-deleted through the
production `atome-vault` engine (`event:commit-batch` of `delete` events, reason
`ghost_atome_cleanup_2026-11-14`), after a backup in
`/opt/a/database_storage/backups/ghost_cleanup_2026-11-14/` and a trial on copies (only
those 13 rows changed). Kept on purpose: `generic` records holding content (a text, a
preview, the project matrix slots) or naming a project absent from their vault.

## Acceptance

Record a video take on the iPhone and move it at once, offline then online: the take
appears on the other devices with its video, and « select all » on the project's
background shows no frame around nothing.
