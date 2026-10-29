import Foundation
#if canImport(CoreMotion)
import CoreMotion
#endif
#if canImport(UIKit)
import UIKit
#endif
import CryptoKit

// A paired Apple Watch records the wrist in the same session (AppWatchSensorBridge.swift, watch/):
// its file joins this directory when the session ends.
protocol HealthSensorWatchLink: AnyObject {
    func start(session: String, startedAt: Int64, directory: String)
    func stop(session: String)
}

// The raw motion of this iPhone during an eVe activity session (training, nap, meditation), recorded in
// the sensor recording format (atome/documentations/sensor_recording_format.md). Everything the motion
// sensors give is kept losslessly on this device (its only copy elsewhere is encrypted by the page, sensor_backup.js): the directory is excluded from backups and the
// files are protected by the system. One recording at a time; the page decides when (session start and
// end) through AppNativeHealthController, which verified the account.
final class HealthSensorRecorder {
    static let commands: Set<String> = [
        "health_sensors_start", "health_sensors_stop", "health_sensors_status",
        "health_sensors_list", "health_sensors_delete", "health_sensors_enable",
        "health_sensors_read", "health_sensors_restore"
    ]
    private static let rootName = "atome_sensor_recordings"
    // Installed by the app target; the AUv3 extension refuses every health command anyway.
    static weak var watchLink: HealthSensorWatchLink?
    private static let filePattern = "^[0-9]{1,16}-(phone|watch)\\.asr$"
    private static let listLimit = 500
    // One piece of a recording read or restored at a time: the page encrypts or decrypts it (sensor_backup.js).
    private static let pieceLimit = 262_144

