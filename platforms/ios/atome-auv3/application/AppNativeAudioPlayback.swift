import AVFoundation
import CoreMedia
import Foundation

extension AppNativeAudioController {
    func currentPlaybackRouteSignature() -> String {
        let session = AVAudioSession.sharedInstance()
        let outputs = session.currentRoute.outputs.map { output in
            "\(output.portType.rawValue):\(output.uid)"
        }.sorted().joined(separator: "|")
        return "\(outputs)#\(session.sampleRate)#\(session.outputNumberOfChannels)"
    }

    func preparePlaybackEngine() throws {
        try configureAudioSessionIfNeeded()
        let routeSignature = currentPlaybackRouteSignature()
        if !playbackRouteSignature.isEmpty && playbackRouteSignature != routeSignature {
            playbackEngineNeedsReset = true
        }
        if playbackEngineNeedsReset {
            Array(voices.keys).forEach { stopVoiceLocked($0, reason: "audio_session_recovery") }
            engine.stop()
            engine.reset()
            playbackEngineNeedsReset = false
        }
        try ensureAudioEngineRunning()
        playbackRouteSignature = routeSignature
    }

    func ensureAudioEngineRunning(playbackFormat: AVAudioFormat? = nil) throws {
        if engine.isRunning { return }
        let mixerNode = engine.mainMixerNode
        let outputNode = engine.outputNode
        let outputFormat = outputNode.inputFormat(forBus: 0)
        let preferredFormat = playbackFormat ?? mixerNode.outputFormat(forBus: 0)
        let connectionFormat = outputFormat.sampleRate > 0 ? outputFormat : preferredFormat
        engine.connect(mixerNode, to: outputNode, format: connectionFormat)
        engine.prepare()
        try engine.start()
    }

