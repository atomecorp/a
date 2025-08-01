//
//  MIDIController.swift
//  atome
//
//  Created by Assistant on 2025-08-01.
//  Copyright © 2025 atomecorp. All rights reserved.
//

import Foundation
import CoreMIDI
import os.log

public class MIDIController: NSObject {
    
    // MIDI Client, Input Port and Destination
    private var midiClient: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private var destinationEndpoint: MIDIEndpointRef = 0
    
    // Logger for Xcode console
    private let logger = Logger(subsystem: "com.atomecorp.atome", category: "MIDI")
    
    public override init() {
        super.init()
        setupMIDI()
    }
    
    deinit {
        cleanup()
    }
    
    // MARK: - Main MIDI Setup
    
    private func setupMIDI() {
        // Create MIDI client
        let clientName = "AtomeMIDIClient" as CFString
        let status = MIDIClientCreateWithBlock(clientName, &midiClient) { [weak self] notification in
            self?.handleMIDINotification(notification)
        }
        
        if status != noErr {
            logger.error("Failed to create MIDI client: \(status)")
            return
        }
        
        // Create input port using MIDI 2.0 API
        let portName = "AtomeMIDIInput" as CFString
        let inputStatus = MIDIInputPortCreateWithProtocol(
            midiClient,
            portName,
            ._1_0,  // Support MIDI 1.0 protocol
            &inputPort
        ) { [weak self] eventList, srcConnRefCon in
            self?.get_midi_data(eventList: eventList, srcConnRefCon: srcConnRefCon)
        }
        
        if inputStatus != noErr {
            logger.error("Failed to create MIDI input port: \(inputStatus)")
            return
        }
        
        logger.info("✅ MIDI Input Port created successfully")
        
        // NOTE: AUv3 cannot create MIDI destinations due to sandbox restrictions
        // Apps like AUM must route MIDI manually to the AUv3
        
        // Connect to all available MIDI sources
        connectToAllMIDISources()
        
        logger.info("✅ MIDI Controller initialized successfully")
    }
    
    // MARK: - Main MIDI Data Capture Method
    
    /// Captures and logs MIDI data to Xcode console (MIDI 2.0 API)
    internal func get_midi_data(eventList: UnsafePointer<MIDIEventList>, srcConnRefCon: UnsafeMutableRawPointer?) {
        
        let timestamp = Date().timeIntervalSince1970
        
        // Parse MIDI event list
        var packet = eventList.pointee.packet
        
        for _ in 0..<eventList.pointee.numPackets {
            
            // Extract MIDI data from packet
            let wordCount = packet.wordCount
            
            if wordCount > 0 {
                // Extract MIDI words (UInt32)
                let words = withUnsafePointer(to: packet.words) { ptr in
                    Array(UnsafeBufferPointer(start: ptr.withMemoryRebound(to: UInt32.self, capacity: Int(wordCount)) { $0 }, count: Int(wordCount)))
                }
                
                // Log raw MIDI data
                logger.info("🎹 MIDI Data Received:")
                logger.info("   Timestamp: \(timestamp)")
                logger.info("   Word Count: \(wordCount)")
                logger.info("   Raw Words: \(words.map { String(format: "0x%08X", $0) }.joined(separator: ", "))")
                
                // Parse MIDI messages from words
                if wordCount >= 1 {
                    parseMIDIWords(words: words, timestamp: timestamp)
                }
            }
            
            // Move to next packet
            packet = MIDIEventPacketNext(&packet).pointee
        }
    }
    
    // MARK: - MIDI Message Parsing
    
    private func parseMIDIWords(words: [UInt32], timestamp: TimeInterval) {
        
        for word in words {
            // Extract bytes from 32-bit word (little-endian)
            let byte1 = UInt8(word & 0xFF)
            let byte2 = UInt8((word >> 8) & 0xFF)
            let byte3 = UInt8((word >> 16) & 0xFF)
            let _ = UInt8((word >> 24) & 0xFF) // byte4 unused for now
            
            // Process each valid MIDI message
            if byte1 >= 0x80 { // Valid MIDI status byte
                var midiData: [UInt8] = [byte1]
                if byte2 < 0x80 && byte2 > 0 { midiData.append(byte2) }
                if byte3 < 0x80 && byte3 > 0 { midiData.append(byte3) }
                
                parseMIDIBytes(data: midiData, timestamp: timestamp)
            }
        }
    }
    
