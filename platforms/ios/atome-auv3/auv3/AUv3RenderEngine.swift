//
//  AUv3RenderEngine.swift
//  auv3
//

import AVFoundation
import CoreAudio
import CoreMedia
import Foundation
import Accelerate
import QuartzCore
import os.lock

extension auv3Utils {
    // MARK: - Audio Processing
    
    public override var internalRenderBlock: AUInternalRenderBlock {
        return { [weak self] actionFlags, timestamp, frameCount, outputBusNumber, outputData, realtimeEventListHead, pullInputBlock in
            guard let strongSelf = self else { return kAudioUnitErr_NoConnection }
            
            // Safety check: Ensure audio unit is properly initialized
            guard strongSelf._outputBusArray != nil, strongSelf._inputBusArray != nil else {
                // If not properly initialized, return silence to prevent "invalid reuse after initialization failure"
                let bufferList = AudioBufferListWrapper(ptr: outputData)
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData {
                        memset(mData, 0, Int(buffer.mDataByteSize))
                    }
                }
                return noErr
            }
            
            // Process MIDI events first (lightweight)
            if let eventList = realtimeEventListHead?.pointee {
                strongSelf.processMIDIEvents(eventList)
            }

            let bufferList = AudioBufferListWrapper(ptr: outputData)
            let renderStartFrame = strongSelf.audioDebugRenderFrameCursor
            var pulledPluginInputThisQuantum = false
            // Determine output layout
            let outFormat = strongSelf._outputBusArray?[0].format
            let outChannels = Int(outFormat?.channelCount ?? 2)
            let outInterleaved = outFormat?.isInterleaved ?? false
            let outIsFloat32 = (outFormat?.commonFormat == .pcmFormatFloat32)
            
            // File playback path (render decoded PCM if available)
            os_unfair_lock_lock(&strongSelf.fileLock)
            let mainFrames = min(strongSelf.fileAudioL.count, strongSelf.fileAudioR.count)
            let renderMainSlot = strongSelf.playActive
                && strongSelf.fileLoaded
                && strongSelf.fileFrameIndex < mainFrames
            let hasAuxAudio = strongSelf.playActive && strongSelf.auxSlots.contains { slot in
                slot.loaded && slot.frameIndex < min(slot.audioL.count, slot.audioR.count)
            }
            os_unfair_lock_unlock(&strongSelf.fileLock)
            let renderAuxOnly = hasAuxAudio && !renderMainSlot
            var exactPlaybackQuantum: ExactPlaybackQuantum? = nil
            if renderMainSlot || renderAuxOnly {
                exactPlaybackQuantum = strongSelf.latchExactPlaybackQuantum(
                    timestamp: timestamp,
                    frameCount: frameCount
                )
            }

            if renderMainSlot {
                let channels = outChannels
                let framesToWrite = Int(frameCount)
                // Snapshot state once per render to avoid per-sample locking
                os_unfair_lock_lock(&strongSelf.fileLock)
                let localL = strongSelf.fileAudioL
                let localR = strongSelf.fileAudioR
                let totalFrames = min(localL.count, localR.count)
                var idx = strongSelf.fileFrameIndex
                var fadeRem = strongSelf.fadeInSamplesRemaining
                let fadeTot = strongSelf.fadeInTotal
                os_unfair_lock_unlock(&strongSelf.fileLock)
                // Write depending on buffer layout
        if outInterleaved || bufferList.numberOfBuffers == 1 {
                    // interleaved: single buffer with LRLR...
                    let buffer = bufferList.buffer(at: 0)
                    if let mData = buffer.mData {
            let framesAvailable = framesToWrite
                        var localIdx = idx
                        for f in 0..<framesAvailable {
                            var sL: Float = (localIdx < totalFrames ? localL[localIdx] : 0)
                            var sR: Float = (channels > 1 ? (localIdx < totalFrames ? localR[localIdx] : 0) : (localIdx < totalFrames ? localL[localIdx] : 0))
                            if fadeRem > 0 && fadeTot > 0 {
                                let fi = Float(fadeTot - fadeRem)
                                let g = max(0.0, min(1.0, fi / Float(fadeTot)))
                                sL *= g; sR *= g; fadeRem &-= 1
                            }
                            sL *= strongSelf.masterGain
                            sR *= strongSelf.masterGain
                            if outIsFloat32 {
                                let out = mData.assumingMemoryBound(to: Float.self)
                                if channels == 1 { out[f] = sL }
                                else { out[f*channels + 0] = sL; out[f*channels + 1] = sR }
                            } else {
                                let outI16 = mData.assumingMemoryBound(to: Int16.self)
                                let cl = Int16(max(-1.0, min(1.0, sL)) * 32767.0)
                                if channels == 1 { outI16[f] = cl }
                                else {
                                    let cr = Int16(max(-1.0, min(1.0, sR)) * 32767.0)
                                    outI16[f*channels + 0] = cl
                                    outI16[f*channels + 1] = cr
                                }
                            }
                            localIdx &+= 1
                        }
                    }
                } else {
                    // planar: one buffer per channel
                    // Fast-path for Float32 planar: memcpy or vDSP scale when no fade
                    if outIsFloat32 {
                        let framesAvail = max(0, min(framesToWrite, totalFrames - idx))
                        // ch 0
                        if bufferList.numberOfBuffers > 0, let mData = bufferList.buffer(at: 0).mData {
                            let dst = mData.assumingMemoryBound(to: Float.self)
                            if fadeRem == 0 && abs(strongSelf.masterGain - 1.0) < 1e-4 {
                                localL.withUnsafeBufferPointer { srcPtr in
                                    let src = srcPtr.baseAddress!.advanced(by: idx)
                                    memcpy(dst, src, framesAvail * MemoryLayout<Float>.size)
                                }
                            } else {
                                localL.withUnsafeBufferPointer { srcPtr in
                                    let src = srcPtr.baseAddress!.advanced(by: idx)
                                    if fadeRem == 0 {
                                        var g = strongSelf.masterGain
                                        vDSP_vsmul(src, 1, &g, dst, 1, vDSP_Length(framesAvail))
                                    } else {
                                        // Fallback per-sample when fade active
                                        var localIdx = idx
                                        for f in 0..<framesToWrite {
                                            var v: Float = (localIdx < totalFrames ? srcPtr[localIdx] : 0)
                                            if fadeRem > 0 && fadeTot > 0 {
                                                let fi = Float(fadeTot - fadeRem)
                                                let gg = max(0.0, min(1.0, fi / Float(fadeTot)))
                                                v *= gg; fadeRem &-= 1
                                            }
                                            v *= strongSelf.masterGain
                                            dst[f] = v
                                            localIdx &+= 1
                                        }
                                    }
                                }
                            }
                        }
                        // ch 1
                        if channels > 1, bufferList.numberOfBuffers > 1, let mData1 = bufferList.buffer(at: 1).mData {
                            let dst1 = mData1.assumingMemoryBound(to: Float.self)
                            if fadeRem == 0 && abs(strongSelf.masterGain - 1.0) < 1e-4 {
                                localR.withUnsafeBufferPointer { srcPtr in
                                    let src = srcPtr.baseAddress!.advanced(by: idx)
                                    memcpy(dst1, src, framesAvail * MemoryLayout<Float>.size)
                                }
                            } else {
                                localR.withUnsafeBufferPointer { srcPtr in
                                    let src = srcPtr.baseAddress!.advanced(by: idx)
                                    if fadeRem == 0 {
                                        var g = strongSelf.masterGain
                                        vDSP_vsmul(src, 1, &g, dst1, 1, vDSP_Length(framesAvail))
                                    } else {
                                        var localIdx = idx
                                        for f in 0..<framesToWrite {
                                            var v: Float = (localIdx < totalFrames ? srcPtr[localIdx] : 0)
                                            if fadeRem > 0 && fadeTot > 0 {
                                                let fi = Float(fadeTot - fadeRem)
                                                let gg = max(0.0, min(1.0, fi / Float(fadeTot)))
                                                v *= gg; fadeRem &-= 1
                                            }
                                            v *= strongSelf.masterGain
                                            dst1[f] = v
                                            localIdx &+= 1
                                        }
                                    }
                                }
                            }
                        }
                        // Zero-fill tail if request > available
                        if framesAvail < framesToWrite {
                            for ch in 0..<min(bufferList.numberOfBuffers, channels) {
                                let buf = bufferList.buffer(at: ch)
                                if let mData = buf.mData {
                                    let dst = mData.assumingMemoryBound(to: Float.self)
                                    memset(dst.advanced(by: framesAvail), 0, (framesToWrite - framesAvail) * MemoryLayout<Float>.size)
                                }
                            }
                        }
                    } else {
                        // Fallback: original per-sample path (int16 or non-float)
                        for ch in 0..<min(bufferList.numberOfBuffers, channels) {
                            let buffer = bufferList.buffer(at: ch)
                            guard let mData = buffer.mData else { continue }
                            let dataCount = framesToWrite
                            var localIdx = idx
                            for f in 0..<dataCount {
                                let s: Float = (localIdx < totalFrames ? (ch == 0 ? localL[localIdx] : localR[localIdx]) : 0)
                                var v = s
                                if fadeRem > 0 && fadeTot > 0 {
                                    let fi = Float(fadeTot - fadeRem)
                                    let g = max(0.0, min(1.0, fi / Float(fadeTot)))
                                    v *= g; fadeRem &-= 1
                                }
                                v *= strongSelf.masterGain
                                let outI16 = mData.assumingMemoryBound(to: Int16.self)
                                outI16[f] = Int16(max(-1.0, min(1.0, v)) * 32767.0)
                                localIdx &+= 1
                            }
                        }
                    }
                }
                // Advance shared index and handle end-of-file
                os_unfair_lock_lock(&strongSelf.fileLock)
                idx &+= framesToWrite
                if idx >= min(localL.count, localR.count) {
                    idx = min(localL.count, localR.count) // clamp to EOF
                    // Only auto-stop if no aux slots still have audio
                    let auxActive = strongSelf.auxSlots.contains { slot in
                        slot.loaded && slot.frameIndex < min(slot.audioL.count, slot.audioR.count)
                    }
                    if !auxActive {
                        strongSelf.playActive = false
                    }
                    strongSelf.fadeInSamplesRemaining = 0
                }
                strongSelf.fileFrameIndex = idx
                strongSelf.fadeInSamplesRemaining = max(0, fadeRem)
                os_unfair_lock_unlock(&strongSelf.fileLock)
            } else if renderAuxOnly {
                // No main slot data but aux slots need to play — zero output first
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData { memset(mData, 0, Int(buffer.mDataByteSize)) }
                }
            } else if strongSelf.isTestToneActive {
                    let sampleRate = strongSelf.getSampleRate() ?? 44100.0
                    let ch = max(1, outChannels)
                    if outInterleaved || bufferList.numberOfBuffers == 1 {
                        let buffer = bufferList.buffer(at: 0)
                        if let mData = buffer.mData {
                            let frames = Int(frameCount)
                            for f in 0..<frames {
                                strongSelf.testTonePhase += 2.0 * Double.pi * strongSelf.testToneFrequency / sampleRate
                                if strongSelf.testTonePhase >= 2.0 * Double.pi { strongSelf.testTonePhase -= 2.0 * Double.pi }
                                let s = Float(sin(strongSelf.testTonePhase) * 0.25) * strongSelf.masterGain
                                if outIsFloat32 {
                                    let out = mData.assumingMemoryBound(to: Float.self)
                                    if ch == 1 { out[f] = s } else { out[f*ch+0] = s; out[f*ch+1] = s }
                                } else {
                                    let outI16 = mData.assumingMemoryBound(to: Int16.self)
                                    let si = Int16(max(-1.0, min(1.0, s)) * 32767.0)
                                    if ch == 1 { outI16[f] = si } else { outI16[f*ch+0] = si; outI16[f*ch+1] = si }
                                }
                            }
                        }
                    } else {
                        let buffers = min(bufferList.numberOfBuffers, ch)
                        for i in 0..<buffers {
                            let buffer = bufferList.buffer(at: i)
                            if let mData = buffer.mData {
                                let frames = Int(frameCount)
                                for f in 0..<frames {
                                    strongSelf.testTonePhase += 2.0 * Double.pi * strongSelf.testToneFrequency / sampleRate
                                    if strongSelf.testTonePhase >= 2.0 * Double.pi { strongSelf.testTonePhase -= 2.0 * Double.pi }
                                    let s = Float(sin(strongSelf.testTonePhase) * 0.25) * strongSelf.masterGain
                                    if outIsFloat32 {
                                        let out = mData.assumingMemoryBound(to: Float.self)
                                        out[f] = s
                                    } else {
                                        let outI16 = mData.assumingMemoryBound(to: Int16.self)
                                        outI16[f] = Int16(max(-1.0, min(1.0, s)) * 32767.0)
                                    }
                                }
                            }
                        }
                    }
            } else {
                // Passthrough path: pull upstream audio when we are idle
                if strongSelf.recordingState == .recording && strongSelf.recordingSource == "plugin_input" {
                    pulledPluginInputThisQuantum = true
                    let captured = strongSelf.captureRecordingInput(
                        pullInputBlock: pullInputBlock,
                        timestamp: timestamp,
                        frameCount: frameCount,
                        targetBufferList: outputData,
                        playbackQuantum: exactPlaybackQuantum
                    )
                    if !captured {
                        for i in 0..<bufferList.numberOfBuffers {
                            let buffer = bufferList.buffer(at: i)
                            if let mData = buffer.mData { memset(mData, 0, Int(buffer.mDataByteSize)) }
                        }
                    }
                } else if let pull = pullInputBlock {
                    let status = pull(actionFlags, timestamp, frameCount, outputBusNumber, outputData)
                    if status != noErr {
                        for i in 0..<bufferList.numberOfBuffers {
                            let buffer = bufferList.buffer(at: i)
                            if let mData = buffer.mData { memset(mData, 0, Int(buffer.mDataByteSize)) }
                        }
                    }
                } else {
                    for i in 0..<bufferList.numberOfBuffers {
                        let buffer = bufferList.buffer(at: i)
                        if let mData = buffer.mData { memset(mData, 0, Int(buffer.mDataByteSize)) }
                    }
                }
            }

