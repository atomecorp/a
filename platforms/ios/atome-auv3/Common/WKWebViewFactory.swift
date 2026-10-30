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
        // Media requested by the user or the assistant (TV, YouTube) starts with sound, without waiting for a tap.
        if #available(iOS 10.0, *) { config.mediaTypesRequiringUserActionForPlayback = [] }

        let webView = WKWebView(frame: frame, configuration: config)
        // FIX: Set isOpaque to true to prevent rendering artifacts/black screens in AUv3
        // especially when multiple instances are loaded.
        // The product draws its own context menu. The native long-press link preview
        // is the one WebKit affordance CSS and `preventDefault` cannot reach, so it
        // is turned off at the view.
        webView.allowsLinkPreview = false
        webView.hideKeyboardAccessoryBar()
        webView.isOpaque = true
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        // WebKit inspection substantially increases JavaScriptCore's peak memory
        // while parsing the application graph. Keep it available for a deliberate
        // diagnostic launch without taxing every Xcode-installed Debug build.
        if #available(iOS 16.4, *) {
            webView.isInspectable = FeatureFlags.webInspectorEnabled
        }
        log.info("Created WKWebView; mode=\(String(describing: mode)) frame=\(String(describing: frame.debugDescription))")
        return webView
    }
}

extension WKWebView {
    /// Removes WebKit's keyboard input accessory bar (the previous / next / done row)
    /// from every text field of the page: the product owns its own keyboard flow.
    /// The bar is the `inputAccessoryView` of WebKit's private content view, the
    /// web view's first responder; that view's class is replaced once by a runtime
    /// subclass answering nil. Called by every creator of an application web view.
    func hideKeyboardAccessoryBar() {
        guard let content = scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }) else {
            Logger(subsystem: "atome", category: "WKWebViewFactory").error("Keyboard accessory bar kept: WebKit content view not found")
            return
        }
        guard let accessoryFree = KeyboardAccessoryFreeClass.subclass(of: type(of: content)) else {
            Logger(subsystem: "atome", category: "WKWebViewFactory").error("Keyboard accessory bar kept: runtime subclass refused")
            return
        }
        object_setClass(content, accessoryFree)
    }
}

/// One runtime subclass per WebKit content class, created on first use.
private enum KeyboardAccessoryFreeClass {
    private static let suffix = "_AtomeNoKeyboardAccessory"
    private static let accessoryNil: @convention(block) (AnyObject) -> AnyObject? = { _ in nil }

    static func subclass(of base: AnyClass) -> AnyClass? {
        let name = NSStringFromClass(base) + suffix
        if let existing = NSClassFromString(name) { return existing }
        guard let created = objc_allocateClassPair(base, name, 0),
              let method = class_getInstanceMethod(UIView.self, #selector(getter: UIResponder.inputAccessoryView)) else { return nil }
        class_addMethod(created, #selector(getter: UIResponder.inputAccessoryView),
                        imp_implementationWithBlock(accessoryNil), method_getTypeEncoding(method))
        objc_registerClassPair(created)
        return created
    }
}
