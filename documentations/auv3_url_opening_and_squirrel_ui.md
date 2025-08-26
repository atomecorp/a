# AUv3 URL Opening + Squirrel UI — Architecture, Setup, and Usage

Updated: 2025-08-26

## Goals

- Launch external apps/URLs from the AUv3 UI reliably.
- Avoid trust prompts and enable hands-free (MIDI-driven) flows.
- Provide a simple JS UI using Squirrel syntax that calls `window.squirrel.openURL`.
- Relay requests to the container app when hosts block extension-initiated activation.
- Optionally foreground the Atome app using a custom scheme or Universal Links.

## High-level Architecture

- AUv3 side
  - Tries to open the URL directly using a modern UIApplication method via a tiny Objective‑C shim.
  - Also relays the request to the main app using App Group storage + Darwin notifications.
  - Optionally nudges app activation via `atomeapp://activate` or Universal Link.
- Container app side
  - When active, opens the URL immediately (silent, no popups).
  - When inactive, it queues requests and opens them once the app becomes foreground active.
  - Supports a small delay for “trusted” schemes to avoid prompting.
- Web UI (Squirrel)
  - A sample `iOS_app_launcher.js` shows input + buttons.
  - Calls `window.squirrel.openURL(url)` from JS.

This design works even when a host refuses to honor extension-initiated opens. The relay ensures the app completes the action the next time it’s foregrounded.

## Key Files and Responsibilities

- AUv3/Common
  - `SharedBus.swift`
    - App Group constants, Darwin notification prefix, inbox index key.
    - Codable `RelayPayload` with timestamp.
    - Write and mirror to CFPreferences for robustness.
  - `URLOpener.swift`
    - Entry point from AUv3 UI to open a URL.
    - Strategy:
      1) Try modern UIApplication open via Objective‑C shim (host-dependent).
      2) Try `NSExtensionContext.open(_:completionHandler:)`.
      3) Always relay payload to the container app (App Group + Darwin notify).
      4) Nudge activation: `atomeapp://activate` and Universal Link, attempting UIApplication path first.
  - `OpenURLShim.h/.m`
    - Small Objective‑C bridge that calls `UIApplication.shared openURL:options:completionHandler:` dynamically (via `objc_msgSend`).
    - Exposes a C function usable from Swift.
- App/Application
  - `AppURLOpener.swift`
    - Immediately opens when foreground active using `UIWindowScene`.
    - Otherwise enqueues and requests activation; uses small silent delays for “trusted” schemes.
  - `AppGroupOpenURLInbox.swift`
    - Inbox queue in App Group; drain/flush on app lifecycle; CFPreferences fallback.
  - `TrustedTapOpener.swift`
    - Heuristics to delay and open without prompts for safe/known schemes (e.g., `shortcuts://`).
  - `AppDelegate.swift` and `SceneDelegate.swift`
    - Start listeners, drain/flush inbox, handle `atomeapp://activate` and Universal Link `/activate` when app is brought forward.
- Web UI (JS)
  - `src/application/examples/iOS_app_launcher.js`
    - Squirrel-based UI with input, quick tests, status pill.
    - Helper `openViaSquirrel(url)` calls `window.squirrel.openURL(url)` or WK handler fallback.
    - Includes a link “Open Atome app” which uses `atomeapp://activate` on demand.

## Setup Checklist

- App Group
  - Create an App Group (e.g., `group.atome.one`) and enable it in both the App and AUv3 extension.
  - Ensure the same suite identifier is used in `SharedBus.swift`.
- Custom Scheme
  - Register `atomeapp://` for the container app (Info.plist URL Types).
  - App handles `atomeapp://activate` in `AppDelegate`/`SceneDelegate`/SwiftUI handlers.
- Universal Links (optional but recommended)
  - Entitlement: add `applinks:your.domain` to Associated Domains for the App target.
  - Host an AASA JSON at `https://your.domain/apple-app-site-association` (no extension, `application/json`).
  - Include a rule for the `/activate` path.
  - Example AASA (adjust team/app IDs and domain):

    ```json
    {
      "applinks": {
        "details": [
          {
            "appIDs": ["ABCDE12345.com.atome.app"],
            "components": [
              { "/": "/activate", "comment": "Atome activation" }
            ]
          }
        ]
      }
  }
  ```

