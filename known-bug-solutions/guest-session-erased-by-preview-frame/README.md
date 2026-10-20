# Guest session erased by the preview capture frame

## Symptom

On iOS, a guest (« Commencer ») is back on the access screen after each relaunch.
Choosing « Commencer » again reruns the first launch on the same guest workspace:
each run creates another « Mieux dormir » and another « Dashboard eVe » project.
The previous guest's projects are still there (same device guest id).

## Root cause

The project preview capture iframe (`eve_bevy_project_preview_capture_frame`)
evaluates a large part of the application in its own realm (~117 chunks). A
dynamic import reaches `adole_apis.js`, whose module body ran
`auth.tryAutoLogin()`. Without the native bridge the local restore throws, and
`tryAutoLogin` called `clearSessionState()`, which removes `squirrel_session_v2`
from the localStorage the frame shares with the application.

The main page never removes the key: a spy on the main realm's
`Storage.prototype.removeItem` stays silent. The spy must be installed in the
frame realm (`frame.contentWindow.Storage.prototype`) before its module loads.

## Fix (2026-10-20)

- `atome/src/squirrel/apis/unified/adole_apis.js`: only the top-level document
  (`window.top === window`) runs the auth bootstrap.
- `auth_methods_session_account.js#tryAutoLogin`: an account grant that cannot be
  restored no longer erases a stored `anonymous` session; the guest branch starts it.

## Regression check

On the device: restore a guest session, remove the frame
(`document.getElementById('eve_bevy_project_preview_capture_frame').remove()`),
open and close a project (a capture recreates the frame), then
`localStorage.getItem('squirrel_session_v2')` must still hold the guest, and a full
relaunch (`devicectl … process launch --terminate-existing`) must land on the home.
Scripts: `temp/ios_projects_2026-10-20/` (`ifspy.js`, `cyc2.js`, `v1.js`).
