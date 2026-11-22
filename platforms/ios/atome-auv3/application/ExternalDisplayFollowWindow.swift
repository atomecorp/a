import SwiftUI
import UIKit
import WebKit

/// Connected screens on an iPad with Stage Manager (R-212, user, 20 Nov. 2026: « Ok pour le multi-fenêtre »). With
/// Stage Manager and an extended display, iPadOS gives the app no scene of the screen's own
/// (ExternalDisplaySceneDelegate): it lays the app's windows there, and only the person moves a window from one display
/// to the other. So the app has several windows: the first is the app's own (its page, AppPageHost), every other one
/// shows the screen's page (`?display=follower`, the same Follow view as a connected screen's), opened by iPadOS's
/// « New Window » and moved by the person to the display they want. Such a window takes its own input — iPadOS gives
/// it the mouse, the trackpad and the keyboard —, so the iPhone's relays (ExternalDisplayPointer, ExternalDisplayKeyboard)
/// leave it alone. A window keeps its role across launches (SwiftUI's scene storage).
enum AppWindowRole: String {
    case app
    case follow
}

/// Which window holds the app's page: one at most. A window closed gives the role back, the next one opened takes it.
@MainActor
final class AppWindowRoles {
    static let shared = AppWindowRoles()
    // A window restored as a Follow window waits this long for the app's own window to come back before taking its
    // place: at launch iPadOS restores the windows in no set order, and the app's page needs a window of its own.
    private static let restoreWaitNanoseconds: UInt64 = 300_000_000
    private var appClaimed = false

    private init() {}

    /// The role of a window appearing: `stored` is the one it had (empty for a new window).
    func claim(stored: String) async -> AppWindowRole {
        if AppWindowRole(rawValue: stored) == .follow && !appClaimed {
            try? await Task.sleep(nanoseconds: Self.restoreWaitNanoseconds)
        }
        if appClaimed { return .follow }
        appClaimed = true
        return .app
    }

    func release(_ role: AppWindowRole?) {
        if role == .app { appClaimed = false }
    }

    /// The scene of the app's own window (its page's), to present or open from there and never from a Follow window.
    static var appScene: UIWindowScene? { AppPageHost.shared.webView.window?.windowScene }
}

/// A Follow window: the screen's page, in a window that takes its own input.
struct ExternalDisplayFollowWindow: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> ExternalDisplayFollowController {
        ExternalDisplayFollowController()
    }

    func updateUIViewController(_ controller: ExternalDisplayFollowController, context: Context) {}

    static func dismantleUIViewController(_ controller: ExternalDisplayFollowController, coordinator: ()) {
        controller.close()
    }
}

final class ExternalDisplayFollowController: UIViewController {
    private let bridge = ExternalDisplayFollowerBridge()
    private var page: WKWebView?

    override func loadView() {
        let webView = ExternalDisplaySceneDelegate.makeFollowerWebView(frame: .zero, bridge: bridge, interactive: true)
        bridge.webView = webView
        webView.navigationDelegate = bridge
        page = webView
        view = webView
        print("[external_display] follow window opened")
        ExternalDisplayRelay.shared.attach(follower: webView, takesInput: true)
        if let url = ExternalDisplaySceneDelegate.followerURL { webView.load(URLRequest(url: url)) }
    }

    func close() {
        guard let page else { return }
        print("[external_display] follow window closed")
        ExternalDisplayRelay.shared.detach(follower: page)
        ExternalDisplaySceneDelegate.releaseFollowerWebView(page)
        self.page = nil
    }
}
