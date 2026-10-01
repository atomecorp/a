import AVFoundation
import Foundation

/// Bounded, non-persistent PCM capture through the application's microphone owner.
extension AppNativeAudioController {
    func startWakeCapture(payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        guard (payload["sampleRate"] as? Int ?? 16000) == 16000 else {
            complete(completion, payload: ["active": false], error: "wake_sample_rate_unsupported")
            return
        }
        let token = captureGate.begin()
        wakeCaptureToken = token
        requestMicrophonePermission { granted in
            self.queue.async {
                guard self.captureGate.accepts(token) else {
                    self.complete(completion, payload: ["active": false], error: "wake_capture_cancelled")
                    return
                }
                guard granted else {
                    self.complete(completion, payload: ["active": false], error: "microphone_permission_denied")
                    return
                }
                guard self.activeRecordingSessionId == nil, !self.wakeCaptureActive, !self.wakeCaptureInterrupted, !self.wakeCaptureBackground else {
                    self.complete(completion, payload: ["active": false], error: "wake_capture_busy")
                    return
                }
                do {
                    try self.acquireAudioSessionConsumer("wake", kind: .musicCapture)
                    let input = self.recordingEngine.inputNode
                    let format = input.outputFormat(forBus: 0)
                    guard let output = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000,
                                                     channels: 1, interleaved: false),
                          let converter = AVAudioConverter(from: format, to: output) else {
                        throw NSError(domain: "wake", code: 1)
                    }
                    self.wakeCaptureActive = true
                    self.wakeCaptureSamples.removeAll(keepingCapacity: true)
                    self.wakeCaptureOverrun = false
                    input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in
                        let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * 16000 / format.sampleRate) + 32)
                        guard let converted = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: capacity) else { return }
                        var supplied = false
                        var error: NSError?
                        let status = converter.convert(to: converted, error: &error) { _, inputStatus in
                            if supplied { inputStatus.pointee = .noDataNow; return nil }
                            supplied = true
                            inputStatus.pointee = .haveData
                            return buffer
                        }
                        if status == .error || error != nil {
                            self.queue.async { self.stopWakeCapture(); self.wakeCaptureFailed = true }
                            return
                        }
                        guard let samples = converted.int16ChannelData?[0] else { return }
                        let frame = Array(UnsafeBufferPointer(start: samples, count: Int(converted.frameLength)))
                        self.queue.async {
                            guard self.wakeCaptureActive, self.captureGate.accepts(token) else { return }
                            if self.wakeCaptureSamples.count + frame.count > 32768 {
                                self.wakeCaptureOverrun = true
                                self.wakeCaptureSamples.removeAll(keepingCapacity: true)
                            }
                            self.wakeCaptureSamples.append(contentsOf: frame)
                        }
                    }
                    self.recordingEngine.prepare()
                    try self.recordingEngine.start()
                    self.complete(completion, payload: ["active": true, "sample_rate": 16000])
                } catch {
                    self.stopWakeCapture()
                    self.complete(completion, payload: ["active": false], error: "wake_capture_failed")
                }
            }
        }
    }

    func stopWakeCapture() {
        if let token = wakeCaptureToken, captureGate.accepts(token) { captureGate.cancel() }
        wakeCaptureToken = nil
        if wakeCaptureActive {
            recordingEngine.stop()
            recordingEngine.inputNode.removeTap(onBus: 0)
        }
        wakeCaptureActive = false
        wakeCaptureSamples.removeAll(keepingCapacity: false)
        wakeCaptureOverrun = false
        releaseAudioSessionConsumer("wake")
    }

    func readWakeCapture() -> [String: Any] {
        let samples = wakeCaptureSamples
        wakeCaptureSamples.removeAll(keepingCapacity: true)
        let overrun = wakeCaptureOverrun
        wakeCaptureOverrun = false
        return ["active": wakeCaptureActive, "samples": samples, "overrun": overrun,
                "busy": activeRecordingSessionId != nil || wakeCaptureInterrupted || wakeCaptureBackground, "failed": wakeCaptureFailed]
    }
}
