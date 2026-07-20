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

// Protocol for transport data delegation
protocol TransportDataDelegate: AnyObject {
    func didReceiveTransportData(isPlaying: Bool, playheadPosition: Double, sampleRate: Double)
}

public class auv3Utils: AUAudioUnit, NativeAudioUnitControl {
    // MARK: - Properties
    
    var _outputBusArray: AUAudioUnitBusArray?
    var _inputBusArray: AUAudioUnitBusArray?
    var isMuted: Bool = false
    var audioLogger: FileHandle?
    var isLogging: Bool = false // PERFORMANCE: Disabled by default to save CPU
    
    // Test tone properties
    var isTestToneActive: Bool = false
    var testToneFrequency: Double = 440.0
    var testTonePhase: Double = 0.0
    // Minimal transport/mix controls
    var masterGain: Float = 1.0
    var playActive: Bool = false
    
    weak var transportDataDelegate: TransportDataDelegate?
    // Debug capture (tiny ring buffer for quick inspection)
    var dbgCaptureEnabled: Bool = false
    var dbgBuffer: [Float] = [Float](repeating: 0, count: 48000) // ~1s stereo mixed
    var dbgIndex: Int = 0

    enum RecordingState {
        case idle
        case recording
    }
    struct ExactPlaybackQuantum {
        let renderFrame: Int64
        let timelineFrame: Int64
        let playbackStartFrame: Int64
    }
    var recordingState: RecordingState = .idle
    var recordingSessionId: String = ""
    var recordingSource: String = "mic"
    var recordingFileName: String = ""
    var recordingSampleRate: Double = 0
    var recordingChannels: UInt32 = 0
    var recordingPath: String = ""
    var recordingRelativePath: String = ""
    var recordingClockId: String = ""
    var recordingRequireSampleAccurate: Bool = false
    var recordingInputLatencyFrames: Int64 = 0
    var recordingOutputLatencyFrames: Int64 = 0
    var recordingInputBuffer: AVAudioPCMBuffer?
    var recordingChannelPointers: [UnsafePointer<Float>?] = Array(repeating: nil, count: 8)
    let recordingScopeBinCount = 64
    var recordingScopeMinima = [Float](repeating: 0, count: 64)
    var recordingScopeMaxima = [Float](repeating: 0, count: 64)
    var recordingScopePairs = [Float](repeating: 0, count: 128)
    var recordingScopeLastSequence: UInt64 = 0
    var recordingScopeMonitorGeneration: UInt64 = 0
    let nativeRecorderBackend = AUv3NativeRecorderBackend()
    var micRecordingEngine: AVAudioEngine?
    
