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
    
    // NOUVEAU: JavaScript Audio Injection
    private var jsAudioBuffer: [Float] = []
    private var jsAudioPlaybackIndex: Int = 0
    private var jsAudioSampleRate: Double = 48000
    private var jsAudioActive: Bool = false
    private var jsAudioLock = os_unfair_lock() // Low-overhead lock for JS audio injection
    // File playback (placeholder for iPlug core integration)
    private var loadedFilePath: String? = nil
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
    private var didEmitReadyForPath: Set<String> = []
    private var currentDecodeGen: Int = 0
    
    // Emit 'clip_ready' into JS when first PCM chunk is ready
    private func emitClipReady(path: String) {
        if didEmitReadyForPath.contains(path) { return }
        didEmitReadyForPath.insert(path)
        let id = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        let js = """
        try{ if(typeof window.__fromDSP==='function'){ window.__fromDSP({ type:'clip_ready', payload: { clip_id: '\(id)', path: '\(path)' } }); }
             else { window.dispatchEvent(new CustomEvent('clip_ready', { detail: { clip_id: '\(id)', path: '\(path)' } })); } }catch(e){}
        """
        DispatchQueue.main.async { WebViewManager.webView?.evaluateJavaScript(js, completionHandler: nil) }
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
            if strongSelf.playActive && strongSelf.fileLoaded {
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
                    // Auto stop at end and prepare clean restart
                    strongSelf.playActive = false
                    strongSelf.fadeInSamplesRemaining = 0
                }
                strongSelf.fileFrameIndex = idx
                strongSelf.fadeInSamplesRemaining = max(0, fadeRem)
                os_unfair_lock_unlock(&strongSelf.fileLock)
            }
            // Generate test tone if active (lightweight math)
                else if strongSelf.isTestToneActive {
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
            if strongSelf.jsAudioActive { strongSelf.mixJavaScriptAudio(bufferList: bufferList, frameCount: frameCount) }

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

            // Handle muting (lightweight operation)
            if strongSelf.isMuted {
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData {
                        memset(mData, 0, Int(buffer.mDataByteSize))
                    }
                }
            }
            
            // PERFORMANCE: Ultra-throttle transport checks to 5 FPS (instead of 10 FPS)
            if currentTime - strongSelf.lastTransportCheck >= 0.2 {
                if strongSelf.shouldPollTransport() { // nouvelle condition unifiée
                    strongSelf.checkHostTransport()
                }
                strongSelf.lastTransportCheck = currentTime
            }

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
        self.playActive = on
        // Prefer file playback when a file is loaded; fallback to test tone otherwise
    os_unfair_lock_lock(&fileLock)
        let hasFile = fileLoaded
        if on && hasFile {
            // If we reached EOF previously, reset to the start so replay works without needing a jump
            let total = min(fileAudioL.count, fileAudioR.count)
            if fileFrameIndex >= total { fileFrameIndex = 0 }
        }
    os_unfair_lock_unlock(&fileLock)
        // Do not enable tone while we are decoding a file (reduces perceived latency/beeps)
        self.isTestToneActive = on && !hasFile && !isDecodingFile
        if on && hasFile {
            let sr = Int(getSampleRate() ?? 44100.0)
            fadeInTotal = max(128, min(sr / 100, 1024)) // ~10ms, clamped
            fadeInSamplesRemaining = fadeInTotal
        }
    }
    public func setTestToneActive(_ on: Bool) { self.isTestToneActive = on }
    public func setDebugCaptureEnabled(_ on: Bool) { self.dbgCaptureEnabled = on }
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
        fileFrameIndex = Int(Double(total) * Double(p))
    os_unfair_lock_unlock(&fileLock)
    // Apply a short fade-in after seek
    let sr = Int(getSampleRate() ?? 44100.0)
    fadeInTotal = max(128, min(sr / 100, 1024))
    fadeInSamplesRemaining = fadeInTotal
    }
    
    private func checkHostTransport() {
        guard let tsBlock = self.transportStateBlock else { return }
        var flags = AUHostTransportStateFlags(rawValue: 0)
        var currentSampleTime: Double = 0
        if tsBlock(&flags, &currentSampleTime, nil, nil) {
            let isPlaying = (flags.rawValue & AUHostTransportStateFlags.moving.rawValue) != 0
            let sr = getSampleRate() ?? 44100.0
            // Met à jour le cache central utilisé par les streams hostTimeUpdate / hostTransport
            WebViewManager.updateTransportCache(isPlaying: isPlaying, playheadSeconds: currentSampleTime / sr)
            // Fallback direct pour Lyrix si les streams JS (ios_apis.js) ne sont pas présents
            DispatchQueue.main.async { [weak self] in
                let js = "(function(){if(typeof displayTransportInfo==='function'){try{displayTransportInfo(\(isPlaying ? "true":"false"),\(currentSampleTime),\(sr));}catch(e){}}else if(typeof updateTimecode==='function'){try{updateTimecode(\(currentSampleTime / sr * 1000.0));}catch(e){}}})();"
                WebViewManager.webView?.evaluateJavaScript(js, completionHandler: nil)
                self?.transportDataDelegate?.didReceiveTransportData(isPlaying: isPlaying, playheadPosition: currentSampleTime, sampleRate: sr)
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
    public func injectJavaScriptAudio(_ audioData: [Float], sampleRate: Double, duration: Double) {
    os_unfair_lock_lock(&jsAudioLock)
    defer { os_unfair_lock_unlock(&jsAudioLock) }

        // 1) Detect host sample rate
        let hostSampleRate = getSampleRate() ?? 44100.0
        var processedBuffer: [Float] = audioData

        // 2) Resample if needed (linear interpolation)
        if abs(sampleRate - hostSampleRate) > 1.0 {
            let ratio = hostSampleRate / sampleRate
            let newLength = Int(Double(audioData.count) * ratio)
            processedBuffer = [Float](repeating: 0, count: newLength)
            for i in 0..<newLength {
                let srcIndex = Double(i) / ratio
                let idx = Int(srcIndex)
                let frac = Float(srcIndex - Double(idx))
                if idx + 1 < audioData.count {
                    processedBuffer[i] = audioData[idx] * (1 - frac) + audioData[idx + 1] * frac
                } else {
                    processedBuffer[i] = audioData.last ?? 0
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
        
        print("⏹️ AUv3: JS audio stopped")
    }
    
    /// Mix JavaScript audio into the output buffer (called from render thread)
    private func mixJavaScriptAudio(bufferList: AudioBufferListWrapper, frameCount: AUAudioFrameCount) {
    guard jsAudioActive, !jsAudioBuffer.isEmpty, os_unfair_lock_trylock(&jsAudioLock) else { return }
    defer { os_unfair_lock_unlock(&jsAudioLock) }

        let gain: Float = 0.4 // Conservative mix gain
        let framesToProcess = min(Int(frameCount), jsAudioBuffer.count - jsAudioPlaybackIndex)
        for i in 0..<bufferList.numberOfBuffers {
            let buffer = bufferList.buffer(at: i)
            guard let outputData = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
            // Mix the same JS segment into all channels
            for frame in 0..<framesToProcess {
                if jsAudioPlaybackIndex + frame < jsAudioBuffer.count {
                    outputData[frame] += jsAudioBuffer[jsAudioPlaybackIndex + frame] * gain
                }
            }
        }
        jsAudioPlaybackIndex += framesToProcess
        // Stop when we've played all the JavaScript audio
        if jsAudioPlaybackIndex >= jsAudioBuffer.count {
            jsAudioActive = false
            jsAudioBuffer.removeAll()
            jsAudioPlaybackIndex = 0
            // print("🎵 AUv3: JS audio playback completed")
// File d'attente circulaire pour messages JS (évite blocage thread principal)

// File d'attente circulaire pour messages JS (évite blocage thread principal)
        }
    }

    // MARK: - Audio Control Properties
    
    public var mute: Bool {
        get { return isMuted }
        set { isMuted = newValue }
    }
    // MARK: - File loading (decode to PCM for playback)
    public func loadLocalFile(_ path: String) {
        self.loadedFilePath = path
        // Reset state for new decode
    os_unfair_lock_lock(&fileLock)
        self.fileLoaded = false
        self.fileFrameIndex = 0
        self.fileAudioL.removeAll(keepingCapacity: false)
        self.fileAudioR.removeAll(keepingCapacity: false)
    os_unfair_lock_unlock(&fileLock)
        self.isDecodingFile = true
        self.didEmitReadyForPath.removeAll()
        self.currentDecodeGen &+= 1
        let gen = self.currentDecodeGen
        self.isTestToneActive = false
        // Decode with highest priority to reduce latency
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            self?.decodeFile(at: path, gen: gen)
        }
    }

    private func decodeFile(at path: String, gen: Int) {
    print("🔎 AUv3: decodeFile path=\(path) exists=\(FileManager.default.fileExists(atPath: path))")
    let url = URL(fileURLWithPath: path)
        do {
            let srcFile = try AVAudioFile(forReading: url)
            let outSR = self.getSampleRate() ?? 44100.0
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
                self.fileFrameIndex = 0
                self.fileLoaded = !outL.isEmpty
                os_unfair_lock_unlock(&fileLock)
            }
            self.isDecodingFile = false
            DispatchQueue.main.async {
                print("📥 AUv3: decoded file (frames=\(outL.count), sr=\(Int(outSR)))")
            }
            // AVAudioFile path decodes whole file; signal ready now if we have frames
            if gen == self.currentDecodeGen, self.fileLoaded { self.emitClipReady(path: path) }
        } catch {
            print("❌ AUv3: decode error \(error.localizedDescription) — trying AVAssetReader fallback")
            decodeWithAssetReader(url: url, gen: gen)
        }
    }

    private func decodeWithAssetReader(url: URL, gen: Int) {
        let outSR = self.getSampleRate() ?? 44100.0
        let asset = AVURLAsset(url: url)
        // Load audio track using modern API when available
        var track: AVAssetTrack?
        if #available(iOS 16.0, *) {
            let sem = DispatchSemaphore(value: 0)
        Task {
                do {
                    let tracks = try await asset.load(.tracks)
            for t in tracks { if t.mediaType == .audio { track = t; break } }
                } catch {
                    // leave track as nil
                }
                sem.signal()
            }
            sem.wait()
        } else {
            track = asset.tracks(withMediaType: .audio).first
        }
        guard let track else {
            print("❌ AUv3: no audio track in asset")
            return
        }

        do {
            let reader = try AVAssetReader(asset: asset)
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
            guard reader.canAdd(output) else { print("❌ AUv3: cannot add asset reader output"); return }
            reader.add(output)
            guard reader.startReading() else { print("❌ AUv3: asset reader failed to start"); return }

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
                    os_unfair_lock_unlock(&fileLock)
                    primed = true
                    DispatchQueue.main.async { print("🚀 AUv3: primed playback (\(outL.count) frames)") }
                    self.isTestToneActive = false
                    // First chunk ready -> notify JS for zero-wait play
                    if gen == self.currentDecodeGen { self.emitClipReady(path: url.path) }
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

            if reachedEOF && (!outL.isEmpty) {
                print("ℹ️ AUv3: asset reader reached EOF with status 'reading'; committing decoded data")
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
                    self.fileFrameIndex = 0
                    os_unfair_lock_unlock(&fileLock)
                }
                DispatchQueue.main.async { print("📥 AUv3: decoded (asset reader, EOF) frames=\(outL.count)") }
                self.isTestToneActive = false
                // Do not auto-start playback; wait for explicit 'play' param from UI
                self.isDecodingFile = false
                return
            }

            switch reader.status {
            case .completed:
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
                    self.fileFrameIndex = 0
                    os_unfair_lock_unlock(&fileLock)
                }
                DispatchQueue.main.async { print("📥 AUv3: decoded (asset reader) frames=\(outL.count)") }
                if outL.isEmpty {
                    // No decoded audio; keep silent (do not auto-enable test tone)
                    self.isTestToneActive = false
                } else {
                    // Decoded OK; keep playback stopped until UI requests play
                    self.isTestToneActive = false
                }
                self.isDecodingFile = false
                if gen == self.currentDecodeGen, self.fileLoaded { self.emitClipReady(path: url.path) }
            case .failed:
                print("❌ AUv3: asset reader failed: \(reader.error?.localizedDescription ?? "unknown error")")
                self.isDecodingFile = false
            case .cancelled:
                print("⚠️ AUv3: asset reader cancelled")
                self.isDecodingFile = false
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
