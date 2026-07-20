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
        var binCount: UInt16 = 0
        var sequence: UInt64 = 0
        var sampleRate: UInt32 = 0
        var channels: UInt16 = 0
        var rms: Float = 0
        var peak: Float = 0
        let copied = recordingScopeMinima.withUnsafeMutableBufferPointer { minima in
            recordingScopeMaxima.withUnsafeMutableBufferPointer { maxima in
                guard let minimumBase = minima.baseAddress,
                      let maximumBase = maxima.baseAddress else { return false }
                return nativeRecorderBackend.copyScopeMinima(
                    minimumBase,
                    maxima: maximumBase,
                    capacity: UInt16(recordingScopeBinCount),
                    binCount: &binCount,
                    sequence: &sequence,
                    sampleRate: &sampleRate,
                    channels: &channels,
                    rms: &rms,
                    peak: &peak
                )
            }
        }
        guard copied,
              sequence != recordingScopeLastSequence,
              binCount == UInt16(recordingScopeBinCount) else { return }
        recordingScopeLastSequence = sequence
        for index in 0..<recordingScopeBinCount {
            recordingScopePairs[index * 2] = recordingScopeMinima[index]
            recordingScopePairs[(index * 2) + 1] = recordingScopeMaxima[index]
        }
        emitRecordingEvent(type: "record_scope", payload: [
            "session_id": sessionId,
            "sequence": NSNumber(value: sequence),
            "sample_rate": sampleRate,
            "channels": channels,
            "bin_count": binCount,
            "min_max_pairs": recordingScopePairs,
            "rms": rms,
            "peak": peak
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
