import Foundation
#if canImport(HealthKit)
import HealthKit

// Queries share the controller's store and channel lifetime; no second owner.
extension AppNativeHealthController {
    private func failure(_ error: Error?) -> [String: Any] {
        let code = Self.statusCode(error)
        Self.log.error("HealthKit query failed status=\(code, privacy: .public) domain=\((error as NSError?)?.domain ?? "unknown", privacy: .public) code=\((error as NSError?)?.code ?? 0)")
        return ["status": code, "reason": "healthkit_\(code)"]
    }

    private func dateMs(_ date: Date) -> Double { date.timeIntervalSince1970 * 1000 }

    func readSum(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
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

    func readLatest(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
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
    func readPressure(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
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
    func readSleep(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
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

    func readSessions(_ spec: HealthMonitorSpec, from: Date, to: Date, coverage: [String: Any], completion: @escaping ([String: Any]) -> Void) {
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
}
#endif
