import Foundation
import WebKit
import OSLog

enum TargetMode {
    case app
    case auv3
}

final class WKWebViewFactory {
    static let shared = WKWebViewFactory()

    private let log = Logger(subsystem: "atome", category: "WKWebViewFactory")

    private init() {}

    func createWebView(frame: CGRect, mode: TargetMode) -> WKWebView {
        dispatchPrecondition(condition: .onQueue(DispatchQueue.main))
        let config = WKWebViewConfiguration()
        if #available(iOS 11.0, *) {
            // Align AUv3 with companion app so DOM storage survives host relaunches
            config.websiteDataStore = .default()
        }
        if FeatureFlags.registerCustomScheme {
            config.setURLSchemeHandler(AudioSchemeHandler(), forURLScheme: "atome")
        }
        config.allowsInlineMediaPlayback = true
        if #available(iOS 10.0, *) { config.mediaTypesRequiringUserActionForPlayback = [.audio] }

        let webView = WKWebView(frame: frame, configuration: config)
        // FIX: Set isOpaque to true to prevent rendering artifacts/black screens in AUv3
        // especially when multiple instances are loaded.
        // The product draws its own context menu. The native long-press link preview
        // is the one WebKit affordance CSS and `preventDefault` cannot reach, so it
        // is turned off at the view.
        webView.allowsLinkPreview = false
        webView.isOpaque = true
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        // Debug builds only: without this, iOS 16.4+ exposes no remote inspector,
        // so Safari Web Inspector and the XCUITest WEBVIEW context cannot reach
        // the running page. Release builds stay non-inspectable.
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        log.info("Created WKWebView; mode=\(String(describing: mode)) frame=\(String(describing: frame.debugDescription))")
        return webView
    }
}
