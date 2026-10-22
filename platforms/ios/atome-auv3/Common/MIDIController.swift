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

/// CoreMIDI capability adapter (native-bridge exception of module 05) for the app
/// and the AUv3. Every CoreMIDI source is connected to one input port and tagged
/// with its stable unique id, so each message reaches the canonical MIDI input
/// service (`midi_binding_service.js`) with its own `{ id, name }` port, and the
/// source list is published to the page whenever the MIDI setup changes.
public class MIDIController: NSObject {

    /// Port of the MIDI that an AUv3 host routes into the plugin (render-block events).
    static let hostInputPort: [String: String] = ["id": "auv3-host", "name": "AUv3 host"]
    static let hostInputPortLiteral = portLiteral(hostInputPort)

    private var midiClient: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private let includesHostInput: Bool

    private let logger = Logger(subsystem: "com.atomecorp.atome", category: "MIDI")
    private lazy var outputSender = MIDIOutputSender(
        logger: logger,
        objectNameResolver: { [weak self] object in
            self?.getMIDIObjectName(object)
        }
    )

    // Source connections and the published list are only touched on this queue.
    private let midiQueue = DispatchQueue(label: "com.atomecorp.atome.midi.queue")
    private var connectedSources: [MIDIEndpointRef: MIDIUniqueID] = [:]
    private var publishedInputs: [[String: String]]?

    // Read by the CoreMIDI receive thread: the JSON port literal of each connected source.
    private let portLiteralLock = NSLock()
    private var portLiterals: [MIDIUniqueID: String] = [:]

    /// `includesHostInput`: the AUv3 also lists the MIDI its host routes into it.
    public init(includesHostInput: Bool = false) {
        self.includesHostInput = includesHostInput
        super.init()
    }

    deinit {
        cleanup()
    }

    // MARK: - Setup

    private func setupMIDI() -> Bool {
        if inputPort != 0 { return true }

        let clientStatus = MIDIClientCreateWithBlock("AtomeMIDIClient" as CFString, &midiClient) { [weak self] notification in
            self?.handleMIDINotification(notification)
        }
        guard clientStatus == noErr else {
            logger.error("Failed to create MIDI client: \(clientStatus)")
            return false
        }

        // MIDI 1.0 protocol: each message arrives as a 32-bit Universal MIDI Packet word.
        let inputStatus = MIDIInputPortCreateWithProtocol(midiClient, "AtomeMIDIInput" as CFString, ._1_0, &inputPort) { [weak self] eventList, srcConnRefCon in
            self?.receive(eventList, srcConnRefCon: srcConnRefCon)
        }
        guard inputStatus == noErr else {
            logger.error("Failed to create MIDI input port: \(inputStatus)")
            inputPort = 0
            return false
        }
        logger.info("MIDI input port created")
        return true
    }

    // MARK: - Input

    // The connection refCon carries the source unique id, tagged so that a zero id
    // still yields a non-nil pointer.
    private static func connectionRefCon(_ uniqueID: MIDIUniqueID) -> UnsafeMutableRawPointer? {
        UnsafeMutableRawPointer(bitPattern: UInt(UInt32(bitPattern: uniqueID)) | (1 << 32))
    }

    private static func uniqueID(fromRefCon refCon: UnsafeMutableRawPointer?) -> MIDIUniqueID? {
        guard let refCon else { return nil }
        return MIDIUniqueID(bitPattern: UInt32(truncatingIfNeeded: UInt(bitPattern: refCon)))
    }

    private func receive(_ eventList: UnsafePointer<MIDIEventList>, srcConnRefCon: UnsafeMutableRawPointer?) {
        guard let uniqueID = Self.uniqueID(fromRefCon: srcConnRefCon) else { return }
        portLiteralLock.lock()
        let port = portLiterals[uniqueID]
        portLiteralLock.unlock()
        // A message may still arrive from a source disconnected a moment ago.
        guard let port else { return }

        let timestamp = Date().timeIntervalSince1970
        let packetOffset = MemoryLayout<MIDIEventList>.offset(of: \.packet) ?? 8
        let wordsOffset = MemoryLayout<MIDIEventPacket>.offset(of: \.words) ?? 12
        var packet = UnsafeMutableRawPointer(mutating: eventList)
            .advanced(by: packetOffset)
            .assumingMemoryBound(to: MIDIEventPacket.self)
        for _ in 0..<eventList.pointee.numPackets {
            let words = UnsafeRawPointer(packet).advanced(by: wordsOffset).assumingMemoryBound(to: UInt32.self)
            forwardChannelVoiceMessages(words: words, count: Int(packet.pointee.wordCount), port: port, timestamp: timestamp)
            packet = MIDIEventPacketNext(packet)
        }
    }

    /// Forwards the MIDI 1.0 channel-voice messages (UMP type 0x2) of one packet:
    /// `[type:4][group:4][status:8][data1:8][data2:8]`. The page consumers (bindings,
    /// capture) only read channel messages, so clock and other system traffic stays native.
    private func forwardChannelVoiceMessages(words: UnsafePointer<UInt32>, count: Int, port: String, timestamp: Double) {
        var index = 0
        while index < count {
            let word = words[index]
            let messageType = word >> 28
            if messageType == 0x2 {
                WebViewManager.sendMIDIToJS(
                    data1: UInt8(truncatingIfNeeded: word >> 16),
                    data2: UInt8(truncatingIfNeeded: word >> 8) & 0x7F,
                    data3: UInt8(truncatingIfNeeded: word) & 0x7F,
                    timestamp: timestamp,
                    portLiteral: port
                )
            }
            index += Self.umpWordCount(messageType)
        }
    }

