//
//  utils.swift
//  auv3
//
//  Created by jeezs on 26/04/2022.
//

import AVFoundation
import CoreMedia
import Foundation
import CoreAudio
import Accelerate
import os.lock
import WebKit

// DEPRECATED — Legacy C FFI recording bridge
// These squirrel_recorder_core_* functions bypass the unified Kira/CPAL engine.
// Kept for AUv3 backward compatibility until native AUv3 recording
// is routed through the unified audio pipeline. Do NOT use for new features.

@_silgen_name("squirrel_recorder_core_start")
private func squirrel_recorder_core_start(_ path: UnsafePointer<CChar>,
                                          _ sampleRate: UInt32,
                                          _ channels: UInt16,
                                          _ source: UnsafePointer<CChar>,
                                          _ errOut: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>) -> Bool

@_silgen_name("squirrel_recorder_core_stop")
private func squirrel_recorder_core_stop(_ errOut: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
                                         _ outDurationSec: UnsafeMutablePointer<Double>) -> Bool

@_silgen_name("squirrel_recorder_core_push")
private func squirrel_recorder_core_push(_ data: UnsafePointer<UnsafePointer<Float>?>,
                                         _ channels: UInt16,
                                         _ frames: UInt32)

@_silgen_name("squirrel_recorder_core_push_interleaved")
private func squirrel_recorder_core_push_interleaved(_ data: UnsafePointer<Float>,
                                                     _ channels: UInt16,
                                                     _ frames: UInt32)

@_silgen_name("squirrel_string_free")
private func squirrel_string_free(_ s: UnsafeMutablePointer<CChar>?)


// File d'attente circulaire pour messages JS (évite blocage thread principal)

// Protocol for real-time audio data delegation
protocol AudioDataDelegate: AnyObject {
    func didReceiveAudioData(_ data: [Float], timestamp: Double)
}

// Protocol for transport data delegation
protocol TransportDataDelegate: AnyObject {
    func didReceiveTransportData(isPlaying: Bool, playheadPosition: Double, sampleRate: Double)
}

public class auv3Utils: AUAudioUnit, IPlugAUControl {
    // MARK: - Properties
    
    private var _outputBusArray: AUAudioUnitBusArray?
    private var _inputBusArray: AUAudioUnitBusArray?
    private var isMuted: Bool = false
    private var audioLogger: FileHandle?
    private var isLogging: Bool = false // PERFORMANCE: Disabled by default to save CPU
    
    // Test tone properties
    private var isTestToneActive: Bool = false
    private var testToneFrequency: Double = 440.0
    private var testTonePhase: Double = 0.0
    // Minimal transport/mix controls
    private var masterGain: Float = 1.0
    private var playActive: Bool = false
    
    // Audio visualization properties
    weak var audioDataDelegate: AudioDataDelegate?
    weak var transportDataDelegate: TransportDataDelegate?
    private let audioBufferSize = 1024
    private var audioBuffer = [Float](repeating: 0, count: 1024)
    private var bufferIndex = 0
    private var lastVisualizationUpdate: CFTimeInterval = 0
    private let visualizationUpdateInterval: CFTimeInterval = 1.0/2.0 // ULTRA AGGRESSIVE: 2 FPS max for visualization
    
    // OPTIMIZATION: Pre-allocated buffers to avoid allocations in render thread
    private var preAllocatedVisualizationBuffer = [Float](repeating: 0, count: 64)
    private var preAllocatedTempArray = [NSNumber](repeating: 0, count: 64)
    
    // ULTRA OPTIMIZATION: Skip frame counter for even more aggressive throttling
    private var frameSkipCounter: Int = 0
    private let frameSkipAmount: Int = 16 // Skip 15 out of 16 frames for visualization
    private var didLogOutputFormat: Bool = false
    // Debug capture (tiny ring buffer for quick inspection)
    private var dbgCaptureEnabled: Bool = false
    private var dbgBuffer: [Float] = [Float](repeating: 0, count: 48000) // ~1s stereo mixed
    private var dbgIndex: Int = 0

    private enum RecordingState {
        case idle
        case recording
    }
    private var recordingState: RecordingState = .idle
    private var recordingSessionId: String = ""
    private var recordingSource: String = "mic"
    private var recordingFileName: String = ""
    private var recordingSampleRate: Double = 0
    private var recordingChannels: UInt32 = 0
    private var recordingPath: String = ""
    private var recordingInputBuffer: AVAudioPCMBuffer?
    private var recordingChannelPointers: [UnsafePointer<Float>?] = Array(repeating: nil, count: 8)
    private var micRecordingEngine: AVAudioEngine?
    private var micRecordingFile: AVAudioFile?
    private var micRecordingFrames: AVAudioFramePosition = 0
    private var micRecordingPeak: Float = 0
    private var micRecordingLock = os_unfair_lock()
    
    // NOUVEAU: JavaScript Audio Injection
    private var jsAudioBuffer: [Float] = []
    private var jsAudioPlaybackIndex: Int = 0
    private var jsAudioSampleRate: Double = 48000
    private var jsAudioActive: Bool = false
    private var jsAudioLock = os_unfair_lock() // Low-overhead lock for JS audio injection
    private var audioDebugExpectedPeakFrame: Int? = nil
    private var audioDebugRenderFrameCursor: Int64 = 0
    private var audioDebugPlaybackStartFrame: Int64? = nil
    private var audioDebugRecordingStartFrame: Int64? = nil
    // File playback (placeholder for iPlug core integration)
    private var loadedFilePath: String? = nil
    private var pendingScrubPreview: (path: String, position: Float, duration: Double)? = nil
    private var pendingLoadPositionNormalized: Float? = nil
    // Decoded audio buffers (non-interleaved float32, stereo)
    private var fileAudioL: [Float] = []
    private var fileAudioR: [Float] = []
    private var fileSampleRate: Double = 44100.0
    private var fileFrameIndex: Int = 0
    private var fileLoaded: Bool = false
    private var fileLock = os_unfair_lock() // Low-overhead lock for file state
    // Short fade-in to avoid click at start/seek
    private var fadeInSamplesRemaining: Int = 0
    private var fadeInTotal: Int = 0
    // Decode state to avoid tone while decoding and allow instant play-once data arrives
    private var isDecodingFile: Bool = false
    private var playWhenDecoded: Bool = false
    private var didEmitReadyForPath: Set<String> = []
    private var currentDecodeGen: Int = 0
    // Multi-slot: auxiliary audio slots for concurrent playback.
    // When a new file loads while another is playing, the current audio
    // is moved to an aux slot so both play simultaneously.
    private class AuxAudioSlot {
        var audioL: [Float] = []
        var audioR: [Float] = []
        var frameIndex: Int = 0
        var loaded: Bool = false
        var slotId: String = ""
        var fadeInRemaining: Int = 0
        var fadeInTotal: Int = 0
    }
    private var auxSlots: [AuxAudioSlot] = []
    private static let maxAuxSlots = 7
    
    // Emit 'clip_ready' into JS when first PCM chunk is ready
    private func emitClipReady(path: String) {
        if didEmitReadyForPath.contains(path) { return }
        didEmitReadyForPath.insert(path)
        let id = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        let js = """
        try{ if(typeof window.__fromDSP==='function'){ window.__fromDSP({ type:'clip_ready', payload: { clip_id: '\(id)', path: '\(path)' } }); }
             else { window.dispatchEvent(new CustomEvent('clip_ready', { detail: { clip_id: '\(id)', path: '\(path)' } })); } }catch(e){}
        """
        DispatchQueue.main.async {
            WebViewManager.evaluateJS(js, label: "auv3.clip_ready", priority: WebViewManager.IPCPriority.high)
        }
    }

    // Custom AudioBufferList wrapper
    private struct AudioBufferListWrapper {
        let ptr: UnsafeMutablePointer<AudioBufferList>
        
