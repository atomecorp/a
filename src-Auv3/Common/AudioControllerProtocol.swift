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
    
    // New audio generation methods
    func playNote(frequency: Double, note: String, amplitude: Float)
    func stopNote(note: String)
    func playChord(frequencies: [Double], amplitude: Float)
    func stopChord()
    func stopAllAudio()
    
    // JavaScript audio injection
    func injectJavaScriptAudio(_ audioData: [Float], sampleRate: Double, duration: Double)
    func stopJavaScriptAudio()
}

