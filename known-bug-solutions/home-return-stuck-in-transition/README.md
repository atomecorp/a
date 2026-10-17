# Return to the home stays grey (stuck in `transition`); project opening takes 10–25 s on Tauri

## Symptom

Mac Tauri app, 2026-10-16: opening a project from the eVe home showed a grey screen for
16–25 s; going back to the home sometimes never finished (grey, `__eveWorkspaceMode.mode`
stuck at `transition`, `targetMode: 'dashboard'`). A later press on the Atom worked.

## Evidence (live WebView relay, `temp/tauri_live/`)

- Every `/ws/api` request took 4–32 s while the home loaded: `state-current list` of 1000
  `calendar_event` = 16 972 ms (3-Atome project list = 23 ms).
- `sync configure-remote` answered after 9–11 s, sent twice per opening; requests on the
  same socket queue behind it (`ws_api.rs` handles one message at a time).
- Stuck return: home instance created but never active (`inspect().active === false`, no
  tree) while the WebView reported « The network connection was lost ».

## Root causes and corrections

1. `local_atome_security.rs#project_properties_for_read`/`project_capabilities_for_read`
   looked the owner up once per key and per capability (~90 lookups per row) under the
   single DB mutex → one owner lookup per Atome.
2. The home's Agenda tile re-read every calendar event at each opening →
   `calendar_api.js#listEvents` shares one account read until a calendar change.
3. `configure-remote` republish checked, per Atome, `sync_queue` without an index on
   `atome_id`; status reads decoded the whole queue's JSON → `idx_sync_queue_atome`,
   `idx_sync_queue_actor` (`database/schema.sql`); concurrent `ensureFastifyToken`
   callers share one configuration in flight.
4. Hang: the home's `open()` re-fetched `/eVe/default_values/constants.json` before becoming
   active, with no bound; an unanswered request left the return in `transition` →
   `dashboard_defaults.js#loadDashboardConstants` reads the app file once per run.

## Regression checks

- `HEADLESS=0 node temp/project_roundtrip/hang_return.probe.mjs` (HANG=constants|all-eve|all):
  red before (30 s, `transition`, home inactive), green after (~0.5 s).
- `temp/dashboard_responsive/calendar_shared_read.probe.mjs` (one calendar read, new
  appointment followed).
- Rust: `owner_reads_every_key_with_every_capability_and_members_stay_filtered`,
  `pending_status_keeps_failed_deliveries_and_errors_bound_to_the_actor` (index plans).
- Tauri live (user data): opening ~3 s (was 22 s), return ~0.5 s, return still completes
  with `constants.json` stalled.

## Open

Requests still 0.3–2.4 s in the debug build (unoptimised bundled SQLite in the dev
profile); Tauri subscribe/ack sync traffic at rest (`local_atome_ws_sync.rs`).
