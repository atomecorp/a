import Foundation
import os.log
#if canImport(HealthKit)
import HealthKit
#endif

// The single owner of the workout this app records in HealthKit while an eVe
// training session runs (eVe/domains/training/training_runtime.js). The eVe
// session stays the truth; this is its platform mirror:
// - iOS 26+: a live HKWorkoutSession, so paired sensors (AirPods, a Bluetooth
//   chest strap) measure at workout rate. Collected samples are saved with the
//   workout; the page is only told which monitor changed (no value).
// - earlier iOS: an HKWorkoutBuilder that saves the same workout at the end.
// - a paired Apple Watch with the eVe watch app runs its own workout for the session (watch/WatchSensorSession.swift,
//   started through `watchLink`), so the wrist measures the heart at workout rate; each of its readings is relayed
//   here (`watchHeartRate`) and kept in memory only while the session runs, then given to the page in the heart rate's
//   `health_read` reply (`withWatchHeart`), never pushed: the iPhone alone gets the watch's samples only once they sync.
// It also writes a meditation's mindful minutes (eVe/domains/programs/brick_session_runtime.js), one
// sample once that session is saved. Writes are limited to `shareTypes` and `mindfulType`; nothing is ever deleted. One workout at a
// time; a page load, channel close or context reset discards it.
#if canImport(HealthKit)
// The app target's watch bridge (application/AppWatchSensorBridge.swift); the AUv3 extension has none.
protocol HealthWorkoutWatchLink: AnyObject {
    func startWorkout(session: String, activity: HKWorkoutActivityType, startedAt: Date)
    func stopWorkout(session: String)
}
#endif

final class HealthWorkoutRecorder {
    static let commands: Set<String> = [
        "health_workout_prepare", "health_workout_start", "health_workout_pause", "health_workout_resume", "health_workout_end",
        "health_mindful_prepare", "health_mindful_save"
    ]
    private static let log = Logger(subsystem: "atome", category: "HealthWorkout")

