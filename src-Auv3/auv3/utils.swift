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
    private let visualizationUpdateInterval: CFTimeInterval = 1.0/5.0 // 5 FPS max for visualization
    
    // OPTIMIZATION: Pre-allocated buffers to avoid allocations in render thread
    private var preAllocatedVisualizationBuffer = [Float](repeating: 0, count: 64)
    private var preAllocatedTempArray = [NSNumber](repeating: 0, count: 64)

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
            
            // PERFORMANCE: Heavily throttled visualization (5 FPS max)
            if currentTime - strongSelf.lastVisualizationUpdate >= 0.2 { // 5 FPS instead of 15
                // Use pre-allocated buffer to avoid allocations
                if bufferList.numberOfBuffers > 0 {
                    let buffer = bufferList.buffer(at: 0) // Only process first buffer
                    if let inData = buffer.mData {
                        let floatData = inData.assumingMemoryBound(to: Float.self)
                        let count = min(Int(buffer.mDataByteSize) / MemoryLayout<Float>.size, strongSelf.audioBufferSize)
                        
                        // Simple peak detection instead of full processing
                        var peak: Float = 0
                        for i in stride(from: 0, to: count, by: 8) { // Sample every 8th element
                            peak = max(peak, abs(floatData[i]))
                        }
                        
                        // Background dispatch for UI updates
                        DispatchQueue.main.async {
                            strongSelf.audioDataDelegate?.didReceiveAudioData([peak], timestamp: Double(timestamp.pointee.mSampleTime))
                        }
                    }
                }
                strongSelf.lastVisualizationUpdate = currentTime
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
            
            // PERFORMANCE: Throttle transport checks to 10 FPS
            if currentTime - strongSelf.lastTransportCheck >= 0.1 {
                strongSelf.checkHostTransport()
                strongSelf.checkHostTempo()
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
        if let transportStateBlock = self.transportStateBlock {
            var transportStateChanged = AUHostTransportStateFlags(rawValue: 0)
            var currentSampleTime: Double = 0

            let success = transportStateBlock(&transportStateChanged,
                                          &currentSampleTime,
                                          nil,
                                          nil)
            if success {
                DispatchQueue.main.async {
                    if transportStateChanged.rawValue != 0 {
                        let isPlaying = transportStateChanged.rawValue & 2 != 0
                        
                        if isPlaying {
                            print("Transport is playing")
                        }
                        print("Playhead position: \(currentSampleTime)")
                        
                        if let sampleRate = self.getSampleRate() {
                            print("Sample Rate: \(sampleRate)")
                            
                            // Simple call to JavaScript function
                            if let webView = WebViewManager.webView {
                                let jsCode = "displayTransportInfo(\(isPlaying), \(currentSampleTime), \(sampleRate));"
                                webView.evaluateJavaScript(jsCode, completionHandler: nil)
                            }
                        }
                    }
                }
            }
        }
    }
  
    private func checkHostTempo() {
        guard let contextBlock = self.musicalContextBlock else {
            return
        }

        var tempo: Double = 0
        var timeSignatureNumerator: Double = 0
        var timeSignatureDenominator: Int = 0
        var currentBeatPosition: Double = 0
        var timeSignatureValid: Int = 0
        var tempoValid: Double = 0

        let success = contextBlock(
            &tempo,
            &timeSignatureNumerator,
            &timeSignatureDenominator,
            &currentBeatPosition,
            &timeSignatureValid,
            &tempoValid
        )

        if success {
            if timeSignatureValid != 0 {
                print("Tempo: \(tempo) BPM")
                print("Time Signature: \(Int(timeSignatureNumerator))/\(Int(timeSignatureDenominator))")
                print("Beat Position: \(currentBeatPosition)")
            }
        }
        else {
            print("Error: Could not retreive tempo or time signature")
        }
    }
    
    // MARK: - Bus Configuration
    
    override public var inputBusses: AUAudioUnitBusArray {
        // Safety check to prevent "invalid reuse after initialization failure"
        guard let busArray = _inputBusArray else {
            // Create a temporary empty bus array if initialization failed
            print("⚠️ Warning: Input bus array not properly initialized, creating temporary empty array")
            _ = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2) ?? AVAudioFormat()
            return AUAudioUnitBusArray(audioUnit: self, busType: .input, busses: [])
        }
        return busArray
    }

    override public var outputBusses: AUAudioUnitBusArray {
        // Safety check to prevent "invalid reuse after initialization failure"
        guard let busArray = _outputBusArray else {
            // Create a temporary empty bus array if initialization failed
            print("⚠️ Warning: Output bus array not properly initialized, creating temporary empty array")
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
            print("❌ Failed to create audio unit buses: \(error)")
            throw error
        }
    }

    // MARK: - MIDI Support
    
    public override var supportsMPE: Bool {
        return true
    }
    
    // Performance: Rate limiting for AUv3 MIDI logging
    private var lastAUv3MIDILog: CFTimeInterval = 0
    private let auv3MidiLogInterval: CFTimeInterval = 0.5 // 2 logs/second max
    
    // Performance: Rate limiting for transport checks
    private var lastTransportCheck: CFTimeInterval = 0
    
    // Process MIDI events from the render block
    private func processMIDIEvents(_ eventList: AURenderEvent) {
        var event: AURenderEvent? = eventList
        
        while let currentEvent = event {
            if currentEvent.head.eventType == .MIDI {
                let midiEvent = currentEvent.MIDI
                let midiData = withUnsafePointer(to: midiEvent.data) { ptr in
                    Array(UnsafeBufferPointer(start: ptr.withMemoryRebound(to: UInt8.self, capacity: Int(midiEvent.length)) { $0 }, 
                                            count: Int(midiEvent.length)))
                }
                
                // Rate-limited logging to reduce CPU overhead from string formatting
                let currentTime = CACurrentMediaTime()
                if currentTime - lastAUv3MIDILog >= auv3MidiLogInterval {
                    lastAUv3MIDILog = currentTime
                    print("🎹 AUv3 MIDI: \(midiData.count) bytes")
                }
                
                parseMIDIData(midiData)
            }
            
            event = currentEvent.head.next?.pointee
        }
    }
    
    private func parseMIDIData(_ data: [UInt8]) {
        guard data.count >= 1 else { return }
        
        let status = data[0] & 0xF0
        let channel = (data[0] & 0x0F) + 1
        let timestamp = Date().timeIntervalSince1970
        let currentTime = CACurrentMediaTime()
        
        // Send all MIDI data to JavaScript (3 bytes, padding with 0 if needed)
        let data1 = data.count > 0 ? data[0] : 0
        let data2 = data.count > 1 ? data[1] : 0
        let data3 = data.count > 2 ? data[2] : 0
        
        WebViewManager.sendMIDIToJS(data1: data1, data2: data2, data3: data3, timestamp: timestamp)
        
        switch status {
        case 0x90: // Note On
            if data.count >= 3 {
                let note = data[1]
                let velocity = data[2]
                // Reduced logging to save CPU
                if currentTime - lastAUv3MIDILog >= auv3MidiLogInterval {
                    if velocity > 0 {
                        print("🎵 AUv3 Note ON - Ch:\(channel), Note:\(note)")
                    } else {
                        print("🎵 AUv3 Note OFF - Ch:\(channel), Note:\(note)")
                    }
                }
            }
            
        case 0x80: // Note Off
            if data.count >= 3 {
                let note = data[1]
                let _ = data[2] // velocity not used in optimized logging
                // Rate-limited logging
                if currentTime - lastAUv3MIDILog >= auv3MidiLogInterval {
                    print("🎵 AUv3 Note OFF - Ch:\(channel), Note:\(note)")
                }
            }
            
        case 0xB0: // Control Change
            if data.count >= 3 {
                let controller = data[1]
                let _ = data[2] // value not used in optimized logging
                // Rate-limited logging for CC messages
                if currentTime - lastAUv3MIDILog >= auv3MidiLogInterval {
                    print("🎛️ AUv3 CC - Ch:\(channel), CC:\(controller)")
                }
            }
            
        default:
            // Rate-limited logging for unknown MIDI messages
            if currentTime - lastAUv3MIDILog >= auv3MidiLogInterval {
                print("❓ AUv3 Unknown MIDI")
            }
        }
    }

    // MARK: - Test Tone Control
    
    public func startTestTone(frequency: Double = 440.0) {
        isTestToneActive = true
        testToneFrequency = frequency
        testTonePhase = 0.0
    }
    
    public func stopTestTone() {
        isTestToneActive = false
    }
    
    public func updateTestToneFrequency(_ frequency: Double) {
        testToneFrequency = frequency
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
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestamp = dateFormatter.string(from: Date())
        let logPath = documentsPath.appendingPathComponent("audio_log_\(timestamp).raw")
        
        FileManager.default.createFile(atPath: logPath.path, contents: nil)
        audioLogger = try? FileHandle(forWritingTo: logPath)
        
        print("Started audio logging to: \(logPath.path)")
    }
    
    private func stopLogging() {
        audioLogger?.closeFile()
        audioLogger = nil
        print("Stopped audio logging")
    }
    
    // MARK: - Utility Methods
    
    func getSampleRate() -> Double? {
        // Safety check to prevent crashes if initialization failed
        guard let outputBusArray = _outputBusArray, outputBusArray.count > 0 else {
            print("⚠️ No output busses available or not properly initialized")
            return 44100.0 // Return default sample rate
        }
        return outputBusArray[0].format.sampleRate
    }
}
