//
//  AUv3PlaybackState.swift
//  auv3
//

import AVFoundation
import Foundation
import os.lock

extension auv3Utils {
    func presentationLatencyFrames(seconds: Double, sampleRate: Double) -> Int64? {
        guard seconds.isFinite, seconds >= 0, sampleRate.isFinite, sampleRate > 0 else { return nil }
        let frames = (seconds * sampleRate).rounded()
        guard frames.isFinite, frames >= 0, frames <= Double(Int64.max) else { return nil }
        return Int64(frames)
    }

    func normalizeRecordingSource(_ source: String) -> String {
        let raw = source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if raw == "plugin" || raw == "plugin_output" { return "plugin" }
        if raw == "plugin_input" || raw == "input" { return "plugin_input" }
        return "mic"
    }

    func resetAudioRecordingStartFrame() {
        os_unfair_lock_lock(&recordingTimingLock)
        audioDebugRecordingStartFrame = nil
        os_unfair_lock_unlock(&recordingTimingLock)
    }

    func markAudioRecordingStartFrame(_ frame: Int64) {
        guard os_unfair_lock_trylock(&recordingTimingLock) else { return }
        if audioDebugRecordingStartFrame == nil { audioDebugRecordingStartFrame = frame }
        os_unfair_lock_unlock(&recordingTimingLock)
    }

    func exactSafeFrame(_ value: Double) -> Int64? {
        guard value.isFinite, value >= 0, value <= 9_007_199_254_740_991 else { return nil }
        let rounded = value.rounded()
        guard abs(value - rounded) <= 0.000_001 else { return nil }
        return Int64(rounded)
    }

    func resetAudioPlaybackStartFrame() {
        os_unfair_lock_lock(&audioTimingLock)
        audioDebugPlaybackStartFrame = nil
        exactPlaybackStartFrame = nil
        playbackCurrentRenderFrame = nil
        playbackCurrentTimelineFrame = nil
        playbackExpectedRenderFrame = nil
        playbackExpectedTimelineFrame = nil
        playbackClockDiscontinuity = false
        os_unfair_lock_unlock(&audioTimingLock)
    }

    func markAudioPlaybackStartFrame(_ frame: Int64) {
        guard os_unfair_lock_trylock(&audioTimingLock) else { return }
        if audioDebugPlaybackStartFrame == nil { audioDebugPlaybackStartFrame = frame }
        os_unfair_lock_unlock(&audioTimingLock)
    }

    func markExactPlaybackClockInvalid() {
        guard os_unfair_lock_trylock(&audioTimingLock) else { return }
        if exactPlaybackStartFrame != nil { playbackClockDiscontinuity = true }
        playbackCurrentRenderFrame = nil
        playbackCurrentTimelineFrame = nil
        os_unfair_lock_unlock(&audioTimingLock)
    }

    func latchExactPlaybackQuantum(
        timestamp: UnsafePointer<AudioTimeStamp>,
        frameCount: AUAudioFrameCount
    ) -> ExactPlaybackQuantum? {
        guard timestamp.pointee.mFlags.contains(.sampleTimeValid),
              let renderFrame = exactSafeFrame(timestamp.pointee.mSampleTime),
              frameCount > 0,
              let transport = cachedTransportStateBlock else {
            markExactPlaybackClockInvalid()
            return nil
        }
        var flags = AUHostTransportStateFlags(rawValue: 0)
        var timelineSampleTime: Double = 0
        var cycleStartBeat: Double = 0
        var cycleEndBeat: Double = 0
        guard transport(&flags, &timelineSampleTime, &cycleStartBeat, &cycleEndBeat),
              (flags.rawValue & AUHostTransportStateFlags.moving.rawValue) != 0,
              let timelineFrame = exactSafeFrame(timelineSampleTime) else {
            markExactPlaybackClockInvalid()
            return nil
        }
        let count = Int64(frameCount)
        guard renderFrame <= Int64.max - count,
              timelineFrame <= Int64.max - count,
              os_unfair_lock_trylock(&audioTimingLock) else { return nil }
        defer { os_unfair_lock_unlock(&audioTimingLock) }
        guard !playbackClockDiscontinuity else { return nil }
        if let expected = playbackExpectedRenderFrame, expected != renderFrame {
            playbackClockDiscontinuity = true
            playbackCurrentRenderFrame = nil
            playbackCurrentTimelineFrame = nil
            return nil
        }
        if let expected = playbackExpectedTimelineFrame, expected != timelineFrame {
            playbackClockDiscontinuity = true
            playbackCurrentRenderFrame = nil
            playbackCurrentTimelineFrame = nil
            return nil
        }
        if exactPlaybackStartFrame == nil {
            exactPlaybackStartFrame = renderFrame
            if audioDebugPlaybackStartFrame == nil { audioDebugPlaybackStartFrame = renderFrame }
        }
        playbackCurrentRenderFrame = renderFrame
        playbackCurrentTimelineFrame = timelineFrame
        playbackExpectedRenderFrame = renderFrame + count
        playbackExpectedTimelineFrame = timelineFrame + count
        return ExactPlaybackQuantum(
            renderFrame: renderFrame,
            timelineFrame: timelineFrame,
            playbackStartFrame: exactPlaybackStartFrame!
        )
    }

