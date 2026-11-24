import Foundation

/// The native Kira audio engine (Rust, `atome-audio-engine`, the engine of the
/// Tauri de sktop app): sample-accurate scheduled playback, render clock, mixer
/// graph, calibration (todo/audio_to_finalize §6.1). The app keeps the iOS audio
/// session; the AUv3 runs the engine on its host's clock (`atome_ios_audio_host_*`).
/// Shared by the app and the AUv3 extension.
enum NativeKiraEngine {
    /// Commands the engine answers, by the names the JS backend sends.
    static let commands: Set<String> = [
        "audio_load_clip", "audio_load_clip_from_bytes", "audio_probe_duration_from_bytes", "audio_has_clip", "audio_play", "audio_play_instance",
        "audio_schedule_instances", "audio_render_clock", "audio_output_hold", "audio_measure_input_latency",
        "audio_mix_apply", "audio_mix_levels", "audio_mix_readings", "audio_mix_devices", "audio_mix_cut_tail", "audio_mix_asset_load", "audio_mix_asset_unload", "audio_mix_module_state",
        "audio_instrument_sample_load", "audio_instrument",
        "audio_direct_apply", "audio_direct_levels", "audio_direct_readings", "audio_direct_cut_tail", "audio_direct_module_state", "audio_direct_measure_latency",
        // A take of a strip's REC point (R-183): the engine records it on its own (recorder_strip.rs).
        "audio_record_strip_start", "audio_record_strip_stop",
        // Its live scope, read by the page while the take runs (record_audio_api.js: the Timeline's waveform).
        "audio_get_scope",
        "audio_stop", "audio_stop_instance", "audio_set_voice_end", "audio_destroy_clip", "audio_set_volume", "audio_set_pan", "audio_set_playback_rate",
        // The voice session (start and stop also own the microphone: AppNativeVoiceEngine.swift).
        "audio_voice_set_phrases", "audio_voice_set_speaking", "audio_voice_set_listening", "audio_voice_set_wake_verifier", "audio_voice_read"
    ]

    /// Called after a mixer graph is applied (console or direct path): an AUv3 tells its host its new latency.
    static var graphApplied: (() -> Void)?

    /// Runs one engine command; `(result, nil)` or `(["success": false], error)`.
    static func run(_ name: String, _ payload: [String: Any]) -> ([String: Any], String?) {
        if name == "audio_load_clip_from_bytes" || name == "audio_probe_duration_from_bytes" { return runWithBytes(name, payload) }
        let data = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data("{}".utf8)
        let arguments = String(data: data, encoding: .utf8) ?? "{}"
        let root = SandboxPathValidator.primaryRoot()?.path ?? ""
        return read(name, atome_ios_audio_command(name, arguments, root))
    }

    /// A command on a sound file's bytes (a clip loaded, a duration read): the page sends them in base64 (the one
    /// binary form a script message carries), they reach the engine as bytes, never as JSON (a 90 MB AIFF as a JSON
    /// array killed the app, 16 Nov. 2026).
    private static func runWithBytes(_ name: String, _ payload: [String: Any]) -> ([String: Any], String?) {
        guard let encoded = payload["bytesBase64"] as? String, let bytes = Data(base64Encoded: encoded), !bytes.isEmpty else {
            return (["success": false], "audio_clip_bytes_base64_invalid")
        }
        if name == "audio_probe_duration_from_bytes" {
            let reply = bytes.withUnsafeBytes { raw in
                atome_ios_audio_probe_duration_bytes(raw.bindMemory(to: UInt8.self).baseAddress, raw.count)
            }
            return read(name, reply)
        }
        guard let id = payload["id"] as? String, !id.isEmpty else { return (["success": false], "audio_clip_id_missing") }
        let reply = bytes.withUnsafeBytes { raw in
            atome_ios_audio_load_clip_bytes(id, raw.bindMemory(to: UInt8.self).baseAddress, raw.count)
        }
        return read(name, reply)
    }

    /// The engine's reply, released here.
    private static func read(_ name: String, _ reply: UnsafeMutablePointer<CChar>?) -> ([String: Any], String?) {
        guard let reply else {
            return (["success": false], "audio_engine_no_reply")
        }
        defer { atome_ios_audio_string_free(reply) }
        guard let object = try? JSONSerialization.jsonObject(with: Data(String(cString: reply).utf8)) as? [String: Any] else {
            return (["success": false], "audio_engine_reply_invalid")
        }
        if object["ok"] as? Bool == true {
            if name == "audio_mix_apply" || name == "audio_direct_apply" { graphApplied?() }
            return ((object["result"] as? [String: Any]) ?? ["success": true], nil)
        }
        return (["success": false], (object["error"] as? String) ?? "audio_engine_failed")
    }
}
