import Foundation

extension AppNativeAudioController {
    func startRecordingScopeMonitor(sessionId: String) {
        DispatchQueue.main.async {
            self.recordingScopeMonitorGeneration &+= 1
            self.recordingScopeLastSequence = 0
            self.scheduleRecordingScopeRead(
                sessionId: sessionId,
                generation: self.recordingScopeMonitorGeneration
            )
        }
    }

    func stopRecordingScopeMonitor() {
        DispatchQueue.main.async {
            self.recordingScopeMonitorGeneration &+= 1
            self.recordingScopeLastSequence = 0
        }
    }

    func scheduleRecordingScopeRead(sessionId: String, generation: UInt64) {
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(34)) { [weak self] in
            guard let self,
                  self.recordingScopeMonitorGeneration == generation else { return }
            self.publishRecordingScope(sessionId: sessionId)
            self.scheduleRecordingScopeRead(sessionId: sessionId, generation: generation)
        }
    }

    func publishRecordingScope(sessionId: String) {
        // The engine's lock-free scope of the recording input (atome-audio-engine).
        let (scope, error) = NativeKiraEngine.run("audio_get_scope", [:])
        guard error == nil, scope["available"] as? Bool == true,
              let sequence = (scope["sequence"] as? NSNumber)?.uint64Value,
              sequence != recordingScopeLastSequence,
              let pairs = scope["pairs"] as? [[NSNumber]],
              pairs.count == recordingScopeBinCount else { return }
        recordingScopeLastSequence = sequence
        for (index, pair) in pairs.enumerated() where pair.count == 2 {
            recordingScopePairs[index * 2] = pair[0].floatValue
            recordingScopePairs[(index * 2) + 1] = pair[1].floatValue
        }
        emitRecordingEvent(type: "record_scope", payload: [
            "session_id": sessionId,
            "sequence": NSNumber(value: sequence),
            "sample_rate": scope["sample_rate"] ?? 0,
            "channels": scope["channels"] ?? 0,
            "bin_count": recordingScopeBinCount,
            "min_max_pairs": recordingScopePairs,
            "rms": scope["rms"] ?? 0,
            "peak": scope["peak"] ?? 0
        ])
    }

    func emitRecordingEvent(type: String, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let javaScript = """
        try{
          const payload = \(json);
          if(typeof window.nativeAudioEvent==='function'){
            window.nativeAudioEvent({ type:'\(type)', payload });
          }
          window.dispatchEvent(new CustomEvent('native_audio_recording', {
            detail: Object.assign({ type:'\(type)' }, payload)
          }));
        }catch(e){}
        """
        WebViewManager.evaluateJS(
            javaScript,
            label: "app.recording",
            priority: .high
        )
    }
}
