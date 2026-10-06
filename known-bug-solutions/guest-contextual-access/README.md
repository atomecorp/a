# Guest contextual rail does not open

Confirmed on 2026-10-06 in the user's existing Vivaldi guest workspace on
`http://localhost:3001/` (Fastify). Clicking the empty background of Welcome
produced no project rail. Text selection also reported
`atome_contextual_access_failed` / `context_menus_access_unavailable`.

## Cause and owner

The canonical Atome reader reaches `browser_workspace.js` for browser-local
state. IndexedDB records lacked the transient `capabilities` required by
`eVe/intuition/menu/context_menu_resolver.js#loadContextMenuAccess`.
The authorized repair projects the existing local-owner authority at the
browser read boundary. It checks record ownership, preserves server-provided
restrictions, retains the in-flight session check, and does not persist rights.

A second cause prevented the repair from reaching this window. Vivaldi's Sources
panel showed the old reader while Fastify served the corrected source. The
Application panel showed worker #497 active and #500 waiting to activate.
Normal reload had retained the old application. Activating the already verified
waiting worker with DevTools `skipWaiting`, then normally reloading the page,
loaded the repair. Do not delete IndexedDB or reset the guest identity.

The startup-only manifest in `server/offline_app_assets.js` can also become
inconsistent if sources change during the server lifetime. At the final check,
the manifest contained the correct reader digest; the demonstrated remaining
update blocker was worker activation. An automatic update-cycle extension is
not implemented by this repair and requires its own bounded authorization.

## Evidence and regression

`node tests/probes/guest_workspace_indexeddb_runtime_probe.probe.mjs` passes.
The added regression fails with the original reader and covers actual
Atome.getStateCurrent, get/list parity, unchanged durable state, owner isolation,
logout, identity changes and restrictive imported projections.

Real Vivaldi acceptance: click the empty Welcome background, retouch to close,
click again to reopen, scroll to the first Template tool, then open its panel.
The rail and Dashboard Pro / New Template list were visually confirmed.
Captures are under `temp/guest_dashboard_diagnostics/`:
`vivaldi-project-rail-fixed.jpg` and `vivaldi-template-panel-fixed.jpg`.
Recheck the browser console and the actually loaded reader after any deployment.

## Rejected shortcuts and limits

Do not change hit testing, add a menu-specific state reader, fabricate rights in
the menu, or treat an in-app-browser result as Vivaldi acceptance. This issue
does not establish a fix for the separately reported native Tauri wallpaper
freeze. An animated packaged Tauri instance is not evidence for an inaccessible
unbundled development process.
