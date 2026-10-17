import AVFoundation
import Foundation
import UIKit

// Control state is confined to queue. While running, only the audio tap owns its
// preallocated PCM pointers; the native backend synchronizes recording snapshots.
final class AppNativeAudioController: NSObject, @unchecked Sendable {
    static let shared = AppNativeAudioController()

    let queue = DispatchQueue(label: "atome.app.native_audio", qos: .userInitiated)
    let recordingEngine = AVAudioEngine()
    let recordingScopeBinCount = 64

    var audioSessionConsumers = AppNativeAudioConsumerRegistry()
    var systemOwnsAudioActivation = false
    var captureGate = AppNativeAudioCaptureGate()
    var audioRecordingConsumerSequence: UInt64 = 0
    var activeRecordingConsumerId: String?
    var wakeCaptureToken: UInt64?
    var wakeCaptureActive = false
    var wakeCaptureSamples: [Int16] = []
    var wakeCaptureOverrun = false
    var wakeCaptureFailed = false
    var wakeCaptureInterrupted = false
    var wakeCaptureBackground = false
    var activeRecordingSessionId: String?
    var activeRecordingFileName: String?
    var activeRecordingPath: String?
    var activeRecordingAbsolutePath: String?
    var activeRecordingSampleRate: Double = 0
    var activeRecordingChannels: Int = 0
    var recordingScopePairs = [Float](repeating: 0, count: 128)
    var recordingScopeLastSequence: UInt64 = 0
    var recordingScopeMonitorGeneration: UInt64 = 0

    private override init() {
        super.init()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(handleWakeBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(handleWakeForeground), name: UIApplication.didBecomeActiveNotification, object: nil)
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

    @objc private func handleWakeBackground() {
        queue.async { self.wakeCaptureBackground = true; self.stopWakeCapture() }
    }

    @objc private func handleWakeForeground() {
        queue.async { self.wakeCaptureBackground = false }
    }

    @objc private func handleAudioSessionInterruption(_ notification: Notification) {
        let userInfo = notification.userInfo ?? [:]
        let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
        let interruptionType = AVAudioSession.InterruptionType(rawValue: typeValue)
        let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        queue.async {
            guard interruptionType == .ended else {
                self.wakeCaptureInterrupted = true
                self.captureGate.cancel()
                self.stopWakeCapture()
                AppNativeAudioDiagnostics.log(
                    "session interruption_began \(self.audioSessionDiagnosticSnapshot())"
                )
                return
            }
            self.wakeCaptureInterrupted = false
            guard options.contains(.shouldResume) else { return }
            // The system owns the session while it is interrupted; the plan is
            // re-applied only once it gives the session back.
            self.applyCurrentAudioSessionPlan(transition: "interruption_ended")
        }
    }

    @objc private func handleAudioSessionRouteChange(_ notification: Notification) {
        queue.async {
            guard !self.audioSessionConsumers.captureConsumerIds.isEmpty else { return }
            AppNativeAudioDiagnostics.log(
                "session route_changed \(self.audioSessionDiagnosticSnapshot())"
            )
        }
    }

    @objc private func handleAudioSessionMediaServicesReset(_ notification: Notification) {
        queue.async {
            // The media server rebuilt every session: nothing we applied
            // survives, so re-assert the plan for the current consumers.
            AppNativeAudioDiagnostics.log("session media_services_reset")
            self.applyCurrentAudioSessionPlan(transition: "media_services_reset")
        }
    }

    func requestMicrophonePermission(_ completion: @escaping (Bool) -> Void) {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            completion(true)
        case .denied:
            completion(false)
        case .undetermined:
            DispatchQueue.main.async {
                AVAudioApplication.requestRecordPermission { granted in
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
