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
        sendMIDIMessage(data: [0x90 | (channel & 0x0F), note & 0x7F, velocity & 0x7F], port: port)
    }

    func sendNoteOff(note: UInt8, velocity: UInt8, channel: UInt8 = 0, port: MIDIPortRef) {
        sendMIDIMessage(data: [0x80 | (channel & 0x0F), note & 0x7F, velocity & 0x7F], port: port)
    }

    func sendControlChange(controller: UInt8, value: UInt8, channel: UInt8 = 0, port: MIDIPortRef) {
        sendMIDIMessage(data: [0xB0 | (channel & 0x0F), controller & 0x7F, value & 0x7F], port: port)
    }

    func sendRaw(bytes: [UInt8], port: MIDIPortRef, destinationId: String? = nil, delayMs: Double = 0) {
        sendMIDIMessage(data: bytes, port: port, destinationId: destinationId, delayMs: delayMs)
    }

    /// The CoreMIDI destinations, as the page lists its outputs (R-379: one line per device in Synchro MIDI).
    func destinations() -> [[String: String]] {
        (0..<MIDIGetNumberOfDestinations()).compactMap { index in
            let destination = MIDIGetDestination(index)
            guard destination != 0, let uniqueID = Self.uniqueID(destination) else { return nil }
            return ["id": Self.destinationId(uniqueID), "name": objectNameResolver(destination) ?? ""]
        }
    }

    private static func destinationId(_ uniqueID: MIDIUniqueID) -> String {
        "coremidi-out-\(UInt32(bitPattern: uniqueID))"
    }

    private static func uniqueID(_ object: MIDIObjectRef) -> MIDIUniqueID? {
        var uniqueID: MIDIUniqueID = 0
        return MIDIObjectGetIntegerProperty(object, kMIDIPropertyUniqueID, &uniqueID) == noErr ? uniqueID : nil
    }

    /// The host time `delayMs` from now (0: now, as CoreMIDI reads a zero timestamp).
    private static func hostTime(afterMs delayMs: Double) -> MIDITimeStamp {
        guard delayMs > 0, delayMs.isFinite else { return 0 }
        var timebase = mach_timebase_info_data_t()
        mach_timebase_info(&timebase)
        let nanoseconds = min(delayMs, 2000) * 1_000_000
        return mach_absolute_time() + MIDITimeStamp(nanoseconds * Double(timebase.denom) / Double(timebase.numer))
    }

    // One message to one destination (`destinationId`), else to every CoreMIDI destination (the page's broadcast
    // output), at its instant (`delayMs` from now, CoreMIDI holding it until then).
    private func sendMIDIMessage(data: [UInt8], port: MIDIPortRef, destinationId: String? = nil, delayMs: Double = 0) {
        guard !data.isEmpty && data.count <= 3 else {
            logger.error("Invalid MIDI data length: \(data.count)")
            return
        }
        guard port != 0 else {
            logger.error("MIDI output port unavailable: MIDI not started")
            return
        }
        guard let words = Self.universalPacketWords(data) else {
            logger.error("Unsupported MIDI message: \(data.map { String(format: "%02X", $0) }.joined(separator: " "))")
            return
        }
        // MIDI 1.0 protocol, as the input port. One MIDIEventList holds a packet of 64 words,
        // so the one or two words of a message always fit (MIDIEventListAdd cannot fail here).
        var eventList = MIDIEventList()
        let packet = MIDIEventListInit(&eventList, ._1_0)
        _ = MIDIEventListAdd(&eventList, MemoryLayout<MIDIEventList>.size, packet, Self.hostTime(afterMs: delayMs), words.count, words)
        for index in 0..<MIDIGetNumberOfDestinations() {
            let destination = MIDIGetDestination(index)
            guard destination != 0 else { continue }
            if let destinationId, Self.uniqueID(destination).map(Self.destinationId) != destinationId { continue }
            let result = MIDISendEventList(port, destination, &eventList)
            if result != noErr {
                logger.error("MIDI send to \(self.objectNameResolver(destination) ?? String(destination)) failed: \(result)")
            }
        }
    }

    /// Universal MIDI Packet words (group 0) of one MIDI 1.0 byte message:
    /// channel voice → type 0x2, system common / real time → type 0x1,
    /// a complete short SysEx `F0 … F7` → type 0x3. Nil for a byte sequence that is no message.
    private static func universalPacketWords(_ data: [UInt8]) -> [UInt32]? {
        let status = data[0]
        switch status {
        case 0x80...0xEF:
            let expected = (status & 0xF0 == 0xC0 || status & 0xF0 == 0xD0) ? 2 : 3
            guard data.count == expected else { return nil }
            return [0x2000_0000 | packedBytes(data)]
        case 0xF0:
            guard data.count >= 2, data[data.count - 1] == 0xF7 else { return nil }
            let payload = data[1..<(data.count - 1)]
            guard payload.allSatisfy({ $0 < 0x80 }) else { return nil }
            var words: [UInt32] = [0x3000_0000 | UInt32(payload.count) << 16, 0]
            for (offset, byte) in payload.enumerated() {
                let shift = offset < 2 ? 8 * (1 - offset) : 8 * (5 - offset)
                words[offset < 2 ? 0 : 1] |= UInt32(byte) << shift
            }
            return words
        case 0xF1...0xFE where status != 0xF7:
            let expected: Int
            switch status {
            case 0xF1, 0xF3: expected = 2
            case 0xF2: expected = 3
            default: expected = 1
            }
            guard data.count == expected else { return nil }
            return [0x1000_0000 | packedBytes(data)]
        default:
            return nil
        }
    }

    /// `[status][data1][data2]` laid in the low 24 bits of a UMP word, data bytes masked to 7 bits.
    private static func packedBytes(_ data: [UInt8]) -> UInt32 {
        var word = UInt32(data[0]) << 16
        if data.count > 1 { word |= UInt32(data[1] & 0x7F) << 8 }
        if data.count > 2 { word |= UInt32(data[2] & 0x7F) }
        return word
    }
}
