import Foundation
import os.log
#if canImport(HealthKit)
import HealthKit
#endif

// The sport sessions of this iPhone's Health store, read for their import into eVe
// (atome/src/squirrel/health/health_activity_reader.js, D18 improvement 6). Read only:
// - one HKAnchoredObjectQuery on the workouts: no anchor reads the authorized history
//   (from `from`, bounded to ten years and to the store's earliest permitted date), an
//   anchor reads only what was added or deleted since; 50 workouts a page;
// - the workouts eVe itself wrote (its training sessions, from this app or its watch app,
//   AppNativeHealthWorkout.swift) are skipped: they are already eVe's own sessions;
// - each workout's measures come from the app that recorded it, in its time, and only for
//   the categories the person chose (`categories`); a measure HealthKit does not hold, or
//   that the person did not allow (HealthKit then answers nothing), is absent.
// Values only travel in the invoke reply. Called by AppNativeHealthController once the
// channel, the verified account and the store association are checked.
final class HealthActivityReader {
    static let commands: Set<String> = ["health_activities_read"]
    private static let log = Logger(subsystem: "atome", category: "HealthActivities")
    private static let pageLimit = 50
    private static let historyWindow: TimeInterval = 3650 * 86400
    private static let anchorMax = 8192

    #if canImport(HealthKit)
    private let store: HKHealthStore
    init(store: HKHealthStore) { self.store = store }