    func readAudioTimingFrames(requireSampleAccurate: Bool = false) -> (
        playback: Int64?, recording: Int64?, observed: Int64?
    ) {
        let playback: Int64?
        if requireSampleAccurate {
            os_unfair_lock_lock(&recordingEventLock)
            playback = recordingEventPlaybackFrame
            os_unfair_lock_unlock(&recordingEventLock)
        } else {
            os_unfair_lock_lock(&audioTimingLock)
            playback = audioDebugPlaybackStartFrame
            os_unfair_lock_unlock(&audioTimingLock)
        }
        os_unfair_lock_lock(&recordingTimingLock)
        let frames = (playback, audioDebugRecordingStartFrame, recordingPlaybackObservedFrame)
        os_unfair_lock_unlock(&recordingTimingLock)
        return frames
    }

    func clearRecordingSessionState() {
        recordingScopeMonitorGeneration &+= 1
        recordingScopeLastSequence = 0
        recordingSessionId = ""
        recordingSource = "mic"
        recordingFileName = ""
        recordingSampleRate = 0
        recordingChannels = 0
        recordingPath = ""
        recordingRelativePath = ""
        recordingClockId = ""
        recordingRequireSampleAccurate = false
        recordingInputLatencyFrames = 0
        recordingOutputLatencyFrames = 0
        resetExactRecordingTiming(pendingStartEvent: false)
        recordingInputBuffer = nil
    }

    func startRecordingScopeMonitor(sessionId: String) {
        recordingScopeMonitorGeneration &+= 1
        recordingScopeLastSequence = 0
        scheduleRecordingScopeRead(
            sessionId: sessionId,
            generation: recordingScopeMonitorGeneration
        )
    }

