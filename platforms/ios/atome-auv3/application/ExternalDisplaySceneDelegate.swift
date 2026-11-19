import UIKit
import WebKit

/// A connected screen (HDMI, USB-C, AirPlay; R-212, contract validated by the user, 17 Nov. 2026): iOS gives the
/// app a scene of its own for it (`UIWindowSceneSessionRoleExternalDisplayNonInteractive`, Info.plist) instead of
/// mirroring the device with black bands. It shows the follower page (`?display=follower`,
/// eVe/domains/rendering/external_display_follower.js): a second view of the same document at that screen's own
/// size, no tools, read only, silent. The screen gone, the scene goes; the app's page goes on unchanged.
final class ExternalDisplaySceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private static let followerURL = URL(string: "atome:///src/index.html?display=follower")

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene, let url = Self.followerURL else { return }
        let webView = Self.makeFollowerWebView(frame: windowScene.screen.bounds)
        let controller = UIViewController()
        controller.view = webView
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = controller
        window.isHidden = false
        self.window = window
        ExternalDisplayRelay.shared.attach(follower: webView)
        webView.load(URLRequest(url: url))
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        ExternalDisplayRelay.shared.detach()
        (window?.rootViewController?.view as? WKWebView)?.stopLoading()
        window = nil
    }

    // The same page store and scheme as the app's page (AppPageHost.swift), none of its native bridges: this page
    // only looks. It is marked as relayed before it loads, and says hello through its own handler.
    private static func makeFollowerWebView(frame: CGRect) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        if FeatureFlags.registerCustomScheme {
            config.setURLSchemeHandler(AudioSchemeHandler(), forURLScheme: "atome")
        }
        config.allowsInlineMediaPlayback = true
        config.userContentController.addUserScript(WKUserScript(
            source: "window.__eveExternalDisplayRelay = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.userContentController.add(ExternalDisplayRelay.shared, name: ExternalDisplayRelay.followerHandlerName)
        let webView = WKWebView(frame: frame, configuration: config)
        webView.isOpaque = true
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isUserInteractionEnabled = false
        return webView
    }
}
