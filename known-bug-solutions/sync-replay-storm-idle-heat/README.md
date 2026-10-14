# Idle heat on the Dashboard: the sync replay storm

## Symptom

The iPhone heats up with the Dashboard on screen and nothing moving: wallpaper
frozen, Bevy at rest, wake phrase off. The heat stays as long as the app is in
the foreground.

## Measured signature (2026-10-13, iPhone 17 Pro, Debug build, WebView inspector)

60 s of idle Dashboard (`temp/dashboard_heat_2026-10-13/ios_instrument.js`):

- Bevy 0.22 ticks/s, wallpaper paused, no microphone read: rendering is not the
  cause (see [idle-render-loop-heat](../idle-render-loop-heat/README.md)).
- The JavaScript `SyncEngine` was connected to `wss://atome.one/ws/sync` with
  **9 831 streams**: 588 `subscribe`/s sent, 86 `replay-complete`/s received.
  atome.one closed the socket with `4401 sync_processing_failed` every 3–40 s,
  the engine reconnected after 1 s and subscribed every stream again.
- The native `FastifySyncClient` (same account, same server) forwarded
  **85.6 `sync:projection-ready`/s** over the local WebSocket. The Dashboard
  invalidates and reloads every category on each one: 7.5 `state-current/get`/s,
  3.1 `state-current/list`/s, a `directory/list` every 5.5 s, each preceded by
  `configure-remote` and two `auth/me`.
- Debug statement probe (`atome_disk_write_probe.txt`, 180 s after launch):
  7 206 `UPDATE remote_sync_stream_cursors SET projection_version = 1`,
  7 316 `state-current/get` of import origins.

## Confirmed causes

1. **One sync stream per global atome.** `database/adole.js#eventScopeKey`
   scopes an event without project to `atome:<id>`; every contact, calendar
   event and import origin is its own stream. Each connection subscribes and
   replays all of them, one message each.
2. **The JavaScript engine rewrote its whole scope per message**
   (`sync_engine.js#persistCursor`): two localStorage JSON documents (~550 KB)
   parsed, serialized and written for every `replay-complete`, even unchanged.
   Real engine, 9 831 streams, reconnection with nothing new: 19 664 writes,
   2.9 GB of JSON, 49 s of CPU (Mac, Node).
3. **The native client announced every replay**, including the thousands that
   applied no event, and the Dashboard reloads on each announcement.
4. **atome.one closes the connection on any processing exception**
   (`wsSyncRuntime.js`, tested contract) without logging it, so the cause of
   `sync_processing_failed` is invisible and every failure restarts the full
   subscription.

## Corrections (2026-10-13)

- `sync_engine.js`: a cursor is written only when it advances, and the scope is
  written once per burst (250 ms), on `pagehide`, and before a reconnection reads
  it back. Same storm: 2 writes, 0.3 MB, 15 ms.
- `FastifySyncClient.swift`: `sync:projection-ready` after a replay only when
  that replay applied at least one event; `completeRemoteReplay` writes only a
  stream still at `projection_version = 0`.
- `wsSyncRuntime.js` + `server.js`: the swallowed exception is logged
  (`ws/sync`, `sync_processing_failed`, principal, error) — needs a deployment.
- `WebViewManagerIPC.swift`: `audio_wake_read` (every 80 ms during wake-phrase
  standby) no longer prints three console lines per call.

## Batch subscription (2026-10-13, authorized protocol extension)

- `/ws/sync` `subscribe` accepts `streams: [{ stream, cursor }]` (≤500) when
  `welcome.capabilities` lists `subscribe-batch`. `wsSyncRuntime.js#subscribeBatch`
  reads access and heads through `userVaultRouter.authorizedStreamHeads` (one
  registry read, one share read, one vault `stream:heads` per owning vault),
  replays only streams behind their head and answers one
  `replay-complete { streams }`. The single-stream form is unchanged.
- `SyncEngine` and `FastifySyncClient.swift` send batches, and reset their
  backoff only once every subscription is answered (both reset it on socket
  open before, so a close after authentication retried every second).
- The iOS client announces one `sync:projection-ready { streams }` per batch
  that applied events; `completeRemoteReplay` marks a batch in one savepoint.

## Not corrected

- Stream granularity (one stream per global atome): history is immutable, the
  existing streams stay; with batches their count no longer drives the cost.
- The Tauri Rust inbound worker (`local_atome_ws_sync.rs`) still subscribes per
  stream, and its backoff never resets (a session always ends in an error).
- Two cloud sync clients on iOS/Tauri (`SyncEngine` for realtime UI events,
  native client for persistence), documented in `maps/ARCHITECTURE_MAP.md`.
- The reason atome.one raises `sync_processing_failed` (read the new log after
  deploying).

## Follow-up (2026-10-13 evening): scope erased by an early commit

After the first fix, the device showed the engine's stored scope reduced to
`directory.public` and 0 cursors. Pre-existing cause (HEAD reproduces it,
`temp/dashboard_heat_2026-10-13/scope_wipe.probe.mjs`): the engine loads its
scope at construction, before the account is known, and every local commit calls
`observeEvents` (`eVe/core/atome_commit_effects.js`), which wrote that
anonymous in-memory scope under the signed-in account's key. With the engine
not yet connected, an import's commits erased 9 831 streams and their cursors
(no data loss: the next connection replays from 0). Now the scope is written only
under the key it was loaded from, `observeEvents` reloads the scope when the
account changed, and persists only when a stream is new.

Device after the fixes (60 s idle Dashboard): Bevy 0.23 ticks/s, wallpaper
paused, no `/ws/sync` frame, no `sync:projection-ready`, localStorage
0.68 writes/s (51 B/s, observed commits — now gated). The JavaScript engine was
not connected during that window (no remote token when it installed), so the
reconnection loop itself was not exercised on the device.

## Rejected hypotheses

- Render loop, wallpaper video, wake-phrase inference: measured idle (0.22 Bevy
  ticks/s, video paused, wake standby disarmed).
- Missing `events(stream_id, sequence)` index on the vault: present, the replay
  query uses it.

## Regression checks

- `npx vitest run tests/eve/sync_engine.test.mjs` (burst persistence test).
- `node --test tests/server/ws_sync_runtime.test.mjs`.
- `node temp/dashboard_heat_2026-10-13/sync_engine_storm.probe.mjs [srcRoot]`.
- `node --test tests/server/ws_sync_stream_heads.test.mjs` (real vault workers).
- `node --test tests/probes/ios_sync_batch_subscribe.probe.mjs` (compiled native client).
- `node temp/ws_sync_batch_2026-10-13/reconnect_cost.probe.mjs [N]`: real
  engine, runtime, router and vault over a WebSocket, per-stream vs batch.
- Device: `rwi.mjs ios_instrument.js` then `__heat.report()` after 60 s on the
  Dashboard: count `sync:projection-ready`/s and `storage` writes.
