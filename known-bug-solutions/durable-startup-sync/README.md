# Home startup and durable sync recovery

Scope: iOS SQLite/native delivery, Android/Tauri native delivery, canonical API
WebSockets, browser workspace persistence and the existing eVe home projections.
This is a reliability repair of these paths, not a general security audit.

## Confirmed causes

- iOS had two declarations of `remote_sync_stream_cursors`. A new database was
  created without `projection_version`, then classified as legacy by the sync
  migration. A legacy projection requested cursor zero until a whole replay
  completed, even after a previous process had committed its first events.
- An API socket could remain OPEN without answering after suspension. Request
  timeouts did not test or replace it. Retrying business commands would risk
  duplicate writes and is not the repair.
- Native Tauri subscribed per stream and did not reset its reconnect counter
  after useful work. Existing batch receipts omitted already-current streams.
- Startup depended on work-project and profile/onboarding recovery. An empty
  authenticated list could initiate project creation. Restored authorization
  must admit home without waiting for those optional reads.

- Browser recovery did not invalidate the five-minute negative object cache, and
  realtime notifications could update presentation without scheduling a durable
  local projection import. Optional remote profile repair also held local reads
  open and needed identity/baseline/version checks before committing.
- Server event compaction removed unchanged properties from recorded patches.
  Comparing a retry's original payload with that compacted patch rejected a
  previously saved event as `event_id_conflict` after a lost receipt.

## Canonical repair and reuse audit

| Need | Verified owner and access | Availability / extension |
| --- | --- | --- |
| SQLite checkpoint | `AiSRuntimeSync.ensureSyncSchema`, `persistRemoteSyncEnvelope`, `remoteSyncCursors` | Available and compatible. One schema owner; transactional `repair_sequence`; server-confirmed completion. |
| Native delivery | `FastifySyncClient`, `local_atome_ws_sync` | Available and compatible. Correlated batches, bounded ping/pong probes, coalesced projection invalidation and account/environment progress. |
| Protocol settlement | `server/wsSyncRuntime.js` | Existing but unsuitable for empty/current streams. Optional `subscription_id` and `settled_streams`, negotiated by `subscribe-batch-settlement`; old messages preserved. |
| Socket recovery | `TauriWebSocket`, `SyncEngine` | Existing but unsuitable for silent OPEN sockets. Shared `websocket_health` behavior; no business-command replay. |
| Local authorization | native SQLite grant + enrolled keystore scope | Available and compatible. Optional WebView cache reads are bounded; cache state never grants rights. |
| Home without a technical project | existing Basic/Mystic Matrix and Pro Dashboard factories | Existing but unsuitable for missing project roots. Same Matrix registry/factories accept an internal workspace-home assembly and lazily bind saved controls through `Atome.listStateCurrent`. |
| Browser projection | `browser_workspace.synchronizeBrowserWorkspace`, `atome_commit_backend` negative cache | Available and compatible. Coalesced realtime invalidation reuses canonical imports/outbox; arrival invalidates misses and account/environment changes isolate the cache. |
| Principal/contact/calendar | `profile_api`, `createLocalContactsSource`, `CalendarAPI`, `createCanonicalImport` | Available and compatible. Global Atome commits, existing durable outbox; native principal binding and conflict protection retained. |
| Delivery identity after compaction | `createAdoleEventMutationApi`, `assertIdempotentEventReplay`, `appendEvent/appendEvents` | Existing but unsuitable. Server-owned SHA-256 of normalized original intent, with no duplicate large payload; legacy omitted no-op values require the immutable stored projection as evidence. Altered actor, transaction and values remain conflicts. |
| New project | registered `ui.new_project` and `Atome.commit` | Available and compatible; no replacement creation path or persistence. |
| Status | existing sync API, notices, Bevy text/Matrix notice and i18n | Existing but unsuitable for restoration state. `AdoleAPI.sync.getStatus` is a scoped read of existing owners, with no additional store/transport. |

Reconstruction never deletes events, state, media or pending deliveries. Duplicate
receipts cannot settle another correlated batch. Outbound writes keep their
persistent event IDs. Local authorization survives remote unavailability; remote
expiry and local revocation remain separate. Native sync notices are delivered
only to a still-authenticated local socket for their principal.

Every cold startup chooses home, including old `startup_view: project` values.
Foreground health checks do not invoke startup navigation. Optional categories,
previews and saved-home records hydrate progressively; recovery cannot replace
an opened or newly created project. A metadata settlement does not prove media
bytes are available offline.

## Regression and acceptance

Permanent checks: `tests/probes/ios_sync_restart.probe.mjs` (fresh schema, legacy
repair, process interruption and restart before settlement),
`ios_sync_recovery.probe.mjs`, `ios_sync_delivery.probe.mjs`,
`ios_sync_batch_subscribe.probe.mjs`, `ios_sync_health.probe.mjs`,
`tests/server/ws_sync_runtime.test.mjs`, native `local_atome_ws_sync::tests`,
`tests/eve/websocket_recovery.test.mjs`, `sync_engine.test.mjs`,
`workspace_bootstrap_nonblocking.test.mjs`, `sync_status.test.mjs`,
`browser_workspace.test.mjs`, `auth_device.test.mjs`, and home/boot contracts.

The restart probe also checks saved contact phone arrays, the principal card,
calendar and recurrent appointment/alarm metadata, plus the four exact persistent
outbound IDs in subsequent processes. Browser tests exercise real contact and
calendar CRUD through Atome.commit and IndexedDB, then delivery of those IDs.
Personal-contact reconciliation tests retain manual fields and reject concurrent
version changes. `tests/server/durable_event_retry.test.mjs` covers compaction,
restart, duplicate batches, forged incoming fingerprints and existing journals.

Cleanup removes the duplicate iOS schema, old automatic startup/project routes,
unreferenced pending-onboarding helper and eager Home vault dependency. The
lightweight `bevy_panel_home_secret_save` adapter uses the existing secret-save
owner; vault operations remain lazy. New tests are explicitly retained by the
Git ignore rules and Vitest manifest; no Git staging or commit is performed.

An old mixed-identity QA workspace contained catalogue writes genuinely refused
by the server (`property_write_denied`, objects owned by another QA principal).
Those rows are retained and reported, never accepted by relaxing rights. The
single-account acceptance fixture reaches zero pending/refused deliveries.

See the dated FRAMEWORK_STATE task record for actual pass/failure evidence and
platform acceptance limits. Build success and source inspection alone are not
physical-device acceptance. Never reset an installation, discard its history,
copy a private database, or alter credentials to reproduce this issue.
