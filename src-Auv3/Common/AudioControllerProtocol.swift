//
//  AudioControllerProtocol.swift
//  atome
//
//  Created by jeezs on 16/02/2025.
//

import Foundation

public protocol AudioControllerProtocol: AnyObject {
    // Existing properties
    var isMuted: Bool { get }
    
    // Audio test properties
    var isTestActive: Bool { get }
    var currentTestFrequency: Double { get }
    
    // Existing methods
    func toggleMute()
    func setMute(_ muted: Bool)
    
    // Audio test methods
    func startTestTone(frequency: Double)
    func stopTestTone()
    func setTestFrequency(_ frequency: Double)
    func handleTestToneState(isPlaying: Bool, frequency: Double)
}

// Default implementations
public extension AudioControllerProtocol {
    // Default values for test properties
    var isTestActive: Bool { return false }
    var currentTestFrequency: Double { return 440.0 }
    
    // Default implementations for test methods that can be overridden
    func startTestTone(frequency: Double) {}
    func stopTestTone() {}
    func setTestFrequency(_ frequency: Double) {}
    func handleTestToneState(isPlaying: Bool, frequency: Double) {
        if isPlaying {
            startTestTone(frequency: frequency)
        } else {
            stopTestTone()
        }
    }
}
