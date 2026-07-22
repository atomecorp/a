import AVFoundation
import Foundation

final class AppNativeAudioController: NSObject {
    static let shared = AppNativeAudioController()

    struct ClipEntry {
        let id: String
        let url: URL
        let path: String
        let sampleRate: Double
        let durationSeconds: Double
        let isAudioFile: Bool
        let processingFormat: AVAudioFormat?
        let asset: AVURLAsset?
        let cachedBuffer: AVAudioPCMBuffer?
    }

    final class VoiceEntry {
        let voiceId: String
        let assetId: String
        let playerNode: AVAudioPlayerNode
        let rateNode: AVAudioUnitVarispeed
        var stopWorkItem: DispatchWorkItem?
        var audioFiles: [AVAudioFile] = []

        init(voiceId: String,
             assetId: String,
             playerNode: AVAudioPlayerNode,
             rateNode: AVAudioUnitVarispeed) {
            self.voiceId = voiceId
            self.assetId = assetId
            self.playerNode = playerNode
            self.rateNode = rateNode
        }
    }

    let queue = DispatchQueue(label: "atome.app.native_audio", qos: .userInitiated)
    let engine = AVAudioEngine()
    let recordingEngine = AVAudioEngine()
    let nativeRecorderBackend = AUv3NativeRecorderBackend()
    let maxCachedVideoAudioDurationSeconds: Double = 45.0
    let recordingScopeBinCount = 64

    var clips: [String: ClipEntry] = [:]
    var voices: [String: VoiceEntry] = [:]
    var audioSessionReady = false
    var playbackEngineNeedsReset = false
    var playbackRouteSignature = ""
    var activeRecordingSessionId: String?
    var activeRecordingFileName: String?
    var activeRecordingPath: String?
    var activeRecordingAbsolutePath: String?
    var activeRecordingSampleRate: Double = 0
    var activeRecordingChannels: Int = 0
    var recordingChannelPointers: [UnsafePointer<Float>?] = Array(repeating: nil, count: 8)
    var recordingScopeMinima = [Float](repeating: 0, count: 64)
    var recordingScopeMaxima = [Float](repeating: 0, count: 64)
    var recordingScopePairs = [Float](repeating: 0, count: 128)
    var recordingScopeLastSequence: UInt64 = 0
    var recordingScopeMonitorGeneration: UInt64 = 0

    private override init() {
        super.init()
        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(handleAudioSessionInterruption),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        center.addObserver(
            self,
            selector: #selector(handleAudioSessionRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
        center.addObserver(
            self,
            selector: #selector(handleAudioSessionMediaServicesReset),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    func complete(_ completion: @escaping ([String: Any], String?) -> Void,
                  payload: [String: Any],
                  error: String? = nil) {
        DispatchQueue.main.async {
            completion(payload, error)
        }
    }

    func resolveClipURL(_ rawPath: String) -> URL? {
        var trimmed = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }

        if let url = URL(string: trimmed),
           let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https" {
            trimmed = url.path
        }
        if trimmed.hasPrefix("/file/") {
            trimmed = String(trimmed.dropFirst("/file/".count))
        } else if trimmed.hasPrefix("file/") {
            trimmed = String(trimmed.dropFirst("file/".count))
        }

        if trimmed.hasPrefix("/") {
            let url = URL(fileURLWithPath: trimmed)
            if FileManager.default.fileExists(atPath: url.path) {
                return url
            }
        }

        for candidate in SandboxPathValidator.candidateURLs(for: trimmed) {
            if FileManager.default.fileExists(atPath: candidate.path) {
                return candidate
            }
        }

        let fileName = (trimmed as NSString).lastPathComponent
        if !fileName.isEmpty, let root = iCloudFileManager.shared.getCurrentStorageURL() {
            let folderHints = ["Downloads", "Recordings", "recordings"]
            if let usersRoot = SandboxPathValidator.sanitizedRelativePath("data/users") {
                let usersURL = root.appendingPathComponent(usersRoot, isDirectory: true)
                if let directories = try? FileManager.default.contentsOfDirectory(
                    at: usersURL,
                    includingPropertiesForKeys: [.isDirectoryKey],
                    options: [.skipsHiddenFiles]
                ) {
                    for directory in directories {
                        for folder in folderHints {
                            let candidate = directory.appendingPathComponent("\(folder)/\(fileName)")
                            if FileManager.default.fileExists(atPath: candidate.path) {
                                return candidate
                            }
                        }
                    }
                }
            }
            let fallback = root.appendingPathComponent(trimmed)
            if FileManager.default.fileExists(atPath: fallback.path) {
                return fallback
            }
        }

        return nil
    }

