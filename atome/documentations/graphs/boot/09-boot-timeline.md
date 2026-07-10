# Boot Timeline - boot

```mermaid
sequenceDiagram
  participant Browser
  participant Squirrel as squirrel/kickstart
  participant Eve as eVe.js
  participant Loader as module_loader_runtime
  participant Auth as auth/session
  participant Project as project_bootstrap
  participant Runtime as audio/video/renderer

  Browser->>Squirrel: load kickstart.js
  Squirrel->>Squirrel: initKickstart()
  Squirrel->>Browser: create #view
  Squirrel->>Browser: dispatch squirrel:ready
  Browser->>Eve: load eVe/eVe.js
  Eve->>Loader: loadModulesSequentially(eveModules)
  Loader->>Runtime: audio core/facade/kira/record APIs
  Loader->>Runtime: video facade
  Loader->>Runtime: tool genesis / commit / timeline
  Loader->>Project: import project_bootstrap.js
  Loader->>Runtime: import intuition/bootstrap.js
  Runtime-->>Runtime: bootstrapCaptureDevicePermissionsOnLaunch (ASYNC_RISK void)
  Runtime->>Runtime: ensureActivitiesModule
  Project->>Auth: waitForAuthCheck
  Auth-->>Project: squirrel:auth-checked or API current or timeout
  Project->>Project: ensureCurrentProject
  Project->>Project: list/create/select project
  Project->>Browser: ensureProjectView + attachProjectDropZone
  Project-->>Project: loadProjectAtomes staleFirst (ASYNC_RISK)
```

## Chronological load order from `eVe/eVe.js`

1. `eve.play_record_core`
2. `eve.audio_facade`
3. `eve.backend_kira`
4. `eve.record_audio_api`
5. `eve.video_facade`
6. `eve.tool_genesis`
7. `eve.atome_commit`
8. `eve.atome_timeline`
9. `eve.user_background`
10. `eve.languages`
11. `eve.i18n`
12. `eve.design`
13. `eve.voice_assistant`
14. `eve.project_bootstrap`
15. `eve.bootstrap`
16. `eve.shortcut_config`

## Blocking calls

- `await import(modulePath)` for each module in `loadModulesSequentially`.
- `await waitForAuthCheck` before project load.
- `await api.projects.list/create/setCurrent` during project bootstrap.

## Network/disk/runtime access

- `fetch('/api/server-info')` and `fetch('/eVe/version.txt')` in runtime version loading.
- Auth/project APIs through `AdoleAPI`.
- Audio/video permission warmup in `bootstrapIntuition`.

## Lazy-load candidates

- local ONNX TTS preload begins from `eve.voice_assistant` after workspace voice bootstrap
- `eve.user_background`
- `eve.shortcut_config`
- capture/perform/delete/clock/code tools imported by `intuition/bootstrap.js`
- capture permission warmup, if not required before first user gesture
