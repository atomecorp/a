import Foundation
import WebKit
import OSLog

extension WebViewManager {
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

    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        WebViewManager.markPageLoading()
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // Only run full initialization on the real app page (ignore placeholder page)
    guard let last = webView.url?.lastPathComponent, last == "index.html" else { return }
    WebViewManager.markPageReady()
    log.debug("didFinish; frame=\(String(describing: webView.frame.debugDescription)) bounds=\(String(describing: webView.bounds.debugDescription))")
        // Silent page loading for performance
        WebViewManager.sendToJS("test", "creerDivRouge")
        // Simplified initialization
        if FeatureFlags.startLocalHTTPServer {
            if let p = LocalHTTPServer.shared.port {
                let js = """
                window.__ATOME_LOCAL_HTTP_PORT__=\(p);
                window.ATOME_LOCAL_HTTP_PORT=\(p);
                window.__LOCAL_HTTP_PORT=\(p);
                window.__SQUIRREL_TAURI_LOCAL_PORT__=\(p);
                try { window.dispatchEvent(new CustomEvent('local-server-ready')); } catch(e) {}
                """
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    // Inject AUv3 / App context flag early for JS platform detection
    let isExtension: Bool = Bundle.main.bundlePath.hasSuffix(".appex")
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

    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        WebViewManager.markPageLoading()
        guard FeatureFlags.centralTerminationRetry else { return }
        log.error("WebContent terminated; retryCount=\(self.terminateRetryCount)")
        let backoff = pow(2.0, Double(terminateRetryCount)) * 0.2
        DispatchQueue.main.asyncAfter(deadline: .now() + backoff) { [weak self, weak webView] in
            guard let self = self, let wv = webView else { return }
            if self.terminateRetryCount >= 1 {
                self.log.error("Max retries reached; stopping reload attempts")
                return
            }
            self.terminateRetryCount += 1
            if wv.url != nil {
                self.log.info("Retry reload() after termination; backoff=\(backoff)")
                wv.reload()
            } else {
                if FeatureFlags.registerCustomScheme, let entry = URL(string: "atome:///src/index.html") {
                    self.log.info("Retry load atome:///src/index.html after termination; backoff=\(backoff)")
                    wv.load(URLRequest(url: entry))
                } else if let fileURL = Bundle.main.url(forResource: "src/index", withExtension: "html") {
                    self.log.info("Retry load file src/index.html after termination; backoff=\(backoff)")
                    wv.loadFileURL(fileURL, allowingReadAccessTo: Bundle.main.bundleURL)
                } else if let entry = URL(string: "atome:///src/index.html") {
                    self.log.info("Retry fallback atome:///src/index.html after termination; backoff=\(backoff)")
                    wv.load(URLRequest(url: entry))
                }
            }
        }
    }
}
