# iOS restoration hidden by identity projection and lost outbound sends

Observed: after reinstall, the Dashboard displays the existing red `eve.dashboard.load_failed` notice and received cloud objects do not appear for the local account. These are distinct confirmed defects; the exact failing category in the original screenshot is still **To verify**.

## Confirmed owners and repair

- `AiSRuntimeAuth.bindRemoteIdentity` creates a separate local identity and records the remote/local binding in `auth_local_grants`. The former `LocalHTTPServer.persistRemoteSyncEnvelope` ignored it and `vault_principal_id`; local state reads filter by local owner. A synthetic database executing actual owners reproduced an own project visible under the cloud owner and absent under its verified local owner, and incorrect ownership for foreign-vault data. `AiSRuntimeSync` now verifies the binding, localizes only own-account projection and preserves foreign ownership and immutable event intent. Legacy cursor projection versions request replay for reconstruction. Older particle writes/deletions and losing lifecycle events do not overwrite newer local state.
- The native `sync_queue` existed without an enqueue/retry consumer. `FastifySyncClient.pushLocked` sent once, consumed the initial welcome instead of waiting for the correlated reply, and discarded transport failure. The existing commit owner now atomically persists an outbox row; FastifySyncOutbox serializes bounded delivery, waits for the exact event-ID/stream receipt, and retains failed rows with backoff. Retries/backfill preserve event IDs for server deduplication and are isolated by the configured local principal.
- Dashboard adapters formerly let one generic source failure abort independent categories; hydration retained stale errors after recovery. Category-scoped failures now recover independently. A native durable-projection invalidation triggers the existing coalesced canonical reload, without a second business-state writer or render path.

Rejected hypothesis: Calendar without a business project cannot by itself explain this screenshot; `dashboard_open_state` already excludes it in that context. The device's targeted aggregate write probe recorded inbound events, which proves reception of some data, not completeness of account backup or recovery. Private database extraction was rejected and no alternate extraction was performed.

## Regression and acceptance

The Swift journal/state/sync owners and their probes were retired on 6 Nov. 2026 (`7289b9f25`); the Rust local server's tests now hold the restoration contract:

- `cargo test -p atome-server --lib local::local_atome_sync_restart_tests` (a replay cut before it settles resumes from its durable cursor after a restart; a duplicate delivery is not applied twice; lifecycle tombstones stay out of listings).
- `cargo test -p atome-server --lib local::local_atome_ws_sync_replay_tests` (bounded batches, acks only once durable, a reconnection with nothing new applies nothing).
- `cargo test -p atome-server --lib local::local_atome_isolation_tests` (own/foreign ownership, principal-bound pending delivery).
- `cargo test -p atome-server --lib local::local_atome_remote_projection::tests` (own profile alias, a child before its parent, remote deletion, shared vault owner).
- `cargo test -p atome-server --lib local::local_atome_sync_worker::tests` (retry isolation per principal, interrupted delivery requeued, outbound identity normalized). The registered `tests/eve/dashboard_sync_recovery.test.mjs` exercises independent-source failure/recovery and durable invalidation alongside existing adapter/project-change suites; SyncEngine tests verify the WS notification contains no business state.

Required physical acceptance: build/install an update retaining the app/group data; launch the real Dashboard, allow authenticated replay, observe the red notice and restored categories, reopen Dashboard using native gestures, test a local edit through disconnection/reconnection, and collect pixels plus native console. Do not uninstall or extract the private database to simulate this. A passing synthetic test or install is not proof of full recovery of pre-uninstall data. Deployment and physical evidence are recorded in `eVe/documentations/FRAMEWORK_STATE.md`.
