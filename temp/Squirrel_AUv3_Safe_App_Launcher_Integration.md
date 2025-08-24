Important :  all the JS code must be written in the file : src/application/examples/app_launcher.js
Important : iintegrate this solution into the framework without breaking any other facilities using  the Squirrel philisophy and Architecure avoiding any duplicated code 

# Squirrel AUv3 Safe App Launcher Integration (Swift/Objective‑C) — Copilot Task Brief

Goal: Add a *safe* app‑launcher from the AUv3 UI that opens custom URL schemes without being blocked by iOS, using the extension‑approved API.

## 0) Design constraints (what MUST be true)

• In the AUv3 extension, **never** call UIApplication.shared.open — it’s forbidden in app extensions.
• Use **NSExtensionContext.open(_:completionHandler:)** from the AUv3 UI view controller.
• Run on the **main thread**. Provide a boolean completion.
• Do **not** add LSApplicationQueriesSchemes to the AUv3 extension (not used; we don’t call canOpenURL from the extension).
• Avoid duplicate registration of WKScriptMessageHandler if the UI is WebView‑based.
• Provide a minimal **debounce** to avoid accidental rapid multi‑triggers.
• Preserve existing Squirrel bridges and don’t rename current message channels.
• Keep changes scoped and idempotent so merges don’t break existing code.

## 1) Files to ADD (shared between app + AUv3)

Create a new shared group/folder in Xcode: iOS/Shared/URLLaunching. Add these files to BOTH targets: the main app and the AUv3 extension UI.

1. URLOpener.swift
--------------------------------------------------------------------------------
import Foundation
import UIKit

@MainActor
public final class URLOpener {

    // Prevent multiple opens within a short window
    private static var lastOpenTime: TimeInterval = 0
    private static let minInterval: TimeInterval = 0.40 // 400 ms debounce

    // Unified entry point. Works in both app and extension.
    // - viewController: the current UI view controller (for extensionContext)
    // - urlString: full URL (custom scheme or https)
    // Returns true if the system accepted the request.
    @discardableResult
    public static func open(_ urlString: String, from viewController: UIViewController?) -> Bool {
        guard let url = URL(string: urlString), !urlString.isEmpty else { return false }

        let now = CFAbsoluteTimeGetCurrent()
        if now - lastOpenTime < minInterval { return false }
        lastOpenTime = now

        // Prefer extension context if available (AUv3)
        if let ctx = viewController?.extensionContext {
            var ok = false
            let sem = DispatchSemaphore(value: 0)

            ctx.open(url) { success in
                ok = success
                sem.signal()
            }

            _ = sem.wait(timeout: .now() + 2.0)
            return ok
        }

        // Fallback for the standalone app (foreground only)
        if let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) {

            var ok = false
            let group = DispatchGroup()
            group.enter()
            scene.open(url, options: nil) { success in
                ok = success
                group.leave()
            }
            _ = group.wait(timeout: .now() + 2.0)
            return ok
        }

        return false
    }
}

2. URLScriptBridge.swift (optional but recommended if the AUv3 UI uses WKWebView)
--------------------------------------------------------------------------------
import Foundation
import WebKit
import UIKit

// JS → Native bridge for opening URLs from the WebView.
// Usage from JS: window.squirrel && squirrel.openURL("myapp://action")
public final class URLScriptBridge: NSObject, WKScriptMessageHandler {

    public static let channel = "squirrel.openURL"
    private weak var webView: WKWebView?
    private weak var hostViewController: UIViewController?

    public init(webView: WKWebView, hostViewController: UIViewController) {
        self.webView = webView
        self.hostViewController = hostViewController
        super.init()
    }

    // Idempotent registration: safe to call twice
    public func register() {
        guard let contentController = webView?.configuration.userContentController else { return }
        // Remove any pre‑existing handler to avoid duplicates
        contentController.removeScriptMessageHandler(forName: Self.channel)
        contentController.add(self, name: Self.channel)

        // Minimal JS shim if not already present
        let js = """
        if (!window.squirrel) { window.squirrel = {}; }
        if (!window.squirrel.openURL) {
          window.squirrel.openURL = function(url) {
            try { window.webkit.messageHandlers['squirrel.openURL'].postMessage({ url: String(url || '') }); }
            catch(e) { return false; }
            return true;
          }
        }
        """
        let script = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        contentController.addUserScript(script)
    }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.channel else { return }
        guard let dict = message.body as? [String: Any],
              let urlString = dict["url"] as? String else { return }

        Task { @MainActor in
            _ = URLOpener.open(urlString, from: hostViewController)
        }
    }

    public func unregister() {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.channel)
    }
}

## 2) Modifications to EXISTING code (AUv3 UI controller)

Find the AUv3 UI view controller (likely something like AUViewController, MainViewController, or WebViewHostViewController). Apply:

