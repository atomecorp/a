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
        let guide = root.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: guide.trailingAnchor)
        ])

        // Immediate placeholder (matches one added later in WebViewManager but ensures something black exists NOW)
                // Inline SVG logo (atome.svg simplified) to avoid needing asset load; tiny size impact acceptable
                let svgLogo = """
                <svg id=atome width=160 height=160 viewBox='0 0 237 237' xmlns='http://www.w3.org/2000/svg'>
                    <g transform='matrix(0.0267056 0 0 0.0267056 18.6376 20.2376)'>
                        <g transform='matrix(4.16667 0 0 4.16667 -377.307 105.632)'>
                            <path d='M629.175,81.832C740.508,190.188 742.921,368.28 634.565,479.613C526.209,590.945 348.116,593.358 236.784,485.002C125.451,376.646 123.038,198.554 231.394,87.221C339.75,-24.111 517.843,-26.524 629.175,81.832Z' fill='#C90C7D'/>
                        </g>
                        <g transform='matrix(4.16667 0 0 4.16667 -377.307 105.632)'>
                            <path d='M1679.33,410.731C1503.98,413.882 1402.52,565.418 1402.72,691.803C1402.91,818.107 1486.13,846.234 1498.35,1056.78C1501.76,1313.32 1173.12,1490.47 987.025,1492.89C257.861,1502.39 73.275,904.061 71.639,735.381C70.841,653.675 1.164,647.648 2.788,737.449C12.787,1291.4 456.109,1712.79 989.247,1706.24C1570.67,1699.09 1982.31,1234 1965.76,683.236C1961.3,534.95 1835.31,407.931 1679.33,410.731Z' fill='#C90C7D'/>
                        </g>
                    </g>
                </svg>
                """.replacingOccurrences(of: "\n", with: "")
                let placeholder = "<!doctype html><html style='background:#000;height:100%'><head><meta name=viewport content='initial-scale=1,viewport-fit=cover'><style>body{margin:0;display:flex;align-items:center;justify-content:center;background:#000;} .fade-in{opacity:0;animation:f .6s ease-out forwards .05s}@keyframes f{to{opacity:1}}</style></head><body>" + svgLogo + "</body></html>"
        webView.loadHTMLString(placeholder, baseURL: nil)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
    view.insetsLayoutMarginsFromSafeArea = true
    webView.scrollView.contentInsetAdjustmentBehavior = .automatic
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
    // AutoLayout drives sizing; no manual frame override
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { self.logWindowMetrics(stage: "viewDidAppear+50ms") }
        logWindowMetrics(stage: "viewDidAppear")
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
    // Use default safe area; no forced zeroing
        debugLogInsets(stage: "viewSafeAreaInsetsDidChange")
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
    // AutoLayout manages frame; avoid manual overrides
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



