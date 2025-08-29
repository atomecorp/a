//
//  AudioUnitViewController.swift
//  auv3
//
//  Created by jeezs on 26/04/2022.
//

import CoreAudioKit
import WebKit

public class AudioUnitViewController: AUViewController, AUAudioUnitFactory, AudioControllerProtocol, AudioDataDelegate, TransportDataDelegate {
    var audioUnit: AUAudioUnit?
    var webView: WKWebView!
    
    // MIDI Controller
    private var midiController: MIDIController?
    
    // Audio control state
    private var _isMuted: Bool = false
    private var _isTestActive: Bool = false
    private var _currentTestFrequency: Double = 440.0
    
    // Published properties
    public var isMuted: Bool { return _isMuted }
    public var isTestActive: Bool { return _isTestActive }
    public var currentTestFrequency: Double { return _currentTestFrequency }
    
    // ULTRA AGGRESSIVE: Rate limiting for WebView updates (for maximum performance)
    private var lastWebViewUpdate: TimeInterval = 0
    private var webViewUpdateInterval: TimeInterval = 1.0 / 2.0 // ULTRA: Reduced to 2 FPS for maximum performance (instead of 5)
    
    public override func viewDidLoad() {
        super.viewDidLoad()
        
        // Initialize MIDI Controller
        midiController = MIDIController()
        midiController?.startMIDIMonitoring()
        print("🎹 MIDI Controller initialized and monitoring started")
        
        // Run MIDI system diagnostic after a short delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.midiController?.checkMIDISystemStatus()
        }
      
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AudioSchemeHandler(), forURLScheme: "atome")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = [.audio]
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
        WebViewManager.setupWebView(for: webView, audioController: self)
    // Register JS -> Swift handler for safe URL launching (idempotent)
    let cc = webView.configuration.userContentController
    cc.removeScriptMessageHandler(forName: "squirrel.openURL")
    cc.add(self, name: "squirrel.openURL")
        // Load custom scheme index
        if let url = URL(string: "atome://index.html") {
            webView.load(URLRequest(url: url))
        }
    }

    public func createAudioUnit(with componentDescription: AudioComponentDescription) throws -> AUAudioUnit {
        audioUnit = try auv3Utils(componentDescription: componentDescription, options: [])
        
        if let au = audioUnit as? auv3Utils {
            au.mute = false  // CORRECTION: Démarrer NON muté pour entendre l'audio
            _isMuted = false
            au.audioDataDelegate = self
            au.transportDataDelegate = self // AJOUT: Connexion du delegate transport
            print("🔊 AUv3 Audio Unit démarré NON MUTÉ")
        }

        return audioUnit!
    }    // MARK: - Audio Control Methods
    
    public func toggleMute() {
        if let au = audioUnit as? auv3Utils {
            au.mute.toggle()
            _isMuted = au.mute
            print("Audio is now \(_isMuted ? "muted" : "unmuted")")
        }
    }
    
    public func setMute(_ muted: Bool) {
        if let au = audioUnit as? auv3Utils {
            au.mute = muted
            _isMuted = muted
            print("Audio is now \(muted ? "muted" : "unmuted")")
        }
    }
  
 
    // MARK: - Audio Data Delegate
    
    public func didReceiveAudioData(_ data: [Float], timestamp: Double) {
        let currentTime = CACurrentMediaTime()
        if currentTime - lastWebViewUpdate >= webViewUpdateInterval {
            // ULTRA-AGGRESSIVE: Only process if audio is significant
            let quickPeak = data.max() ?? 0
            if abs(quickPeak) > 0.005 { // Only process if audio is above threshold
                
                // Calculate minimal audio metrics
                let audioMetrics = processAudioData(data)
                
                // Minimal data structure - avoid dictionary merging
                let audioData: [String: Any] = [
                    "peak": audioMetrics["peak"] ?? 0,
                    "rms": audioMetrics["rms"] ?? 0,
                    "timestamp": timestamp,
                    "testFreq": _currentTestFrequency,
                    "testActive": _isTestActive
                ]
                
                // Direct JSON conversion without error handling for performance
                if let jsonData = try? JSONSerialization.data(withJSONObject: audioData),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    WebViewManager.sendToJS(jsonString, "updateAudioVisualization")
                }
            }
            
            lastWebViewUpdate = currentTime
        }
    }
    
    private func processAudioData(_ data: [Float]) -> [String: Any] {
        // ULTRA-AGGRESSIVE: Process only every 32nd sample for extreme CPU savings
        let dataCount = data.count
        guard dataCount > 0 else {
            return ["rms": 0, "peak": 0, "zeroCrossings": 0]
        }
        
        // Sample only every 32nd element for massive CPU reduction
        let strideSize = max(32, dataCount / 64) // Maximum 64 samples analyzed
        var peak: Float = 0
        var sampleCount = 0
        
        // Only track peak - eliminate RMS and zero crossing calculations for maximum performance
        for i in stride(from: 0, to: dataCount, by: strideSize) {
            let absSample = abs(data[i])
            if absSample > peak {
                peak = absSample
            }
            sampleCount += 1
            
            // Break early if we have enough samples
            if sampleCount >= 32 { break }
        }
        
        // Return minimal metrics for maximum performance
        return ["peak": peak, "rms": peak * 0.7] // Approximate RMS from peak
    }
    
    // MARK: - AudioControllerProtocol - Audio Commands (JS to MIDI routing)
    
    public func playNote(frequency: Double, note: String, amplitude: Float) {
        print("🎵 AUv3: Converting JS note '\(note)' (\(frequency)Hz) to MIDI")
        
        // Convert frequency to MIDI note number
        let midiNote = frequencyToMidiNote(frequency)
        let velocity = UInt8(max(1, min(127, amplitude * 127)))
        
        // Send MIDI Note On to host
        midiController?.sendNoteOn(note: midiNote, velocity: velocity)
        
        print("🎹 MIDI Note ON: \(midiNote) (velocity: \(velocity)) -> Host")
    }
    
    public func stopNote(note: String) {
        print("🎵 AUv3: Stopping JS note '\(note)'")
        
        // For simplicity, we'll send Note Off for common notes
        // In practice, you'd track active notes
        let commonNotes: [String: UInt8] = [
            "C4": 60, "A4": 69, "E5": 76
        ]
        
        if let midiNote = commonNotes[note] {
            midiController?.sendNoteOff(note: midiNote, velocity: 0)
            print("🎹 MIDI Note OFF: \(midiNote) -> Host")
        }
    }
    
    public func playChord(frequencies: [Double], amplitude: Float) {
        print("🎼 AUv3: Converting JS chord to MIDI chord")
        
        let velocity = UInt8(max(1, min(127, amplitude * 127)))
        
        // Send each note in the chord
        for frequency in frequencies {
            let midiNote = frequencyToMidiNote(frequency)
            midiController?.sendNoteOn(note: midiNote, velocity: velocity)
            print("🎹 MIDI Chord Note ON: \(midiNote) -> Host")
        }
    }
    
    public func stopChord() {
        print("🎼 AUv3: Stopping chord - sending All Notes Off")
        
        // Send MIDI All Notes Off (CC 123)
        midiController?.sendControlChange(controller: 123, value: 0)
        print("🎹 MIDI All Notes OFF -> Host")
    }
    
    public func stopAllAudio() {
        print("⛔ AUv3: Stop All - sending MIDI panic")
        
        // Send MIDI All Notes Off and All Sound Off
        midiController?.sendControlChange(controller: 123, value: 0) // All Notes Off
        midiController?.sendControlChange(controller: 120, value: 0) // All Sound Off
        print("🎹 MIDI PANIC (All Notes + Sound OFF) -> Host")
    }
    
    // MARK: - JavaScript Audio Injection
    
    public func injectJavaScriptAudio(_ audioData: [Float], sampleRate: Double, duration: Double) {
        let mt = WebViewManager.lastMediaTimeFromJS
        let lt = WebViewManager.lastLocalTimeFromJS
        let mtStr = mt != nil ? String(format: "%.3f", mt!) : "-"
        let ltStr = lt != nil ? String(format: "%.1f", lt!) : "-"
        print("🎵 AUv3: Received JS audio - \(audioData.count) samples at \(sampleRate)Hz for \(String(format: "%.3f", duration))s | mediaTime=\(mtStr) | local=\(ltStr)")
        
        // Route JavaScript audio to our AUv3 for direct playback
        if let au = audioUnit as? auv3Utils {
            au.injectJavaScriptAudio(audioData, sampleRate: sampleRate, duration: duration)
            print("🔊 AUv3: JavaScript audio injected into audio pipeline | mediaTime=\(mtStr) | local=\(ltStr)")
        } else {
            print("❌ AUv3: Failed to inject JS audio - no audio unit available")
        }
    }
    
    public func stopJavaScriptAudio() {
        if let au = audioUnit as? auv3Utils {
            au.stopJavaScriptAudio()
        }
    }
    
    // Helper function to convert frequency to MIDI note number
    private func frequencyToMidiNote(_ frequency: Double) -> UInt8 {
        // MIDI note formula: note = 69 + 12 * log2(frequency / 440)
        let noteNumber = 69 + 12 * log2(frequency / 440.0)
        return UInt8(max(0, min(127, Int(round(noteNumber)))))
    }

    // MARK: - Transport Data Delegate
    
    public func didReceiveTransportData(isPlaying: Bool, playheadPosition: Double, sampleRate: Double) {
        // Send transport data to WebView via WebViewManager
        WebViewManager.sendTransportDataToJS(
            isPlaying: isPlaying,
            playheadPosition: playheadPosition,
            sampleRate: sampleRate
        )
    }
    
    // MARK: - Utility Methods
    
    func getHostSampleRate() -> Double? {
        guard let au = audioUnit, au.outputBusses.count > 0 else {
            return nil
        }
        return au.outputBusses[0].format.sampleRate
    }
    
    // MARK: - Cleanup
    
    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "squirrel.openURL")
        midiController?.stopMIDIMonitoring()
        midiController = nil
        print("🧹 AudioUnitViewController cleanup: MIDI monitoring stopped")
    }
}

// MARK: - WKScriptMessageHandler for URL launching
extension AudioUnitViewController: WKScriptMessageHandler {
    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "squirrel.openURL" else { return }
        guard let dict = message.body as? [String: Any], let urlString = dict["url"] as? String else {
            print("⚠️ squirrel.openURL invalid message body: \(message.body)")
            return
        }
        Task { @MainActor in
            print("🔗 AUv3: openURL request -> \(urlString)")
            let ok = URLOpener.open(urlString, from: self)
            print("🔗 AUv3: openURL result=\(ok) url=\(urlString)")
        }
    }
}
