import AVFoundation
import Foundation

extension AppNativeAudioController {
    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        queue.async {
            let normalizedCommand = command.trimmingCharacters(in: .whitespacesAndNewlines)
            // Playback, scheduling, the mixer and calibration run in the native
            // Kira engine (todo/audio_to_finalize §6.1).
            if NativeKiraEngine.commands.contains(normalizedCommand) {
                self.handleKiraEngineCommand(normalizedCommand, payload: payload, completion: completion)
                return
            }
            do {
                switch normalizedCommand {
                case "audio_init":
                    try self.acquirePlaybackAudioSessionConsumer()
                    let (result, error) = NativeKiraEngine.run("audio_init", [:])
                    self.complete(completion, payload: result, error: error)

                case "audio_wake_start":
                    self.wakeCaptureFailed = false
                    self.startWakeCapture(payload: payload, completion: completion)
                case "audio_wake_read":
                    self.complete(completion, payload: self.readWakeCapture())
                case "audio_wake_stop":
                    self.stopWakeCapture()
                    self.complete(completion, payload: ["active": false])
                case "audio_record_start":
                    self.startAudioRecording(payload: payload, completion: completion)
                case "audio_record_stop":
                    self.stopAudioRecording(payload: payload, completion: completion)

                case "audio_shutdown":
                    self.captureGate.cancel()
                    self.stopWakeCapture()
                    self.shutdownAudioRecording()
                    let (result, error) = NativeKiraEngine.run("audio_shutdown", [:])
                    self.releaseAllAudioSessionConsumers(transition: "audio_shutdown")
                    self.complete(completion, payload: result, error: error)

                default:
                    self.complete(
                        completion,
                        payload: ["success": false],
                        error: "Unsupported native audio command: \(normalizedCommand)"
                    )
                }
            } catch {
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
            }
        }
    }
}
