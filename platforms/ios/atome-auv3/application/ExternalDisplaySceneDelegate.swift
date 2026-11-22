import OSLog
import UIKit
import WebKit

/// A connected screen (HDMI, USB-C, AirPlay; R-212, contract validated by the user, 17 Nov. 2026): iOS gives the
/// app a scene of its own for it (`UIWindowSceneSessionRoleExternalDisplayNonInteractive`, Info.plist; from iOS 27
/// the registration in ViewController.swift#registerExternalDisplay) instead of mirroring the device with black
/// bands. It shows the follower page (`?display=follower`, eVe/domains/rendering/external_display_follower.js): a
/// second view of the same document at that screen's own size, a workspace too (user, 19 Nov. 2026: « c'est
/// bidirectionnel »): iOS gives this scene no input, so an iPhone's mouse reaches it through the app
/// (ExternalDisplayPointer). Silent. The screen gone, the scene goes; the app's page goes on unchanged.
final class ExternalDisplaySceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var bridge: ExternalDisplayFollowerBridge?
    static let followerURL = URL(string: "atome:///src/index.html?display=follower")

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene, let url = Self.followerURL else { return }
        let bridge = ExternalDisplayFollowerBridge()
        let webView = Self.makeFollowerWebView(frame: windowScene.screen.bounds, bridge: bridge)
        bridge.webView = webView
        webView.navigationDelegate = bridge
        self.bridge = bridge
        print("[external_display] screen connected \(Int(windowScene.screen.bounds.width))x\(Int(windowScene.screen.bounds.height))")
        let controller = UIViewController()
        controller.view = webView
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = controller
        window.isHidden = false
        self.window = window
        ExternalDisplayRelay.shared.attach(follower: webView)
        ExternalDisplayPointer.shared.attach(display: webView)
        webView.load(URLRequest(url: url))
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        print("[external_display] screen disconnected")
        ExternalDisplayRelay.shared.detach()
        ExternalDisplayPointer.shared.detachDisplay()
        if let webView = window?.rootViewController?.view as? WKWebView { Self.releaseFollowerWebView(webView) }
        bridge = nil
        window = nil
    }

    // The same page store, scheme and startup script as the app's page (AppPageHost.swift,
    // WebViewManager.pageStartupScript): without the local server's port and the native invoke bridge the page
    // reaches no data and no session, and the screen stays grey. Its native side is its own, read only
    // (ExternalDisplayFollowerBridge). It is marked as relayed before it loads, and says hello through its handler.
    // `interactive`: shown in a window of the app's own (an iPad with Stage Manager, ExternalDisplayFollowWindow.swift),
    // it takes its own input; on a connected screen's scene iOS gives it none.
    static func makeFollowerWebView(frame: CGRect, bridge: ExternalDisplayFollowerBridge, interactive: Bool = false) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        if FeatureFlags.registerCustomScheme {
            config.setURLSchemeHandler(AudioSchemeHandler(), forURLScheme: "atome")
        }
        config.allowsInlineMediaPlayback = true
        // As on the app's page (AppPageHost.swift): media asked for (TV, YouTube) starts with sound. This page's taps
        // are relayed, not trusted gestures (external_display_pointer.js): a media waiting for one would never start.
        config.mediaTypesRequiringUserActionForPlayback = []
        let controller = config.userContentController
        controller.addUserScript(WKUserScript(
            source: WebViewManager.pageStartupScript(isExtension: false),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        controller.addUserScript(WKUserScript(
            source: "window.__eveExternalDisplayRelay = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        for name in ExternalDisplayFollowerBridge.handlerNames { controller.add(bridge, name: name) }
        controller.add(ExternalDisplayRelay.shared, name: ExternalDisplayRelay.followerHandlerName)
        let webView = WKWebView(frame: frame, configuration: config)
        if #available(iOS 16.4, *) {
            webView.isInspectable = FeatureFlags.webInspectorEnabled
        }
        webView.isOpaque = true
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isUserInteractionEnabled = interactive
        return webView
    }

    /// The screen's page gone: it stops, and its handlers (which hold its bridge and the relay) are let go.
    static func releaseFollowerWebView(_ webView: WKWebView) {
        webView.stopLoading()
        for name in ExternalDisplayFollowerBridge.handlerNames + [ExternalDisplayRelay.followerHandlerName] {
            webView.configuration.userContentController.removeScriptMessageHandler(forName: name)
        }
    }
}

/// The native side of the connected screen's page. It may read what the app's page reads at boot (its session
/// through the local server, the device key, the last workspace), never more: a command that takes a pending
/// link, writes, plays or captures belongs to the app's page and is refused with an explicit error. Answers go
/// back to this page's web view, never to the app's. Its console goes to the device log and to stdout.
final class ExternalDisplayFollowerBridge: NSObject, WKScriptMessageHandler {
    static let handlerNames = ["console", "swiftBridge"]
    static let readCommands: Set<String> = ["auth_device_key", "auth_local_request", "workspace_resume_read"]
    /// The session actions of auth_local_request the screen may send (auth_methods_login.js#localRequest): find the
    /// app's session and resume it. Locking it or linking a device would act on the app's own session.
    static let sessionActions: Set<String> = ["local-session-describe", "local-session-challenge", "local-session-resume"]
    weak var webView: WKWebView?
    private let log = Logger(subsystem: "atome", category: "ExternalDisplay")

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "console":
            let text = (message.body as? [String: Any])?["message"] as? String ?? String(describing: message.body)
            let line = String(text.prefix(2000))
            log.notice("[follower] \(line, privacy: .public)")
            // Also on stdout: `devicectl device process launch --console` brings it to the Mac (no log stream there).
            print("[follower] \(line)")
        case "swiftBridge":
            guard let body = message.body as? [String: Any], body["action"] as? String == "nativeInvoke" else { return }
            let source = message.frameInfo.request.url
            let bundledPage = message.frameInfo.isMainFrame && source?.scheme == "atome" && source?.host == nil
                && source?.path == "/src/index.html"
            invoke(body, bundledPage: bundledPage)
        default:
            return
        }
    }

    private func invoke(_ body: [String: Any], bundledPage: Bool) {
        let requestId = body["requestId"] as? String ?? ""
        let command = body["command"] as? String ?? ""
        let payload = body["payload"] as? [String: Any] ?? [:]
        guard !requestId.isEmpty else { return }
        guard bundledPage else {
            resolve(requestId, nil, "auth_device_origin_invalid")
            return
        }
        // A web page or a service's page opened on the screen shows in the screen's window, laid by the native owner
        // the app's page uses (AppNativeStreamingView.swift) behind this page's own canvas cut-out (R-212, user,
        // 20 Nov. 2026: « quand on affiche un site web… vérifié aussi sur le second moniteur »). One such page at a
        // time: opening it on one screen closes it on the other (Common/AtomeStreamingView.m).
        if AppNativeStreamingView.canHandle(command: command) {
            guard let webView else { resolve(requestId, nil, "streaming_view_host_missing"); return }
            AppNativeStreamingView.shared.handle(command: command, payload: payload, host: webView) { [weak self] response, error in
                self?.resolve(requestId, response, error)
            }
            return
        }
        let action = payload["action"] as? String ?? ""
        guard Self.readCommands.contains(command),
              command != "auth_local_request" || Self.sessionActions.contains(action) else {
            let refused = command == "auth_local_request" ? "\(command).\(action)" : command
            log.error("external display follower refused \(refused, privacy: .public)")
            print("[follower] refused \(refused)")
            resolve(requestId, nil, "external_display_follower_refused:\(refused)")
            return
        }
        switch command {
        case "auth_device_key":
            AuthDeviceKey.handle(payload) { [weak self] response, error in self?.resolve(requestId, response, error) }
        case "auth_local_request":
            var frame = payload
            frame["type"] = "auth"
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                let answer = LocalServer.shared.answer(frame)
                DispatchQueue.main.async { self?.resolve(requestId, answer, nil) }
            }
        default:
            AppWorkspaceResume.shared.handle(command: command, payload: payload) { [weak self] response, error in
                self?.resolve(requestId, response, error)
            }
        }
    }

    private func resolve(_ requestId: String, _ payload: [String: Any]?, _ error: String?) {
        let literal: (Any) -> String? = { value in
            (try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]))
                .flatMap { String(data: $0, encoding: .utf8) }
        }
        guard let webView, let request = literal(requestId) else { return }
        let payloadText = payload.flatMap { literal($0) } ?? "null"
        let errorText = error.flatMap { literal($0) } ?? "null"
        let script = "window.__ATOME_NATIVE_INVOKE_RESOLVE(\(request), \(payloadText), \(errorText));"
        DispatchQueue.main.async { [log] in
            webView.evaluateJavaScript(script) { _, failure in
                if let failure { log.error("external display follower answer not delivered: \(failure.localizedDescription, privacy: .public)") }
            }
        }
    }
}

/// Why the screen's page started again, in the device log: its web content process ended (memory, a crash) and the page
/// is loaded anew rather than left blank on the screen.
extension ExternalDisplayFollowerBridge: WKNavigationDelegate {
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        print("[external_display] screen page process ended: reloading")
        webView.reload()
    }
}
