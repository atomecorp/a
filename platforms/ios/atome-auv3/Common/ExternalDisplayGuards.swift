import UIKit
import OSLog

enum ExternalDisplayState: String { case connected, disconnected }

protocol ExternalDisplayObserver: AnyObject {
    func externalDisplayChanged(_ state: ExternalDisplayState)
}

final class ExternalDisplayGuards {
    static let shared = ExternalDisplayGuards()
    private init() {}
    private let log = Logger(subsystem: "atome", category: "ExternalDisplay")

    // In AUv3, all external display behaviors must be disabled.
    func startObservingIfApp(observer: ExternalDisplayObserver) {
    guard !Self.isRunningInExtension else {
        log.info("Skipped in extension (AUv3)")
        return
    }
#if APP_EXTENSION
    log.info("Compile-time app-extension; external display observing disabled")
    return
#else
        if #available(iOS 16.0, *) {
            // Prefer scene-based observation on modern iOS (host app can wire UISceneDelegate callbacks)
        log.info("iOS16+: rely on UIScene lifecycle for external screens")
        } else {
            NotificationCenter.default.addObserver(self, selector: #selector(screenDidConnect(_:)), name: UIScreen.didConnectNotification, object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(screenDidDisconnect(_:)), name: UIScreen.didDisconnectNotification, object: nil)
        log.info("Observing via UIScreen notifications (pre-iOS16)")
        }
    log.info("Observing (App)")
#endif
    }

    func stopObserving() {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func screenDidConnect(_ note: Notification) {
    log.info("Screen connected: \(String(describing: note.object))")
    }

    @objc private func screenDidDisconnect(_ note: Notification) {
    log.info("Screen disconnected: \(String(describing: note.object))")
    }

    static var isRunningInExtension: Bool {
        let path = Bundle.main.bundlePath
        if path.hasSuffix(".appex") { return true }
        if Bundle.main.infoDictionary?["NSExtension"] != nil { return true }
        return false
    }
}
