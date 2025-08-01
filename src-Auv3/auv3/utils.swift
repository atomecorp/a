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
    
    private var _outputBusArray: AUAudioUnitBusArray!
    private var _inputBusArray: AUAudioUnitBusArray!
    private var isMuted: Bool = false
    private var audioLogger: FileHandle?
    private var isLogging: Bool = false
    
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
    private var lastVisualizationUpdate: TimeInterval = 0
    private let visualizationUpdateInterval: TimeInterval = 1.0 / 30.0 // 30 FPS update rate

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
            
            // Process MIDI events first
            if let eventList = realtimeEventListHead?.pointee {
                strongSelf.processMIDIEvents(eventList)
            }
            
            let bufferList = AudioBufferListWrapper(ptr: outputData)
            
            // Generate test tone if active
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

            // Log audio data if logging is enabled
            if strongSelf.isLogging, let logger = strongSelf.audioLogger {
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let inData = buffer.mData {
                        let data = Data(bytes: inData, count: Int(buffer.mDataByteSize))
                        try? logger.write(contentsOf: data)
                    }
                }
            }

            // Process audio data for visualization with rate limiting
            let currentTime = CACurrentMediaTime()
            if currentTime - strongSelf.lastVisualizationUpdate >= strongSelf.visualizationUpdateInterval {
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let inData = buffer.mData {
                        let floatData = inData.assumingMemoryBound(to: Float.self)
                        let count = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size
                        
                        var visualizationData = [Float]()
                        let downsampleFactor = max(1, count / strongSelf.audioBufferSize)
                        
                        for i in stride(from: 0, to: count, by: downsampleFactor) {
                            let sum = (0..<downsampleFactor)
                                .map { j in i + j < count ? abs(floatData[i + j]) : 0 }
                                .reduce(0, +)
                            visualizationData.append(sum / Float(downsampleFactor))
                        }
                        
                        DispatchQueue.main.async {
                            strongSelf.audioDataDelegate?.didReceiveAudioData(visualizationData, timestamp: Double(timestamp.pointee.mSampleTime))
                        }
                    }
                }
                strongSelf.lastVisualizationUpdate = currentTime
            }

            // Handle muting
            if strongSelf.isMuted {
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData {
                        memset(mData, 0, Int(buffer.mDataByteSize))
                    }
                }
            }
            
            strongSelf.checkHostTransport()
            strongSelf.checkHostTempo()

            return noErr
        }
    }

    // MARK: - Musical Context and Transport
    
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
        return _inputBusArray
    }

    override public var outputBusses: AUAudioUnitBusArray {
        return _outputBusArray
    }

    // MARK: - Initialization

    public override init(componentDescription: AudioComponentDescription,
                         options: AudioComponentInstantiationOptions = []) throws {
        try super.init(componentDescription: componentDescription, options: options)

        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!

        _inputBusArray = AUAudioUnitBusArray(audioUnit: self,
                                             busType: .input,
                                             busses: [try AUAudioUnitBus(format: format)])

        _outputBusArray = AUAudioUnitBusArray(audioUnit: self,
                                              busType: .output,
                                              busses: [try AUAudioUnitBus(format: format)])
    }

    // MARK: - MIDI Support
    
    public override var supportsMPE: Bool {
        return true
    }
    
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
                
                print("🎹 AUv3 MIDI Event: \(midiData.map { String(format: "0x%02X", $0) }.joined(separator: ", "))")
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
                if velocity > 0 {
                    print("🎵 AUv3 Note ON  - Channel: \(channel), Note: \(note), Velocity: \(velocity)")
                } else {
                    print("🎵 AUv3 Note OFF - Channel: \(channel), Note: \(note) (velocity 0)")
                }
            }
            
        case 0x80: // Note Off
            if data.count >= 3 {
                let note = data[1]
                let velocity = data[2]
                print("🎵 AUv3 Note OFF - Channel: \(channel), Note: \(note), Velocity: \(velocity)")
            }
            
        case 0xB0: // Control Change
            if data.count >= 3 {
                let controller = data[1]
                let value = data[2]
                print("🎛️ AUv3 CC Change - Channel: \(channel), Controller: \(controller), Value: \(value)")
            }
            
        default:
            print("❓ AUv3 Unknown MIDI - Status: 0x\(String(format: "%02X", status))")
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
        guard outputBusses.count > 0 else {
            print("No output busses available")
            return nil
        }
        return outputBusses[0].format.sampleRate
    }
}
