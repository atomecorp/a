import Foundation
import UIKit

final class AppGroupOpenURLInbox {
    static let shared = AppGroupOpenURLInbox()
    private var pending: [URL] = []
    private let q = DispatchQueue(label: "inbox.queue")

    /// Scan the persistent index in the App Group to recover any payloads that might have been posted while the app was not observing Darwin notifications.
    func drainPersistentIndexIfAny() {
        guard let ud = UserDefaults(suiteName: SharedBus.appGroupSuite) else { return }
        var recoveredCount = 0
        let keys = ud.stringArray(forKey: SharedBus.inboxIndexKey) ?? []
        if !keys.isEmpty {
            print("📬 Recovering \(keys.count) relay payload(s) from index…")
            for key in keys { enqueueFromAppGroup(key: key); recoveredCount += 1 }
        } else {
            print("📬 No pending relay payload in index → scanning domain for stray keys…")
            // Fallback: scan the App Group prefs domain for any keys with our prefix
            let domain = SharedBus.appGroupSuite as CFString
            if let keyList = CFPreferencesCopyKeyList(domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost) as? [CFString] {
                let matches = keyList.map { $0 as String }.filter { $0.hasPrefix(SharedBus.notificationPrefix) }
                if !matches.isEmpty { print("📬 Found \(matches.count) pending key(s) via CFPreferences scan") }
                for k in matches { enqueueFromAppGroup(key: k); recoveredCount += 1 }
            }
        }
        if recoveredCount == 0 { print("📬 Inbox recovery: nothing found") }
    }

    func enqueueFromAppGroup(key: String) {
        guard key.hasPrefix(SharedBus.notificationPrefix) else { return }
        guard let ud = UserDefaults(suiteName: SharedBus.appGroupSuite) else { return }
        // Try normal UserDefaults read first
        var data: Data? = ud.data(forKey: key)
        // Fallback: read via CFPreferences with AnyHost to handle ByHost nuances
        if data == nil {
            let domain = SharedBus.appGroupSuite as CFString
            if let cfVal = CFPreferencesCopyValue(key as CFString, domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost) {
                if CFGetTypeID(cfVal) == CFDataGetTypeID() {
                    data = (cfVal as! Data)
                } else if let d = cfVal as? Data {
                    data = d
                } else if let s = cfVal as? String, let d = Data(base64Encoded: s) {
                    // Defensive: if stored as base64 string somehow
                    data = d
                }
            }
        }
        guard let data = data else { return }
        do {
            let payload = try JSONDecoder().decode(SharedBus.RelayPayload.self, from: data)
            if let url = URL(string: payload.url) {
                q.sync { self.pending.append(url) }
                print("📥 Inbox enqueued: \(payload.url) (key=\(key)) → pending=\(q.sync { self.pending.count })")
                // Try to bring a scene to foreground if none is active
                requestActivationIfNeeded()
            }
            // Remove consumed key from both UD and CFPreferences (AnyHost)
            ud.removeObject(forKey: key)
            let domain = SharedBus.appGroupSuite as CFString
            CFPreferencesSetValue(key as CFString, nil, domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
            CFPreferencesSynchronize(domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
            // Remove the consumed key from persistent index
            var index = ud.stringArray(forKey: SharedBus.inboxIndexKey)
            if index == nil {
                // Fallback: read index via CFPreferences
                if let cfIdx = CFPreferencesCopyValue(SharedBus.inboxIndexKey as CFString, domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost) as? [String] {
                    index = cfIdx
                }
            }
            var newIndex = index ?? []
            if let i = newIndex.firstIndex(of: key) { newIndex.remove(at: i) }
            ud.set(newIndex, forKey: SharedBus.inboxIndexKey)
            // Also write back via CFPreferences to keep AnyHost copy in sync
            CFPreferencesSetValue(SharedBus.inboxIndexKey as CFString, newIndex as CFArray, domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
            CFPreferencesSynchronize(domain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
        } catch {
            NSLog("Inbox decode error: \(error)")
        }
    }

    func flushIfPossible() {
        let active = hasActiveScene
        if !active {
            let count = q.sync { self.pending.count }
            print("📬 Inbox flush skipped: no active scene (pending=\(count))")
            return
        }
        var items: [URL] = []
        q.sync { items = self.pending; self.pending.removeAll() }
        guard !items.isEmpty else { print("📬 Inbox flush: nothing to open"); return }
        print("📬 Inbox flush: opening \(items.count) url(s)")
        for url in items {
            if TrustedTapOpener.requiresTrustedTap(url) {
                TrustedTapOpener.silentDelayAndOpen(url)
            } else {
                open(url)
            }
        }
    }

    private var hasActiveScene: Bool {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let active = scenes.contains(where: { $0.activationState == .foregroundActive })
        return active
    }

    private func requestActivationIfNeeded() {
        guard !hasActiveScene else { return }
        let activity = NSUserActivity(activityType: SharedBus.userActivityType)
        UIApplication.shared.requestSceneSessionActivation(nil, userActivity: activity, options: nil, errorHandler: { error in
            NSLog("requestSceneSessionActivation error: \(error)")
        })
    }

    private func open(_ url: URL) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }) else {
            print("⚠️ Inbox: no active scene to open \(url)")
            q.async { self.pending.insert(url, at: 0) }
            return
        }
    scene.open(url, options: nil) { ok in print("📤 Opened=\(ok) url=\(url.absoluteString)") }
    }
}
