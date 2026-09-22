# iOS launch surface never released by the boot presentation contract

## Symptom

An iOS launch keeps the native overlay `Le démarrage continue…` on screen over
an app that is already interactive, sometimes after a 10-20 s black or branded
cover, and the same launch is instant at other times. The overlay is
`platforms/ios/atome-auv3/application/ViewController.swift#showBootDelayWarning()`,
armed by `Common/WebViewManagerBoot.swift#BootStallWatchdog`: 20 s without a
native or JavaScript milestone before `navigation_started`, 8 s after it. Only
`bootPresentationReady` or `bootAuthenticationReady` release the surface; a
watchdog warning is never terminal (`reportBootStall` does not set
`bootTerminalFailure`), so the label stays until one of those two messages
crosses Swift.

`[BOOT_SUMMARY] … last_milestone=…` plus `[BOOT_DIAGNOSTIC]` and
`[BOOT_PRESENTATION]` are the decisive device evidence: a session whose last
milestone is `presentation.wait_start` (and never `presentation_ready`) proves
this defect rather than a slow backend.

## Confirmed root causes

Both defects lived in
`eVe/intuition/runtime/eve_intuition/boot_runtime.js` and concerned the launch
surface only; the workspace itself was presented.

1. The contract demanded the Main Toolbar (`newMenu.measure()`:
   `active === true && treeMounted === true`) for every route, but the Dashboard
   entry suspends and unmounts that menu on purpose
   (`user_workspace_surface_runtime.js#openWorkspaceDashboardAndMainMenu` →
   `setWorkspaceMainMenuDashboardSuspended(true)`). A Dashboard boot could
   therefore never publish the contract, so the branded cover stayed until the
   8 s stall warning and the label stayed for the rest of the session; the
   `eve:boot-presentation-ready` event, and with it the single
   post-presentation authoritative refresh, never fired on that route either.
2. The wait was bounded to 3 s (`perfNowMs() + 3000`) and never re-armed. A
   workspace that presented later - a cold WebGPU/Bevy Main Toolbar mount on
   iPhone - lost the contract permanently, even though the app became fully
   interactive moments later.

A Dashboard boot followed by a user project open explained the observed
"message on the Dashboard *and* on the project": the contract had already given
up during the Dashboard entry, and a project open never re-publishes it.

## Rejected hypotheses

- An unreachable server holding the boot: that was the earlier, separate defect
  recorded in `known-bug-solutions/ios-boot-server-await`. The project load is
  local-first now, and the label persisted with the fix embedded in the built
  runtime.
- A stalled auth check: `authentication.sequence_start` /
  `authentication.sequence_started` / `workspace.signal_started` are published
  before the contract, and `tryAutoLogin` publishes `squirrel:auth-checked` from
  the stored session immediately (optimistic `setSessionState`), so the label
  was never the auth gate.
- A native-side defect: `handleBootPresentationReady` and
  `handleBootAuthenticationReady` both cancel the watchdog and fade the
  surface; they were simply never called.

## Correction

Each entry route is now released by the presentation evidence it really proves,
and the contract is never dropped:

- `publishBootPresentation` resolves the evidence of the surface that is
  presented *now* instead of the route the workspace open reported: the mounted
  Main Toolbar keeps the unchanged `project` contract and `main_menu` payload,
  and `readWorkspacePresentationEvidence()` describes the `dashboard` route.
  Reading the current state matters because the presented surface can change
  before the contract is satisfied — a Dashboard entry the user leaves for a
  project, or a project whose Main Toolbar mounts only after a cold WebGPU
  start, must both release the native surface. The Dashboard reader is exported by
  `eVe/intuition/tools/user_workspace_surface_runtime.js` and reuses
  `dashboardProjectionStatus` - the exact predicate the Dashboard already
  proved before it published `dashboard.presentation_ready` - instead of adding
  a second readiness path. Its payload carries
  `workspace: { route_surface: 'dashboard', scene_project_id, mounted_nodes }`
  and no `main_menu` claim.
- `waitForBootPresentation` watches until the evidence is satisfied, re-arming
  with a wider delay (50 ms → 800 ms) and tracing
  `presentation_pending / route_surface_not_presented` once. It stays silent
  towards the native watchdog, so a workspace that truly never presents is
  still reported as a stalled boot.

