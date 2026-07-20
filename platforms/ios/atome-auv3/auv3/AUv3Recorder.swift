//
//  AUv3Recorder.swift
//  auv3
//

import AVFoundation
import CoreAudio
import Foundation
import os.lock

extension auv3Utils {
    public func recordStart(
        sessionId: String,
        fileName: String,
        source: String,
        sampleRate: Double?,
        channels: UInt32?,
        userId: String?,
        requireSampleAccurate: Bool
    ) {
        if recordingState != .idle {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Recording already in progress"
            ])
            return
        }

        let normalizedSource = normalizeRecordingSource(source)
        if requireSampleAccurate && normalizedSource != "plugin_input" {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "code": "av_sample_accurate_overdub_unsupported",
                "error": "Exact AUv3 recording requires plugin_input"
            ])
            return
        }
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

        let outputBus = ((_outputBusArray?.count ?? 0) > 0) ? _outputBusArray?[0] : nil
        let inputBus = ((_inputBusArray?.count ?? 0) > 0) ? _inputBusArray?[0] : nil
        let outputFormat = outputBus?.format
        let inputFormat = inputBus?.format
        let renderFormat = normalizedSource == "plugin_input" ? inputFormat : outputFormat
        if normalizedSource != "mic" && renderFormat == nil {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": normalizedSource == "plugin_input" ? "Input bus not available" : "Output bus not available",
                "file_name": safeName
            ])
            return
        }
        if normalizedSource == "plugin_input" {
            guard let inFormat = inputFormat,
                  let outFormat = outputFormat,
                  let inRate = inputFormat?.sampleRate,
                  let outRate = outputFormat?.sampleRate,
                  abs(inRate - outRate) <= 0.000_001,
                  inFormat.channelCount == outFormat.channelCount,
                  inFormat.commonFormat == outFormat.commonFormat,
                  inFormat.isInterleaved == outFormat.isInterleaved else {
                emitRecordingEvent(type: "record_error", payload: [
                    "session_id": sessionId,
                    "error": "AUv3 duplex sample-rate mapping unavailable",
                    "file_name": safeName
                ])
                return
            }
            if requireSampleAccurate && cachedTransportStateBlock == nil {
                emitRecordingEvent(type: "record_error", payload: [
                    "session_id": sessionId,
                    "code": "av_sample_clock_invalid",
                    "error": "AUv3 host transport clock unavailable",
                    "file_name": safeName
                ])
                return
            }
        }
        if normalizedSource != "mic" && renderFormat?.commonFormat != .pcmFormatFloat32 {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Recorder requires a Float32 render format",
                "file_name": safeName
            ])
            return
        }
        let srDefault = normalizedSource == "mic" ? (sampleRate ?? 44100.0) : (renderFormat?.sampleRate ?? 44100.0)
        let chDefault = normalizedSource == "mic" ? UInt32(channels ?? 1) : (renderFormat?.channelCount ?? 1)

        if let requestedSr = sampleRate, abs(requestedSr - srDefault) > 0.000_001 {
            if normalizedSource == "plugin_input" {
                emitRecordingEvent(type: "record_error", payload: [
                    "session_id": sessionId,
                    "error": "Timeline and AUv3 host sample rates differ",
                    "file_name": safeName
                ])
                return
            }
            AUv3Diagnostics.log("ℹ️ AUv3: ignoring requested SR \(requestedSr), using host SR \(srDefault)")
        }
        if normalizedSource != "mic", let requestedCh = channels, Int(requestedCh) != Int(chDefault) {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Requested channel count not supported in AUv3",
                "file_name": safeName
            ])
            return
        }

        let sr = srDefault
        guard sr.isFinite, sr > 0, sr <= Double(UInt32.max),
              abs(sr - sr.rounded()) <= 0.000_001, chDefault > 0, chDefault <= 8 else {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Unsupported recorder format",
                "file_name": safeName
            ])
            return
        }
        let ch = Int(chDefault)
        guard let inputLatencyFrames = presentationLatencyFrames(
                seconds: normalizedSource == "plugin_input" ? (inputBus?.contextPresentationLatency ?? 0) : 0,
                sampleRate: sr
              ),
              let outputLatencyFrames = presentationLatencyFrames(
                seconds: normalizedSource == "plugin_input" ? (outputBus?.contextPresentationLatency ?? 0) : 0,
                sampleRate: sr
              ),
              inputLatencyFrames <= Int64.max - outputLatencyFrames else {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Invalid host presentation latency",
                "file_name": safeName
            ])
            return
        }
        if requireSampleAccurate && (inputLatencyFrames <= 0 || outputLatencyFrames <= 0) {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "code": "av_sample_clock_invalid",
                "error": "Host input/output presentation latency is unknown",
                "file_name": safeName
            ])
            return
        }
        var actualSampleRate = sr
        var actualChannels = UInt32(ch)
        var preparedInputBuffer: AVAudioPCMBuffer? = nil
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
            if normalizedSource == "plugin_input" {
                guard let format = renderFormat,
                      let buffer = AVAudioPCMBuffer(
                        pcmFormat: format,
                        frameCapacity: max(1, maximumFramesToRender)
                      ) else {
                    emitRecordingEvent(type: "record_error", payload: [
                        "session_id": sessionId,
                        "error": "Input render buffer allocation failed",
                        "file_name": safeName
                    ])
                    return
                }
                preparedInputBuffer = buffer
            }
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
        recordingClockId = requireSampleAccurate ? "auv3.render" : ""
        recordingRequireSampleAccurate = requireSampleAccurate
        recordingInputLatencyFrames = inputLatencyFrames
        recordingOutputLatencyFrames = outputLatencyFrames
        if requireSampleAccurate {
            resetExactRecordingTiming(pendingStartEvent: true)
        } else {
            resetAudioRecordingStartFrame()
            if normalizedSource != "mic" { resetAudioPlaybackStartFrame() }
            resetExactRecordingTiming(pendingStartEvent: false)
        }
        recordingInputBuffer = preparedInputBuffer

        recordingState = .recording
        startRecordingScopeMonitor(sessionId: sessionId)

        AUv3Diagnostics.log("[AUV3_RECORD] start_ok session=\(sessionId) file=\(safeName) source=\(normalizedSource) relative=\(relativePath) absolute=\(url.path) sample_rate=\(actualSampleRate) channels=\(actualChannels)")
        if requireSampleAccurate {
            scheduleExactRecordingMonitor(
                sessionId: sessionId,
                startDeadline: .now() + .seconds(2)
            )
        } else {
            emitRecordingStarted(
                timelineOriginFrame: nil,
                recordingFrame: nil,
                playbackFrame: nil,
                playbackObservedFrame: nil
            )
        }
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
        let activeClockId = recordingClockId
        let activeRequireSampleAccurate = recordingRequireSampleAccurate
        let activeInputLatencyFrames = recordingInputLatencyFrames
        let activeOutputLatencyFrames = recordingOutputLatencyFrames
        let activeTimelineOriginFrame = readExactRecordingTimelineOrigin()
        recordingState = .idle

        var duration: Double = 0
        var frameCount: UInt64 = 0
        var overrunFrames: UInt64 = 0
        var discontinuityFrames: UInt64 = 0
        var ok = true
        var stopErrorMessage = ""
        if activeSource == "mic" { stopMicRecordingEngine() }
        ok = nativeRecorderBackend.stop(withDuration: &duration,
                                         frameCount: &frameCount,
                                         overrunFrames: &overrunFrames,
                                         discontinuityFrames: &discontinuityFrames)
        if !ok {
            stopErrorMessage = nativeRecorderBackend.lastErrorMessage.isEmpty
                ? "Recorder stop failed"
                : nativeRecorderBackend.lastErrorMessage
        } else if frameCount == 0 {
            ok = false
            stopErrorMessage = "audio_recording_empty"
        }
        let timingFrames = readAudioTimingFrames(requireSampleAccurate: activeRequireSampleAccurate)
        if activeRequireSampleAccurate,
           (activeTimelineOriginFrame == nil
            || timingFrames.playback == nil
            || timingFrames.recording == nil
            || timingFrames.observed == nil) {
            ok = false
            discontinuityFrames = max(1, discontinuityFrames)
            stopErrorMessage = "Exact recording timing proof is incomplete"
        }
        if !ok {
            let discard = discardRecordedFile(atPath: activePath)
            let errorCode: Any = activeRequireSampleAccurate
                ? (overrunFrames > 0
                    ? "av_recording_overrun"
                    : (frameCount == 0 ? "av_recording_empty" : "av_recording_discontinuity"))
                : NSNull()
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": activeSessionId,
                "code": errorCode,
                "error": discard.confirmed ? stopErrorMessage : "\(stopErrorMessage); recording cleanup failed",
                "file_name": activeFileName,
                "file_path": activeRelativePath,
                "absolute_file_path": activePath,
                "path": activeRelativePath,
                "discarded": discard.confirmed,
                "discard_error": discard.error ?? NSNull(),
                "frame_count": frameCount,
                "overrun_frames": overrunFrames,
                "discontinuity_frames": discontinuityFrames
            ])
        } else {
            let analysis = analyzeRecordedFile(at: URL(fileURLWithPath: activePath))
            let fileExists = FileManager.default.fileExists(atPath: activePath)
            let fileSize = ((try? FileManager.default.attributesOfItem(atPath: activePath))?[.size] as? NSNumber)?.int64Value ?? -1
            let relativePath = activeRelativePath
            AUv3Diagnostics.log("[AUV3_RECORD] stop_ok session=\(activeSessionId) file=\(activeFileName) source=\(activeSource) relative=\(relativePath) absolute=\(activePath) exists=\(fileExists) bytes=\(fileSize) duration=\(duration) analysis=\(String(describing: analysis))")
            let playbackStartFrameValue = timingFrames.playback.map(Int.init)
            let recordingStartFrameValue = timingFrames.recording.map(Int.init)
            let playbackObservedFrameValue = timingFrames.observed.map(Int.init)
            let expectedPeakFrameValue = audioDebugExpectedPeakFrame
            let computedFirstPeakFrame: Int? = {
                if activeSource == "plugin",
                   let playbackStart = timingFrames.playback,
                   let recordingStart = timingFrames.recording,
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
            let playbackObservedPayload: Any = playbackObservedFrameValue ?? NSNull()
            let expectedPeakPayload: Any = expectedPeakFrameValue ?? NSNull()
            let timelineOriginPayload: Any = activeTimelineOriginFrame == nil
                ? NSNull()
                : activeTimelineOriginFrame!
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
                "frame_count": frameCount,
                "overrun_frames": overrunFrames,
                "size_bytes": fileSize,
                "peak": peakValue,
                "first_peak_frame": firstPeakValue,
                "playback_start_frame": playbackFramePayload,
                "playback_observed_frame": playbackObservedPayload,
                "recording_start_frame": recordingFramePayload,
                "expected_peak_frame": expectedPeakPayload,
                "clock_id": activeClockId.isEmpty ? NSNull() : activeClockId,
                "clock_epoch": activeClockId.isEmpty ? NSNull() : audioRenderClockEpoch,
                "clock_reference": activeClockId.isEmpty ? NSNull() : "record_start_render_quantum",
                "timeline_clock_id": activeTimelineOriginFrame == nil ? NSNull() : "auv3.host_transport",
                "timeline_origin_frame": timelineOriginPayload,
                "input_latency_frames": activeInputLatencyFrames,
                "output_latency_frames": activeOutputLatencyFrames,
                "roundtrip_latency_frames": activeInputLatencyFrames + activeOutputLatencyFrames,
                "record_offset_frames_applied": activeInputLatencyFrames + activeOutputLatencyFrames,
                "discontinuity_frames": discontinuityFrames
            ])
        }

        clearRecordingSessionState()
    }

    func discardRecordedFile(atPath path: String) -> (confirmed: Bool, error: String?) {
        guard !path.isEmpty else { return (false, "audio_recording_discard_path_missing") }
        let files = FileManager.default
        if !files.fileExists(atPath: path) { return (true, nil) }
        do { try files.removeItem(atPath: path) }
        catch { return (false, "audio_recording_discard_failed: \(error.localizedDescription)") }
        guard !files.fileExists(atPath: path) else {
            return (false, "audio_recording_discard_not_confirmed")
        }
        return (true, nil)
    }

    @discardableResult
    func captureRecordingInput(
        pullInputBlock: AURenderPullInputBlock?,
        timestamp: UnsafePointer<AudioTimeStamp>,
        frameCount: AUAudioFrameCount,
        targetBufferList: UnsafeMutablePointer<AudioBufferList>? = nil,
        playbackQuantum: ExactPlaybackQuantum? = nil
    ) -> Bool {
        guard let pullInputBlock, let inputBuffer = recordingInputBuffer else {
            nativeRecorderBackend.reportDiscontinuityFrames(UInt32(frameCount))
            return false
        }
        guard frameCount <= inputBuffer.frameCapacity else {
            nativeRecorderBackend.reportDiscontinuityFrames(UInt32(frameCount))
            return false
        }
        inputBuffer.frameLength = frameCount
        var flags = AudioUnitRenderActionFlags()
        let pulledBufferList = targetBufferList ?? inputBuffer.mutableAudioBufferList
        let status = pullInputBlock(&flags, timestamp, frameCount, 0, pulledBufferList)
        if status != noErr {
            nativeRecorderBackend.reportDiscontinuityFrames(UInt32(frameCount))
            return false
        }

        if recordingRequireSampleAccurate {
            if recordingRenderFailureLatched {
                publishExactRecordingFailure()
                return false
            }
            guard let playbackQuantum,
                  let quantum = latchExactRecordingQuantum(
                    timestamp: timestamp,
                    frameCount: frameCount,
                    playbackQuantum: playbackQuantum
                  ) else {
                recordingRenderFailureLatched = true
                nativeRecorderBackend.reportDiscontinuityFrames(UInt32(frameCount))
                publishExactRecordingFailure()
                return false
            }
            publishExactRecordingStarted(
                timeline: quantum.timeline,
                recording: quantum.recording,
                playback: quantum.playback,
                observed: quantum.observed
            )
        }
        let format = inputBuffer.format
        let channels = Int(format.channelCount)
        let interleaved = format.isInterleaved
        let isFloat32 = (format.commonFormat == .pcmFormatFloat32)
        let list = AudioBufferListWrapper(ptr: pulledBufferList)
        pushRecordingBufferList(bufferList: list,
                                channels: channels,
                                frames: frameCount,
                                interleaved: interleaved,
                                isFloat32: isFloat32)
        return true
    }

}
