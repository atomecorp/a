//
//  AUv3JavaScriptAudio.swift
//  auv3
//

import AVFoundation
import Foundation
import os.lock

extension auv3Utils {
    // MARK: - JavaScript Audio Injection
    
    /// Inject JavaScript-generated audio into the AUv3 pipeline
    /// audioData is interleaved stereo: [L0, R0, L1, R1, ...]
    public func injectJavaScriptAudio(_ audioData: [Float], sampleRate: Double, duration: Double) {
    os_unfair_lock_lock(&jsAudioLock)
    defer { os_unfair_lock_unlock(&jsAudioLock) }
        audioDebugPlaybackStartFrame = nil

        // 1) Detect host sample rate
        let hostSampleRate = getSampleRate() ?? 44100.0
        var processedBuffer: [Float] = audioData

        // 2) Resample if needed — operate per-channel to preserve interleaving
        if abs(sampleRate - hostSampleRate) > 1.0 {
            let ratio = hostSampleRate / sampleRate
            let srcFrames = audioData.count / 2
            let dstFrames = Int(Double(srcFrames) * ratio)
            processedBuffer = [Float](repeating: 0, count: dstFrames * 2)
            for ch in 0..<2 {
                for i in 0..<dstFrames {
                    let srcIndex = Double(i) / ratio
                    let idx = Int(srcIndex)
                    let frac = Float(srcIndex - Double(idx))
                    let s0 = idx < srcFrames ? audioData[idx * 2 + ch] : (audioData.last ?? 0)
                    let s1 = (idx + 1) < srcFrames ? audioData[(idx + 1) * 2 + ch] : s0
                    processedBuffer[i * 2 + ch] = s0 * (1 - frac) + s1 * frac
                }
            }
        }

        // 3) Append incoming chunk instead of replacing the whole buffer
        //    Drop already-played samples to keep buffer small
        if jsAudioActive && !jsAudioBuffer.isEmpty {
            if jsAudioPlaybackIndex > 0 && jsAudioPlaybackIndex < jsAudioBuffer.count {
                jsAudioBuffer.removeFirst(jsAudioPlaybackIndex)
            } else if jsAudioPlaybackIndex >= jsAudioBuffer.count {
                jsAudioBuffer.removeAll()
            }
            jsAudioPlaybackIndex = 0
            jsAudioBuffer.append(contentsOf: processedBuffer)
        } else {
            jsAudioBuffer = processedBuffer
            jsAudioPlaybackIndex = 0
            jsAudioActive = true
        }
        jsAudioSampleRate = hostSampleRate
    }
    
    /// Stop JavaScript audio playback
    public func stopJavaScriptAudio() {
    os_unfair_lock_lock(&jsAudioLock)
    defer { os_unfair_lock_unlock(&jsAudioLock) }
        
        jsAudioActive = false
        jsAudioBuffer.removeAll()
        jsAudioPlaybackIndex = 0
        audioDebugPlaybackStartFrame = nil
    }
    
    /// Mix JavaScript audio into the output buffer (called from render thread)
    /// JS sends interleaved stereo: [L0, R0, L1, R1, ...] so buffer holds 2 samples per frame.
    func mixJavaScriptAudio(bufferList: AudioBufferListWrapper, frameCount: AUAudioFrameCount, renderStartFrame: Int64) {
    guard jsAudioActive, !jsAudioBuffer.isEmpty, os_unfair_lock_trylock(&jsAudioLock) else { return }
    defer { os_unfair_lock_unlock(&jsAudioLock) }

        if jsAudioPlaybackIndex == 0 && audioDebugPlaybackStartFrame == nil {
            audioDebugPlaybackStartFrame = renderStartFrame
        }

        let gain: Float = 1.0
        let numChannels = bufferList.numberOfBuffers
        // Each frame occupies 2 interleaved samples (L + R)
        let interleavedStride = 2
        let samplesRemaining = jsAudioBuffer.count - jsAudioPlaybackIndex
        let framesToProcess = min(Int(frameCount), samplesRemaining / interleavedStride)

        for ch in 0..<numChannels {
            let buffer = bufferList.buffer(at: ch)
            guard let outputData = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
            // Channel 0 = even indices (L), Channel 1 = odd indices (R)
            // If more than 2 output channels, extra channels get the L channel
            let channelOffset = min(ch, interleavedStride - 1)
            for frame in 0..<framesToProcess {
                let srcIdx = jsAudioPlaybackIndex + frame * interleavedStride + channelOffset
                if srcIdx < jsAudioBuffer.count {
                    outputData[frame] += jsAudioBuffer[srcIdx] * gain
                }
            }
        }
        jsAudioPlaybackIndex += framesToProcess * interleavedStride
        // Stop when we've played all the JavaScript audio
        if jsAudioPlaybackIndex >= jsAudioBuffer.count {
            jsAudioActive = false
            jsAudioBuffer.removeAll()
            jsAudioPlaybackIndex = 0
        }
    }


}