        var numberOfBuffers: Int {
            Int(ptr.pointee.mNumberBuffers)
        }
        
        func buffer(at index: Int) -> AudioBuffer {
            precondition(index < numberOfBuffers)
            return withUnsafePointer(to: &ptr.pointee.mBuffers) { buffers in
                buffers.withMemoryRebound(to: AudioBuffer.self, capacity: numberOfBuffers) { reboundBuffers in
                    reboundBuffers[index]
                }
            }
        }
        
        mutating func setBuffer(at index: Int, _ buffer: AudioBuffer) {
            precondition(index < numberOfBuffers)
            withUnsafeMutablePointer(to: &ptr.pointee.mBuffers) { buffers in
                buffers.withMemoryRebound(to: AudioBuffer.self, capacity: numberOfBuffers) { reboundBuffers in
                    reboundBuffers[index] = buffer
                }
            }
        }
    }
    
    // MARK: - Audio Processing
    
    public override var internalRenderBlock: AUInternalRenderBlock {
        return { [weak self] actionFlags, timestamp, frameCount, outputBusNumber, outputData, realtimeEventListHead, pullInputBlock in
            guard let strongSelf = self else { return kAudioUnitErr_NoConnection }
            
            // Safety check: Ensure audio unit is properly initialized
            guard strongSelf._outputBusArray != nil, strongSelf._inputBusArray != nil else {
                // If not properly initialized, return silence to prevent "invalid reuse after initialization failure"
                let bufferList = AudioBufferListWrapper(ptr: outputData)
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData {
                        memset(mData, 0, Int(buffer.mDataByteSize))
                    }
                }
                return noErr
            }
            
            // PERFORMANCE: Reduce expensive operations in render thread
            let currentTime = CACurrentMediaTime()
            
            // Process MIDI events first (lightweight)
            if let eventList = realtimeEventListHead?.pointee {
                strongSelf.processMIDIEvents(eventList)
            }

            let bufferList = AudioBufferListWrapper(ptr: outputData)
            let renderStartFrame = strongSelf.audioDebugRenderFrameCursor
            // Determine output layout
            let outFormat = strongSelf._outputBusArray?[0].format
            let outChannels = Int(outFormat?.channelCount ?? 2)
            let outInterleaved = outFormat?.isInterleaved ?? false
            let outIsFloat32 = (outFormat?.commonFormat == .pcmFormatFloat32)
            if !strongSelf.didLogOutputFormat, let fmt = outFormat {
                strongSelf.didLogOutputFormat = true
                print("🔊 AUv3 out fmt: sr=\(fmt.sampleRate) ch=\(fmt.channelCount) interleaved=\(fmt.isInterleaved) common=\(fmt.commonFormat.rawValue) bytesPerFrame=\(fmt.streamDescription.pointee.mBytesPerFrame)")
                let bl = AudioBufferListWrapper(ptr: outputData)
                print("🔊 AUv3 out buffers: \(bl.numberOfBuffers)")
            }
            
            // File playback path (render decoded PCM if available)
            let hasAuxAudio = !strongSelf.auxSlots.isEmpty
            let renderMainSlot = strongSelf.playActive && strongSelf.fileLoaded
            let renderAuxOnly = strongSelf.playActive && hasAuxAudio && !renderMainSlot

            if renderMainSlot {
                let channels = outChannels
                let framesToWrite = Int(frameCount)
                // Snapshot state once per render to avoid per-sample locking
                os_unfair_lock_lock(&strongSelf.fileLock)
                let localL = strongSelf.fileAudioL
                let localR = strongSelf.fileAudioR
                let totalFrames = min(localL.count, localR.count)
                var idx = strongSelf.fileFrameIndex
                var fadeRem = strongSelf.fadeInSamplesRemaining
                let fadeTot = strongSelf.fadeInTotal
                os_unfair_lock_unlock(&strongSelf.fileLock)
                // Write depending on buffer layout
        if outInterleaved || bufferList.numberOfBuffers == 1 {
                    // interleaved: single buffer with LRLR...
                    let buffer = bufferList.buffer(at: 0)
                    if let mData = buffer.mData {
            let framesAvailable = framesToWrite
                        var localIdx = idx
                        for f in 0..<framesAvailable {
                            var sL: Float = (localIdx < totalFrames ? localL[localIdx] : 0)
                            var sR: Float = (channels > 1 ? (localIdx < totalFrames ? localR[localIdx] : 0) : (localIdx < totalFrames ? localL[localIdx] : 0))
                            if fadeRem > 0 && fadeTot > 0 {
                                let fi = Float(fadeTot - fadeRem)
                                let g = max(0.0, min(1.0, fi / Float(fadeTot)))
                                sL *= g; sR *= g; fadeRem &-= 1
                            }
                            sL *= strongSelf.masterGain
                            sR *= strongSelf.masterGain
                            if outIsFloat32 {
                                let out = mData.assumingMemoryBound(to: Float.self)
                                if channels == 1 { out[f] = sL }
                                else { out[f*channels + 0] = sL; out[f*channels + 1] = sR }
                            } else {
                                let outI16 = mData.assumingMemoryBound(to: Int16.self)
                                let cl = Int16(max(-1.0, min(1.0, sL)) * 32767.0)
                                if channels == 1 { outI16[f] = cl }
                                else {
                                    let cr = Int16(max(-1.0, min(1.0, sR)) * 32767.0)
                                    outI16[f*channels + 0] = cl
                                    outI16[f*channels + 1] = cr
                                }
                            }
                            localIdx &+= 1
                        }
                    }
                } else {
                    // planar: one buffer per channel
                    // Fast-path for Float32 planar: memcpy or vDSP scale when no fade
                    if outIsFloat32 {
                        let framesAvail = max(0, min(framesToWrite, totalFrames - idx))
                        // ch 0
                        if bufferList.numberOfBuffers > 0, let mData = bufferList.buffer(at: 0).mData {
                            let dst = mData.assumingMemoryBound(to: Float.self)
                            if fadeRem == 0 && abs(strongSelf.masterGain - 1.0) < 1e-4 {
                                localL.withUnsafeBufferPointer { srcPtr in
                                    let src = srcPtr.baseAddress!.advanced(by: idx)
                                    memcpy(dst, src, framesAvail * MemoryLayout<Float>.size)
                                }
                            } else {
                                localL.withUnsafeBufferPointer { srcPtr in
                                    let src = srcPtr.baseAddress!.advanced(by: idx)
                                    if fadeRem == 0 {
                                        var g = strongSelf.masterGain
                                        vDSP_vsmul(src, 1, &g, dst, 1, vDSP_Length(framesAvail))
                                    } else {
                                        // Fallback per-sample when fade active
                                        var localIdx = idx
                                        for f in 0..<framesToWrite {
                                            var v: Float = (localIdx < totalFrames ? srcPtr[localIdx] : 0)
                                            if fadeRem > 0 && fadeTot > 0 {
                                                let fi = Float(fadeTot - fadeRem)
                                                let gg = max(0.0, min(1.0, fi / Float(fadeTot)))
                                                v *= gg; fadeRem &-= 1
                                            }
                                            v *= strongSelf.masterGain
                                            dst[f] = v
                                            localIdx &+= 1
                                        }
                                    }
                                }
                            }
                        }
                        // ch 1
                        if channels > 1, bufferList.numberOfBuffers > 1, let mData1 = bufferList.buffer(at: 1).mData {
                            let dst1 = mData1.assumingMemoryBound(to: Float.self)
                            if fadeRem == 0 && abs(strongSelf.masterGain - 1.0) < 1e-4 {
                                localR.withUnsafeBufferPointer { srcPtr in
                                    let src = srcPtr.baseAddress!.advanced(by: idx)
                                    memcpy(dst1, src, framesAvail * MemoryLayout<Float>.size)
                                }
                            } else {
                                localR.withUnsafeBufferPointer { srcPtr in
                                    let src = srcPtr.baseAddress!.advanced(by: idx)
                                    if fadeRem == 0 {
                                        var g = strongSelf.masterGain
                                        vDSP_vsmul(src, 1, &g, dst1, 1, vDSP_Length(framesAvail))
                                    } else {
                                        var localIdx = idx
                                        for f in 0..<framesToWrite {
                                            var v: Float = (localIdx < totalFrames ? srcPtr[localIdx] : 0)
                                            if fadeRem > 0 && fadeTot > 0 {
                                                let fi = Float(fadeTot - fadeRem)
                                                let gg = max(0.0, min(1.0, fi / Float(fadeTot)))
                                                v *= gg; fadeRem &-= 1
                                            }
                                            v *= strongSelf.masterGain
                                            dst1[f] = v
                                            localIdx &+= 1
                                        }
                                    }
                                }
                            }
                        }
                        // Zero-fill tail if request > available
                        if framesAvail < framesToWrite {
                            for ch in 0..<min(bufferList.numberOfBuffers, channels) {
                                let buf = bufferList.buffer(at: ch)
                                if let mData = buf.mData {
                                    let dst = mData.assumingMemoryBound(to: Float.self)
                                    memset(dst.advanced(by: framesAvail), 0, (framesToWrite - framesAvail) * MemoryLayout<Float>.size)
                                }
                            }
                        }
                    } else {
                        // Fallback: original per-sample path (int16 or non-float)
                        for ch in 0..<min(bufferList.numberOfBuffers, channels) {
                            let buffer = bufferList.buffer(at: ch)
                            guard let mData = buffer.mData else { continue }
                            let dataCount = framesToWrite
                            var localIdx = idx
                            for f in 0..<dataCount {
                                let s: Float = (localIdx < totalFrames ? (ch == 0 ? localL[localIdx] : localR[localIdx]) : 0)
                                var v = s
                                if fadeRem > 0 && fadeTot > 0 {
                                    let fi = Float(fadeTot - fadeRem)
                                    let g = max(0.0, min(1.0, fi / Float(fadeTot)))
                                    v *= g; fadeRem &-= 1
                                }
                                v *= strongSelf.masterGain
                                let outI16 = mData.assumingMemoryBound(to: Int16.self)
                                outI16[f] = Int16(max(-1.0, min(1.0, v)) * 32767.0)
                                localIdx &+= 1
                            }
                        }
                    }
                }
                // Advance shared index and handle end-of-file
                os_unfair_lock_lock(&strongSelf.fileLock)
                idx &+= framesToWrite
                if idx >= min(localL.count, localR.count) {
                    idx = min(localL.count, localR.count) // clamp to EOF
                    // Only auto-stop if no aux slots still have audio
                    let auxActive = strongSelf.auxSlots.contains { slot in
                        slot.loaded && slot.frameIndex < min(slot.audioL.count, slot.audioR.count)
                    }
                    if !auxActive {
                        strongSelf.playActive = false
                    }
                    strongSelf.fadeInSamplesRemaining = 0
                }
                strongSelf.fileFrameIndex = idx
                strongSelf.fadeInSamplesRemaining = max(0, fadeRem)
                os_unfair_lock_unlock(&strongSelf.fileLock)
            } else if renderAuxOnly {
                // No main slot data but aux slots need to play — zero output first
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData { memset(mData, 0, Int(buffer.mDataByteSize)) }
                }
            } else if strongSelf.isTestToneActive {
                    let sampleRate = strongSelf.getSampleRate() ?? 44100.0
                    let ch = max(1, outChannels)
                    if outInterleaved || bufferList.numberOfBuffers == 1 {
                        let buffer = bufferList.buffer(at: 0)
                        if let mData = buffer.mData {
                            let frames = Int(frameCount)
                            for f in 0..<frames {
                                strongSelf.testTonePhase += 2.0 * Double.pi * strongSelf.testToneFrequency / sampleRate
                                if strongSelf.testTonePhase >= 2.0 * Double.pi { strongSelf.testTonePhase -= 2.0 * Double.pi }
                                let s = Float(sin(strongSelf.testTonePhase) * 0.25) * strongSelf.masterGain
                                if outIsFloat32 {
                                    let out = mData.assumingMemoryBound(to: Float.self)
                                    if ch == 1 { out[f] = s } else { out[f*ch+0] = s; out[f*ch+1] = s }
                                } else {
                                    let outI16 = mData.assumingMemoryBound(to: Int16.self)
                                    let si = Int16(max(-1.0, min(1.0, s)) * 32767.0)
                                    if ch == 1 { outI16[f] = si } else { outI16[f*ch+0] = si; outI16[f*ch+1] = si }
                                }
                            }
                        }
                    } else {
                        let buffers = min(bufferList.numberOfBuffers, ch)
                        for i in 0..<buffers {
                            let buffer = bufferList.buffer(at: i)
                            if let mData = buffer.mData {
                                let frames = Int(frameCount)
                                for f in 0..<frames {
                                    strongSelf.testTonePhase += 2.0 * Double.pi * strongSelf.testToneFrequency / sampleRate
                                    if strongSelf.testTonePhase >= 2.0 * Double.pi { strongSelf.testTonePhase -= 2.0 * Double.pi }
                                    let s = Float(sin(strongSelf.testTonePhase) * 0.25) * strongSelf.masterGain
                                    if outIsFloat32 {
                                        let out = mData.assumingMemoryBound(to: Float.self)
                                        out[f] = s
                                    } else {
                                        let outI16 = mData.assumingMemoryBound(to: Int16.self)
                                        outI16[f] = Int16(max(-1.0, min(1.0, s)) * 32767.0)
                                    }
                                }
                            }
                        }
                    }
            } else {
                // Passthrough path: pull upstream audio when we are idle
                if let pull = pullInputBlock {
                    let status = pull(actionFlags, timestamp, frameCount, outputBusNumber, outputData)
                    if status != noErr {
                        for i in 0..<bufferList.numberOfBuffers {
                            let buffer = bufferList.buffer(at: i)
                            if let mData = buffer.mData { memset(mData, 0, Int(buffer.mDataByteSize)) }
                        }
                    }
                } else {
                    for i in 0..<bufferList.numberOfBuffers {
                        let buffer = bufferList.buffer(at: i)
                        if let mData = buffer.mData { memset(mData, 0, Int(buffer.mDataByteSize)) }
                    }
                }
            }

