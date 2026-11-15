import EventKit
import Foundation

/// eVe's appointments in the iPhone's own calendar (eVe/intuition/tools/calendar_device_export.js).
///
/// The page hands the whole set of the person's appointments; they are kept in a calendar of eVe's own, « eVe »,
/// on the default calendar's account: an appointment new or changed is written again, one the set no longer holds is
/// removed, so the calendar always matches eVe. Which native event stands for which appointment, and what it was
/// written from, are kept here. The import never reads this calendar back (NativePersonalImport.readCalendar).
final class NativeDeviceCalendar {
    static let shared = NativeDeviceCalendar()
    /// Also read by NativePersonalImport, which skips this calendar.
    static let calendarIdKey = "atome_device_calendar_id"
    private static let mapKey = "atome_device_calendar_map"
    private let store = EKEventStore()

    private init() {}

    static func canHandle(command: String) -> Bool { command.hasPrefix("calendar_export_") }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        let reply: ([String: Any]) -> Void = { result in DispatchQueue.main.async { completion(result, nil) } }
        switch command {
        case "calendar_export_authorization":
            authorize(request: (payload["request"] as? Bool) ?? false) { granted, status in reply(["ok": true, "granted": granted, "status": status]) }
        case "calendar_export_sync":
            let events = payload["events"] as? [[String: Any]] ?? []
            // Nothing of eVe's can lie in a calendar it was never allowed to write: an empty set asks nothing.
            authorize(request: !events.isEmpty) { granted, status in
                guard granted else {
                    reply(events.isEmpty ? ["ok": true, "cleared": true] : ["ok": false, "error": "calendar_full_access_required_settings", "status": status])
                    return
                }
                DispatchQueue.global(qos: .utility).async { reply(self.sync(events)) }
            }
        default:
            reply(["ok": false, "error": "calendar_export_command_unsupported"])
        }
    }

    // MARK: - Authorization (full access: an appointment written is changed and removed later)

    private func authorize(request: Bool, done: @escaping (Bool, String) -> Void) {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            if status == .fullAccess { return done(true, "authorized") }
        } else if status == .authorized { return done(true, "authorized") }
        guard request, status == .notDetermined else { return done(false, status == .notDetermined ? "not_determined" : "denied") }
        let answer: (Bool, Error?) -> Void = { granted, _ in done(granted, granted ? "authorized" : "denied") }
        if #available(iOS 17.0, *) { store.requestFullAccessToEvents(completion: answer) }
        else { store.requestAccess(to: .event, completion: answer) }
    }

    // MARK: - The « eVe » calendar and its events

    private func calendar() throws -> EKCalendar {
        if let id = UserDefaults.standard.string(forKey: Self.calendarIdKey), let found = store.calendar(withIdentifier: id) { return found }
        let calendar = EKCalendar(for: .event, eventStore: store)
        calendar.title = "eVe"
        guard let source = store.defaultCalendarForNewEvents?.source ?? store.sources.first(where: { $0.sourceType == .local }) else {
            throw ExportError(code: "calendar_export_source_missing")
        }
        calendar.source = source
        try store.saveCalendar(calendar, commit: true)
        UserDefaults.standard.set(calendar.calendarIdentifier, forKey: Self.calendarIdKey)
        return calendar
    }

    private struct ExportError: Error { let code: String }

    private func sync(_ events: [[String: Any]]) -> [String: Any] {
        let calendar: EKCalendar
        do { calendar = try self.calendar() } catch { return ["ok": false, "error": (error as? ExportError)?.code ?? "calendar_export_calendar_failed"] }
        var map = UserDefaults.standard.dictionary(forKey: Self.mapKey) as? [String: [String: String]] ?? [:]
        var written: [String] = [], removed: [String] = [], failed: [String: String] = [:]
        let wanted = Set(events.compactMap { $0["id"] as? String })
        for (id, entry) in map where !wanted.contains(id) {
            if let native = entry["native"], let event = store.event(withIdentifier: native) { try? store.remove(event, span: .futureEvents, commit: false) }
            map[id] = nil
            removed.append(id)
        }
        for descriptor in events {
            guard let id = descriptor["id"] as? String else { continue }
            let signature = Self.signature(descriptor)
            if let entry = map[id], entry["signature"] == signature, let native = entry["native"], store.event(withIdentifier: native) != nil { continue }
            // A changed appointment is written anew: its series' old occurrences and exceptions leave with the old one.
            if let native = map[id]?["native"], let event = store.event(withIdentifier: native) { try? store.remove(event, span: .futureEvents, commit: false) }
            do {
                let event = try write(descriptor, in: calendar)
                map[id] = ["native": event.eventIdentifier, "signature": signature]
                written.append(id)
            } catch {
                map[id] = nil
                failed[id] = (error as? ExportError)?.code ?? "calendar_export_event_failed"
            }
        }
        do { try store.commit() } catch { return ["ok": false, "error": "calendar_export_commit_failed"] }
        UserDefaults.standard.set(map, forKey: Self.mapKey)
        return ["ok": failed.isEmpty, "written": written, "removed": removed, "failed": failed]
    }

    private static func signature(_ descriptor: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: descriptor, options: [.sortedKeys]) else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }

    private static func date(_ value: Any?) -> Date? {
        guard let text = value as? String else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }

    private func write(_ descriptor: [String: Any], in calendar: EKCalendar) throws -> EKEvent {
        guard let start = Self.date(descriptor["start"]) else { throw ExportError(code: "calendar_export_start_invalid") }
        let end = Self.date(descriptor["end"]) ?? start
        let allDay = descriptor["allDay"] as? Bool ?? false
        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = (descriptor["title"] as? String) ?? ""
        event.notes = (descriptor["notes"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        event.location = (descriptor["location"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        event.isAllDay = allDay
        event.startDate = start
        // An all-day end is exclusive in eVe (the next midnight), inclusive in EventKit.
        event.endDate = allDay ? max(start, end.addingTimeInterval(-1)) : max(start, end)
        if !allDay, let zone = (descriptor["timezone"] as? String).flatMap(TimeZone.init(identifier:)) { event.timeZone = zone }
        if let rrule = descriptor["rrule"] as? String, !rrule.isEmpty {
            guard let rule = Self.recurrenceRule(rrule) else { throw ExportError(code: "calendar_export_rule_unsupported") }
            event.recurrenceRules = [rule]
        }
        try store.save(event, span: .futureEvents, commit: false)
        for exdate in (descriptor["exdates"] as? [String] ?? []).compactMap(Self.date) { removeOccurrence(of: event, at: exdate, in: calendar) }
        return event
    }

    private func removeOccurrence(of series: EKEvent, at date: Date, in calendar: EKCalendar) {
        let predicate = store.predicateForEvents(withStart: date.addingTimeInterval(-60), end: date.addingTimeInterval(60), calendars: [calendar])
        for occurrence in store.events(matching: predicate) where occurrence.eventIdentifier == series.eventIdentifier
            && abs((occurrence.occurrenceDate ?? occurrence.startDate).timeIntervalSince(date)) < 1 {
            try? store.remove(occurrence, span: .thisEvent, commit: false)
        }
    }

    // MARK: - RRULE (RFC 5545) → EKRecurrenceRule

    private static let weekdays: [String: EKWeekday] = ["SU": .sunday, "MO": .monday, "TU": .tuesday, "WE": .wednesday,
                                                         "TH": .thursday, "FR": .friday, "SA": .saturday]

    static func recurrenceRule(_ rrule: String) -> EKRecurrenceRule? {
        var parts: [String: String] = [:]
        for part in rrule.split(separator: ";") {
            let pair = part.split(separator: "=", maxSplits: 1).map(String.init)
            if pair.count == 2 { parts[pair[0].uppercased()] = pair[1] }
        }
        let frequencies: [String: EKRecurrenceFrequency] = ["DAILY": .daily, "WEEKLY": .weekly, "MONTHLY": .monthly, "YEARLY": .yearly]
        guard let frequency = parts["FREQ"].flatMap({ frequencies[$0.uppercased()] }) else { return nil }
        let numbers = { (key: String) -> [NSNumber]? in parts[key].map { $0.split(separator: ",").compactMap { Int($0) }.map { NSNumber(value: $0) } } }
        var days: [EKRecurrenceDayOfWeek]?
        if let byDay = parts["BYDAY"] {
            days = []
            for token in byDay.split(separator: ",").map(String.init) {
                guard token.count >= 2, let weekday = weekdays[String(token.suffix(2)).uppercased()] else { return nil }
                let ordinal = Int(token.dropLast(2)) ?? 0
                days?.append(ordinal == 0 ? EKRecurrenceDayOfWeek(weekday) : EKRecurrenceDayOfWeek(weekday, weekNumber: ordinal))
            }
        }
        var end: EKRecurrenceEnd?
        if let count = parts["COUNT"].flatMap(Int.init) { end = EKRecurrenceEnd(occurrenceCount: count) }
        else if let until = parts["UNTIL"] {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = until.hasSuffix("Z") ? TimeZone(identifier: "UTC") : .current
            formatter.dateFormat = until.count == 8 ? "yyyyMMdd" : (until.hasSuffix("Z") ? "yyyyMMdd'T'HHmmss'Z'" : "yyyyMMdd'T'HHmmss")
            guard let date = formatter.date(from: until) else { return nil }
            end = EKRecurrenceEnd(end: until.count == 8 ? date.addingTimeInterval(86_399) : date)
        }
        return EKRecurrenceRule(recurrenceWith: frequency, interval: max(1, parts["INTERVAL"].flatMap(Int.init) ?? 1),
                                daysOfTheWeek: days, daysOfTheMonth: numbers("BYMONTHDAY"), monthsOfTheYear: numbers("BYMONTH"),
                                weeksOfTheYear: nil, daysOfTheYear: nil, setPositions: numbers("BYSETPOS"), end: end)
    }
}
