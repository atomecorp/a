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
        "health_context_reset"
    ]
    private static let maxRequests = 32
    private static let maxSamples = 200
    private static let maxSleepSamples = 2000

    private weak var webView: WKWebView?
    private let stateQueue = DispatchQueue(label: "one.atome.health.state")
    private var channelToken: String?
    private var channelClosed = false
    private var generation: UInt64 = 0
    private var accessInFlight = false

    #if canImport(HealthKit)
    private let healthStore = HKHealthStore()
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
        }
        #endif
    }

    static func canHandle(command: String) -> Bool { commands.contains(command) }

    func attach(webView: WKWebView) {
        self.webView = webView
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
                reply(self.capabilities(ids: Self.monitorIds(payload["monitors"])))
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

    private func capabilities(ids: [String]) -> [String: Any] {
        var monitors: [String: Any] = [:]
        #if canImport(HealthKit)
        let storeAvailable = HKHealthStore.isHealthDataAvailable()
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
            } else if spec.objectType() == nil {
                monitors[id] = ["supported": false, "reason": "health_os_version_unsupported"]
            } else {
                // Read authorization is deliberately unknowable on HealthKit.
                monitors[id] = ["supported": true, "access": "unknowable"]
            }
            #endif
        }
        return ["available": storeAvailable, "host": "ios_app", "monitors": monitors]
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
        let readTypes = Set(specs.compactMap { $0.objectType() })
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
    private static func statusCode(_ error: Error?) -> String {
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

    private func failure(_ error: Error?) -> [String: Any] {
        let code = Self.statusCode(error)
        return ["status": code, "reason": "healthkit_\(code)"]
    }

    private func dateMs(_ date: Date) -> Double { date.timeIntervalSince1970 * 1000 }

    private func readSum(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
        guard let type = spec.objectType() as? HKQuantityType, let unit = spec.unit else { return completion(["status": "error", "reason": "health_spec_invalid"]) }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: .strictStartDate)
        // HealthKit statistics apply the store's own source merging; raw
        // samples from several sources are never summed here.
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
            if let error = error as? HKError, error.code == .errorNoData {
                return completion(["status": "ok", "hasData": false, "coverage": coverage])
            }
            if error != nil { return completion(self.failure(error)) }
            guard let sum = statistics?.sumQuantity() else { return completion(["status": "ok", "hasData": false, "coverage": coverage]) }
            completion(["status": "ok", "hasData": true, "value": sum.doubleValue(for: unit),
                        "from": self.dateMs(from), "to": self.dateMs(to), "coverage": coverage])
        }
        healthStore.execute(query)
    }

    private func readLatest(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
        guard let type = spec.sampleType(), let unit = spec.unit else { return completion(["status": "error", "reason": "health_spec_invalid"]) }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 20, sortDescriptors: sort) { _, samples, error in
            if error != nil { return completion(self.failure(error)) }
            let rows: [[String: Any]] = (samples ?? []).compactMap { sample in
                guard let quantity = sample as? HKQuantitySample, quantity.quantityType.is(compatibleWith: unit) else { return nil }
                var row: [String: Any] = ["value": quantity.quantity.doubleValue(for: unit),
                                          "start": self.dateMs(quantity.startDate), "end": self.dateMs(quantity.endDate),
                                          "source": ["name": quantity.sourceRevision.source.name]]
                if let context = quantity.metadata?[HKMetadataKeyHeartRateMotionContext] as? NSNumber {
                    row["qualifiers"] = ["motion_context": context.intValue]
                }
                return row
            }
            completion(["status": "ok", "samples": rows, "scale": spec.fraction ? "fraction" : "absolute", "coverage": coverage])
        }
        healthStore.execute(query)
    }

    // Each blood-pressure correlation is one measurement: systolic and
    // diastolic are taken from the SAME correlation, never paired across.
    private func readPressure(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
        guard let type = HKCorrelationType.correlationType(forIdentifier: .bloodPressure),
              let systolicType = HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic),
              let diastolicType = HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic) else {
            return completion(["status": "unsupported"])
        }
        let unit = HKUnit.millimeterOfMercury()
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 20, sortDescriptors: sort) { _, samples, error in
            if error != nil { return completion(self.failure(error)) }
            let rows: [[String: Any]] = (samples ?? []).compactMap { sample in
                guard let correlation = sample as? HKCorrelation,
                      let systolic = correlation.objects(for: systolicType).first as? HKQuantitySample,
                      let diastolic = correlation.objects(for: diastolicType).first as? HKQuantitySample else { return nil }
                return ["systolic": systolic.quantity.doubleValue(for: unit), "diastolic": diastolic.quantity.doubleValue(for: unit),
                        "start": self.dateMs(correlation.startDate), "end": self.dateMs(correlation.endDate),
                        "source": ["name": correlation.sourceRevision.source.name]]
            }
            completion(["status": "ok", "samples": rows, "coverage": coverage])
        }
        healthStore.execute(query)
    }

    private func sleepStage(_ value: Int) -> String {
        if #available(iOS 16.0, *) {
            switch HKCategoryValueSleepAnalysis(rawValue: value) {
            case .inBed: return "in_bed"
            case .asleepUnspecified: return "asleep_unspecified"
            case .awake: return "awake"
            case .asleepCore: return "asleep_core"
            case .asleepDeep: return "asleep_deep"
            case .asleepREM: return "asleep_rem"
            default: return "unknown"
            }
        }
        switch HKCategoryValueSleepAnalysis(rawValue: value) {
        case .inBed: return "in_bed"
        case .awake: return "awake"
        case .some: return "asleep_unspecified"
        default: return "unknown"
        }
    }

    // Raw intervals with their stage; grouping into a session and the union of
    // asleep stages happen in health_values.js (tested), never by summing.
    private func readSleep(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
        guard let type = spec.sampleType() else { return completion(["status": "unsupported"]) }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        let limit = Self.maxSleepSamples
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: sort) { _, samples, error in
            if error != nil { return completion(self.failure(error)) }
            let rows: [[String: Any]] = (samples ?? []).compactMap { sample in
                guard let category = sample as? HKCategorySample else { return nil }
                return ["stage": self.sleepStage(category.value), "start": self.dateMs(category.startDate),
                        "end": self.dateMs(category.endDate), "source": category.sourceRevision.source.name]
            }
            var cover = coverage
            if rows.count >= limit { cover["partial"] = true; cover["reason"] = "read_limit" }
            completion(["status": "ok", "intervals": rows, "coverage": cover])
        }
        healthStore.execute(query)
    }

    private func readSessions(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
        guard let type = spec.sampleType() else { return completion(["status": "unsupported"]) }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: Self.maxSamples, sortDescriptors: nil) { _, samples, error in
            if error != nil { return completion(self.failure(error)) }
            let rows: [[String: Any]] = (samples ?? []).map { ["start": self.dateMs($0.startDate), "end": self.dateMs($0.endDate)] }
            var cover = coverage
            if rows.count >= Self.maxSamples { cover["partial"] = true; cover["reason"] = "read_limit" }
            completion(["status": "ok", "sessions": rows, "coverage": cover])
        }
        healthStore.execute(query)
    }
    #endif
}

