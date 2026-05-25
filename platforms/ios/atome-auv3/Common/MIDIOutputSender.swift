//
//  MIDIOutputSender.swift
//  atome
//
//  Created by Assistant on 2026-05-25.
//  Copyright © 2026 atomecorp. All rights reserved.
//

import Foundation
import CoreMIDI
import os.log

final class MIDIOutputSender {
    private let logger: Logger
    private let objectNameResolver: (MIDIObjectRef) -> String?

    init(logger: Logger, objectNameResolver: @escaping (MIDIObjectRef) -> String?) {
        self.logger = logger
        self.objectNameResolver = objectNameResolver
    }

    func sendNoteOn(note: UInt8, velocity: UInt8, channel: UInt8 = 0, port: MIDIPortRef) {
        let noteOnStatus: UInt8 = 0x90 | (channel & 0x0F)
        let midiData: [UInt8] = [noteOnStatus, note & 0x7F, velocity & 0x7F]
        sendMIDIMessage(data: midiData, port: port)
        logger.info("MIDI OUT: Note ON \(note) vel:\(velocity) ch:\(channel)")
    }

    func sendNoteOff(note: UInt8, velocity: UInt8, channel: UInt8 = 0, port: MIDIPortRef) {
        let noteOffStatus: UInt8 = 0x80 | (channel & 0x0F)
        let midiData: [UInt8] = [noteOffStatus, note & 0x7F, velocity & 0x7F]
        sendMIDIMessage(data: midiData, port: port)
        logger.info("MIDI OUT: Note OFF \(note) vel:\(velocity) ch:\(channel)")
    }

    func sendControlChange(controller: UInt8, value: UInt8, channel: UInt8 = 0, port: MIDIPortRef) {
        let ccStatus: UInt8 = 0xB0 | (channel & 0x0F)
        let midiData: [UInt8] = [ccStatus, controller & 0x7F, value & 0x7F]
        sendMIDIMessage(data: midiData, port: port)
        logger.info("MIDI OUT: CC \(controller) val:\(value) ch:\(channel)")
    }

    func sendRaw(bytes: [UInt8], port: MIDIPortRef) {
        sendMIDIMessage(data: bytes, port: port)
    }

    private func sendMIDIMessage(data: [UInt8], port: MIDIPortRef) {
        guard data.count > 0 && data.count <= 3 else {
            logger.error("Invalid MIDI data length: \(data.count)")
            return
        }

        let destCount = MIDIGetNumberOfDestinations()
        logger.info("MIDI destinations available: \(destCount)")

        guard destCount > 0 else {
            logger.warning("No MIDI destinations available - Cannot send MIDI")
            return
        }

        let destination = MIDIGetDestination(0)
        guard destination != 0 else {
            logger.error("Failed to get MIDI destination")
            return
        }

        if let destName = objectNameResolver(destination) {
            logger.info("Sending MIDI to destination: '\(destName)'")
        } else {
            logger.info("Sending MIDI to destination ID: \(destination)")
        }

        var packetListBuffer = Data(count: 1024)
        let packetListPtr = packetListBuffer.withUnsafeMutableBytes { ptr in
            return ptr.bindMemory(to: MIDIPacketList.self).baseAddress!
        }

        let packet = MIDIPacketListInit(packetListPtr)
        let timestamp = mach_absolute_time()
        _ = MIDIPacketListAdd(packetListPtr, 1024, packet, timestamp, data.count, data)

        let dataString = data.map { String(format: "0x%02X", $0) }.joined(separator: " ")
        logger.info("MIDI Data: [\(dataString)] -> Destination: \(destination)")

        let result = MIDISend(port, destination, packetListPtr)
        if result != noErr {
            logger.error("Failed to send MIDI: \(result)")
        } else {
            logger.info("MIDI sent successfully to host")
        }
    }
}
