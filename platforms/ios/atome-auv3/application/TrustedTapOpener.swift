import UIKit

/// Opens a URL whose scheme wants a user-initiated open (Shortcuts) a moment after the app's window is active.
@MainActor
enum TrustedTapOpener {
    /// Schemes that commonly require a trusted, user-initiated gesture to succeed.
    static let userGestureSchemes: Set<String> = ["shortcuts"]

    static func requiresTrustedTap(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return true }
        if scheme == "http" || scheme == "https" { return false }
        return userGestureSchemes.contains(scheme)
    }

    /// Silent strategy: wait briefly after foreground activation then attempt open without showing an alert.
    static func silentDelayAndOpen(_ url: URL, delay: TimeInterval = 0.35) {
        // The app's own window (never a Follow window, ExternalDisplayFollowWindow.swift).
        guard let scene = AppWindowRoles.appScene, scene.activationState == .foregroundActive else {
            print("⚠️ TrustedTapOpener: no active scene to open \(url.absoluteString)")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            scene.open(url, options: nil) { ok in print("📤 Opened=\(ok) url=\(url.absoluteString)") }
        }
    }
}
