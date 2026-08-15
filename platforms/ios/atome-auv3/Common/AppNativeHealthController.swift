import Foundation
import WebKit

#if canImport(HealthKit)
import HealthKit
#endif

final class AppNativeHealthController {
    static let shared = AppNativeHealthController()

    private weak var webView: WKWebView?

    #if canImport(HealthKit)
    private let healthStore = HKHealthStore()
    private var heartRateQuery: HKObserverQuery?
    #endif

    private init() {}

    static func canHandle(command: String) -> Bool {
        command == "health_heart_rate_start" || command == "health_heart_rate_stop"
    }

    func attach(webView: WKWebView) {
        self.webView = webView
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        switch command {
        case "health_heart_rate_start":
            startHeartRate(completion: completion)
        case "health_heart_rate_stop":
            stopHeartRate()
            completion(["success": true], nil)
        default:
            completion(["success": false], "Unsupported health command: \(command)")
        }
    }

    private func dispatch(event: String, detail: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        let script = "window.dispatchEvent(new CustomEvent('\(event)',{detail:\(json)}));"
        DispatchQueue.main.async {
            WebViewManager.evaluateJS(script, label: "nativeHealthEvent", targetWebView: self.webView)
        }
    }

    private func dispatchRevoked(reason: String) {
        dispatch(event: "atome:native-health-revoked", detail: [
            "subjectId": "current",
            "field": "heart_rate",
            "reasonCode": reason
        ])
    }

    #if canImport(HealthKit)
    private func startHeartRate(completion: @escaping ([String: Any], String?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable(),
              let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            dispatchRevoked(reason: "health_data_unavailable")
            completion(["success": false], "Health data unavailable")
            return
        }
        healthStore.requestAuthorization(toShare: [], read: [heartRateType]) { granted, error in
            guard granted, error == nil else {
                self.dispatchRevoked(reason: error?.localizedDescription ?? "health_permission_denied")
                completion(["success": false], error?.localizedDescription ?? "Health permission denied")
                return
            }
            self.installHeartRateObserver(type: heartRateType)
            self.readLatestHeartRate(type: heartRateType)
            completion(["success": true], nil)
        }
    }

    private func installHeartRateObserver(type: HKQuantityType) {
        stopHeartRate()
        let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completionHandler, error in
            if let error {
                self.dispatchRevoked(reason: error.localizedDescription)
            } else {
                self.readLatestHeartRate(type: type)
            }
            completionHandler()
        }
        heartRateQuery = query
        healthStore.execute(query)
    }

    private func readLatestHeartRate(type: HKQuantityType) {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) {
            _, samples, error in
            if let error {
                self.dispatchRevoked(reason: error.localizedDescription)
                return
            }
            guard let sample = samples?.first as? HKQuantitySample else {
                self.dispatchRevoked(reason: "health_heart_rate_unavailable")
                return
            }
            let unit = HKUnit.count().unitDivided(by: .minute())
            self.dispatch(event: "atome:native-health-sample", detail: [
                "subjectId": "current",
                "field": "heart_rate",
                "value": sample.quantity.doubleValue(for: unit),
                "unit": "bpm",
                "timestamp": Int(sample.endDate.timeIntervalSince1970 * 1000),
                "ttlMs": 15000
            ])
        }
        healthStore.execute(query)
    }

    private func stopHeartRate() {
        if let query = heartRateQuery { healthStore.stop(query) }
        heartRateQuery = nil
    }
    #else
    private func startHeartRate(completion: @escaping ([String: Any], String?) -> Void) {
        dispatchRevoked(reason: "healthkit_unavailable")
        completion(["success": false], "HealthKit unavailable")
    }

    private func stopHeartRate() {}
    #endif
}

