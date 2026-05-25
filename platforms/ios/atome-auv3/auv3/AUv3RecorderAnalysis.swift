//
//  AUv3RecorderAnalysis.swift
//  auv3
//

import Foundation

extension auv3Utils {
    func analyzeRecordedFile(at url: URL) -> [String: Any]? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            guard data.count >= 44 else { return nil }

            func readUInt16(_ offset: Int) -> UInt16? {
                guard offset + 2 <= data.count else { return nil }
                return data.subdata(in: offset..<(offset + 2)).withUnsafeBytes { raw in
                    raw.load(as: UInt16.self).littleEndian
                }
            }
            func readUInt32(_ offset: Int) -> UInt32? {
                guard offset + 4 <= data.count else { return nil }
                return data.subdata(in: offset..<(offset + 4)).withUnsafeBytes { raw in
                    raw.load(as: UInt32.self).littleEndian
                }
            }
            func readInt16(_ offset: Int) -> Int16? {
                guard offset + 2 <= data.count else { return nil }
                return data.subdata(in: offset..<(offset + 2)).withUnsafeBytes { raw in
                    Int16(bitPattern: raw.load(as: UInt16.self).littleEndian)
                }
            }
            func readInt32(_ offset: Int) -> Int32? {
                guard offset + 4 <= data.count else { return nil }
                return data.subdata(in: offset..<(offset + 4)).withUnsafeBytes { raw in
                    Int32(bitPattern: raw.load(as: UInt32.self).littleEndian)
                }
            }
            func readFloat32(_ offset: Int) -> Float32? {
                guard let bits = readUInt32(offset) else { return nil }
                return Float32(bitPattern: bits)
            }

            guard String(data: data.prefix(4), encoding: .ascii) == "RIFF",
                  String(data: data.subdata(in: 8..<12), encoding: .ascii) == "WAVE" else {
                return nil
            }

            var offset = 12
            var audioFormat: UInt16 = 0
            var channels: Int = 0
            var sampleRate: Double = 0
            var bitsPerSample: Int = 0
            var dataOffset: Int = 0
            var dataSize: Int = 0

            while offset + 8 <= data.count {
                let chunkId = String(data: data.subdata(in: offset..<(offset + 4)), encoding: .ascii) ?? ""
                let chunkSize = Int(readUInt32(offset + 4) ?? 0)
                let chunkDataOffset = offset + 8
                if chunkDataOffset + chunkSize > data.count { break }
                if chunkId == "fmt " {
                    audioFormat = readUInt16(chunkDataOffset) ?? 0
                    channels = Int(readUInt16(chunkDataOffset + 2) ?? 0)
                    sampleRate = Double(readUInt32(chunkDataOffset + 4) ?? 0)
                    bitsPerSample = Int(readUInt16(chunkDataOffset + 14) ?? 0)
                } else if chunkId == "data" {
                    dataOffset = chunkDataOffset
                    dataSize = chunkSize
                    break
                }
                offset = chunkDataOffset + chunkSize + (chunkSize % 2)
            }

            guard channels > 0, sampleRate > 0, bitsPerSample > 0, dataOffset > 0, dataSize > 0 else {
                return nil
            }

            let bytesPerSample = max(1, bitsPerSample / 8)
            let blockAlign = bytesPerSample * channels
            guard blockAlign > 0 else { return nil }
            let frameCount = dataSize / blockAlign
            guard frameCount > 0 else { return nil }

            func sampleValue(frame: Int, channel: Int) -> Float {
                let sampleOffset = dataOffset + ((frame * channels + channel) * bytesPerSample)
                switch (audioFormat, bitsPerSample) {
                case (3, 32):
                    return readFloat32(sampleOffset) ?? 0
                case (_, 16):
                    guard let value = readInt16(sampleOffset) else { return 0 }
                    return Float(value) / 32768.0
                case (_, 32):
                    if audioFormat == 3 {
                        return readFloat32(sampleOffset) ?? 0
                    }
                    guard let value = readInt32(sampleOffset) else { return 0 }
                    return Float(value) / 2147483648.0
                case (_, 8):
                    guard sampleOffset < data.count else { return 0 }
                    return (Float(data[sampleOffset]) - 128.0) / 128.0
                default:
                    return 0
                }
            }

            var peak: Float = 0
            for frame in 0..<frameCount {
                var framePeak: Float = 0
                for channel in 0..<channels {
                    framePeak = max(framePeak, abs(sampleValue(frame: frame, channel: channel)))
                }
                peak = max(peak, framePeak)
            }

            let adaptiveThreshold = max(0.05, peak * 0.5)
            var firstPeakFrame: Int? = nil
            for frame in 0..<frameCount {
                var framePeak: Float = 0
                for channel in 0..<channels {
                    framePeak = max(framePeak, abs(sampleValue(frame: frame, channel: channel)))
                }
                if framePeak >= adaptiveThreshold {
                    firstPeakFrame = frame
                    break
                }
            }

            return [
                "peak": peak,
                "first_peak_frame": firstPeakFrame as Any
            ]
        } catch {
            AUv3Diagnostics.log("AUv3: failed to analyze recorded file at \(url.path): \(error.localizedDescription)")
            return nil
        }
    }
}
