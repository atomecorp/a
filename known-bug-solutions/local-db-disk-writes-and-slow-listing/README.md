# Local database: hundreds of GB written, slow launch, empty calendars

## Symptom

iOS reports a `diskwrites_resource` (274.88 GB written in 2.5 h, 30 MB/s) and
the app opens slowly on first launch. `adole.db` grows to several GB. Calendars
stop appearing after a contacts import. The same SQL exists on Tauri (Mac) and
Fastify (Web/server).

## Measured signature (2026-10-08, iPhone, Debug probe on every SQLite statement)

- 18 min session: 215 GB of logical writes, 199 MB/s; 99 % from
  `state-current/list atome_type=import_origin limit=100 offset≤22100`
  (3 798 calls, 56 MB average, 149 MB max per call).
- After that fix: 0.21 MB/s. Next bottleneck: `state-current/list
  atome_type=calendar_event`, 501 calls = 58 s of server time in 3 min
  (~116 ms per 100-row page, 7 400+ events).
- Database content: `events` 2.2 GB + `particles_versions` 2.2 GB of history;
  the user profile alone 1.39 GB of events (photo embedded twice in every
  profile save, ~1 MB per preference change such as a zoom).

## Confirmed causes and corrections

1. **Typed page sort spilled whole rows to disk.** `ORDER BY updated_at LIMIT
   OFFSET` (Fastify also `SELECT DISTINCT sc.*`) kept OFFSET + LIMIT full
   `properties` blobs in a temporary sorter per page. The page is now chosen on
   ids only, then its rows are loaded — iOS `AiSRuntimeStateCurrent.swift`,
   Tauri `local_atome.rs`, Fastify `database/adole.js`. Synthetic 22 300-row
   check: 89 MB written → 0 MB, same page.
2. **Type filter decoded the JSON of the whole table.** Three expression
   indexes (`idx_atomes_type_lower`, `idx_state_current_json_type`,
   `idx_state_current_json_kind`) in `database/schema.sql` (Fastify + Tauri)
   and the Swift schema; the filter is written so each OR term matches one
   index. Page: 93 ms → 25 ms on the synthetic base.
3. **Unchanged values were rewritten.** iOS and Tauri now follow the Fastify
   rule (`adole_event_mutation.js`): a property rewritten identically is
   neither written nor kept in the event. Swift JSON uses sorted keys so equal
   dictionaries compare equal (unsorted keys made every tool definition look
   changed at each launch).
4. **The profile embedded the photo and was project-scoped.** `eve_profile` no
   longer carries `user_face` (read back by `parseProfileParticle`), and the
   profile commit is `scope: 'global'`.
5. **Boot re-saved every tool** with a fresh `updated_at`: `updateTool` returns
   early when the merged record is identical.
6. **Import bookkeeping re-read 22 000 origins by 100-row pages** several times
   per cycle: pages of 1 000.

## Rejected hypotheses

- `listEvents` with `LIMIT`: SQLite uses a bounded top-N sort, no spill
  (measured 0 bytes). Only very large limits on huge atomes spill.
- Missing Contacts permission: the native read returned 2 136 contacts in 1.2 s.

## Regression checks

- `npx vitest run tests/eve/tauri_state_current_recovery.test.mjs`
- `npx vitest run tests/eve/user_profile_events.test.mjs`
- `npx vitest run tests/eve/tool_runtime_native_bootstrap_fast_path.test.mjs`
- `cargo test --features bevy_renderer_core --lib server::local_atome`
  (platforms/desktop-tauri)
- Device: Debug build, `xcrun devicectl device copy from … --domain-type
  appGroupDataContainer --domain-identifier group.atome.one`; compare the
  write rate with a new `diskwrites_resource` report or a statement probe.
