import UIKit

/// Presents a small confirmation alert so the subsequent openURL call is clearly user-initiated.
enum TrustedTapOpener {
    /// Schemes that commonly require a trusted, user-initiated gesture to succeed.
    static let userGestureSchemes: Set<String> = ["shortcuts"]

    static func requiresTrustedTap(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return true }
        if scheme == "http" || scheme == "https" { return false }
        return userGestureSchemes.contains(scheme)
    }

    /// Find the top-most view controller in the foreground scene to present UI.
    private static func topViewController(in scene: UIWindowScene) -> UIViewController? {
        let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first
        var vc = window?.rootViewController
        while let presented = vc?.presentedViewController { vc = presented }
        return vc
    }

    /// Silent strategy: wait briefly after foreground activation then attempt open without showing an alert.
    static func silentDelayAndOpen(_ url: URL, delay: TimeInterval = 0.35) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }) else {
            print("⚠️ TrustedTapOpener: no active scene to open \(url.absoluteString)")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            scene.open(url, options: nil) { ok in print("📤 Opened=\(ok) url=\(url.absoluteString)") }
        }
    }
}