    private static func umpWordCount(_ messageType: UInt32) -> Int {
        switch messageType {
        case 0x0, 0x1, 0x2, 0x6, 0x7: return 1
        case 0x3, 0x4, 0x8, 0x9, 0xA: return 2
        case 0xB, 0xC: return 3
        default: return 4
        }
    }

    // MARK: - Sources

    /// Connects new sources, disconnects vanished ones and publishes the list to
    /// the page when it changed. `completion` receives the current list.
    private func refreshSources(completion: (([[String: String]]) -> Void)? = nil) {
        midiQueue.async { [weak self] in
            guard let self, self.inputPort != 0 else { return }
            var current: [MIDIEndpointRef: MIDIUniqueID] = [:]
            var inputs: [[String: String]] = self.includesHostInput ? [Self.hostInputPort] : []
            var literals: [MIDIUniqueID: String] = [:]
            for index in 0..<MIDIGetNumberOfSources() {
                let source = MIDIGetSource(index)
                guard source != 0 else { continue }
                var uniqueID: MIDIUniqueID = 0
                let idStatus = MIDIObjectGetIntegerProperty(source, kMIDIPropertyUniqueID, &uniqueID)
                guard idStatus == noErr else {
                    self.logger.error("MIDI source \(index) has no unique id: \(idStatus)")
                    continue
                }
                if self.connectedSources[source] != uniqueID {
                    let status = MIDIPortConnectSource(self.inputPort, source, Self.connectionRefCon(uniqueID))
                    guard status == noErr else {
                        self.logger.error("Failed to connect MIDI source \(index): \(status)")
                        continue
                    }
                }
                let port = ["id": "coremidi-\(UInt32(bitPattern: uniqueID))", "name": self.getMIDIObjectName(source, property: kMIDIPropertyDisplayName) ?? ""]
                current[source] = uniqueID
                inputs.append(port)
                literals[uniqueID] = Self.portLiteral(port)
            }
            for source in self.connectedSources.keys where current[source] == nil {
                MIDIPortDisconnectSource(self.inputPort, source)
            }
            self.connectedSources = current
            self.portLiteralLock.lock()
            self.portLiterals = literals
            self.portLiteralLock.unlock()
            if self.publishedInputs != inputs {
                self.publishedInputs = inputs
                self.logger.info("MIDI inputs: \(inputs.count)")
                WebViewManager.publishMIDIInputsToJS(inputs)
            }
            completion?(inputs)
        }
    }

    private static func portLiteral(_ port: [String: String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: port, options: [.sortedKeys]),
              let literal = String(data: data, encoding: .utf8) else { return "{}" }
        return literal
    }

    private func getMIDIObjectName(_ object: MIDIObjectRef, property: CFString = kMIDIPropertyName) -> String? {
        var name: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(object, property, &name)
        guard status == noErr, let cfString = name?.takeRetainedValue() else { return nil }
        return cfString as String
    }

    // MARK: - MIDI Notifications

    private func handleMIDINotification(_ notification: UnsafePointer<MIDINotification>) {
        switch notification.pointee.messageID {
        case .msgSetupChanged, .msgPropertyChanged:
            // Hot-plug, virtual source creation and renames: one refresh covers them.
            refreshSources()
        case .msgIOError:
            logger.error("MIDI IO error")
        default:
            break
        }
    }

    // MARK: - Cleanup

    private func cleanup() {
        if inputPort != 0 {
            MIDIPortDispose(inputPort)
            inputPort = 0
        }
        if midiClient != 0 {
            MIDIClientDispose(midiClient)
            midiClient = 0
        }
        midiQueue.sync {
            connectedSources.removeAll()
            publishedInputs = nil
        }
        portLiteralLock.lock()
        portLiterals.removeAll()
        portLiteralLock.unlock()
        logger.info("MIDI Controller cleaned up")
    }

    // MARK: - Public Interface

    /// Starts MIDI input (idempotent). `completion` receives the input list, or an
    /// error when CoreMIDI refused the client or the input port.
    /// CoreMIDI client creation starts the MIDI server and takes hundreds of
    /// milliseconds on first use: it runs on the MIDI queue, never on the caller's
    /// (main) thread — on the iPad it froze the first project opening ~0.8 s.
    public func startMIDIMonitoring(completion: ((Result<[[String: String]], Error>) -> Void)? = nil) {
        midiQueue.async { [weak self] in
            guard let self else { return }
            guard self.setupMIDI() else {
                completion?(.failure(NSError(domain: "MIDIController", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: "ios_midi_input_port_unavailable"
                ])))
                return
            }
            self.refreshSources { inputs in completion?(.success(inputs)) }
        }
    }

    /// Stop MIDI monitoring
    public func stopMIDIMonitoring() {
        cleanup()
    }

    // MARK: - MIDI Output Methods (JS->MIDI routing)

    /// Send MIDI Note On message to host
    public func sendNoteOn(note: UInt8, velocity: UInt8, channel: UInt8 = 0) {
        outputSender.sendNoteOn(note: note, velocity: velocity, channel: channel, port: inputPort)
    }

    /// Send MIDI Note Off message to host
    public func sendNoteOff(note: UInt8, velocity: UInt8, channel: UInt8 = 0) {
        outputSender.sendNoteOff(note: note, velocity: velocity, channel: channel, port: inputPort)
    }

    /// Send MIDI Control Change message to host
    public func sendControlChange(controller: UInt8, value: UInt8, channel: UInt8 = 0) {
        outputSender.sendControlChange(controller: controller, value: value, channel: channel, port: inputPort)
    }

    public func sendRaw(bytes: [UInt8]) {
        outputSender.sendRaw(bytes: bytes, port: inputPort)
    }
}
