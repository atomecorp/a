# Ribbon reduced to the Atome after a sign-in

## Symptom

After a sign-in that settles before a workspace opens (first launch, page
reload into a project), the main ribbon shows only the Atome handle in Edit;
`measure().rootKeys` is `['atome']` while `atomOnly` is false.

## Confirmed cause

`main_menu_auth_runtime.js#syncMainMenuAuthContent` installs the disconnected
toolbox (empty) while the workspace is not active yet, and it only re-synced on
auth events. When the project then opened, nothing re-synced: `showFully`
showed an empty toolbox.

## Durable correction

The auth gate also listens to `WORKSPACE_MODE_CHANGED_EVENT`
(`dashboard_workspace_mode.js`), non-forced: the guard on
`previous.workspaceActive` keeps it idempotent.

## Regression checks

- `HEADLESS=0 node temp/audio_finalize/run_acceptance_isolated.mjs`: the layered
  scenario reloads the project after sign-in and switches views through the
  ribbon.
