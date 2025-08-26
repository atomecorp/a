import Foundation
import CoreFoundation

// Shared bus for AUv3 <-> App communication
// Keep all iOS-related code inside src-Auv3 per project convention.
enum SharedBus {
    // App Group suite used to exchange data between the AUv3 extension and the container app.
    static let appGroupSuite: String = "group.atome.one"

    // Darwin notification name prefix. Concrete notification names are this prefix + a nonce key.
    static let notificationPrefix: String = "group.atome.one.openurl."

    // Persistent index stored in the App Group to recover missed payload keys.
    static let inboxIndexKey: String = "group.atome.one.openurl.index"

    // NSUserActivity type used to ask iOS to foreground/activate a scene of the container app.
    static let userActivityType: String = "group.atome.one.openurl.activate"

    // Custom URL scheme to bring the container app to foreground so it can drain the inbox
    static let activationScheme: String = "atomeapp"
    static let activationURLString: String = "atomeapp://activate"

    // Codable payload stored in the App Group when relaying a request from the AUv3 to the app.
    struct RelayPayload: Codable {
        let url: String
        // unify timestamp field name so readers can decode regardless of version
        let ts: TimeInterval

        // custom decoder to accept either "ts" or "createdAt"
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            self.url = try c.decode(String.self, forKey: .url)
            if let v = try? c.decode(TimeInterval.self, forKey: .ts) {
                self.ts = v
            } else {
                self.ts = (try? c.decode(TimeInterval.self, forKey: .createdAt)) ?? 0
            }
        }

        init(url: String, ts: TimeInterval) {
            self.url = url
            self.ts = ts
        }

        enum CodingKeys: String, CodingKey { case url, ts, createdAt }

        // Since we provided a custom init(from:), also provide encode(to:)
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(url, forKey: .url)
            try c.encode(ts, forKey: .ts)
            // Also encode createdAt for backward/forward compatibility
            try c.encode(ts, forKey: .createdAt)
        }
    }

    /// Build a concrete Darwin notification key from a nonce
    static func makeKey(nonce: String) -> String { notificationPrefix + nonce }

    /// Post a Darwin notification with the given fully-qualified name.
    static func postDarwinNotification(named name: String) {
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let cfName = CFNotificationName(name as CFString)
        CFNotificationCenterPostNotification(center, cfName, nil, nil, true)
    }

    /// Write a per-nonce payload into UserDefaults(suiteName:) and post a Darwin notification with the same name.
    /// Returns the key used, or nil on failure.
    @discardableResult
    static func writeNoncePayload(urlString: String) -> String? {
        guard let ud = UserDefaults(suiteName: appGroupSuite) else { return nil }
        let nonce = UUID().uuidString
        let key = notificationPrefix + nonce
        let payload = RelayPayload(url: urlString, ts: CFAbsoluteTimeGetCurrent())
        guard let data = try? JSONEncoder().encode(payload) else { return nil }
    ud.set(data, forKey: key)
        // Append key to persistent index so container can recover at launch
        var index = ud.stringArray(forKey: inboxIndexKey) ?? []
        if !index.contains(key) { index.append(key) }
    ud.set(index, forKey: inboxIndexKey)
    ud.synchronize()
    // Mirror into CFPreferences (AnyHost) to improve visibility across processes and ByHost nuances
    let domain = appGroupSuite as CFString
    CFPreferencesSetValue(key as CFString, data as CFData, domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
    CFPreferencesSetValue(inboxIndexKey as CFString, index as CFArray, domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
    CFPreferencesSynchronize(domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
        postDarwinNotification(named: key)
        return key
    }

    /// Write a payload into the App Group and post a Darwin notification; kept for backward compatibility.
    @discardableResult
    static func writePayloadAndNotify(urlString: String) -> String? {
        return writeNoncePayload(urlString: urlString)
    }
}
