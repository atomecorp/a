import Foundation
import UserNotifications

enum NotificationNudge {
    static let categoryId = "OPEN_URL_RELAY"

    static func scheduleOpenRelayNotification(urlString: String) {
        let center = UNUserNotificationCenter.current()
        // Register category (idempotent across calls)
        let cat = UNNotificationCategory(identifier: categoryId, actions: [], intentIdentifiers: [], options: [.customDismissAction])
        center.setNotificationCategories([cat])

        let content = UNMutableNotificationContent()
        content.title = "Action pending in Atome"
        content.body = "Tap to complete opening the target app."
        content.sound = .default
        content.categoryIdentifier = categoryId
        content.userInfo = [
            "action": "open_url_relay",
            "url": urlString
        ]

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.5, repeats: false)
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger)
        center.add(req) { err in
            if let err = err { NSLog("NotificationNudge add error: \(err)") }
        }
    }
}