    private func parseMIDIBytes(data: [UInt8], timestamp: TimeInterval) {
        
        guard data.count >= 1 else { return }
        
        let statusByte = data[0]
        let status = statusByte & 0xF0
        let channel = (statusByte & 0x0F) + 1
        
        switch status {
        case 0x90: // Note On
            if data.count >= 3 {
                let note = data[1]
                let velocity = data[2]
                if velocity > 0 {
                    logger.info("🎵 Note ON  - Channel: \(channel), Note: \(note), Velocity: \(velocity)")
                } else {
                    logger.info("🎵 Note OFF - Channel: \(channel), Note: \(note) (velocity 0)")
                }
            }
            
        case 0x80: // Note Off
            if data.count >= 3 {
                let note = data[1]
                let velocity = data[2]
                logger.info("🎵 Note OFF - Channel: \(channel), Note: \(note), Velocity: \(velocity)")
            }
            
        case 0xB0: // Control Change
            if data.count >= 3 {
                let controller = data[1]
                let value = data[2]
                logger.info("🎛️ CC Change - Channel: \(channel), Controller: \(controller), Value: \(value)")
            }
            
        case 0xC0: // Program Change
            if data.count >= 2 {
                let program = data[1]
                logger.info("🎪 Program Change - Channel: \(channel), Program: \(program)")
            }
            
        case 0xE0: // Pitch Bend
            if data.count >= 3 {
                let lsb = data[1]
                let msb = data[2]
                let pitchValue = Int(lsb) + (Int(msb) << 7)
                logger.info("🎚️ Pitch Bend - Channel: \(channel), Value: \(pitchValue)")
            }
            
        case 0xA0: // Aftertouch
            if data.count >= 3 {
                let note = data[1]
                let pressure = data[2]
                logger.info("👆 Aftertouch - Channel: \(channel), Note: \(note), Pressure: \(pressure)")
            }
            
        case 0xD0: // Channel Pressure
            if data.count >= 2 {
                let pressure = data[1]
                logger.info("🤏 Channel Pressure - Channel: \(channel), Pressure: \(pressure)")
            }
            
        case 0xF0: // System messages
            handleSystemMessage(data: data)
            
        default:
            logger.info("❓ Unknown MIDI - Status: 0x\(String(format: "%02X", status)), Data: \(data.dropFirst().map { String(format: "0x%02X", $0) }.joined(separator: ", "))")
        }
    }
    
    private func handleSystemMessage(data: [UInt8]) {
        guard data.count >= 1 else { return }
        
        let statusByte = data[0]
        
        switch statusByte {
        case 0xF8:
            logger.info("⏱️ MIDI Clock")
        case 0xFA:
            logger.info("▶️ MIDI Start")
        case 0xFB:
            logger.info("⏸️ MIDI Continue")
        case 0xFC:
            logger.info("⏹️ MIDI Stop")
        case 0xFE:
            logger.info("💓 Active Sensing")
        case 0xFF:
            logger.info("🔄 System Reset")
        case 0xF0:
            logger.info("🎼 SysEx Message - Length: \(data.count)")
        default:
            logger.info("🔧 System Message: 0x\(String(format: "%02X", statusByte))")
        }
    }
    
    // MARK: - MIDI Source Connection
    
    private func connectToAllMIDISources() {
        let sourceCount = MIDIGetNumberOfSources()
        logger.info("📡 Found \(sourceCount) MIDI sources")
        
        for i in 0..<sourceCount {
            let source = MIDIGetSource(i)
            if source != 0 {
                let status = MIDIPortConnectSource(inputPort, source, nil)
                if status == noErr {
                    if let sourceName = getMIDIObjectName(source) {
                        logger.info("🔗 Connected to MIDI source: \(sourceName)")
                    } else {
                        logger.info("🔗 Connected to MIDI source \(i)")
                    }
                } else {
                    logger.error("❌ Failed to connect to MIDI source \(i): \(status)")
                }
            }
        }
    }
    
