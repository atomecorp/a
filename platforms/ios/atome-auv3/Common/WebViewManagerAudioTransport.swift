import Foundation
import OSLog
import QuartzCore

extension WebViewManager {
    func handleSwiftBridgeMessage(type: String, data: Any) {
        switch type {
        case "audioBuffer_bin":
            // Optimisation : réception ArrayBuffer natif (binaire)
            if let data = data as? Data {
                let sampleCount = data.count / 4
                var floatArray = [Float](repeating: 0, count: sampleCount)
                _ = floatArray.withUnsafeMutableBytes { data.copyBytes(to: $0) }
                let sampleRate: Double = 44100
                let duration: Double = Double(sampleCount) / sampleRate
                DispatchQueue.global(qos: .userInitiated).async {
                    WebViewManager.audioController?.injectJavaScriptAudio(floatArray, sampleRate: sampleRate, duration: duration)
                }
            }
            return
        case "log":
            if let message = data as? String {
                WebViewManager.shared.log.debug("JS Log: \(message, privacy: .public)")
            }
            
        case "toggleMute":
            WebViewManager.audioController?.toggleMute()
            sendMuteStateToJS()
            
        case "audioNote":
            if let data = data as? [String: Any] {
                handleAudioCommand(command: data["command"] as? String ?? "", data: data)
            }
            
        case "noteCommand":
            if let data = data as? [String: Any] {
                handleAudioCommand(command: data["command"] as? String ?? "", data: data)
            }
            
        case "chordCommand":
            if let data = data as? [String: Any] {
                handleAudioChord(data: data)
            }
            
        case "audioBuffer":
            if let data = data as? [String: Any] {
                handleAudioBuffer(data: data)
            }
            
        case "audioChord":
            if let data = data as? [String: Any] {
                handleAudioChord(data: data)
            }
        case "getSampleRate":
            sendSampleRateToJS()
            
        case "performCalculation":
            if let numbers = data as? [Int] {
                performCalculation(numbers)
            }
            
        default:
            print("Message non géré - Type: \(type), Data: \(data)")
        }
    }
    
    // MARK: - Audio Command Handlers
    
    private func handleAudioCommand(command: String, data: [String: Any]) {
        switch command {
        case "playNote":
            if let frequency = data["frequency"] as? Double,
               let note = data["note"] as? String,
               let amplitude = data["amplitude"] as? Double {
                WebViewManager.audioController?.playNote(frequency: frequency, note: note, amplitude: Float(amplitude))
           
            }
            
        case "stopNote":
            if let note = data["note"] as? String {
                WebViewManager.audioController?.stopNote(note: note)
            }
            
        case "stopAll":
            WebViewManager.audioController?.stopAllAudio()
            
        default:
            print("🎵 JS->Swift: Unknown audio command: \(command)")
        }
    }
    
    private func handleAudioBuffer(data: [String: Any]) {
        guard let sampleRate = data["sampleRate"] as? Double,
              let duration = data["duration"] as? Double else {
            return
        }
        let audioDataArray: [Float]
        if let doubles = data["audioData"] as? [Double] {
            audioDataArray = doubles.map { Float($0) }
        } else if let numbers = data["audioData"] as? [NSNumber] {
            audioDataArray = numbers.map { $0.floatValue }
        } else {
            return
        }
        let expectedPeakFrame = (data["expectedPeakFrame"] as? NSNumber)?.intValue
            ?? (data["expected_peak_frame"] as? NSNumber)?.intValue
        WebViewManager.audioController?.setAudioDebugExpectedPeakFrame(expectedPeakFrame)
        WebViewManager.audioController?.injectJavaScriptAudio(audioDataArray, sampleRate: sampleRate, duration: duration)
    }
    
    private func handleAudioChord(data: [String: Any]) {
        if let command = data["command"] as? String {
            switch command {
            case "playChord":
                if let frequencies = data["frequencies"] as? [Double],
                   let amplitude = data["amplitude"] as? Double {
                    WebViewManager.audioController?.playChord(frequencies: frequencies, amplitude: Float(amplitude))
                }
                
            case "stopChord":
                WebViewManager.audioController?.stopChord()
                
            default:
                break
            }
        }
    }
    
    private func sendSampleRateToJS() {
        // Send sample rate back to JavaScript
        let jsCode = "if (typeof window.updateSampleRate === 'function') { window.updateSampleRate(44100); }"
        WebViewManager.evaluateJS(jsCode, label: "sampleRate", priority: .low)
    }
    
    // MARK: - MIDI Communication
    
    /// Send MIDI data to JavaScript
    static func sendMIDIToJS(data1: UInt8, data2: UInt8, data3: UInt8, timestamp: Double = 0) {
        let jsCode = """
        if (typeof window.midiUtilities !== 'undefined' && typeof window.midiUtilities.receiveMidiData === 'function') {
            window.midiUtilities.receiveMidiData(\(data1), \(data2), \(data3), \(timestamp));
        } else if (typeof window.Lyrix !== 'undefined' && typeof window.Lyrix.midiUtilities !== 'undefined' && typeof window.Lyrix.midiUtilities.receiveMidiData === 'function') {
            window.Lyrix.midiUtilities.receiveMidiData(\(data1), \(data2), \(data3), \(timestamp));
        } else {
            console.log('🎹 MIDI received but no handler available:', \(data1), \(data2), \(data3));
        }
        """
        evaluateJS(jsCode, label: "midi", priority: .high)
    }

