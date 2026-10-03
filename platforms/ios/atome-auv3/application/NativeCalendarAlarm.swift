import Foundation
import CryptoKit
import UserNotifications
#if canImport(AlarmKit)
import AlarmKit
#endif
import SwiftUI

/// Native iOS alarms for the atome Calendar.
///
/// atome stays the source of truth: the JavaScript Calendar owner decides which
/// alarms exist and when they should fire, and this controller only mirrors that
/// decision into iOS. On iOS 26+ the mirror is AlarmKit (`AlarmManager`), which
/// keeps the alarm scheduled and rings it even when the atome process is
/// suspended or terminated. On older systems the mirror is a local
/// `UNUserNotificationCenter` notification, which has weaker guarantees.
///
/// Every atome alarm keeps a STABLE native identifier derived from its atome
/// alarm id, so re-scheduling the same alarm replaces its iOS entry instead of
/// creating a second one. The persisted `atome_native_alarm_ids` set is what lets a
/// later reconciliation cancel exactly the atome alarms JavaScript removed,
/// without touching any alarm the user scheduled with another app.
///
/// A single JSON descriptor travels over the existing `__ATOME_IOS_NATIVE_INVOKE`
/// bridge. JavaScript carries the atome semantics (absolute instant vs relative
/// local time) and the controller only translates the two shapes AlarmKit knows:
///
///   {"id":"alarm_…","title":"…","mode":"fixed","fireAt":"2026-10-03T06:30:00Z"}
///   {"id":"alarm_…","title":"…","mode":"relative","hour":7,"minute":30,
///    "weekdays":[2,3,4,5,6],"at":"2026-10-03T05:30:00Z"}
final class NativeCalendarAlarm {
    static let shared = NativeCalendarAlarm()

    private static let notificationPrefix = "atome_alarm_"
    private static let ownedIdsKey = "atome_native_alarm_ids"

    private init() {}

    static func canHandle(command: String) -> Bool {
        command.hasPrefix("calendar_alarm_")
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        switch command {
        case "calendar_alarm_platform":
            Self.respond(completion, Self.platformPayload(), nil)
        case "calendar_alarm_authorization":
            Self.authorization(request: (payload["request"] as? Bool) ?? false, completion: completion)
        case "calendar_alarm_schedule":
            guard let descriptor = payload["alarm"] as? [String: Any] else {
                Self.respond(completion, ["ok": false], "calendar_alarm_missing_payload")
                return
            }
            Self.schedule(descriptors: [descriptor], cancelStaleAfter: false, completion: completion)
        case "calendar_alarm_cancel":
            Self.cancel(ids: Self.ids(from: payload), completion: completion)
        case "calendar_alarm_list":
            Self.list(completion: completion)
        case "calendar_alarm_sync":
            let descriptors = (payload["alarms"] as? [[String: Any]]) ?? []
            Self.schedule(descriptors: descriptors, cancelStaleAfter: true, completion: completion)
        default:
            Self.respond(completion, ["ok": false], "Unsupported calendar alarm command: \(command)")
        }
    }

    // MARK: - Platform and authorization

