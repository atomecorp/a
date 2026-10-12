# Assistant: debug reports, selection, ready line + TV/Create (2026-10-11)

Plan: `~/.claude/plans/alors-ta-prochaine-t-che-zazzy-engelbart.md`.

- [x] 1. `selection.get` runtime tool (shared contract + eVe handler) + assistant targeting rules
- [x] 2. `debug.report` / `debug.reports.list` → `record` Atome (`source_domain: assistant_debug`), trusted conversation excerpt
- [x] 3. "Je suis prêt, allez-y" spoken when the Realtime channel opens (transcript excluded)
- [x] 4. TV open → "Créer" opens its palette again (viewing tools no longer stand in for the palette)
- [x] 5a. TV list/voice offer only channels playable on this device (iOS: https only)
- [ ] 5b. iOS: keep the tap's user activation for `<video>.play()` — NOT done: needs an on-device diagnosis (relaunch with `-AtomeWebInspector`, France 24, log `<video>` events + `play()` rejection). See FRAMEWORK_STATE 2026-10-11.
- [x] 6. Maps + FRAMEWORK_STATE
- [x] 7. iOS `mediaTypesRequiringUserActionForPlayback = []` (ViewController.swift, WKWebViewFactory.swift) — supersedes 5b once rebuilt; verify on device
- [x] 8. TV/YouTube windows pile up (700×394, one column, view follows) instead of replacing each other
