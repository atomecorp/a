import Foundation

// Central kill-switches to bisect added Swift behaviors without removing code.
// Set to true selectively to re-enable.
enum FeatureFlags {
    static let deferMainLoad: Bool = true
    static let centralTerminationRetry: Bool = true
    static let mainThreadPrecondition: Bool = true
    static let externalDisplayObservation: Bool = true // app-only
    static let registerCustomScheme: Bool = true // keep true to not break loads
    static let startLocalHTTPServer: Bool = true
    static let enableJSBridge: Bool = true
    static let sendPurchaseRestoreOnDidFinish: Bool = true
    static let loadInlineOnly: Bool = false
    static let verboseLyrixStorageLogs: Bool = false
}