            // Mix in auxiliary audio slots (concurrent playback)
            // Runs after main slot or aux-only zero-fill; ADDs samples on top.
            if (renderMainSlot || renderAuxOnly) && hasAuxAudio {
                os_unfair_lock_lock(&strongSelf.fileLock)
                let auxCopy = strongSelf.auxSlots
                os_unfair_lock_unlock(&strongSelf.fileLock)
                let framesToMix = Int(frameCount)
                let channels = outChannels
                for auxSlot in auxCopy where auxSlot.loaded {
                    let auxTotal = min(auxSlot.audioL.count, auxSlot.audioR.count)
                    let auxIdx = auxSlot.frameIndex
                    if auxIdx >= auxTotal { continue }
                    let mixFrames = min(framesToMix, auxTotal - auxIdx)
                    if outInterleaved || bufferList.numberOfBuffers == 1 {
                        let buffer = bufferList.buffer(at: 0)
                        if let mData = buffer.mData {
                            if outIsFloat32 {
                                let out = mData.assumingMemoryBound(to: Float.self)
                                for f in 0..<mixFrames {
                                    let sL = auxSlot.audioL[auxIdx + f] * strongSelf.masterGain
                                    let sR = (channels > 1 ? auxSlot.audioR[auxIdx + f] : auxSlot.audioL[auxIdx + f]) * strongSelf.masterGain
                                    if channels == 1 { out[f] += sL }
                                    else { out[f*channels + 0] += sL; out[f*channels + 1] += sR }
                                }
                            } else {
                                let out = mData.assumingMemoryBound(to: Int16.self)
                                for f in 0..<mixFrames {
                                    let sL = auxSlot.audioL[auxIdx + f] * strongSelf.masterGain
                                    let sR = (channels > 1 ? auxSlot.audioR[auxIdx + f] : auxSlot.audioL[auxIdx + f]) * strongSelf.masterGain
                                    if channels == 1 {
                                        let cur = Float(out[f]) / 32767.0
                                        out[f] = Int16(max(-1.0, min(1.0, cur + sL)) * 32767.0)
                                    } else {
                                        let curL = Float(out[f*channels + 0]) / 32767.0
                                        let curR = Float(out[f*channels + 1]) / 32767.0
                                        out[f*channels + 0] = Int16(max(-1.0, min(1.0, curL + sL)) * 32767.0)
                                        out[f*channels + 1] = Int16(max(-1.0, min(1.0, curR + sR)) * 32767.0)
                                    }
                                }
                            }
                        }
                    } else if outIsFloat32 {
                        if bufferList.numberOfBuffers > 0, let mData = bufferList.buffer(at: 0).mData {
                            let dst = mData.assumingMemoryBound(to: Float.self)
                            for f in 0..<mixFrames {
                                dst[f] += auxSlot.audioL[auxIdx + f] * strongSelf.masterGain
                            }
                        }
                        if channels > 1, bufferList.numberOfBuffers > 1, let mData1 = bufferList.buffer(at: 1).mData {
                            let dst1 = mData1.assumingMemoryBound(to: Float.self)
                            for f in 0..<mixFrames {
                                dst1[f] += auxSlot.audioR[auxIdx + f] * strongSelf.masterGain
                            }
                        }
                    }
                    auxSlot.frameIndex += framesToMix
                }
            }

