import Foundation
#if canImport(UIKit)
import UIKit
#endif

struct ServerInfoProvider {
    static func payload(source: String) -> [String: Any] {
        let info = Bundle.main.infoDictionary ?? [:]
        let processInfo = ProcessInfo.processInfo
        var payload: [String: Any] = [
            "success": true,
            "source": source,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "bundleId": info["CFBundleIdentifier"] as? String ?? "unknown",
            "appVersion": info["CFBundleShortVersionString"] as? String ?? "0",
            "build": info["CFBundleVersion"] as? String ?? "0",
            "atomeVersion": runtimeVersion(relativePath: "version.txt"),
            "eveVersion": runtimeVersion(relativePath: "eVe/version.txt"),
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

    private static func runtimeVersion(relativePath: String) -> String {
        for bundle in [Bundle.main] + Bundle.allBundles + Bundle.allFrameworks {
            guard let resourceRoot = bundle.resourceURL else { continue }
            for root in [resourceRoot.appendingPathComponent("atome_runtime", isDirectory: true), resourceRoot] {
                let url = root.appendingPathComponent(relativePath)
                guard let value = try? String(contentsOf: url, encoding: .utf8)
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                    !value.isEmpty else { continue }
                return value
            }
        }
        return "unknown"
    }
    
    static func jsonData(source: String) -> Data? {
        let payload = self.payload(source: source)
        return try? JSONSerialization.data(withJSONObject: payload, options: [])
    }
}