- Objective‑C Shim in AUv3 target
  - Add `OpenURLShim.m` and `OpenURLShim.h` to the AUv3 extension target.
  - If you use Swift only, Xcode will create/ask for a bridging header when needed.
  - C symbol is called from Swift; no direct imports from app target are required.
- Permissions and Policies
  - The UIApplication path from an extension is host and OS dependent. Some hosts permit it, others don’t. We always keep the relay path as a fallback.
  - For App Store builds, consider gating the shim via a build flag or remote config.

## Using from JavaScript (Squirrel UI)

- Basic usage:
  - In JS, call `window.squirrel.openURL('shortcuts://run-shortcut?name=Shazam')`.
  - In AUv3, if the host allows direct open, it may happen immediately; otherwise the request is queued and will be completed when the app is foregrounded.
- Example locations:
  - `src/application/examples/iOS_app_launcher.js`: copy patterns from here.
- Provided helpers in the example:
  - Input + “Open” button.
  - Quick tests for `pdparty://` and `ibooks://`.
  - “Open Atome app” link that triggers `atomeapp://activate` on demand (no auto-open).

## App Behavior Details

- Foreground Active
  - App opens URLs immediately, silently, using the active `UIWindowScene`.
  - For known trusted schemes, we may add a short delay to avoid trust prompts.
- Background / Inactive
  - Requests are queued in the App Group inbox and drained when the app becomes active.
  - Darwin notifications and scene/lifecycle hooks ensure timely processing.

## Extension Behavior Details

- `URLOpener.open(url, from: AUv3)` logic:
  1) Try UIApplication open via the shim. If success, we’re done.
  2) Try `NSExtensionContext.openURL` as a fallback.
  3) Always write the payload to the App Group inbox and post a Darwin notification.
  4) Try to nudge activation using `atomeapp://activate` or a Universal Link.

This matches tools like “URL Beamer” in hosts that permit direct UIApplication usage from extensions.

## Enhancements and Hardening Ideas

- Build flags / runtime toggles
  - Add a compile-time flag (e.g., `AUV3_ALLOW_UIAPPLICATION_OPEN`) to enable/disable the shim.
  - Or gate behavior by host detection for safer defaults.
- Universal Links
  - Complete your AASA hosting and validate association to reliably foreground the app without prompts.
- Trusted schemes
  - Expand the trusted scheme list and tune delays for smoother openings.
- Observability
  - Add lightweight logging/metrics (success/failure, host identifiers) to guide heuristics.
- Rate limiting
  - Debounce bursty requests from MIDI or automation.

## Troubleshooting

- “Request is not trusted” or no action from AUv3
  - Host likely blocks extension activation. Rely on relay; foreground the app to complete the open.
- Universal Link does not foreground the app
  - Verify AASA availability, content type, and that `applinks:` entitlement matches your domain.
  - Test with Safari: visiting the link should open the app without a prompt once associated.
- Nothing opens when app is active
  - Confirm App Group ID matches in both targets.
  - Check that `OpenURLShim.m/.h` are included in the AUv3 target (if using the direct path).
  - Ensure `AppDelegate`/`SceneDelegate` lifecycle hooks drain/flush inbox on activation.
- Some URLs open, others prompt
  - Add them to the trusted scheme handling or increase the delay.

## Quick Reference — APIs and Entry Points

- JavaScript
  - `window.squirrel.openURL(url: string)` — preferred.
  - Fallback: `window.webkit.messageHandlers['squirrel.openURL'].postMessage({ url })` if present.
- Swift (AUv3)
  - `URLOpener.open(url: URL, from controller: AudioUnitViewController)` — main entry for AUv3 UI.
- Swift (App)
  - `AppURLOpener.open(url: URL)` — opens immediately if active, or enqueues otherwise.

## Security and Review Notes

- Calling UIApplication from an extension is not guaranteed and may be rejected depending on context. Keep the relay path as the primary guarantee.
- Avoid opening arbitrary URLs without user intent in production builds. Consider a permission/allowlist strategy.

---

If you need a minimal integration example or to toggle behaviors per-host, reach for the example JS in `src/application/examples/iOS_app_launcher.js` and the AUv3 opener in `src-Auv3/Common/URLOpener.swift`.