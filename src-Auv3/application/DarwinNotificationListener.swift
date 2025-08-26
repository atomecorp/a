import Foundation
import CoreFoundation

final class DarwinNotificationListener {
    static let shared = DarwinNotificationListener()
    private var installed = false

    func start() {
        guard !installed else { return }
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterAddObserver(center, observer, { (_, _, name, _, _) in
            guard let name = name else { return }
            let key = name.rawValue as String
            if key.hasPrefix(SharedBus.notificationPrefix) {
                print("🔔 Darwin received: \(key) → enqueue + drain index")
                AppGroupOpenURLInbox.shared.enqueueFromAppGroup(key: key)
                AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
                // If a foregroundActive scene exists, attempt immediate flush
                AppGroupOpenURLInbox.shared.flushIfPossible()
            }
        }, nil, nil, .deliverImmediately)
        installed = true
        print("🔔 DarwinNotificationListener started (prefix=\(SharedBus.notificationPrefix))")
    }
}
