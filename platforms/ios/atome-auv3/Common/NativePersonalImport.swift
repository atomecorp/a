import Foundation
import Contacts
import EventKit
import UIKit

// Read-only personal data bridge. Canonical commits and cursors belong to JavaScript.
final class NativePersonalImport {
    static let shared = NativePersonalImport()
    private let contacts = CNContactStore()
    private let events = EKEventStore()
    private let queue = DispatchQueue(label: "atome.personal.import", qos: .utility)
    private var observers: [NSObjectProtocol] = []
    private let iso = ISO8601DateFormatter()

    private func watch() {
        guard observers.isEmpty else { return }
        for (name, domain) in [(Notification.Name.CNContactStoreDidChange, "contact"),
                               (Notification.Name.EKEventStoreChanged, "calendar_event")] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { _ in
                WebViewManager.evaluateJS("window.dispatchEvent(new CustomEvent('atome:native-source-changed',{detail:{domain:'\(domain)'}}));",
                                          label: "personal.import.changed")
            })
        }
    }

    func handle(_ command: String, payload: [String: Any], completion: @escaping ([String: Any]?, String?) -> Void) {
        guard !WebViewManager.runningInExtension else { completion(nil, "personal_import_app_required"); return }
        if command == "export_file_save" { save(payload, completion: completion); return }
        if command == "export_file_share" { share(payload, completion: completion); return }
        watch()
        let read = { self.queue.async {
            do {
                let result = try command == "macos_contacts_snapshot" ? self.readContacts(payload) : self.readCalendar(payload)
                completion(result, nil)
            } catch { completion(nil, "personal_import_read_failed:\((error as NSError).code)") }
        } }
        if command == "macos_contacts_snapshot" {
            contacts.requestAccess(for: .contacts) { granted, _ in
                guard granted else { completion(nil, "contacts_permission_denied"); return }; read()
            }
        } else {
            let permission: (Bool, Error?) -> Void = { granted, _ in
                guard granted else { completion(nil, "calendar_full_access_required"); return }; read()
            }
            if #available(iOS 17.0, *) { events.requestFullAccessToEvents(completion: permission) }
            else { events.requestAccess(to: .event, completion: permission) }
        }
    }

    private func readContacts(_ payload: [String: Any]) throws -> [String: Any] {
        // Notes need a separate entitlement: unread notes must not erase canonical notes.
        let keys = [CNContactIdentifierKey, CNContactGivenNameKey, CNContactMiddleNameKey, CNContactFamilyNameKey,
                    CNContactNamePrefixKey, CNContactNameSuffixKey, CNContactNicknameKey, CNContactOrganizationNameKey,
                    CNContactJobTitleKey, CNContactDepartmentNameKey, CNContactPhoneNumbersKey, CNContactEmailAddressesKey,
                    CNContactPostalAddressesKey, CNContactUrlAddressesKey, CNContactThumbnailImageDataKey,
                    CNContactBirthdayKey, CNContactDatesKey, CNContactSocialProfilesKey, CNContactInstantMessageAddressesKey] as [CNKeyDescriptor]
            + [CNContactFormatter.descriptorForRequiredKeys(for: .fullName)]
        let token = (payload["cursor"] as? String).flatMap { Data(base64Encoded: $0) }
        var error: NSError?
        guard let history = AtomeContactHistory.read(store: contacts, token: token, keys: keys, error: &error) as? [String: Any]
        else { throw error ?? NSError(domain: "ContactHistory", code: 1) }
        let groups = try contacts.groups(matching: nil)
        var membership = [String: [String]](), groupMembers = [String: [String]]()
        for group in groups {
            let members = try contacts.unifiedContacts(matching: CNContact.predicateForContactsInGroup(withIdentifier: group.identifier),
                                                      keysToFetch: [CNContactIdentifierKey as CNKeyDescriptor])
            for contact in members { membership[contact.identifier, default: []].append(group.identifier) }
            groupMembers[group.identifier] = members.map(\.identifier)
        }
        let items = (history["contacts"] as? [CNContact] ?? []).map { contact -> [String: Any] in
            let phones = contact.phoneNumbers.map { ["label": $0.label ?? "", "value": $0.value.stringValue] }
            let emails = contact.emailAddresses.map { ["label": $0.label ?? "", "value": $0.value as String] }
            var item: [String: Any] = ["id": contact.identifier, "first_name": contact.givenName, "middle_name": contact.middleName,
                    "last_name": contact.familyName, "prefix": contact.namePrefix, "suffix": contact.nameSuffix,
                    "nickname": contact.nickname, "name": CNContactFormatter.string(from: contact, style: .fullName) ?? contact.organizationName,
                    "organization": contact.organizationName, "title": contact.jobTitle, "phones": phones, "emails": emails,
                    "urls": contact.urlAddresses.map { ["label": $0.label ?? "", "value": $0.value as String] },
                    "addresses": contact.postalAddresses.map { entry in
                        ["label": entry.label ?? "", "values": ["", "", entry.value.street, entry.value.city,
                         entry.value.state, entry.value.postalCode, entry.value.country]] as [String: Any]
                    }, "collections": membership[contact.identifier] ?? []]
            item["birthday"] = Self.contactDate(contact.birthday)
            item["extra_properties"] = contact.dates.map { entry in
                ["name": "X-ABDATE", "value": Self.contactDate(entry.value as DateComponents),
                 "params": ["TYPE": entry.label ?? "other"]] as [String: Any]
            } + contact.socialProfiles.map { entry in
                ["name": "X-SOCIALPROFILE", "value": entry.value.urlString,
                 "params": ["TYPE": entry.value.service, "X-USER": entry.value.username]] as [String: Any]
            } + contact.instantMessageAddresses.map { entry in
                ["name": "IMPP", "value": entry.value.service + ":" + entry.value.username,
                 "params": ["TYPE": entry.label ?? "other"]] as [String: Any]
            }
            if let data = contact.thumbnailImageData {
                if let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.85), jpeg.count <= 512 * 1024 {
                    item["photo"] = "data:image/jpeg;base64," + jpeg.base64EncodedString()
                }
            } else { item["photo"] = "" }
            return item
        }
        return ["ok": true, "complete": true, "permission": "authorized", "contacts": items,
                "groups": groups.map { ["id": $0.identifier, "name": $0.name, "members": groupMembers[$0.identifier] ?? []] as [String: Any] }, "cursor": history["cursor"] ?? "",
                "mode": history["mode"] ?? "snapshot", "removed_ids": history["removed_ids"] ?? []]
    }

    private static func contactDate(_ date: DateComponents?) -> String {
        guard let date = date, let month = date.month, let day = date.day else { return "" }
        let year = date.year.map { String(format: "%04d", $0) } ?? "--"
        return year + String(format: "%02d%02d", month, day)
    }

    private func readCalendar(_ payload: [String: Any]) throws -> [String: Any] {
        let currentYear = Calendar(identifier: .gregorian).component(.year, from: Date())
        let earliest = max(1900, min(currentYear, payload["startYear"] as? Int ?? 1970))
        let latest = currentYear + max(1, min(20, payload["futureYears"] as? Int ?? 5))
        let cursor = payload["cursor"] as? [String: Any]
        let next = cursor?["next_year"] as? Int
        let startYear = next ?? currentYear - 1
        let endYear = next == nil ? currentYear + 2 : min(startYear + 1, latest + 1)
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let start = calendar.date(from: DateComponents(year: startYear, month: 1, day: 1))!
        let end = calendar.date(from: DateComponents(year: endYear, month: 1, day: 1))!
        let selected = Set(payload["collections"] as? [String] ?? [])
        let collections = events.calendars(for: .event).filter { selected.isEmpty || selected.contains($0.calendarIdentifier) }
        let predicate = events.predicateForEvents(withStart: start, end: end, calendars: collections)
        let items = events.events(matching: predicate).map { event -> [String: Any] in
            // EventKit queries return instances; use an immutable occurrence identity.
            let external = event.calendarItemExternalIdentifier ?? event.calendarItemIdentifier
            let occurrence = event.occurrenceDate ?? event.startDate!
            let id = event.calendar.calendarIdentifier + "/" + external
                + (event.hasRecurrenceRules || event.isDetached ? "/" + iso.string(from: occurrence) : "")
            return ["id": id, "uid": id, "calendarId": event.calendar.calendarIdentifier,
                    "title": event.title ?? "", "description": event.notes ?? "", "location": event.location ?? "",
                    "start": eventDate(event.startDate, event), "end": eventDate(event.endDate, event),
                    "allDay": event.isAllDay, "timezone": event.timeZone?.identifier ?? "UTC",
                    "status": event.status == .canceled ? "cancelled" : "open",
                    "updatedAt": event.lastModifiedDate.map(iso.string(from:)) ?? "",
                    "alarms": [], "native_series_id": external]
        }
        let upcoming = next == nil ? earliest : endYear
        let more = upcoming <= latest
        return ["ok": true, "complete": true, "more": more, "items": items,
                "calendars": collections.map { ["id": $0.calendarIdentifier, "name": $0.title] },
                "coverage": ["start": iso.string(from: start), "end": iso.string(from: end)],
                "cursor": more ? ["next_year": upcoming] : ["completed": true]]
    }

    private func eventDate(_ date: Date, _ event: EKEvent) -> String {
        if !event.isAllDay { return iso.string(from: date) }
        let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX")
        format.timeZone = event.timeZone ?? TimeZone.current; format.dateFormat = "yyyy-MM-dd"
        return format.string(from: date)
    }

    private func save(_ payload: [String: Any], completion: @escaping ([String: Any]?, String?) -> Void) {
        guard let name = payload["name"] as? String, !name.isEmpty, name.utf8.count < 180,
              !name.contains("/"), !name.contains("\\"), name != ".", name != "..",
              let encoded = payload["dataBase64"] as? String, encoded.count < 90_000_000,
              let data = Data(base64Encoded: encoded), data.count <= 64 * 1024 * 1024 else {
            completion(nil, "export_payload_invalid"); return
        }
        DispatchQueue.main.async {
            guard var presenter = WebViewManager.webView?.window?.rootViewController else {
                completion(nil, "export_presenter_unavailable"); return
            }
            while let child = presenter.presentedViewController { presenter = child }
            iCloudFileManager.shared.saveFileWithDocumentPicker(data: data, fileName: name, from: presenter) { ok, _ in
                completion(["success": ok, "cancelled": !ok], nil)
            }
        }
    }

    // Hands an exported file to the system share sheet (social sharing: TikTok,
    // Instagram or Facebook finish the post in their own app). The answer only
    // says whether a receiver accepted it and which one — never that it posted.
    private func share(_ payload: [String: Any], completion: @escaping ([String: Any]?, String?) -> Void) {
        guard let name = payload["name"] as? String, !name.isEmpty, name.utf8.count < 180,
              !name.contains("/"), !name.contains("\\"), name != ".", name != "..",
              let encoded = payload["dataBase64"] as? String, encoded.count < 90_000_000,
              let data = Data(base64Encoded: encoded), data.count <= 64 * 1024 * 1024 else {
            completion(nil, "export_payload_invalid"); return
        }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("atome-share-\(UUID().uuidString)", isDirectory: true)
        let file = folder.appendingPathComponent(name)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: file)
        } catch { completion(nil, "export_write_failed"); return }
        DispatchQueue.main.async {
            guard var presenter = WebViewManager.webView?.window?.rootViewController else {
                try? FileManager.default.removeItem(at: folder)
                completion(nil, "export_presenter_unavailable"); return
            }
            while let child = presenter.presentedViewController { presenter = child }
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            sheet.completionWithItemsHandler = { activity, completed, _, error in
                try? FileManager.default.removeItem(at: folder)
                completion(["success": completed, "cancelled": !completed && error == nil,
                            "activity_type": activity?.rawValue ?? NSNull()], nil)
            }
            presenter.present(sheet, animated: true)
        }
    }
}