`readWorkspacePresentationEvidence` is a required boot binding
(`intuition_boot_workspace_presentation_reader_missing`), supplied by
`eVe/intuition/eVeIntuition.js`.

The same repair removed a duplicate export in
`user_workspace_surface_runtime.js` (the new reader was declared with `export`
and listed again in the module's closing export block). That duplicate made
`npm run check:syntax` fail on the file and would have failed the iOS runtime
bundle, so no device verdict was possible until it was removed.

## Regression checks

- `tests/probes/ios_boot_presentation_contract.probe.mjs` covers four cases: an
  unpresented Dashboard releases nothing and then publishes exactly one
  `bootPresentationReady` with the Dashboard workspace payload and no
  `main_menu`; an already mounted project publishes the canonical project
  contract; a project whose Main Toolbar mounts after the historical 3 s wait
  still publishes exactly one contract; and a Dashboard entry the user leaves
  for a project — before the Dashboard tree was ever projected — publishes
  exactly one project contract. The probe fails on the pre-fix contract
  (`the Dashboard entry must publish exactly one native presentation contract`,
  `0 !== 1`).
- `tests/probes/user_login_boot_order_contract.probe.mjs` supplies the new
  required binding and keeps asserting the project contract shape
  (`main_menu.active` / `main_menu.tree_mounted`). Two of its assertions still
  pointed at the retired Dashboard-toggle wiring (`toggleDashboard:` inside
  `bevy_ui_product_runtime.js`) while the Mystic route had taken that ownership
  (`mystic_context_items_runtime.js#invokeMysticContextTool` →
  `toggleWorkspaceDashboardAndMainMenu({ source: 'modern_mystic_dashboard' })`).
  They were repointed to the canonical owner with the same intent and the probe
  passes again.
- `node platforms/ios/package_ios_runtime.mjs --output=temp/ios_runtime_package_verify`
  reproduces the packaging step after the correction: 654 runtime files, 43
  critical owners, 8 deferred owners, with the repaired contract inside
  `chunks/eve/critical-bootstrap.js`.

## Pre-existing failures left untouched

- `tests/eve/project_workspace_activation_contract.test.mjs` fails 5/8 with
  `workspace_main_menu_overlay_missing:0:0:0:0:no_error` from
  `eVe/intuition/tools/workspace_main_menu_visibility.js:166`, raised by
  `setWorkspaceMainMenuDashboardSuspended(false)` inside
  `project_workspace_activation_runtime.js`. The guard needs a projected BevyUI
  overlay tree, which the suite's mock compositor never produces; the throwing
  module and the activation line are reached identically with
  `staleFirst: true` and `staleFirst: false`, and the failure is already
  recorded as pre-existing in `eVe/documentations/FRAMEWORK_STATE.md`.
- `tests/probes/project_bootstrap_login_reentry_contract.probe.mjs` and
  `tests/probes/project_bootstrap_preserves_active_project_workspace_contract.probe.mjs`
  crash on `project_create_must_not_be_needed` /
  `dashboard_bootstrap_must_not_create_project_when_one_exists`: their fixture
  lists projects under `fastify` only, while the mock environment classifies
  itself as the Tauri runtime (`isTauriRuntime()` → true), so
  `pickAuthoritativeProjects` reads `tauri.projects` (empty), returns no project
  and `ensureCurrentProject` falls through to `api.projects.create`. Reproduced
  outside the probe with the same mock environment and payload: `picked count:
  0`; `eVe/core/project_security.js` and `tests/strangler_v2/_env.mjs` are
  unmodified, so this is a fixture/authority mismatch, not a boot defect.

## Physical-device acceptance (To verify)

No device replay of this correction is recorded yet. Required campaign on the
attached iPhone: Debug build, cold and warm launches, a Dashboard entry
(`workspace.startup_view` = `dashboard`, first use, or after logout) and a
resumed project entry, with the back-end reachable and then unreachable.
Expected evidence: exactly one `[BOOT_PRESENTATION]` line per launch whose
`route` matches the presented workspace, either `main_menu.tree_mounted=true`
(project) or `workspace.route_surface=dashboard`, with no
`last_milestone=presentation.wait_start` in the `[BOOT_SUMMARY]` line.
