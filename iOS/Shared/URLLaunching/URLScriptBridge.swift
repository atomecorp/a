import Foundation
import WebKit
import UIKit

/// JS → Native bridge for opening URLs from the WebView.
/// Usage from JS: window.squirrel && squirrel.openURL("myapp://action")
public final class URLScriptBridge: NSObject, WKScriptMessageHandler {

    public static let channel = "squirrel.openURL"
    private weak var webView: WKWebView?
    private weak var hostViewController: UIViewController?

    public init(webView: WKWebView, hostViewController: UIViewController) {
        self.webView = webView
        self.hostViewController = hostViewController
        super.init()
    }

    /// Idempotent registration: safe to call twice
    public func register() {
        guard let contentController = webView?.configuration.userContentController else { return }
        // Remove any pre-existing handler to avoid duplicates
        contentController.removeScriptMessageHandler(forName: Self.channel)
        contentController.add(self, name: Self.channel)

    // JS side is provided in src/application/examples/app_launcher.js
        print("🔗 URLScriptBridge registered channel: \(Self.channel)")
    }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.channel else { return }
        guard let dict = message.body as? [String: Any],
              let urlString = dict["url"] as? String else {
            print("⚠️ URLScriptBridge: invalid message body for channel \(Self.channel): \(message.body)")
            return
        }

        Task { @MainActor in
            print("🔗 URLScriptBridge: request to open URL: \(urlString)")
            let ok = URLOpener.open(urlString, from: hostViewController)
            print("🔗 URLScriptBridge: open result=\(ok) url=\(urlString)")
        }
    }

    public func unregister() {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.channel)
        print("🔗 URLScriptBridge unregistered channel: \(Self.channel)")
    }
}
