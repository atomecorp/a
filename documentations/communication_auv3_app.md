# AUv3 ⇄ App communication and passing params on launch

Updated: 2025-08-28

## Pass parameters when opening the main app from AUv3

You can pass parameters to the app at launch using the custom URL scheme. Two safe patterns:

- Simple query parameters (short values):

  atomeapp://activate?action=loadPreset&name=DX7%20EP

- Base64url-encoded JSON payload (flexible and robust):

  atomeapp://activate?payload=eyJhY3Rpb24iOiJsb2FkUHJlc2V0IiwibmFtZSI6IkRYNyBFUCJ9

### JS helper (Squirrel) to open with payload

```javascript
// Encode object as base64url and open the app
function openAtomeWithParams(params) {
  const toB64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
  const json = JSON.stringify(params || {});
  const payload = toB64url(json);
  if (window.squirrel?.openURL) {
    window.squirrel.openURL(`atomeapp://activate?payload=${payload}`);
  }
}
```

### Swift side: parse query or decode payload

Handle URLs in your SwiftUI App (onOpenURL) or SceneDelegate and parse either direct query params or a `payload` field.

```swift
import Foundation

struct LaunchCommand: Codable { let action: String; let name: String?; let args: [String:String]? }

func handleActivationURL(_ url: URL) {
    guard url.scheme == "atomeapp", url.host == "activate" || url.path.hasPrefix("/activate") else { return }
    let qi = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    if let b64 = qi.first(where: { $0.name == "payload" })?.value, let cmd = decodeB64URLJSON(b64) as LaunchCommand? {
        runLaunchCommand(cmd)
        return
    }
    // Fallback: simple query params
    let action = qi.first(where: { $0.name == "action" })?.value
    let name = qi.first(where: { $0.name == "name" })?.value
    if let action = action { runLaunchCommand(LaunchCommand(action: action, name: name, args: nil)) }
}

func decodeB64URLJSON<T: Decodable>(_ s: String) -> T? {
    var str = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while str.count % 4 != 0 { str.append("=") }
    guard let data = Data(base64Encoded: str) else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
}

func runLaunchCommand(_ cmd: LaunchCommand) {
    switch cmd.action {
    case "loadPreset": /* load preset named cmd.name */ break
    case "startRecorder": /* start recorder */ break
    default: break
    }
}
```

Note: The repo already wires onOpenURL for `atomeapp://activate`. Add your own `runLaunchCommand` actions.

## Communicating after both are open

Two main channels are supported; you can use both depending on context.

### 1) App Group + Darwin notifications (recommended control channel)

- App Group (e.g., `group.atome.one`) used to store small messages (inbox/queue) accessible by both processes.
- Darwin notifications used to wake the other side to read new data promptly.
- Robust across foreground/activation transitions and doesn’t require network permissions.

Typical pattern:

- Writer: encode a small JSON payload, write to UserDefaults in the App Group (optionally mirror via CFPreferences), then post a Darwin notification.
- Reader: observe notification, drain the inbox (process and clear), act.

Use this channel for control messages, triggers, preset changes, etc.

### 2) Local HTTP servers on 127.0.0.1 (best-effort data channel)

- AUv3 and the App can each expose a tiny HTTP server bound to 127.0.0.1 on different ports.
- Publish discovered ports in the App Group so the peer can reach them (e.g., `app.http.port` and `auv3.http.port`).
- Works well for on-device file serving or streaming while both sides are active.

Caveats:

- AUv3 UI may be suspended when not visible; its server stops accordingly.
- The App may be suspended in background; avoid assuming continuous availability.
- Always guard with timeouts and fallbacks.

### Other nudges and activation aids

- Custom scheme and Universal Links can be used to foreground the app when needed (e.g., `atomeapp://activate` or a UL like `https://your.domain/activate?...`).
- NSUserActivity is another activation path the app already handles.

## Suggested keying and safety

- Keep payloads small; for larger data, write a blob to the App Group and pass only a key in the URL or message.
- Prefer idempotent messages with timestamps to avoid double-processing.
- Use short-lived ports and advertise them via App Group keys; clear them on teardown.

## Quick checklist

- AUv3 → App launch with params: custom scheme + query or base64url JSON.
- Post-launch control: App Group + Darwin inbox (small, reliable).
- Bulk/data path (optional): local HTTP on loopback with advertised ports.
- Foregrounding: custom scheme or Universal Link when interaction is needed.

---

For code references, see:

- `src-Auv3/Common/SharedBus.swift`, `AppGroupOpenURLInbox.swift` (inbox, Darwin).
- `src-Auv3/Common/URLOpener.swift` (launch/relay).
- `src/application/examples/iOS_app_launcher.js` (Squirrel UI examples).
