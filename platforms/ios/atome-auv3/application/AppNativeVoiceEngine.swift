import Foundation

/// The native voice engine (Rust, atome-audio-engine `voice`): Swift keeps the microphone (the wake
/// capture, under the app's audio session policy) and pushes its 16 kHz PCM every 40 ms; the engine
/// turns it into turns, phrases and the wake phrase. Only events cross to JavaScript
/// (todo/refonte_assistant_vocal.md §4.2). The models ship in the runtime package.
extension AppNativeAudioController {
    private static let voicePumpMilliseconds = 40

    func startVoiceEngine(completion: @escaping ([String: Any], String?) -> Void) {
        guard voicePump == nil else { complete(completion, payload: ["active": false], error: "voice_session_busy"); return }
        guard let assets = Bundle.main.resourceURL?.appendingPathComponent("atome_runtime/src/assets/voice").path else {
            complete(completion, payload: ["active": false], error: "voice_models_missing"); return
        }
        let (_, startError) = NativeKiraEngine.run("audio_voice_start", ["modelsRoot": assets, "ownCapture": false])
        if let startError { complete(completion, payload: ["active": false], error: startError); return }
        wakeCaptureFailed = false
        startWakeCapture(payload: ["sampleRate": 16000]) { result, error in
            self.queue.async {
                if let error {
                    _ = NativeKiraEngine.run("audio_voice_stop", [:])
                    self.complete(completion, payload: ["active": false], error: error)
                    return
                }
                let pump = DispatchSource.makeTimerSource(queue: self.queue)
                pump.schedule(deadline: .now(), repeating: .milliseconds(Self.voicePumpMilliseconds))
                // The controller is the app-wide singleton; stopVoiceEngine cancels and releases the pump.
                pump.setEventHandler { self.pushVoiceSamples() }
                self.voicePump = pump
                pump.resume()
                self.complete(completion, payload: result)
            }
        }
    }

    private func pushVoiceSamples() {
        guard !wakeCaptureSamples.isEmpty else { return }
        let samples = wakeCaptureSamples.map { Float($0) / 32768 }
        wakeCaptureSamples.removeAll(keepingCapacity: true)
        _ = samples.withUnsafeBufferPointer { atome_ios_voice_push($0.baseAddress, $0.count) }
    }

    func stopVoiceEngine() -> ([String: Any], String?) {
        // The capture is the voice session's only while its pump runs.
        if let pump = voicePump {
            pump.cancel()
            voicePump = nil
            stopWakeCapture()
        }
        return NativeKiraEngine.run("audio_voice_stop", [:])
    }
}
