import Foundation

// Universal links stay in memory until the bundled application consumes them.
// Receiving a URL never authenticates an account or consumes its server token.
// A link is delivered once: the system hands the same universal link to the SwiftUI
// handlers and to the scene delegate, and a second delivery made the page open an
// already consumed link as one from another device (its pairing code asked for).
enum AuthLinkInbox {
    private static let queue = DispatchQueue(label: "one.atome.auth.links")
    private static var pending: (url: String, expires: Date)?
    private static var received: String?

    @discardableResult
    static func receive(_ url: URL) -> Bool {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "https", parts.host == "atome.one", parts.port == nil,
              parts.user == nil, parts.password == nil, parts.query == nil,
              parts.percentEncodedPath.range(of: "^/auth/v/[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              let fragment = parts.percentEncodedFragment,
              fragment.range(of: "^t=[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
            print("[AUTH_LINK_INBOX] rejected")
            return false
        }
        let fresh = queue.sync {
            guard received != url.absoluteString else { return false }
            received = url.absoluteString
            pending = (url.absoluteString, Date().addingTimeInterval(300))
            return true
        }
        guard fresh else { return true }
        print("[AUTH_LINK_INBOX] accepted")
        WebViewManager.evaluateJS("window.dispatchEvent(new Event('atome:auth-link-available'));", label: "auth.link.available", priority: .critical)
        return true
    }

    static func take() -> [String: Any] {
        queue.sync {
            defer { pending = nil }
            guard let entry = pending, entry.expires > Date() else { return [:] }
            return ["url": entry.url]
        }
    }
}
