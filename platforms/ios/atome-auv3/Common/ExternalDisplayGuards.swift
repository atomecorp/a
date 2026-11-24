import UIKit
import WebKit
import OSLog

extension Notification.Name {
    /// A message of the app's page for its connected screen other than its place (ExternalDisplayRelay.receive).
    static let externalDisplayPageMessage = Notification.Name("atome.externalDisplay.pageMessage")
    /// The screen's page asks for the device's keyboard, or gives it back (`open`: eVe/domains/rendering/external_display_keyboard.js).
    static let externalDisplayKeyboard = Notification.Name("atome.externalDisplay.keyboard")
}

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
    // The screen's page shown in a window of its own (an iPad with Stage Manager, ExternalDisplayFollowWindow.swift):
    // iPadOS gives it the keyboard itself, so no key of the device is relayed to it.
    private var followerTakesInput = false

    private override init() {}

    /// From the app's page: `{ version: 1, message: { type: 'place', place } }`; its Trackpad (`type: 'trackpad'`) and
    /// its question whether a screen is connected (`type: 'screen'`) go to the app's pointer
    /// (application/ExternalDisplayPointer.swift), which the AUv3 has not: there they find no one.
    func receive(_ body: [String: Any]) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard (body["version"] as? NSNumber)?.intValue == 1,
              let message = body["message"] as? [String: Any] else {
            log.error("external display message refused")
            return
        }
        switch message["type"] as? String {
        case "place":
            lastPlace = message
            deliver(message)
        case "trackpad", "screen", "screen-edge":
            NotificationCenter.default.post(name: .externalDisplayPageMessage, object: nil, userInfo: message)
        case "change", "frame", "known", "scope", "scope-end", "tool-result", "native-result", "native-push", "molecule-result":
            // An Atome this page committed, or a frame of its gesture, for the screen's page to show at once
            // (external_display_changes.js); or the result of a tool this page ran for it (external_display_tools.js);
            // or the answer, then the events, of a native capture this page runs for it (external_display_native.js).
            deliver(message)
        default:
            log.error("external display message refused")
        }
    }

    func attach(follower webView: WKWebView, takesInput: Bool = false) {
        follower = webView
        followerTakesInput = takesInput
    }

    func detach() {
        follower = nil
        followerTakesInput = false
    }

    /// That page gone, if it is still the one followed.
    func detach(follower webView: WKWebView) {
        if follower === webView { detach() }
    }

    /// The screen's page asks where the device is (its `hello`, once it follows), or for the device's keyboard.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.followerHandlerName, let body = message.body as? [String: Any] else { return }
        switch body["type"] as? String {
        case "hello":
            if let lastPlace { deliver(lastPlace) }
        case "keyboard":
            if !followerTakesInput { NotificationCenter.default.post(name: .externalDisplayKeyboard, object: nil, userInfo: body) }
        case "change", "frame", "known", "tool", "native", "place-intent", "molecule":
            // An Atome the screen's page committed, or a frame of its gesture, for the app's page to show at once; or a tool
            // it cannot run (a capture: it has no camera nor microphone), for the app's page to run: the two pages of one app
            // need no server between them (user, 20 Nov. 2026). Or a native capture command, which the app's page runs
            // on its own native side, the one owner of the camera, the microphone and the recognizer (external_display_native.js).
            deliver(body, to: WebViewManager.webView)
        default:
            break
        }
    }

    /// A key typed on the device for the screen's page (application/ExternalDisplayKeyboard.swift).
    func type(_ key: [String: Any]) {
        guard let follower,
              let data = try? JSONSerialization.data(withJSONObject: key),
              let json = String(data: data, encoding: .utf8) else { return }
        follower.evaluateJavaScript("window.__eveExternalDisplayKeyboard?.(\(json));", completionHandler: nil)
    }

    private func deliver(_ message: [String: Any], to target: WKWebView? = nil) {
        guard let page = target ?? follower,
              let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        page.evaluateJavaScript("window.__eveExternalDisplayReceive?.(\(json));") { [log] _, error in
            if let error { log.error("external display place not delivered: \(error.localizedDescription)") }
        }
    }
}
