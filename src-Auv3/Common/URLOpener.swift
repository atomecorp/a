import Foundation
import UIKit

@MainActor
public final class URLOpener {
    private static var lastOpenTime: TimeInterval = 0
    private static let minInterval: TimeInterval = 0.40

    @discardableResult
    public static func open(_ urlString: String, from viewController: UIViewController?) -> Bool {
        guard !urlString.isEmpty, let url = URL(string: urlString) else {
            print("🔗 URLOpener: invalid URL: \(urlString)")
            return false
        }

        let now = CFAbsoluteTimeGetCurrent()
        if now - lastOpenTime < minInterval {
            print("🔗 URLOpener: debounced for \(url.absoluteString)")
            return false
        }
        lastOpenTime = now

        if let ctx = viewController?.extensionContext {
            // AUv3 path: try direct open via NSExtensionContext, then relay to app for guaranteed processing
            print("🔗 URLOpener(AUv3): NSExtensionContext.open -> \(url.absoluteString)")
            var ok = false
            let sem = DispatchSemaphore(value: 0)
            ctx.open(url) { success in
                ok = success
                print("🔗 URLOpener(AUv3): completion success=\(success) url=\(url.absoluteString)")
                sem.signal()
            }
            _ = sem.wait(timeout: .now() + 2.0)
            if !ok { print("⚠️ URLOpener(AUv3): timeout/failure for \(url.absoluteString)") }
            // Always relay to container so it can open when foregroundActive
            if let key = SharedBus.writeNoncePayload(urlString: url.absoluteString) {
                print("📣 URLOpener(AUv3): relayed with key=\(key)")
            }
            // Nudge the app to foreground using activation scheme
            if let activation = URL(string: SharedBus.activationURLString) {
                ctx.open(activation) { success in
                    print("🪄 URLOpener(AUv3): activation nudge success=\(success) url=\(activation.absoluteString)")
                }
            }
            // Notification nudge disabled to avoid extra popup; rely on app-side poller and recovery.
            return ok
        }

    // App path is handled by AppURLOpener (only compiled into the app target).
    print("⚠️ URLOpener: no extensionContext; app path should use AppURLOpener")
    return false
    }
}
