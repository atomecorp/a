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
            return ok
        }

    // No UIApplication fallback in AUv3 extension build

        print("⚠️ URLOpener: no context/scene to open \(url.absoluteString)")
        return false
    }
}