    func handle(_ command: String, payload: [String: Any], reply: @escaping ([String: Any]) -> Void) {
        let fail: (String) -> Void = { code in reply(["ok": false, "error": code]) }
        guard HKHealthStore.isHealthDataAvailable() else { return fail("health_store_unavailable") }
        let categories = Set((payload["categories"] as? [Any] ?? []).compactMap { $0 as? String })
        guard categories.contains("workouts") else { return fail("health_activities_invalid") }
        var anchor: HKQueryAnchor?
        if let text = payload["anchor"] as? String {
            guard text.count <= Self.anchorMax, let data = Data(base64Encoded: text),
                  let decoded = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data) else { return fail("health_anchor_invalid") }
            anchor = decoded
        }
        let now = Date()
        let asked = (payload["from"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) } ?? .distantPast
        let start = max(asked, now.addingTimeInterval(-Self.historyWindow), store.earliestPermittedSampleDate())
        let predicate = HKQuery.predicateForSamples(withStart: start, end: nil, options: [])
        let query = HKAnchoredObjectQuery(type: HKObjectType.workoutType(), predicate: predicate, anchor: anchor, limit: Self.pageLimit) { _, samples, deleted, next, error in
            if let error {
                Self.log.error("Activities read failed code=\((error as NSError).code)")
                return fail("healthkit_\(AppNativeHealthController.statusCode(error))")
            }
            guard let next, let encoded = try? NSKeyedArchiver.archivedData(withRootObject: next, requiringSecureCoding: true) else { return fail("health_anchor_invalid") }
            let workouts = (samples ?? []).compactMap { $0 as? HKWorkout }.filter { !Self.ownedByEve($0) }
            self.rows(workouts, categories: categories) { rows in
                reply(["activities": rows, "deleted": (deleted ?? []).map { $0.uuid.uuidString },
                       "anchor": encoded.base64EncodedString(), "more": (samples?.count ?? 0) >= Self.pageLimit])
            }
        }
        store.execute(query)
    }

    // This app's and its watch app's own workouts (their bundle ids start with the app's).
    private static func ownedByEve(_ workout: HKWorkout) -> Bool {
        guard let own = Bundle.main.bundleIdentifier, !own.isEmpty else { return false }
        let bundle = workout.sourceRevision.source.bundleIdentifier
        return bundle == own || bundle.hasPrefix(own + ".")
    }

    private func rows(_ workouts: [HKWorkout], categories: Set<String>, completion: @escaping ([[String: Any]]) -> Void) {
        let group = DispatchGroup()
        let lock = NSLock()
        var rows = [[String: Any]](repeating: [:], count: workouts.count)
        for (index, workout) in workouts.enumerated() {
            var row: [String: Any] = ["source_id": workout.uuid.uuidString, "sport": Self.sport(workout.workoutActivityType),
                                      "start": workout.startDate.timeIntervalSince1970 * 1000, "end": workout.endDate.timeIntervalSince1970 * 1000,
                                      "moving_s": workout.duration, "origin": workout.sourceRevision.source.bundleIdentifier]
            if let model = workout.device?.model, !model.isEmpty { row["device"] = model }
            if let climbed = workout.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity { row["elevation_m"] = climbed.doubleValue(for: .meter()) }
            lock.lock(); rows[index] = row; lock.unlock()
            for (key, identifier, option, unit) in Self.measures(workout.workoutActivityType, categories) {
                group.enter()
                statistic(identifier, option, workout: workout) { value in
                    if let value = value?(unit) { lock.lock(); rows[index][key] = value; lock.unlock() }
                    group.leave()
                }
            }
        }
        group.notify(queue: .global(qos: .utility)) { completion(rows) }
    }

    private typealias Reading = (HKUnit) -> Double?
    // The measures a workout may carry for the chosen categories: (key, type, statistic, unit).
    private static func measures(_ type: HKWorkoutActivityType, _ categories: Set<String>) -> [(String, HKQuantityTypeIdentifier, HKStatisticsOptions, HKUnit)] {
        var list: [(String, HKQuantityTypeIdentifier, HKStatisticsOptions, HKUnit)] = []
        let bpm = HKUnit.count().unitDivided(by: .minute())
        if categories.contains("heart_rate") {
            list.append(("heart_avg", .heartRate, .discreteAverage, bpm))
            list.append(("heart_max", .heartRate, .discreteMax, bpm))
        }
        if categories.contains("active_energy") { list.append(("active_kcal", .activeEnergyBurned, .cumulativeSum, .kilocalorie())) }
        if categories.contains("distance"), let distance = distanceType(type) { list.append(("distance_m", distance, .cumulativeSum, .meter())) }
        if categories.contains("steps") { list.append(("steps", .stepCount, .cumulativeSum, .count())) }
        return list
    }

    // The distance a workout's kind is measured in; none for the kinds HealthKit measures no distance of here.
    private static func distanceType(_ type: HKWorkoutActivityType) -> HKQuantityTypeIdentifier? {
        switch type {
        case .running, .walking, .hiking, .wheelchairRunPace, .wheelchairWalkPace: return .distanceWalkingRunning
        case .cycling, .handCycling: return .distanceCycling
        default: return nil
        }
    }

    // One statistic of the samples the workout's own app recorded during it; nil when there is none.
    private func statistic(_ identifier: HKQuantityTypeIdentifier, _ option: HKStatisticsOptions, workout: HKWorkout,
                           completion: @escaping (Reading?) -> Void) {
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
            HKQuery.predicateForSamples(withStart: workout.startDate, end: workout.endDate, options: .strictStartDate),
            HKQuery.predicateForObjects(from: workout.sourceRevision.source)
        ])
        let query = HKStatisticsQuery(quantityType: HKQuantityType(identifier), quantitySamplePredicate: predicate, options: option) { _, statistics, _ in
            // No sample (or a type the person did not allow): HealthKit answers no statistics, so no measure.
            guard let statistics else { return completion(nil) }
            let quantity: HKQuantity?
            switch option {
            case .discreteAverage: quantity = statistics.averageQuantity()
            case .discreteMax: quantity = statistics.maximumQuantity()
            default: quantity = statistics.sumQuantity()
            }
            guard let quantity else { return completion(nil) }
            completion { unit in quantity.doubleValue(for: unit) }
        }
        store.execute(query)
    }

    // The kind of a workout, in letters (atome/src/shared/activity_import_contract.js `sport`); « other » for the rest.
    private static func sport(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "running"
        case .walking: return "walking"
        case .hiking: return "hiking"
        case .cycling, .handCycling: return "cycling"
        case .swimming: return "swimming"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .stairClimbing, .stairs: return "stairs"
        case .yoga: return "yoga"
        case .pilates: return "pilates"
        case .functionalStrengthTraining, .traditionalStrengthTraining: return "strength"
        case .coreTraining: return "core"
        case .highIntensityIntervalTraining: return "hiit"
        case .mixedCardio: return "cardio"
        case .crossTraining: return "crossTraining"
        case .cardioDance, .socialDance: return "dance"
        case .boxing, .kickboxing: return "boxing"
        case .martialArts: return "martialArts"
        case .climbing: return "climbing"
        case .tennis: return "tennis"
        case .soccer: return "soccer"
        case .basketball: return "basketball"
        case .golf: return "golf"
        case .downhillSkiing, .crossCountrySkiing: return "skiing"
        case .snowboarding: return "snowboarding"
        case .flexibility: return "flexibility"
        case .cooldown: return "cooldown"
        case .mindAndBody: return "mindAndBody"
        case .wheelchairRunPace, .wheelchairWalkPace: return "wheelchair"
        default: return "other"
        }
    }
    #else
    func handle(_ command: String, payload: [String: Any], reply: @escaping ([String: Any]) -> Void) {
        reply(["ok": false, "error": "health_store_unavailable"])
    }
    #endif
}