// Native allow-list of monitors. Ids MUST match atome/src/squirrel/health/
// health_catalog.js (checked by temp/health_native_tables.probe.mjs).
enum HealthMonitorKind { case dailySum, latest, pressure, sleep, sessions, pedometer }

struct HealthMonitorSpec {
    let kind: HealthMonitorKind
    let identifier: String
    let unitString: String?
    let fraction: Bool

    #if canImport(HealthKit)
    var unit: HKUnit? { unitString.map { HKUnit(from: $0) } }

    func objectType() -> HKObjectType? {
        switch identifier {
        case "HKWorkoutType": return HKObjectType.workoutType()
        case "HKCorrelationTypeIdentifierBloodPressure": return HKObjectType.correlationType(forIdentifier: .bloodPressure)
        case "HKCategoryTypeIdentifierSleepAnalysis": return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        case "HKCategoryTypeIdentifierMindfulSession": return HKObjectType.categoryType(forIdentifier: .mindfulSession)
        case "HKQuantityTypeIdentifierAppleSleepingWristTemperature":
            if #available(iOS 16.0, *) { return HKObjectType.quantityType(forIdentifier: .appleSleepingWristTemperature) }
            return nil
        default:
            return HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier))
        }
    }

    func sampleType() -> HKSampleType? { objectType() as? HKSampleType }
    #endif
}

