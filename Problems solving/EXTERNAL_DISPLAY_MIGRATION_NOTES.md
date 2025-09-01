# External Display & AUv3 Stability Migration Notes

Summary

- AUv3: no UIScene usage, no extra UIWindow creation, single WKProcessPool per process via WKWebViewFactory, non-persistent datastore, safe reload on WebContent termination.
- App: UIScene continues; external display observation isolated to app layer and never used in extension.

Required Info.plist adjustments

- AUv3 extension Info.plist: ensure there is no UIApplicationSceneManifest entry. AUv3 must not declare scenes.
- App target Info.plist: keep UIApplicationSceneManifest as-is for multi-window; SceneDelegate wired to app target only.

Key code locations

- src-Auv3/Common/WKWebViewFactory.swift: shared WKProcessPool and per-target configuration.
- src-Auv3/auv3/AudioUnitViewController.swift: uses factory, logs layout, retries on web process termination, no UIWindow usage.
- src-Auv3/Common/ExternalDisplayGuards.swift: skips external display in extension; app-only observation.
- src-Auv3/application/SceneDelegate.swift: app main scene boot using the shared factory; logs and external display observation hooks.

Testing matrix

- External display connect/disconnect × Stage Manager on/off × orientation × light/dark.
- AUv3: repeatedly open/close UI, simulate process termination (kill WebContent), confirm auto-reload.
- App: create/destroy external display windows; ensure isolation from AUv3 code paths.
