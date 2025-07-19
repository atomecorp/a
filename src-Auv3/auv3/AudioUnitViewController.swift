//
//  AudioUnitViewController.swift
//  auv3
//
//  Created by jeezs on 26/04/2022.
//

import CoreAudioKit
import WebKit

public class AudioUnitViewController: AUViewController, AUAudioUnitFactory, AudioControllerProtocol, AudioDataDelegate {
    var audioUnit: AUAudioUnit?
    var webView: WKWebView!
    
    // Audio control state
    private var _isMuted: Bool = false
    private var _isTestActive: Bool = false
    private var _currentTestFrequency: Double = 440.0
    
    // Published properties
    public var isMuted: Bool { return _isMuted }
    public var isTestActive: Bool { return _isTestActive }
    public var currentTestFrequency: Double { return _currentTestFrequency }
    
    // Rate limiting for WebView updates
    private var lastWebViewUpdate: TimeInterval = 0
    private var webViewUpdateInterval: TimeInterval = 1.0 / 30.0 // 30 FPS
    
    public override func viewDidLoad() {
        super.viewDidLoad()
      
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
    
    // MARK: - Test Tone Methods
    
    public func startTestTone(frequency: Double) {
        if let au = audioUnit as? auv3Utils {
            _isTestActive = true
            _currentTestFrequency = frequency
            au.startTestTone(frequency: frequency)
            print("Test tone started at \(frequency) Hz")
            
            // AJOUT: Assurer que le son n'est pas coupé quand le test démarre
            if _isMuted {
                setMute(false)
            }
        }
    }
    
    public func stopTestTone() {
        if let au = audioUnit as? auv3Utils {
            _isTestActive = false
            au.stopTestTone()
            print("Test tone stopped")
        }
    }
    
    public func setTestFrequency(_ frequency: Double) {
        _currentTestFrequency = frequency
        if _isTestActive {
            if let au = audioUnit as? auv3Utils {
                au.updateTestToneFrequency(frequency)
            }
        }
    }
    
    public func handleTestToneState(isPlaying: Bool, frequency: Double) {
        // MODIFICATION: Amélioration de la gestion des états
        if isPlaying != _isTestActive {
            if isPlaying {
                startTestTone(frequency: frequency)
            } else {
                stopTestTone()
            }
        } else if isPlaying && frequency != _currentTestFrequency {
            setTestFrequency(frequency)
        }
    }
    
    // MARK: - Audio Data Delegate
    
    public func didReceiveAudioData(_ data: [Float], timestamp: Double) {
        let currentTime = CACurrentMediaTime()
        if currentTime - lastWebViewUpdate >= webViewUpdateInterval {
            // Calculate audio metrics
            let audioMetrics = processAudioData(data)
            
            // Add test tone information to metrics
            var metricsWithTest = audioMetrics
            metricsWithTest["testFrequency"] = _currentTestFrequency
            metricsWithTest["isTestActive"] = _isTestActive
            
            // Convert audio data and metrics to JSON
            let audioData: [String: Any] = [
                "data": data,
                "timestamp": timestamp,
                "metrics": metricsWithTest
            ]
            
            if let jsonData = try? JSONSerialization.data(withJSONObject: audioData),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                // Send audio data to WebView
                WebViewManager.sendToJS(jsonString, "updateAudioVisualization")
            }
            
            lastWebViewUpdate = currentTime
        }
    }
    
    private func processAudioData(_ data: [Float]) -> [String: Any] {
        var metrics: [String: Any] = [:]
        
        // Calculate RMS (Root Mean Square)
        let rms = sqrt(data.map { $0 * $0 }.reduce(0, +) / Float(data.count))
        
        // Calculate peak amplitude
        let peak = data.map { abs($0) }.max() ?? 0
        
        // Calculate zero crossings
        var zeroCrossings = 0
        for i in 1..<data.count {
            if (data[i] * data[i-1]) < 0 {
                zeroCrossings += 1
            }
        }
        
        metrics["rms"] = rms
        metrics["peak"] = peak
        metrics["zeroCrossings"] = zeroCrossings
        
        return metrics
    }
    
    // MARK: - Utility Methods
    
    func getHostSampleRate() -> Double? {
        guard let au = audioUnit, au.outputBusses.count > 0 else {
            return nil
        }
        return au.outputBusses[0].format.sampleRate
    }
}
