import AVFoundation
import Foundation

/// App side of the native Kira engine (`NativeKiraEngine`): the audio session each command needs.
enum AppNativeKiraEngine {
    /// Commands that make sound: they need the playback audio session.
    static let soundingCommands: Set<String> = [
        "audio_load_clip", "audio_load_clip_from_bytes", "audio_play", "audio_play_instance", "audio_schedule_instances",
        "audio_render_clock", "audio_output_hold", "audio_mix_apply", "audio_direct_apply"
    ]
    /// The device buffer the direct path asks for (`atome-audio-engine` `direct::BUFFER_FRAMES`):
    /// on iOS it is the session's IO buffer duration, not a stream setting.
    static let directBufferFrames = 64.0
    /// The device buffer the engine's scheduled output asks for: a cell touched sounds within a few
    /// milliseconds instead of behind iOS's default ~1024-frame buffer (R-307).
    static let scheduledBufferFrames = 256.0
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
                applyScheduledBuffer()
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
            // A take on a strip that hears a session port (R-286): that port is the route it records.
            if command == "audio_record_strip_start", let deviceId = payload["deviceId"] as? String {
                try routeSessionInput(sessionPortsNamed(by: ["strips": [["input": ["kind": "live_audio", "device_id": deviceId]]]]))
            }
            let (result, error) = NativeKiraEngine.run(command, arguments)
            if command == "audio_record_strip_stop", error == nil, let path = result["absolute_file_path"] as? String {
                publishTake(atPath: path)
            }
            complete(completion, payload: command == "audio_mix_devices" && error == nil ? try withSessionInputs(result) : result, error: error)
        } catch {
            complete(completion, payload: ["success": false], error: error.localizedDescription)
        }
    }

    /// A take the engine closed in the app group (the canonical root, shared with the AUv3) is published at once to the
    /// person's storage, where the local server serves it and syncs it to the server, as a video or a photo is
    /// (`FileSyncCoordinator.publishNow`): its URL never answers 404 (R-356: a multitrack take's waveform could not be
    /// read again at a zoom, and the take never reached the server).
    func publishTake(atPath absolutePath: String) {
        let file = URL(fileURLWithPath: absolutePath).resolvingSymlinksInPath().standardizedFileURL
        guard let root = SandboxPathValidator.primaryRoot()?.resolvingSymlinksInPath().standardizedFileURL,
              file.path.hasPrefix(root.path + "/") else {
            NSLog("[AppNativeAudio] take_publish_outside_root file=%@", absolutePath)
            return
        }
        do { try FileSyncCoordinator.shared.publishNow(file, relativePath: String(file.path.dropFirst(root.path.count + 1))) }
        catch { NSLog("[AppNativeAudio] take_publish_failed file=%@ error=%@", file.lastPathComponent, error.localizedDescription) }
        FileSyncCoordinator.shared.syncAll(force: true)
    }

    /// A strip whose IN is a live input opens the microphone: the capture
    /// session is held exactly while the program (the timeline's or the
    /// direct path's) has one. The direct path also shortens the IO buffer.
    private func applyMixProgram(_ command: String,
                                 _ arguments: [String: Any],
                                 completion: @escaping ([String: Any], String?) -> Void) {
        let program = (arguments["program"] as? [String: Any]) ?? [:]
        let strips = (program["strips"] as? [[String: Any]]) ?? []
        // A live input anywhere in the program (a strip's IN, an IN module such as a track's input meter) opens the microphone.
        let wantsInput = !Self.liveAudioSources(of: program).isEmpty
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
                    // The session port the program's live inputs name is routed before the engine opens it (R-286).
                    try self.routeSessionInput(self.sessionPortsNamed(by: program))
                } catch {
                    self.releaseAudioSessionConsumer(consumerId)
                    self.complete(completion, payload: ["success": false], error: error.localizedDescription)
                    return
                }
                let (result, error) = NativeKiraEngine.run(command, arguments)
                if error != nil { self.releaseAudioSessionConsumer(consumerId) }
                self.complete(completion, payload: result, error: error)
            }
        }
    }

    /// The engine's short IO buffer, asked once; the direct path's shorter one takes over while it plays.
    private func applyScheduledBuffer() {
        let session = AVAudioSession.sharedInstance()
        let duration = AppNativeKiraEngine.scheduledBufferFrames / max(session.sampleRate, 1)
        guard AppNativeKiraEngine.sessionBufferDuration == nil,
              session.preferredIOBufferDuration > duration * 1.01 else { return }
        try? session.setPreferredIOBufferDuration(duration)
        AppNativeAudioDiagnostics.log("scheduled buffer io=\(session.ioBufferDuration)")
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
                    // The session port the measure names is routed first, as for a take (R-286).
                    if let deviceName = arguments["deviceName"] as? String {
                        try self.routeSessionInput(self.sessionPortsNamed(by: ["strips": [["input": ["kind": "live_audio", "device_id": deviceName]]]]))
                    }
                } catch {
                    self.releaseAudioSessionConsumer(consumerId)
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
