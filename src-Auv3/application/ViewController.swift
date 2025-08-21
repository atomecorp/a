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
    override func viewDidLoad() {
        super.viewDidLoad()
    view.insetsLayoutMarginsFromSafeArea = false
    edgesForExtendedLayout = [.top, .bottom, .left, .right]
    extendedLayoutIncludesOpaqueBars = true
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        // Use layout guides + a fallback manual sizing pass to guarantee fill
        let constraints = [
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ]
        constraints.forEach { $0.priority = .required; $0.isActive = true }
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.verticalScrollIndicatorInsets = .zero
        webView.scrollView.horizontalScrollIndicatorInsets = .zero
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        webView.isOpaque = false
        webView.backgroundColor = .black
        view.backgroundColor = .black
        WebViewManager.setupWebView(for: webView)
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



