import UIKit
import WebKit

/// Owns the application's single page independently of any window: the phone
/// window and the CarPlay scene share one running page, and a CarPlay launch
/// (iPhone locked, no window scene) still boots it.
final class AppPageHost {
    static let shared = AppPageHost()
    private(set) lazy var webView: WKWebView = makeWebView()
    // CoreMIDI starts when the page's MIDI input service asks (`start_native_midi`).
    private let midiController = MIDIController()
    private var started = false

    private init() {}

    /// Installs the native bridges once, then requests the main page. A windowless
    /// start loads at once instead of waiting for the phone window to appear.
    func start(windowless: Bool) {
        if !started {
            started = true
            installNativeBridges()
            WebViewManager.setupWebView(for: webView)
        }
        if windowless { WebViewManager.triggerMainLoadNow(allowWindowless: true) }
    }

    private func makeWebView() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        if FeatureFlags.registerCustomScheme {
            config.setURLSchemeHandler(AudioSchemeHandler(), forURLScheme: "atome")
        }
        config.allowsInlineMediaPlayback = true
        // Media requested by the user or the assistant (TV, YouTube) starts with sound, without waiting for a tap.
        config.mediaTypesRequiringUserActionForPlayback = []
        let paintBlack = "(function(){try{var d=document; if(d.documentElement){d.documentElement.style.background='#000';d.documentElement.style.color='#ccc';} if(d.body){d.body.style.background='#000';d.body.style.color='#ccc';}}catch(e){}})();"
        config.userContentController.addUserScript(WKUserScript(
            source: paintBlack,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.setValue(false, forKey: "drawsBackground")
        let webView = WKWebView(frame: UIScreen.main.bounds, configuration: config)
        WebViewManager.markBootMilestone("webview_created")
        // Same rule as the AUv3 factory: no native long-press link preview, the
        // product owns every context menu.
        webView.allowsLinkPreview = false
        // Same opt-in as the AUv3 factory: inspectable only for a deliberate
        // diagnostic launch (`-AtomeWebInspector`, Debug builds).
        if #available(iOS 16.4, *) {
            webView.isInspectable = FeatureFlags.webInspectorEnabled
        }
        webView.isOpaque = false
        webView.underPageBackgroundColor = .clear
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.verticalScrollIndicatorInsets = .zero
        webView.scrollView.horizontalScrollIndicatorInsets = .zero
        return webView
    }

    private func installNativeBridges() {
        WebViewManager.setNativeInvokeHandler { command, payload, completion in
            if AppNativeCommunication.canHandle(command) {
                AppNativeCommunication.shared.handle(command, payload: payload, completion: completion)
            } else if AppNativeMediaCaptureController.canHandle(command: command) {
                AppNativeMediaCaptureController.shared.handle(command: command, payload: payload, completion: completion)
            } else if AppNativeHealthController.canHandle(command: command) {
                AppNativeHealthController.shared.handle(command: command, payload: payload, completion: completion)
            } else if AppNativeGpsController.canHandle(command: command) {
                AppNativeGpsController.shared.handle(command: command, payload: payload, completion: completion)
            } else if AppNativeAppleMusicController.canHandle(command) {
                AppNativeAppleMusicController.handle(payload, completion: completion)
            } else if AppNativeClipboardController.canHandle(command: command) {
                AppNativeClipboardController.shared.handle(command: command, payload: payload, completion: completion)
            } else if AppNativeBevyRendererController.canHandle(command: command) {
                AppNativeBevyRendererController.shared.handle(command: command, payload: payload, completion: completion)
            } else if NativeCalendarAlarm.canHandle(command: command) {
                NativeCalendarAlarm.shared.handle(command: command, payload: payload, completion: completion)
            } else if AssistantRequestInbox.canHandle(command: command) {
                AssistantRequestInbox.shared.handle(command: command, payload: payload, completion: completion)
            } else if CarPlayAssistantLink.canHandle(command: command) {
                CarPlayAssistantLink.shared.handle(command: command, payload: payload, completion: completion)
            } else {
                AppNativeAudioController.shared.handle(command: command, payload: payload, completion: completion)
            }
        }
        WebViewManager.midiController = midiController
        AppNativeMediaCaptureController.shared.attachPreviewHost(webView: webView)
        NativePersonalImport.shared.openSettings = AppPageHost.openSettings
        // This app's page in Settings: Motion & Fitness and Health access.
        AppNativeHealthController.shared.attach(webView: webView, openSettings: AppPageHost.openSettings)
    }

    private static func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