    #if canImport(CoreMotion)
    private let motion = CMMotionManager()
    private let altimeter = CMAltimeter()
    #endif
    // Commands, sensor callbacks and the writer share this one serial queue.
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .userInitiated
        queue.name = "one.atome.health.sensors"
        return queue
    }()
    private var writer: SensorRecordingWriter?
    private var session: String?
    private var origin: TimeInterval = 0

    // Every state change runs on the sensor queue, after the callbacks already queued.
    func handle(_ command: String, account: String, payload: [String: Any], reply: @escaping ([String: Any]) -> Void) {
        queue.addOperation { self.run(command, account: account, payload: payload, reply: reply) }
    }

    private func run(_ command: String, account: String, payload: [String: Any], reply: @escaping ([String: Any]) -> Void) {
        let fail: (String) -> Void = { code in reply(["ok": false, "error": code]) }
        guard let directory = Self.directory(account) else { return fail("health_sensors_storage_unavailable") }
        switch command {
        case "health_sensors_start":
            guard let session = payload["session"] as? String, !session.isEmpty, session.count <= 300 else { return fail("health_sensors_invalid") }
            guard Self.enabled(directory) else { return reply(["recording": false, "reason": "health_sensors_disabled"]) }
            start(session, sessionStartedAt: payload["at"] as? Double, directory: directory, reply: reply, fail: fail)
        case "health_sensors_stop":
            guard let session = payload["session"] as? String, session == self.session else { return reply(["stopped": false]) }
            reply(finish())
        case "health_sensors_status":
            let files = Self.files(directory)
            reply(["enabled": Self.enabled(directory), "recording": session as Any, "recordings": files.count,
                   "bytes": files.reduce(0) { $0 + Self.size($1) }, "sensors": availableStreams().map(\.id)])
        case "health_sensors_list":
            reply(["recordings": Self.files(directory).prefix(Self.listLimit).map(Self.describe)])
        case "health_sensors_delete":
            delete(payload, directory: directory, reply: reply, fail: fail)
        case "health_sensors_enable":
            guard let enabled = payload["enabled"] as? Bool else { return fail("health_sensors_invalid") }
            let marker = directory.appendingPathComponent("disabled")
            if enabled { try? FileManager.default.removeItem(at: marker) } else { FileManager.default.createFile(atPath: marker.path, contents: Data()) }
            if !enabled && session != nil { _ = finish() }
            reply(["enabled": enabled])
        case "health_sensors_read":
            read(payload, directory: directory, reply: reply, fail: fail)
        case "health_sensors_restore":
            restore(payload, directory: directory, reply: reply, fail: fail)
        default:
            fail("health_command_unknown")
        }
    }

    // Page load, channel close or context reset: the recording so far is kept, closed.
    func finishCurrent() {
        queue.addOperation { if self.session != nil { _ = self.finish() } }
    }

    private func start(_ session: String, sessionStartedAt: Double?, directory: URL,
                       reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        if self.session == session { return reply(["recording": true, "already": true]) }
        if self.session != nil { _ = finish() }
        let streams = availableStreams()
        guard !streams.isEmpty else { return reply(["recording": false, "reason": "health_sensors_unavailable"]) }
        let startedAt = Date()
        origin = ProcessInfo.processInfo.systemUptime
        let startedMs = Int64(startedAt.timeIntervalSince1970 * 1000)
        let url = directory.appendingPathComponent("\(startedMs)-phone.asr")
        var header: [String: Any] = ["format": "atome.sensor_recording", "version": 1, "session_id": session,
                                     "started_at": startedMs, "clock": "ns_since_started_at", "source": Self.source()]
        if let sessionStartedAt { header["session_started_at"] = Int64(sessionStartedAt) }
        do { writer = try SensorRecordingWriter(url: url, header: header, streams: streams) }
        catch { return fail("health_sensors_storage_unavailable") }
        self.session = session
        startUpdates(streams)
        Self.watchLink?.start(session: session, startedAt: startedMs, directory: directory.lastPathComponent)
        reply(["recording": true, "file": url.lastPathComponent, "streams": streams.map(\.id)])
    }

    private func finish() -> [String: Any] {
        stopUpdates()
        if let session { Self.watchLink?.stop(session: session) }
        let writer = self.writer
        self.writer = nil
        session = nil
        guard let writer else { return ["stopped": false] }
        do {
            let bytes = try writer.finish()
            var samples: [String: Int] = [:]
            for (index, stream) in writer.streams.enumerated() { samples[stream.id] = writer.counts[index] }
            return ["stopped": true, "file": writer.url.lastPathComponent, "bytes": bytes, "samples": samples]
        } catch {
            return ["ok": false, "error": "health_sensors_write_failed"]
        }
    }

    private func delete(_ payload: [String: Any], directory: URL, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        let recording = writer?.url.lastPathComponent
        let targets: [URL]
        if payload["all"] as? Bool == true {
            targets = Self.files(directory)
        } else if let name = payload["file"] as? String, name.range(of: Self.filePattern, options: .regularExpression) != nil {
            targets = [directory.appendingPathComponent(name)].filter { FileManager.default.fileExists(atPath: $0.path) }
            if targets.isEmpty { return fail("health_sensors_not_found") }
        } else {
            return fail("health_sensors_invalid")
        }
        let deleted = targets.filter { $0.lastPathComponent != recording && (try? FileManager.default.removeItem(at: $0)) != nil }
        reply(["deleted": deleted.count])
    }

    // A piece of a closed recording, for its encrypted copy in the account vault.
    private func read(_ payload: [String: Any], directory: URL, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        guard let name = payload["file"] as? String, name.range(of: Self.filePattern, options: .regularExpression) != nil,
              let offset = (payload["offset"] as? NSNumber)?.int64Value, offset >= 0,
              let length = (payload["length"] as? NSNumber)?.intValue, length > 0, length <= Self.pieceLimit else { return fail("health_sensors_invalid") }
        if name == writer?.url.lastPathComponent { return fail("health_sensors_busy") }
        let url = directory.appendingPathComponent(name)
        guard let handle = try? FileHandle(forReadingFrom: url) else { return fail("health_sensors_not_found") }
        defer { try? handle.close() }
        do {
            try handle.seek(toOffset: UInt64(offset))
            let data = try handle.read(upToCount: length) ?? Data()
            reply(["data": data.base64EncodedString(), "size": Self.size(url)])
        } catch {
            fail("health_sensors_storage_unavailable")
        }
    }

    // A recording brought back from the account vault, piece after piece; it appears only once whole.
    private func restore(_ payload: [String: Any], directory: URL, reply: @escaping ([String: Any]) -> Void, fail: @escaping (String) -> Void) {
        guard let name = payload["file"] as? String, name.range(of: Self.filePattern, options: .regularExpression) != nil,
              let offset = (payload["offset"] as? NSNumber)?.int64Value, offset >= 0,
              let text = payload["data"] as? String, let data = Data(base64Encoded: text), data.count <= Self.pieceLimit else { return fail("health_sensors_invalid") }
        let url = directory.appendingPathComponent(name), part = directory.appendingPathComponent("\(name).part")
        if FileManager.default.fileExists(atPath: url.path) { return fail("health_sensors_exists") }
        if offset == 0 { FileManager.default.createFile(atPath: part.path, contents: nil) }
        guard Int64(Self.size(part)) == offset, let handle = try? FileHandle(forWritingTo: part) else { return fail("health_sensors_invalid") }
        do {
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
            try handle.close()
            if payload["final"] as? Bool == true { try FileManager.default.moveItem(at: part, to: url) }
            reply(["size": offset + Int64(data.count)])
        } catch {
            try? handle.close()
            fail("health_sensors_storage_unavailable")
        }
    }

    // MARK: - Sensors

    private func availableStreams() -> [SensorRecordingWriter.Stream] {
        var streams: [SensorRecordingWriter.Stream] = []
        #if canImport(CoreMotion)
        let xyz = ["x", "y", "z"]
        if motion.isAccelerometerAvailable { streams.append(.init(id: "accelerometer", sensor: "accelerometer", axes: xyz, unit: "g", rateHz: 100)) }
        if motion.isGyroAvailable { streams.append(.init(id: "gyroscope", sensor: "gyroscope", axes: xyz, unit: "rad/s", rateHz: 100)) }
        if motion.isMagnetometerAvailable { streams.append(.init(id: "magnetometer", sensor: "magnetometer", axes: xyz, unit: "uT", rateHz: 100)) }
        if motion.isDeviceMotionAvailable {
            streams.append(.init(id: "device_motion", sensor: "device_motion", axes: [
                "attitude_qx", "attitude_qy", "attitude_qz", "attitude_qw", "gravity_x", "gravity_y", "gravity_z",
                "user_acceleration_x", "user_acceleration_y", "user_acceleration_z", "rotation_rate_x", "rotation_rate_y", "rotation_rate_z",
                "magnetic_field_x", "magnetic_field_y", "magnetic_field_z", "magnetic_field_accuracy"
            ], unit: "g|rad/s|uT", rateHz: 100))
        }
        if CMAltimeter.isRelativeAltitudeAvailable() {
            streams.append(.init(id: "pressure", sensor: "barometer", axes: ["pressure", "relative_altitude"], unit: "kPa|m", rateHz: 0))
        }
        #endif
        return streams
    }

    private func startUpdates(_ streams: [SensorRecordingWriter.Stream]) {
        #if canImport(CoreMotion)
        let index = Dictionary(uniqueKeysWithValues: streams.enumerated().map { ($0.element.id, $0.offset) })
        let interval = 1.0 / 100.0
        if let stream = index["accelerometer"] {
            motion.accelerometerUpdateInterval = interval
            motion.startAccelerometerUpdates(to: queue) { [weak self] data, _ in
                guard let data else { return }
                self?.write(stream, data.timestamp, [data.acceleration.x, data.acceleration.y, data.acceleration.z])
            }
        }
        if let stream = index["gyroscope"] {
            motion.gyroUpdateInterval = interval
            motion.startGyroUpdates(to: queue) { [weak self] data, _ in
                guard let data else { return }
                self?.write(stream, data.timestamp, [data.rotationRate.x, data.rotationRate.y, data.rotationRate.z])
            }
        }
        if let stream = index["magnetometer"] {
            motion.magnetometerUpdateInterval = interval
            motion.startMagnetometerUpdates(to: queue) { [weak self] data, _ in
                guard let data else { return }
                self?.write(stream, data.timestamp, [data.magneticField.x, data.magneticField.y, data.magneticField.z])
            }
        }
        if let stream = index["device_motion"] {
            motion.deviceMotionUpdateInterval = interval
            let frame: CMAttitudeReferenceFrame = CMMotionManager.availableAttitudeReferenceFrames().contains(.xArbitraryCorrectedZVertical)
                ? .xArbitraryCorrectedZVertical : .xArbitraryZVertical
            motion.startDeviceMotionUpdates(using: frame, to: queue) { [weak self] data, _ in
                guard let data else { return }
                let q = data.attitude.quaternion, g = data.gravity, a = data.userAcceleration, r = data.rotationRate, m = data.magneticField
                self?.write(stream, data.timestamp, [q.x, q.y, q.z, q.w, g.x, g.y, g.z, a.x, a.y, a.z, r.x, r.y, r.z,
                                                     m.field.x, m.field.y, m.field.z, Double(m.accuracy.rawValue)])
            }
        }
        if let stream = index["pressure"] {
            altimeter.startRelativeAltitudeUpdates(to: queue) { [weak self] data, _ in
                guard let data else { return }
                self?.write(stream, data.timestamp, [data.pressure.doubleValue, data.relativeAltitude.doubleValue])
            }
        }
        #endif
    }

    private func stopUpdates() {
        #if canImport(CoreMotion)
        motion.stopAccelerometerUpdates()
        motion.stopGyroUpdates()
        motion.stopMagnetometerUpdates()
        motion.stopDeviceMotionUpdates()
        altimeter.stopRelativeAltitudeUpdates()
        #endif
    }

    // On the sensor queue. Sensor times are seconds since boot, as is `origin`.
    private func write(_ stream: Int, _ timestamp: TimeInterval, _ sample: [Double]) {
        guard let writer else { return }
        do { try writer.append(stream, timeNs: Int64(((timestamp - origin) * 1_000_000_000).rounded()), sample) }
        catch {
            stopUpdates()
            self.writer = nil
            session = nil
        }
    }

    // MARK: - Storage

    // Application Support, outside every backup; one directory per account, named by a digest.
    private static func directory(_ account: String) -> URL? {
        let digest = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined().prefix(32)
        return directory(named: String(digest))
    }

    // An account's directory by its digest (the name a watch recording carries back).
    static func directory(named name: String) -> URL? {
        guard name.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil,
              var root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent(rootName, isDirectory: true) else { return nil }
        let directory = root.appendingPathComponent(name, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try root.setResourceValues(values)
        } catch {
            return nil
        }
        return directory
    }

    private static func enabled(_ directory: URL) -> Bool {
        !FileManager.default.fileExists(atPath: directory.appendingPathComponent("disabled").path)
    }

    // Newest first.
    private static func files(_ directory: URL) -> [URL] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { $0.range(of: filePattern, options: .regularExpression) != nil }
            .sorted { (Int64($0.split(separator: "-")[0]) ?? 0) > (Int64($1.split(separator: "-")[0]) ?? 0) }
            .map { directory.appendingPathComponent($0) }
    }

    private static func size(_ url: URL) -> Int {
        (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }

    private static func describe(_ url: URL) -> [String: Any] {
        let header = SensorRecordingWriter.readHeader(url) ?? [:]
        let source = header["source"] as? [String: Any] ?? [:]
        return ["file": url.lastPathComponent, "session_id": header["session_id"] as Any, "started_at": header["started_at"] as Any,
                "role": source["role"] as Any, "platform": source["platform"] as Any, "bytes": size(url)]
    }

    private static func source() -> [String: Any] {
        var system = utsname()
        uname(&system)
        let model = withUnsafeBytes(of: system.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        #if canImport(UIKit)
        let os = UIDevice.current.systemVersion
        #else
        let os = ProcessInfo.processInfo.operatingSystemVersionString
        #endif
        return ["platform": "ios", "role": "phone", "model": model, "os": os,
                "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""]
    }
}
