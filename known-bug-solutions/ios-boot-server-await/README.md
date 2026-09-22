# iOS boot blocked by an unreachable server

## Symptom

An iOS launch could take 10-20 s with the native overlay `Le démarrage
continue…` shown on both the Dashboard and the project, while the same build
opened instantly the rest of the time and the stall appeared more often right
after a modification. The overlay is
`platforms/ios/atome-auv3/Common/ViewController.swift#showBootDelayWarning()`,
armed by `WebViewManagerBoot.swift#BootStallWatchdog`: 20 s without a native or
JavaScript milestone before `navigation_started`, 8 s after it, then one
`[BOOT_SUMMARY] … last_milestone=<name>@<ms>` line plus `[BOOT_DIAGNOSTIC]`
(which carries `window.__eveWorkspaceBootTrace`,
`window.__eveWorkspaceBootOpenError` and `new_menu_v2.measure()`).

## Confirmed root causes

A session resume and every user-facing project open routed the authoritative
cloud read (`api.atomes.list` → WebSocket) into the transaction that had to
finish before readiness was published. Three defects, all in the resume/open
path:

1. `eVe/intuition/tools/user_workspace_surface_runtime.js#showPreparedProject`
   revealed the saved project with `staleFirst: false`, so the balanced route
   awaited `remotePromise` before `project.foreground_load_ready` could be
   published.
2. `eVe/intuition/runtime/tool_genesis_project_load_runtime.js#runProjectLoad`
   raced the local `state-current list` against
   `ATOME_RENDER_FAST_PATH_BUDGET_MS` (90 ms) before the `staleFirst` branch
   was consulted, so a slower local read dropped even a stale-first boot into
   the balanced route. The local read is paginated over the whole vault
   (100 rows per page, up to a 2000-row limit), which is why a project with
   more rows — exactly the state reached after a modification — lost the
   budget more often.
3. `eVe/intuition/matrix/core/project_workspace_activation_runtime.js#activateProjectWorkspace`
   defaulted to `staleFirst: false`, and the three user-facing opens passed
   that balanced value explicitly: Matrix (`matrix_runtime_select.js`),
   Dashboard card (`domains/dashboard/dashboard_actions.js`) and Finder row
   (`bevy_panel/bevy_panel_finder_runtime.js`).

## Rejected hypotheses

- WebSocket bootstrap timeouts (`waitForTauriWsAvailability`, 12 s) on iOS:
  they live on the write path only (`core/atome_commit_transport.js`) and only
  for Tauri; the stall was inside the project-load transaction.
- The auth gate: `waitForAuthCheck` is bounded by `AUTH_CHECK_TIMEOUT_MS` and
  resolves from the local auth cache and `auth.current`; the stall reproduced
  after it resolved.
- A remote local snapshot: on iOS
  `platforms/ios/atome-auv3/Common/AiSRuntimeStateCurrent.swift` answers
  `state-current get/list` from SQLite `openDatabase()` (authorized by local
  ownership); the embedded Tauri lane serves the same reads from its vault.

## Correction

- Keep the cloud out of the first paint: a stale-first load awaits the
  canonical local snapshot itself
  (`const quickLocal = staleFirst ? await localPromise : await awaitWithBudget(localPromise)`),
  projects it, publishes readiness, and schedules exactly one authoritative
  forced refresh after `eve:boot-presentation-ready`
  (`scheduleAuthoritativeRefreshAfterPresentation`, `viewModePrepared: true`).
  The 90 ms budget now governs the balanced route only.
- A resumed session owns no user decision, so `showPreparedProject` reveals
  with `staleFirst: true` while keeping `force`, `forceProjectSurface: true`
  and `reason: 'workspace_surface'`.
- `activateProjectWorkspace` defaults to `staleFirst: true`, and Matrix,
  Dashboard and Finder pass it explicitly. The balanced route stays reachable
  only through an explicit `staleFirst: false` (the deliberate
  `debug_runtime.js` diagnostic) and through the empty-local recovery.

Do not reintroduce a balanced load on a resume, boot or user-open path: an
unreachable backend must never hold a project open, and synchronization stays a
post-presentation concern.

## Regression checks

- `tests/probes/project_load_filter_contract.probe.mjs` contains the offline
  boot worst case: `Atome.listStateCurrent` resolves after 150 ms, the
  authoritative `atomes.list` never answers before presentation, the stale-first
  load must return the local records only, start zero remote reads, then start
  exactly one authoritative refresh after `eve:boot-presentation-ready`; the
  probe turns red (`still_waiting_for_the_server`) when the budget fix is
  reverted.
- `tests/probes/workspace_dashboard_project_bootstrap_contract.probe.mjs`
  asserts the resume reveal passes `staleFirst: true` with `force`,
  `forceProjectSurface` and `reason: 'workspace_surface'`; it turns red when the
  reveal fix is reverted.
- The boot probe set (`project_load_filter_contract`,
  `workspace_dashboard_project_bootstrap_contract`,
  `project_bootstrap_offline_resume_contract`,
  `project_bootstrap_dashboard_ready_contract`,
  `user_workspace_surface_runtime_contract`), plus
  `tests/eve/project_boot_view_mode_presentation.test.mjs`,
  `tests/governance/vitest_manifest_guard.test.mjs`, `npm run check:syntax` and
  `npm run check:m0`.

## Physical-device acceptance (To verify)

An iPhone campaign is still required before calling this resolved on device:
Debug build, server reachable then unreachable, cold and warm launches, and the
"modify something, then relaunch" sequence. Expected evidence: one
`[BOOT_SUMMARY]` line whose `last_milestone` is `project.foreground_load_ready`
(or a Dashboard milestone) before any authoritative read, and exactly one
`post_presentation_authoritative_refresh` afterwards. A Tauri launch with the
back-end stopped must stay usable in parallel. No replay of that campaign has
been recorded here yet.
