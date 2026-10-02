import Foundation
import WebKit
import Security
#if canImport(UIKit)
import UIKit
#endif
#if canImport(HealthKit)
import HealthKit
#endif
#if canImport(CoreMotion)
import CoreMotion
#endif

// The single HealthKit / CoreMotion owner of the iOS app, read-only.
//
// Contract (mirrors atome/src/squirrel/health/health_channel.js):
// - `health_channel_open` issues ONE channel token per page load; every other
//   command must carry it. A navigation of the main frame resets it.
// - Identity comes from the local session token, verified here with
//   `AiSRuntime.verifyToken`; a JavaScript user id is never trusted. Guests
//   (no `grant` claim) cannot use health.
// - The device store is associated to an account only by an explicit
//   `health_link`, stored in this device's keychain (not synchronizable).
// - Values only travel in invoke replies. The page is only told that a monitor
//   was invalidated (no value), and re-reads it through the channel.
// - Every request carries the controller generation; a callback from an older
//   generation neither answers with data nor re-arms an observer.
final class AppNativeHealthController {
    static let shared = AppNativeHealthController()

    private static let commands: Set<String> = [
        "health_channel_open", "health_channel_close", "health_capabilities", "health_link_status",
        "health_link", "health_request_access", "health_read", "health_observe", "health_unobserve",
        "health_context_reset", "health_open_settings"
    ]
    private static let maxRequests = 32
    static let maxSamples = 200
    static let maxSleepSamples = 2000

    private weak var webView: WKWebView?
    // Injected by the app target (UIApplication.shared is unavailable in the
    // AUv3 extension, which refuses every health command anyway).
    private var settingsOpener: (() -> Void)?
    private let stateQueue = DispatchQueue(label: "one.atome.health.state")
    private var channelToken: String?
    private var channelClosed = false
    private var generation: UInt64 = 0
    private var accessInFlight = false

    #if canImport(HealthKit)
    let healthStore = HKHealthStore()
    private var observers: [String: HKObserverQuery] = [:]
    #endif
    #if canImport(CoreMotion)
    private let pedometer = CMPedometer()
    private var pedometerLive = false
    private var lastPedometerSignal = Date.distantPast
    #endif

