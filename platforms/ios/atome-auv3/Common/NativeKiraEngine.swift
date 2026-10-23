import Foundation

/// The native Kira audio engine (Rust, `atome-audio-engine`, the engine of the
/// Tauri desktop app): sample-accurate scheduled playback, render clock, mixer
/// graph, calibration (todo/audio_to_finalize §6.1). The app keeps the iOS audio
/// session; the AUv3 runs the engine on its host's clock (`atome_ios_audio_host_*`).
/// Shared by the app and the AUv3 extension.
enum NativeKiraEngine {
    /// Commands the engine answers, by the names the JS backend sends.
    static let commands: Set<String> = [
        "audio_load_clip", "audio_load_clip_from_bytes", "audio_has_clip", "audio_play", "audio_play_instance",
        "audio_schedule_instances", "audio_render_clock", "audio_measure_input_latency",
        "audio_mix_apply", "audio_mix_levels", "audio_mix_devices", "audio_mix_cut_tail", "audio_mix_module_state",
        "audio_stop", "audio_stop_instance", "audio_set_voice_end", "audio_destroy_clip", "audio_set_volume", "audio_set_pan", "audio_set_playback_rate",
        // The voice session (start and stop also own the microphone: AppNativeVoiceEngine.swift).
        "audio_voice_set_phrases", "audio_voice_set_speaking", "audio_voice_set_listening", "audio_voice_set_wake_verifier", "audio_voice_read"
    ]

    /// Runs one engine command; `(result, nil)` or `(["success": false], error)`.
    static func run(_ name: String, _ payload: [String: Any]) -> ([String: Any], String?) {
        let data = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data("{}".utf8)
        let arguments = String(data: data, encoding: .utf8) ?? "{}"
        let root = SandboxPathValidator.primaryRoot()?.path ?? ""
        guard let reply = atome_ios_audio_command(name, arguments, root) else {
            return (["success": false], "audio_engine_no_reply")
        }
        defer { atome_ios_audio_string_free(reply) }
        guard let object = try? JSONSerialization.jsonObject(with: Data(String(cString: reply).utf8)) as? [String: Any] else {
            return (["success": false], "audio_engine_reply_invalid")
        }
        if object["ok"] as? Bool == true {
            return ((object["result"] as? [String: Any]) ?? ["success": true], nil)
        }
        return (["success": false], (object["error"] as? String) ?? "audio_engine_failed")
    }
}