    private static func platformPayload() -> [String: Any] {
        if #available(iOS 26.0, *) {
            return ["ok": true, "platform": "alarmkit", "available": true, "fallback": false]
        }
        return ["ok": true, "platform": "notification", "available": true, "fallback": true]
    }

    private static func authorization(request: Bool,
                                      completion: @escaping ([String: Any], String?) -> Void) {
        if #available(iOS 26.0, *) {
            let manager = AlarmManager.shared
            let current = manager.authorizationState
            guard request, current == .notDetermined else {
                respond(completion, ["ok": true, "platform": "alarmkit", "status": name(current), "granted": current == .authorized], nil)
                return
            }
            Task {
                do {
                    let state = try await manager.requestAuthorization()
                    respond(completion, ["ok": true, "platform": "alarmkit", "status": name(state), "granted": state == .authorized], nil)
                } catch {
                    respond(completion, ["ok": false, "platform": "alarmkit", "status": name(current)], "calendar_alarm_authorization_failed")
                }
            }
            return
        }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            let current = settings.authorizationStatus
            if request, current == .notDetermined {
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                    respond(completion, ["ok": true, "platform": "notification", "status": granted ? "authorized" : "denied", "granted": granted], nil)
                }
                return
            }
            respond(completion, ["ok": true, "platform": "notification",
                                 "status": notificationStatusName(current),
                                 "granted": current == .authorized || current == .provisional], nil)
        }
    }

    @available(iOS 26.0, *)
    private static func name(_ state: AlarmManager.AuthorizationState) -> String {
        switch state {
        case .notDetermined: return "notDetermined"
        case .denied: return "denied"
        case .authorized: return "authorized"
        @unknown default: return "notDetermined"
        }
    }

    private static func notificationStatusName(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "notDetermined"
        @unknown default: return "notDetermined"
        }
    }

    // MARK: - Scheduling

    /// Schedules (or replaces) every provided descriptor, then — when asked —
    /// cancels the atome alarms that were known before and are absent from this
    /// set. Idempotent by construction: the stable id makes replacement safe,
    /// and only ids this app already owned can ever be canceled.
    private static func schedule(descriptors: [[String: Any]],
                                 cancelStaleAfter: Bool,
                                 completion: @escaping ([String: Any], String?) -> Void) {
        var desired: [String: [String: Any]] = [:]
        for descriptor in descriptors {
            guard let id = (descriptor["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else { continue }
            desired[id] = descriptor
        }
        let stale = cancelStaleAfter ? ownedIds().subtracting(desired.keys) : []

        if #available(iOS 26.0, *) {
            // A sync is the moment an alarm first becomes real: ask once, never
            // again after a refusal (requestAuthorization returns the state).
            let task = Task { () -> [String: Any] in
                if !desired.isEmpty, AlarmManager.shared.authorizationState == .notDetermined {
                    _ = try? await AlarmManager.shared.requestAuthorization()
                }
                var scheduled: [String] = []
                var skipped: [String] = []
                var failed: [String: String] = [:]
                for (id, descriptor) in desired {
                    let result = await applyAlarmKit(id: id, descriptor: descriptor)
                    switch result {
                    case .success: scheduled.append(id)
                    case .skipped: skipped.append(id)
                    case .failure(let error): failed[id] = error
                    }
                }
                for id in stale {
                    try? AlarmManager.shared.cancel(id: nativeId(for: id))
                    unmarkOwned([id])
                }
                markOwned(scheduled)
                return ["ok": failed.isEmpty,
                        "platform": "alarmkit",
                        "scheduled": scheduled,
                        "skipped": skipped,
                        "failed": failed,
                        "canceled": Array(stale)]
            }
            Task {
                let payload = await task.value
                respond(completion, payload, payload["ok"] as? Bool == true ? nil : "calendar_alarm_schedule_failed")
            }
            return
        }
        scheduleNotifications(desired: desired, stale: stale, completion: completion)
    }

    @available(iOS 26.0, *)
    private enum ApplyResult {
        case success
        case skipped
        case failure(String)
    }

    @available(iOS 26.0, *)
    private static func applyAlarmKit(id: String, descriptor: [String: Any]) async -> ApplyResult {
        let uuid = nativeId(for: id)
        guard let schedule = alarmKitSchedule(from: descriptor) else { return .skipped }
        let title = (descriptor["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let attributes = AlarmAttributes(
            presentation: alarmPresentation(title: (title?.isEmpty == false) ? title! : "Atome"),
            metadata: AtomeAlarmMetadata(eventId: descriptor["eventId"] as? String ?? "", alarmId: id),
            tintColor: .orange)
        let configuration = AlarmManager.AlarmConfiguration<AtomeAlarmMetadata>.alarm(schedule: schedule, attributes: attributes)
        // Replace instead of stacking: the stable id makes the second schedule
        // the only one, but an explicit cancel also covers an entry whose
        // schedule changed shape (fixed → relative).
        try? AlarmManager.shared.cancel(id: uuid)
        do {
            _ = try await AlarmManager.shared.schedule(id: uuid, configuration: configuration)
            return .success
        } catch {
            return .failure("calendar_alarm_schedule_failed")
        }
    }

    @available(iOS 26.0, *)
    private static func alarmPresentation(title: String) -> AlarmPresentation {
        let text = LocalizedStringResource("\(title)")
        if #available(iOS 26.1, *) {
            return AlarmPresentation(alert: AlarmPresentation.Alert(title: text))
        }
        return AlarmPresentation(alert: AlarmPresentation.Alert(
            title: text,
            stopButton: AlarmButton(text: LocalizedStringResource("Stop"),
                                    textColor: .white,
                                    systemImageName: "stop.fill")))
    }

    @available(iOS 26.0, *)
    private static func alarmKitSchedule(from descriptor: [String: Any]) -> Alarm.Schedule? {
        let mode = (descriptor["mode"] as? String) ?? "fixed"
        if mode == "relative", let hour = descriptor["hour"] as? Int, let minute = descriptor["minute"] as? Int {
            let weekdays = (descriptor["weekdays"] as? [Int] ?? []).compactMap(localeWeekday)
            let repeats: Alarm.Schedule.Relative.Recurrence = weekdays.isEmpty ? .never : .weekly(weekdays)
            return .relative(Alarm.Schedule.Relative(time: .init(hour: hour, minute: minute), repeats: repeats))
        }
        guard let fireAt = descriptor["fireAt"] as? String,
              let date = ISO8601DateFormatter().date(from: fireAt),
              date > Date() else { return nil }
        return .fixed(date)
    }

    /// JS weekday numbers follow `Date.getDay()` (1 = Sunday … 7 = Saturday);
    /// AlarmKit wants `Locale.Weekday`, whose raw values are names.
    @available(iOS 26.0, *)
    private static func localeWeekday(_ value: Int) -> Locale.Weekday? {
        switch value {
        case 1: return .sunday
        case 2: return .monday
        case 3: return .tuesday
        case 4: return .wednesday
        case 5: return .thursday
        case 6: return .friday
        case 7: return .saturday
        default: return nil
        }
    }

    // MARK: - Fallback notifications (pre-iOS 26)

    private static func scheduleNotifications(desired: [String: [String: Any]],
                                              stale: Set<String>,
                                              completion: @escaping ([String: Any], String?) -> Void) {
        let center = UNUserNotificationCenter.current()
        let group = DispatchGroup()
        var scheduled: [String] = []
        var skipped: [String] = []
        let lock = NSLock()
        for (id, descriptor) in desired {
            guard let request = notificationRequest(id: id, descriptor: descriptor) else {
                lock.lock(); skipped.append(id); lock.unlock()
                continue
            }
            group.enter()
            center.add(request) { error in
                lock.lock()
                if error == nil { scheduled.append(id) }
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .main) {
            let identifiers = stale.map { notificationIdentifier(for: $0) }
            if !identifiers.isEmpty { center.removePendingNotificationRequests(withIdentifiers: identifiers) }
            unmarkOwned(Array(stale))
            markOwned(scheduled)
            respond(completion, ["ok": true, "platform": "notification", "scheduled": scheduled,
                                 "skipped": skipped, "canceled": Array(stale)], nil)
        }
    }

    private static func notificationRequest(id: String, descriptor: [String: Any]) -> UNNotificationRequest? {
        let mode = (descriptor["mode"] as? String) ?? "fixed"
        let content = UNMutableNotificationContent()
        let title = (descriptor["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        content.title = (title?.isEmpty == false) ? title! : "Atome"
        content.sound = .default
        let trigger: UNNotificationTrigger?
        if mode == "relative", let hour = descriptor["hour"] as? Int, let minute = descriptor["minute"] as? Int {
            var components = DateComponents()
            components.hour = hour
            components.minute = minute
            let weekdays = descriptor["weekdays"] as? [Int] ?? []
            // UNCalendarNotificationTrigger cannot express a set of weekdays in
            // one request: AlarmKit is the only clean path for that on iOS 26+.
            // Pre-26 falls back to the first weekday of the set, or daily.
            components.weekday = weekdays.first ?? 0
            trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: !weekdays.isEmpty)
        } else if let fireAt = descriptor["fireAt"] as? String,
                  let date = ISO8601DateFormatter().date(from: fireAt), date > Date() {
            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
            trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        } else {
            trigger = nil
        }
        guard let trigger else { return nil }
        return UNNotificationRequest(identifier: notificationIdentifier(for: id), content: content, trigger: trigger)
    }

    private static func notificationIdentifier(for atomeId: String) -> String {
        notificationPrefix + nativeId(for: atomeId).uuidString.lowercased()
    }

    // MARK: - Cancellation and inventory

    private static func cancel(ids: [String], completion: @escaping ([String: Any], String?) -> Void) {
        let atomeIds = ids.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !atomeIds.isEmpty else {
            respond(completion, ["ok": true, "canceled": []], nil)
            return
        }
        if #available(iOS 26.0, *) {
            for id in atomeIds { try? AlarmManager.shared.cancel(id: nativeId(for: id)) }
        } else {
            let identifiers = atomeIds.map { notificationIdentifier(for: $0) }
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: identifiers)
        }
        unmarkOwned(atomeIds)
        respond(completion, ["ok": true, "canceled": atomeIds], nil)
    }

    private static func list(completion: @escaping ([String: Any], String?) -> Void) {
        let owned = ownedIds()
        if #available(iOS 26.0, *) {
            let current = (try? AlarmManager.shared.alarms) ?? []
            let present = Set(current.map { $0.id.uuidString.lowercased() })
            let ids = owned.filter { present.contains(nativeId(for: $0).uuidString.lowercased()) }.sorted()
            respond(completion, ["ok": true, "platform": "alarmkit", "ids": ids, "owned": Array(owned).sorted()], nil)
            return
        }
        UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
            let present = Set(requests.map { $0.identifier.lowercased() })
            let ids = owned.filter { present.contains(notificationIdentifier(for: $0).lowercased()) }.sorted()
            respond(completion, ["ok": true, "platform": "notification", "ids": ids, "owned": Array(owned).sorted()], nil)
        }
    }

    // MARK: - Stable identity

    private static func ids(from payload: [String: Any]) -> [String] {
        if let list = payload["ids"] as? [String] { return list }
        if let id = payload["id"] as? String { return [id] }
        return []
    }

    /// The same atome alarm id always yields the same Alarm.ID / notification
    /// identifier, on every launch and every device. A UUID that already is one
    /// is kept as is; any other string is hashed into a stable UUID shape.
    private static func nativeId(for atomeId: String) -> UUID {
        let trimmed = atomeId.trimmingCharacters(in: .whitespacesAndNewlines)
        if let uuid = UUID(uuidString: trimmed) { return uuid }
        var bytes = Array(SHA256.hash(data: Data(trimmed.utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }

    private static func ownedIds() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: ownedIdsKey) ?? [])
    }

    private static func markOwned(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        UserDefaults.standard.set(Array(ownedIds().union(ids)), forKey: ownedIdsKey)
    }

    private static func unmarkOwned(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        UserDefaults.standard.set(Array(ownedIds().subtracting(ids)), forKey: ownedIdsKey)
    }

    private static func respond(_ completion: @escaping ([String: Any], String?) -> Void,
                                _ payload: [String: Any],
                                _ error: String?) {
        DispatchQueue.main.async { completion(payload, error) }
    }
}

@available(iOS 26.0, *)
private struct AtomeAlarmMetadata: AlarmMetadata {
    var eventId: String
    var alarmId: String
}
