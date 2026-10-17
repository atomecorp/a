import AVFoundation
import Foundation

extension AppNativeAudioController {
    /// Consumer identifier for the recording that is about to start.
    func makeRecordingAudioSessionConsumerId() -> String {
        audioRecordingConsumerSequence &+= 1
        return "record:\(audioRecordingConsumerSequence)"
    }

    func startAudioRecording(payload: [String: Any],
                             completion: @escaping ([String: Any], String?) -> Void) {
        let requestedSessionId = resolveString(payload, ["sessionId", "session_id"])
        let prefersBluetoothMicrophone = resolveString(payload, ["preferredInput", "preferred_input"])
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() == "bluetooth"
        stopWakeCapture()
        let startToken = captureGate.begin()
        requestMicrophonePermission { granted in
            self.queue.async {
                guard self.captureGate.accepts(startToken) else {
                    // A cancellation (shutdown, newer request) landed while the
                    // permission controller was pending: the microphone must
                    // not be reactivated by the late answer.
                    AppNativeAudioDiagnostics.log(
                        "record_start cancelled_while_pending token=\(startToken)"
                    )
                    self.complete(
                        completion,
                        payload: ["success": false],
                        error: "audio_recording_start_cancelled"
                    )
                    return
                }
                guard granted else {
                    self.complete(
                        completion,
                        payload: ["success": false],
                        error: "microphone_permission_denied"
                    )
                    return
                }
                do {
                    guard self.activeRecordingSessionId == nil else {
                        self.complete(
                            completion,
                            payload: ["success": false],
                            error: "audio_recording_in_progress"
                        )
                        return
                    }
                    let sessionId = requestedSessionId
                    let consumerId = self.makeRecordingAudioSessionConsumerId()
                    // The microphone is acquired only here, and only for the
                    // time this recording needs it.
                    try self.acquireAudioSessionConsumer(
                        consumerId,
                        kind: .musicCapture,
                        prefersBluetoothMicrophone: prefersBluetoothMicrophone
                    )
                    var recordingStarted = false
                    defer {
                        if !recordingStarted {
                            self.releaseAudioSessionConsumer(consumerId)
                        }
                    }
                    let requestedFileName = self.resolveString(payload, ["fileName", "file_name"])
                    let fileName = requestedFileName.isEmpty
                        ? "audio_\(Int(Date().timeIntervalSince1970)).wav"
                        : requestedFileName
                    let userId = self.resolveString(payload, ["userId", "user_id"])
                    let filePath = self.resolveString(payload, ["filePath", "file_path", "path"])
                    let url = try self.mediaOutputURL(
                        fileName: fileName,
                        filePath: filePath,
                        userId: userId
                    )

                    // The native Kira engine records (atome-audio-engine): its capture
                    // clock places a take on the frame the playback was heard on.
                    let (started, startError) = NativeKiraEngine.run("audio_record_start", [
                        "sessionId": sessionId, "filePath": url.path, "sampleRate": 0, "channels": 0
                    ])
                    if let startError {
                        throw NSError(domain: "AppNativeAudioController", code: 21, userInfo: [NSLocalizedDescriptionKey: startError])
                    }
                    let sampleRate = (started["sample_rate"] as? NSNumber)?.doubleValue ?? 0
                    let channels = (started["channels"] as? NSNumber)?.intValue ?? 0
                    let relativePath = SandboxPathValidator.sanitizedRelativePath(filePath)
                        .flatMap { $0.isEmpty ? nil : $0 }
                        ?? "data/users/\(userId.isEmpty ? "anonymous" : userId)/recordings/\(fileName)"
                    self.activeRecordingSessionId = sessionId
                    self.activeRecordingFileName = fileName
                    self.activeRecordingPath = relativePath
                    self.activeRecordingAbsolutePath = url.path
                    self.activeRecordingSampleRate = sampleRate
                    self.activeRecordingChannels = channels
                    self.activeRecordingConsumerId = consumerId

                    self.startRecordingScopeMonitor(sessionId: sessionId)
                    recordingStarted = true
                    self.complete(completion, payload: [
                        "success": true,
                        "session_id": sessionId,
                        "file_name": fileName,
                        "file_path": relativePath,
                        "absolute_file_path": url.path,
                        "sample_rate": sampleRate,
                        "channels": channels
                    ])
                } catch {
                    self.resetActiveRecordingState()
                    self.complete(
                        completion,
                        payload: ["success": false],
                        error: error.localizedDescription
                    )
                }
            }
        }
    }

