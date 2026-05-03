//
//  Aatome.swift
//  application
//
//  Created by jeezs on 26/04/2022.
//

import SwiftUI
import WebKit
import AVFoundation

final class AppNativeAudioController: NSObject {
    static let shared = AppNativeAudioController()

    private struct ClipEntry {
        let id: String
        let url: URL
        let path: String
        let buffer: AVAudioPCMBuffer
        let sampleRate: Double
        let durationSeconds: Double
    }

    private final class VoiceEntry {
        let voiceId: String
        let assetId: String
        let playerNode: AVAudioPlayerNode
        let rateNode: AVAudioUnitVarispeed
        var stopWorkItem: DispatchWorkItem?

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

    private let queue = DispatchQueue(label: "atome.app.native_audio", qos: .userInitiated)
    private let engine = AVAudioEngine()
    private let recordingEngine = AVAudioEngine()
    private var clips: [String: ClipEntry] = [:]
    private var voices: [String: VoiceEntry] = [:]
    private var audioSessionReady = false
    private var activeRecordingSessionId: String?
    private var activeRecordingFileName: String?
    private var activeRecordingPath: String?
    private var activeRecordingFile: AVAudioFile?
    private var activeRecordingSampleRate: Double = 0
    private var activeRecordingChannels: Int = 0
    private var activeRecordingFrames: AVAudioFramePosition = 0

    private override init() {
        super.init()
    }

    private func complete(_ completion: @escaping ([String: Any], String?) -> Void,
                          payload: [String: Any],
                          error: String? = nil) {
        DispatchQueue.main.async {
            completion(payload, error)
        }
    }

    private func resolveClipURL(_ rawPath: String) -> URL? {
        var trimmed = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }

        if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
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