    // NOUVEAU: JavaScript Audio Injection
    var jsAudioBuffer: [Float] = []
    var jsAudioPlaybackIndex: Int = 0
    var jsAudioSampleRate: Double = 48000
    var jsAudioActive: Bool = false
    var jsAudioLock = os_unfair_lock() // Low-overhead lock for JS audio injection
    var audioDebugExpectedPeakFrame: Int? = nil
    var audioDebugRenderFrameCursor: Int64 = 0
    let audioRenderClockEpoch: String = UUID().uuidString
    var audioDebugPlaybackStartFrame: Int64? = nil
    var exactPlaybackStartFrame: Int64? = nil
    var audioDebugRecordingStartFrame: Int64? = nil
    var recordingTimelineOriginFrame: Int64? = nil
    var recordingExpectedRenderFrame: Int64? = nil
    var recordingExpectedTimelineFrame: Int64? = nil
    var recordingPlaybackObservedFrame: Int64? = nil
    var recordingStartedEventPending: Bool = false
    var recordingClockFailurePending: Bool = false
    var recordingRenderFailureLatched: Bool = false
    var recordingEventTimelineFrame: Int64? = nil
    var recordingEventRecordingFrame: Int64? = nil
    var recordingEventPlaybackFrame: Int64? = nil
    var recordingEventPlaybackObservedFrame: Int64? = nil
    var recordingEventLock = os_unfair_lock()
    var recordingTimingLock = os_unfair_lock()
    var playbackCurrentRenderFrame: Int64? = nil
    var playbackCurrentTimelineFrame: Int64? = nil
    var playbackExpectedRenderFrame: Int64? = nil
    var playbackExpectedTimelineFrame: Int64? = nil
    var playbackClockDiscontinuity: Bool = false
    var audioTimingLock = os_unfair_lock()
    var cachedTransportStateBlock: AUHostTransportStateBlock?
    // File playback through the native audio engine
    var loadedFilePath: String? = nil
    var pendingScrubPreview: (path: String, position: Float, duration: Double)? = nil
    var pendingLoadPositionNormalized: Float? = nil
    // Decoded audio buffers (non-interleaved float32, stereo)
    var fileAudioL: [Float] = []
    var fileAudioR: [Float] = []
    var fileSampleRate: Double = 44100.0
    var fileFrameIndex: Int = 0
    var fileLoaded: Bool = false
    var fileLock = os_unfair_lock() // Low-overhead lock for file state
    // Short fade-in to avoid click at start/seek
    var fadeInSamplesRemaining: Int = 0
    var fadeInTotal: Int = 0
    // Decode state to avoid tone while decoding and allow instant play-once data arrives
    var isDecodingFile: Bool = false
    var playWhenDecoded: Bool = false
    var didEmitReadyForPath: Set<String> = []
    var currentDecodeGen: Int = 0
    // Multi-slot: auxiliary audio slots for concurrent playback.
    // When a new file loads while another is playing, the current audio
    // is moved to an aux slot so both play simultaneously.
    class AuxAudioSlot {
        var audioL: [Float] = []
        var audioR: [Float] = []
        var frameIndex: Int = 0
        var loaded: Bool = false
        var slotId: String = ""
        var fadeInRemaining: Int = 0
        var fadeInTotal: Int = 0
    }
    var auxSlots: [AuxAudioSlot] = []
    static let maxAuxSlots = 7
    
    // Emit 'clip_ready' into JS when first PCM chunk is ready
    func emitClipReady(path: String) {
        if didEmitReadyForPath.contains(path) { return }
        didEmitReadyForPath.insert(path)
        let id = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        let js = """
        try{ if(typeof window.nativeAudioEvent==='function'){ window.nativeAudioEvent({ type:'clip_ready', payload: { clip_id: '\(id)', path: '\(path)' } }); }
             else { window.dispatchEvent(new CustomEvent('clip_ready', { detail: { clip_id: '\(id)', path: '\(path)' } })); } }catch(e){}
        """
        DispatchQueue.main.async {
            WebViewManager.evaluateJS(js, label: "auv3.clip_ready", priority: WebViewManager.IPCPriority.high)
        }
    }

    // Custom AudioBufferList wrapper
    struct AudioBufferListWrapper {
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
    
    // MARK: - Musical Context and Transport
    
    public override var musicalContextBlock: AUHostMusicalContextBlock? {
        get {
            return super.musicalContextBlock
        }
        set {
            super.musicalContextBlock = newValue
        }
    }

    public override var transportStateBlock: AUHostTransportStateBlock? {
        get { super.transportStateBlock }
        set {
            super.transportStateBlock = newValue
            cachedTransportStateBlock = newValue
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
    var lastAUv3MIDILog: CFTimeInterval = 0
    let auv3MidiLogInterval: CFTimeInterval = 2.0 // 0.5 logs/second max (ultra conservative)
    
    // Performance: Rate limiting for transport checks
    var lastTransportCheck: CFTimeInterval = 0
    
    // Process MIDI events from the render block
    func processMIDIEvents(_ eventList: AURenderEvent) {
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
    func parseMIDIDataDirect(_ dataPtr: UnsafePointer<UInt8>, length: Int) {
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
    
    func startLogging() {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        // ULTRA OPTIMIZATION: Simplified timestamp without date formatting
        let timestamp = Int(Date().timeIntervalSince1970)
        let logPath = documentsPath.appendingPathComponent("audio_log_\(timestamp).raw")
        
        FileManager.default.createFile(atPath: logPath.path, contents: nil)
        audioLogger = try? FileHandle(forWritingTo: logPath)
        
        // Silent logging initialization for performance
    }
    
    func stopLogging() {
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
    
}