    private init() {
        #if canImport(UIKit)
        NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil) { [weak self] _ in
            self?.signalAllObserved()
            // Access may have been changed in Settings / Health meanwhile: the
            // page re-checks it (value-less signal, like every invalidation).
            self?.signalAccessChanged()
        }
        #endif
    }

    static func canHandle(command: String) -> Bool { commands.contains(command) }

    func attach(webView: WKWebView, openSettings: (() -> Void)? = nil) {
        self.webView = webView
        self.settingsOpener = openSettings
    }

    // Main-frame navigation: the next page load claims a fresh channel.
    func pageWillLoad() {
        stateQueue.async {
            self.generation &+= 1
            self.channelToken = nil
            self.channelClosed = false
            self.stopEverything()
        }
    }

    // MARK: - Dispatch

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        let reply: ([String: Any]) -> Void = { result in completion(result, nil) }
        let fail: (String) -> Void = { code in completion(["ok": false, "error": code], nil) }
        stateQueue.async {
            if command == "health_channel_open" {
                guard self.channelToken == nil, !self.channelClosed else { return fail("health_channel_already_open") }
                var bytes = [UInt8](repeating: 0, count: 32)
                guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return fail("health_channel_unavailable") }
                let token = bytes.map { String(format: "%02x", $0) }.joined()
                self.channelToken = token
                return reply(["channel": token])
            }
            guard !self.channelClosed, let token = self.channelToken,
                  let presented = payload["channel"] as? String, presented == token else {
                return fail("health_channel_invalid")
            }
            let generation = self.generation
            switch command {
            case "health_channel_close":
                self.channelClosed = true
                self.generation &+= 1
                self.stopEverything()
                reply(["closed": true])
            case "health_context_reset":
                self.generation &+= 1
                self.stopEverything()
                reply(["reset": true])
            case "health_capabilities":
                self.capabilities(ids: Self.monitorIds(payload["monitors"]), generation: generation, reply: reply)
            case "health_open_settings":
                // Opens this app's page in Settings (Motion & Fitness, Health
                // access). There is no API that re-shows a refused sheet.
                guard let opener = self.settingsOpener else { return fail("health_settings_unavailable") }
                DispatchQueue.main.async { opener() }
                reply(["opened": true])
            default:
                guard let account = Self.verifiedAccount(payload["auth"]) else { return fail("health_account_required") }
                self.handleAccountCommand(command, account: account, payload: payload, generation: generation, reply: reply, fail: fail)
            }
        }
    }

    private func handleAccountCommand(_ command: String, account: String, payload: [String: Any], generation: UInt64,
                                      reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        switch command {
        case "health_link_status":
            reply(["linked": HealthLinkStore.isLinked(account)])
        case "health_link":
            HealthLinkStore.link(account) ? reply(["linked": true]) : fail("health_link_store_unavailable")
        default:
            guard HealthLinkStore.isLinked(account) else { return fail("health_link_required") }
            let ids = Self.monitorIds(payload["monitors"])
            switch command {
            case "health_request_access":
                requestAccess(ids: ids, generation: generation, reply: reply, fail: fail)
            case "health_read":
                read(requests: payload["requests"] as? [[String: Any]] ?? [], generation: generation, reply: reply, fail: fail)
            case "health_observe":
                reply(["observing": observe(ids: ids, generation: generation)])
            case "health_unobserve":
                unobserve(ids: ids)
                reply(["observing": Array(observedIds())])
            default:
                fail("health_command_unknown")
            }
        }
    }

    private static func monitorIds(_ value: Any?) -> [String] {
        let ids = (value as? [Any] ?? []).compactMap { $0 as? String }.filter { HealthMonitorTable.spec($0) != nil }
        return Array(Set(ids)).prefix(maxRequests).map { $0 }
    }

    // Verified on the canonical database queue, like every protected local API.
    private static func verifiedAccount(_ auth: Any?) -> String? {
        guard let token = auth as? String, !token.isEmpty else { return nil }
        let verified: [String: Any]? = AiSRuntime.queue.sync {
            guard let result = try? AiSRuntime.verifyToken(token) else { return nil }
            return result
        }
        guard let claims = verified, claims["grant"] is String,
              let subject = claims["sub"] as? String, !subject.isEmpty else { return nil }
        return subject
    }

    private func current(_ generation: UInt64) -> Bool { !channelClosed && generation == self.generation }

    private func signal(_ ids: [String]) {
        guard !ids.isEmpty, let data = try? JSONSerialization.data(withJSONObject: ["monitors": ids]),
              let json = String(data: data, encoding: .utf8) else { return }
        let script = "window.dispatchEvent(new CustomEvent('atome:native-health-invalidated',{detail:\(json)}));"
        DispatchQueue.main.async {
            WebViewManager.evaluateJS(script, label: "nativeHealthInvalidated", targetWebView: self.webView)
        }
    }

    private func signalAccessChanged() {
        DispatchQueue.main.async {
            WebViewManager.evaluateJS("window.dispatchEvent(new CustomEvent('atome:native-health-invalidated',{detail:{access:true}}));",
                                      label: "nativeHealthAccessChanged", targetWebView: self.webView)
        }
    }

    private func signalAllObserved() {
        stateQueue.async { self.signal(Array(self.observedIds())) }
    }

    private func observedIds() -> Set<String> {
        var ids = Set<String>()
        #if canImport(HealthKit)
        ids.formUnion(observers.keys)
        #endif
        #if canImport(CoreMotion)
        if pedometerLive { ids.insert("device_steps_today") }
        #endif
        return ids
    }

    private func stopEverything() {
        #if canImport(HealthKit)
        observers.values.forEach { healthStore.stop($0) }
        observers.removeAll()
        #endif
        #if canImport(CoreMotion)
        if pedometerLive { pedometer.stopUpdates() }
        pedometerLive = false
        #endif
    }

    // MARK: - Capabilities (never prompts)

    private func capabilities(ids: [String], generation: UInt64, reply: @escaping ([String: Any]) -> Void) {
        var monitors: [String: Any] = [:]
        #if canImport(HealthKit)
        let storeAvailable = HKHealthStore.isHealthDataAvailable()
        var pendingTypes: [(String, Set<HKObjectType>)] = []
        #else
        let storeAvailable = false
        #endif
        for id in ids {
            guard let spec = HealthMonitorTable.spec(id) else { continue }
            if spec.kind == .pedometer {
                #if canImport(CoreMotion)
                let status = CMPedometer.authorizationStatus()
                if !CMPedometer.isStepCountingAvailable() {
                    monitors[id] = ["supported": false, "reason": "health_sensor_unavailable"]
                } else if status == .denied || status == .restricted {
                    monitors[id] = ["supported": true, "access": status == .denied ? "denied" : "restricted"]
                } else {
                    monitors[id] = ["supported": true, "access": status == .authorized ? "granted" : "not_determined"]
                }
                #else
                monitors[id] = ["supported": false, "reason": "health_sensor_unavailable"]
                #endif
                continue
            }
            #if canImport(HealthKit)
            if !storeAvailable {
                monitors[id] = ["supported": false, "reason": "health_store_unavailable"]
            } else if let types = spec.authorizationTypes() {
                pendingTypes.append((id, types))
            } else {
                monitors[id] = ["supported": false, "reason": "health_os_version_unsupported"]
            }
            #endif
        }
        #if canImport(HealthKit)
        guard !pendingTypes.isEmpty else {
            return reply(["available": storeAvailable, "host": "ios_app", "monitors": monitors])
        }
        // Read grants are deliberately unknowable on HealthKit, but whether the
        // sheet was already shown for a type is not: `shouldRequest` = never
        // asked (the sheet will appear), `unnecessary` = already answered.
        // Asking for the status never shows anything.
        let group = DispatchGroup()
        let lock = NSLock()
        for (id, types) in pendingTypes {
            group.enter()
            healthStore.getRequestStatusForAuthorization(toShare: [], read: types) { status, error in
                let access = (error == nil && status == .shouldRequest) ? "not_determined" : "unknowable"
                lock.lock()
                monitors[id] = error == nil ? ["supported": true, "access": access]
                    : ["supported": false, "reason": "health_capability_check_failed"]
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: stateQueue) {
            guard self.current(generation) else { return reply(["ok": false, "error": "health_context_changed"]) }
            reply(["available": storeAvailable, "host": "ios_app", "monitors": monitors])
        }
        #else
        reply(["available": storeAvailable, "host": "ios_app", "monitors": monitors])
        #endif
    }

    // MARK: - Authorization (explicit gesture only, one sheet at a time)

    private func requestAccess(ids: [String], generation: UInt64, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        guard !accessInFlight else { return fail("health_access_request_in_flight") }
        let specs = ids.compactMap { HealthMonitorTable.spec($0) }
        accessInFlight = true
        let finish: ([String: Any]) -> Void = { result in
            self.stateQueue.async {
                self.accessInFlight = false
                self.current(generation) ? reply(result) : fail("health_context_changed")
            }
        }
        #if canImport(CoreMotion)
        let wantsMotion = specs.contains { $0.kind == .pedometer } && CMPedometer.authorizationStatus() == .notDetermined
        #else
        let wantsMotion = false
        #endif
        #if canImport(HealthKit)
        let readTypes = Set(specs.flatMap { Array($0.authorizationTypes() ?? []) })
        guard HKHealthStore.isHealthDataAvailable() || readTypes.isEmpty else {
            accessInFlight = false
            return fail("health_store_unavailable")
        }
        let requestMotion = {
            #if canImport(CoreMotion)
            guard wantsMotion else { return finish(["completed": true]) }
            // CoreMotion presents its sheet on the first query.
            let start = Calendar.current.startOfDay(for: Date())
            self.pedometer.queryPedometerData(from: start, to: Date()) { _, _ in finish(["completed": true]) }
            #else
            finish(["completed": true])
            #endif
        }
        guard !readTypes.isEmpty else { return requestMotion() }
        DispatchQueue.main.async {
            // Read only: the share set is always empty. Success means the
            // procedure completed, NOT that every read type was granted.
            self.healthStore.requestAuthorization(toShare: [], read: readTypes) { success, error in
                if !success {
                    return finish(["completed": false, "error": Self.statusCode(error)])
                }
                requestMotion()
            }
        }
        #else
        finish(["completed": false, "error": "health_store_unavailable"])
        #endif
    }

    // MARK: - Observation (invalidation signals only)

    private func observe(ids: [String], generation: UInt64) -> [String] {
        var started: [String] = []
        for id in ids {
            guard let spec = HealthMonitorTable.spec(id) else { continue }
            if spec.kind == .pedometer {
                #if canImport(CoreMotion)
                guard !pedometerLive, CMPedometer.authorizationStatus() == .authorized else { continue }
                pedometerLive = true
                pedometer.startUpdates(from: Calendar.current.startOfDay(for: Date())) { [weak self] _, _ in
                    guard let self else { return }
                    self.stateQueue.async {
                        guard self.current(generation), self.pedometerLive else { return }
                        // Throttled: one invalidation every 5 s at most.
                        guard Date().timeIntervalSince(self.lastPedometerSignal) >= 5 else { return }
                        self.lastPedometerSignal = Date()
                        self.signal([id])
                    }
                }
                started.append(id)
                #endif
                continue
            }
            #if canImport(HealthKit)
            guard observers[id] == nil, let type = spec.sampleType() else { continue }
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
                // Always complete; a stale generation never re-arms anything.
                defer { completionHandler() }
                guard let self, error == nil else { return }
                self.stateQueue.async {
                    guard self.current(generation), self.observers[id] != nil else { return }
                    self.signal([id])
                }
            }
            observers[id] = query
            healthStore.execute(query)
            started.append(id)
            #endif
        }
        return started
    }

    private func unobserve(ids: [String]) {
        for id in ids {
            #if canImport(HealthKit)
            if let query = observers.removeValue(forKey: id) { healthStore.stop(query) }
            #endif
            #if canImport(CoreMotion)
            if id == "device_steps_today", pedometerLive {
                pedometer.stopUpdates()
                pedometerLive = false
            }
            #endif
        }
    }

    // MARK: - Reads

    private func read(requests: [[String: Any]], generation: UInt64, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        let valid = requests.prefix(Self.maxRequests).compactMap { request -> (String, Date, Date)? in
            guard let id = request["id"] as? String, HealthMonitorTable.spec(id) != nil,
                  let from = request["from"] as? Double, let to = request["to"] as? Double, to >= from else { return nil }
            // Bounded window: at most ten years, never in the future.
            let end = min(Date(timeIntervalSince1970: to / 1000), Date())
            let start = max(Date(timeIntervalSince1970: from / 1000), end.addingTimeInterval(-3650 * 86400))
            return (id, start, end)
        }
        guard !valid.isEmpty else { return fail("health_request_invalid") }
        let group = DispatchGroup()
        let lock = NSLock()
        var results: [String: Any] = [:]
        for (id, start, end) in valid {
            guard let spec = HealthMonitorTable.spec(id) else { continue }
            group.enter()
            readOne(spec, from: start, to: end) { result in
                lock.lock(); results[id] = result; lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: stateQueue) {
            // A reply computed for an older generation is never delivered.
            self.current(generation) ? reply(["results": results]) : fail("health_context_changed")
        }
    }

    private func readOne(_ spec: HealthMonitorSpec, from: Date, to: Date, completion: @escaping ([String: Any]) -> Void) {
        if spec.kind == .pedometer {
            #if canImport(CoreMotion)
            guard CMPedometer.isStepCountingAvailable() else { return completion(["status": "unavailable", "reason": "health_sensor_unavailable"]) }
            switch CMPedometer.authorizationStatus() {
            case .authorized: break
            case .notDetermined: return completion(["status": "permission_required"])
            default: return completion(["status": "permission_denied", "reason": "motion_access_denied"])
            }
            pedometer.queryPedometerData(from: from, to: to) { data, error in
                if let error { return completion(["status": "error", "reason": (error as NSError).domain]) }
                guard let steps = data?.numberOfSteps.doubleValue else { return completion(["status": "ok", "hasData": false]) }
                completion(["status": "ok", "hasData": true, "value": steps, "from": from.timeIntervalSince1970 * 1000,
                            "to": (data?.endDate ?? to).timeIntervalSince1970 * 1000, "source": ["device": "this_iphone"]])
            }
            #else
            completion(["status": "unavailable", "reason": "health_sensor_unavailable"])
            #endif
            return
        }
        #if canImport(HealthKit)
        guard HKHealthStore.isHealthDataAvailable() else { return completion(["status": "unavailable", "reason": "health_store_unavailable"]) }
        guard spec.objectType() != nil else { return completion(["status": "unsupported", "reason": "health_os_version_unsupported"]) }
        // Platform bound only (not the user's consent window).
        let earliest = healthStore.earliestPermittedSampleDate()
        let start = max(from, earliest)
        let coverage: [String: Any] = ["from": start.timeIntervalSince1970 * 1000, "to": to.timeIntervalSince1970 * 1000,
                                       "partial": start > from, "reason": start > from ? "platform_earliest_permitted" : NSNull()]
        switch spec.kind {
        case .dailySum: readSum(spec, from: start, to: to, coverage: coverage, completion: completion)
        case .latest: readLatest(spec, from: start, to: to, coverage: coverage, completion: completion)
        case .pressure: readPressure(spec, from: start, to: to, coverage: coverage, completion: completion)
        case .sleep: readSleep(spec, from: start, to: to, coverage: coverage, completion: completion)
        case .sessions: readSessions(spec, from: start, to: to, coverage: coverage, completion: completion)
        case .pedometer: break
        }
        #endif
    }

    #if canImport(HealthKit)
    static func statusCode(_ error: Error?) -> String {
        guard let error = error as? HKError else { return "error" }
        switch error.code {
        case .errorDatabaseInaccessible: return "store_locked"
        case .errorHealthDataUnavailable: return "unavailable"
        case .errorHealthDataRestricted: return "unavailable"
        case .errorAuthorizationNotDetermined: return "permission_required"
        case .errorAuthorizationDenied: return "permission_denied"
        default: return "error"
        }
    }

    #endif
}
