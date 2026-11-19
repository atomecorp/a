import Foundation

// The app's one inbox of atome.one links: every universal link and URL the delegates receive enters here.
// Authentication links stay in memory until the bundled application consumes them.
// Receiving a URL never authenticates an account or consumes its server token.
// A link is delivered once: the system hands the same universal link to the SwiftUI
// handlers and to the scene delegate, and a second delivery made the page open an
// already consumed link as one from another device (its pairing code asked for).
// A domain link (https://atome.one/eve, https://atome.one/music, R-192) goes to DomainLinkInbox.
enum AuthLinkInbox {
    private static let queue = DispatchQueue(label: "one.atome.auth.links")
    private static var pending: (url: String, expires: Date)?
    private static var received: String?

    @discardableResult
    static func receive(_ url: URL) -> Bool {
        if DomainLinkInbox.receive(url) { return true }
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

// The domain a link opens eVe on (R-192, eVe/domains/dashboard/dashboard_domain.js): https://atome.one/eve or
// https://atome.one/music, an invitation's fragment `#invite=<43>` kept with it. The page takes the latest one
// (`domain_link_take`); one received while the page runs is announced (`atome:domain-link-available`). The same
// link delivered twice by the system within a second is one link; touched again later, it is a new one.
enum DomainLinkInbox {
    private static let queue = DispatchQueue(label: "one.atome.domain.links")
    private static var pending: [String: String]?
    private static var last: (url: String, at: Date)?

    static func receive(_ url: URL) -> Bool {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "https", parts.host == "atome.one", parts.port == nil,
              parts.user == nil, parts.password == nil, parts.query == nil,
              ["/eve", "/music"].contains(parts.percentEncodedPath) else { return false }
        let fragment = parts.percentEncodedFragment
        if let fragment, fragment.range(of: "^invite=[A-Za-z0-9_-]{43}$", options: .regularExpression) == nil {
            print("[DOMAIN_LINK_INBOX] rejected")
            return true
        }
        var link = ["domain": String(parts.percentEncodedPath.dropFirst())]
        if let fragment { link["invite"] = String(fragment.dropFirst("invite=".count)) }
        let fresh = queue.sync {
            if let last, last.url == url.absoluteString, Date().timeIntervalSince(last.at) < 1 { return false }
            last = (url.absoluteString, Date())
            pending = link
            return true
        }
        guard fresh else { return true }
        print("[DOMAIN_LINK_INBOX] accepted \(link["domain"] ?? "")")
        WebViewManager.evaluateJS("window.dispatchEvent(new Event('atome:domain-link-available'));", label: "domain.link.available", priority: .critical)
        return true
    }

    static func take() -> [String: Any] {
        queue.sync {
            defer { pending = nil }
            return pending ?? [:]
        }
    }
}
