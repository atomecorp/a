import Foundation
import HealthKit
import WatchConnectivity
import os.log

// The iPhone side of the Apple Watch motion recording (watch/WatchSensorSession.swift). When an eVe
// session starts recording this iPhone (HealthSensorRecorder), the watch app is started for a workout
// and told the session; when it ends, the watch closes its file and sends it here, where it joins the
// same account directory, outside every backup. No sample crosses this bridge except that file.
final class AppWatchSensorBridge: NSObject, HealthSensorWatchLink, WCSessionDelegate {
    static let shared = AppWatchSensorBridge()
    private static let log = Logger(subsystem: "atome", category: "WatchSensors")
    private let store = HKHealthStore()

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
        HealthSensorRecorder.watchLink = self
    }

    func start(session: String, startedAt: Int64, directory: String) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated,
              WCSession.default.isPaired, WCSession.default.isWatchAppInstalled else { return }
        send(["sensors": ["state": "start", "session": session, "at": startedAt, "directory": directory]])
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        store.startWatchApp(with: configuration) { started, error in
            if !started { Self.log.error("Watch app not started: \(error?.localizedDescription ?? "unknown", privacy: .public)") }
        }
    }

    func stop(session: String) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isPaired else { return }
        send(["sensors": ["state": "stop", "session": session]])
    }

    // The application context reaches the watch app even when it is launched afterwards; a live
    // message reaches it at once when it already runs.
    private func send(_ message: [String: Any]) {
        do { try WCSession.default.updateApplicationContext(message) }
        catch { Self.log.error("Watch context not sent: \(error.localizedDescription, privacy: .public)") }
        if WCSession.default.isReachable { WCSession.default.sendMessage(message, replyHandler: nil) }
    }

    // The received file is removed when this returns: it is moved first.
    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        guard let name = file.metadata?["file"] as? String,
              name.range(of: "^[0-9]{1,16}-watch\\.asr$", options: .regularExpression) != nil,
              let digest = file.metadata?["directory"] as? String,
              let directory = HealthSensorRecorder.directory(named: digest) else { return }
        do { try FileManager.default.moveItem(at: file.fileURL, to: directory.appendingPathComponent(name)) }
        catch { Self.log.error("Watch recording not kept: \(error.localizedDescription, privacy: .public)") }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
