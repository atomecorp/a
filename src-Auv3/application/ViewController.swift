//
//  Aatome.swift
//  application
//
//  Created by jeezs on 26/04/2022.
//

import SwiftUI
import WebKit

final class FullscreenWebViewController: UIViewController {
    private(set) var webView: WKWebView!

    // Build the entire hierarchy as early as possible to avoid any interim white frame
    override func loadView() {
        // Root view explicit black
        let root = UIView(frame: UIScreen.main.bounds)
        root.backgroundColor = .black
        root.isOpaque = true
        self.view = root

        // Configure WKWebView with earliest possible black styling
        let config = WKWebViewConfiguration()
        let ucc = config.userContentController
        // Ultra-early user script painting html/body black BEFORE any content
        let paintBlack = "(function(){try{var d=document; if(d.documentElement){d.documentElement.style.background='#000';d.documentElement.style.color='#ccc';} if(d.body){d.body.style.background='#000';d.body.style.color='#ccc';}}catch(e){}})();"
        let preScript = WKUserScript(source: paintBlack, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        ucc.addUserScript(preScript)
        // Avoid background flashes (private-ish key, safe usage)
        config.setValue(false, forKey: "drawsBackground")
        webView = WKWebView(frame: root.bounds, configuration: config)
        webView.isOpaque = false
        if #available(iOS 15.0, *) { webView.underPageBackgroundColor = .black }
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: root.topAnchor),
            webView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: root.trailingAnchor)
        ])

        // Immediate placeholder (matches one added later in WebViewManager but ensures something black exists NOW)
        let placeholder = "<!doctype html><html style='background:#000;height:100%'><head><meta name=viewport content='initial-scale=1,viewport-fit=cover'></head><body style='margin:0;background:#000;display:flex;align-items:center;justify-content:center;font-family:-apple-system;color:#555;font-size:12px;letter-spacing:.08em'>Loading…</body></html>"
        webView.loadHTMLString(placeholder, baseURL: nil)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.insetsLayoutMarginsFromSafeArea = false
        edgesForExtendedLayout = [.top, .bottom, .left, .right]
        extendedLayoutIncludesOpaqueBars = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.verticalScrollIndicatorInsets = .zero
        webView.scrollView.horizontalScrollIndicatorInsets = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        // Delay setup to next runloop so placeholder paint is committed first
        DispatchQueue.main.async { WebViewManager.setupWebView(for: self.webView) }
        injectFullscreenFixJS()
        logWindowMetrics(stage: "viewDidLoad")
    }
    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom, .left, .right, .top] }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Reassert frame if SwiftUI re-wrapped with padding later
        webView.frame = view.bounds
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { self.webView.frame = self.view.bounds; self.logWindowMetrics(stage: "viewDidAppear+50ms") }
        logWindowMetrics(stage: "viewDidAppear")
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        // Force zero additional safe area
        additionalSafeAreaInsets = .zero
        debugLogInsets(stage: "viewSafeAreaInsetsDidChange")
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Fallback: ensure frame exactly matches bounds (in case AutoLayout or SwiftUI applied padding)
        if webView.frame != view.bounds { webView.frame = view.bounds }
    logWindowMetrics(stage: "viewDidLayoutSubviews")
    }

    private func debugLogInsets(stage: String) {
        #if DEBUG
        let i = view.safeAreaInsets
        print("📐 WebView Insets [\(stage)]: top=\(i.top) left=\(i.left) bottom=\(i.bottom) right=\(i.right) frame=\(view.frame) bounds=\(view.bounds)")
        #endif
    }

    private func logWindowMetrics(stage: String) {
#if DEBUG
        if let win = view.window {
            print("🪟 WindowMetrics [\(stage)]: windowFrame=\(win.frame) screenBounds=\(UIScreen.main.bounds) webViewFrame=\(webView.frame)")
        } else {
            print("🪟 WindowMetrics [\(stage)]: window=nil screen=\(UIScreen.main.bounds) webViewFrame=\(webView.frame)")
        }
#endif
    }

    private func injectFullscreenFixJS() {
        let js = """
        (function(){
          try {
            var de = document.documentElement, b = document.body;
            if (de){ de.style.margin='0'; de.style.padding='0'; de.style.width='100%'; de.style.height='100%'; }
            if (b){ b.style.margin='0'; b.style.padding='0'; b.style.width='100%'; b.style.height='100%'; b.style.overflow='hidden'; }
            // Force resize observer to adapt JS layout libraries if they cached size
            window.dispatchEvent(new Event('resize'));
          } catch(e) { console.log('fullscreen fix error', e); }
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

struct WebViewContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> FullscreenWebViewController { FullscreenWebViewController() }
    func updateUIViewController(_ controller: FullscreenWebViewController, context: Context) {}
}



