import Foundation
import CoreMotion
import HealthKit
import WatchConnectivity
import WatchKit
import os.log

// The watch's workout during an eVe session, started by the iPhone (application/AppWatchSensorBridge.swift) for two
// uses that share it, the workout running while either asks for it:
// - the heart rate of a training session ("workout" requests): the workout measures the heart at workout rate and
//   each reading is sent at once to the iPhone (a live message), which shows it in the session;
// - the wrist's raw motion ("sensors" requests), in the sensor recording format
//   (atome/documentations/sensor_recording_format.md): the workout keeps the app running and unlocks the high-rate
//   batched sensors (800 Hz accelerometer, 200 Hz device motion) where the watch has them, else 100 Hz; at the end
//   the file is sent to the iPhone and removed here.
// Heart rate is the watch's own measurement (processed by the system). The workout is discarded: the iPhone saves
// the session's workout.
// As the watch's one WCSession delegate it also hands the companion its model, its tiles, the iPhone's reach and the
// assistant's voice (WatchLink.swift, WatchVoice.swift).
final class WatchSensorSession: NSObject, WCSessionDelegate, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    static let shared = WatchSensorSession()
    private static let log = Logger(subsystem: "atome", category: "WatchSensors")
    // A start older than this, replayed from the last application context, is not a session any more.
    private static let staleStartMs: Int64 = 6 * 3600 * 1000

    private let store = HKHealthStore()
    private let motion = CMMotionManager()
    private let batched = CMBatchedSensorManager()
    // Commands, sensor batches and the writer share this one serial queue.
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .userInitiated
        return queue
    }()
    private var configuration = HKWorkoutConfiguration()
    private var workout: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var writer: SensorRecordingWriter?
    private var session: String?
    // The training session the iPhone asked the heart rate for.
    private var heartSession: String?
    private var directory = ""
    private var origin: TimeInterval = 0
    private var startedAt = Date()
    private var streamIndex: [String: Int] = [:]

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func workoutRequested(_ configuration: HKWorkoutConfiguration) {
        queue.addOperation { self.configuration = configuration }
    }

    // MARK: - iPhone requests

    private func received(_ message: [String: Any]) {
        // The companion's screen model (WatchLink.swift).
        if let model = message["link"] as? String { Task { @MainActor in WatchLink.shared.received(model: model) } }
        if let request = message["workout"] as? [String: Any] { receivedWorkout(request) }
        guard let request = message["sensors"] as? [String: Any], let state = request["state"] as? String,
              let id = request["session"] as? String, !id.isEmpty, id.count <= 300 else { return }
        queue.addOperation {
            if state == "stop" { return id == self.session ? self.finish() : () }
            guard state == "start", self.session != id, let digest = request["directory"] as? String,
                  digest.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil else { return }
            let at = (request["at"] as? NSNumber)?.int64Value ?? 0
            guard Int64(Date().timeIntervalSince1970 * 1000) - at < Self.staleStartMs else { return }
            if self.session != nil { self.finish() }
            self.begin(id, directory: digest)
        }
    }

    private func receivedWorkout(_ request: [String: Any]) {
        guard let state = request["state"] as? String, let id = request["session"] as? String, !id.isEmpty, id.count <= 300 else { return }
        queue.addOperation {
            if state == "stop" {
                guard id == self.heartSession else { return }
                self.heartSession = nil
                if self.session == nil { self.endWorkout() }
                return
            }
            let at = (request["at"] as? NSNumber)?.int64Value ?? 0
            guard state == "start", self.heartSession != id, Int64(Date().timeIntervalSince1970 * 1000) - at < Self.staleStartMs else { return }
            self.heartSession = id
            if self.session == nil { self.startedAt = Date() }
            self.startWorkout()
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { received(applicationContext) }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { received(message) }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated { received(session.receivedApplicationContext) }
        let reachable = session.isReachable
        Task { @MainActor in WatchLink.shared.reachabilityChanged(reachable) }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in WatchLink.shared.reachabilityChanged(reachable) }
    }

    // The assistant's voice for this watch's speaker (WatchVoice.swift).
    func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
        guard messageData.first == WatchVoice.voiceTag else { return }
        WatchVoice.shared.play(messageData.dropFirst())
    }

    // The companion's tiles: kept before this returns (the received file is removed then), then read.
    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        guard file.metadata?["link"] as? String == "catalog", let url = WatchLink.catalogURL else { return }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
            try FileManager.default.moveItem(at: file.fileURL, to: url)
        } catch {
            return Self.log.error("Watch catalog not kept: \(error.localizedDescription, privacy: .public)")
        }
        Task { @MainActor in WatchLink.shared.receivedCatalog() }
    }

    // The iPhone has the file: it is not kept here.
    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        if let error { return Self.log.error("Watch recording not sent: \(error.localizedDescription, privacy: .public)") }
        do { try FileManager.default.removeItem(at: fileTransfer.file.fileURL) }
        catch { Self.log.error("Sent watch recording not removed: \(error.localizedDescription, privacy: .public)") }
    }

    // MARK: - Recording (on the queue)

    private func begin(_ id: String, directory digest: String) {
        let streams = availableStreams()
        guard !streams.isEmpty, let root = Self.root() else { return Self.log.error("Watch recording unavailable") }
        startedAt = Date()
        origin = ProcessInfo.processInfo.systemUptime
        let startedMs = Int64(startedAt.timeIntervalSince1970 * 1000)
        let header: [String: Any] = ["format": "atome.sensor_recording", "version": 1, "session_id": id, "started_at": startedMs,
                                     "clock": "ns_since_started_at", "source": Self.source()]
        do { writer = try SensorRecordingWriter(url: root.appendingPathComponent("\(startedMs)-watch.asr"), header: header, streams: streams) }
        catch { return Self.log.error("Watch recording not created: \(error.localizedDescription, privacy: .public)") }
        session = id
        directory = digest
        streamIndex = Dictionary(uniqueKeysWithValues: streams.enumerated().map { ($0.element.id, $0.offset) })
        startWorkout()
        startSensors()
    }

    private func finish() {
        stopSensors()
        if heartSession == nil { endWorkout() }
        let writer = self.writer
        self.writer = nil
        session = nil
        guard let writer else { return }
        do {
            _ = try writer.finish()
            WCSession.default.transferFile(writer.url, metadata: ["file": writer.url.lastPathComponent, "directory": directory])
        } catch {
            Self.log.error("Watch recording not closed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func write(_ id: String, _ timestamp: TimeInterval, _ sample: [Double]) {
        guard let writer, let stream = streamIndex[id] else { return }
        do { try writer.append(stream, timeNs: Int64(((timestamp - origin) * 1_000_000_000).rounded()), sample) }
        catch {
            Self.log.error("Watch recording write failed: \(error.localizedDescription, privacy: .public)")
            finish()
        }
    }

    // MARK: - Sensors

    private var highRate: Bool { CMBatchedSensorManager.isAccelerometerSupported && CMBatchedSensorManager.isDeviceMotionSupported }

    private func availableStreams() -> [SensorRecordingWriter.Stream] {
        let xyz = ["x", "y", "z"]
        let motionAxes = ["attitude_qx", "attitude_qy", "attitude_qz", "attitude_qw", "gravity_x", "gravity_y", "gravity_z",
                          "user_acceleration_x", "user_acceleration_y", "user_acceleration_z", "rotation_rate_x", "rotation_rate_y", "rotation_rate_z"]
        var streams: [SensorRecordingWriter.Stream] = []
        if highRate {
            streams.append(.init(id: "accelerometer", sensor: "accelerometer", axes: xyz, unit: "g", rateHz: Double(batched.accelerometerDataFrequency)))
            streams.append(.init(id: "device_motion", sensor: "device_motion", axes: motionAxes, unit: "g|rad/s", rateHz: Double(batched.deviceMotionDataFrequency)))
        } else {
            if motion.isAccelerometerAvailable { streams.append(.init(id: "accelerometer", sensor: "accelerometer", axes: xyz, unit: "g", rateHz: 100)) }
            if motion.isDeviceMotionAvailable { streams.append(.init(id: "device_motion", sensor: "device_motion", axes: motionAxes, unit: "g|rad/s", rateHz: 100)) }
        }
        streams.append(.init(id: "heart_rate", sensor: "heart_rate", axes: ["bpm"], unit: "count/min", rateHz: 0))
        return streams
    }

    private func startSensors() {
        if highRate {
            batched.startAccelerometerUpdates { [weak self] batch, _ in
                guard let batch else { return }
                self?.queue.addOperation { batch.forEach { self?.write("accelerometer", $0.timestamp, [$0.acceleration.x, $0.acceleration.y, $0.acceleration.z]) } }
            }
            batched.startDeviceMotionUpdates { [weak self] batch, _ in
                guard let batch else { return }
                self?.queue.addOperation { batch.forEach { self?.write("device_motion", $0.timestamp, Self.motionSample($0)) } }
            }
            return
        }
        motion.accelerometerUpdateInterval = 0.01
        motion.deviceMotionUpdateInterval = 0.01
        motion.startAccelerometerUpdates(to: queue) { [weak self] data, _ in
            guard let data else { return }
            self?.write("accelerometer", data.timestamp, [data.acceleration.x, data.acceleration.y, data.acceleration.z])
        }
        motion.startDeviceMotionUpdates(to: queue) { [weak self] data, _ in
            guard let data else { return }
            self?.write("device_motion", data.timestamp, Self.motionSample(data))
        }
    }

    private func stopSensors() {
        batched.stopAccelerometerUpdates()
        batched.stopDeviceMotionUpdates()
        motion.stopAccelerometerUpdates()
        motion.stopDeviceMotionUpdates()
    }

    private static func motionSample(_ data: CMDeviceMotion) -> [Double] {
        let q = data.attitude.quaternion, g = data.gravity, a = data.userAcceleration, r = data.rotationRate
        return [q.x, q.y, q.z, q.w, g.x, g.y, g.z, a.x, a.y, a.z, r.x, r.y, r.z]
    }

    // MARK: - Workout session (keeps the app running, unlocks the batched sensors, measures the heart)

    private func startWorkout() {
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate)]
        store.requestAuthorization(toShare: share, read: read) { [weak self] _, error in
            guard let self else { return }
            if let error { Self.log.error("Watch workout not authorized: \(error.localizedDescription, privacy: .public)") }
            self.queue.addOperation {
                guard self.session != nil || self.heartSession != nil, self.workout == nil else { return }
                do {
                    let workout = try HKWorkoutSession(healthStore: self.store, configuration: self.configuration)
                    let builder = workout.associatedWorkoutBuilder()
                    builder.dataSource = HKLiveWorkoutDataSource(healthStore: self.store, workoutConfiguration: self.configuration)
                    workout.delegate = self
                    builder.delegate = self
                    self.workout = workout
                    self.builder = builder
                    workout.startActivity(with: self.startedAt)
                    builder.beginCollection(withStart: self.startedAt) { _, error in
                        if let error { Self.log.error("Watch workout collection failed: \(error.localizedDescription, privacy: .public)") }
                    }
                } catch {
                    Self.log.error("Watch workout not started: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private func endWorkout() {
        guard let workout, let builder else { return }
        self.workout = nil
        self.builder = nil
        workout.end()
        builder.endCollection(withEnd: Date()) { _, _ in builder.discardWorkout() }
    }

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let heartRate = HKQuantityType(.heartRate)
        guard collectedTypes.contains(heartRate), let statistics = workoutBuilder.statistics(for: heartRate),
              let quantity = statistics.mostRecentQuantity(), let interval = statistics.mostRecentQuantityDateInterval() else { return }
        let bpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        queue.addOperation {
            if self.writer != nil { self.write("heart_rate", self.origin + interval.end.timeIntervalSince(self.startedAt), [bpm]) }
            // Live to the iPhone while it asks for the heart rate; a reading missed while it is unreachable is not queued.
            guard self.heartSession != nil, WCSession.default.isReachable else { return }
            WCSession.default.sendMessage(["heart": ["bpm": bpm, "at": interval.end.timeIntervalSince1970 * 1000]], replyHandler: nil) { error in
                Self.log.error("Watch heart rate not sent: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Self.log.error("Watch workout failed: \(error.localizedDescription, privacy: .public)")
    }

    // MARK: - Storage

    private static func root() -> URL? {
        guard var root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("atome_sensor_recordings", isDirectory: true) else { return nil }
        do {
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try root.setResourceValues(values)
        } catch {
            return nil
        }
        return root
    }

    private static func source() -> [String: Any] {
        var system = utsname()
        uname(&system)
        let model = withUnsafeBytes(of: system.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        return ["platform": "watchos", "role": "watch", "model": model, "os": WKInterfaceDevice.current().systemVersion,
                "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""]
    }
}
