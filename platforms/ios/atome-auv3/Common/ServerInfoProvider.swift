import Foundation
#if canImport(UIKit)
import UIKit
#endif

struct ServerInfoProvider {
    static func payload(source: String) -> [String: Any] {
        let info = Bundle.main.infoDictionary ?? [:]
        let processInfo = ProcessInfo.processInfo
        var payload: [String: Any] = [
            "source": source,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "bundleId": info["CFBundleIdentifier"] as? String ?? "unknown",
            "appVersion": info["CFBundleShortVersionString"] as? String ?? "0",
            "build": info["CFBundleVersion"] as? String ?? "0",
            "processName": processInfo.processName,
            "pid": processInfo.processIdentifier,
            "allowedRoots": SandboxPathValidator.allowedRoots().map { $0.path }
        ]
#if canImport(UIKit)
        let device = UIDevice.current
        payload["device"] = [
            "model": device.model,
            "systemName": device.systemName,
            "systemVersion": device.systemVersion
        ]
#endif
        return payload
    }
    
    static func jsonData(source: String) -> Data? {
        let payload = self.payload(source: source)
        return try? JSONSerialization.data(withJSONObject: payload, options: [])
    }
}