    private func sendMuteStateToJS() {
        // Rate limiting for mute state updates (non-critical for timecode)
        let currentTime = CACurrentMediaTime()
        if currentTime - WebViewManager.lastMuteStateUpdate < WebViewManager.nonCriticalUpdateInterval {
            return
        }
        WebViewManager.lastMuteStateUpdate = currentTime
        
        if let isMuted = WebViewManager.audioController?.isMuted {
            let state = ["muted": isMuted]
            if let jsonData = try? JSONSerialization.data(withJSONObject: state),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                Self.dispatchToJS(jsonString, function: "updateAudioState", priority: .low)
            }
        }
    }
    
    private func sendTestStateToJS() {
        // Rate limiting for test state updates (non-critical for timecode)
        let currentTime = CACurrentMediaTime()
        if currentTime - WebViewManager.lastTestStateUpdate < WebViewManager.nonCriticalUpdateInterval {
            return
        }
        WebViewManager.lastTestStateUpdate = currentTime
        
        guard let audioController = WebViewManager.audioController else { return }
        
        let state: [String: Any] = [
            "isTestActive": audioController.isTestActive,
            "frequency": audioController.currentTestFrequency
        ]
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: state),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            Self.dispatchToJS(jsonString, function: "updateTestState", priority: .low)
        }
    }
    
    // MARK: - Transport Data Communication
    
    public static func sendTransportDataToJS(isPlaying: Bool, playheadPosition: Double, sampleRate: Double) {
        let playheadSeconds = sampleRate > 0 ? playheadPosition / sampleRate : playheadPosition
        updateTransportCache(isPlaying: isPlaying, playheadSeconds: playheadSeconds)
        let jsCode = "if (typeof updateTransportFromSwift === 'function') { updateTransportFromSwift({\"isPlaying\": \(isPlaying ? "true" : "false"), \"playheadPosition\": \(Int(playheadPosition)), \"sampleRate\": \(Int(sampleRate))}); }"
        evaluateJS(jsCode, label: "transport", priority: .critical)
    }

    public static func sendToJS(_ message: Any, _ function: String) {
        dispatchToJS(message, function: function, priority: .normal)
    }

    private static func dispatchToJS(_ message: Any, function: String, priority: IPCPriority) {
        var jsValue: String
        if let stringValue = message as? String {
            // Escape quotes and backslashes to ensure valid JS string literal
            let escaped = stringValue
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "\\r")
            jsValue = "\"\(escaped)\""
        } else {
            jsValue = "'\(message)'"
        }
        let jsCode = "if (typeof \(function) === 'function') { \(function)(\(jsValue)); }"
        evaluateJS(jsCode, label: "fn.\(function)", priority: priority)
    }

    private func performCalculation(_ numbers: [Int]) {
        // Silent calculation for performance
    }

    // MARK: - Streams
    static func startHostTimeStream(format: String?) {
        stopHostTimeStream()
        hostTimeStreamActiveFlag = true
        hostTimeTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            let isPlaying = lastIsPlaying
            let playhead = lastPlayheadSeconds
            let tempo = cachedTempo
            let payload: [String: Any] = [
                "action": "hostTimeUpdate",
                "positionSeconds": playhead,
                "positionSamples": Int(playhead * 44100.0),
                "tempo": tempo,
                "ppq": playhead * (tempo / 60.0),
                "playing": isPlaying
            ]
            sendBridgeJSON(payload)
        }
    }
    static func stopHostTimeStream() {
        hostTimeTimer?.invalidate(); hostTimeTimer = nil
        hostTimeStreamActiveFlag = false
    }
    static func startHostStateStream() {
        stopHostStateStream()
        hostStateStreamActiveFlag = true
        // Immediately emit current cached state once (real host state)
        let initialPayload: [String: Any] = [
            "action": "hostTransport",
            "playing": lastIsPlaying,
            "positionSeconds": lastPlayheadSeconds
        ]
        sendBridgeJSON(initialPayload)
        lastSentTransportPlaying = lastIsPlaying
        lastSentTransportPosition = lastPlayheadSeconds
        // Poll cached values (updated by auv3 utils) and emit only on changes
        hostStateTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            let playing = lastIsPlaying
            let pos = lastPlayheadSeconds
            var shouldSend = false
            if lastSentTransportPlaying == nil || playing != lastSentTransportPlaying { shouldSend = true }
            // Optionally also send if position jumps significantly while stopped (e.g. user scrub) (> 0.05s)
            if !playing && abs(pos - lastSentTransportPosition) > 0.05 { shouldSend = true }
            // While playing, AUv3 hosts can jump or loop without changing play state.
            // Emit continuous positions so JS can resync against real host timecode.
            if playing && abs(pos - lastSentTransportPosition) > 0.015 { shouldSend = true }
            if shouldSend {
                let payload: [String: Any] = [
                    "action": "hostTransport",
                    "playing": playing,
                    "positionSeconds": pos
                ]
                sendBridgeJSON(payload)
                lastSentTransportPlaying = playing
                lastSentTransportPosition = pos
            }
        }
    }
    static func stopHostStateStream() {
        hostStateTimer?.invalidate(); hostStateTimer = nil
        hostStateStreamActiveFlag = false
    }
}
