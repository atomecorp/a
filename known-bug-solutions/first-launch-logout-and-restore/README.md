# First-launch logout, Billing navigation and restoration

2026-10-07. Source correction and regression tests verified; authenticated native acceptance remains **To verify**.

## Reproduction

Use the actual Tauri UI: restore an existing session, open the current-user Contact card and disconnect. Expect Access, with the public animated wallpaper. For a new number, reach Billing and click simulated Pay, then Back; expect SMS and Phone respectively. Restore an existing session whose preference selects Dashboard: retain the wallpaper while its tree loads. Restore an ordinary project: its surface colour arrives through the existing fade.

Do not send SMS to an invented number or treat direct runtime calls as native acceptance. Use an authorized real/QA session for the signed phone proof.

## Confirmed owners and causes

- Account logout emits `squirrel:user-logged-out`, then `squirrel:auth-checked`, before the session reset. Home and the auth menu could remount login before asynchronous workspace cleanup finished.
- `atome/src/squirrel/apis/unified/adole_api/session.js` performed additional DOM teardown, removing a project container containing the shared canvas. The regression reproduced a disconnected canvas; subsequent Matrix bounds reads explain the reported null `clientWidth` exception.
- `eVe/intuition/tools/project_bootstrap_support.js` started scene cleanup without exposing its completion. `user_workspace_runtime.js` separately removed DOM hosts. Late cleanup could erase the new presentation.
- `user_workspace_surface_runtime.js` applied initial canvas opacity zero while the welcome wallpaper was already presented. Basic Matrix arrival also selected project colour before its Matrix records existed. Bootstrap cleanup used the startup preference before it had necessarily resolved.
- Billing Pay/Back waited for delivery/cancellation before changing panels. Its notice appeared beneath the whole natural page, where an error could be outside the visible actions.

## Correction

Session reset delegates visual cleanup through its existing events. Home serializes logout cleanup and auth-checked reentry; the loaded Home handlers own opening. Workspace cleanup awaits the canonical bootstrap scene owner and preserves the one shared canvas. The auth menu distinguishes an authenticated legacy account from a public Access presentation.

Billing v3 adds an in-grid notice using the existing Matrix control. Pay/Back reveal SMS/Phone before network completion and release the destination controls. First-launch action generations prevent obsolete callbacks from changing a later panel. Signed phone exchange, cancellation and SMS proof remain with the existing phone owner; simulation opens no account by itself.

Authenticated preparation preserves the welcome/Dashboard host and waits for cleanup before loading. Dashboard retains canvas visibility. Basic Matrix activation stays in the existing transition until its records arrive. Ordinary project restoration composes the existing thumbnail-transition colour fade.

## Rejected shortcuts and regression evidence

Suppressing null bounds reads or ignoring every context exception would leave the missing welcome presentation. A guest-only logout event does not reproduce account logout's second event and reset. No replacement canvas, raw DOM welcome, authentication bypass or alternate payment implementation was added.

Persistent suites: `tests/eve/first_launch_logout.test.mjs` (real menu/Home/session/workspace owners and declared gateway), `first_launch_runtime.test.mjs` (pending actions and stale completion), `first_launch_matrix.test.mjs` (actual hit targets), `first_launch_workspace_restore.test.mjs` (pending restoration and existing transition routing). The existing preference suite awaits real imports after each module reset so unfinished module loading cannot contaminate the next test. Final focused checks pass 99 tests across twelve suites; M0, syntax and both diff checks pass. Tests use isolated network/render transports and do not prove native authenticated acceptance.

Native real clicks verified guest exit through Contact back to Access with wallpaper and automatic Contact closure. One capture showed wallpaper alone while cleanup completed; presentation latency was not instrumented. Axum reported no recent errors. Full post-interaction WebView/Rust/Fastify logs were unavailable. **To verify:** the account/new-number reproduction above after reloading the final source, plus Web and physical iOS. See `eVe/documentations/FRAMEWORK_STATE.md` for exact limitations and validation logs.
