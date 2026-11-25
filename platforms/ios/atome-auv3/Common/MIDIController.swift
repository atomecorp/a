//
//  MIDIController.swift
//  atome
//
//  Created by Assistant on 2025-08-01.
//  Copyright © 2025 atomecorp. All rights reserved.
//

import Foundation
import CoreMIDI

/// The ports listed to the page: `inputs` and `outputs`, each `["id": …, "name": …]`.
public typealias MIDIPortList = [String: [[String: String]]]
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
    // MIDISend needs an output port: an input port is refused (kMIDIWrongPortType), so nothing ever left.
    private var outputPort: MIDIPortRef = 0
    private let includesHostInput: Bool

    private let logger = Logger(subsystem: "com.atomecorp.atome", category: "MIDI")
    private lazy var outputSender = MIDIOutputSender(
        logger: logger,
        objectNameResolver: { [weak self] object in
            self?.getMIDIObjectName(object)
        }
    )

    // Every field below is only touched on this queue (the CoreMIDI receive thread reads `portLiterals` alone).
    private let midiQueue = DispatchQueue(label: "com.atomecorp.atome.midi.queue")

    private var connectedSources: [MIDIEndpointRef: MIDIUniqueID] = [:]
    private var publishedPorts: MIDIPortList?
    // Non-nil while the CoreMIDI client is being created: the callers waiting for that start.
    private var pendingStarts: [(Result<MIDIPortList, Error>) -> Void]?
    // Bumped by every stop, so a client created for a start that was stopped meanwhile is disposed, not kept.
    private var startGeneration = 0

    // Read by the CoreMIDI receive thread: the JSON port literal of each connected source.
    private let portLiteralLock = NSLock()
    private var portLiterals: [MIDIUniqueID: String] = [:]

    /// `includesHostInput`: the AUv3 also lists the MIDI its host routes into it.
    public init(includesHostInput: Bool = false) {
        self.includesHostInput = includesHostInput
        super.init()
    }

    deinit {
        // Nothing else holds the controller any more (every callback captures it weakly): its resources are
        // released here directly. Going through `midiQueue` would deadlock when the last release happens on it.
        disposeResources()
    }

    // MARK: - Setup

    /// Second half of a start, on `midiQueue`: the client was created on the notification thread.
    private func finishStart(client: MIDIClientRef, status: OSStatus, generation: Int) {
        guard generation == startGeneration else {
            if status == noErr { MIDIClientDispose(client) }
            return
        }
        let waiting = pendingStarts ?? []
        pendingStarts = nil
        guard createPorts(client: client, status: status) else {
            let error = NSError(domain: "MIDIController", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "ios_midi_input_port_unavailable"
            ])
            waiting.forEach { $0(.failure(error)) }
            return
        }
        let ports = connectSources()
        waiting.forEach { $0(.success(ports)) }
    }

    private func createPorts(client: MIDIClientRef, status clientStatus: OSStatus) -> Bool {
        guard clientStatus == noErr else {
            logger.error("Failed to create MIDI client: \(clientStatus)")
            return false
        }
        midiClient = client
        // MIDI 1.0 protocol: each message arrives as a 32-bit Universal MIDI Packet word.
        let inputStatus = MIDIInputPortCreateWithProtocol(midiClient, "AtomeMIDIInput" as CFString, ._1_0, &inputPort) { [weak self] eventList, srcConnRefCon in
            self?.receive(eventList, srcConnRefCon: srcConnRefCon)
        }
        guard inputStatus == noErr else {
            logger.error("Failed to create MIDI input port: \(inputStatus)")
            disposeResources()
            return false
        }
        let outputStatus = MIDIOutputPortCreate(midiClient, "AtomeMIDIOutput" as CFString, &outputPort)
        guard outputStatus == noErr else {
            logger.error("Failed to create MIDI output port: \(outputStatus)")
            disposeResources()
            return false
        }
        logger.info("MIDI input and output ports created")
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

    /// Forwards the MIDI 1.0 messages of one packet, channel voice (UMP type 0x2) and system
    /// (type 0x1: the clock, Start, Continue, Stop, the song position, R-379 « Synchro MIDI »):
    /// `[type:4][group:4][status:8][data1:8][data2:8]`. The page routes system messages to its
    /// sync alone (midi_binding_service.js), never to the bindings.
    private func forwardChannelVoiceMessages(words: UnsafePointer<UInt32>, count: Int, port: String, timestamp: Double) {
        var index = 0
        while index < count {
            let word = words[index]
            let messageType = word >> 28
            if messageType == 0x2 || messageType == 0x1 {
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

    /// Refreshes the sources after a MIDI setup change (hot-plug, a virtual source, a rename).
    private func refreshSources() {
        midiQueue.async { [weak self] in
            guard let self, self.inputPort != 0 else { return }
            self.connectSources()
        }
    }

    /// On `midiQueue`, with the input port open: connects new sources, disconnects vanished
    /// ones, publishes the inputs and the outputs (each CoreMIDI destination, R-379) to the
    /// page when they changed and returns them.
    @discardableResult
    private func connectSources() -> MIDIPortList {
        var current: [MIDIEndpointRef: MIDIUniqueID] = [:]
        var inputs: [[String: String]] = includesHostInput ? [Self.hostInputPort] : []
        var literals: [MIDIUniqueID: String] = [:]
        for index in 0..<MIDIGetNumberOfSources() {
            let source = MIDIGetSource(index)
            guard source != 0 else { continue }
            var uniqueID: MIDIUniqueID = 0
            let idStatus = MIDIObjectGetIntegerProperty(source, kMIDIPropertyUniqueID, &uniqueID)
            guard idStatus == noErr else {
                logger.error("MIDI source \(index) has no unique id: \(idStatus)")
                continue
            }
            if connectedSources[source] != uniqueID {
                let status = MIDIPortConnectSource(inputPort, source, Self.connectionRefCon(uniqueID))
                guard status == noErr else {
                    logger.error("Failed to connect MIDI source \(index): \(status)")
                    continue
                }
            }
            let port = ["id": "coremidi-\(UInt32(bitPattern: uniqueID))", "name": getMIDIObjectName(source, property: kMIDIPropertyDisplayName) ?? ""]
            current[source] = uniqueID
            inputs.append(port)
            literals[uniqueID] = Self.portLiteral(port)
        }
        for source in connectedSources.keys where current[source] == nil {
            MIDIPortDisconnectSource(inputPort, source)
        }
        connectedSources = current
        portLiteralLock.lock()
        portLiterals = literals
        portLiteralLock.unlock()
        // In a host, Atome's MIDI leaves by the plugin's own output: no destination of its own.
        let outputs = WebViewManager.runningInExtension ? [] : outputSender.destinations()
        let ports: MIDIPortList = ["inputs": inputs, "outputs": outputs]
        if publishedPorts != ports {
            publishedPorts = ports
            logger.info("MIDI inputs: \(inputs.count), outputs: \(outputs.count)")
            WebViewManager.publishMIDIPortsToJS(ports)
        }
        return ports
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

    /// Releases the client, the ports and the connection state. Called on `midiQueue`, or from `deinit`.
    private func disposeResources() {
        if inputPort != 0 {
            MIDIPortDispose(inputPort)
            inputPort = 0
        }
        if outputPort != 0 {
            MIDIPortDispose(outputPort)
            outputPort = 0
        }
        if midiClient != 0 {
            MIDIClientDispose(midiClient)
            midiClient = 0
        }
        connectedSources.removeAll()
        publishedPorts = nil
        portLiteralLock.lock()
        portLiterals.removeAll()
        portLiteralLock.unlock()
    }

    // MARK: - Public Interface

    /// Starts MIDI input (idempotent). `completion` receives the input list, or an
    /// error when CoreMIDI refused the client or the input port, or when the start
    /// was stopped before it finished.
    /// CoreMIDI client creation starts the MIDI server and takes hundreds of
    /// milliseconds on first use: it runs on the notification thread, never on the
    /// caller's (main) thread — on the iPad it froze the first project opening ~0.8 s.
    /// No thread ever waits for another here (a wait on the notification thread was
    /// a priority inversion): each step hands the next one over asynchronously.
    public func startMIDIMonitoring(completion: ((Result<MIDIPortList, Error>) -> Void)? = nil) {
        let finish: (Result<MIDIPortList, Error>) -> Void = { completion?($0) }
        midiQueue.async { [weak self] in
            guard let self else { return }
            if self.inputPort != 0 {
                finish(.success(self.connectSources()))
                return
            }
            if self.pendingStarts != nil {
                self.pendingStarts?.append(finish)
                return
            }
            self.pendingStarts = [finish]
            let generation = self.startGeneration
            MIDINotificationThread.shared.perform { [weak self] in
                var client: MIDIClientRef = 0
                let status = MIDIClientCreateWithBlock("AtomeMIDIClient" as CFString, &client) { [weak self] notification in
                    self?.handleMIDINotification(notification)
                }
                guard let self else {
                    if status == noErr { MIDIClientDispose(client) }
                    return
                }
                self.midiQueue.async {
                    self.finishStart(client: client, status: status, generation: generation)
                }
            }
        }
    }

    /// Stops MIDI input: the client and its ports are released, a start under way is cancelled.
    public func stopMIDIMonitoring() {
        midiQueue.async { [weak self] in
            guard let self else { return }
            self.startGeneration += 1
            let cancelled = self.pendingStarts ?? []
            self.pendingStarts = nil
            self.disposeResources()
            let error = NSError(domain: "MIDIController", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "ios_midi_stopped"
            ])
            cancelled.forEach { $0(.failure(error)) }
            self.logger.info("MIDI Controller cleaned up")
        }
    }

    // MARK: - MIDI Output Methods (JS->MIDI routing)

    /// Send MIDI Note On message to host
    public func sendNoteOn(note: UInt8, velocity: UInt8, channel: UInt8 = 0) {
        outputSender.sendNoteOn(note: note, velocity: velocity, channel: channel, port: outputPort)
    }

    /// Send MIDI Note Off message to host
    public func sendNoteOff(note: UInt8, velocity: UInt8, channel: UInt8 = 0) {
        outputSender.sendNoteOff(note: note, velocity: velocity, channel: channel, port: outputPort)
    }

    /// Send MIDI Control Change message to host
    public func sendControlChange(controller: UInt8, value: UInt8, channel: UInt8 = 0) {
        outputSender.sendControlChange(controller: controller, value: value, channel: channel, port: outputPort)
    }

    /// `destinationId`: one destination (`coremidi-out-<uniqueID>`), else every one; `delayMs`: it leaves that much later.
    public func sendRaw(bytes: [UInt8], destinationId: String? = nil, delayMs: Double = 0) {
        outputSender.sendRaw(bytes: bytes, port: outputPort, destinationId: destinationId, delayMs: delayMs)
    }
}

/// The thread whose run loop hosts the CoreMIDI client's notifications. CoreMIDI calls a client's notify block on the
/// run loop current when the client was created; a GCD queue runs none, so a client made on a queue never heard a
/// device plugged in (R-286, user 24 Nov. 2026: a MIDI device connected while the app runs did not join the list).
/// Work is handed to it asynchronously: nobody ever waits for this thread, so its QoS can never invert a caller's.
private final class MIDINotificationThread: Thread {
    static let shared: MIDINotificationThread = {
        let thread = MIDINotificationThread()
        thread.name = "com.atomecorp.atome.midi.notifications"
        thread.start()
        return thread
    }()

    private let lock = NSLock()
    private var runLoop: CFRunLoop?
    // Work handed over before the run loop was known; run as soon as the thread starts.
    private var pending: [() -> Void] = []

    override func main() {
        // A run loop with no source returns at once: a port keeps it running for the life of the process.
        RunLoop.current.add(Port(), forMode: .default)
        lock.lock()
        runLoop = CFRunLoopGetCurrent()
        let early = pending
        pending.removeAll()
        lock.unlock()
        early.forEach { $0() }
        RunLoop.current.run()
    }

    func perform(_ work: @escaping () -> Void) {
        lock.lock()
        guard let runLoop else {
            pending.append(work)
            lock.unlock()
            return
        }
        lock.unlock()
        CFRunLoopPerformBlock(runLoop, CFRunLoopMode.defaultMode.rawValue, work)
        CFRunLoopWakeUp(runLoop)
    }
}
