# iOS: switching to another app restarts atome from the beginning

## Symptom

On the iPhone, going to another app and coming back shows the launch screen
again: the app boots from scratch and the user is back on the home, not in the
project they were working in.

## Root cause (2026-10-17)

The app is not "relaunched": it is killed while suspended. Every crash report
is `EXC_CRASH / SIGKILL`, `termination.namespace RUNNINGBOARD`, `code
0xdead10cc` (read `termination.code` in the `.ips`). iOS kills a suspended app
that holds a lock on a file of a shared App Group container, and `adole.db`
(`AiSRuntime`, `ais.runtime.queue`) lives in `group.atome.one` for the AUv3.
The faulting thread is always inside `sqlite3_step`, usually through the native
sync (`FastifySyncClient.drainOutbox` → `pendingRemoteSync`,
`remoteSyncCursors`, `remoteSyncPendingCount`) or a page request
(`handleSyncMessage`). It is not memory: no JetsamEvent names atome.

Reproduction: launch, wait about 2 minutes, open Safari; the app dies about 5 s
later. Reports: `xcrun devicectl device info files --device <UDID>
--domain-type systemCrashLogs`, then `device copy from --source <file>`.

## Fix

- `Common/AiSRuntimeDatabase.swift`: every unit of database work opens the
  handle through `openDatabase`, which, in the background, takes a system
  activity assertion held until `AiSRuntime.queue` drains. `coverQueuedWork`
  covers the work already queued when the app leaves the foreground. On
  expiration `interruptActiveWork` (`sqlite3_interrupt`) stops the statement,
  which releases its lock. Without background time left, work fails with
  `ais_background_time_exhausted`.
- `application/AppBackgroundLifecycle.swift`: the app's single lifecycle owner.
  It provides the assertion (`beginBackgroundTask`), disconnects
  `FastifySyncClient` when the app enters the background (events stay in the
  durable outbox) and, on every activation, reopens the local listener,
  reconnects the sync and resumes communication.
- Restoration (when iOS still terminates the app or its web content):
  `application/AppWorkspaceResume.swift` keeps the presented project in the
  scene's `@SceneStorage` (discarded when the user closes the app from the
  switcher), `eVe/domains/dashboard/workspace_scene_restoration.js` publishes it
  and reopens it through `ui.project.open` after the boot presented the home.
  A WebContent death after presentation reloads the page
  (`WebViewManager.presentedPageTerminationHandler`), at most once per 120 s.

## Pitfalls

- Never move `adole.db` out of the App Group to avoid the kill: the AUv3 reads
  the same database.
- Do not reload a page that died before its presentation: that restores the
  boot crash loop of [ios-webcontent-boot](../ios-webcontent-boot/README.md).
- A device used by someone during a probe closes and relaunches the app on its
  own: record the pid before and after each step.

Validated 2026-10-17 on the iPhone 17 Pro (background cycles, kill and
restore, WebContent death) and the iPad Pro M5 (same, plus the 120 s guard: a
second death after an automatic reload leaves the failure surface).

The other half of the kills was how busy the database stayed: see
[ios-outbox-backlog-unchanged-import-origins](../ios-outbox-backlog-unchanged-import-origins/README.md).

## Regression check

Probes in `temp/ios_multitask_2026-10-17/` (Web Inspector launch flag
`-AtomeWebInspector`, `temp/idle_heat_2026-10-09/rwi.mjs`):
`scenario_background.sh` (mark, Safari, wait, return: same marker, same
project, no new `atome-*.ips`), `scenario_kill.sh` (SIGKILL while backgrounded:
the relaunch reopens the project; on the Dashboard it stays there), `oom.js`
(foreground WebContent death: same app pid, project reopened; on an iPad,
typed arrays fail at once, use `oom_heap.js`).