    #if canImport(HealthKit)
    static let shareTypes: Set<HKSampleType> = [HKObjectType.workoutType(), HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned)]
    static let mindfulType = HKCategoryType(.mindfulSession)
    // Monitor ids (atome/src/squirrel/health/health_catalog.js) of the collected types.
    private static let monitors: [HKSampleType: String] = [HKQuantityType(.heartRate): "heart_rate", HKQuantityType(.activeEnergyBurned): "active_energy"]

    static weak var watchLink: HealthWorkoutWatchLink?
    // A watch reading older than this no longer describes the session (the page's own freshness is 2 min).
    private static let watchHeartFresh: TimeInterval = 120

    private let store: HKHealthStore
    private let changed: ([String]) -> Void
    private let queue = DispatchQueue(label: "one.atome.health.workout")
    private var sessionId: String?
    private var builder: HKWorkoutBuilder?
    private var live: AnyObject?
    private var lastSignal = Date.distantPast
    // The session the watch measures for, and its latest heart rate (memory only).
    private var watchSession: String?
    private var watchHeart: (bpm: Double, end: Date)?

    init(store: HKHealthStore, changed: @escaping ([String]) -> Void) {
        self.store = store
        self.changed = changed
    }

    func handle(_ command: String, payload: [String: Any], reply: @escaping ([String: Any]) -> Void) {
        let fail: (String) -> Void = { code in reply(["ok": false, "error": code]) }
        guard HKHealthStore.isHealthDataAvailable() else { return fail("health_store_unavailable") }
        if command == "health_workout_prepare" { return prepare(reply: reply, fail: fail) }
        if command == "health_mindful_prepare" { return prepareMindful(reply: reply, fail: fail) }
        guard let session = payload["session"] as? String, !session.isEmpty, session.count <= 300 else { return fail("health_workout_invalid") }
        let at = (payload["at"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        queue.async {
            switch command {
            case "health_workout_start": self.start(session, activity: payload["activity"] as? String ?? "", at: at, reply: reply, fail: fail)
            case "health_workout_end": self.end(session, at: at, save: payload["save"] as? Bool == true, reply: reply, fail: fail)
            case "health_mindful_save":
                let start = (payload["start"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) }
                self.saveMindful(session, start: start, end: at, reply: reply, fail: fail)
            default: self.pauseOrResume(session, pause: command == "health_workout_pause", at: at, reply: reply, fail: fail)
            }
        }
    }

    func discard() {
        queue.async {
            self.stopWatch()
            guard let builder = self.builder else { return }
            self.endLiveSession()
            builder.discardWorkout()
            self.clear()
        }
    }

    // Explicit session start only. The write grant of workouts is knowable in
    // HealthKit (unlike read grants), so the reply says whether saving works.
    private func prepare(reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        // The heart rate the card follows and the active energy its summary reads (R-005 Q38): one sheet, at the session's start.
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned)]
        let writable = { reply(["writable": self.store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized]) }
        store.getRequestStatusForAuthorization(toShare: Self.shareTypes, read: read) { status, error in
            if error != nil || status == .unknown { return fail("health_authorization_status_unknown") }
            guard status == .shouldRequest else { return writable() }
            DispatchQueue.main.async {
                self.store.requestAuthorization(toShare: Self.shareTypes, read: read) { success, error in
                    if !success || error != nil { return fail("healthkit_\(AppNativeHealthController.statusCode(error))") }
                    writable()
                }
            }
        }
    }

    // The meditation's own grant, asked when its session is prepared (never during a Sport session).
    private func prepareMindful(reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        let share: Set<HKSampleType> = [Self.mindfulType]
        let writable = { reply(["writable": self.store.authorizationStatus(for: Self.mindfulType) == .sharingAuthorized]) }
        store.getRequestStatusForAuthorization(toShare: share, read: []) { status, error in
            if error != nil || status == .unknown { return fail("health_authorization_status_unknown") }
            guard status == .shouldRequest else { return writable() }
            DispatchQueue.main.async {
                self.store.requestAuthorization(toShare: share, read: []) { success, error in
                    if !success || error != nil { return fail("healthkit_\(AppNativeHealthController.statusCode(error))") }
                    writable()
                }
            }
        }
    }

    // The eVe session id identifies the sample: saving it again replaces it.
    private func saveMindful(_ session: String, start: Date?, end: Date, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        guard let start, end > start else { return fail("health_mindful_invalid") }
        guard store.authorizationStatus(for: Self.mindfulType) == .sharingAuthorized else { return fail("health_mindful_write_denied") }
        let sample = HKCategorySample(type: Self.mindfulType, value: HKCategoryValue.notApplicable.rawValue, start: start, end: end,
            metadata: [HKMetadataKeySyncIdentifier: session, HKMetadataKeySyncVersion: 1])
        store.save(sample) { success, error in
            success ? reply(["saved": true]) : fail("healthkit_\(AppNativeHealthController.statusCode(error))")
        }
    }

    private static func activityType(_ kind: String) -> HKWorkoutActivityType? {
        switch kind {
        case "strength": return .traditionalStrengthTraining
        case "core": return .coreTraining
        case "cardio": return .highIntensityIntervalTraining
        default: return nil
        }
    }

    private func start(_ session: String, activity: String, at: Date, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        if sessionId == session { return reply(["started": true, "live": live != nil]) }
        guard let type = Self.activityType(activity) else { return fail("health_workout_invalid") }
        // The wrist's heart rate follows the session even when workouts may not be written.
        if watchSession != session {
            stopWatch()
            watchSession = session
            Self.watchLink?.startWorkout(session: session, activity: type, startedAt: at)
        }
        guard store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else { return fail("health_workout_write_denied") }
        // A workout still open belongs to a session that was never ended: it is not this one.
        if let previous = builder { endLiveSession(); previous.discardWorkout(); clear() }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = type
        configuration.locationType = .indoor
        let started: HKWorkoutBuilder
        if #available(iOS 26.0, *) {
            guard let workout = try? HKWorkoutSession(healthStore: store, configuration: configuration) else { return fail("health_workout_unavailable") }
            let liveBuilder = workout.associatedWorkoutBuilder()
            liveBuilder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
            let delegate = LiveWorkoutDelegate(owner: self)
            workout.delegate = delegate
            liveBuilder.delegate = delegate
            live = delegate
            delegate.session = workout
            workout.startActivity(with: at)
            started = liveBuilder
        } else {
            started = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: .local())
        }
        builder = started
        sessionId = session
        started.beginCollection(withStart: at) { success, error in
            self.queue.async {
                guard success else {
                    Self.log.error("Workout collection refused code=\((error as NSError?)?.code ?? 0)")
                    if self.sessionId == session { self.endLiveSession(); started.discardWorkout(); self.clear() }
                    return fail("healthkit_\(AppNativeHealthController.statusCode(error))")
                }
                reply(["started": true, "live": self.live != nil])
            }
        }
    }

    // A live session adds its own pause/resume events to the builder.
    private func pauseOrResume(_ session: String, pause: Bool, at: Date, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        guard sessionId == session, let builder else { return fail("health_workout_not_started") }
        if #available(iOS 26.0, *), let workout = (live as? LiveWorkoutDelegate)?.session {
            pause ? workout.pause() : workout.resume()
            return reply(["recorded": true])
        }
        let event = HKWorkoutEvent(type: pause ? .pause : .resume, dateInterval: DateInterval(start: at, duration: 0), metadata: nil)
        builder.addWorkoutEvents([event]) { success, error in
            success ? reply(["recorded": true]) : fail("healthkit_\(AppNativeHealthController.statusCode(error))")
        }
    }

    private func end(_ session: String, at: Date, save: Bool, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        if watchSession == session { stopWatch() }
        guard sessionId == session, let builder else { return fail("health_workout_not_started") }
        endLiveSession()
        clear()
        builder.endCollection(withEnd: at) { success, error in
            guard success, save else {
                builder.discardWorkout()
                return success ? reply(["saved": false]) : fail("healthkit_\(AppNativeHealthController.statusCode(error))")
            }
            // The eVe session id identifies the workout: saving it again replaces it.
            let metadata: [String: Any] = [HKMetadataKeyIndoorWorkout: true, HKMetadataKeySyncIdentifier: session, HKMetadataKeySyncVersion: 1]
            builder.addMetadata(metadata) { _, _ in
                builder.finishWorkout { workout, error in
                    if workout == nil { Self.log.error("Workout save failed code=\((error as NSError?)?.code ?? 0)") }
                    workout == nil ? fail("healthkit_\(AppNativeHealthController.statusCode(error))") : reply(["saved": true])
                }
            }
        }
    }

    private func endLiveSession() {
        if #available(iOS 26.0, *) { (live as? LiveWorkoutDelegate)?.session?.end() }
    }

    private func clear() {
        sessionId = nil
        builder = nil
        live = nil
    }

    private func stopWatch() {
        if let previous = watchSession { Self.watchLink?.stopWorkout(session: previous) }
        watchSession = nil
        watchHeart = nil
    }

    // A heart rate measured by the watch for the running session (application/AppWatchSensorBridge.swift).
    func watchHeartRate(_ bpm: Double, at end: Date) {
        queue.async {
            guard self.watchSession != nil, bpm >= 20, bpm <= 250, end <= Date().addingTimeInterval(60),
                  end > (self.watchHeart?.end ?? .distantPast) else { return }
            self.watchHeart = (bpm, end)
            self.signal(["heart_rate"])
        }
    }

    // A heart-rate read (`readLatest`, AppNativeHealthController.swift) whose samples gain the watch's latest one; any
    // other monitor's completion is returned as it is. Called on the controller's queue, never on this one.
    func withWatchHeart(_ spec: HealthMonitorSpec, from: Date, to: Date, _ completion: @escaping ([String: Any]) -> Void) -> ([String: Any]) -> Void {
        guard spec.identifier == "HKQuantityTypeIdentifierHeartRate", let row = watchHeartRow(from: from, to: to) else { return completion }
        return { result in
            guard result["status"] as? String == "ok" else { return completion(result) }
            var merged = result
            merged["samples"] = [row] + (result["samples"] as? [[String: Any]] ?? [])
            completion(merged)
        }
    }

    // The watch's latest heart rate as one `readLatest` row, when it lies in [from, to] and is still fresh.
    private func watchHeartRow(from: Date, to: Date) -> [String: Any]? {
        queue.sync {
            guard let heart = watchHeart, heart.end >= from, heart.end <= to.addingTimeInterval(60),
                  Date().timeIntervalSince(heart.end) <= Self.watchHeartFresh else { return nil }
            let ms = heart.end.timeIntervalSince1970 * 1000
            return ["value": heart.bpm, "start": ms, "end": ms, "source": ["device": "watch"]]
        }
    }

    fileprivate func collected(_ types: Set<HKSampleType>) {
        queue.async {
            guard self.builder != nil else { return }
            self.signal(types.compactMap { Self.monitors[$0] })
        }
    }

    // On the queue: one invalidation every 5 s at most; the page re-reads (no value travels here).
    private func signal(_ ids: [String]) {
        guard !ids.isEmpty, Date().timeIntervalSince(lastSignal) >= 5 else { return }
        lastSignal = Date()
        changed(ids)
    }

    fileprivate func failed(_ error: Error) {
        Self.log.error("Workout session failed domain=\((error as NSError).domain, privacy: .public) code=\((error as NSError).code)")
    }
    #endif
}

#if canImport(HealthKit)
@available(iOS 26.0, *)
private final class LiveWorkoutDelegate: NSObject, HKLiveWorkoutBuilderDelegate, HKWorkoutSessionDelegate {
    weak var owner: HealthWorkoutRecorder?
    var session: HKWorkoutSession?

    init(owner: HealthWorkoutRecorder) { self.owner = owner }

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        owner?.collected(collectedTypes)
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        owner?.failed(error)
    }
}
#endif
