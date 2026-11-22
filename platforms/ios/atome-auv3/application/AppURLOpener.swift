import UIKit

@MainActor
@objc(AppURLOpener)
final class AppURLOpener: NSObject {
    @discardableResult
    static func open(_ urlString: String) -> Bool {
        guard let url = URL(string: urlString), !urlString.isEmpty else { return false }
        // The app's own window active (never a Follow window, ExternalDisplayFollowWindow.swift): open from it at once.
        if let activeScene = AppWindowRoles.appScene, activeScene.activationState == .foregroundActive {
            // If the scheme likely needs trust, delay slightly after activation and open silently
            if TrustedTapOpener.requiresTrustedTap(url) {
                TrustedTapOpener.silentDelayAndOpen(url)
            } else {
                activeScene.open(url, options: nil) { success in
                    print("🔗 AppURLOpener: opened=\(success) url=\(url.absoluteString)")
                }
            }
            return true
        }
        // Otherwise, enqueue to App Group and request activation; SceneDelegate will flush when active
        if let key = SharedBus.writeNoncePayload(urlString: url.absoluteString) {
            print("📣 AppURLOpener: queued with key=\(key); requesting activation…")
        }
        let activity = NSUserActivity(activityType: SharedBus.userActivityType)
        // The app's own window brought back, never a new one (the app has several windows on an iPad).
        UIApplication.shared.requestSceneSessionActivation(AppWindowRoles.appScene?.session, userActivity: activity, options: nil) { error in
            NSLog("requestSceneSessionActivation error: \(error)")
        }
        return true
    }
    // Objective-C invocable shim for runtime lookup from WebViewManager
    @objc class func openFromJS(_ urlString: NSString) {
        Task { @MainActor in _ = open(urlString as String) }
    }
}
