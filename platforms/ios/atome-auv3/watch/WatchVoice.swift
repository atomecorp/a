import AVFoundation
import WatchConnectivity
import os.log

// The watch's microphone and speaker for a conversation opened on the watch (lot W6): the wrist's voice goes to the iPhone's page
// as 16 kHz 16-bit mono PCM (eVe/domains/watch/watch_voice.js), which the assistant hears; her answer comes back the same way and
// plays here when no headphones are on the iPhone (decision 5). Voice packets start with their way ("m" up, "s" down).
final class WatchVoice {
    static let shared = WatchVoice()
    private static let log = Logger(subsystem: "atome", category: "WatchVoice")
    private static let microphoneTag: UInt8 = 0x6D
    static let voiceTag: UInt8 = 0x73
    private static let rate: Double = 16000
    // A tenth of a second a packet.
    private static let packetFrames: AVAudioFrameCount = 1600

    private let queue = DispatchQueue(label: "one.atome.watch.voice")
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let wire = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: rate, channels: 1, interleaved: true)!
    private let voice = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 1, interleaved: false)!
    private var running = false

    func start() {
        AVAudioApplication.requestRecordPermission { granted in
            guard granted else { return Self.log.error("Watch microphone refused") }
            self.queue.async { self.begin() }
        }
    }

    func stop() {
        queue.async {
            guard self.running else { return }
            self.running = false
            self.engine.inputNode.removeTap(onBus: 0)
            self.player.stop()
            self.engine.stop()
            do { try AVAudioSession.sharedInstance().setActive(false) }
            catch { Self.log.error("Watch audio not released: \(error.localizedDescription, privacy: .public)") }
        }
    }

    // Her voice, from the iPhone.
    func play(_ pcm: Data) {
        queue.async {
            guard self.running, let buffer = self.floatBuffer(pcm) else { return }
            self.player.scheduleBuffer(buffer)
        }
    }

    private func begin() {
        guard !running else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat)
            try session.setActive(true)
            if engine.attachedNodes.contains(player) == false { engine.attach(player) }
            engine.connect(player, to: engine.mainMixerNode, format: voice)
            let input = engine.inputNode, source = input.outputFormat(forBus: 0)
            guard let converter = AVAudioConverter(from: source, to: wire) else { return Self.log.error("Watch microphone format unsupported") }
            let frames = AVAudioFrameCount(Double(Self.packetFrames) * source.sampleRate / Self.rate)
            input.installTap(onBus: 0, bufferSize: frames, format: source) { [weak self] buffer, _ in self?.send(buffer, converter) }
            try engine.start()
            player.play()
            running = true
        } catch {
            Self.log.error("Watch voice not started: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func send(_ buffer: AVAudioPCMBuffer, _ converter: AVAudioConverter) {
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * Self.rate / buffer.format.sampleRate) + 1
        guard let out = AVAudioPCMBuffer(pcmFormat: wire, frameCapacity: capacity), let samples = out.int16ChannelData else { return }
        var given = false, failure: NSError?
        converter.convert(to: out, error: &failure) { _, status in
            if given { status.pointee = .noDataNow; return nil }
            given = true
            status.pointee = .haveData
            return buffer
        }
        if let failure { return Self.log.error("Watch microphone not converted: \(failure.localizedDescription, privacy: .public)") }
        guard out.frameLength > 0, WCSession.default.isReachable else { return }
        let pcm = Data(bytes: samples[0], count: Int(out.frameLength) * 2)
        WCSession.default.sendMessageData(Data([Self.microphoneTag]) + pcm, replyHandler: nil) { error in
            Self.log.error("Watch microphone not sent: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func floatBuffer(_ pcm: Data) -> AVAudioPCMBuffer? {
        let frames = pcm.count / 2
        guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: voice, frameCapacity: AVAudioFrameCount(frames)),
              let channel = buffer.floatChannelData?[0] else { return nil }
        pcm.withUnsafeBytes { raw in
            let source = raw.bindMemory(to: Int16.self)
            for index in 0..<frames { channel[index] = Float(Int16(littleEndian: source[index])) / 32768 }
        }
        buffer.frameLength = AVAudioFrameCount(frames)
        return buffer
    }
}
