import Foundation
import UIKit

final class AppGroupOpenURLInbox {
    static let shared = AppGroupOpenURLInbox()
    private var pending: [URL] = []
    private let q = DispatchQueue(label: "inbox.queue")

    /// Scan the persistent index in the App Group to recover any payloads that might have been posted while the app was not observing Darwin notifications.
    func drainPersistentIndexIfAny() {
        guard let ud = UserDefaults(suiteName: SharedBus.appGroupSuite) else { return }
        let keys = ud.stringArray(forKey: SharedBus.inboxIndexKey) ?? []
    if !keys.isEmpty { print("📬 Recovering \(keys.count) relay payload(s) from index…") } else { print("📬 No pending relay payload in index") }
        for key in keys { enqueueFromAppGroup(key: key) }
    }

    func enqueueFromAppGroup(key: String) {
        guard key.hasPrefix(SharedBus.notificationPrefix) else { return }
        guard let ud = UserDefaults(suiteName: SharedBus.appGroupSuite) else { return }
        guard let data = ud.data(forKey: key) else { return }
        do {
            let payload = try JSONDecoder().decode(SharedBus.RelayPayload.self, from: data)
            if let url = URL(string: payload.url) {
                q.async { self.pending.append(url) }
                print("📥 Inbox enqueued: \(payload.url) (key=\(key))")
                // Try to bring a scene to foreground if none is active
                requestActivationIfNeeded()
            }
            ud.removeObject(forKey: key)
            // Remove the consumed key from persistent index
            var index = ud.stringArray(forKey: SharedBus.inboxIndexKey) ?? []
            if let i = index.firstIndex(of: key) { index.remove(at: i); ud.set(index, forKey: SharedBus.inboxIndexKey) }
        } catch {
            NSLog("Inbox decode error: \(error)")
        }
    }

    func flushIfPossible() {
        guard hasActiveScene else { return }
        var items: [URL] = []
        q.sync { items = self.pending; self.pending.removeAll() }
    guard !items.isEmpty else { print("📬 Inbox flush: nothing to open"); return }
    print("📬 Inbox flush: opening \(items.count) url(s)")
        for url in items {
            open(url)
        }
    }

    private var hasActiveScene: Bool {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.contains(where: { $0.activationState == .foregroundActive })
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