    func scheduleRecordingScopeRead(sessionId: String, generation: UInt64) {
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(34)) { [weak self] in
            guard let self,
                  self.recordingState == .recording,
                  self.recordingSessionId == sessionId,
                  self.recordingScopeMonitorGeneration == generation else { return }
            self.publishRecordingScope(sessionId: sessionId)
            self.scheduleRecordingScopeRead(sessionId: sessionId, generation: generation)
        }
    }

    func publishRecordingScope(sessionId: String) {
        var binCount: UInt16 = 0
        var sequence: UInt64 = 0
        var sampleRate: UInt32 = 0
        var channels: UInt16 = 0
        var rms: Float = 0
        var peak: Float = 0
        let copied = recordingScopeMinima.withUnsafeMutableBufferPointer { minima in
            recordingScopeMaxima.withUnsafeMutableBufferPointer { maxima in
                guard let minimumBase = minima.baseAddress,
                      let maximumBase = maxima.baseAddress else { return false }
                return nativeRecorderBackend.copyScopeMinima(
                    minimumBase,
                    maxima: maximumBase,
                    capacity: UInt16(recordingScopeBinCount),
                    binCount: &binCount,
                    sequence: &sequence,
                    sampleRate: &sampleRate,
                    channels: &channels,
                    rms: &rms,
                    peak: &peak
                )
            }
        }
        guard copied, sequence != recordingScopeLastSequence,
              binCount == UInt16(recordingScopeBinCount) else { return }
        recordingScopeLastSequence = sequence
        for index in 0..<recordingScopeBinCount {
            recordingScopePairs[index * 2] = recordingScopeMinima[index]
            recordingScopePairs[(index * 2) + 1] = recordingScopeMaxima[index]
        }
        emitRecordingEvent(type: "record_scope", payload: [
            "session_id": sessionId,
            "sequence": NSNumber(value: sequence),
            "sample_rate": sampleRate,
            "channels": channels,
            "bin_count": binCount,
            "min_max_pairs": recordingScopePairs,
            "rms": rms,
            "peak": peak
        ])
    }

    func captureRecordingOutput(bufferList: AudioBufferListWrapper, channels: Int, frames: AUAudioFrameCount, interleaved: Bool, isFloat32: Bool) {
        pushRecordingBufferList(bufferList: bufferList, channels: channels, frames: frames,
                                interleaved: interleaved, isFloat32: isFloat32)
    }

    func pushRecordingBufferList(bufferList: AudioBufferListWrapper, channels: Int, frames: AUAudioFrameCount, interleaved: Bool, isFloat32: Bool) {
        guard isFloat32 else {
            nativeRecorderBackend.reportDiscontinuityFrames(UInt32(frames))
            return
        }
        let ch = max(1, min(channels, recordingChannelPointers.count))
        if interleaved || bufferList.numberOfBuffers == 1 {
            guard let data = bufferList.buffer(at: 0).mData else {
                nativeRecorderBackend.reportDiscontinuityFrames(UInt32(frames))
                return
            }
            nativeRecorderBackend.pushInterleavedFloat32(
                data.assumingMemoryBound(to: Float.self),
                channels: UInt16(ch),
                frames: UInt32(frames)
            )
            return
        }
        guard bufferList.numberOfBuffers >= ch else {
            nativeRecorderBackend.reportDiscontinuityFrames(UInt32(frames))
            return
        }
        for channel in 0..<ch {
            guard let data = bufferList.buffer(at: channel).mData else {
                nativeRecorderBackend.reportDiscontinuityFrames(UInt32(frames))
                return
            }
            recordingChannelPointers[channel] = UnsafePointer(data.assumingMemoryBound(to: Float.self))
        }
        recordingChannelPointers.withUnsafeBufferPointer { pointers in
            if let base = pointers.baseAddress {
                nativeRecorderBackend.pushPlanarFloat32(base, channels: UInt16(ch), frames: UInt32(frames))
            }
        }
    }

    // MARK: - Simple controls for WebView bridge
    public func setMasterGain(_ g: Float) { self.masterGain = max(0.0, g) }
    public func setPlayActive(_ on: Bool) {
        let wasActive = self.playActive
        if on && !wasActive {
            pendingScrubPreview = nil
            resetAudioPlaybackStartFrame()
        }
        if !on && wasActive { resetAudioPlaybackStartFrame() }
        self.playActive = on
        // Prefer file playback when a file is loaded; use test tone only when no file is active.
    os_unfair_lock_lock(&fileLock)
        let hasFile = fileLoaded
        let hasAux = !auxSlots.isEmpty
        let totalFrames = min(fileAudioL.count, fileAudioR.count)
        let currentFrameIndex = fileFrameIndex
        if on && hasFile {
            // If we reached EOF previously, reset to the start so replay works without needing a jump
            if fileFrameIndex >= totalFrames { fileFrameIndex = 0 }
        }
        if !on {
            // Stopping playback clears aux slots
            auxSlots.removeAll()
        }
    os_unfair_lock_unlock(&fileLock)
        // Do not enable tone while we are decoding a file (reduces perceived latency/beeps)
        self.isTestToneActive = on && !hasFile && !hasAux && !isDecodingFile
        AUv3Diagnostics.log("🎧 AUv3 playback state play=\(on) loaded=\(hasFile) decoding=\(isDecodingFile) aux=\(hasAux) frames=\(totalFrames) frameIndex=\(currentFrameIndex) tone=\(self.isTestToneActive)")
        if on && hasFile {
            let sr = Int(getSampleRate() ?? 44100.0)
            fadeInTotal = max(128, min(sr / 100, 1024)) // ~10ms, clamped
            fadeInSamplesRemaining = fadeInTotal
        }
    }
    public func setTestToneActive(_ on: Bool) { self.isTestToneActive = on }
    public func stopAudioSlot(_ slotId: String) {
        resetAudioPlaybackStartFrame()
        os_unfair_lock_lock(&fileLock)
        auxSlots.removeAll { $0.slotId == slotId }
        // Also stop main slot if it matches
        if loadedFilePath == slotId || (loadedFilePath?.hasSuffix(slotId) == true) {
            fileFrameIndex = min(fileAudioL.count, fileAudioR.count)
        }
        os_unfair_lock_unlock(&fileLock)
    }
    public func clearAuxSlots() {
        resetAudioPlaybackStartFrame()
        os_unfair_lock_lock(&fileLock)
        auxSlots.removeAll()
        os_unfair_lock_unlock(&fileLock)
    }
    public func setDebugCaptureEnabled(_ on: Bool) { self.dbgCaptureEnabled = on }
    public func setAudioDebugExpectedPeakFrame(_ frame: Int?) { self.audioDebugExpectedPeakFrame = frame }
    public func dumpDebugCapture() {
        DispatchQueue.global(qos: .utility).async {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let url = docs.appendingPathComponent("au_debug_capture.raw")
            var data = Data(count: self.dbgBuffer.count * MemoryLayout<Float>.size)
            data.withUnsafeMutableBytes { ptr in
                _ = self.dbgBuffer.withUnsafeBytes { src in
                    memcpy(ptr.baseAddress, src.baseAddress!, self.dbgBuffer.count * MemoryLayout<Float>.size)
                }
            }
            try? data.write(to: url)
            AUv3Diagnostics.log("📝 AUv3: wrote debug capture to \(url.path)")
        }
    }
    public func setPlaybackPositionNormalized(_ pos: Float) {
        resetAudioPlaybackStartFrame()
        let p = max(0.0, min(1.0, pos))
    os_unfair_lock_lock(&fileLock)
        let total = min(fileAudioL.count, fileAudioR.count)
        if total > 0 {
            fileFrameIndex = Int(Double(total) * Double(p))
            pendingLoadPositionNormalized = nil
        } else {
            pendingLoadPositionNormalized = p
        }
    os_unfair_lock_unlock(&fileLock)
    // Apply a short fade-in after seek
    let sr = Int(getSampleRate() ?? 44100.0)
    fadeInTotal = max(128, min(sr / 100, 1024))
    fadeInSamplesRemaining = fadeInTotal
    }

    func consumePendingLoadPositionLocked(totalFrames: Int) -> Int {
        guard totalFrames > 0, let pending = pendingLoadPositionNormalized else {
            return 0
        }
        pendingLoadPositionNormalized = nil
        let p = max(0.0, min(0.9999, pending))
        return min(max(0, Int(Double(totalFrames) * Double(p))), max(0, totalFrames - 1))
    }

    func isSameLoadedAudioPath(_ currentPath: String?, _ requestedPath: String) -> Bool {
        guard let currentPath, !currentPath.isEmpty else { return false }
        if currentPath == requestedPath { return true }
        let requestedName = (requestedPath as NSString).lastPathComponent
        guard !requestedName.isEmpty else { return false }
        return currentPath.hasSuffix(requestedName)
    }

    public func scrubLocalFile(_ path: String, positionNormalized: Float, durationSeconds: Double) {
        let p = max(0.0, min(0.9999, positionNormalized))
        let previewDuration = max(0.04, min(0.35, durationSeconds))

        os_unfair_lock_lock(&fileLock)
        let total = min(fileAudioL.count, fileAudioR.count)
        let sameFile = loadedFilePath == path || (loadedFilePath?.hasSuffix((path as NSString).lastPathComponent) == true)
        let ready = sameFile && fileLoaded && total > 0
        let decodingSameFile = sameFile && isDecodingFile
        let previewStart = ready ? min(max(0, Int(Double(total) * Double(p))), max(0, total - 1)) : 0
        let previewFrames = ready ? max(1, min(total - previewStart, Int(previewDuration * max(1.0, fileSampleRate)))) : 0
        let previewL = ready ? Array(fileAudioL[previewStart..<(previewStart + previewFrames)]) : []
        let previewR = ready ? Array(fileAudioR[previewStart..<(previewStart + previewFrames)]) : []
        if ready {
            pendingScrubPreview = nil
        }
        os_unfair_lock_unlock(&fileLock)

        if !ready {
            pendingScrubPreview = (path: path, position: p, duration: previewDuration)
            if decodingSameFile {
                return
            }
            loadLocalFile(path)
            return
        }

        let frameCount = min(previewL.count, previewR.count)
        guard frameCount > 0 else { return }
        var interleaved = [Float](repeating: 0, count: frameCount * 2)
        let fadeFrames = max(16, min(frameCount / 3, Int((getSampleRate() ?? 44100.0) / 200.0)))
        for i in 0..<frameCount {
            var gain: Float = 1.0
            if i < fadeFrames {
                gain = Float(i) / Float(max(1, fadeFrames))
            } else if i >= frameCount - fadeFrames {
                gain = Float(frameCount - i) / Float(max(1, fadeFrames))
            }
            interleaved[i * 2] = previewL[i] * gain
            interleaved[i * 2 + 1] = previewR[i] * gain
        }
        os_unfair_lock_lock(&jsAudioLock)
        jsAudioBuffer = interleaved
        jsAudioPlaybackIndex = 0
        jsAudioSampleRate = fileSampleRate
        jsAudioActive = true
        os_unfair_lock_unlock(&jsAudioLock)
    }

    func consumePendingScrubPreviewIfNeeded(path: String) {
        guard let pending = pendingScrubPreview else { return }
        let sameFile = pending.path == path || pending.path.hasSuffix((path as NSString).lastPathComponent)
        guard sameFile else { return }
        pendingScrubPreview = nil
        DispatchQueue.main.async { [weak self] in
            self?.scrubLocalFile(pending.path, positionNormalized: pending.position, durationSeconds: pending.duration)
        }
    }


}
