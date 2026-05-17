//
//  AUv3PlaybackState.swift
//  auv3
//

import AVFoundation
import Foundation
import os.lock

extension auv3Utils {
    // MARK: - Simple controls for WebView bridge
    public func setMasterGain(_ g: Float) { self.masterGain = max(0.0, g) }
    public func setPlayActive(_ on: Bool) {
        if on {
            pendingScrubPreview = nil
        }
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
        os_unfair_lock_lock(&fileLock)
        auxSlots.removeAll { $0.slotId == slotId }
        // Also stop main slot if it matches
        if loadedFilePath == slotId || (loadedFilePath?.hasSuffix(slotId) == true) {
            fileFrameIndex = min(fileAudioL.count, fileAudioR.count)
        }
        os_unfair_lock_unlock(&fileLock)
    }
    public func clearAuxSlots() {
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
