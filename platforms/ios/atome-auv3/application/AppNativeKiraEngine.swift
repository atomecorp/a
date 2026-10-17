import AVFoundation
import Foundation

/// App side of the native Kira engine (`NativeKiraEngine`): the audio session each command needs.
enum AppNativeKiraEngine {
    /// Commands that make sound: they need the playback audio session.
    static let soundingCommands: Set<String> = [
        "audio_load_clip", "audio_load_clip_from_bytes", "audio_play", "audio_play_instance", "audio_schedule_instances",
        "audio_render_clock", "audio_mix_apply"
    ]
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
            if command == "audio_measure_input_latency" {
                measureInputLatency(arguments, completion: completion)
                return
            }
            if command == "audio_mix_apply" {
                applyMixProgram(arguments, completion: completion)
                return
            }
            let (result, error) = NativeKiraEngine.run(command, arguments)
            complete(completion, payload: result, error: error)
        } catch {
            complete(completion, payload: ["success": false], error: error.localizedDescription)
        }
    }

    /// A strip whose IN is a live input opens the microphone: the capture
    /// session is held exactly while the mix program has one.
    private func applyMixProgram(_ arguments: [String: Any],
                                 completion: @escaping ([String: Any], String?) -> Void) {
        let strips = ((arguments["program"] as? [String: Any])?["strips"] as? [[String: Any]]) ?? []
        let wantsInput = strips.contains { ($0["input"] as? [String: Any])?["kind"] as? String == "live_audio" }
        let consumerId = "mix.live_input"
        guard wantsInput else {
            let (result, error) = NativeKiraEngine.run("audio_mix_apply", arguments)
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
                let (result, error) = NativeKiraEngine.run("audio_mix_apply", arguments)
                if error != nil { self.releaseAudioSessionConsumer(consumerId) }
                self.complete(completion, payload: result, error: error)
            }
        }
    }

    /// Calibration plays and records at once: the microphone is held only for it.
    private func measureInputLatency(_ arguments: [String: Any],
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
                let (result, error) = NativeKiraEngine.run("audio_measure_input_latency", arguments)
                self.releaseAudioSessionConsumer(consumerId)
                self.complete(completion, payload: result, error: error)
            }
        }
    }
}