    func resolveString(_ payload: [String: Any], _ keys: [String]) -> String {
        for key in keys {
            if let value = payload[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return ""
    }

    func resolveDouble(_ payload: [String: Any], _ keys: [String], fallback: Double) -> Double {
        for key in keys {
            if let value = payload[key] as? NSNumber {
                return value.doubleValue
            }
            if let value = payload[key] as? Double {
                return value
            }
            if let value = payload[key] as? Float {
                return Double(value)
            }
            if let value = payload[key] as? String, let parsed = Double(value) {
                return parsed
            }
        }
        return fallback
    }

    func resolveOptionalDouble(_ payload: [String: Any], _ keys: [String]) -> Double? {
        let marker = Double.nan
        let value = resolveDouble(payload, keys, fallback: marker)
        return value.isNaN ? nil : value
    }

    func clamp(_ value: Double, min minValue: Double, max maxValue: Double) -> Double {
        Swift.min(maxValue, Swift.max(minValue, value))
    }

    func gainToLinear(_ gain: Double) -> Float {
        Float(clamp(gain, min: 0, max: 4))
    }

    func decibelsToLinear(_ db: Double) -> Float {
        let linear = pow(10.0, db / 20.0)
        return Float(clamp(linear, min: 0, max: 4))
    }

    func configureAudioSessionIfNeeded() throws {
        let session = AVAudioSession.sharedInstance()
        if !audioSessionReady {
            try session.setCategory(
                .playAndRecord,
                mode: .default,
                options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothHFP]
            )
            audioSessionReady = true
        }
        try session.setActive(true)
    }

    @objc private func handleAudioSessionInterruption(_ notification: Notification) {
        queue.async {
            self.audioSessionReady = false
            self.playbackEngineNeedsReset = true
        }
    }

    @objc private func handleAudioSessionRouteChange(_ notification: Notification) {
        queue.async {
            self.playbackEngineNeedsReset = true
        }
    }

    @objc private func handleAudioSessionMediaServicesReset(_ notification: Notification) {
        queue.async {
            self.audioSessionReady = false
            self.playbackEngineNeedsReset = true
        }
    }

    func requestMicrophonePermission(_ completion: @escaping (Bool) -> Void) {
        let session = AVAudioSession.sharedInstance()
        switch session.recordPermission {
        case .granted:
            completion(true)
        case .denied:
            completion(false)
        case .undetermined:
            DispatchQueue.main.async {
                session.requestRecordPermission { granted in
                    completion(granted)
                }
            }
        @unknown default:
            completion(false)
        }
    }

    func mediaOutputURL(fileName: String,
                        filePath: String,
                        userId: String,
                        defaultFolder: String = "recordings") throws -> URL {
        let safeFileName = fileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "capture_\(Int(Date().timeIntervalSince1970)).dat"
            : (fileName as NSString).lastPathComponent
        let relativePath: String
        if !filePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            relativePath = filePath
        } else {
            let safeUserId = userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "anonymous"
                : userId
            relativePath = "data/users/\(safeUserId)/\(defaultFolder)/\(safeFileName)"
        }
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(relativePath),
              let root = SandboxPathValidator.primaryRoot() else {
            throw NSError(domain: "AppNativeAudioController", code: 20, userInfo: [
                NSLocalizedDescriptionKey: "Invalid recording path"
            ])
        }
        let url = root.appendingPathComponent(sanitized, isDirectory: false)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        return url
    }
}
