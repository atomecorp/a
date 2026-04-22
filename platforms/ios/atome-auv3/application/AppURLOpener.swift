import UIKit

@MainActor
@objc(AppURLOpener)
final class AppURLOpener: NSObject {
    @discardableResult
    static func open(_ urlString: String) -> Bool {
        guard let url = URL(string: urlString), !urlString.isEmpty else { return false }
        // If we have a foregroundActive scene, open immediately via scene API
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let activeScene = scenes.first(where: { $0.activationState == .foregroundActive }) {
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
        UIApplication.shared.requestSceneSessionActivation(nil, userActivity: activity, options: nil) { error in
            NSLog("requestSceneSessionActivation error: \(error)")
        }
        return true
    }
    // Objective-C invocable shim for runtime lookup from WebViewManager
    @objc class func openFromJS(_ urlString: NSString) {
        Task { @MainActor in _ = open(urlString as String) }
    }
}
