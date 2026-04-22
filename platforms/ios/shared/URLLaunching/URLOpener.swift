import Foundation
import UIKit

@MainActor
public final class URLOpener {

    // Prevent multiple opens within a short window
    private static var lastOpenTime: TimeInterval = 0
    private static let minInterval: TimeInterval = 0.40 // 400 ms debounce

    /// Unified entry point. Works in both app and extension.
    /// - Parameters:
    ///   - urlString: full URL (custom scheme or https)
    ///   - viewController: the current UI view controller (for extensionContext)
    /// - Returns: true if the system accepted the request.
    @discardableResult
    public static func open(_ urlString: String, from viewController: UIViewController?) -> Bool {
        guard !urlString.isEmpty, let url = URL(string: urlString) else {
            print("🔗 URLOpener: invalid or empty URL string: \(urlString)")
            return false
        }

        let now = CFAbsoluteTimeGetCurrent()
        if now - lastOpenTime < minInterval {
            print("🔗 URLOpener: debounced duplicate open for \(url.absoluteString)")
            return false
        }
        lastOpenTime = now

        // Prefer extension context if available (AUv3)
        if let ctx = viewController?.extensionContext {
            print("🔗 URLOpener: using extensionContext.open for \(url.absoluteString)")
            var ok = false
            let sem = DispatchSemaphore(value: 0)

            ctx.open(url) { success in
                ok = success
                print("🔗 URLOpener: extensionContext.open completion -> success=\(success) url=\(url.absoluteString)")
                sem.signal()
            }

            _ = sem.wait(timeout: .now() + 2.0)
            if !ok { print("⚠️ URLOpener: extensionContext.open timeout or failure for \(url.absoluteString)") }
            return ok
        }

        // Fallback for the standalone app (foreground only)
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let scene = scenes.first(where: { $0.activationState == .foregroundActive }) {
            print("🔗 URLOpener: using UIWindowScene.open for \(url.absoluteString)")
            var ok = false
            let group = DispatchGroup()
            group.enter()
            scene.open(url, options: nil) { success in
                ok = success
                print("🔗 URLOpener: UIWindowScene.open completion -> success=\(success) url=\(url.absoluteString)")
                group.leave()
            }
            _ = group.wait(timeout: .now() + 2.0)
            if !ok { print("⚠️ URLOpener: UIWindowScene.open timeout or failure for \(url.absoluteString)") }
            return ok
        }

        print("⚠️ URLOpener: no valid extensionContext or foreground scene to open \(url.absoluteString)")
        return false
    }
}