    func stopAudioRecording(payload: [String: Any],
                            completion: @escaping ([String: Any], String?) -> Void) {
        let requestedSessionId = resolveString(payload, ["sessionId", "session_id"])
        guard let sessionId = activeRecordingSessionId else {
            complete(
                completion,
                payload: ["success": false],
                error: "no_active_audio_recording"
            )
            return
        }
        if !requestedSessionId.isEmpty && requestedSessionId != sessionId {
            complete(
                completion,
                payload: ["success": false],
                error: "audio_recording_session_mismatch"
            )
            return
        }

        let fileName = activeRecordingFileName ?? ""
        let path = activeRecordingPath ?? ""
        let absolutePath = activeRecordingAbsolutePath ?? ""
        let sampleRate = activeRecordingSampleRate
        let channels = activeRecordingChannels

        stopRecordingScopeMonitor()
        let (stopped, stopError) = NativeKiraEngine.run("audio_record_stop", ["sessionId": sessionId])
        let duration = (stopped["duration_sec"] as? NSNumber)?.doubleValue ?? 0
        let frameCount = (stopped["frame_count"] as? NSNumber)?.uint64Value ?? 0
        let overrunFrames = (stopped["overrun_frames"] as? NSNumber)?.uint64Value ?? 0
        let discontinuityFrames: UInt64 = 0

        let fileExists = !absolutePath.isEmpty
            && FileManager.default.fileExists(atPath: absolutePath)
        let fileSize = fileExists
            ? (((try? FileManager.default.attributesOfItem(atPath: absolutePath))?[.size]
                as? NSNumber)?.int64Value ?? -1)
            : -1
        // The recorder owns the real-time microphone path.  Waveform analysis is
        // deliberately performed only after it has closed the WAV file, so it
        // cannot allocate, read disk, or otherwise burden the input tap.
        let waveformPeaks = fileExists
            ? (try? waveformPeaks(for: URL(fileURLWithPath: absolutePath))) ?? []
            : []
        resetActiveRecordingState()

        guard stopError == nil, frameCount > 0, fileExists, fileSize > 44 else {
            if fileExists {
                try? FileManager.default.removeItem(atPath: absolutePath)
            }
            let discarded = absolutePath.isEmpty
                || !FileManager.default.fileExists(atPath: absolutePath)
            let message = stopError ?? "audio_recording_empty_or_invalid"
            complete(completion, payload: [
                "success": false,
                "session_id": sessionId,
                "file_name": fileName,
                "file_path": path,
                "absolute_file_path": absolutePath,
                "size_bytes": fileSize,
                "frame_count": frameCount,
                "overrun_frames": overrunFrames,
                "discontinuity_frames": discontinuityFrames,
                "discarded": discarded
            ], error: message)
            return
        }

        complete(completion, payload: [
            "success": true,
            "session_id": sessionId,
            "file_name": fileName,
            "file_path": path,
            "duration_sec": duration,
            "frame_count": frameCount,
            "sample_rate": sampleRate,
            "channels": channels,
            "overrun_frames": overrunFrames,
            "discontinuity_frames": discontinuityFrames,
            "absolute_file_path": absolutePath,
            "size_bytes": fileSize,
            "peaks": waveformPeaks,
            "waveform_peaks": waveformPeaks,
            "capture_clock": stopped["capture_clock"] ?? NSNull()
        ])
    }

    func waveformPeaks(for url: URL, maximumPeakCount: Int = 256) throws -> [Double] {
        guard maximumPeakCount > 0 else { return [] }
        let audioFile = try AVAudioFile(
            forReading: url,
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )
        let totalFrames = Int64(audioFile.length)
        let channelCount = Int(audioFile.processingFormat.channelCount)
        guard totalFrames > 0, channelCount > 0 else { return [] }

        let peakCount = min(maximumPeakCount, Int(totalFrames))
        guard peakCount > 0 else { return [] }
        var peaks = [Double](repeating: 0, count: peakCount)
        let bufferCapacity: AVAudioFrameCount = 4096
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: audioFile.processingFormat,
            frameCapacity: bufferCapacity
        ) else { return [] }

        var processedFrames: Int64 = 0
        while processedFrames < totalFrames {
            buffer.frameLength = 0
            let remainingFrames = totalFrames - processedFrames
            try audioFile.read(
                into: buffer,
                frameCount: AVAudioFrameCount(min(Int64(bufferCapacity), remainingFrames))
            )
            let readFrames = Int64(buffer.frameLength)
            guard readFrames > 0, let channelData = buffer.floatChannelData else { break }
            for frame in 0..<Int(readFrames) {
                let absoluteFrame = processedFrames + Int64(frame)
                let peakIndex = min(
                    peakCount - 1,
                    Int((absoluteFrame * Int64(peakCount)) / totalFrames)
                )
                for channel in 0..<channelCount {
                    let amplitude = min(1, abs(Double(channelData[channel][frame])))
                    peaks[peakIndex] = max(peaks[peakIndex], amplitude)
                }
            }
            processedFrames += readFrames
        }
        return peaks
    }

    func shutdownAudioRecording() {
        captureGate.cancel()
        guard activeRecordingSessionId != nil else { return }
        stopRecordingScopeMonitor()
        if let sessionId = activeRecordingSessionId {
            _ = NativeKiraEngine.run("audio_record_stop", ["sessionId": sessionId])
        }
        resetActiveRecordingState()
    }

    func resetActiveRecordingState() {
        if let consumerId = activeRecordingConsumerId {
            activeRecordingConsumerId = nil
            releaseAudioSessionConsumer(consumerId)
        }
        activeRecordingSessionId = nil
        activeRecordingFileName = nil
        activeRecordingPath = nil
        activeRecordingAbsolutePath = nil
        activeRecordingSampleRate = 0
        activeRecordingChannels = 0
    }
}
