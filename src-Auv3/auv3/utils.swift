//
//  utils.swift
//  auv3
//
//  Created by jeezs on 26/04/2022.
//

import AVFoundation
import Foundation
import CoreAudio
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

public class auv3Utils: AUAudioUnit {
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
    
    // NOUVEAU: JavaScript Audio Injection
    // Use a chunked queue to avoid large memmoves and reduce lock contention
    private var jsChunks: [[Float]] = []
    private var jsHeadOffset: Int = 0
    private var jsTotalQueued: Int = 0
    private var jsAudioSampleRate: Double = 48000
    private var jsAudioActive: Bool = false
    private let jsAudioLock = NSLock() // Thread safety for JS audio injection
    // Prebuffer threshold disabled by default to avoid added latency
    private var jsPrebufferThresholdSamples: Int = 0
    // Small scratch buffer to copy from shared JS buffer while holding the lock briefly
    private var jsScratch: [Float] = [Float](repeating: 0, count: 8192)
    // One-shot micro fade-in to prevent startup clicks on first frames after (re)start
    private let jsStartupFadeTotal: Int = 256
    private var jsFadeFramesRemaining: Int = 0

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
            
            // Generate test tone if active (lightweight math)
            if strongSelf.isTestToneActive {
                let sampleRate = strongSelf.getSampleRate() ?? 44100.0
                
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData {
                        let floatData = mData.assumingMemoryBound(to: Float.self)
                        let dataCount = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size
                        
                        for frame in 0..<dataCount {
                            strongSelf.testTonePhase += 2.0 * Double.pi * strongSelf.testToneFrequency / sampleRate
                            if strongSelf.testTonePhase >= 2.0 * Double.pi {
                                strongSelf.testTonePhase -= 2.0 * Double.pi
                            }
                            floatData[frame] = Float(sin(strongSelf.testTonePhase) * 0.5)
                        }
                    }
                }
            } else {
                // Normal audio processing
                guard let pullInputBlock = pullInputBlock else {
                    return kAudioUnitErr_NoConnection
                }

                var inputTimestamp = AudioTimeStamp()
                let inputBusNumber: Int = 0

                let inputStatus = pullInputBlock(actionFlags, &inputTimestamp, frameCount, inputBusNumber, outputData)

                if inputStatus != noErr {
                    return inputStatus
                }
            }

            // PERFORMANCE: Skip expensive logging in render thread
            // Audio logging moved to background processing if needed
            
            // ULTRA AGGRESSIVE: Skip most frames for visualization (only 1 in 16 frames processed)
            strongSelf.frameSkipCounter += 1
            if strongSelf.frameSkipCounter >= strongSelf.frameSkipAmount {
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
            strongSelf.mixJavaScriptAudio(bufferList: bufferList, frameCount: frameCount)

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
    // 1) Detect host sample rate
        let hostSampleRate = getSampleRate() ?? 44100.0

        // 2) Resample if needed (linear interpolation) OUTSIDE the lock to minimize contention
        var processedBuffer: [Float]
        if abs(sampleRate - hostSampleRate) > 1.0 {
            let ratio = hostSampleRate / sampleRate
            let newLength = Int(Double(audioData.count) * ratio)
            var tmp = [Float](repeating: 0, count: newLength)
            for i in 0..<newLength {
                let srcIndex = Double(i) / ratio
                let idx = Int(srcIndex)
                let frac = Float(srcIndex - Double(idx))
                if idx + 1 < audioData.count {
                    tmp[i] = audioData[idx] * (1 - frac) + audioData[idx + 1] * frac
                } else {
                    tmp[i] = audioData.last ?? 0
                }
            }
            processedBuffer = tmp
        } else {
            processedBuffer = audioData
        }

        // 3) Append incoming chunk; enable playback immediately (no added latency)
        jsAudioLock.lock()
        defer { jsAudioLock.unlock() }

        // If we were idle, arm a tiny fade-in to avoid a click on the very first frames
        if !jsAudioActive && jsChunks.isEmpty {
            jsFadeFramesRemaining = jsStartupFadeTotal
        }

        jsChunks.append(processedBuffer)
        jsTotalQueued &+= processedBuffer.count
        if !jsAudioActive { jsAudioActive = true }
        jsAudioSampleRate = hostSampleRate
    }
    
    /// Stop JavaScript audio playback
    public func stopJavaScriptAudio() {
        jsAudioLock.lock()
        defer { jsAudioLock.unlock() }
        
        jsAudioActive = false
    jsChunks.removeAll()
    jsHeadOffset = 0
    jsTotalQueued = 0
    jsFadeFramesRemaining = 0
        
        print("⏹️ AUv3: JS audio stopped")
    }
    
    /// Mix JavaScript audio into the output buffer (called from render thread)
    private func mixJavaScriptAudio(bufferList: AudioBufferListWrapper, frameCount: AUAudioFrameCount) {
        // Quick check without taking the lock
        guard jsAudioActive else { return }

        let gain: Float = 0.4 // Conservative mix gain
        var framesRemaining = Int(frameCount)
        var mixedOffset = 0

        while framesRemaining > 0 {
            var copied = 0
            // Copy from chunk queue while holding the lock very briefly
            jsAudioLock.lock()
            if jsChunks.isEmpty {
                jsAudioActive = false
                jsHeadOffset = 0
                jsTotalQueued = 0
                jsAudioLock.unlock()
                break
            }
            let head = jsChunks[0]
            let availableInHead = head.count - jsHeadOffset
            if availableInHead <= 0 {
                // Defensive: advance to next chunk
                jsChunks.removeFirst()
                jsHeadOffset = 0
                if jsChunks.isEmpty {
                    jsAudioActive = false
                    jsTotalQueued = 0
                    jsAudioLock.unlock()
                    break
                }
            }
            let toCopy = min(framesRemaining, min(jsScratch.count, jsChunks.isEmpty ? 0 : (jsChunks[0].count - jsHeadOffset)))
            if toCopy > 0 {
                let src = jsChunks[0]
                for i in 0..<toCopy { jsScratch[i] = src[jsHeadOffset + i] }
                jsHeadOffset += toCopy
                jsTotalQueued &-= toCopy
                if jsHeadOffset >= src.count {
                    jsChunks.removeFirst()
                    jsHeadOffset = 0
                }
                copied = toCopy
            }
            // If nothing was copied, no more data available
            if copied == 0 { jsAudioActive = false }
            let applyFade = jsFadeFramesRemaining
            jsAudioLock.unlock()

            if copied == 0 { break }

            // Mix the scratch chunk into all channels outside the lock
            for i in 0..<bufferList.numberOfBuffers {
                let buffer = bufferList.buffer(at: i)
                guard let outputData = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
                var outPtr = outputData.advanced(by: mixedOffset)

                if applyFade > 0 {
                    // One-shot micro fade-in over the first jsStartupFadeTotal frames after (re)start
                    let fadeTotal = jsStartupFadeTotal
                    // Compute how many fade frames have already been applied prior to this block
                    var fadeRemainingLocal = applyFade
                    var fadeIndexBase = fadeTotal - fadeRemainingLocal
                    for f in 0..<copied {
                        var factor: Float = 1.0
                        if fadeRemainingLocal > 0 {
                            let idx = min(fadeTotal - 1, fadeIndexBase)
                            factor = Float(idx + 1) / Float(fadeTotal)
                            fadeIndexBase += 1
                            fadeRemainingLocal -= 1
                        }
                        outPtr[f] += jsScratch[f] * gain * factor
                    }
                    // Update remaining fade count (outside lock but based on local snapshot)
                    jsAudioLock.lock()
                    jsFadeFramesRemaining = max(0, jsFadeFramesRemaining - copied)
                    jsAudioLock.unlock()
                } else {
                    for f in 0..<copied { outPtr[f] += jsScratch[f] * gain }
                }
            }

            mixedOffset += copied
            framesRemaining -= copied
        }
    }

    // MARK: - Audio Control Properties
    
    public var mute: Bool {
        get { return isMuted }
        set { isMuted = newValue }
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
