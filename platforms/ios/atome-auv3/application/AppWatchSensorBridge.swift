import Foundation
import HealthKit
import WatchConnectivity
import os.log

// The iPhone side of the Apple Watch app (watch/WatchSensorSession.swift), two uses of one watch workout:
// - the heart rate: when an eVe training workout starts (HealthWorkoutRecorder), the watch app is started for a
//   workout, which measures the heart at workout rate, and each reading comes back here as a live message, handed to
//   the health owner (memory only, read by the page through `health_read`);
// - the motion recording: when an eVe session starts recording this iPhone (HealthSensorRecorder), the watch is told
//   the session; when it ends, the watch closes its file and sends it here, where it joins the same account
//   directory, outside every backup.
// It is also the one crossing of the companion app (watch/WatchLink.swift, lots W1-W7): the watch's requests go to the page
// (WatchLinkInbox.swift) and its microphone too; the page's screen model ("link" in the context), its tiles (a file) and the
// assistant's voice go to the watch. Nothing else crosses this bridge.
final class AppWatchSensorBridge: NSObject, HealthSensorWatchLink, HealthWorkoutWatchLink, WCSessionDelegate {
    static let shared = AppWatchSensorBridge()
    private static let log = Logger(subsystem: "atome", category: "WatchSensors")
    private let store = HKHealthStore()
    // Voice packets start with their way: the watch's microphone, the assistant's voice to the watch.
    private static let microphoneTag: UInt8 = 0x6D
    private static let voiceTag: UInt8 = 0x73
    // The application context holds the latest request of each use ("workout", "sensors", "link"): it replaces the whole
    // dictionary, so both are kept together, on this queue.
    private let contextQueue = DispatchQueue(label: "one.atome.watch.context")
    private var context: [String: Any] = [:]

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
        HealthSensorRecorder.watchLink = self
        HealthWorkoutRecorder.watchLink = self
    }

    private var watchReady: Bool {
        WCSession.isSupported() && WCSession.default.activationState == .activated && WCSession.default.isPaired && WCSession.default.isWatchAppInstalled
    }

    func startWorkout(session: String, activity: HKWorkoutActivityType, startedAt: Date) {
        guard watchReady else { return }
        send(["workout": ["state": "start", "session": session, "at": Int64(startedAt.timeIntervalSince1970 * 1000)]])
        launch(activity)
    }

    func stopWorkout(session: String) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isPaired else { return }
        send(["workout": ["state": "stop", "session": session]])
    }

    private func launch(_ activity: HKWorkoutActivityType) {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = activity
        configuration.locationType = .indoor
        store.startWatchApp(with: configuration) { started, error in
            if !started { Self.log.error("Watch app not started: \(error?.localizedDescription ?? "unknown", privacy: .public)") }
        }
    }

    func start(session: String, startedAt: Int64, directory: String) {
        guard watchReady else { return }
        send(["sensors": ["state": "start", "session": session, "at": startedAt, "directory": directory]])
        launch(.traditionalStrengthTraining)
    }

    func stop(session: String) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isPaired else { return }
        send(["sensors": ["state": "stop", "session": session]])
    }

    // The application context reaches the watch app even when it is launched afterwards; a live
    // message reaches it at once when it already runs.
    private func send(_ message: [String: Any]) {
        contextQueue.async {
            message.forEach { self.context[$0.key] = $0.value }
            do { try WCSession.default.updateApplicationContext(self.context) }
            catch { Self.log.error("Watch context not sent: \(error.localizedDescription, privacy: .public)") }
            if WCSession.default.isReachable { WCSession.default.sendMessage(message, replyHandler: nil) }
        }
    }

    // MARK: - Companion app

    // The screen model as the page describes it (JSON): the latest one is what the watch shows, even launched afterwards.
    func publish(model: String) {
        guard watchReady else { return }
        send(["link": model])
    }

    // The tiles and their pictures: a newer version replaces one still on its way; the same version on its way is kept.
    func sendCatalog(_ url: URL, version: String) {
        guard watchReady else { return remove(url) }
        let going = WCSession.default.outstandingFileTransfers.filter { $0.file.metadata?["link"] as? String == "catalog" }
        if going.contains(where: { $0.file.metadata?["version"] as? String == version }) { return remove(url) }
        going.forEach { $0.cancel() }
        WCSession.default.transferFile(url, metadata: ["link": "catalog", "version": version])
    }

    // The assistant's voice for the watch's speaker; lost when the watch cannot hear it now (a live voice is never queued).
    func sendVoice(_ pcm: Data) {
        guard watchReady, WCSession.default.isReachable else { return }
        WCSession.default.sendMessageData(Data([Self.voiceTag]) + pcm, replyHandler: nil) { error in
            Self.log.error("Watch voice not sent: \(error.localizedDescription, privacy: .public)")
        }
    }

    func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
        guard messageData.first == Self.microphoneTag else { return }
        WatchLinkInbox.shared.heard(messageData.dropFirst())
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        guard fileTransfer.file.metadata?["link"] as? String == "catalog" else { return }
        if let error { Self.log.error("Watch catalog not sent: \(error.localizedDescription, privacy: .public)") }
        remove(fileTransfer.file.fileURL)
    }

    private func remove(_ url: URL) {
        do { try FileManager.default.removeItem(at: url) }
        catch { Self.log.error("Watch catalog file not removed: \(error.localizedDescription, privacy: .public)") }
    }

    // A request of the companion app: { "link": { "kind", … } }; a heart rate the watch measured for the session:
    // { "heart": { "bpm", "at" (ms) } }.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let request = message["link"] as? [String: Any] { return WatchLinkInbox.shared.received(request) }
        guard let heart = message["heart"] as? [String: Any], let bpm = (heart["bpm"] as? NSNumber)?.doubleValue,
              let at = (heart["at"] as? NSNumber)?.doubleValue else { return }
        AppNativeHealthController.shared.watchHeartRate(bpm: bpm, at: Date(timeIntervalSince1970: at / 1000))
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
