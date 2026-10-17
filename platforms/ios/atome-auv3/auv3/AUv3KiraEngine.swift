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