    private func resolveString(_ payload: [String: Any], _ keys: [String]) -> String {
        for key in keys {
            if let value = payload[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return ""
    }

    private func resolveDouble(_ payload: [String: Any], _ keys: [String], fallback: Double) -> Double {
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

    private func resolveOptionalDouble(_ payload: [String: Any], _ keys: [String]) -> Double? {
        let marker = Double.nan
        let value = resolveDouble(payload, keys, fallback: marker)
        return value.isNaN ? nil : value
    }

    private func clamp(_ value: Double, min minValue: Double, max maxValue: Double) -> Double {
        return Swift.min(maxValue, Swift.max(minValue, value))
    }

    private func gainToLinear(_ gain: Double) -> Float {
        return Float(clamp(gain, min: 0, max: 4))
    }

    private func decibelsToLinear(_ db: Double) -> Float {
        let linear = pow(10.0, db / 20.0)
        return Float(clamp(linear, min: 0, max: 4))
    }

    private func configureAudioSessionIfNeeded() throws {
        if audioSessionReady { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)
        audioSessionReady = true
    }

    private func configureRecordingSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
        try session.setActive(true)
        audioSessionReady = true
    }

    private func requestMicrophonePermission(_ completion: @escaping (Bool) -> Void) {
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

    private func mediaOutputURL(fileName: String,
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
            let safeUserId = userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "anonymous" : userId
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

    private func startAudioRecording(payload: [String: Any],
                                     completion: @escaping ([String: Any], String?) -> Void) {
        print("[AUDIO_NATIVE] audio_record_start request payload_keys=\(Array(payload.keys).sorted())")
        requestMicrophonePermission { granted in
            self.queue.async {
                guard granted else {
                    print("[AUDIO_NATIVE] audio_record_start denied microphone_permission_denied")
                    self.complete(completion, payload: ["success": false], error: "microphone_permission_denied")
                    return
                }
                do {
                    if self.activeRecordingSessionId != nil {
                        self.complete(completion, payload: ["success": false], error: "audio_recording_in_progress")
                        return
                    }
                    try self.configureRecordingSession()
                    let sessionId = self.resolveString(payload, ["sessionId", "session_id"])
                    let fileName = self.resolveString(payload, ["fileName", "file_name"]).isEmpty
                        ? "audio_\(Int(Date().timeIntervalSince1970)).wav"
                        : self.resolveString(payload, ["fileName", "file_name"])
                    let userId = self.resolveString(payload, ["userId", "user_id"])
                    let filePath = self.resolveString(payload, ["filePath", "file_path", "path"])
                    let url = try self.mediaOutputURL(fileName: fileName, filePath: filePath, userId: userId)
                    print("[AUDIO_NATIVE] audio_record_start resolved session=\(sessionId) file=\(fileName) user=\(userId.isEmpty ? "<none>" : userId) request_path=\(filePath.isEmpty ? "<none>" : filePath) absolute=\(url.path)")

                    let input = self.recordingEngine.inputNode
                    let inputFormat = input.outputFormat(forBus: 0)
                    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
                        self.complete(completion, payload: ["success": false], error: "microphone_input_format_unavailable")
                        return
                    }
                    input.removeTap(onBus: 0)
                    let file = try AVAudioFile(forWriting: url, settings: inputFormat.settings)
                    self.activeRecordingSessionId = sessionId
                    self.activeRecordingFileName = fileName
                    self.activeRecordingPath = SandboxPathValidator.sanitizedRelativePath(filePath).flatMap { $0.isEmpty ? nil : $0 }
                        ?? "data/users/\(userId.isEmpty ? "anonymous" : userId)/recordings/\(fileName)"
                    self.activeRecordingFile = file
                    self.activeRecordingSampleRate = inputFormat.sampleRate
                    self.activeRecordingChannels = Int(inputFormat.channelCount)
                    self.activeRecordingFrames = 0

                    input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
                        guard let self else { return }
                        do {
                            try self.activeRecordingFile?.write(from: buffer)
                            self.activeRecordingFrames += AVAudioFramePosition(buffer.frameLength)
                        } catch {
                            print("[AUDIO_NATIVE] audio_record_start tap write failed: \(error.localizedDescription)")
                        }
                    }
                    self.recordingEngine.prepare()
                    try self.recordingEngine.start()
                    print("[AUDIO_NATIVE] audio_record_start OK session=\(sessionId) path=\(url.path)")
                    self.complete(completion, payload: [
                        "success": true,
                        "session_id": sessionId,
                        "file_name": fileName,
                        "file_path": self.activeRecordingPath ?? "",
                        "absolute_file_path": url.path,
                        "sample_rate": self.activeRecordingSampleRate,
                        "channels": self.activeRecordingChannels
                    ])
                } catch {
                    print("[AUDIO_NATIVE] audio_record_start ERROR \(error.localizedDescription)")
                    self.activeRecordingSessionId = nil
                    self.activeRecordingFileName = nil
                    self.activeRecordingPath = nil
                    self.activeRecordingFile = nil
                    self.recordingEngine.stop()
                    self.complete(completion, payload: ["success": false], error: error.localizedDescription)
                }
            }
        }
    }

    private func stopAudioRecording(payload: [String: Any],
                                    completion: @escaping ([String: Any], String?) -> Void) {
        let requestedSessionId = resolveString(payload, ["sessionId", "session_id"])
        guard let sessionId = activeRecordingSessionId else {
            complete(completion, payload: ["success": false], error: "no_active_audio_recording")
            return
        }
        if !requestedSessionId.isEmpty && requestedSessionId != sessionId {
            complete(completion, payload: ["success": false], error: "audio_recording_session_mismatch")
            return
        }
        let input = recordingEngine.inputNode
        input.removeTap(onBus: 0)
        recordingEngine.stop()
        activeRecordingFile = nil
        let duration = activeRecordingSampleRate > 0 ? Double(activeRecordingFrames) / activeRecordingSampleRate : 0
        let path = activeRecordingPath ?? ""
        let fileName = activeRecordingFileName ?? ""
        let absolutePath = SandboxPathValidator.candidateURLs(for: path).first(where: { FileManager.default.fileExists(atPath: $0.path) })?.path ?? ""
        let fileSize = absolutePath.isEmpty
            ? -1
            : (((try? FileManager.default.attributesOfItem(atPath: absolutePath))?[.size] as? NSNumber)?.int64Value ?? -1)
        let sampleRate = activeRecordingSampleRate
        let channels = activeRecordingChannels
        let frames = activeRecordingFrames
        activeRecordingSessionId = nil
        activeRecordingFileName = nil
        activeRecordingPath = nil
        activeRecordingSampleRate = 0
        activeRecordingChannels = 0
        activeRecordingFrames = 0
        print("[AUDIO_NATIVE] audio_record_stop OK session=\(sessionId) file=\(fileName) path=\(path) absolute=\(absolutePath.isEmpty ? "<unknown>" : absolutePath) bytes=\(fileSize) duration=\(duration) frames=\(frames)")
        complete(completion, payload: [
            "success": true,
            "session_id": sessionId,
            "file_name": fileName,
            "file_path": path,
            "duration_sec": duration,
            "frame_count": Int(frames),
            "sample_rate": sampleRate,
            "channels": channels,
            "absolute_file_path": absolutePath,
            "size_bytes": fileSize
        ])
    }

    private func ensureAudioEngineRunning(playbackFormat: AVAudioFormat? = nil) throws {
        if engine.isRunning { return }
        let mixerNode = engine.mainMixerNode
        let outputNode = engine.outputNode
        let outputFormat = outputNode.inputFormat(forBus: 0)
        let preferredFormat = playbackFormat ?? mixerNode.outputFormat(forBus: 0)
        let connectionFormat = outputFormat.sampleRate > 0
            ? outputFormat
            : preferredFormat
        engine.connect(mixerNode, to: outputNode, format: connectionFormat)
        engine.prepare()
        try engine.start()
    }

    private func preferredDecodeSampleRate() -> Double {
        let sessionRate = AVAudioSession.sharedInstance().sampleRate
        return sessionRate > 0 ? sessionRate : 44_100
    }

    private func copySampleBufferFloats(_ sampleBuffer: CMSampleBuffer) -> [Float] {
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return [] }
        let byteCount = CMBlockBufferGetDataLength(blockBuffer)
        guard byteCount > 0 else { return [] }
        var data = Data(count: byteCount)
        data.withUnsafeMutableBytes { ptr in
            guard let baseAddress = ptr.baseAddress else { return }
            _ = CMBlockBufferCopyDataBytes(
                blockBuffer,
                atOffset: 0,
                dataLength: byteCount,
                destination: baseAddress
            )
        }
        return data.withUnsafeBytes { rawBuffer in
            Array(rawBuffer.bindMemory(to: Float.self))
        }
    }

    private func buildPCMBuffer(sampleRate: Double,
                                channelCount: AVAudioChannelCount,
                                left: [Float],
                                right: [Float]) throws -> AVAudioPCMBuffer {
        guard let format = AVAudioFormat(
            standardFormatWithSampleRate: sampleRate,
            channels: channelCount
        ) else {
            throw NSError(domain: "AppNativeAudioController", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Unable to create native PCM format"
            ])
        }
        let frameCount = min(left.count, right.count)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(frameCount)
              ),
              let channels = buffer.floatChannelData else {
            throw NSError(domain: "AppNativeAudioController", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Unable to allocate native PCM buffer"
            ])
        }
        buffer.frameLength = AVAudioFrameCount(frameCount)
        left.withUnsafeBufferPointer { source in
            channels[0].update(from: source.baseAddress!, count: frameCount)
        }
        if channelCount > 1 {
            right.withUnsafeBufferPointer { source in
                channels[1].update(from: source.baseAddress!, count: frameCount)
            }
        }
        return buffer
    }

    private func decodeClipBuffer(_ url: URL) throws -> (AVAudioPCMBuffer, Double, Double) {
        let asset = AVURLAsset(url: url)
        guard let track = asset.tracks(withMediaType: .audio).first else {
            throw NSError(domain: "AppNativeAudioController", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "No audio track found in \(url.lastPathComponent)"
            ])
        }
        let sampleRate = preferredDecodeSampleRate()
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 2
        ])
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else {
            throw NSError(domain: "AppNativeAudioController", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Unable to add AVAssetReader output for \(url.lastPathComponent)"
            ])
        }
        reader.add(output)
        guard reader.startReading() else {
            throw reader.error ?? NSError(domain: "AppNativeAudioController", code: 5, userInfo: [
                NSLocalizedDescriptionKey: "Unable to start AVAssetReader for \(url.lastPathComponent)"
            ])
        }

        var left: [Float] = []
        var right: [Float] = []
        while reader.status == .reading {
            guard let sampleBuffer = output.copyNextSampleBuffer() else { break }
            let floats = copySampleBufferFloats(sampleBuffer)
            CMSampleBufferInvalidate(sampleBuffer)
            guard !floats.isEmpty else { continue }
            let frameCount = floats.count / 2
            left.reserveCapacity(left.count + frameCount)
            right.reserveCapacity(right.count + frameCount)
            for frameIndex in 0..<frameCount {
                let baseIndex = frameIndex * 2
                left.append(floats[baseIndex])
                right.append(floats[baseIndex + 1])
            }
        }

        if reader.status == .failed {
            throw reader.error ?? NSError(domain: "AppNativeAudioController", code: 6, userInfo: [
                NSLocalizedDescriptionKey: "Audio decode failed for \(url.lastPathComponent)"
            ])
        }

        let buffer = try buildPCMBuffer(sampleRate: sampleRate, channelCount: 2, left: left, right: right)
        let durationSeconds = sampleRate > 0 ? (Double(buffer.frameLength) / sampleRate) : 0
        return (buffer, sampleRate, durationSeconds)
    }

    private func makeSliceBuffer(from clip: ClipEntry,
                                 startSeconds: Double,
                                 durationSeconds: Double?) throws -> AVAudioPCMBuffer {
        let totalFrames = Int(clip.buffer.frameLength)
        guard totalFrames > 0,
              let channels = clip.buffer.floatChannelData else {
            throw NSError(domain: "AppNativeAudioController", code: 7, userInfo: [
                NSLocalizedDescriptionKey: "Decoded clip buffer is empty for \(clip.id)"
            ])
        }
        let sampleRate = max(1, clip.sampleRate)
        let clampedStart = clamp(startSeconds, min: 0, max: clip.durationSeconds)
        let startFrame = min(
            max(0, Int((clampedStart * sampleRate).rounded(.down))),
            max(0, totalFrames - 1)
        )
        let requestedEndSeconds = durationSeconds.map { clampedStart + max(0.001, $0) } ?? clip.durationSeconds
        let endFrame = min(
            totalFrames,
            max(startFrame + 1, Int((requestedEndSeconds * sampleRate).rounded(.up)))
        )
        let frameCount = max(1, endFrame - startFrame)
        guard let slice = AVAudioPCMBuffer(
            pcmFormat: clip.buffer.format,
            frameCapacity: AVAudioFrameCount(frameCount)
        ),
              let targetChannels = slice.floatChannelData else {
            throw NSError(domain: "AppNativeAudioController", code: 8, userInfo: [
                NSLocalizedDescriptionKey: "Unable to allocate slice buffer for \(clip.id)"
            ])
        }
        slice.frameLength = AVAudioFrameCount(frameCount)
        for channelIndex in 0..<Int(clip.buffer.format.channelCount) {
            targetChannels[channelIndex].update(
                from: channels[channelIndex].advanced(by: startFrame),
                count: frameCount
            )
        }
        return slice
    }

    private func detachVoiceNodes(_ voice: VoiceEntry) {
        engine.disconnectNodeInput(voice.rateNode)
        engine.disconnectNodeInput(voice.playerNode)
        engine.detach(voice.playerNode)
        engine.detach(voice.rateNode)
    }

    private func stopVoiceLocked(_ voiceId: String) {
        guard let voice = voices.removeValue(forKey: voiceId) else { return }
        voice.stopWorkItem?.cancel()
        voice.playerNode.stop()
        detachVoiceNodes(voice)
    }

    private func stopVoicesForAssetLocked(_ assetId: String) {
        let voiceIds = voices.values
            .filter { $0.assetId == assetId }
            .map(\.voiceId)
        voiceIds.forEach(stopVoiceLocked)
    }

    private func scheduleLoopingBuffers(voiceId: String,
                                        clip: ClipEntry,
                                        voice: VoiceEntry,
                                        startSeconds: Double,
                                        loopStartSeconds: Double,
                                        loopEndSeconds: Double) throws {
        let normalizedLoopStart = clamp(loopStartSeconds, min: 0, max: clip.durationSeconds)
        let normalizedLoopEnd = clamp(loopEndSeconds, min: normalizedLoopStart + 0.001, max: clip.durationSeconds)
        let normalizedStart = clamp(startSeconds, min: normalizedLoopStart, max: normalizedLoopEnd - 0.001)
        let loopBuffer = try makeSliceBuffer(
            from: clip,
            startSeconds: normalizedLoopStart,
            durationSeconds: normalizedLoopEnd - normalizedLoopStart
        )
        if normalizedStart > normalizedLoopStart {
            let introBuffer = try makeSliceBuffer(
                from: clip,
                startSeconds: normalizedStart,
                durationSeconds: normalizedLoopEnd - normalizedStart
            )
            voice.playerNode.scheduleBuffer(introBuffer, at: nil, options: []) { [weak self] in
                self?.queue.async {
                    guard let self, self.voices[voiceId] != nil else { return }
                    voice.playerNode.scheduleBuffer(loopBuffer, at: nil, options: [.loops], completionHandler: nil)
                }
            }
        } else {
            voice.playerNode.scheduleBuffer(loopBuffer, at: nil, options: [.loops], completionHandler: nil)
        }
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        queue.async {
            let normalizedCommand = command.trimmingCharacters(in: .whitespacesAndNewlines)
            do {
                switch normalizedCommand {
                case "audio_init":
                    try self.configureAudioSessionIfNeeded()
                    self.complete(completion, payload: ["success": true])

                case "audio_record_start":
                    self.startAudioRecording(payload: payload, completion: completion)

                case "audio_record_stop":
                    self.stopAudioRecording(payload: payload, completion: completion)

                case "audio_load_clip":
                    try self.configureAudioSessionIfNeeded()
                    let id = self.resolveString(payload, ["id"])
                    let rawPath = self.resolveString(payload, ["path"])
                    guard !id.isEmpty else {
                        print("[AUDIO_NATIVE] audio_load_clip ERROR missing_id path=\(rawPath)")
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    guard let url = self.resolveClipURL(rawPath) else {
                        print("[AUDIO_NATIVE] audio_load_clip ERROR path_not_found id=\(id) input=\(rawPath)")
                        self.complete(completion, payload: ["success": false, "id": id], error: "Audio clip path does not exist: \(rawPath)")
                        return
                    }
                    let (buffer, sampleRate, durationSeconds) = try self.decodeClipBuffer(url)
                    self.clips[id] = ClipEntry(
                        id: id,
                        url: url,
                        path: url.path,
                        buffer: buffer,
                        sampleRate: sampleRate,
                        durationSeconds: durationSeconds
                    )
                    print("[AUDIO_NATIVE] audio_load_clip OK id=\(id) input=\(rawPath) path=\(url.path) sample_rate=\(sampleRate) duration=\(durationSeconds)")
                    self.complete(completion, payload: [
                        "success": true,
                        "id": id,
                        "path": url.path,
                        "input_path": rawPath,
                        "input_path_was_absolute": rawPath.hasPrefix("/"),
                        "sample_rate": sampleRate,
                        "duration_seconds": durationSeconds
                    ])

                case "audio_play":
                    let id = self.resolveString(payload, ["id"])
                    guard !id.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    self.handle(command: "audio_play_instance", payload: [
                        "assetId": id,
                        "voiceId": id,
                        "startSeconds": 0,
                        "durationSeconds": NSNull(),
                        "gain": 1,
                        "rate": 1
                    ], completion: completion)

                case "audio_play_instance":
                    try self.configureAudioSessionIfNeeded()
                    let assetId = self.resolveString(payload, ["assetId", "asset_id"])
                    let voiceId = self.resolveString(payload, ["voiceId", "voice_id"])
                    guard !assetId.isEmpty, !voiceId.isEmpty else {
                        print("[AUDIO_NATIVE] audio_play_instance ERROR missing_ids asset=\(assetId) voice=\(voiceId)")
                        self.complete(completion, payload: ["success": false], error: "Missing asset or voice id")
                        return
                    }
                    guard let clip = self.clips[assetId] else {
                        print("[AUDIO_NATIVE] audio_play_instance ERROR clip_not_found asset=\(assetId) voice=\(voiceId)")
                        self.complete(completion, payload: ["success": false, "asset_id": assetId, "voice_id": voiceId], error: "Clip '\(assetId)' not found")
                        return
                    }
                    self.stopVoiceLocked(voiceId)
                    let startSeconds = self.clamp(
                        self.resolveDouble(payload, ["startSeconds", "start_seconds"], fallback: 0),
                        min: 0,
                        max: clip.durationSeconds
                    )
                    let rate = Float(self.clamp(self.resolveDouble(payload, ["rate"], fallback: 1), min: 0.25, max: 4))
                    let gain = self.gainToLinear(self.resolveDouble(payload, ["gain"], fallback: 1))
                    let durationSeconds = self.resolveOptionalDouble(payload, ["durationSeconds", "duration_seconds"])
                    let loopStart = self.resolveOptionalDouble(payload, ["loopStartSeconds", "loop_start_seconds"])
                    let loopEnd = self.resolveOptionalDouble(payload, ["loopEndSeconds", "loop_end_seconds"])
                    let playerNode = AVAudioPlayerNode()
                    let rateNode = AVAudioUnitVarispeed()
                    rateNode.rate = rate
                    playerNode.volume = gain
                    self.engine.attach(playerNode)
                    self.engine.attach(rateNode)
                    self.engine.connect(playerNode, to: rateNode, format: clip.buffer.format)
                    self.engine.connect(rateNode, to: self.engine.mainMixerNode, format: clip.buffer.format)
                    try self.ensureAudioEngineRunning(playbackFormat: clip.buffer.format)
                    let voice = VoiceEntry(
                        voiceId: voiceId,
                        assetId: assetId,
                        playerNode: playerNode,
                        rateNode: rateNode
                    )
                    if durationSeconds == nil,
                       let loopStart,
                       let loopEnd,
                       loopEnd > loopStart {
                        try self.scheduleLoopingBuffers(
                            voiceId: voiceId,
                            clip: clip,
                            voice: voice,
                            startSeconds: startSeconds,
                            loopStartSeconds: loopStart,
                            loopEndSeconds: loopEnd
                        )
                    } else {
                        let playBuffer = try self.makeSliceBuffer(
                            from: clip,
                            startSeconds: startSeconds,
                            durationSeconds: durationSeconds
                        )
                        playerNode.scheduleBuffer(playBuffer, at: nil, options: []) { [weak self] in
                            self?.queue.async {
                                self?.stopVoiceLocked(voiceId)
                            }
                        }
                    }
                    self.voices[voiceId] = voice
                    playerNode.play()
                    print("[AUDIO_NATIVE] audio_play_instance OK asset=\(assetId) voice=\(voiceId) start=\(startSeconds) duration=\(durationSeconds ?? -1) rate=\(rate) gain=\(gain)")

                    if let durationSeconds = self.resolveOptionalDouble(payload, ["durationSeconds", "duration_seconds"]),
                       durationSeconds > 0 {
                        let safeRate = max(0.0001, Double(rate))
                        let stopDelay = max(0.03, durationSeconds / safeRate)
                        let stopWork = DispatchWorkItem { [weak self] in
                            self?.queue.async {
                                self?.stopVoiceLocked(voiceId)
                            }
                        }
                        voice.stopWorkItem = stopWork
                        self.queue.asyncAfter(deadline: .now() + stopDelay + 0.02, execute: stopWork)
                    }
                    self.complete(completion, payload: [
                        "success": true,
                        "asset_id": assetId,
                        "voice_id": voiceId
                    ])

                case "audio_stop_instance":
                    let voiceId = self.resolveString(payload, ["voiceId", "voice_id"])
                    guard !voiceId.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing voice id")
                        return
                    }
                    self.stopVoiceLocked(voiceId)
                    self.complete(completion, payload: ["success": true, "voice_id": voiceId])

                case "audio_stop":
                    let id = self.resolveString(payload, ["id"])
                    guard !id.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    if self.voices[id] != nil {
                        self.stopVoiceLocked(id)
                    } else {
                        self.stopVoicesForAssetLocked(id)
                    }
                    self.complete(completion, payload: ["success": true, "id": id])

                case "audio_destroy_clip":
                    let id = self.resolveString(payload, ["id"])
                    guard !id.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    self.stopVoicesForAssetLocked(id)
                    self.clips.removeValue(forKey: id)
                    self.complete(completion, payload: ["success": true, "id": id])

                case "audio_set_volume":
                    let id = self.resolveString(payload, ["id"])
                    let db = self.resolveDouble(payload, ["db"], fallback: 0)
                    if let voice = self.voices[id] {
                        voice.playerNode.volume = self.decibelsToLinear(db)
                        self.complete(completion, payload: ["success": true, "id": id])
                    } else {
                        self.complete(completion, payload: ["success": false, "id": id], error: "Voice '\(id)' not found")
                    }

                case "audio_set_playback_rate":
                    let id = self.resolveString(payload, ["id"])
                    let rate = Float(self.clamp(self.resolveDouble(payload, ["rate"], fallback: 1), min: 0.25, max: 4))
                    if let voice = self.voices[id] {
                        voice.rateNode.rate = rate
                        self.complete(completion, payload: ["success": true, "id": id])
                    } else {
                        self.complete(completion, payload: ["success": false, "id": id], error: "Voice '\(id)' not found")
                    }

                case "audio_shutdown":
                    Array(self.voices.keys).forEach(self.stopVoiceLocked)
                    self.clips.removeAll()
                    self.engine.stop()
                    self.engine.reset()
                    self.complete(completion, payload: ["success": true])

                case "audio_load_clip_from_bytes":
                    self.complete(completion, payload: ["success": false], error: "audio_load_clip_from_bytes is unsupported in ios_app native playback")

                default:
                    self.complete(completion, payload: ["success": false], error: "Unsupported native audio command: \(normalizedCommand)")
                }
            } catch {
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
            }
        }
    }
}

