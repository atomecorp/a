import UIKit
import WebKit
import OSLog

enum ExternalDisplayGuards {
    static var isRunningInExtension: Bool {
        let path = Bundle.main.bundlePath
        if path.hasSuffix(".appex") { return true }
        if Bundle.main.infoDictionary?["NSExtension"] != nil { return true }
        return false
    }
}

/// Connected screens (R-212, contract validated by the user, 17 Nov. 2026): the app's page says where it is
/// (`swiftBridge` action `externalDisplay`, eVe/domains/rendering/external_display_link.js); the page a connected
/// screen shows (application/ExternalDisplaySceneDelegate.swift) gets it here. The page's origin is opaque
/// (`atome:///`), so no browser channel reaches the other web view: this relay is the link, keeping the last
/// place for a screen connected later. In the AUv3 no screen ever connects: the place is only kept.
final class ExternalDisplayRelay: NSObject, WKScriptMessageHandler {
    static let shared = ExternalDisplayRelay()
    static let followerHandlerName = "externalDisplayFollower"
    private let log = Logger(subsystem: "atome", category: "ExternalDisplay")
    private var lastPlace: [String: Any]?
    private weak var follower: WKWebView?

    private override init() {}

    /// From the app's page: `{ version: 1, message: { type: 'place', place } }`.
    func receive(_ body: [String: Any]) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard (body["version"] as? NSNumber)?.intValue == 1,
              let message = body["message"] as? [String: Any],
              message["type"] as? String == "place" else {
            log.error("external display message refused")
            return
        }
        lastPlace = message
        deliver(message)
    }

    func attach(follower webView: WKWebView) { follower = webView }

    func detach() { follower = nil }

    /// The screen's page asks where the device is (its `hello`, once it follows).
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.followerHandlerName,
              (message.body as? [String: Any])?["type"] as? String == "hello",
              let lastPlace else { return }
        deliver(lastPlace)
    }

    private func deliver(_ message: [String: Any]) {
        guard let follower,
              let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        follower.evaluateJavaScript("window.__eveExternalDisplayReceive?.(\(json));") { [log] _, error in
            if let error { log.error("external display place not delivered: \(error.localizedDescription)") }
        }
    }
}
