import Foundation

// Central kill-switches to bisect added Swift behaviors without removing code.
// Set to true selectively to re-enable.
enum FeatureFlags {
#if DEBUG
    static var panelLabEnabled: Bool {
        ProcessInfo.processInfo.arguments.contains("-AtomePanelLab")
            || ProcessInfo.processInfo.environment["ATOME_IOS_PANEL_LAB"] == "1"
    }
    // A host app launches the AUv3 with neither argument nor environment: there, a marker file
    // `Documents/atome_web_inspector` in the app group (pushed with `devicectl device copy to`) turns it on.
    static var webInspectorEnabled: Bool {
        ProcessInfo.processInfo.arguments.contains("-AtomeWebInspector")
            || ProcessInfo.processInfo.environment["ATOME_IOS_WEB_INSPECTOR"] == "1"
            || FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one")
                .map { FileManager.default.fileExists(atPath: $0.appendingPathComponent("Documents/atome_web_inspector").path) } == true
    }
    static var textTraceEnabled: Bool {
        ProcessInfo.processInfo.arguments.contains("-AtomeTextTrace")
            || ProcessInfo.processInfo.environment["ATOME_IOS_TEXT_TRACE"] == "1"
    }
#else
    static let panelLabEnabled: Bool = false
    static let webInspectorEnabled: Bool = false
    static let textTraceEnabled: Bool = false
#endif
    static let deferMainLoad: Bool = true
    static let mainThreadPrecondition: Bool = true
    static let registerCustomScheme: Bool = true // keep true to not break loads
    static let startLocalHTTPServer: Bool = true
    static let enableJSBridge: Bool = true
    static let loadInlineOnly: Bool = false
    static let verboseLyrixStorageLogs: Bool = false
}
