import AVFoundation
import Foundation

extension AppNativeAudioController {
    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        queue.async {
            let normalizedCommand = command.trimmingCharacters(in: .whitespacesAndNewlines)
            do {
                switch normalizedCommand {
                case "audio_init":
                    try self.configureAudioSessionIfNeeded()
                    self.complete(completion, payload: ["success": true])

                case "audio_record_start":
                    self.startAudioRecording(payload: payload, completion: completion)

                case "audio_record_stop":
                    self.stopAudioRecording(payload: payload, completion: completion)

                case "audio_load_clip":
                    try self.configureAudioSessionIfNeeded()
                    let id = self.resolveString(payload, ["id"])
                    let rawPath = self.resolveString(payload, ["path"])
                    guard !id.isEmpty else {
                        print("[AUDIO_NATIVE] audio_load_clip ERROR missing_id path=\(rawPath)")
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    if let cached = self.clips[id] {
                        print("[AUDIO_NATIVE] audio_load_clip CACHED id=\(id) path=\(cached.path) duration=\(cached.durationSeconds)")
                        self.complete(completion, payload: [
                            "success": true,
                            "id": id,
                            "path": cached.path,
                            "input_path": rawPath,
                            "input_path_was_absolute": rawPath.hasPrefix("/"),
                            "sample_rate": cached.sampleRate,
                            "duration_seconds": cached.durationSeconds
                        ])
                        return
                    }
                    guard let url = self.resolveClipURL(rawPath) else {
                        print("[AUDIO_NATIVE] audio_load_clip ERROR path_not_found id=\(id) input=\(rawPath)")
                        self.complete(
                            completion,
                            payload: ["success": false, "id": id],
                            error: "Audio clip path does not exist: \(rawPath)"
                        )
                        return
                    }
                    let clip = try self.loadClipEntry(url: url, id: id)
                    self.clips[id] = clip
                    print("[AUDIO_NATIVE] audio_load_clip OK id=\(id) input=\(rawPath) path=\(url.path) sample_rate=\(clip.sampleRate) duration=\(clip.durationSeconds) streaming=\(clip.isAudioFile)")
                    self.complete(completion, payload: [
                        "success": true,
                        "id": id,
                        "path": url.path,
                        "input_path": rawPath,
                        "input_path_was_absolute": rawPath.hasPrefix("/"),
                        "sample_rate": clip.sampleRate,
                        "duration_seconds": clip.durationSeconds
                    ])

                case "audio_has_clip":
                    let id = self.resolveString(payload, ["id"])
                    guard !id.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    self.complete(completion, payload: [
                        "success": true,
                        "id": id,
                        "loaded": self.clips[id] != nil
                    ])

                case "audio_play":
                    let id = self.resolveString(payload, ["id"])
                    guard !id.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    self.handle(command: "audio_play_instance", payload: [
                        "assetId": id,
                        "voiceId": id,
                        "startSeconds": 0,
                        "durationSeconds": NSNull(),
                        "gain": 1,
                        "rate": 1
                    ], completion: completion)

                case "audio_play_instance":
                    try self.configureAudioSessionIfNeeded()
                    let assetId = self.resolveString(payload, ["assetId", "asset_id"])
                    let voiceId = self.resolveString(payload, ["voiceId", "voice_id"])
                    guard !assetId.isEmpty, !voiceId.isEmpty else {
                        print("[AUDIO_NATIVE] audio_play_instance ERROR missing_ids asset=\(assetId) voice=\(voiceId)")
                        self.complete(completion, payload: ["success": false], error: "Missing asset or voice id")
                        return
                    }
                    guard let clip = self.clips[assetId] else {
                        print("[AUDIO_NATIVE] audio_play_instance ERROR clip_not_found asset=\(assetId) voice=\(voiceId)")
                        self.complete(
                            completion,
                            payload: ["success": false, "asset_id": assetId, "voice_id": voiceId],
                            error: "Clip '\(assetId)' not found"
                        )
                        return
                    }
                    self.stopVoiceLocked(voiceId, reason: "replace_same_voice")
                    let startSeconds = self.clamp(
                        self.resolveDouble(payload, ["startSeconds", "start_seconds"], fallback: 0),
                        min: 0,
                        max: clip.durationSeconds
                    )
                    let rate = Float(self.clamp(
                        self.resolveDouble(payload, ["rate"], fallback: 1),
                        min: 0.25,
                        max: 4
                    ))
                    let gain = self.gainToLinear(
                        self.resolveDouble(payload, ["gain"], fallback: 1)
                    )
                    let durationSeconds = self.resolveOptionalDouble(
                        payload,
                        ["durationSeconds", "duration_seconds"]
                    )
                    let loopStart = self.resolveOptionalDouble(
                        payload,
                        ["loopStartSeconds", "loop_start_seconds"]
                    )
                    let loopEnd = self.resolveOptionalDouble(
                        payload,
                        ["loopEndSeconds", "loop_end_seconds"]
                    )
                    var scheduledDurationForStop: Double?
                    let playerNode = AVAudioPlayerNode()
                    let rateNode = AVAudioUnitVarispeed()
                    rateNode.rate = rate
                    playerNode.volume = gain
                    let playbackFormat: AVAudioFormat
                    if clip.isAudioFile, let format = clip.processingFormat {
                        playbackFormat = format
                    } else {
                        let sessionSampleRate = AVAudioSession.sharedInstance().sampleRate
                        let sampleRate = max(1.0, sessionSampleRate > 0 ? sessionSampleRate : 44100.0)
                        playbackFormat = AVAudioFormat(
                            standardFormatWithSampleRate: sampleRate,
                            channels: 2
                        )!
                    }
                    self.engine.attach(playerNode)
                    self.engine.attach(rateNode)
                    self.engine.connect(playerNode, to: rateNode, format: playbackFormat)
                    self.engine.connect(rateNode, to: self.engine.mainMixerNode, format: playbackFormat)
                    try self.ensureAudioEngineRunning(playbackFormat: playbackFormat)
                    let voice = VoiceEntry(
                        voiceId: voiceId,
                        assetId: assetId,
                        playerNode: playerNode,
                        rateNode: rateNode
                    )
                    if durationSeconds == nil,
                       let loopStart,
                       let loopEnd,
                       loopEnd > loopStart {
                        try self.scheduleLoopingBuffers(
                            voiceId: voiceId,
                            clip: clip,
                            voice: voice,
                            startSeconds: startSeconds,
                            loopStartSeconds: loopStart,
                            loopEndSeconds: loopEnd
                        )
                    } else if clip.isAudioFile {
                        let audioFile = try AVAudioFile(forReading: clip.url)
                        voice.audioFiles.append(audioFile)
                        let sampleRate = audioFile.processingFormat.sampleRate
                        let startFrame = AVAudioFramePosition(max(0, startSeconds * sampleRate))
                        let remainingFrames = AVAudioFrameCount(max(0, audioFile.length - startFrame))
                        let frameCount: AVAudioFrameCount
                        if let durationSeconds, durationSeconds > 0 {
                            frameCount = min(
                                remainingFrames,
                                AVAudioFrameCount(durationSeconds * sampleRate)
                            )
                        } else {
                            frameCount = remainingFrames
                        }
                        if frameCount > 0 {
                            scheduledDurationForStop = Double(frameCount) / max(1.0, sampleRate)
                            playerNode.scheduleSegment(
                                audioFile,
                                startingFrame: startFrame,
                                frameCount: frameCount,
                                at: nil,
                                completionHandler: nil
                            )
                        } else {
                            print("[AUDIO_NATIVE] audio_play_instance ERROR empty_file_segment asset=\(assetId) voice=\(voiceId) start=\(startSeconds) total_frames=\(audioFile.length) remaining_frames=\(remainingFrames)")
                        }
                    } else if let cachedBuffer = clip.cachedBuffer {
                        let playBuffer = try self.makeSliceBuffer(
                            from: cachedBuffer,
                            startSeconds: startSeconds,
                            durationSeconds: durationSeconds
                        )
                        scheduledDurationForStop = Double(playBuffer.frameLength)
                            / max(1.0, playBuffer.format.sampleRate)
                        playerNode.scheduleBuffer(
                            playBuffer,
                            at: nil,
                            options: [],
                            completionHandler: nil
                        )
                    } else if let asset = clip.asset {
                        let playBuffer = try self.decodeAssetSegment(
                            asset,
                            startSeconds: startSeconds,
                            durationSeconds: durationSeconds
                        )
                        scheduledDurationForStop = Double(playBuffer.frameLength)
                            / max(1.0, playBuffer.format.sampleRate)
                        playerNode.scheduleBuffer(
                            playBuffer,
                            at: nil,
                            options: [],
                            completionHandler: nil
                        )
                    } else {
                        throw NSError(domain: "AppNativeAudioController", code: 9, userInfo: [
                            NSLocalizedDescriptionKey: "Clip '\(assetId)' has no audio source"
                        ])
                    }
                    self.voices[voiceId] = voice
                    playerNode.play()

                    if let scheduledDuration = scheduledDurationForStop, scheduledDuration > 0 {
                        let safeRate = max(0.0001, Double(rate))
                        let stopDelay = max(0.03, scheduledDuration / safeRate)
                        let stopWork = DispatchWorkItem { [weak self] in
                            self?.queue.async {
                                self?.stopVoiceLocked(voiceId, reason: "scheduled_stop")
                            }
                        }
                        voice.stopWorkItem = stopWork
                        self.queue.asyncAfter(
                            deadline: .now() + stopDelay + 0.02,
                            execute: stopWork
                        )
                    }
                    self.complete(completion, payload: [
                        "success": true,
                        "asset_id": assetId,
                        "voice_id": voiceId
                    ])

                case "audio_stop_instance":
                    let voiceId = self.resolveString(payload, ["voiceId", "voice_id"])
                    guard !voiceId.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing voice id")
                        return
                    }
                    self.stopVoiceLocked(voiceId, reason: "command_stop_instance")
                    self.complete(completion, payload: ["success": true, "voice_id": voiceId])

                case "audio_stop":
                    let id = self.resolveString(payload, ["id"])
                    guard !id.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    if self.voices[id] != nil {
                        self.stopVoiceLocked(id, reason: "command_stop_voice")
                    } else {
                        self.stopVoicesForAssetLocked(id)
                    }
                    self.complete(completion, payload: ["success": true, "id": id])

                case "audio_destroy_clip":
                    let id = self.resolveString(payload, ["id"])
                    guard !id.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    self.stopVoicesForAssetLocked(id)
                    self.clips.removeValue(forKey: id)
                    self.complete(completion, payload: ["success": true, "id": id])

                case "audio_set_volume":
                    let id = self.resolveString(payload, ["id"])
                    let decibels = self.resolveDouble(payload, ["db"], fallback: 0)
                    if let voice = self.voices[id] {
                        voice.playerNode.volume = self.decibelsToLinear(decibels)
                        self.complete(completion, payload: ["success": true, "id": id])
                    } else {
                        self.complete(
                            completion,
                            payload: ["success": false, "id": id],
                            error: "Voice '\(id)' not found"
                        )
                    }

                case "audio_set_playback_rate":
                    let id = self.resolveString(payload, ["id"])
                    let rate = Float(self.clamp(
                        self.resolveDouble(payload, ["rate"], fallback: 1),
                        min: 0.25,
                        max: 4
                    ))
                    if let voice = self.voices[id] {
                        voice.rateNode.rate = rate
                        self.complete(completion, payload: ["success": true, "id": id])
                    } else {
                        self.complete(
                            completion,
                            payload: ["success": false, "id": id],
                            error: "Voice '\(id)' not found"
                        )
                    }

                case "audio_shutdown":
                    self.shutdownAudioRecording()
                    Array(self.voices.keys).forEach { voiceId in
                        self.stopVoiceLocked(voiceId, reason: "audio_shutdown")
                    }
                    self.clips.removeAll()
                    self.engine.stop()
                    self.engine.reset()
                    self.complete(completion, payload: ["success": true])

                case "audio_load_clip_from_bytes":
                    try self.configureAudioSessionIfNeeded()
                    let id = self.resolveString(payload, ["id"])
                    guard !id.isEmpty else {
                        self.complete(completion, payload: ["success": false], error: "Missing clip id")
                        return
                    }
                    let numbers = payload["bytes"] as? [NSNumber] ?? []
                    guard !numbers.isEmpty else {
                        self.complete(
                            completion,
                            payload: ["success": false, "id": id],
                            error: "Missing audio bytes"
                        )
                        return
                    }
                    let data = Data(numbers.map { UInt8(truncating: $0) })
                    let directory = FileManager.default.temporaryDirectory
                        .appendingPathComponent("atome-transient-audio", isDirectory: true)
                    try FileManager.default.createDirectory(
                        at: directory,
                        withIntermediateDirectories: true
                    )
                    let url = directory.appendingPathComponent("\(id).wav")
                    try data.write(to: url, options: [.atomic])
                    self.stopVoicesForAssetLocked(id)
                    let clip = try self.loadClipEntry(url: url, id: id)
                    self.clips[id] = clip
                    self.complete(completion, payload: [
                        "success": true,
                        "id": id,
                        "bytes": data.count,
                        "sample_rate": clip.sampleRate,
                        "duration_seconds": clip.durationSeconds
                    ])

                default:
                    self.complete(
                        completion,
                        payload: ["success": false],
                        error: "Unsupported native audio command: \(normalizedCommand)"
                    )
                }
            } catch {
                self.complete(
                    completion,
                    payload: ["success": false],
                    error: error.localizedDescription
                )
            }
        }
    }
}
