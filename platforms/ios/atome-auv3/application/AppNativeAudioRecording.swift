import AVFoundation
import Foundation

extension AppNativeAudioController {
    func startAudioRecording(payload: [String: Any],
                             completion: @escaping ([String: Any], String?) -> Void) {
        requestMicrophonePermission { granted in
            self.queue.async {
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
                    try self.configureAudioSessionIfNeeded()
                    let sessionId = self.resolveString(payload, ["sessionId", "session_id"])
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

                    let input = self.recordingEngine.inputNode
                    let format = input.outputFormat(forBus: 0)
                    guard format.sampleRate > 0, format.channelCount > 0 else {
                        self.complete(
                            completion,
                            payload: ["success": false],
                            error: "microphone_input_format_unavailable"
                        )
                        return
                    }
                    guard format.commonFormat == .pcmFormatFloat32,
                          format.sampleRate <= Double(UInt32.max),
                          format.channelCount <= UInt32(self.recordingChannelPointers.count) else {
                        self.complete(
                            completion,
                            payload: ["success": false],
                            error: "microphone_input_format_unsupported"
                        )
                        return
                    }

                    input.removeTap(onBus: 0)
                    let sampleRate = UInt32(format.sampleRate.rounded())
                    let channels = UInt16(format.channelCount)
                    guard self.nativeRecorderBackend.start(
                        withPath: url.path,
                        sampleRate: sampleRate,
                        channels: channels,
                        source: "mic"
                    ) else {
                        let message = self.nativeRecorderBackend.lastErrorMessage.isEmpty
                            ? "Recorder start failed"
                            : self.nativeRecorderBackend.lastErrorMessage
                        throw NSError(domain: "AppNativeAudioController", code: 21, userInfo: [
                            NSLocalizedDescriptionKey: message
                        ])
                    }

                    let relativePath = SandboxPathValidator.sanitizedRelativePath(filePath)
                        .flatMap { $0.isEmpty ? nil : $0 }
                        ?? "data/users/\(userId.isEmpty ? "anonymous" : userId)/recordings/\(fileName)"
                    self.activeRecordingSessionId = sessionId
                    self.activeRecordingFileName = fileName
                    self.activeRecordingPath = relativePath
                    self.activeRecordingAbsolutePath = url.path
                    self.activeRecordingSampleRate = format.sampleRate
                    self.activeRecordingChannels = Int(format.channelCount)

                    input.installTap(
                        onBus: 0,
                        bufferSize: 1024,
                        format: format
                    ) { [weak self] buffer, _ in
                        self?.pushRecordingBuffer(buffer)
                    }
                    self.recordingEngine.prepare()
                    do {
                        try self.recordingEngine.start()
                    } catch {
                        input.removeTap(onBus: 0)
                        self.recordingEngine.stop()
                        var duration: Double = 0
                        var frameCount: UInt64 = 0
                        var overrunFrames: UInt64 = 0
                        var discontinuityFrames: UInt64 = 0
                        _ = self.nativeRecorderBackend.stop(
                            withDuration: &duration,
                            frameCount: &frameCount,
                            overrunFrames: &overrunFrames,
                            discontinuityFrames: &discontinuityFrames
                        )
                        try? FileManager.default.removeItem(at: url)
                        self.resetActiveRecordingState()
                        throw error
                    }

                    self.startRecordingScopeMonitor(sessionId: sessionId)
                    self.complete(completion, payload: [
                        "success": true,
                        "session_id": sessionId,
                        "file_name": fileName,
                        "file_path": relativePath,
                        "absolute_file_path": url.path,
                        "sample_rate": format.sampleRate,
                        "channels": Int(format.channelCount)
                    ])
                } catch {
                    self.recordingEngine.stop()
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

    func pushRecordingBuffer(_ buffer: AVAudioPCMBuffer) {
        let frames = UInt32(buffer.frameLength)
        guard frames > 0 else { return }
        let channels = Int(buffer.format.channelCount)
        guard buffer.format.commonFormat == .pcmFormatFloat32,
              channels > 0,
              channels <= recordingChannelPointers.count else {
            nativeRecorderBackend.reportDiscontinuityFrames(frames)
            return
        }

        let buffers = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
        if buffer.format.isInterleaved || buffers.count == 1 {
            guard let data = buffers[0].mData else {
                nativeRecorderBackend.reportDiscontinuityFrames(frames)
                return
            }
            nativeRecorderBackend.pushInterleavedFloat32(
                data.assumingMemoryBound(to: Float.self),
                channels: UInt16(channels),
                frames: frames
            )
            return
        }

        guard buffers.count >= channels else {
            nativeRecorderBackend.reportDiscontinuityFrames(frames)
            return
        }
        for channel in 0..<channels {
            guard let data = buffers[channel].mData else {
                nativeRecorderBackend.reportDiscontinuityFrames(frames)
                return
            }
            recordingChannelPointers[channel] = UnsafePointer(
                data.assumingMemoryBound(to: Float.self)
            )
        }
        recordingChannelPointers.withUnsafeBufferPointer { pointers in
            guard let base = pointers.baseAddress else {
                nativeRecorderBackend.reportDiscontinuityFrames(frames)
                return
            }
            nativeRecorderBackend.pushPlanarFloat32(
                base,
                channels: UInt16(channels),
                frames: frames
            )
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

        recordingEngine.inputNode.removeTap(onBus: 0)
        recordingEngine.stop()
        stopRecordingScopeMonitor()
        var duration: Double = 0
        var frameCount: UInt64 = 0
        var overrunFrames: UInt64 = 0
        var discontinuityFrames: UInt64 = 0
        let stopped = nativeRecorderBackend.stop(
            withDuration: &duration,
            frameCount: &frameCount,
            overrunFrames: &overrunFrames,
            discontinuityFrames: &discontinuityFrames
        )
        let stopError = nativeRecorderBackend.lastErrorMessage
        recordingEngine.reset()

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

        guard stopped, frameCount > 0, fileExists, fileSize > 44 else {
            if fileExists {
                try? FileManager.default.removeItem(atPath: absolutePath)
            }
            let discarded = absolutePath.isEmpty
                || !FileManager.default.fileExists(atPath: absolutePath)
            let message = stopError.isEmpty ? "audio_recording_empty_or_invalid" : stopError
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
            "waveform_peaks": waveformPeaks
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
        guard activeRecordingSessionId != nil else { return }
        recordingEngine.inputNode.removeTap(onBus: 0)
        recordingEngine.stop()
        stopRecordingScopeMonitor()
        var duration: Double = 0
        var frameCount: UInt64 = 0
        var overrunFrames: UInt64 = 0
        var discontinuityFrames: UInt64 = 0
        _ = nativeRecorderBackend.stop(
            withDuration: &duration,
            frameCount: &frameCount,
            overrunFrames: &overrunFrames,
            discontinuityFrames: &discontinuityFrames
        )
        recordingEngine.reset()
        resetActiveRecordingState()
    }

    func resetActiveRecordingState() {
        activeRecordingSessionId = nil
        activeRecordingFileName = nil
        activeRecordingPath = nil
        activeRecordingAbsolutePath = nil
        activeRecordingSampleRate = 0
        activeRecordingChannels = 0
    }
}