            // Mix in auxiliary audio slots (concurrent playback)
            // Runs after main slot or aux-only zero-fill; ADDs samples on top.
            if (renderMainSlot || renderAuxOnly) && hasAuxAudio {
                os_unfair_lock_lock(&strongSelf.fileLock)
                let auxCopy = strongSelf.auxSlots
                os_unfair_lock_unlock(&strongSelf.fileLock)
                let framesToMix = Int(frameCount)
                let channels = outChannels
                for auxSlot in auxCopy where auxSlot.loaded {
                    let auxTotal = min(auxSlot.audioL.count, auxSlot.audioR.count)
                    let auxIdx = auxSlot.frameIndex
                    if auxIdx >= auxTotal { continue }
                    let mixFrames = min(framesToMix, auxTotal - auxIdx)
                    if outInterleaved || bufferList.numberOfBuffers == 1 {
                        let buffer = bufferList.buffer(at: 0)
                        if let mData = buffer.mData {
                            if outIsFloat32 {
                                let out = mData.assumingMemoryBound(to: Float.self)
                                for f in 0..<mixFrames {
                                    let sL = auxSlot.audioL[auxIdx + f] * strongSelf.masterGain
                                    let sR = (channels > 1 ? auxSlot.audioR[auxIdx + f] : auxSlot.audioL[auxIdx + f]) * strongSelf.masterGain
                                    if channels == 1 { out[f] += sL }
                                    else { out[f*channels + 0] += sL; out[f*channels + 1] += sR }
                                }
                            } else {
                                let out = mData.assumingMemoryBound(to: Int16.self)
                                for f in 0..<mixFrames {
                                    let sL = auxSlot.audioL[auxIdx + f] * strongSelf.masterGain
                                    let sR = (channels > 1 ? auxSlot.audioR[auxIdx + f] : auxSlot.audioL[auxIdx + f]) * strongSelf.masterGain
                                    if channels == 1 {
                                        let cur = Float(out[f]) / 32767.0
                                        out[f] = Int16(max(-1.0, min(1.0, cur + sL)) * 32767.0)
                                    } else {
                                        let curL = Float(out[f*channels + 0]) / 32767.0
                                        let curR = Float(out[f*channels + 1]) / 32767.0
                                        out[f*channels + 0] = Int16(max(-1.0, min(1.0, curL + sL)) * 32767.0)
                                        out[f*channels + 1] = Int16(max(-1.0, min(1.0, curR + sR)) * 32767.0)
                                    }
                                }
                            }
                        }
                    } else if outIsFloat32 {
                        if bufferList.numberOfBuffers > 0, let mData = bufferList.buffer(at: 0).mData {
                            let dst = mData.assumingMemoryBound(to: Float.self)
                            for f in 0..<mixFrames {
                                dst[f] += auxSlot.audioL[auxIdx + f] * strongSelf.masterGain
                            }
                        }
                        if channels > 1, bufferList.numberOfBuffers > 1, let mData1 = bufferList.buffer(at: 1).mData {
                            let dst1 = mData1.assumingMemoryBound(to: Float.self)
                            for f in 0..<mixFrames {
                                dst1[f] += auxSlot.audioR[auxIdx + f] * strongSelf.masterGain
                            }
                        }
                    }
                    auxSlot.frameIndex += framesToMix
                }
            }

