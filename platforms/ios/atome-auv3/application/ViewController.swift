//
//  Aatome.swift
//  application
//
//  Created by jeezs on 26/04/2022.
//

import SwiftUI
import WebKit

final class FullscreenWebViewController: UIViewController {
    private let bootBackgroundColor = UIColor(named: "LaunchBackground")!
    private(set) var webView: WKWebView!
    private let bootOverlay = UIView()
    private let bootLogo = UIImageView(image: UIImage(named: "LaunchLogo"))
    private let bootStatusLabel = UILabel()
    private let bootRetryButton = UIButton(type: .system)

    override func loadView() {
        WebViewManager.markBootMilestone("view_load_started")
        let root = UIView(frame: UIScreen.main.bounds)
        root.backgroundColor = .black
        root.isOpaque = true
        view = root

        // The page belongs to the app, not to this window: a CarPlay launch may
        // already have booted it.
        webView = AppPageHost.shared.webView
        webView.frame = root.bounds
        webView.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: root.topAnchor),
            webView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: root.trailingAnchor)
        ])
        installBootOverlay(in: root)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        WebViewManager.installBootPresentationHandlers(
            onReady: { [weak self] _ in self?.hideBootOverlay() },
            onFailure: { [weak self] reason, _ in self?.showBootFailure(reason: reason) },
            onRestart: { [weak self] in self?.showBootOverlay() }
        )
        WebViewManager.startBootWatchdog()
        view.insetsLayoutMarginsFromSafeArea = true
        AppPageHost.shared.start(windowless: false)
        injectFullscreenFixJS()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        WebViewManager.triggerMainLoadNow()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if let webView { WebViewManager.publishSafeAreaViewport(for: webView) }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        if let webView { WebViewManager.publishSafeAreaViewport(for: webView) }
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
        bootOverlay.backgroundColor = bootBackgroundColor
        bootOverlay.isOpaque = true

        bootLogo.translatesAutoresizingMaskIntoConstraints = false
        bootLogo.contentMode = .scaleAspectFit

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
        bootOverlay.addSubview(bootLogo)
        bootOverlay.addSubview(bootStatusLabel)
        bootOverlay.addSubview(bootRetryButton)
        NSLayoutConstraint.activate([
            bootOverlay.topAnchor.constraint(equalTo: root.topAnchor),
            bootOverlay.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            bootOverlay.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            bootOverlay.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            bootLogo.centerXAnchor.constraint(equalTo: bootOverlay.centerXAnchor),
            bootLogo.centerYAnchor.constraint(equalTo: bootOverlay.centerYAnchor, constant: -30),
            bootLogo.widthAnchor.constraint(equalToConstant: 160),
            bootLogo.heightAnchor.constraint(equalToConstant: 160),
            bootStatusLabel.topAnchor.constraint(equalTo: bootLogo.bottomAnchor, constant: 18),
            bootStatusLabel.leadingAnchor.constraint(greaterThanOrEqualTo: bootOverlay.leadingAnchor, constant: 24),
            bootStatusLabel.trailingAnchor.constraint(lessThanOrEqualTo: bootOverlay.trailingAnchor, constant: -24),
            bootStatusLabel.centerXAnchor.constraint(equalTo: bootOverlay.centerXAnchor),
            bootRetryButton.topAnchor.constraint(equalTo: bootStatusLabel.bottomAnchor, constant: 14),
            bootRetryButton.centerXAnchor.constraint(equalTo: bootOverlay.centerXAnchor)
        ])
    }

    // The launch state, for a page booted again.
    private func showBootOverlay() {
        bootOverlay.layer.removeAllAnimations()
        bootOverlay.backgroundColor = bootBackgroundColor
        bootOverlay.isOpaque = true
        bootOverlay.isUserInteractionEnabled = true
        bootOverlay.alpha = 1
        bootOverlay.isHidden = false
        bootLogo.isHidden = false
        bootStatusLabel.backgroundColor = .clear
        bootStatusLabel.text = "Ouverture…"
        bootRetryButton.isHidden = true
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
        if reason == "boot_stalled" {
            showBootDelayWarning()
            return
        }
        bootOverlay.layer.removeAllAnimations()
        bootOverlay.backgroundColor = bootBackgroundColor
        bootOverlay.isOpaque = true
        bootOverlay.isUserInteractionEnabled = true
        bootOverlay.alpha = 1
        bootOverlay.isHidden = false
        bootLogo.isHidden = false
        bootStatusLabel.backgroundColor = .clear
        bootStatusLabel.text = reason == "web_content_terminated"
            ? "Le moteur d’affichage s’est arrêté."
            : "Le démarrage a échoué."
        bootRetryButton.isHidden = false
    }

    private func showBootDelayWarning() {
        bootOverlay.layer.removeAllAnimations()
        bootOverlay.backgroundColor = .clear
        bootOverlay.isOpaque = false
        bootOverlay.isUserInteractionEnabled = false
        bootOverlay.alpha = 1
        bootOverlay.isHidden = false
        bootLogo.isHidden = true
        bootStatusLabel.text = "Le démarrage continue…"
        bootStatusLabel.backgroundColor = UIColor(white: 0, alpha: 0.72)
        bootRetryButton.isHidden = true
    }

    @objc private func retryBoot() {
        WebViewManager.reloadMainPage(reason: "retry_requested")
        bootStatusLabel.text = "Nouvelle tentative…"
    }
}

struct WebViewContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> FullscreenWebViewController {
        FullscreenWebViewController()
    }

    func updateUIViewController(_ controller: FullscreenWebViewController, context: Context) {}
}
