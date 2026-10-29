//
//  AUv3KiraEngine.swift
//  auv3
//
//  The native Kira engine (Rust, atome-audio-engine) inside the audio unit
//  (todo/audio_to_finalize §6.1, step C): it renders ahead on its own thread,
//  and the render block only pulls its frames on the host's clock and adds
//  them to the output. Real-time safe: preallocated buffers, no lock.

import AudioToolbox
import Foundation

extension auv3Utils {
    static let kiraScratchFrames = 4096

    /// Releases the render buffers (called once, when the audio unit goes away).
    func releaseKiraEngineBuffers() {
        kiraEngineStarted = false
        kiraLeft.deallocate()
        kiraRight.deallocate()
    }

    /// Nanoseconds per mach host tick (the clock of `AudioTimeStamp.mHostTime`).
    static let machNanosPerTick: Double = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(info.numer) / Double(max(1, info.denom))
    }()

    /// The host's input, just pulled into the output buffers, handed to the strips whose IN is `host`
    /// (todo/effets_generateurs_audio L8). When one listens, the dry input leaves the output: the chain
    /// plays it, added by `mixKiraEngine` in this same quantum. Real-time safe: the scratch is preallocated.
    func routeHostInput(bufferList: AudioBufferListWrapper,
                        frameCount: AUAudioFrameCount,
                        channels: Int,
                        interleaved: Bool,
                        isFloat32: Bool) {
        let frames = Int(frameCount)
        guard kiraEngineStarted, isFloat32, frames <= Self.kiraScratchFrames, bufferList.numberOfBuffers > 0 else { return }
        let listened: Bool
        if interleaved || bufferList.numberOfBuffers == 1 {
            guard let mData = bufferList.buffer(at: 0).mData else { return }
            let input = mData.assumingMemoryBound(to: Float.self)
            let stride = max(1, channels)
            for frame in 0..<frames {
                kiraLeft[frame] = input[frame * stride]
                kiraRight[frame] = stride > 1 ? input[frame * stride + 1] : input[frame * stride]
            }
            listened = atome_ios_audio_host_input(kiraLeft, kiraRight, frameCount)
        } else {
            guard let left = bufferList.buffer(at: 0).mData?.assumingMemoryBound(to: Float.self) else { return }
            let right = bufferList.buffer(at: 1).mData?.assumingMemoryBound(to: Float.self) ?? left
            listened = atome_ios_audio_host_input(left, right, frameCount)
        }
        guard listened else { return }
        for index in 0..<bufferList.numberOfBuffers {
            let buffer = bufferList.buffer(at: index)
            if let mData = buffer.mData { memset(mData, 0, Int(buffer.mDataByteSize)) }
        }
    }

    func mixKiraEngine(bufferList: AudioBufferListWrapper,
                       frameCount: AUAudioFrameCount,
                       timestamp: UnsafePointer<AudioTimeStamp>,
                       channels: Int,
                       interleaved: Bool,
                       isFloat32: Bool) {
        let frames = Int(frameCount)
        guard kiraEngineStarted, isFloat32, frames <= Self.kiraScratchFrames else { return }
        let hostNs = Int64(Double(timestamp.pointee.mHostTime) * Self.machNanosPerTick)
        let got = Int(atome_ios_audio_host_render(kiraLeft, kiraRight, frameCount, hostNs))
        guard got > 0 else { return }
        if interleaved || bufferList.numberOfBuffers == 1 {
            guard let mData = bufferList.buffer(at: 0).mData else { return }
            let out = mData.assumingMemoryBound(to: Float.self)
            let stride = max(1, channels)
            for frame in 0..<got {
                if stride == 1 {
                    out[frame] += (kiraLeft[frame] + kiraRight[frame]) * 0.5
                } else {
                    out[frame * stride] += kiraLeft[frame]
                    out[frame * stride + 1] += kiraRight[frame]
                }
            }
            return
        }
        if let left = bufferList.buffer(at: 0).mData?.assumingMemoryBound(to: Float.self) {
            for frame in 0..<got { left[frame] += kiraLeft[frame] }
        }
        if bufferList.numberOfBuffers > 1, let right = bufferList.buffer(at: 1).mData?.assumingMemoryBound(to: Float.self) {
            for frame in 0..<got { right[frame] += kiraRight[frame] }
        }
    }
}
