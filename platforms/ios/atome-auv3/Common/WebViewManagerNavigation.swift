import Foundation
import WebKit
import OSLog

extension WebViewManager {
    // The page reaches the local server (its offline backend) on this port.
    static func announceLocalHTTPPort(_ port: UInt16, to target: WKWebView? = nil) {
        let js = """
        window.__ATOME_LOCAL_HTTP_PORT__=\(port);
        window.ATOME_LOCAL_HTTP_PORT=\(port);
        window.__LOCAL_HTTP_PORT=\(port);
        window.__SQUIRREL_TAURI_LOCAL_PORT__=\(port);
        try { window.dispatchEvent(new CustomEvent('local-server-ready')); } catch(e) {}
        """
        DispatchQueue.main.async { (target ?? WebViewManager.webView)?.evaluateJavaScript(js, completionHandler: nil) }
    }

    // MARK: - WKUIDelegate (media capture)

    // WebKit shows its own per-origin permission prompt on top of the AVFoundation
    // system prompt when the page calls `navigator.mediaDevices.getUserMedia`.
    // We grant immediately: AVFoundation already enforces the underlying iOS
    // permission (driven by Info.plist NSCameraUsageDescription /
    // NSMicrophoneUsageDescription). Without this delegate the user would see
    // a duplicate WebKit dialog whose dismissal is decoupled from the gesture
    // that triggered the request.
    @available(iOS 15.0, *)
    public func webView(_ webView: WKWebView,
                        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                        initiatedByFrame frame: WKFrameInfo,
                        type: WKMediaCaptureType,
                        decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if !Bundle.main.bundlePath.hasSuffix(".appex") {
            WebViewManager.publishSafeAreaViewport(for: webView)
        }
    }

    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        WebViewManager.markBootMilestone("navigation_started")
        WebViewManager.markPageLoading()
        // A new page claims a new health channel; observers of the old page stop.
        AppNativeHealthController.shared.pageWillLoad()
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // Only run full initialization on the real app page (ignore placeholder page)
    guard let last = webView.url?.lastPathComponent, last == "index.html" else { return }
    WebViewManager.markBootMilestone("navigation_finished")
    WebViewManager.markPageReady()
    log.debug("didFinish; frame=\(String(describing: webView.frame.debugDescription)) bounds=\(String(describing: webView.bounds.debugDescription))")
        // Keep post-navigation work limited to product initialization. The
        // historical red-div smoke-test IPC must never run in an installed app.
        if FeatureFlags.startLocalHTTPServer, let p = LocalHTTPServer.shared.port {
            WebViewManager.announceLocalHTTPPort(p, to: webView)
        }
    // Inject AUv3 / App context flag early for JS platform detection
    let isExtension: Bool = Bundle.main.bundlePath.hasSuffix(".appex")
    if !isExtension { WebViewManager.publishSafeAreaViewport(for: webView) }
    if isExtension {
        FileSyncCoordinator.shared.setWebViewReady(true)
    }
    let auv3JS = "window.__AUV3_MODE__=" + (isExtension ? "true" : "false") + ";"
    webView.evaluateJavaScript(auv3JS, completionHandler: nil)
    // Inject notch information & class
        let topInset = webView.safeAreaInsets.top
        let hasNotch = UIDevice.current.userInterfaceIdiom == .phone && topInset >= 44
        let notchJS = "window.__HAS_NOTCH__=\(hasNotch ? "true" : "false");(function(){try{if(window.__HAS_NOTCH__){document.documentElement.classList.add('has-notch');}else{document.documentElement.classList.remove('has-notch');} if(window.updateSafeAreaLayout){window.updateSafeAreaLayout();}}catch(e){}})();"
        webView.evaluateJavaScript(notchJS, completionHandler: nil)
        // Auto-restore entitlements to sync JS UI after load (App only; AUv3 can't present auth UI)
        if FeatureFlags.sendPurchaseRestoreOnDidFinish && !isExtension {
            if #available(iOS 15.0, *) {
                Task { await PurchaseManager.shared.restore(requestId: Int(Date().timeIntervalSince1970)) }
            }
        }
    }

    // iOS reclaims the web content of a backgrounded app under memory pressure: a
    // page that had been presented is booted again by its host. A page that never
    // reached its presentation stays on the failure surface, so a page that cannot
    // boot is not reloaded in a loop.
    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let presented = WebViewManager.bootPresented
        WebViewManager.markPageLoading()
        if presented, let reload = WebViewManager.presentedPageTerminationHandler {
            log.error("WebContent terminated after presentation; reloading")
            reload()
            return
        }
        log.error("WebContent terminated before presentation; no automatic reload")
        WebViewManager.reportBootFailure(reason: "web_content_terminated")
    }
}
