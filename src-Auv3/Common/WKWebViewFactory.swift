import Foundation
import WebKit
import OSLog

enum TargetMode {
    case app
    case auv3
}

final class WKWebViewFactory {
    static let shared = WKWebViewFactory()

    // One process pool per process to avoid relaunches/contention
    private let processPool = WKProcessPool()
    static var sharedProcessPool: WKProcessPool { shared.processPool }

    private let log = Logger(subsystem: "atome", category: "WKWebViewFactory")

    private init() {}

    func createWebView(frame: CGRect, mode: TargetMode) -> WKWebView {
        dispatchPrecondition(condition: .onQueue(DispatchQueue.main))
        let config = WKWebViewConfiguration()
        config.processPool = processPool
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
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        let poolPtr = Unmanaged.passUnretained(processPool).toOpaque()
        log.info("Created WKWebView; mode=\(String(describing: mode)) pool=\(String(describing: poolPtr)) frame=\(String(describing: frame.debugDescription))")
        return webView
    }
}
