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
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
        WebViewManager.setupWebView(for: webView, audioController: self)
    }

    public func createAudioUnit(with componentDescription: AudioComponentDescription) throws -> AUAudioUnit {
        audioUnit = try auv3Utils(componentDescription: componentDescription, options: [])
        
        if let au = audioUnit as? auv3Utils {
            au.mute = true
            _isMuted = true
            au.audioDataDelegate = self
            au.transportDataDelegate = self // AJOUT: Connexion du delegate transport
        }

        return audioUnit!
    }

    // MARK: - Audio Control Methods
    
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
        midiController?.stopMIDIMonitoring()
        midiController = nil
        print("🧹 AudioUnitViewController cleanup: MIDI monitoring stopped")
    }
}
