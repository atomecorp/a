//
//  AUv3TransportObserver.swift
//  auv3
//

import AVFoundation
import Foundation

extension auv3Utils {
    func checkHostTransport() {
        guard let tsBlock = self.transportStateBlock else { return }
        var flags = AUHostTransportStateFlags(rawValue: 0)
        var currentSampleTime: Double = 0
        var cycleStartBeat: Double = 0
        var cycleEndBeat: Double = 0
        if tsBlock(&flags, &currentSampleTime, &cycleStartBeat, &cycleEndBeat) {
            let isPlaying = (flags.rawValue & AUHostTransportStateFlags.moving.rawValue) != 0
            let sr = getSampleRate() ?? 44100.0
            var playheadSeconds = currentSampleTime / sr
            var displaySampleTime = currentSampleTime
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
                    displaySampleTime = playheadSeconds * sr
                }
            }
            WebViewManager.updateTransportCache(isPlaying: isPlaying, playheadSeconds: playheadSeconds)
            DispatchQueue.main.async { [weak self] in
                let js = "(function(){if(typeof displayTransportInfo==='function'){displayTransportInfo(\(isPlaying ? "true":"false"),\(displaySampleTime),\(sr));}else if(typeof updateTimecode==='function'){updateTimecode(\(playheadSeconds * 1000.0));}})();"
                WebViewManager.evaluateJS(js,
                                          label: "auv3.transportDirect",
                                          priority: WebViewManager.IPCPriority.critical)
                self?.transportDataDelegate?.didReceiveTransportData(isPlaying: isPlaying, playheadPosition: displaySampleTime, sampleRate: sr)
            }
        }
    }

    func shouldPollTransport() -> Bool {
        if self.transportDataDelegate != nil { return true }
        if WebViewManager.isHostTimeStreamActive() { return true }
        if WebViewManager.isHostTransportStreamActive() { return true }
        return false
    }
}