enum HealthMonitorTable {
    private static let q = HealthMonitorKind.latest
    static let specs: [String: HealthMonitorSpec] = [
        "steps": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierStepCount", unitString: "count", fraction: false),
        "distance_walking_running": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierDistanceWalkingRunning", unitString: "m", fraction: false),
        "distance_cycling": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierDistanceCycling", unitString: "m", fraction: false),
        "distance_wheelchair": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierDistanceWheelchair", unitString: "m", fraction: false),
        "wheelchair_pushes": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierPushCount", unitString: "count", fraction: false),
        "floors_climbed": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierFlightsClimbed", unitString: "count", fraction: false),
        "active_energy": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierActiveEnergyBurned", unitString: "kcal", fraction: false),
        "basal_energy": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierBasalEnergyBurned", unitString: "kcal", fraction: false),
        "exercise_minutes": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierAppleExerciseTime", unitString: "min", fraction: false),
        "stand_minutes": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierAppleStandTime", unitString: "min", fraction: false),
        "hydration": .init(kind: .dailySum, identifier: "HKQuantityTypeIdentifierDietaryWater", unitString: "mL", fraction: false),
        "workout_duration": .init(kind: .sessions, identifier: "HKWorkoutType", unitString: nil, fraction: false),
        "mindful_minutes": .init(kind: .sessions, identifier: "HKCategoryTypeIdentifierMindfulSession", unitString: nil, fraction: false),
        "walking_speed": .init(kind: q, identifier: "HKQuantityTypeIdentifierWalkingSpeed", unitString: "m/s", fraction: false),
        "heart_rate": .init(kind: q, identifier: "HKQuantityTypeIdentifierHeartRate", unitString: "count/min", fraction: false),
        "resting_heart_rate": .init(kind: q, identifier: "HKQuantityTypeIdentifierRestingHeartRate", unitString: "count/min", fraction: false),
        "walking_heart_rate_average": .init(kind: q, identifier: "HKQuantityTypeIdentifierWalkingHeartRateAverage", unitString: "count/min", fraction: false),
        "hrv_sdnn": .init(kind: q, identifier: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", unitString: "ms", fraction: false),
        "respiratory_rate": .init(kind: q, identifier: "HKQuantityTypeIdentifierRespiratoryRate", unitString: "count/min", fraction: false),
        "oxygen_saturation": .init(kind: q, identifier: "HKQuantityTypeIdentifierOxygenSaturation", unitString: "%", fraction: true),
        "blood_pressure": .init(kind: .pressure, identifier: "HKCorrelationTypeIdentifierBloodPressure", unitString: "mmHg", fraction: false),
        "blood_glucose": .init(kind: q, identifier: "HKQuantityTypeIdentifierBloodGlucose", unitString: "mg/dL", fraction: false),
        "body_temperature": .init(kind: q, identifier: "HKQuantityTypeIdentifierBodyTemperature", unitString: "degC", fraction: false),
        "basal_body_temperature": .init(kind: q, identifier: "HKQuantityTypeIdentifierBasalBodyTemperature", unitString: "degC", fraction: false),
        "sleeping_wrist_temperature": .init(kind: q, identifier: "HKQuantityTypeIdentifierAppleSleepingWristTemperature", unitString: "degC", fraction: false),
        "vo2_max": .init(kind: q, identifier: "HKQuantityTypeIdentifierVO2Max", unitString: "ml/(kg*min)", fraction: false),
        "weight": .init(kind: q, identifier: "HKQuantityTypeIdentifierBodyMass", unitString: "kg", fraction: false),
        "height": .init(kind: q, identifier: "HKQuantityTypeIdentifierHeight", unitString: "cm", fraction: false),
        "body_fat": .init(kind: q, identifier: "HKQuantityTypeIdentifierBodyFatPercentage", unitString: "%", fraction: true),
        "lean_body_mass": .init(kind: q, identifier: "HKQuantityTypeIdentifierLeanBodyMass", unitString: "kg", fraction: false),
        "body_mass_index": .init(kind: q, identifier: "HKQuantityTypeIdentifierBodyMassIndex", unitString: "count", fraction: false),
        "sleep": .init(kind: .sleep, identifier: "HKCategoryTypeIdentifierSleepAnalysis", unitString: nil, fraction: false),
        "device_steps_today": .init(kind: .pedometer, identifier: "CMPedometer", unitString: nil, fraction: false)
    ]

    static func spec(_ id: String) -> HealthMonitorSpec? { specs[id] }
}

// Local association device store <-> account. Keychain, this device only,
// never synchronizable: it is not a transportable permission.
enum HealthLinkStore {
    private static let service = "one.atome.health.link"

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false]
    }

    static func isLinked(_ account: String) -> Bool {
        var read = query(account)
        read[kSecReturnData as String] = false
        return SecItemCopyMatching(read as CFDictionary, nil) == errSecSuccess
    }

    static func link(_ account: String) -> Bool {
        if isLinked(account) { return true }
        var write = query(account)
        write[kSecValueData as String] = Data("1".utf8)
        write[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(write as CFDictionary, nil) == errSecSuccess
    }
}
