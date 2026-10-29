import AVFoundation
import Foundation

/// App side of the native Kira engine (`NativeKiraEngine`): the audio session each command needs.
enum AppNativeKiraEngine {
    /// Commands that make sound: they need the playback audio session.
    static let soundingCommands: Set<String> = [
        "audio_load_clip", "audio_load_clip_from_bytes", "audio_play", "audio_play_instance", "audio_schedule_instances",
        "audio_render_clock", "audio_mix_apply", "audio_direct_apply"
    ]
    /// The device buffer the direct path asks for (`atome-audio-engine` `direct::BUFFER_FRAMES`):
    /// on iOS it is the session's IO buffer duration, not a stream setting.
    static let directBufferFrames = 64.0
    /// The session's own duration, put back when the direct path stops.
    static var sessionBufferDuration: TimeInterval?
}

extension AppNativeAudioController {
    /// An engine command on the audio queue, with the session it needs.
    func handleKiraEngineCommand(_ command: String,
                                 payload: [String: Any],
                                 completion: @escaping ([String: Any], String?) -> Void) {
        do {
            if AppNativeKiraEngine.soundingCommands.contains(command) {
                try acquirePlaybackAudioSessionConsumer()
            }
            var arguments = payload
            if command == "audio_load_clip" {
                // Clip paths are resolved in the app sandbox (`/file/…`, relative, absolute).
                let rawPath = resolveString(payload, ["path"])
                guard let url = resolveClipURL(rawPath) else {
                    complete(completion, payload: ["success": false], error: "Audio clip path does not exist: \(rawPath)")
                    return
                }
                arguments["path"] = url.path
            }
            if command == "audio_measure_input_latency" || command == "audio_direct_measure_latency" {
                measureInputLatency(command, arguments, completion: completion)
                return
            }
            if command == "audio_mix_apply" || command == "audio_direct_apply" {
                applyMixProgram(command, arguments, completion: completion)
                return
            }
            let (result, error) = NativeKiraEngine.run(command, arguments)
            complete(completion, payload: result, error: error)
        } catch {
            complete(completion, payload: ["success": false], error: error.localizedDescription)
        }
    }

    /// A strip whose IN is a live input opens the microphone: the capture
    /// session is held exactly while the program (the timeline's or the
    /// direct path's) has one. The direct path also shortens the IO buffer.
    private func applyMixProgram(_ command: String,
                                 _ arguments: [String: Any],
                                 completion: @escaping ([String: Any], String?) -> Void) {
        let strips = ((arguments["program"] as? [String: Any])?["strips"] as? [[String: Any]]) ?? []
        let wantsInput = strips.contains { ($0["input"] as? [String: Any])?["kind"] as? String == "live_audio" }
        let consumerId = command == "audio_direct_apply" ? "direct.live_input" : "mix.live_input"
        if command == "audio_direct_apply" { applyDirectBuffer(playing: !strips.isEmpty) }
        guard wantsInput else {
            let (result, error) = NativeKiraEngine.run(command, arguments)
            releaseAudioSessionConsumer(consumerId)
            complete(completion, payload: result, error: error)
            return
        }
        requestMicrophonePermission { granted in
            self.queue.async {
                guard granted else {
                    self.complete(completion, payload: ["success": false], error: "microphone_permission_denied")
                    return
                }
                do {
                    try self.acquireAudioSessionConsumer(consumerId, kind: .musicCapture, prefersBluetoothMicrophone: false)
                } catch {
                    self.complete(completion, payload: ["success": false], error: error.localizedDescription)
                    return
                }
                let (result, error) = NativeKiraEngine.run(command, arguments)
                if error != nil { self.releaseAudioSessionConsumer(consumerId) }
                self.complete(completion, payload: result, error: error)
            }
        }
    }

    /// The session's IO buffer: the direct path's while it plays, the session's own after.
    private func applyDirectBuffer(playing: Bool) {
        let session = AVAudioSession.sharedInstance()
        if playing {
            if AppNativeKiraEngine.sessionBufferDuration == nil {
                AppNativeKiraEngine.sessionBufferDuration = session.preferredIOBufferDuration
            }
            try? session.setPreferredIOBufferDuration(AppNativeKiraEngine.directBufferFrames / max(session.sampleRate, 1))
        } else if let duration = AppNativeKiraEngine.sessionBufferDuration {
            try? session.setPreferredIOBufferDuration(duration)
            AppNativeKiraEngine.sessionBufferDuration = nil
        }
        AppNativeAudioDiagnostics.log("direct_path buffer playing=\(playing) io=\(session.ioBufferDuration)")
    }

    /// Calibration plays and records at once: the microphone is held only for it.
    private func measureInputLatency(_ command: String,
                                     _ arguments: [String: Any],
                                     completion: @escaping ([String: Any], String?) -> Void) {
        requestMicrophonePermission { granted in
            self.queue.async {
                guard granted else {
                    self.complete(completion, payload: ["success": false], error: "microphone_permission_denied")
                    return
                }
                let consumerId = self.makeRecordingAudioSessionConsumerId()
                do {
                    try self.acquireAudioSessionConsumer(consumerId, kind: .musicCapture, prefersBluetoothMicrophone: false)
                } catch {
                    self.complete(completion, payload: ["success": false], error: error.localizedDescription)
                    return
                }
                let (result, error) = NativeKiraEngine.run(command, arguments)
                self.releaseAudioSessionConsumer(consumerId)
                self.complete(completion, payload: result, error: error)
            }
        }
    }
}
