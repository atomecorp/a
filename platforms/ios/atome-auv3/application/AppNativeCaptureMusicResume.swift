import AVFoundation
import MediaPlayer

/// A capture (a video take with sound, a sound take, the wake word) switches the shared session to
/// recording, and iOS pauses the music another app was playing (Apple Music, a streaming app).
/// The music found playing when the first capture starts plays again once the last capture ends:
/// the session gives the state it found back (user, 17 Nov. 2026).
struct AppNativeCaptureMusicSnapshot {
    private(set) var otherAudioWasPlaying = false

    /// Read when the first capture consumer arrives, before its plan reaches the session.
    mutating func captureStarts(otherAudioPlaying: Bool) { otherAudioWasPlaying = otherAudioPlaying }

    /// Read once, when the last capture consumer leaves.
    mutating func captureEnds() -> Bool {
        defer { otherAudioWasPlaying = false }
        return otherAudioWasPlaying
    }
}

extension AppNativeAudioController {
    /// Runs on `queue`, right before a consumer is added to the registry.
    func noteCaptureStarting(kind: AppNativeAudioConsumerKind) {
        guard kind.capturesAudio, !audioSessionConsumers.requiresMicrophone else { return }
        captureMusicSnapshot.captureStarts(otherAudioPlaying: AVAudioSession.sharedInstance().isOtherAudioPlaying)
    }

    /// Runs on `queue`, after the remaining consumers' plan has been applied.
    func resumeMusicAfterCapture(transition: String) {
        guard !audioSessionConsumers.requiresMicrophone, captureMusicSnapshot.captureEnds() else { return }
        DispatchQueue.main.async {
            let system = MPMusicPlayerController.systemMusicPlayer
            let state = system.playbackState
            if system.nowPlayingItem != nil, state == .interrupted || state == .paused {
                system.play()
                AppNativeAudioDiagnostics.log("session \(transition) resumed_system_music state=\(state.rawValue)")
                return
            }
            // Another app's music: it is told it may play again, which only works while no sound of ours holds the session.
            self.queue.async {
                guard self.audioSessionConsumers.consumers.isEmpty, !self.systemOwnsAudioActivation,
                      !AVAudioSession.sharedInstance().isOtherAudioPlaying else { return }
                do {
                    try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                    AppNativeAudioDiagnostics.log("session \(transition) notified_others_after_capture")
                } catch {
                    AppNativeAudioDiagnostics.log("session \(transition) notify_others_failed error=\(error.localizedDescription)")
                }
            }
        }
    }
}
