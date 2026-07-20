//
//  AUv3RecorderAnalysis.swift
//  auv3
//

import AVFoundation
import Foundation
import os.lock

extension auv3Utils {
    func resetExactRecordingTiming(pendingStartEvent: Bool) {
        recordingRenderFailureLatched = false
        os_unfair_lock_lock(&recordingTimingLock)
        audioDebugRecordingStartFrame = nil
        recordingTimelineOriginFrame = nil
        recordingExpectedRenderFrame = nil
        recordingExpectedTimelineFrame = nil
        recordingPlaybackObservedFrame = nil
        os_unfair_lock_unlock(&recordingTimingLock)
        os_unfair_lock_lock(&recordingEventLock)
        recordingStartedEventPending = pendingStartEvent
        recordingClockFailurePending = false
        recordingEventTimelineFrame = nil
        recordingEventRecordingFrame = nil
        recordingEventPlaybackFrame = nil
        recordingEventPlaybackObservedFrame = nil
        os_unfair_lock_unlock(&recordingEventLock)
    }

    func readExactRecordingTimelineOrigin() -> Int64? {
        os_unfair_lock_lock(&recordingTimingLock)
        let frame = recordingTimelineOriginFrame
        os_unfair_lock_unlock(&recordingTimingLock)
        return frame
    }

    func latchExactRecordingQuantum(
        timestamp: UnsafePointer<AudioTimeStamp>,
        frameCount: AUAudioFrameCount,
        playbackQuantum: ExactPlaybackQuantum
    ) -> (timeline: Int64, recording: Int64, playback: Int64, observed: Int64)? {
        guard timestamp.pointee.mFlags.contains(.sampleTimeValid),
              let renderFrame = exactSafeFrame(timestamp.pointee.mSampleTime),
              renderFrame == playbackQuantum.renderFrame,
              frameCount > 0 else { return nil }
        let count = Int64(frameCount)
        guard renderFrame <= Int64.max - count,
              playbackQuantum.timelineFrame <= Int64.max - count,
              os_unfair_lock_trylock(&recordingTimingLock) else { return nil }
        let timelineFrame = playbackQuantum.timelineFrame
        guard timelineFrame <= Int64.max - count else {
            os_unfair_lock_unlock(&recordingTimingLock)
            return nil
        }
        if let expected = recordingExpectedRenderFrame, expected != renderFrame {
            os_unfair_lock_unlock(&recordingTimingLock)
            return nil
        }
        if let expected = recordingExpectedTimelineFrame, expected != timelineFrame {
            os_unfair_lock_unlock(&recordingTimingLock)
            return nil
        }
        if recordingTimelineOriginFrame == nil {
            recordingTimelineOriginFrame = timelineFrame
            audioDebugRecordingStartFrame = renderFrame
            recordingPlaybackObservedFrame = renderFrame
        }
        recordingExpectedRenderFrame = renderFrame + count
        recordingExpectedTimelineFrame = timelineFrame + count
        let snapshot = (
            recordingTimelineOriginFrame!,
            audioDebugRecordingStartFrame!,
            playbackQuantum.playbackStartFrame,
            recordingPlaybackObservedFrame!
        )
        os_unfair_lock_unlock(&recordingTimingLock)
        return snapshot
    }

    func publishExactRecordingFailure() {
        guard os_unfair_lock_trylock(&recordingEventLock) else { return }
        recordingClockFailurePending = true
        os_unfair_lock_unlock(&recordingEventLock)
    }

    func publishExactRecordingStarted(
        timeline: Int64,
        recording: Int64,
        playback: Int64,
        observed: Int64
    ) {
        guard os_unfair_lock_trylock(&recordingEventLock) else { return }
        if recordingStartedEventPending && recordingEventTimelineFrame == nil {
            recordingEventTimelineFrame = timeline
            recordingEventRecordingFrame = recording
            recordingEventPlaybackFrame = playback
            recordingEventPlaybackObservedFrame = observed
        }
        os_unfair_lock_unlock(&recordingEventLock)
    }

    func consumeExactRecordingFailure() -> Bool {
        os_unfair_lock_lock(&recordingEventLock)
        let failed = recordingClockFailurePending
        recordingClockFailurePending = false
        os_unfair_lock_unlock(&recordingEventLock)
        return failed
    }

    func isExactRecordingStartPending() -> Bool {
        os_unfair_lock_lock(&recordingEventLock)
        let pending = recordingStartedEventPending
        os_unfair_lock_unlock(&recordingEventLock)
        return pending
    }