    private func getMIDIObjectName(_ object: MIDIObjectRef) -> String? {
        var name: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(object, kMIDIPropertyName, &name)
        if status == noErr, let cfString = name?.takeRetainedValue() {
            return cfString as String
        }
        return nil
    }
    
    // MARK: - MIDI Notifications
    
    private func handleMIDINotification(_ notification: UnsafePointer<MIDINotification>) {
        switch notification.pointee.messageID {
        case .msgSetupChanged:
            logger.info("🔄 MIDI Setup Changed")
            // Reconnect to sources when setup changes
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.connectToAllMIDISources()
            }
            
        case .msgObjectAdded:
            logger.info("➕ MIDI Object Added")
            connectToAllMIDISources()
            
        case .msgObjectRemoved:
            logger.info("➖ MIDI Object Removed")
            
        case .msgPropertyChanged:
            logger.info("📝 MIDI Property Changed")
            
        case .msgThruConnectionsChanged:
            logger.info("🔀 MIDI Thru Connections Changed")
            
        case .msgSerialPortOwnerChanged:
            logger.info("🔌 MIDI Serial Port Owner Changed")
            
        case .msgIOError:
            logger.error("💥 MIDI IO Error")
            
        case .msgInternalStart:
            logger.info("🚀 MIDI Internal Start")
            
        @unknown default:
            logger.info("❓ Unknown MIDI notification: \(notification.pointee.messageID.rawValue)")
        }
    }
    
    // MARK: - Cleanup
    
    private func cleanup() {
        if inputPort != 0 {
            MIDIPortDispose(inputPort)
            inputPort = 0
        }
        
        if destinationEndpoint != 0 {
            MIDIEndpointDispose(destinationEndpoint)
            destinationEndpoint = 0
        }
        
        if midiClient != 0 {
            MIDIClientDispose(midiClient)
            midiClient = 0
        }
        
        logger.info("🧹 MIDI Controller cleaned up")
    }
    
    // MARK: - Public Interface
    
    /// Start MIDI monitoring (call this from your Audio Unit)
    public func startMIDIMonitoring() {
        logger.info("🎯 Starting MIDI monitoring...")
        connectToAllMIDISources()
        
        // Test if callback is working by simulating data
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.logger.info("🧪 Testing MIDI callback system...")
            // If no real MIDI data comes in 2 seconds, this suggests a routing issue
        }
    }
    
    /// Stop MIDI monitoring
    public func stopMIDIMonitoring() {
        logger.info("⏹️ Stopping MIDI monitoring...")
        cleanup()
    }
    
    /// Get connected MIDI sources info
    public func getConnectedSources() -> [String] {
        let sourceCount = MIDIGetNumberOfSources()
        var sources: [String] = []
        
        for i in 0..<sourceCount {
            let source = MIDIGetSource(i)
            if source != 0 {
                if let sourceName = getMIDIObjectName(source) {
                    sources.append(sourceName)
                    
                    // Check if source is online and connected
                    var isOffline: Int32 = 0
                    let offlineStatus = MIDIObjectGetIntegerProperty(source, kMIDIPropertyOffline, &isOffline)
                    
                    if offlineStatus == noErr {
                        logger.info("📊 Source '\(sourceName)' - Offline: \(isOffline == 1 ? "YES" : "NO")")
                    }
                } else {
                    sources.append("MIDI Source \(i)")
                }
            }
        }
        
        logger.info("📋 Connected sources: \(sources)")
        return sources
    }
    
    /// Check MIDI system status
    public func checkMIDISystemStatus() {
        logger.info("🔍 MIDI System Diagnostic:")
        logger.info("   Client: \(self.midiClient)")
        logger.info("   Input Port: \(self.inputPort)")
        logger.info("   Sources: \(MIDIGetNumberOfSources())")
        logger.info("   Destinations: \(MIDIGetNumberOfDestinations())")
        
        // Force a connection refresh
        connectToAllMIDISources()
    }
}
