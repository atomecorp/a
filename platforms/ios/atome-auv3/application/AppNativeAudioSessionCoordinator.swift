import AVFoundation
import Foundation

/// Applies the standalone application session policy to the shared session.
///
/// Every mutation runs on the controller `queue` and compares the session's
/// *current* category, mode and options before changing anything: a boolean
/// "session ready" flag cannot see a session that another component (WebKit, a
/// VoIP stack, an interruption) reconfigured in the meantime.
extension AppNativeAudioController {
    static let playbackAudioSessionConsumerId = "playback"

    func acquirePlaybackAudioSessionConsumer() throws {
        try acquireAudioSessionConsumer(Self.playbackAudioSessionConsumerId, kind: .playback)
    }

    func acquireAudioSessionConsumer(_ consumerId: String,
                                     kind: AppNativeAudioConsumerKind,
                                     prefersBluetoothMicrophone: Bool = false) throws {
        audioSessionConsumers.acquire(
            consumerId,
            kind: kind,
            prefersBluetoothMicrophone: prefersBluetoothMicrophone
        )
        try applyAudioSessionPlan(
            audioSessionConsumers.plan,
            transition: "acquire:\(consumerId)"
        )
    }

    /// Drops one consumer and restores the policy the remaining consumers
    /// require. Releasing the last microphone consumer therefore returns the
    /// session to its playback profile instead of leaving a capture profile.
    func releaseAudioSessionConsumer(_ consumerId: String) {
        guard audioSessionConsumers.release(consumerId) else { return }
        applyCurrentAudioSessionPlan(transition: "release:\(consumerId)")
    }

    func releaseAllAudioSessionConsumers(transition: String) {
        audioSessionConsumers.releaseAll()
        applyCurrentAudioSessionPlan(transition: transition)
    }

    /// Re-asserts the plan required by the current consumers.
    func applyCurrentAudioSessionPlan(transition: String) {
        do {
            try applyAudioSessionPlan(audioSessionConsumers.plan, transition: transition)
        } catch {
            AppNativeAudioDiagnostics.log(
                "session \(transition) apply_failed error=\(error.localizedDescription)"
            )
        }
    }

    private func applyAudioSessionPlan(_ plan: AppNativeAudioSessionPlan,
                                       transition: String) throws {
        let session = AVAudioSession.sharedInstance()
        let before = audioSessionDiagnosticSnapshot(session: session)
        // Someone else records (WebKit opened the microphone for the assistant, R-108): playing a sound
        // must not cut that recording by switching the session back to playback. The session is kept as
        // that recorder set it, its output held off the receiver; the plan applies once it has stopped.
        if !plan.category.recordsAudio, session.category.recordsAudio, appliedAudioSessionCategory != session.category {
            if !systemOwnsAudioActivation { try session.setActive(true) }
            keepOutputOffReceiver()
            AppNativeAudioDiagnostics.log(
                "session \(transition) reason=\(plan.reason) kept_foreign_recording session=\(before)"
            )
            return
        }
        let needsConfiguration = session.category != plan.category
            || session.mode != plan.mode
            || session.categoryOptions != plan.options
        if needsConfiguration {
            try session.setCategory(plan.category, mode: plan.mode, options: plan.options)
        }
        appliedAudioSessionCategory = plan.category
        // Activation is idempotent and also recovers a session the system
        // deactivated through an interruption.
        if !systemOwnsAudioActivation { try session.setActive(true) }
        AppNativeAudioDiagnostics.log(
            "session \(transition) reason=\(plan.reason) configured=\(needsConfiguration)"
                + " before=\(before) after=\(audioSessionDiagnosticSnapshot(session: session))"
        )
    }

    /// Category, mode, options, routes, negotiated formats and active
    /// microphone consumers, in one line. A sample rate alone does not prove
    /// the Bluetooth profile that is actually in use.
    func audioSessionDiagnosticSnapshot(session: AVAudioSession = .sharedInstance()) -> String {
        let inputs = session.currentRoute.inputs.map { port -> String in
            var text = "\(port.portType.rawValue)[\(port.portName)]:\(port.channels?.count ?? 0)ch"
            if #available(iOS 26.0, *), let extensionInfo = port.bluetoothMicrophoneExtension {
                let capability = extensionInfo.highQualityRecording
                let state = capability.isSupported
                    ? (capability.isEnabled ? "enabled" : "supported")
                    : "unsupported"
                text += ":hq_recording=\(state)"
            }
            return text
        }
        let outputs = session.currentRoute.outputs.map { port in
            "\(port.portType.rawValue):\(port.channels?.count ?? 0)ch"
        }
        return "category=\(session.category.rawValue)"
            + " mode=\(session.mode.rawValue)"
            + " options=[\(Self.describeAudioSessionOptions(session.categoryOptions))]"
            + " sample_rate=\(session.sampleRate)"
            + " io_buffer=\(String(format: "%.4f", session.ioBufferDuration))"
            + " inputs=[\(inputs.joined(separator: "|"))]"
            + " outputs=[\(outputs.joined(separator: "|"))]"
            + " mic_consumers=[\(audioSessionConsumers.captureConsumerIds.joined(separator: ","))]"
    }

    static func describeAudioSessionOptions(_ options: AVAudioSession.CategoryOptions) -> String {
        var names: [String] = []
        if options.contains(.mixWithOthers) { names.append("mixWithOthers") }
        if options.contains(.duckOthers) { names.append("duckOthers") }
        if options.contains(.allowBluetoothHFP) { names.append("allowBluetoothHFP") }
        if options.contains(.allowBluetoothA2DP) { names.append("allowBluetoothA2DP") }
        if options.contains(.allowAirPlay) { names.append("allowAirPlay") }
        if options.contains(.defaultToSpeaker) { names.append("defaultToSpeaker") }
        if options.contains(.interruptSpokenAudioAndMixWithOthers) { names.append("interruptSpokenAudioAndMixWithOthers") }
        if options.contains(.overrideMutedMicrophoneInterruption) { names.append("overrideMutedMicrophoneInterruption") }
        if #available(iOS 26.0, *), options.contains(.bluetoothHighQualityRecording) {
            names.append("bluetoothHighQualityRecording")
        }
        return names.isEmpty ? "none" : names.joined(separator: ",")
    }
}

extension AVAudioSession.Category {
    /// A category with an input route: the session is recording or ready to.
    var recordsAudio: Bool { self == .playAndRecord || self == .record || self == .multiRoute }
}

// A video take with sound holds the session as a capture (AppNativeVideoRecorder.audioSessionOwner).
extension AppNativeAudioController: AppNativeCaptureAudioSessionOwner {
    func acquireCaptureAudioSession(_ consumerId: String) throws {
        try queue.sync { try acquireAudioSessionConsumer(consumerId, kind: .musicCapture) }
    }

    func releaseCaptureAudioSession(_ consumerId: String) {
        queue.async { self.releaseAudioSessionConsumer(consumerId) }
    }
}