    // Audio files stay streamed. Short video containers predecode their audio once.
    func loadClipEntry(url: URL, id: String) throws -> ClipEntry {
        if let audioFile = try? AVAudioFile(forReading: url) {
            let format = audioFile.processingFormat
            let sampleRate = format.sampleRate
            let duration = sampleRate > 0 ? Double(audioFile.length) / sampleRate : 0
            return ClipEntry(
                id: id,
                url: url,
                path: url.path,
                sampleRate: sampleRate,
                durationSeconds: duration,
                isAudioFile: true,
                processingFormat: format,
                asset: nil,
                cachedBuffer: nil
            )
        }

        let asset = AVURLAsset(
            url: url,
            options: [AVURLAssetPreferPreciseDurationAndTimingKey: false]
        )
        guard let track = asset.tracks(withMediaType: .audio).first else {
            throw NSError(domain: "AppNativeAudioController", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "No audio track found in \(url.lastPathComponent)"
            ])
        }
        let duration = max(0, CMTimeGetSeconds(asset.duration))
        var sampleRate: Double = 44100
        if let description = track.formatDescriptions.first {
            let formatDescription = description as! CMFormatDescription
            if let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)?.pointee {
                sampleRate = max(1, Double(streamDescription.mSampleRate))
            }
        }
        let cachedBuffer: AVAudioPCMBuffer?
        if duration > 0 && duration <= maxCachedVideoAudioDurationSeconds {
            cachedBuffer = try decodeAssetSegment(asset, startSeconds: 0, durationSeconds: nil)
        } else {
            cachedBuffer = nil
        }
        return ClipEntry(
            id: id,
            url: url,
            path: url.path,
            sampleRate: sampleRate,
            durationSeconds: duration,
            isAudioFile: false,
            processingFormat: nil,
            asset: asset,
            cachedBuffer: cachedBuffer
        )
    }

    // Video audio is decoded only for the requested time range.
    func decodeAssetSegment(_ asset: AVURLAsset,
                            startSeconds: Double,
                            durationSeconds: Double?) throws -> AVAudioPCMBuffer {
        guard let track = asset.tracks(withMediaType: .audio).first else {
            throw NSError(domain: "AppNativeAudioController", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "No audio track in asset"
            ])
        }
        let sessionSampleRate = AVAudioSession.sharedInstance().sampleRate
        let outputSampleRate = max(1.0, sessionSampleRate > 0 ? sessionSampleRate : 44100.0)
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
            AVSampleRateKey: outputSampleRate,
            AVNumberOfChannelsKey: 2
        ])
        output.alwaysCopiesSampleData = false
        let assetDuration = max(0, CMTimeGetSeconds(asset.duration))
        let safeStart = max(0, min(startSeconds, assetDuration))
        let safeEnd: Double
        if let durationSeconds, durationSeconds > 0 {
            safeEnd = min(safeStart + durationSeconds, assetDuration)
        } else {
            safeEnd = assetDuration
        }
        if safeEnd > safeStart {
            reader.timeRange = CMTimeRange(
                start: CMTime(seconds: safeStart, preferredTimescale: 44100),
                end: CMTime(seconds: safeEnd, preferredTimescale: 44100)
            )
        }
        guard reader.canAdd(output) else {
            throw NSError(domain: "AppNativeAudioController", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Unable to add output for segment decode"
            ])
        }
        reader.add(output)
        guard reader.startReading() else {
            throw reader.error ?? NSError(domain: "AppNativeAudioController", code: 5, userInfo: [
                NSLocalizedDescriptionKey: "Unable to start segment decode"
            ])
        }
        var left: [Float] = []
        var right: [Float] = []
        while reader.status == .reading {
            guard let sampleBuffer = output.copyNextSampleBuffer() else { break }
            guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else {
                CMSampleBufferInvalidate(sampleBuffer)
                continue
            }
            let byteCount = CMBlockBufferGetDataLength(blockBuffer)
            var data = Data(count: byteCount)
            data.withUnsafeMutableBytes { pointer in
                guard let base = pointer.baseAddress else { return }
                _ = CMBlockBufferCopyDataBytes(
                    blockBuffer,
                    atOffset: 0,
                    dataLength: byteCount,
                    destination: base
                )
            }
            let floats = data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
            CMSampleBufferInvalidate(sampleBuffer)
            guard !floats.isEmpty else { continue }
            let frameCount = floats.count / 2
            for frame in 0..<frameCount {
                left.append(floats[frame * 2])
                right.append(floats[(frame * 2) + 1])
            }
        }
        if reader.status == .failed {
            throw reader.error ?? NSError(domain: "AppNativeAudioController", code: 6, userInfo: [
                NSLocalizedDescriptionKey: "Segment decode failed"
            ])
        }
        guard let format = AVAudioFormat(
            standardFormatWithSampleRate: outputSampleRate,
            channels: 2
        ) else {
            throw NSError(domain: "AppNativeAudioController", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Unable to create PCM format"
            ])
        }
        let count = min(left.count, right.count)
        guard count > 0,
              let buffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(count)
              ),
              let channels = buffer.floatChannelData else {
            throw NSError(domain: "AppNativeAudioController", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Unable to allocate segment buffer"
            ])
        }
        buffer.frameLength = AVAudioFrameCount(count)
        left.withUnsafeBufferPointer { channels[0].update(from: $0.baseAddress!, count: count) }
        right.withUnsafeBufferPointer { channels[1].update(from: $0.baseAddress!, count: count) }
        return buffer
    }

    func makeSliceBuffer(from source: AVAudioPCMBuffer,
                         startSeconds: Double,
                         durationSeconds: Double?) throws -> AVAudioPCMBuffer {
        let sampleRate = max(1.0, source.format.sampleRate)
        let totalFrames = Int(source.frameLength)
        let channelCount = Int(source.format.channelCount)
        guard totalFrames > 0,
              channelCount > 0,
              let sourceChannels = source.floatChannelData else {
            throw NSError(domain: "AppNativeAudioController", code: 7, userInfo: [
                NSLocalizedDescriptionKey: "Cached native PCM buffer is empty"
            ])
        }
        let startFrame = min(
            max(0, Int((max(0, startSeconds) * sampleRate).rounded(.down))),
            max(0, totalFrames - 1)
        )
        let requestedEndSeconds = durationSeconds.map {
            max(0.001, startSeconds + $0)
        } ?? (Double(totalFrames) / sampleRate)
        let endFrame = min(
            totalFrames,
            max(startFrame + 1, Int((requestedEndSeconds * sampleRate).rounded(.up)))
        )
        let frameCount = max(1, endFrame - startFrame)
        guard let slice = AVAudioPCMBuffer(
            pcmFormat: source.format,
            frameCapacity: AVAudioFrameCount(frameCount)
        ),
              let targetChannels = slice.floatChannelData else {
            throw NSError(domain: "AppNativeAudioController", code: 8, userInfo: [
                NSLocalizedDescriptionKey: "Unable to allocate cached native PCM slice"
            ])
        }
        slice.frameLength = AVAudioFrameCount(frameCount)
        for channelIndex in 0..<channelCount {
            targetChannels[channelIndex].update(
                from: sourceChannels[channelIndex].advanced(by: startFrame),
                count: frameCount
            )
        }
        return slice
    }

    func detachVoiceNodes(_ voice: VoiceEntry) {
        engine.disconnectNodeInput(voice.rateNode)
        engine.disconnectNodeInput(voice.playerNode)
        engine.detach(voice.playerNode)
        engine.detach(voice.rateNode)
    }

    func stopVoiceLocked(_ voiceId: String, reason: String = "stop") {
        guard let voice = voices.removeValue(forKey: voiceId) else { return }
        voice.stopWorkItem?.cancel()
        voice.playerNode.stop()
        detachVoiceNodes(voice)
    }

    func stopVoicesForAssetLocked(_ assetId: String) {
        let voiceIds = voices.values
            .filter { $0.assetId == assetId }
            .map(\.voiceId)
        voiceIds.forEach { stopVoiceLocked($0, reason: "asset_stop") }
    }

    func scheduleLoopingBuffers(voiceId: String,
                                clip: ClipEntry,
                                voice: VoiceEntry,
                                startSeconds: Double,
                                loopStartSeconds: Double,
                                loopEndSeconds: Double) throws {
        let normalizedLoopStart = clamp(loopStartSeconds, min: 0, max: clip.durationSeconds)
        let normalizedLoopEnd = clamp(
            loopEndSeconds,
            min: normalizedLoopStart + 0.001,
            max: clip.durationSeconds
        )
        let normalizedStart = clamp(
            startSeconds,
            min: normalizedLoopStart,
            max: normalizedLoopEnd - 0.001
        )
        if clip.isAudioFile {
            let loopFile = try AVAudioFile(forReading: clip.url)
            let sampleRate = loopFile.processingFormat.sampleRate
            let loopStartFrame = AVAudioFramePosition(normalizedLoopStart * sampleRate)
            let loopEndFrame = AVAudioFramePosition(normalizedLoopEnd * sampleRate)
            let loopBodyFrames = AVAudioFrameCount(max(1, loopEndFrame - loopStartFrame))
            guard let loopBuffer = AVAudioPCMBuffer(
                pcmFormat: loopFile.processingFormat,
                frameCapacity: loopBodyFrames
            ) else {
                throw NSError(domain: "AppNativeAudioController", code: 8, userInfo: [
                    NSLocalizedDescriptionKey: "Unable to allocate loop buffer for '\(clip.id)'"
                ])
            }
            loopFile.framePosition = loopStartFrame
            try loopFile.read(into: loopBuffer, frameCount: loopBodyFrames)
            voice.audioFiles.append(loopFile)
            if normalizedStart > normalizedLoopStart {
                let introFile = try AVAudioFile(forReading: clip.url)
                voice.audioFiles.append(introFile)
                let introStartFrame = AVAudioFramePosition(normalizedStart * sampleRate)
                let introFrames = AVAudioFrameCount(max(1, loopEndFrame - introStartFrame))
                voice.playerNode.scheduleSegment(
                    introFile,
                    startingFrame: introStartFrame,
                    frameCount: introFrames,
                    at: nil
                ) { [weak self] in
                    self?.queue.async {
                        guard self?.voices[voiceId] != nil else { return }
                        voice.playerNode.scheduleBuffer(
                            loopBuffer,
                            at: nil,
                            options: [.loops],
                            completionHandler: nil
                        )
                    }
                }
            } else {
                voice.playerNode.scheduleBuffer(loopBuffer, at: nil, options: [.loops])
            }
        } else if let cachedBuffer = clip.cachedBuffer {
            let loopBuffer = try makeSliceBuffer(
                from: cachedBuffer,
                startSeconds: normalizedLoopStart,
                durationSeconds: normalizedLoopEnd - normalizedLoopStart
            )
            if normalizedStart > normalizedLoopStart {
                let introBuffer = try makeSliceBuffer(
                    from: cachedBuffer,
                    startSeconds: normalizedStart,
                    durationSeconds: normalizedLoopEnd - normalizedStart
                )
                voice.playerNode.scheduleBuffer(introBuffer, at: nil, options: []) { [weak self] in
                    self?.queue.async {
                        guard self?.voices[voiceId] != nil else { return }
                        voice.playerNode.scheduleBuffer(loopBuffer, at: nil, options: [.loops])
                    }
                }
            } else {
                voice.playerNode.scheduleBuffer(loopBuffer, at: nil, options: [.loops])
            }
        } else if let asset = clip.asset {
            let loopBuffer = try decodeAssetSegment(
                asset,
                startSeconds: normalizedLoopStart,
                durationSeconds: normalizedLoopEnd - normalizedLoopStart
            )
            if normalizedStart > normalizedLoopStart {
                let introBuffer = try decodeAssetSegment(
                    asset,
                    startSeconds: normalizedStart,
                    durationSeconds: normalizedLoopEnd - normalizedStart
                )
                voice.playerNode.scheduleBuffer(introBuffer, at: nil, options: []) { [weak self] in
                    self?.queue.async {
                        guard self?.voices[voiceId] != nil else { return }
                        voice.playerNode.scheduleBuffer(loopBuffer, at: nil, options: [.loops])
                    }
                }
            } else {
                voice.playerNode.scheduleBuffer(loopBuffer, at: nil, options: [.loops])
            }
        } else {
            throw NSError(domain: "AppNativeAudioController", code: 9, userInfo: [
                NSLocalizedDescriptionKey: "Clip '\(clip.id)' has no audio source for looping"
            ])
        }
    }
}