            // PERFORMANCE: Skip expensive logging in render thread
            // Audio logging moved to background processing if needed
            
            // ULTRA AGGRESSIVE: Skip most frames for visualization (only 1 in 16 frames processed)
            strongSelf.frameSkipCounter += 1
            if strongSelf.audioDataDelegate != nil && strongSelf.frameSkipCounter >= strongSelf.frameSkipAmount {
                strongSelf.frameSkipCounter = 0
                
                // PERFORMANCE: Ultra-throttled visualization (2 FPS max + frame skipping)
                if currentTime - strongSelf.lastVisualizationUpdate >= 0.5 { // 2 FPS instead of 5
                    // Use pre-allocated buffer to avoid allocations
                    if bufferList.numberOfBuffers > 0 {
                        let buffer = bufferList.buffer(at: 0) // Only process first buffer
                        if let inData = buffer.mData {
                            let floatData = inData.assumingMemoryBound(to: Float.self)
                            let count = min(Int(buffer.mDataByteSize) / MemoryLayout<Float>.size, strongSelf.audioBufferSize)
                            
                            // Ultra-simplified peak detection - sample every 32nd element instead of 8th
                            var peak: Float = 0
                            for i in stride(from: 0, to: count, by: 32) { // Sample every 32nd element for ultra efficiency
                                peak = max(peak, abs(floatData[i]))
                            }
                            
                            // Background dispatch for UI updates (only if significant change)
                            if peak > 0.01 { // Only update if peak is significant
                                DispatchQueue.main.async {
                                    strongSelf.audioDataDelegate?.didReceiveAudioData([peak], timestamp: Double(timestamp.pointee.mSampleTime))
                                }
                            }
                        }
                    }
                    strongSelf.lastVisualizationUpdate = currentTime
                }
            }

            // NOUVEAU: Mix JavaScript audio into the output
            if strongSelf.jsAudioActive {
                strongSelf.mixJavaScriptAudio(bufferList: bufferList,
                                              frameCount: frameCount,
                                              renderStartFrame: renderStartFrame)
            }

            // Optional debug capture of ch0 (mix) at low cost
            if strongSelf.dbgCaptureEnabled, bufferList.numberOfBuffers > 0 {
                let buf = bufferList.buffer(at: 0)
                if let mData = buf.mData {
                    let inF = mData.assumingMemoryBound(to: Float.self)
                    let count = Int(buf.mDataByteSize) / MemoryLayout<Float>.size
                    var di = strongSelf.dbgIndex
                    for i in 0..<count {
                        strongSelf.dbgBuffer[di] = inF[i]
                        di &+= 1
                        if di >= strongSelf.dbgBuffer.count { di = 0 }
                    }
                    strongSelf.dbgIndex = di
                }
            }

            if strongSelf.recordingState == .recording {
                if strongSelf.recordingSource == "plugin" {
                    if strongSelf.audioDebugRecordingStartFrame == nil {
                        strongSelf.audioDebugRecordingStartFrame = renderStartFrame
                    }
                    strongSelf.captureRecordingOutput(bufferList: bufferList,
                                                      channels: outChannels,
                                                      frames: frameCount,
                                                      interleaved: outInterleaved,
                                                      isFloat32: outIsFloat32)
                } else if strongSelf.recordingSource == "mic" {
                    strongSelf.captureRecordingInput(pullInputBlock: pullInputBlock,
                                                     timestamp: timestamp,
                                                     frameCount: frameCount)
                }
            }