    func consumeExactRecordingStarted() -> (timeline: Int64, recording: Int64, playback: Int64, observed: Int64)? {
        os_unfair_lock_lock(&recordingEventLock)
        defer { os_unfair_lock_unlock(&recordingEventLock) }
        guard recordingStartedEventPending,
              let timeline = recordingEventTimelineFrame,
              let recording = recordingEventRecordingFrame,
              let playback = recordingEventPlaybackFrame,
              let observed = recordingEventPlaybackObservedFrame else { return nil }
        recordingStartedEventPending = false
        return (timeline, recording, playback, observed)
    }

    func scheduleExactRecordingMonitor(sessionId: String, startDeadline: DispatchTime) {
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(5)) { [weak self] in
            guard let self, self.recordingState == .recording,
                  self.recordingRequireSampleAccurate,
                  self.recordingSessionId == sessionId else { return }
            if self.consumeExactRecordingFailure() {
                self.abortExactRecording(
                    sessionId: sessionId,
                    code: "av_recording_discontinuity",
                    message: "Playback and recording clocks diverged"
                )
                return
            }
            if let started = self.consumeExactRecordingStarted() {
                self.emitRecordingStarted(
                    timelineOriginFrame: started.timeline,
                    recordingFrame: started.recording,
                    playbackFrame: started.playback,
                    playbackObservedFrame: started.observed
                )
            } else if self.isExactRecordingStartPending(),
                      DispatchTime.now().uptimeNanoseconds >= startDeadline.uptimeNanoseconds {
                self.abortExactRecording(
                    sessionId: sessionId,
                    code: "av_sample_clock_invalid",
                    message: "No playing track was observed on the AUv3 host clock"
                )
                return
            }
            self.scheduleExactRecordingMonitor(sessionId: sessionId, startDeadline: startDeadline)
        }
    }

    func abortExactRecording(sessionId: String, code: String, message: String) {
        guard recordingState == .recording,
              recordingRequireSampleAccurate,
              recordingSessionId == sessionId else { return }
        let path = recordingPath
        let relativePath = recordingRelativePath
        let fileName = recordingFileName
        recordingState = .idle
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
        let discard = discardRecordedFile(atPath: path)
        emitRecordingEvent(type: "record_error", payload: [
            "session_id": sessionId,
            "file_name": fileName,
            "code": code,
            "error": discard.confirmed ? message : "\(message); recording cleanup failed",
            "file_path": relativePath,
            "absolute_file_path": path,
            "path": relativePath,
            "discarded": discard.confirmed,
            "discard_error": discard.error ?? NSNull(),
            "frame_count": frameCount,
            "overrun_frames": overrunFrames,
            "discontinuity_frames": discontinuityFrames
        ])
        clearRecordingSessionState()
    }

    func emitRecordingStarted(
        timelineOriginFrame: Int64?,
        recordingFrame: Int64?,
        playbackFrame: Int64?,
        playbackObservedFrame: Int64?
    ) {
        let timelinePayload: Any = timelineOriginFrame == nil ? NSNull() : timelineOriginFrame!
        let recordingPayload: Any = recordingFrame == nil ? NSNull() : recordingFrame!
        let playbackPayload: Any = playbackFrame == nil ? NSNull() : playbackFrame!
        let observedPayload: Any = playbackObservedFrame == nil ? NSNull() : playbackObservedFrame!
        emitRecordingEvent(type: "record_started", payload: [
            "session_id": recordingSessionId,
            "file_name": recordingFileName,
            "file_path": recordingRelativePath,
            "absolute_file_path": recordingPath,
            "path": recordingRelativePath,
            "source": recordingSource,
            "sample_rate": recordingSampleRate,
            "channels": recordingChannels,
            "clock_id": recordingClockId.isEmpty ? NSNull() : recordingClockId,
            "clock_epoch": recordingClockId.isEmpty ? NSNull() : audioRenderClockEpoch,
            "clock_reference": recordingClockId.isEmpty ? NSNull() : "record_start_render_quantum",
            "timeline_clock_id": timelineOriginFrame == nil ? NSNull() : "auv3.host_transport",
            "timeline_origin_frame": timelinePayload,
            "recording_start_frame": recordingPayload,
            "playback_start_frame": playbackPayload,
            "playback_observed_frame": observedPayload,
            "input_latency_frames": recordingInputLatencyFrames,
            "output_latency_frames": recordingOutputLatencyFrames,
            "roundtrip_latency_frames": recordingInputLatencyFrames + recordingOutputLatencyFrames
        ])
    }

    func sanitizeRecordingFileName(_ input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "mic.wav" }
        let allowed = trimmed.map { ch -> Character in
            if ch.isLetter || ch.isNumber { return ch }
            if ch == "_" || ch == "-" || ch == "." { return ch }
            return "_"
        }
        let name = String(allowed)
        if name.isEmpty { return "mic.wav" }
        if name.lowercased().hasSuffix(".wav") { return name }
        return name + ".wav"
    }

    func normalizedRecordingUserId(_ userId: String?) -> String {
        let trimmed = (userId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "anonymous" }
        let allowed = trimmed.map { ch -> Character in
            if ch.isLetter || ch.isNumber { return ch }
            if ch == "_" || ch == "-" || ch == "." { return ch }
            return "_"
        }
        let normalized = String(allowed)
        return normalized.isEmpty ? "anonymous" : normalized
    }

    func resolveRecordingOutput(fileName: String, userId: String?) -> (url: URL, relativePath: String)? {
        guard let root = SandboxPathValidator.primaryRoot() else { return nil }
        let relativePath = "data/users/\(normalizedRecordingUserId(userId))/recordings/\(fileName)"
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(relativePath) else { return nil }
        let url = root.appendingPathComponent(sanitized, isDirectory: false)
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        } catch {
            return nil
        }
        return (url, sanitized)
    }

    func emitRecordingEvent(type: String, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = """
        try{
          const payload = \(json);
          if(typeof window.nativeAudioEvent==='function'){ window.nativeAudioEvent({ type:'\(type)', payload }); }
          window.dispatchEvent(new CustomEvent('native_audio_recording', { detail: Object.assign({ type:'\(type)' }, payload) }));
        }catch(e){}
        """
        DispatchQueue.main.async {
            WebViewManager.evaluateJS(js, label: "auv3.recording", priority: .high)
        }
    }

    func startMicRecordingEngine(url: URL) throws -> (sampleRate: Double, channels: Int) {
        let engine = AVAudioEngine()
#if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothHFP])
        try? session.setActive(true)
#endif
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw NSError(domain: "AUV3Recording", code: 30, userInfo: [
                NSLocalizedDescriptionKey: "Microphone input format unavailable"
            ])
        }
        guard format.commonFormat == .pcmFormatFloat32,
              format.sampleRate <= Double(UInt32.max),
              format.channelCount <= UInt32(UInt16.max) else {
            throw NSError(domain: "AUV3Recording", code: 31, userInfo: [
                NSLocalizedDescriptionKey: "Microphone input must provide Float32 PCM"
            ])
        }
        input.removeTap(onBus: 0)
        let sampleRate = UInt32(format.sampleRate.rounded())
        let channels = UInt16(format.channelCount)
        guard nativeRecorderBackend.start(withPath: url.path,
                                          sampleRate: sampleRate,
                                          channels: channels,
                                          source: "mic") else {
            let message = nativeRecorderBackend.lastErrorMessage.isEmpty
                ? "Recorder start failed"
                : nativeRecorderBackend.lastErrorMessage
            throw NSError(domain: "AUV3Recording", code: 32, userInfo: [
                NSLocalizedDescriptionKey: message
            ])
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            let list = AudioBufferListWrapper(ptr: buffer.mutableAudioBufferList)
            self.pushRecordingBufferList(
                bufferList: list,
                channels: Int(buffer.format.channelCount),
                frames: buffer.frameLength,
                interleaved: buffer.format.isInterleaved,
                isFloat32: buffer.format.commonFormat == .pcmFormatFloat32
            )
        }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
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
            throw error
        }
        micRecordingEngine = engine
        return (format.sampleRate, Int(format.channelCount))
    }

    func stopMicRecordingEngine() {
        let engine = micRecordingEngine
        micRecordingEngine = nil
        if let input = engine?.inputNode {
            input.removeTap(onBus: 0)
        }
        engine?.stop()
    }

    func analyzeRecordedFile(at url: URL) -> [String: Any]? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            guard data.count >= 44 else { return nil }

            func readUInt16(_ offset: Int) -> UInt16? {
                guard offset + 2 <= data.count else { return nil }
                return data.subdata(in: offset..<(offset + 2)).withUnsafeBytes { raw in
                    raw.load(as: UInt16.self).littleEndian
                }
            }
            func readUInt32(_ offset: Int) -> UInt32? {
                guard offset + 4 <= data.count else { return nil }
                return data.subdata(in: offset..<(offset + 4)).withUnsafeBytes { raw in
                    raw.load(as: UInt32.self).littleEndian
                }
            }
            func readInt16(_ offset: Int) -> Int16? {
                guard offset + 2 <= data.count else { return nil }
                return data.subdata(in: offset..<(offset + 2)).withUnsafeBytes { raw in
                    Int16(bitPattern: raw.load(as: UInt16.self).littleEndian)
                }
            }
            func readInt32(_ offset: Int) -> Int32? {
                guard offset + 4 <= data.count else { return nil }
                return data.subdata(in: offset..<(offset + 4)).withUnsafeBytes { raw in
                    Int32(bitPattern: raw.load(as: UInt32.self).littleEndian)
                }
            }
            func readFloat32(_ offset: Int) -> Float32? {
                guard let bits = readUInt32(offset) else { return nil }
                return Float32(bitPattern: bits)
            }

            guard String(data: data.prefix(4), encoding: .ascii) == "RIFF",
                  String(data: data.subdata(in: 8..<12), encoding: .ascii) == "WAVE" else {
                return nil
            }

            var offset = 12
            var audioFormat: UInt16 = 0
            var channels: Int = 0
            var sampleRate: Double = 0
            var bitsPerSample: Int = 0
            var dataOffset: Int = 0
            var dataSize: Int = 0

            while offset + 8 <= data.count {
                let chunkId = String(data: data.subdata(in: offset..<(offset + 4)), encoding: .ascii) ?? ""
                let chunkSize = Int(readUInt32(offset + 4) ?? 0)
                let chunkDataOffset = offset + 8
                if chunkDataOffset + chunkSize > data.count { break }
                if chunkId == "fmt " {
                    audioFormat = readUInt16(chunkDataOffset) ?? 0
                    channels = Int(readUInt16(chunkDataOffset + 2) ?? 0)
                    sampleRate = Double(readUInt32(chunkDataOffset + 4) ?? 0)
                    bitsPerSample = Int(readUInt16(chunkDataOffset + 14) ?? 0)
                } else if chunkId == "data" {
                    dataOffset = chunkDataOffset
                    dataSize = chunkSize
                    break
                }
                offset = chunkDataOffset + chunkSize + (chunkSize % 2)
            }

            guard channels > 0, sampleRate > 0, bitsPerSample > 0, dataOffset > 0, dataSize > 0 else {
                return nil
            }

            let bytesPerSample = max(1, bitsPerSample / 8)
            let blockAlign = bytesPerSample * channels
            guard blockAlign > 0 else { return nil }
            let frameCount = dataSize / blockAlign
            guard frameCount > 0 else { return nil }

            func sampleValue(frame: Int, channel: Int) -> Float {
                let sampleOffset = dataOffset + ((frame * channels + channel) * bytesPerSample)
                switch (audioFormat, bitsPerSample) {
                case (3, 32):
                    return readFloat32(sampleOffset) ?? 0
                case (_, 16):
                    guard let value = readInt16(sampleOffset) else { return 0 }
                    return Float(value) / 32768.0
                case (_, 32):
                    if audioFormat == 3 {
                        return readFloat32(sampleOffset) ?? 0
                    }
                    guard let value = readInt32(sampleOffset) else { return 0 }
                    return Float(value) / 2147483648.0
                case (_, 8):
                    guard sampleOffset < data.count else { return 0 }
                    return (Float(data[sampleOffset]) - 128.0) / 128.0
                default:
                    return 0
                }
            }

            var peak: Float = 0
            for frame in 0..<frameCount {
                var framePeak: Float = 0
                for channel in 0..<channels {
                    framePeak = max(framePeak, abs(sampleValue(frame: frame, channel: channel)))
                }
                peak = max(peak, framePeak)
            }

            let adaptiveThreshold = max(0.05, peak * 0.5)
            var firstPeakFrame: Int? = nil
            for frame in 0..<frameCount {
                var framePeak: Float = 0
                for channel in 0..<channels {
                    framePeak = max(framePeak, abs(sampleValue(frame: frame, channel: channel)))
                }
                if framePeak >= adaptiveThreshold {
                    firstPeakFrame = frame
                    break
                }
            }

            return [
                "peak": peak,
                "first_peak_frame": firstPeakFrame as Any
            ]
        } catch {
            AUv3Diagnostics.log("AUv3: failed to analyze recorded file at \(url.path): \(error.localizedDescription)")
            return nil
        }
    }
}
