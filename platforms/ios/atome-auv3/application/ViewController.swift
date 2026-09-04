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
    private let bootOverlay = UIView()
    private let bootStatusLabel = UILabel()
    private let bootRetryButton = UIButton(type: .system)

    override func loadView() {
        WebViewManager.markBootMilestone("view_load_started")
        let root = UIView(frame: UIScreen.main.bounds)
        root.backgroundColor = .black
        root.isOpaque = true
        view = root

        let config = WKWebViewConfiguration()
        let userContentController = config.userContentController
        if #available(iOS 11.0, *) {
            config.websiteDataStore = .default()
        }
        if FeatureFlags.registerCustomScheme {
            config.setURLSchemeHandler(AudioSchemeHandler(), forURLScheme: "atome")
        }
        config.allowsInlineMediaPlayback = true
        if #available(iOS 10.0, *) {
            config.mediaTypesRequiringUserActionForPlayback = [.audio]
        }
        let paintBlack = "(function(){try{var d=document; if(d.documentElement){d.documentElement.style.background='#000';d.documentElement.style.color='#ccc';} if(d.body){d.body.style.background='#000';d.body.style.color='#ccc';}}catch(e){}})();"
        let preScript = WKUserScript(
            source: paintBlack,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        userContentController.addUserScript(preScript)
        config.setValue(false, forKey: "drawsBackground")
        webView = WKWebView(frame: root.bounds, configuration: config)
        WebViewManager.markBootMilestone("webview_created")
        // Same rule as the AUv3 factory: no native long-press link preview, the
        // product owns every context menu.
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = .clear
        }
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(webView)
        let guide = root.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: guide.trailingAnchor)
        ])
        installBootOverlay(in: root)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        WebViewManager.installBootPresentationHandlers(
            onReady: { [weak self] _ in self?.hideBootOverlay() },
            onFailure: { [weak self] reason, _ in self?.showBootFailure(reason: reason) }
        )
        WebViewManager.startBootWatchdog()
        WebViewManager.setNativeInvokeHandler { command, payload, completion in
            if AppNativeMediaCaptureController.canHandle(command: command) {
                AppNativeMediaCaptureController.shared.handle(
                    command: command,
                    payload: payload,
                    completion: completion
                )
            } else if AppNativeHealthController.canHandle(command: command) {
                AppNativeHealthController.shared.handle(command: command, payload: payload, completion: completion)
            } else if AppNativeBevyRendererController.canHandle(command: command) {
                AppNativeBevyRendererController.shared.handle(
                    command: command,
                    payload: payload,
                    completion: completion
                )
            } else {
                AppNativeAudioController.shared.handle(
                    command: command,
                    payload: payload,
                    completion: completion
                )
            }
        }
        AppNativeMediaCaptureController.shared.attachPreviewHost(webView: webView)
        AppNativeHealthController.shared.attach(webView: webView)
        view.insetsLayoutMarginsFromSafeArea = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.contentInset = .zero
        webView.scrollView.verticalScrollIndicatorInsets = .zero
        webView.scrollView.horizontalScrollIndicatorInsets = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        WebViewManager.setupWebView(for: webView)
        injectFullscreenFixJS()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        WebViewManager.triggerMainLoadNow()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        [.bottom, .left, .right, .top]
    }

    private func injectFullscreenFixJS() {
        let javaScript = """
        (function(){
          try {
            var de = document.documentElement, b = document.body;
            if (de){ de.style.margin='0'; de.style.padding='0'; de.style.width='100%'; de.style.height='100%'; }
            if (b){ b.style.margin='0'; b.style.padding='0'; b.style.width='100%'; b.style.height='100%'; b.style.overflow='hidden'; }
            window.dispatchEvent(new Event('resize'));
          } catch(e) { console.log('fullscreen fix error', e); }
        })();
        """
        WebViewManager.evaluateJS(
            javaScript,
            label: "fullscreenFix",
            targetWebView: webView
        )
    }

    private func installBootOverlay(in root: UIView) {
        bootOverlay.translatesAutoresizingMaskIntoConstraints = false
        bootOverlay.backgroundColor = .black
        bootOverlay.isOpaque = true

        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.translatesAutoresizingMaskIntoConstraints = false
        logo.contentMode = .scaleAspectFit

        bootStatusLabel.translatesAutoresizingMaskIntoConstraints = false
        bootStatusLabel.text = "Ouverture…"
        bootStatusLabel.textColor = UIColor(white: 0.65, alpha: 1)
        bootStatusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        bootStatusLabel.textAlignment = .center
        bootStatusLabel.numberOfLines = 0

        bootRetryButton.translatesAutoresizingMaskIntoConstraints = false
        bootRetryButton.setTitle("Réessayer", for: .normal)
        bootRetryButton.tintColor = UIColor(red: 0.79, green: 0.05, blue: 0.49, alpha: 1)
        bootRetryButton.isHidden = true
        bootRetryButton.addTarget(self, action: #selector(retryBoot), for: .touchUpInside)

        root.addSubview(bootOverlay)
        bootOverlay.addSubview(logo)
        bootOverlay.addSubview(bootStatusLabel)
        bootOverlay.addSubview(bootRetryButton)
        NSLayoutConstraint.activate([
            bootOverlay.topAnchor.constraint(equalTo: root.topAnchor),
            bootOverlay.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            bootOverlay.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            bootOverlay.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            logo.centerXAnchor.constraint(equalTo: bootOverlay.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: bootOverlay.centerYAnchor, constant: -30),
            logo.widthAnchor.constraint(equalToConstant: 160),
            logo.heightAnchor.constraint(equalToConstant: 160),
            bootStatusLabel.topAnchor.constraint(equalTo: logo.bottomAnchor, constant: 18),
            bootStatusLabel.leadingAnchor.constraint(greaterThanOrEqualTo: bootOverlay.leadingAnchor, constant: 24),
            bootStatusLabel.trailingAnchor.constraint(lessThanOrEqualTo: bootOverlay.trailingAnchor, constant: -24),
            bootStatusLabel.centerXAnchor.constraint(equalTo: bootOverlay.centerXAnchor),
            bootRetryButton.topAnchor.constraint(equalTo: bootStatusLabel.bottomAnchor, constant: 14),
            bootRetryButton.centerXAnchor.constraint(equalTo: bootOverlay.centerXAnchor)
        ])
    }

    private func hideBootOverlay() {
        guard !bootOverlay.isHidden else { return }
        UIView.animate(withDuration: 0.16, delay: 0, options: [.curveEaseOut]) {
            self.bootOverlay.alpha = 0
        } completion: { _ in
            self.bootOverlay.isHidden = true
        }
    }

    private func showBootFailure(reason: String) {
        bootOverlay.layer.removeAllAnimations()
        bootOverlay.alpha = 1
        bootOverlay.isHidden = false
        bootStatusLabel.text = reason == "web_content_terminated"
            ? "Le moteur d’affichage s’est arrêté."
            : "Le démarrage prend trop de temps."
        bootRetryButton.isHidden = false
    }

    @objc private func retryBoot() {
        bootStatusLabel.text = "Nouvelle tentative…"
        bootRetryButton.isHidden = true
        WebViewManager.retryMainPageAfterUserRequest()
    }
}

struct WebViewContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> FullscreenWebViewController {
        FullscreenWebViewController()
    }

    func updateUIViewController(_ controller: FullscreenWebViewController, context: Context) {}
}
