import Foundation
import UIKit

@MainActor
public final class URLOpener {
    private static var lastOpenTime: TimeInterval = 0
    private static let minInterval: TimeInterval = 0.40

    // Bridge symbol from OpenURLShim.m
    @_silgen_name("OpenURLViaUIApplicationModern")
    private static func OpenURLViaUIApplicationModern(_ cfurl: CFURL, _ timeoutSeconds: Double) -> Bool
    private static func tryUIApplicationOpenURL(_ url: URL) -> Bool {
        let ok = URLOpener.OpenURLViaUIApplicationModern(url as CFURL, 0.15)
        print("🔗 URLOpener(AUv3): UIApplication.open(options:completion) attempted url=\(url.absoluteString) ok=\(ok)")
        return ok
    }

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
            // First, try using UIApplication modern API like URL Beamer does (via ObjC shim)
            _ = tryUIApplicationOpenURL(url)
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
            var lastKey: String? = nil
            if let key = SharedBus.writeNoncePayload(urlString: url.absoluteString) {
                lastKey = key
                print("📣 URLOpener(AUv3): relayed with key=\(key)")
            }
            // Nudge the app to foreground using activation scheme (may be blocked by host)
            if let activation = URL(string: SharedBus.activationURLString) {
                ctx.open(activation) { success in
                    print("🪄 URLOpener(AUv3): activation nudge success=\(success) url=\(activation.absoluteString)")
                }
            }
            // Also try a Universal Link nudge which can foreground the app without a confirmation popup once configured
            if let ul = SharedBus.universalLinkActivateURL(withNonce: lastKey) {
                ctx.open(ul) { success in
                    print("🪄 URLOpener(AUv3): universal-link nudge success=\(success) url=\(ul.absoluteString)")
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
