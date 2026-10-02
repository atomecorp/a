import Foundation
import Security
#if canImport(HealthKit)
import HealthKit
#endif

// Native allow-list of monitors. Ids MUST match atome/src/squirrel/health/
// health_catalog.js (checked by native_health_authorization_contract.test.mjs).
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

    // Correlation samples are queried as a pair, but HealthKit authorizes the
    // underlying quantities. Passing the correlation to a permission/status
    // request raises an Objective-C exception before its callback can run.
    func authorizationTypes() -> Set<HKObjectType>? {
        if kind == .pressure {
            guard let systolic = HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic),
                  let diastolic = HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic) else { return nil }
            return [systolic, diastolic]
        }
        guard let type = objectType() else { return nil }
        return [type]
    }
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
