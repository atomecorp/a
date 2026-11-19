//
//  AUv3TransportObserver.swift
//  auv3
//
//  Reads the host transport inside the render block and keeps it, with the
//  host instant of that quantum's first frame, for the host streams
//  (`WebViewManager.startHostTimeStream` / `startHostStateStream`): the
//  Timeline locks its playback onto that instant (auv3_host_bridge.js).

import AVFoundation
import Foundation

extension auv3Utils {
    /// Real-time: `hostTime` is the render quantum's `AudioTimeStamp.mHostTime`.
    func checkHostTransport(hostTime: UInt64) {
        guard let tsBlock = self.transportStateBlock else { return }
        var flags = AUHostTransportStateFlags(rawValue: 0)
        var currentSampleTime: Double = 0
        var cycleStartBeat: Double = 0
        var cycleEndBeat: Double = 0
        guard tsBlock(&flags, &currentSampleTime, &cycleStartBeat, &cycleEndBeat) else { return }
        let isPlaying = (flags.rawValue & AUHostTransportStateFlags.moving.rawValue) != 0
        let sr = getSampleRate() ?? 44100.0
        var playheadSeconds = currentSampleTime / sr
        if let musicalBlock = self.musicalContextBlock {
            var tempo: Double = 0
            var numerator: Double = 0
            var denominator: Int = 0
            var beatPosition: Double = 0
            var sampleOffsetToNextBeat: Int = 0
            var measureDownbeat: Double = 0
            if musicalBlock(&tempo,
                            &numerator,
                            &denominator,
                            &beatPosition,
                            &sampleOffsetToNextBeat,
                            &measureDownbeat),
               tempo > 0,
               beatPosition.isFinite {
                WebViewManager.updateCachedTempo(tempo)
                playheadSeconds = max(0, beatPosition * 60.0 / tempo)
            }
        }
        WebViewManager.updateTransportCache(WebViewManager.HostTransportSnapshot(
            playing: isPlaying,
            positionSeconds: playheadSeconds,
            anchorHostNs: Int64(Double(hostTime) * Self.machNanosPerTick)
        ))
    }

    func shouldPollTransport() -> Bool {
        WebViewManager.isHostTimeStreamActive() || WebViewManager.isHostTransportStreamActive()
    }
}
