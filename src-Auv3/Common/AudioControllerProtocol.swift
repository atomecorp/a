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
    
}