            // NOUVEAU: Mix JavaScript audio into the output
            if strongSelf.jsAudioActive {
                strongSelf.mixJavaScriptAudio(bufferList: bufferList,
                                              frameCount: frameCount,
                                              renderStartFrame: renderStartFrame)
            }

            // Optional debug capture of ch0 (mix) at low cost
            if strongSelf.dbgCaptureEnabled, bufferList.numberOfBuffers > 0 {
                let buf = bufferList.buffer(at: 0)
                if let mData = buf.mData {
                    let inF = mData.assumingMemoryBound(to: Float.self)
                    let count = Int(buf.mDataByteSize) / MemoryLayout<Float>.size
                    var di = strongSelf.dbgIndex
                    for i in 0..<count {
                        strongSelf.dbgBuffer[di] = inF[i]
                        di &+= 1
                        if di >= strongSelf.dbgBuffer.count { di = 0 }
                    }
                    strongSelf.dbgIndex = di
                }
            }

            if strongSelf.recordingState == .recording {
                if strongSelf.recordingSource == "plugin" {
                    strongSelf.markAudioRecordingStartFrame(renderStartFrame)
                    strongSelf.captureRecordingOutput(bufferList: bufferList,
                                                      channels: outChannels,
                                                      frames: frameCount,
                                                      interleaved: outInterleaved,
                                                      isFloat32: outIsFloat32)
                } else if strongSelf.recordingSource == "plugin_input" && !pulledPluginInputThisQuantum {
                    strongSelf.captureRecordingInput(pullInputBlock: pullInputBlock,
                                                     timestamp: timestamp,
                                                     frameCount: frameCount,
                                                     playbackQuantum: exactPlaybackQuantum)
                }
            }

            // Handle muting (lightweight operation)
            if strongSelf.isMuted {
                for i in 0..<bufferList.numberOfBuffers {
                    let buffer = bufferList.buffer(at: i)
                    if let mData = buffer.mData {
                        memset(mData, 0, Int(buffer.mDataByteSize))
                    }
                }
            }
            
            // Keep AUv3 host transport fresh enough for timeline and loop sync.
            let currentTime = CACurrentMediaTime()
            if currentTime - strongSelf.lastTransportCheck >= 0.05 {
                if strongSelf.shouldPollTransport() { // nouvelle condition unifiée
                    strongSelf.checkHostTransport()
                }
                strongSelf.lastTransportCheck = currentTime
            }

            strongSelf.audioDebugRenderFrameCursor += Int64(frameCount)

            return noErr
        }
    }
}