A) Keep a strong property for the bridge (if using WKWebView):
--------------------------------------------------------------------------------
private var urlBridge: URLScriptBridge?

B) After you create/configure the WKWebView, register the bridge once:
--------------------------------------------------------------------------------
let bridge = URLScriptBridge(webView: webView, hostViewController: self)
bridge.register()
self.urlBridge = bridge

C) If you have native buttons that should open apps, call:
--------------------------------------------------------------------------------
let ok = URLOpener.open("myapp://do/thing", from: self)
// optionally reflect ok in UI

D) Deinit / cleanup (optional):
--------------------------------------------------------------------------------
deinit { urlBridge?.unregister() }

## 3) Standalone app target (optional fallback)

For your main app (not the extension), URLOpener already handles the fallback via UIWindowScene.open(_:). No extra Info.plist keys are needed if you never call canOpenURL. If you later add canOpenURL, only then add LSApplicationQueriesSchemes with the list of schemes you want to test.

## 4) Xcode project changes (precise steps)

• Add iOS/Shared/URLLaunching group and add URLOpener.swift (+ URLScriptBridge.swift if WebView is used).  
• In the File Inspector, check the **Target Membership** for BOTH targets: the AUv3 extension UI target and the main app target.  
• Build settings: No special entitlements required for open(url) via NSExtensionContext in an extension.  
• If your AUv3 UI is SwiftUI, wrap the hosting UIViewController (or expose the UIViewController via a small adapter) so you can pass ‘self’ to URLOpener.  
• Ensure the registration of URLScriptBridge is performed exactly once per WebView instance.

## 5) Non‑regression & no‑redundancy checklist

[ ] Do not duplicate any existing JS bridge names. Use the new channel: squirrel.openURL  
[ ] Only one URLScriptBridge per WebView instance.  
[ ] All calls to open(url) happen on the main actor.  
[ ] Debounce blocks bursts (< 400 ms).  
[ ] No UIApplication.shared.open in the extension path.  
[ ] No LSApplicationQueriesSchemes in the extension.  
[ ] No changes to your existing Squirrel message names, colors, or layout code.  
[ ] AUv3 audio thread not touched: all UI/bridge code runs on main.

## 6) Copilot “apply” instructions (step‑by‑step prompt)

You are Copilot in the atomecorp/a repository. Perform the following changes WITHOUT renaming existing types unless specified. Keep diffs minimal and idempotent.

1) Create folder iOS/Shared/URLLaunching and add files URLOpener.swift and URLScriptBridge.swift with the exact contents above. Add both files to:
   • Squirrel main iOS app target
   • Squirrel AUv3 extension UI target

2) Locate the AUv3 UI view controller that owns the WKWebView (search: class .*ViewController, WKWebView, webView.navigationDelegate). If none, locate the primary AUv3 UI controller.
   • Add a stored property: private var urlBridge: URLScriptBridge?
   • After the WKWebView is created/configured, instantiate URLScriptBridge(webView: webView, hostViewController: self), call register(), assign to urlBridge.

3) Expose a simple JS API to test:
   • In JS: window.squirrel.openURL("shortcuts://run-shortcut?name=MyFlow")
   • Confirm it opens via the host (AUM/Loopy/Drambo) when the extension UI is visible.

4) For native buttons (if any) that should open URLs:
   • Wire their actions to URLOpener.open("myapp://...", from: self)

5) Verify:
   • AUv3 build & run in AUM; tapping your UI button or calling the JS API opens the target app (host mediates the request).  
   • Background behavior: URLOpener returns false if the main app is backgrounded and no extensionContext is present.  
   • Rapid double taps don’t open twice (debounce).

6) Leave existing Squirrel bridges intact:
   • Do not remove or modify previously registered message channels unrelated to URL launching.  
   • Ensure no duplicate add() for the same handler name.

7) Commit message:
   feat(iOS/AUv3): add safe app launcher via NSExtensionContext.open + WKWebView bridge (squirrel.openURL)

## 7) Troubleshooting

• “Nothing happens” in AUv3: ensure you call URLOpener.open from the extension’s UI controller (has non‑nil extensionContext).  
• “openURL blocked” warnings: check you are not in a background scene or using UIApplication in the extension.  
• “JS handler not firing”: ensure URLScriptBridge.channel matches, and handler is registered once on the WebView’s userContentController.  
• “Multiple opens”: increase minInterval in URLOpener if necessary.

## 8) Security and UX

• Never pass untrusted URLs directly; consider validating allowed schemes (e.g., whitelist: [“shortcuts”, “aum”, “mididesignerpro.audiobus”, “myapp”]).  
• Provide a small toast or label feedback when URLOpener returns false so users understand that the host/device rejected the request.

— End of brief —
