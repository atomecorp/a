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
        print("🎹 AUv3: allocateRenderResources called!")
        
        // CRITICAL: Log sample rates BEFORE calling super to see what host provides
        if outputBusses.count > 0 {
            let preRate = outputBusses[0].format.sampleRate
            print("🔊 [PRE-allocate] Output bus sample rate: \(preRate)")
        }
        
        try super.allocateRenderResources()
        
        // Log actual host sample rate after allocation
        if outputBusses.count > 0 {
            let actualHostRate = outputBusses[0].format.sampleRate
            print("🔊 [POST-allocate] ACTUAL Host sample rate after allocation: \(actualHostRate)")
            
            // Also check input bus in case host sets different rates
            if inputBusses.count > 0 {
                let inputRate = inputBusses[0].format.sampleRate
                print("🔊 [POST-allocate] Input bus sample rate: \(inputRate)")
            }
        }
        
        print("🎹 AUv3: allocateRenderResources - scheduleMIDIEventBlock before: \(self.scheduleMIDIEventBlock != nil)")
        
        // Capture the MIDI event sender
        midiEventSender = self.scheduleMIDIEventBlock
        
        print("🎹 AUv3: allocateRenderResources - midiEventSender captured: \(midiEventSender != nil)")
        
        // If still nil, try with a small delay (host might set it later)
        if midiEventSender == nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.midiEventSender = self?.scheduleMIDIEventBlock
                print("🎹 AUv3: Delayed capture - midiEventSender: \(self?.midiEventSender != nil)")
            }
        }
        
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