final class FullscreenWebViewController: UIViewController {
    private(set) var webView: WKWebView!

    // Build the entire hierarchy as early as possible to avoid any interim white frame
    override func loadView() {
        // Root view explicit black
        let root = UIView(frame: UIScreen.main.bounds)
        root.backgroundColor = .black
        root.isOpaque = true
        self.view = root

        // Configure WKWebView with earliest possible black styling
        let config = WKWebViewConfiguration()
        let ucc = config.userContentController
        config.allowsInlineMediaPlayback = true
        if #available(iOS 10.0, *) {
            config.mediaTypesRequiringUserActionForPlayback = [.audio]
        }
        // Ultra-early user script painting html/body black BEFORE any content
        let paintBlack = "(function(){try{var d=document; if(d.documentElement){d.documentElement.style.background='#000';d.documentElement.style.color='#ccc';} if(d.body){d.body.style.background='#000';d.body.style.color='#ccc';}}catch(e){}})();"
        let preScript = WKUserScript(source: paintBlack, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        ucc.addUserScript(preScript)
        // Avoid background flashes (private-ish key, safe usage)
        config.setValue(false, forKey: "drawsBackground")
        webView = WKWebView(frame: root.bounds, configuration: config)
        webView.isOpaque = false
        if #available(iOS 15.0, *) { webView.underPageBackgroundColor = .clear }
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(webView)
        let guide = root.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: guide.trailingAnchor)
        ])

        // Immediate placeholder (matches one added later in WebViewManager but ensures something black exists NOW)
                // Inline SVG logo (atome.svg simplified) to avoid needing asset load; tiny size impact acceptable
                let svgLogo = """
                <svg id=atome width=160 height=160 viewBox='0 0 237 237' xmlns='http://www.w3.org/2000/svg'>
                    <g transform='matrix(0.0267056 0 0 0.0267056 18.6376 20.2376)'>
                        <g transform='matrix(4.16667 0 0 4.16667 -377.307 105.632)'>
                            <path d='M629.175,81.832C740.508,190.188 742.921,368.28 634.565,479.613C526.209,590.945 348.116,593.358 236.784,485.002C125.451,376.646 123.038,198.554 231.394,87.221C339.75,-24.111 517.843,-26.524 629.175,81.832Z' fill='#C90C7D'/>
                        </g>
                        <g transform='matrix(4.16667 0 0 4.16667 -377.307 105.632)'>
                            <path d='M1679.33,410.731C1503.98,413.882 1402.52,565.418 1402.72,691.803C1402.91,818.107 1486.13,846.234 1498.35,1056.78C1501.76,1313.32 1173.12,1490.47 987.025,1492.89C257.861,1502.39 73.275,904.061 71.639,735.381C70.841,653.675 1.164,647.648 2.788,737.449C12.787,1291.4 456.109,1712.79 989.247,1706.24C1570.67,1699.09 1982.31,1234 1965.76,683.236C1961.3,534.95 1835.31,407.931 1679.33,410.731Z' fill='#C90C7D'/>
                        </g>
                    </g>
                </svg>
                """.replacingOccurrences(of: "\n", with: "")
                let placeholder = "<!doctype html><html style='background:#000;height:100%'><head><meta name=viewport content='initial-scale=1,viewport-fit=cover'><style>body{margin:0;display:flex;align-items:center;justify-content:center;background:#000;} .fade-in{opacity:0;animation:f .6s ease-out forwards .05s}@keyframes f{to{opacity:1}}</style></head><body>" + svgLogo + "</body></html>"
        webView.loadHTMLString(placeholder, baseURL: nil)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        WebViewManager.setNativeInvokeHandler { command, payload, completion in
            if AppNativeMediaCaptureController.canHandle(command: command) {
                AppNativeMediaCaptureController.shared.handle(command: command, payload: payload, completion: completion)
            } else {
                AppNativeAudioController.shared.handle(command: command, payload: payload, completion: completion)
            }
        }
    AppNativeMediaCaptureController.shared.attachPreviewHost(webView: webView)
    view.insetsLayoutMarginsFromSafeArea = true
    webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.contentInset = .zero
        webView.scrollView.verticalScrollIndicatorInsets = .zero
        webView.scrollView.horizontalScrollIndicatorInsets = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        // Delay setup to next runloop so placeholder paint is committed first
        DispatchQueue.main.async { WebViewManager.setupWebView(for: self.webView) }
        injectFullscreenFixJS()
    }
    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom, .left, .right, .top] }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
    }

    private func injectFullscreenFixJS() {
        let js = """
        (function(){
          try {
            var de = document.documentElement, b = document.body;
            if (de){ de.style.margin='0'; de.style.padding='0'; de.style.width='100%'; de.style.height='100%'; }
            if (b){ b.style.margin='0'; b.style.padding='0'; b.style.width='100%'; b.style.height='100%'; b.style.overflow='hidden'; }
            // Force resize observer to adapt JS layout libraries if they cached size
            window.dispatchEvent(new Event('resize'));
          } catch(e) { console.log('fullscreen fix error', e); }
        })();
        """
        WebViewManager.evaluateJS(js, label: "fullscreenFix", targetWebView: self.webView)
    }
}

struct WebViewContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> FullscreenWebViewController { FullscreenWebViewController() }
    func updateUIViewController(_ controller: FullscreenWebViewController, context: Context) {}
}
