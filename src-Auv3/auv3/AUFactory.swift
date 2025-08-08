//
//  AUFactory.swift
//  auv3
//
//  Factory function pour l'extension AudioUnit
//

import AudioUnit
import AVFoundation

// MARK: - Factory Function (CRITIQUE)

/// Factory function appelée par l'hôte pour créer l'AudioUnit
@_cdecl("createAudioUnit")
public func createAudioUnit(componentDescription: AudioComponentDescription) -> AUAudioUnit? {
    print("🏭 Factory: createAudioUnit called with type: \(String(format: "%c%c%c%c", 
        (componentDescription.componentType >> 24) & 0xFF,
        (componentDescription.componentType >> 16) & 0xFF, 
        (componentDescription.componentType >> 8) & 0xFF,
        componentDescription.componentType & 0xFF))")
    
    do {
        let audioUnit = try auv3Utils(componentDescription: componentDescription, options: [])
        print("✅ Factory: auv3Utils created successfully")
        return audioUnit
    } catch {
        print("❌ Factory: Failed to create auv3Utils: \(error)")
        return nil
    }
}
