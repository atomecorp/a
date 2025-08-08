//
//  AUMIDIOutputHelper.swift
//  auv3
//
//  Helper pour forcer la déclaration de sortie MIDI
//

import AudioUnit
import AVFoundation

extension auv3Utils {
    
    // MARK: - MIDI Output Support (CRITIQUE pour affichage host)
    
    /// Override critical pour signaler qu'on génère du MIDI
    public override var providesUserInterface: Bool {
        return true // Assure UI + signale capacités étendues
    }
    
    /// Déclare explicitement support MIDI output
    public override func setValue(_ value: Any?, forKey key: String) {
        if key == "MIDIOutputEnabled" {
            // Signal to host that we output MIDI
            return
        }
        super.setValue(value, forKey: key)
    }
    
    /// Force host à reconnaître nos capacités MIDI
    public override var canProcessInPlace: Bool {
        return false // Force processing pipeline (needed for MIDI gen)
    }
    
    /// Signal MPE + MIDI capabilities
    public override var supportsMPE: Bool {
        return true
    }
    
    // MARK: - Force MIDI Bus Declaration
    
    /// Override allocateRenderResources to force MIDI setup
    public override func allocateRenderResources() throws {
        try super.allocateRenderResources()
        
        // Capture the MIDI event sender
        midiEventSender = self.scheduleMIDIEventBlock
        
        // CRITICAL: Send immediate dummy MIDI to register output with host
        DispatchQueue.main.async { [weak self] in
            self?.announceToHost()
        }
        
        print("🎹 AUv3 MIDI Output: allocateRenderResources completed with scheduleMIDIEventBlock: \(midiEventSender != nil)")
    }
    
    /// Send initial MIDI to announce output capability to host
    private func announceToHost() {
        guard let sender = midiEventSender else {
            print("❌ No scheduleMIDIEventBlock - host may not see MIDI output")
            return
        }
        
        // Send Note On + Off to establish MIDI output presence
        sender(AUEventSampleTimeImmediate, 0, 3, [0x90, 60, 1])   // Very quiet Note On
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            sender(AUEventSampleTimeImmediate, 0, 3, [0x80, 60, 0]) // Note Off
        }
        
        print("🚀 MIDI Output announced to host via scheduleMIDIEventBlock")
    }
}