            // Handle muting (lightweight operation)
            if strongSelf.isMuted {
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData {
                        memset(mData, 0, Int(buffer.mDataByteSize))
                    }
                }
            }
            
            // Keep AUv3 host transport fresh enough for timeline and loop sync.
            if currentTime - strongSelf.lastTransportCheck >= 0.05 {
                if strongSelf.shouldPollTransport() { // nouvelle condition unifiée
                    strongSelf.checkHostTransport()
                }
                strongSelf.lastTransportCheck = currentTime
            }

            strongSelf.audioDebugRenderFrameCursor += Int64(frameCount)

            return noErr
        }
    }    // MARK: - Musical Context and Transport
    
    public override var musicalContextBlock: AUHostMusicalContextBlock? {
        get {
            return super.musicalContextBlock
        }
        set {
            super.musicalContextBlock = newValue
        }
    }
    // MARK: - Simple controls for WebView bridge
    public func setMasterGain(_ g: Float) { self.masterGain = max(0.0, g) }
    public func setPlayActive(_ on: Bool) {
        if on {
            pendingScrubPreview = nil
        }
        self.playActive = on
        // Prefer file playback when a file is loaded; fallback to test tone otherwise
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
        print("🎧 AUv3 playback state play=\(on) loaded=\(hasFile) decoding=\(isDecodingFile) aux=\(hasAux) frames=\(totalFrames) frameIndex=\(currentFrameIndex) tone=\(self.isTestToneActive)")
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
            print("📝 AUv3: wrote debug capture to \(url.path)")
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

    private func consumePendingLoadPositionLocked(totalFrames: Int) -> Int {
        guard totalFrames > 0, let pending = pendingLoadPositionNormalized else {
            return 0
        }
        pendingLoadPositionNormalized = nil
        let p = max(0.0, min(0.9999, pending))
        return min(max(0, Int(Double(totalFrames) * Double(p))), max(0, totalFrames - 1))
    }

    private func isSameLoadedAudioPath(_ currentPath: String?, _ requestedPath: String) -> Bool {
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

    private func consumePendingScrubPreviewIfNeeded(path: String) {
        guard let pending = pendingScrubPreview else { return }
        let sameFile = pending.path == path || pending.path.hasSuffix((path as NSString).lastPathComponent)
        guard sameFile else { return }
        pendingScrubPreview = nil
        DispatchQueue.main.async { [weak self] in
            self?.scrubLocalFile(pending.path, positionNormalized: pending.position, durationSeconds: pending.duration)
        }
    }

    public func recordStart(sessionId: String, fileName: String, source: String, sampleRate: Double?, channels: UInt32?) {
        if recordingState != .idle {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "Recording already in progress"
            ])
            return
        }

        let normalizedSource = normalizeRecordingSource(source)
        let safeName = sanitizeRecordingFileName(fileName)
        guard let url = resolveRecordingURL(fileName: safeName) else {
            emitRecordingEvent(type: "record_error", payload: [
                "session_id": sessionId,
                "error": "App Group container unavailable",
                "file_name": safeName
            ])
            return
        }

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
            print("ℹ️ AUv3: ignoring requested SR \(requestedSr), using host SR \(srDefault)")
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
                print("[AUV3_RECORD] mic_engine_start_ok session=\(sessionId) file=\(safeName) frames=0 peak=0.0")
            } catch {
                print("[AUV3_RECORD] mic_engine_start_error session=\(sessionId) file=\(safeName) error=\(error.localizedDescription)")
                emitRecordingEvent(type: "record_error", payload: [
                    "session_id": sessionId,
                    "error": error.localizedDescription,
                    "file_name": safeName
                ])
                return
            }
        } else {
            var errPtr: UnsafeMutablePointer<CChar>? = nil
            let ok = url.path.withCString { pathPtr in
                normalizedSource.withCString { srcPtr in
                    squirrel_recorder_core_start(pathPtr, UInt32(sr), UInt16(ch), srcPtr, &errPtr)
                }
            }

            if !ok {
                var message = "Recorder start failed"
                if let errPtr {
                    message = String(cString: errPtr)
                    squirrel_string_free(errPtr)
                }
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
        audioDebugRecordingStartFrame = nil

        recordingInputBuffer = nil

        recordingState = .recording

        let relativePath = "recordings/\(safeName)"
        print("[AUV3_RECORD] start_ok session=\(sessionId) file=\(safeName) source=\(normalizedSource) relative=\(relativePath) absolute=\(url.path) sample_rate=\(actualSampleRate) channels=\(actualChannels)")
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
        recordingState = .idle

        var duration: Double = 0
        var ok = true
        var stopErrorMessage = ""
        if activeSource == "mic" {
            let stats = stopMicRecordingEngine(sampleRate: activeSampleRate)
            duration = stats.duration
            print("[AUV3_RECORD] mic_engine_stop_ok session=\(activeSessionId) file=\(activeFileName) frames=\(stats.frames) peak=\(stats.peak)")
            if stats.frames <= 0 {
                ok = false
                stopErrorMessage = "audio_recording_empty"
            }
        } else {
            var errPtr: UnsafeMutablePointer<CChar>? = nil
            ok = squirrel_recorder_core_stop(&errPtr, &duration)
            if !ok {
                stopErrorMessage = "Recorder stop failed"
                if let errPtr {
                    stopErrorMessage = String(cString: errPtr)
                    squirrel_string_free(errPtr)
                }
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
            let relativePath = activeFileName.isEmpty ? "" : "recordings/\(activeFileName)"
            print("[AUV3_RECORD] stop_ok session=\(activeSessionId) file=\(activeFileName) source=\(activeSource) relative=\(relativePath) absolute=\(activePath) exists=\(fileExists) bytes=\(fileSize) duration=\(duration) analysis=\(String(describing: analysis))")
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
        audioDebugRecordingStartFrame = nil
        recordingInputBuffer = nil
    }

    private func normalizeRecordingSource(_ source: String) -> String {
        let raw = source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if raw == "plugin" || raw == "plugin_output" { return "plugin" }
        return "mic"
    }

    private func sanitizeRecordingFileName(_ input: String) -> String {
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

    private func resolveRecordingURL(fileName: String) -> URL? {
        guard let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SharedBus.appGroupSuite) else {
            return nil
        }
        let recordingsDir = base.appendingPathComponent("Documents").appendingPathComponent("recordings")
        do {
            try FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true)
        } catch {
            return nil
        }
        return recordingsDir.appendingPathComponent(fileName)
    }

    private func startMicRecordingEngine(url: URL) throws -> (sampleRate: Double, channels: Int) {
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
                print("[AUV3_RECORD] mic_engine_write_error file=\(url.lastPathComponent) error=\(error.localizedDescription)")
            }
        }
        engine.prepare()
        try engine.start()
        return (format.sampleRate, Int(format.channelCount))
    }

    private func stopMicRecordingEngine(sampleRate: Double) -> (frames: AVAudioFramePosition, peak: Float, duration: Double) {
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

    private func analyzeRecordedFile(at url: URL) -> [String: Any]? {
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
            print("⚠️ AUv3: failed to analyze recorded file at \(url.path): \(error.localizedDescription)")
            return nil
        }
    }

    private func emitRecordingEvent(type: String, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = """
        try{
          const payload = \(json);
          if(typeof window.__fromDSP==='function'){ window.__fromDSP({ type:'\(type)', payload }); }
          window.dispatchEvent(new CustomEvent('iplug_recording', { detail: Object.assign({ type:'\(type)' }, payload) }));
        }catch(e){}
        """
        DispatchQueue.main.async {
            WebViewManager.evaluateJS(js, label: "auv3.recording", priority: .high)
        }
    }

    private func captureRecordingInput(pullInputBlock: AURenderPullInputBlock?, timestamp: UnsafePointer<AudioTimeStamp>, frameCount: AUAudioFrameCount) {
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

    private func captureRecordingOutput(bufferList: AudioBufferListWrapper, channels: Int, frames: AUAudioFrameCount, interleaved: Bool, isFloat32: Bool) {
        pushRecordingBufferList(bufferList: bufferList,
                                channels: channels,
                                frames: frames,
                                interleaved: interleaved,
                                isFloat32: isFloat32)
    }

    private func pushRecordingBufferList(bufferList: AudioBufferListWrapper, channels: Int, frames: AUAudioFrameCount, interleaved: Bool, isFloat32: Bool) {
        if !isFloat32 { return }
        let ch = max(1, min(channels, recordingChannelPointers.count))
        if interleaved || bufferList.numberOfBuffers == 1 {
            let buf = bufferList.buffer(at: 0)
            guard let mData = buf.mData else { return }
            let ptr = mData.assumingMemoryBound(to: Float.self)
            squirrel_recorder_core_push_interleaved(ptr, UInt16(ch), UInt32(frames))
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
                squirrel_recorder_core_push(base, UInt16(ch), UInt32(frames))
            }
        }
    }
    
    private func checkHostTransport() {
        guard let tsBlock = self.transportStateBlock else { return }
        var flags = AUHostTransportStateFlags(rawValue: 0)
        var currentSampleTime: Double = 0
        var cycleStartBeat: Double = 0
        var cycleEndBeat: Double = 0
        if tsBlock(&flags, &currentSampleTime, &cycleStartBeat, &cycleEndBeat) {
            let isPlaying = (flags.rawValue & AUHostTransportStateFlags.moving.rawValue) != 0
            let sr = getSampleRate() ?? 44100.0
            var playheadSeconds = currentSampleTime / sr
            var displaySampleTime = currentSampleTime
            if let musicalBlock = self.musicalContextBlock {
                var tempo: Double = 0
                var numerator: Double = 0
                var denominator: Int = 0
                var beatPosition: Double = 0
                var sampleOffsetToNextBeat: Int = 0
                var measureDownbeat: Double = 0
                if musicalBlock(&tempo,
                                &numerator,
                                &denominator,
                                &beatPosition,
                                &sampleOffsetToNextBeat,
                                &measureDownbeat),
                   tempo > 0,
                   beatPosition.isFinite {
                    WebViewManager.updateCachedTempo(tempo)
                    playheadSeconds = max(0, beatPosition * 60.0 / tempo)
                    displaySampleTime = playheadSeconds * sr
                }
            }
            // Met à jour le cache central utilisé par les streams hostTimeUpdate / hostTransport
            WebViewManager.updateTransportCache(isPlaying: isPlaying, playheadSeconds: playheadSeconds)
            // Fallback direct pour Lyrix si les streams JS (ios_apis.js) ne sont pas présents
            DispatchQueue.main.async { [weak self] in
                let js = "(function(){if(typeof displayTransportInfo==='function'){try{displayTransportInfo(\(isPlaying ? "true":"false"),\(displaySampleTime),\(sr));}catch(e){}}else if(typeof updateTimecode==='function'){try{updateTimecode(\(playheadSeconds * 1000.0));}catch(e){}}})();"
                WebViewManager.evaluateJS(js,
                                          label: "auv3.transportFallback",
                                          priority: WebViewManager.IPCPriority.critical)
                self?.transportDataDelegate?.didReceiveTransportData(isPlaying: isPlaying, playheadPosition: displaySampleTime, sampleRate: sr)
            }
        }
    }
  
    // ULTRA OPTIMIZATION: Removed checkHostTempo() completely - not essential for core functionality
    // This eliminates expensive tempo and time signature queries that consume CPU
    
    // MARK: - Bus Configuration
    
    override public var inputBusses: AUAudioUnitBusArray {
        // Safety check to prevent "invalid reuse after initialization failure"
        guard let busArray = _inputBusArray else {
            // Create a temporary empty bus array if initialization failed - no logging for performance
            _ = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2) ?? AVAudioFormat()
            return AUAudioUnitBusArray(audioUnit: self, busType: .input, busses: [])
        }
        return busArray
    }

    override public var outputBusses: AUAudioUnitBusArray {
        // Safety check to prevent "invalid reuse after initialization failure"
        guard let busArray = _outputBusArray else {
            // Create a temporary empty bus array if initialization failed - no logging for performance
            _ = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2) ?? AVAudioFormat()
            return AUAudioUnitBusArray(audioUnit: self, busType: .output, busses: [])
        }
        return busArray
    }

    // MARK: - Initialization

    public override init(componentDescription: AudioComponentDescription,
                         options: AudioComponentInstantiationOptions = []) throws {
        try super.init(componentDescription: componentDescription, options: options)

        // Safer audio format creation with proper error handling
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2) else {
            throw NSError(domain: "auv3Utils", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create audio format"])
        }

        // Create bus arrays with proper error handling to prevent reuse after initialization failure
        do {
            let inputBus = try AUAudioUnitBus(format: format)
            let outputBus = try AUAudioUnitBus(format: format)
            
            _inputBusArray = AUAudioUnitBusArray(audioUnit: self,
                                                 busType: .input,
                                                 busses: [inputBus])

            _outputBusArray = AUAudioUnitBusArray(audioUnit: self,
                                                  busType: .output,
                                                  busses: [outputBus])
        } catch {
            // Silent error handling for performance
            throw error
        }
    }

    // MARK: - MIDI Support
    
    public override var supportsMPE: Bool {
        return true
    }
    
    // MIDI Output capabilities pour host discovery
    override public var midiOutputNames: [String] {
        return ["Atome MIDI Out"]
    }
    
    // Performance: Ultra-aggressive rate limiting for AUv3 MIDI logging
    private var lastAUv3MIDILog: CFTimeInterval = 0
    private let auv3MidiLogInterval: CFTimeInterval = 2.0 // 0.5 logs/second max (ultra conservative)
    
    // Performance: Rate limiting for transport checks
    private var lastTransportCheck: CFTimeInterval = 0
    
    // Process MIDI events from the render block
    private func processMIDIEvents(_ eventList: AURenderEvent) {
        var event: AURenderEvent? = eventList
        
        while let currentEvent = event {
            if currentEvent.head.eventType == .MIDI {
                let midiEvent = currentEvent.MIDI
                
                // ULTRA OPTIMIZATION: Skip expensive array creation for logging - only create when needed
                let currentTime = CACurrentMediaTime()
                if currentTime - lastAUv3MIDILog >= auv3MidiLogInterval {
                    lastAUv3MIDILog = currentTime
                    // No logging for maximum performance
                }
                
                // ULTRA OPTIMIZATION: Direct MIDI processing without intermediate array
                withUnsafePointer(to: midiEvent.data) { ptr in
                    ptr.withMemoryRebound(to: UInt8.self, capacity: Int(midiEvent.length)) { dataPtr in
                        if midiEvent.length >= 1 {
                            parseMIDIDataDirect(dataPtr, length: Int(midiEvent.length))
                        }
                    }
                }
            }
            
            event = currentEvent.head.next?.pointee
        }
    }
    
    // ULTRA OPTIMIZATION: Direct MIDI parsing without array allocation
    private func parseMIDIDataDirect(_ dataPtr: UnsafePointer<UInt8>, length: Int) {
        guard length >= 1 else { return }
        
        let data1 = dataPtr[0]
        let data2 = length > 1 ? dataPtr[1] : 0
        let data3 = length > 2 ? dataPtr[2] : 0
        
        // ULTRA OPTIMIZATION: Skip expensive timestamp calculation
        let timestamp = CACurrentMediaTime() // Use more efficient time source
        
        // ULTRA OPTIMIZATION: Batch WebView call without intermediate processing
        WebViewManager.sendMIDIToJS(data1: data1, data2: data2, data3: data3, timestamp: timestamp)
        
        // ULTRA OPTIMIZATION: Remove expensive status parsing and logging in render thread
        // All MIDI processing moved to background thread to save CPU in audio thread
    }

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
    private func mixJavaScriptAudio(bufferList: AudioBufferListWrapper, frameCount: AUAudioFrameCount, renderStartFrame: Int64) {
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

    // MARK: - Audio Control Properties
    
    public var mute: Bool {
        get { return isMuted }
        set { isMuted = newValue }
    }
    // MARK: - File loading (decode to PCM for playback)
    public func loadLocalFile(_ path: String) {
        loadLocalFile(path, startPositionNormalized: nil)
    }

    public func loadLocalFile(_ path: String, startPositionNormalized: Float?) {
        let requestedPosition = startPositionNormalized.map { max(0.0, min(0.9999, $0)) }
        var shouldStartDecode = true
        var gen = 0
        var logDecision: String = "decode_start"
        var logFrames = 0
        var logFrameIndex = 0
        var logDecoding = false
        var logLoaded = false

        os_unfair_lock_lock(&fileLock)
        let sameFile = isSameLoadedAudioPath(self.loadedFilePath, path)
        let currentTotal = min(self.fileAudioL.count, self.fileAudioR.count)
        if sameFile && self.isDecodingFile {
            if let requestedPosition {
                pendingLoadPositionNormalized = requestedPosition
            }
            shouldStartDecode = false
            logDecision = "same_file_decoding"
            logFrames = currentTotal
            logFrameIndex = self.fileFrameIndex
            logDecoding = true
            logLoaded = self.fileLoaded
        } else if sameFile && self.fileLoaded && currentTotal > 0 {
            if let requestedPosition {
                self.fileFrameIndex = min(max(0, Int(Double(currentTotal) * Double(requestedPosition))), max(0, currentTotal - 1))
                pendingLoadPositionNormalized = nil
            }
            shouldStartDecode = false
            logDecision = "same_file_ready"
            logFrames = currentTotal
            logFrameIndex = self.fileFrameIndex
            logDecoding = self.isDecodingFile
            logLoaded = true
        } else {
            pendingLoadPositionNormalized = nil
        }

        if shouldStartDecode {
            let previousPath = self.loadedFilePath
            // Preserve currently playing audio in an aux slot for concurrent playback
        if self.fileLoaded && self.fileFrameIndex < currentTotal && self.playActive {
            let aux = AuxAudioSlot()
            aux.audioL = self.fileAudioL
            aux.audioR = self.fileAudioR
            aux.frameIndex = self.fileFrameIndex
            aux.loaded = true
                aux.slotId = previousPath ?? "main"
            // Evict finished aux slots first
            self.auxSlots.removeAll { slot in
                slot.frameIndex >= min(slot.audioL.count, slot.audioR.count)
            }
            // Evict oldest if full
            if self.auxSlots.count >= Self.maxAuxSlots {
                self.auxSlots.removeFirst()
            }
            self.auxSlots.append(aux)
        }
        // Reset main slot state for new decode
            self.loadedFilePath = path
        self.fileLoaded = false
        self.fileFrameIndex = 0
        self.fileAudioL.removeAll(keepingCapacity: false)
        self.fileAudioR.removeAll(keepingCapacity: false)
            self.isDecodingFile = true
            self.currentDecodeGen &+= 1
            gen = self.currentDecodeGen
            logDecoding = true
            logLoaded = false
        }
        os_unfair_lock_unlock(&fileLock)

        print("🎧 AUv3 playback load request decision=\(logDecision) path=\(path) start=\(requestedPosition.map { String(format: "%.4f", $0) } ?? "nil") loaded=\(logLoaded) decoding=\(logDecoding) frames=\(logFrames) frameIndex=\(logFrameIndex)")

        if !shouldStartDecode {
            self.isTestToneActive = false
            return
        }

        self.didEmitReadyForPath.removeAll()
        self.isTestToneActive = false
        // Decode with highest priority to reduce latency
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            self?.decodeFile(at: path, gen: gen, startPositionNormalized: requestedPosition)
        }
    }

    private func decodeFile(at path: String, gen: Int, startPositionNormalized: Float?) {
        let exists = FileManager.default.fileExists(atPath: path)
        print("🔎 AUv3: decodeFile gen=\(gen) path=\(path) exists=\(exists) start=\(startPositionNormalized.map { String(format: "%.4f", $0) } ?? "nil")")
        let url = URL(fileURLWithPath: path)
        do {
            let srcFile = try AVAudioFile(forReading: url)
            let outSR = self.getSampleRate() ?? 44100.0
            if let startPositionNormalized, srcFile.length > 0 {
                let targetFrame = AVAudioFramePosition(Double(srcFile.length) * Double(startPositionNormalized))
                srcFile.framePosition = min(max(0, targetFrame), max(0, srcFile.length - 1))
            }
            guard let dstFormat = AVAudioFormat(standardFormatWithSampleRate: outSR, channels: 2) else {
                print("❌ AUv3: Failed to create destination format")
                return
            }
            let converter = AVAudioConverter(from: srcFile.processingFormat, to: dstFormat)
            guard let converter = converter else {
                print("❌ AUv3: AVAudioConverter init failed")
                return
            }

            let chunkFrames: AVAudioFrameCount = 4096
            let srcBuf = AVAudioPCMBuffer(pcmFormat: srcFile.processingFormat, frameCapacity: chunkFrames)!
            let dstBuf = AVAudioPCMBuffer(pcmFormat: dstFormat, frameCapacity: chunkFrames)!

            var outL: [Float] = []
            var outR: [Float] = []

            while true {
                try srcFile.read(into: srcBuf, frameCount: chunkFrames)
                if srcBuf.frameLength == 0 { break }
                var providedOnce = false
                dstBuf.frameLength = 0
                let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
                    if providedOnce || srcBuf.frameLength == 0 {
                        outStatus.pointee = .noDataNow
                        return nil
                    }
                    providedOnce = true
                    outStatus.pointee = .haveData
                    return srcBuf
                }
                let status = converter.convert(to: dstBuf, error: nil, withInputFrom: inputBlock)
                if status == .error || status == .endOfStream { break }
                let frames = Int(dstBuf.frameLength)
                if frames == 0 { continue }
                if let ch0 = dstBuf.floatChannelData?[0] {
                    outL.append(contentsOf: UnsafeBufferPointer(start: ch0, count: frames))
                }
                if dstFormat.channelCount > 1, let ch1 = dstBuf.floatChannelData?[1] {
                    outR.append(contentsOf: UnsafeBufferPointer(start: ch1, count: frames))
                } else {
                    // mono -> duplicate to R
                    outR.append(contentsOf: outL.suffix(frames))
                }
            }

            if gen == self.currentDecodeGen {
                os_unfair_lock_lock(&fileLock)
                self.fileAudioL = outL
                self.fileAudioR = outR
                self.fileSampleRate = outSR
                self.fileLoaded = !outL.isEmpty
                self.fileFrameIndex = 0
                os_unfair_lock_unlock(&fileLock)
            }
            if gen == self.currentDecodeGen {
                self.isDecodingFile = false
            }
            let decodedFrames = outL.count
            DispatchQueue.main.async {
                print("📥 AUv3: decoded file gen=\(gen) frames=\(decodedFrames) sr=\(Int(outSR))")
            }
            // AVAudioFile path decodes whole file; signal ready now if we have frames
            if gen == self.currentDecodeGen, self.fileLoaded {
                self.emitClipReady(path: path)
                self.consumePendingScrubPreviewIfNeeded(path: path)
            }
        } catch {
            // AVAudioFile often fails in AUv3 extensions (sandbox restrictions); AVAssetReader fallback is the normal path
            print("ℹ️ AUv3: AVAudioFile unavailable (\(error.localizedDescription)) — using AVAssetReader")
            decodeWithAssetReader(url: url, gen: gen, startPositionNormalized: startPositionNormalized)
        }
    }

    private func decodeWithAssetReader(url: URL, gen: Int, startPositionNormalized: Float?) {
        let outSR = self.getSampleRate() ?? 44100.0
        let asset = AVURLAsset(url: url)
        // Load audio track using modern API when available
        var track: AVAssetTrack?
        var assetDuration = CMTime.invalid
        if #available(iOS 16.0, *) {
            let sem = DispatchSemaphore(value: 0)
        Task {
                do {
                    let tracks = try await asset.load(.tracks)
                    assetDuration = try await asset.load(.duration)
            for t in tracks { if t.mediaType == .audio { track = t; break } }
                } catch {
                    // leave track as nil
                }
                sem.signal()
            }
            sem.wait()
        } else {
            track = asset.tracks(withMediaType: .audio).first
            assetDuration = asset.duration
        }
        guard let track else {
            print("❌ AUv3: no audio track in asset")
            if gen == self.currentDecodeGen {
                self.isDecodingFile = false
            }
            return
        }

        do {
            let reader = try AVAssetReader(asset: asset)
            let durationSeconds = CMTimeGetSeconds(assetDuration)
            let requestedStartSeconds = (startPositionNormalized != nil && durationSeconds.isFinite && durationSeconds > 0)
                ? max(0.0, min(durationSeconds * Double(startPositionNormalized ?? 0), max(0.0, durationSeconds - 0.001)))
                : 0.0
            if requestedStartSeconds > 0 {
                let startTime = CMTime(seconds: requestedStartSeconds, preferredTimescale: 600)
                reader.timeRange = CMTimeRange(start: startTime, duration: CMTime.positiveInfinity)
            }
            print("🎧 AUv3 asset reader start gen=\(gen) file=\(url.lastPathComponent) requestedStart=\(String(format: "%.4f", requestedStartSeconds)) duration=\(durationSeconds.isFinite ? String(format: "%.4f", durationSeconds) : "unknown")")
            // Request float32 PCM at host sample rate, stereo, interleaved
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVLinearPCMBitDepthKey: 32,
                AVLinearPCMIsFloatKey: true,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false,
                AVSampleRateKey: outSR,
                AVNumberOfChannelsKey: 2
            ]
            let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
            output.alwaysCopiesSampleData = false
            guard reader.canAdd(output) else {
                print("❌ AUv3: cannot add asset reader output")
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
                return
            }
            reader.add(output)
            guard reader.startReading() else {
                print("❌ AUv3: asset reader failed to start")
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
                return
            }

            var outL: [Float] = []
            var outR: [Float] = []
            var determinedChannels: Int? = nil
            var chunkCount = 0
            var reachedEOF = false
            // Prebuffer target ~200ms to start playback fast
            // Target ~50-100ms, but never less than 1024 frames
            let primeFrames = max(1024, min(Int(outSR * 0.05), 16384))
            var primed = false
            while reader.status == .reading {
                guard let sb = output.copyNextSampleBuffer() else { break }
                if let block = CMSampleBufferGetDataBuffer(sb) {
                    // Determine channel count from sample buffer's format description (non-deprecated)
                    if determinedChannels == nil, let fmt = CMSampleBufferGetFormatDescription(sb) {
                        if let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fmt)?.pointee {
                            determinedChannels = Int(asbd.mChannelsPerFrame)
                        }
                    }
                    let chCount = max(1, determinedChannels ?? 2)

                    let length = CMBlockBufferGetDataLength(block)
                    var data = Data(count: length)
                    data.withUnsafeMutableBytes { ptr in
                        _ = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: ptr.baseAddress!)
                    }
                    let floats = data.withUnsafeBytes { raw -> [Float] in
                        let p = raw.bindMemory(to: Float.self)
                        return Array(p)
                    }
                    if chunkCount < 3 {
                        print("📦 AUv3: asset reader chunk floats=\(floats.count) ch=\(chCount) bytes=\(length)")
                        chunkCount += 1
                    }
                    if chCount >= 2 {
                        // Interleaved LRLR...
                        let frames = floats.count / chCount
                        outL.reserveCapacity(outL.count + frames)
                        outR.reserveCapacity(outR.count + frames)
                        for i in 0..<frames {
                            outL.append(floats[i*chCount + 0])
                            outR.append(floats[i*chCount + 1])
                        }
                    } else {
                        outL.append(contentsOf: floats)
                        outR.append(contentsOf: floats)
                    }
                }
                CMSampleBufferInvalidate(sb)
                // Prime playback as soon as we have enough frames
                if !primed && outL.count >= primeFrames {
                    os_unfair_lock_lock(&fileLock)
                    if gen == self.currentDecodeGen {
                        self.fileAudioL = outL
                        self.fileAudioR = outR
                        self.fileSampleRate = outSR
                        self.fileFrameIndex = 0
                        self.fileLoaded = true
                    }
                    let primedFrames = min(self.fileAudioL.count, self.fileAudioR.count)
                    os_unfair_lock_unlock(&fileLock)
                    primed = true
                    DispatchQueue.main.async { print("🚀 AUv3: primed playback gen=\(gen) frames=\(primedFrames)") }
                    self.isTestToneActive = false
                    // First chunk ready -> notify JS for zero-wait play
                    if gen == self.currentDecodeGen {
                        self.emitClipReady(path: url.path)
                        self.consumePendingScrubPreviewIfNeeded(path: url.path)
                    }
                    // IMPORTANT: clear staging buffers so the next iteration only carries NEW data
                    outL.removeAll(keepingCapacity: true)
                    outR.removeAll(keepingCapacity: true)
                } else if primed {
                    // Stream-append more decoded data to shared buffers
                    if gen == self.currentDecodeGen {
                        os_unfair_lock_lock(&fileLock)
                        self.fileAudioL.append(contentsOf: outL)
                        self.fileAudioR.append(contentsOf: outR)
                        os_unfair_lock_unlock(&fileLock)
                    }
                    outL.removeAll(keepingCapacity: true)
                    outR.removeAll(keepingCapacity: true)
                }
            }
            if reader.status == .reading { reachedEOF = true }

            if reachedEOF && (!outL.isEmpty || primed) {
                print("ℹ️ AUv3: asset reader reached EOF with status 'reading'; committing decoded data")
                var totalFrames = 0
                if gen == self.currentDecodeGen {
                    os_unfair_lock_lock(&fileLock)
                    if primed {
                        self.fileAudioL.append(contentsOf: outL)
                        self.fileAudioR.append(contentsOf: outR)
                    } else {
                        self.fileAudioL = outL
                        self.fileAudioR = outR
                        self.fileLoaded = true
                    }
                    self.fileSampleRate = outSR
                    totalFrames = self.fileAudioL.count
                    if !primed {
                        self.fileFrameIndex = 0
                    }
                    os_unfair_lock_unlock(&fileLock)
                }
                let finalFrames = totalFrames
                DispatchQueue.main.async { print("📥 AUv3: decoded (asset reader, EOF) gen=\(gen) frames=\(finalFrames)") }
                self.isTestToneActive = false
                // Do not auto-start playback; wait for explicit 'play' param from UI
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
                return
            }

            switch reader.status {
            case .completed:
                var totalFrames = 0
                if gen == self.currentDecodeGen {
                    os_unfair_lock_lock(&fileLock)
                    if primed {
                        self.fileAudioL.append(contentsOf: outL)
                        self.fileAudioR.append(contentsOf: outR)
                    } else {
                        self.fileAudioL = outL
                        self.fileAudioR = outR
                        self.fileLoaded = !outL.isEmpty
                    }
                    self.fileSampleRate = outSR
                    totalFrames = self.fileAudioL.count
                    if !primed {
                        self.fileFrameIndex = 0
                    }
                    os_unfair_lock_unlock(&fileLock)
                }
                let finalFrames = totalFrames
                DispatchQueue.main.async { print("📥 AUv3: decoded (asset reader) gen=\(gen) frames=\(finalFrames)") }
                if outL.isEmpty {
                    // No decoded audio; keep silent (do not auto-enable test tone)
                    self.isTestToneActive = false
                } else {
                    // Decoded OK; keep playback stopped until UI requests play
                    self.isTestToneActive = false
                }
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
                if gen == self.currentDecodeGen, self.fileLoaded {
                    self.emitClipReady(path: url.path)
                    self.consumePendingScrubPreviewIfNeeded(path: url.path)
                }
            case .failed:
                print("❌ AUv3: asset reader failed: \(reader.error?.localizedDescription ?? "unknown error")")
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
            case .cancelled:
                print("⚠️ AUv3: asset reader cancelled")
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
            default:
                print("ℹ️ AUv3: asset reader finished with status=\(reader.status.rawValue)")
                self.isDecodingFile = false
            }
        } catch {
            print("❌ AUv3: asset reader error \(error.localizedDescription)")
            self.isDecodingFile = false
        }
    }
    
    public var logging: Bool {
        get { return isLogging }
        set {
            if newValue != isLogging {
                if newValue {
                    startLogging()
                } else {
                    stopLogging()
                }
                isLogging = newValue
            }
        }
    }
    
    // MARK: - Logging
    
    private func startLogging() {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        // ULTRA OPTIMIZATION: Simplified timestamp without date formatting
        let timestamp = Int(Date().timeIntervalSince1970)
        let logPath = documentsPath.appendingPathComponent("audio_log_\(timestamp).raw")
        
        FileManager.default.createFile(atPath: logPath.path, contents: nil)
        audioLogger = try? FileHandle(forWritingTo: logPath)
        
        // Silent logging initialization for performance
    }
    
    private func stopLogging() {
        audioLogger?.closeFile()
        audioLogger = nil
        // Silent logging termination for performance
    }
    
    // MARK: - Utility Methods
    
    func getSampleRate() -> Double? {
        // Safety check to prevent crashes if initialization failed
        guard let outputBusArray = _outputBusArray, outputBusArray.count > 0 else {
            // Silent error handling for performance
            return 44100.0 // Return default sample rate
        }
        return outputBusArray[0].format.sampleRate
    }
    
    private func shouldPollTransport() -> Bool {
        if self.transportDataDelegate != nil { return true }
        if WebViewManager.isHostTimeStreamActive() { return true }
        if WebViewManager.isHostTransportStreamActive() { return true }
        return false
    }
}
