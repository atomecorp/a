//
//  AUv3Recorder.swift
//  auv3
//

import AVFoundation
import CoreAudio
import Foundation
import os.lock

extension auv3Utils {
    public func recordStart(sessionId: String, fileName: String, source: String, sampleRate: Double?, channels: UInt32?, userId: String?) {
        if recordingState != .idle {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Recording already in progress"
            ])
            return
        }

        let normalizedSource = normalizeRecordingSource(source)
        let safeName = sanitizeRecordingFileName(fileName)
        guard let output = resolveRecordingOutput(fileName: safeName, userId: userId) else {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "App Group container unavailable",
                "file_name": safeName
            ])
            return
        }
        let url = output.url
        let relativePath = output.relativePath

#if os(iOS)
        if normalizedSource == "mic" {
            let permission = AVAudioSession.sharedInstance().recordPermission
            if permission == .denied {
                emitRecordingEvent(type: "record_error", payload: [
                    "session_id": sessionId,
                    "error": "Microphone permission denied",
                    "file_name": safeName
                ])
                return
            }
        }
#endif

        let outputFormat = ((_outputBusArray?.count ?? 0) > 0) ? _outputBusArray?[0].format : nil
        if normalizedSource == "plugin" && outputFormat == nil {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Output bus not available",
                "file_name": safeName
            ])
            return
        }
        let srDefault = normalizedSource == "mic" ? (sampleRate ?? 44100.0) : (outputFormat?.sampleRate ?? 44100.0)
        let chDefault = normalizedSource == "mic" ? UInt32(channels ?? 1) : (outputFormat?.channelCount ?? 1)

        if let requestedSr = sampleRate, abs(requestedSr - srDefault) > 0.5 {
            // AUv3 must use the host sample rate; ignore the requested rate and continue
            AUv3Diagnostics.log("ℹ️ AUv3: ignoring requested SR \(requestedSr), using host SR \(srDefault)")
        }
        if normalizedSource == "plugin", let requestedCh = channels, Int(requestedCh) != Int(chDefault) {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Requested channel count not supported in AUv3",
                "file_name": safeName
            ])
            return
        }

        let sr = srDefault
        let ch = max(1, min(2, Int(chDefault)))

        var actualSampleRate = sr
        var actualChannels = UInt32(ch)
        if normalizedSource == "mic" {
            do {
                let started = try startMicRecordingEngine(url: url)
                actualSampleRate = started.sampleRate
                actualChannels = UInt32(started.channels)
                AUv3Diagnostics.log("[AUV3_RECORD] mic_engine_start_ok session=\(sessionId) file=\(safeName) frames=0 peak=0.0")
            } catch {
                AUv3Diagnostics.log("[AUV3_RECORD] mic_engine_start_error session=\(sessionId) file=\(safeName) error=\(error.localizedDescription)")
                emitRecordingEvent(type: "record_error", payload: [
                    "session_id": sessionId,
                    "error": error.localizedDescription,
                    "file_name": safeName
                ])
                return
            }
        } else {
            let ok = nativeRecorderBackend.start(withPath: url.path,
                                                 sampleRate: UInt32(sr),
                                                 channels: UInt16(ch),
                                                 source: normalizedSource)
            if !ok {
                let message = nativeRecorderBackend.lastErrorMessage.isEmpty
                    ? "Recorder start failed"
                    : nativeRecorderBackend.lastErrorMessage
                emitRecordingEvent(type: "record_error", payload: [
                    "session_id": sessionId,
                    "error": message,
                    "file_name": safeName
                ])
                return
            }
        }

        recordingSessionId = sessionId
        recordingSource = normalizedSource
        recordingFileName = safeName
        recordingSampleRate = actualSampleRate
        recordingChannels = actualChannels
        recordingPath = url.path
        recordingRelativePath = relativePath
        audioDebugRecordingStartFrame = nil

        recordingInputBuffer = nil

        recordingState = .recording

        AUv3Diagnostics.log("[AUV3_RECORD] start_ok session=\(sessionId) file=\(safeName) source=\(normalizedSource) relative=\(relativePath) absolute=\(url.path) sample_rate=\(actualSampleRate) channels=\(actualChannels)")
        emitRecordingEvent(type: "record_started", payload: [
            "session_id": sessionId,
            "file_name": safeName,
            "file_path": relativePath,
            "absolute_file_path": url.path,
            "path": relativePath,
            "source": normalizedSource,
            "sample_rate": actualSampleRate,
            "channels": actualChannels
        ])
    }

    public func recordStop(sessionId: String) {
        if recordingState != .recording {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "No active recording"
            ])
            return
        }
        if !sessionId.isEmpty && sessionId != recordingSessionId {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Session id mismatch"
            ])
            return
        }

        let activeSessionId = recordingSessionId
        let activeFileName = recordingFileName
        let activePath = recordingPath
        let activeSource = recordingSource
        let activeSampleRate = recordingSampleRate
        let activeChannels = recordingChannels
        let activeRelativePath = recordingRelativePath
        recordingState = .idle

        var duration: Double = 0
        var ok = true
        var stopErrorMessage = ""
        if activeSource == "mic" {
            let stats = stopMicRecordingEngine(sampleRate: activeSampleRate)
            duration = stats.duration
            AUv3Diagnostics.log("[AUV3_RECORD] mic_engine_stop_ok session=\(activeSessionId) file=\(activeFileName) frames=\(stats.frames) peak=\(stats.peak)")
            if stats.frames <= 0 {
                ok = false
                stopErrorMessage = "audio_recording_empty"
            }
        } else {
            ok = nativeRecorderBackend.stop(withDuration: &duration)
            if !ok {
                stopErrorMessage = nativeRecorderBackend.lastErrorMessage.isEmpty
                    ? "Recorder stop failed"
                    : nativeRecorderBackend.lastErrorMessage
            }
        }
        if !ok {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": activeSessionId,
                "error": stopErrorMessage,
                "file_name": activeFileName
            ])
        } else {
            let analysis = analyzeRecordedFile(at: URL(fileURLWithPath: activePath))
            let fileExists = FileManager.default.fileExists(atPath: activePath)
            let fileSize = ((try? FileManager.default.attributesOfItem(atPath: activePath))?[.size] as? NSNumber)?.int64Value ?? -1
            let relativePath = activeRelativePath
            AUv3Diagnostics.log("[AUV3_RECORD] stop_ok session=\(activeSessionId) file=\(activeFileName) source=\(activeSource) relative=\(relativePath) absolute=\(activePath) exists=\(fileExists) bytes=\(fileSize) duration=\(duration) analysis=\(String(describing: analysis))")
            let playbackStartFrameValue = audioDebugPlaybackStartFrame.map(Int.init)
            let recordingStartFrameValue = audioDebugRecordingStartFrame.map(Int.init)
            let expectedPeakFrameValue = audioDebugExpectedPeakFrame
            let computedFirstPeakFrame: Int? = {
                if activeSource == "plugin",
                   let playbackStart = audioDebugPlaybackStartFrame,
                   let recordingStart = audioDebugRecordingStartFrame,
                   let expectedPeak = audioDebugExpectedPeakFrame {
                    let relativeStart = max(0, Int(playbackStart - recordingStart))
                    return relativeStart + expectedPeak
                }
                return analysis?["first_peak_frame"] as? Int
            }()
            let peakValue: Any = analysis?["peak"] ?? NSNull()
            let firstPeakValue: Any = computedFirstPeakFrame ?? NSNull()
            let playbackFramePayload: Any = playbackStartFrameValue ?? NSNull()
            let recordingFramePayload: Any = recordingStartFrameValue ?? NSNull()
            let expectedPeakPayload: Any = expectedPeakFrameValue ?? NSNull()
            emitRecordingEvent(type: "record_done", payload: [
                "session_id": activeSessionId,
                "file_name": activeFileName,
                "file_path": relativePath,
                "absolute_file_path": activePath,
                "path": relativePath,
                "source": activeSource,
                "sample_rate": activeSampleRate,
                "channels": activeChannels,
                "duration_sec": duration,
                "size_bytes": fileSize,
                "peak": peakValue,
                "first_peak_frame": firstPeakValue,
                "playback_start_frame": playbackFramePayload,
                "recording_start_frame": recordingFramePayload,
                "expected_peak_frame": expectedPeakPayload
            ])
        }

        recordingSessionId = ""
        recordingSource = "mic"
        recordingFileName = ""
        recordingSampleRate = 0
        recordingChannels = 0
        recordingPath = ""
        recordingRelativePath = ""
        audioDebugRecordingStartFrame = nil
        recordingInputBuffer = nil
    }

    func normalizeRecordingSource(_ source: String) -> String {
        let raw = source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if raw == "plugin" || raw == "plugin_output" { return "plugin" }
        return "mic"
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
        guard let root = SandboxPathValidator.primaryRoot() else {
            return nil
        }
        let safeUserId = normalizedRecordingUserId(userId)
        let relativePath = "data/users/\(safeUserId)/recordings/\(fileName)"
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(relativePath) else {
            return nil
        }
        let url = root.appendingPathComponent(sanitized, isDirectory: false)
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        } catch {
            return nil
        }
        return (url, sanitized)
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
        input.removeTap(onBus: 0)
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        os_unfair_lock_lock(&micRecordingLock)
        micRecordingFrames = 0
        micRecordingPeak = 0
        micRecordingFile = file
        micRecordingEngine = engine
        os_unfair_lock_unlock(&micRecordingLock)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            do {
                os_unfair_lock_lock(&self.micRecordingLock)
                let activeFile = self.micRecordingFile
                self.micRecordingFrames += AVAudioFramePosition(buffer.frameLength)
                if let channels = buffer.floatChannelData {
                    let channelCount = Int(buffer.format.channelCount)
                    let frames = Int(buffer.frameLength)
                    var peak = self.micRecordingPeak
                    for channel in 0..<channelCount {
                        let ptr = channels[channel]
                        for frame in 0..<frames {
                            peak = max(peak, abs(ptr[frame]))
                        }
                    }
                    self.micRecordingPeak = peak
                }
                os_unfair_lock_unlock(&self.micRecordingLock)
                try activeFile?.write(from: buffer)
            } catch {
                AUv3Diagnostics.log("[AUV3_RECORD] mic_engine_write_error file=\(url.lastPathComponent) error=\(error.localizedDescription)")
            }
        }
        engine.prepare()
        try engine.start()
        return (format.sampleRate, Int(format.channelCount))
    }

    func stopMicRecordingEngine(sampleRate: Double) -> (frames: AVAudioFramePosition, peak: Float, duration: Double) {
        os_unfair_lock_lock(&micRecordingLock)
        let engine = micRecordingEngine
        let frames = micRecordingFrames
        let peak = micRecordingPeak
        micRecordingFile = nil
        micRecordingEngine = nil
        micRecordingFrames = 0
        micRecordingPeak = 0
        os_unfair_lock_unlock(&micRecordingLock)
        if let input = engine?.inputNode {
            input.removeTap(onBus: 0)
        }
        engine?.stop()
        let duration = sampleRate > 0 ? Double(frames) / sampleRate : 0
        return (frames, peak, duration)
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

    func captureRecordingInput(pullInputBlock: AURenderPullInputBlock?, timestamp: UnsafePointer<AudioTimeStamp>, frameCount: AUAudioFrameCount) {
        guard let pullInputBlock, let inputBuffer = recordingInputBuffer else { return }
        inputBuffer.frameLength = frameCount
        var flags = AudioUnitRenderActionFlags()
        let status = pullInputBlock(&flags, timestamp, frameCount, 0, inputBuffer.mutableAudioBufferList)
        if status != noErr { return }

        let format = inputBuffer.format
        let channels = Int(format.channelCount)
        let interleaved = format.isInterleaved
        let isFloat32 = (format.commonFormat == .pcmFormatFloat32)
        let list = AudioBufferListWrapper(ptr: inputBuffer.mutableAudioBufferList)
        pushRecordingBufferList(bufferList: list,
                                channels: channels,
                                frames: frameCount,
                                interleaved: interleaved,
                                isFloat32: isFloat32)
    }

    func captureRecordingOutput(bufferList: AudioBufferListWrapper, channels: Int, frames: AUAudioFrameCount, interleaved: Bool, isFloat32: Bool) {
        pushRecordingBufferList(bufferList: bufferList,
                                channels: channels,
                                frames: frames,
                                interleaved: interleaved,
                                isFloat32: isFloat32)
    }

    func pushRecordingBufferList(bufferList: AudioBufferListWrapper, channels: Int, frames: AUAudioFrameCount, interleaved: Bool, isFloat32: Bool) {
        if !isFloat32 { return }
        let ch = max(1, min(channels, recordingChannelPointers.count))
        if interleaved || bufferList.numberOfBuffers == 1 {
            let buf = bufferList.buffer(at: 0)
            guard let mData = buf.mData else { return }
            let ptr = mData.assumingMemoryBound(to: Float.self)
            nativeRecorderBackend.pushInterleavedFloat32(ptr, channels: UInt16(ch), frames: UInt32(frames))
            return
        }
        if bufferList.numberOfBuffers < ch { return }
        for c in 0..<ch {
            let buf = bufferList.buffer(at: c)
            guard let mData = buf.mData else { return }
            let mutablePtr = mData.assumingMemoryBound(to: Float.self)
            recordingChannelPointers[c] = UnsafePointer(mutablePtr)
        }
        recordingChannelPointers.withUnsafeBufferPointer { ptr in
            if let base = ptr.baseAddress {
                nativeRecorderBackend.pushPlanarFloat32(base, channels: UInt16(ch), frames: UInt32(frames))
            }
        }
    }
    

}
