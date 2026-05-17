//
//  AUv3Decoder.swift
//  auv3
//

import AVFoundation
import CoreMedia
import Foundation
import os.lock

extension auv3Utils {
    // MARK: - File loading (decode to PCM for playback)
    public func loadLocalFile(_ path: String) {
        loadLocalFile(path, startPositionNormalized: nil)
    }

    public func loadLocalFile(_ path: String, startPositionNormalized: Float?) {
        let requestedPosition = startPositionNormalized.map { max(0.0, min(0.9999, $0)) }
        var shouldStartDecode = true
        var gen = 0
        var logDecision: String = "decode_start"
        var logFrames = 0
        var logFrameIndex = 0
        var logDecoding = false
        var logLoaded = false

        os_unfair_lock_lock(&fileLock)
        let sameFile = isSameLoadedAudioPath(self.loadedFilePath, path)
        let currentTotal = min(self.fileAudioL.count, self.fileAudioR.count)
        if sameFile && self.isDecodingFile {
            if let requestedPosition {
                pendingLoadPositionNormalized = requestedPosition
            }
            shouldStartDecode = false
            logDecision = "same_file_decoding"
            logFrames = currentTotal
            logFrameIndex = self.fileFrameIndex
            logDecoding = true
            logLoaded = self.fileLoaded
        } else if sameFile && self.fileLoaded && currentTotal > 0 {
            if let requestedPosition {
                self.fileFrameIndex = min(max(0, Int(Double(currentTotal) * Double(requestedPosition))), max(0, currentTotal - 1))
                pendingLoadPositionNormalized = nil
            }
            shouldStartDecode = false
            logDecision = "same_file_ready"
            logFrames = currentTotal
            logFrameIndex = self.fileFrameIndex
            logDecoding = self.isDecodingFile
            logLoaded = true
        } else {
            pendingLoadPositionNormalized = nil
        }

        if shouldStartDecode {
            let previousPath = self.loadedFilePath
            // Preserve currently playing audio in an aux slot for concurrent playback
        if self.fileLoaded && self.fileFrameIndex < currentTotal && self.playActive {
            let aux = AuxAudioSlot()
            aux.audioL = self.fileAudioL
            aux.audioR = self.fileAudioR
            aux.frameIndex = self.fileFrameIndex
            aux.loaded = true
                aux.slotId = previousPath ?? "main"
            // Evict finished aux slots first
            self.auxSlots.removeAll { slot in
                slot.frameIndex >= min(slot.audioL.count, slot.audioR.count)
            }
            // Evict oldest if full
            if self.auxSlots.count >= Self.maxAuxSlots {
                self.auxSlots.removeFirst()
            }
            self.auxSlots.append(aux)
        }
        // Reset main slot state for new decode
            self.loadedFilePath = path
        self.fileLoaded = false
        self.fileFrameIndex = 0
        self.fileAudioL.removeAll(keepingCapacity: false)
        self.fileAudioR.removeAll(keepingCapacity: false)
            self.isDecodingFile = true
            self.currentDecodeGen &+= 1
            gen = self.currentDecodeGen
            logDecoding = true
            logLoaded = false
        }
        os_unfair_lock_unlock(&fileLock)

        AUv3Diagnostics.log("🎧 AUv3 playback load request decision=\(logDecision) path=\(path) start=\(requestedPosition.map { String(format: "%.4f", $0) } ?? "nil") loaded=\(logLoaded) decoding=\(logDecoding) frames=\(logFrames) frameIndex=\(logFrameIndex)")

        if !shouldStartDecode {
            self.isTestToneActive = false
            return
        }

        self.didEmitReadyForPath.removeAll()
        self.isTestToneActive = false
        // Decode with highest priority to reduce latency
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            self?.decodeFile(at: path, gen: gen, startPositionNormalized: requestedPosition)
        }
    }

    func decodeFile(at path: String, gen: Int, startPositionNormalized: Float?) {
        let exists = FileManager.default.fileExists(atPath: path)
        AUv3Diagnostics.log("🔎 AUv3: decodeFile gen=\(gen) path=\(path) exists=\(exists) start=\(startPositionNormalized.map { String(format: "%.4f", $0) } ?? "nil")")
        let url = URL(fileURLWithPath: path)
        do {
            let srcFile = try AVAudioFile(forReading: url)
            let outSR = self.getSampleRate() ?? 44100.0
            if let startPositionNormalized, srcFile.length > 0 {
                let targetFrame = AVAudioFramePosition(Double(srcFile.length) * Double(startPositionNormalized))
                srcFile.framePosition = min(max(0, targetFrame), max(0, srcFile.length - 1))
            }
            guard let dstFormat = AVAudioFormat(standardFormatWithSampleRate: outSR, channels: 2) else {
                AUv3Diagnostics.log("❌ AUv3: Failed to create destination format")
                return
            }
            let converter = AVAudioConverter(from: srcFile.processingFormat, to: dstFormat)
            guard let converter = converter else {
                AUv3Diagnostics.log("❌ AUv3: AVAudioConverter init failed")
                return
            }

            let chunkFrames: AVAudioFrameCount = 4096
            let srcBuf = AVAudioPCMBuffer(pcmFormat: srcFile.processingFormat, frameCapacity: chunkFrames)!
            let dstBuf = AVAudioPCMBuffer(pcmFormat: dstFormat, frameCapacity: chunkFrames)!

            var outL: [Float] = []
            var outR: [Float] = []

            while true {
                try srcFile.read(into: srcBuf, frameCount: chunkFrames)
                if srcBuf.frameLength == 0 { break }
                var providedOnce = false
                dstBuf.frameLength = 0
                let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
                    if providedOnce || srcBuf.frameLength == 0 {
                        outStatus.pointee = .noDataNow
                        return nil
                    }
                    providedOnce = true
                    outStatus.pointee = .haveData
                    return srcBuf
                }
                let status = converter.convert(to: dstBuf, error: nil, withInputFrom: inputBlock)
                if status == .error || status == .endOfStream { break }
                let frames = Int(dstBuf.frameLength)
                if frames == 0 { continue }
                if let ch0 = dstBuf.floatChannelData?[0] {
                    outL.append(contentsOf: UnsafeBufferPointer(start: ch0, count: frames))
                }
                if dstFormat.channelCount > 1, let ch1 = dstBuf.floatChannelData?[1] {
                    outR.append(contentsOf: UnsafeBufferPointer(start: ch1, count: frames))
                } else {
                    // mono -> duplicate to R
                    outR.append(contentsOf: outL.suffix(frames))
                }
            }

            if gen == self.currentDecodeGen {
                os_unfair_lock_lock(&fileLock)
                self.fileAudioL = outL
                self.fileAudioR = outR
                self.fileSampleRate = outSR
                self.fileLoaded = !outL.isEmpty
                self.fileFrameIndex = 0
                os_unfair_lock_unlock(&fileLock)
            }
            if gen == self.currentDecodeGen {
                self.isDecodingFile = false
            }
            let decodedFrames = outL.count
            DispatchQueue.main.async {
                AUv3Diagnostics.log("📥 AUv3: decoded file gen=\(gen) frames=\(decodedFrames) sr=\(Int(outSR))")
            }
            // AVAudioFile path decodes whole file; signal ready now if we have frames
            if gen == self.currentDecodeGen, self.fileLoaded {
                self.emitClipReady(path: path)
                self.consumePendingScrubPreviewIfNeeded(path: path)
            }
        } catch {
            // AVAudioFile often fails in AUv3 extensions; AVAssetReader owns the alternate decode path.
            AUv3Diagnostics.log("ℹ️ AUv3: AVAudioFile unavailable (\(error.localizedDescription)) — using AVAssetReader")
            decodeWithAssetReader(url: url, gen: gen, startPositionNormalized: startPositionNormalized)
        }
    }

    func decodeWithAssetReader(url: URL, gen: Int, startPositionNormalized: Float?) {
        let outSR = self.getSampleRate() ?? 44100.0
        let asset = AVURLAsset(url: url)
        // Load audio track using modern API when available
        var track: AVAssetTrack?
        var assetDuration = CMTime.invalid
        if #available(iOS 16.0, *) {
            let sem = DispatchSemaphore(value: 0)
        Task {
                do {
                    let tracks = try await asset.load(.tracks)
                    assetDuration = try await asset.load(.duration)
            for t in tracks { if t.mediaType == .audio { track = t; break } }
                } catch {
                    // leave track as nil
                }
                sem.signal()
            }
            sem.wait()
        } else {
            track = asset.tracks(withMediaType: .audio).first
            assetDuration = asset.duration
        }
        guard let track else {
            AUv3Diagnostics.log("❌ AUv3: no audio track in asset")
            if gen == self.currentDecodeGen {
                self.isDecodingFile = false
            }
            return
        }

        do {
            let reader = try AVAssetReader(asset: asset)
            let durationSeconds = CMTimeGetSeconds(assetDuration)
            let requestedStartSeconds = (startPositionNormalized != nil && durationSeconds.isFinite && durationSeconds > 0)
                ? max(0.0, min(durationSeconds * Double(startPositionNormalized ?? 0), max(0.0, durationSeconds - 0.001)))
                : 0.0
            if requestedStartSeconds > 0 {
                let startTime = CMTime(seconds: requestedStartSeconds, preferredTimescale: 600)
                reader.timeRange = CMTimeRange(start: startTime, duration: CMTime.positiveInfinity)
            }
            AUv3Diagnostics.log("🎧 AUv3 asset reader start gen=\(gen) file=\(url.lastPathComponent) requestedStart=\(String(format: "%.4f", requestedStartSeconds)) duration=\(durationSeconds.isFinite ? String(format: "%.4f", durationSeconds) : "unknown")")
            // Request float32 PCM at host sample rate, stereo, interleaved
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVLinearPCMBitDepthKey: 32,
                AVLinearPCMIsFloatKey: true,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false,
                AVSampleRateKey: outSR,
                AVNumberOfChannelsKey: 2
            ]
            let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
            output.alwaysCopiesSampleData = false
            guard reader.canAdd(output) else {
                AUv3Diagnostics.log("❌ AUv3: cannot add asset reader output")
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
                return
            }
            reader.add(output)
            guard reader.startReading() else {
                AUv3Diagnostics.log("❌ AUv3: asset reader failed to start")
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
                return
            }

            var outL: [Float] = []
            var outR: [Float] = []
            var determinedChannels: Int? = nil
            var chunkCount = 0
            var reachedEOF = false
            // Prebuffer target ~200ms to start playback fast
            // Target ~50-100ms, but never less than 1024 frames
            let primeFrames = max(1024, min(Int(outSR * 0.05), 16384))
            var primed = false
            while reader.status == .reading {
                guard let sb = output.copyNextSampleBuffer() else { break }
                if let block = CMSampleBufferGetDataBuffer(sb) {
                    // Determine channel count from sample buffer's format description (non-deprecated)
                    if determinedChannels == nil, let fmt = CMSampleBufferGetFormatDescription(sb) {
                        if let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fmt)?.pointee {
                            determinedChannels = Int(asbd.mChannelsPerFrame)
                        }
                    }
                    let chCount = max(1, determinedChannels ?? 2)

                    let length = CMBlockBufferGetDataLength(block)
                    var data = Data(count: length)
                    data.withUnsafeMutableBytes { ptr in
                        _ = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: ptr.baseAddress!)
                    }
                    let floats = data.withUnsafeBytes { raw -> [Float] in
                        let p = raw.bindMemory(to: Float.self)
                        return Array(p)
                    }
                    if chunkCount < 3 {
                        AUv3Diagnostics.log("📦 AUv3: asset reader chunk floats=\(floats.count) ch=\(chCount) bytes=\(length)")
                        chunkCount += 1
                    }
                    if chCount >= 2 {
                        // Interleaved LRLR...
                        let frames = floats.count / chCount
                        outL.reserveCapacity(outL.count + frames)
                        outR.reserveCapacity(outR.count + frames)
                        for i in 0..<frames {
                            outL.append(floats[i*chCount + 0])
                            outR.append(floats[i*chCount + 1])
                        }
                    } else {
                        outL.append(contentsOf: floats)
                        outR.append(contentsOf: floats)
                    }
                }
                CMSampleBufferInvalidate(sb)
                // Prime playback as soon as we have enough frames
                if !primed && outL.count >= primeFrames {
                    os_unfair_lock_lock(&fileLock)
                    if gen == self.currentDecodeGen {
                        self.fileAudioL = outL
                        self.fileAudioR = outR
                        self.fileSampleRate = outSR
                        self.fileFrameIndex = 0
                        self.fileLoaded = true
                    }
                    let primedFrames = min(self.fileAudioL.count, self.fileAudioR.count)
                    os_unfair_lock_unlock(&fileLock)
                    primed = true
                    DispatchQueue.main.async { AUv3Diagnostics.log("🚀 AUv3: primed playback gen=\(gen) frames=\(primedFrames)") }
                    self.isTestToneActive = false
                    // First chunk ready -> notify JS for zero-wait play
                    if gen == self.currentDecodeGen {
                        self.emitClipReady(path: url.path)
                        self.consumePendingScrubPreviewIfNeeded(path: url.path)
                    }
                    // IMPORTANT: clear staging buffers so the next iteration only carries NEW data
                    outL.removeAll(keepingCapacity: true)
                    outR.removeAll(keepingCapacity: true)
                } else if primed {
                    // Stream-append more decoded data to shared buffers
                    if gen == self.currentDecodeGen {
                        os_unfair_lock_lock(&fileLock)
                        self.fileAudioL.append(contentsOf: outL)
                        self.fileAudioR.append(contentsOf: outR)
                        os_unfair_lock_unlock(&fileLock)
                    }
                    outL.removeAll(keepingCapacity: true)
                    outR.removeAll(keepingCapacity: true)
                }
            }
            if reader.status == .reading { reachedEOF = true }

            if reachedEOF && (!outL.isEmpty || primed) {
                AUv3Diagnostics.log("ℹ️ AUv3: asset reader reached EOF with status 'reading'; committing decoded data")
                var totalFrames = 0
                if gen == self.currentDecodeGen {
                    os_unfair_lock_lock(&fileLock)
                    if primed {
                        self.fileAudioL.append(contentsOf: outL)
                        self.fileAudioR.append(contentsOf: outR)
                    } else {
                        self.fileAudioL = outL
                        self.fileAudioR = outR
                        self.fileLoaded = true
                    }
                    self.fileSampleRate = outSR
                    totalFrames = self.fileAudioL.count
                    if !primed {
                        self.fileFrameIndex = 0
                    }
                    os_unfair_lock_unlock(&fileLock)
                }
                let finalFrames = totalFrames
                DispatchQueue.main.async { AUv3Diagnostics.log("📥 AUv3: decoded (asset reader, EOF) gen=\(gen) frames=\(finalFrames)") }
                self.isTestToneActive = false
                // Do not auto-start playback; wait for explicit 'play' param from UI
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
                return
            }

            switch reader.status {
            case .completed:
                var totalFrames = 0
                if gen == self.currentDecodeGen {
                    os_unfair_lock_lock(&fileLock)
                    if primed {
                        self.fileAudioL.append(contentsOf: outL)
                        self.fileAudioR.append(contentsOf: outR)
                    } else {
                        self.fileAudioL = outL
                        self.fileAudioR = outR
                        self.fileLoaded = !outL.isEmpty
                    }
                    self.fileSampleRate = outSR
                    totalFrames = self.fileAudioL.count
                    if !primed {
                        self.fileFrameIndex = 0
                    }
                    os_unfair_lock_unlock(&fileLock)
                }
                let finalFrames = totalFrames
                DispatchQueue.main.async { AUv3Diagnostics.log("📥 AUv3: decoded (asset reader) gen=\(gen) frames=\(finalFrames)") }
                if outL.isEmpty {
                    // No decoded audio; keep silent (do not auto-enable test tone)
                    self.isTestToneActive = false
                } else {
                    // Decoded OK; keep playback stopped until UI requests play
                    self.isTestToneActive = false
                }
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
                if gen == self.currentDecodeGen, self.fileLoaded {
                    self.emitClipReady(path: url.path)
                    self.consumePendingScrubPreviewIfNeeded(path: url.path)
                }
            case .failed:
                AUv3Diagnostics.log("❌ AUv3: asset reader failed: \(reader.error?.localizedDescription ?? "unknown error")")
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
            case .cancelled:
                AUv3Diagnostics.log("⚠️ AUv3: asset reader cancelled")
                if gen == self.currentDecodeGen {
                    self.isDecodingFile = false
                }
            default:
                AUv3Diagnostics.log("ℹ️ AUv3: asset reader finished with status=\(reader.status.rawValue)")
                self.isDecodingFile = false
            }
        } catch {
            AUv3Diagnostics.log("❌ AUv3: asset reader error \(error.localizedDescription)")
            self.isDecodingFile = false
        }
    }
    

}
