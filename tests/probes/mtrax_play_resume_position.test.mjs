import test from 'node:test';
import assert from 'node:assert/strict';

import { createTransportApiRuntime } from '../../eVe/domains/mtrax/api/transport_api_runtime.js';
import { createTimelineTransportControlsRuntime } from '../../eVe/domains/mtrax/timeline/transport_controls.js';
import { createTimelinePlayRuntime } from '../../eVe/domains/mtrax/timeline/play_runtime.js';

test('MTraX play starts from the current playhead even at content end', () => {
    const state = {
        clips: [{
            id: 'clip_1',
            kind: 'video',
            start: 0,
            duration: 10
        }],
        playhead: 10,
        maxTime: 30,
        isPlaying: false,
        playbackStartPending: false,
        playbackStartToken: 0,
        mediaRecordPlayPendingToken: 0,
        selectedLoopCellKeys: new Set(),
        hmtracksAudioLoop: { enabled: false, start_seconds: 0, end_seconds: 0 },
        ui: {}
    };
    const runtime = createTimelinePlayRuntime({
        getState: () => state,
        isHmtracksAudioEngineFeatureEnabled: () => false,
        updatePlaybackFrame: () => ({ ok: true }),
        syncPlayhead: () => {},
        syncStatus: () => {},
        logMtrack: () => {},
        logMtrackDiag: () => {},
        logHmtracksAudioStage: () => {},
        logHmtracksAudioDebugSnapshot: () => {},
        dispatchMtrackPreviewFrame: () => {},
        startHmtracksAudioDebugLogs: () => {},
        ensureMtraxPerfDebug: () => ({
            beginFrame() {},
            endFrame() {}
        })
    });

    const result = runtime.playTimeline();

    assert.equal(result.ok, true);
    assert.equal(result.state, 'playing');
    assert.equal(state.playhead, 10);
    assert.equal(state.playbackStartHead, 10);
    assert.equal(state.isPlaying, true);
});

test('MTraX play toggle pauses and resumes without resetting playhead until explicit stop', () => {
    const stopReasons = [];
    const state = {
        clips: [{
            id: 'clip_1',
            kind: 'video',
            start: 0,
            duration: 30
        }],
        playhead: 10,
        maxTime: 30,
        isPlaying: false,
        playbackStartPending: false,
        playbackStartToken: 0,
        mediaRecordPlayPendingToken: 0,
        selectedLoopCellKeys: new Set(),
        hmtracksAudioLoop: { enabled: false, start_seconds: 0, end_seconds: 0 },
        ui: {},
        projectPlaybackRuntime: { playing: false }
    };
    const controls = createTimelineTransportControlsRuntime({
        getState: () => state,
        isHmtracksAudioEngineFeatureEnabled: () => false,
        stopHmtracksNativeAudioPlayback: (reason) => {
            stopReasons.push(reason);
            return { ok: true };
        },
        stopAllMediaImpl: () => {},
        updatePlaybackFrame: () => ({ ok: true }),
        syncPlayhead: () => {},
        syncStatus: () => {},
        stopMediaRecordActionCapture: () => Promise.resolve({ ok: true }),
        flushDeferredKaraokePersist: () => {},
        logHmtracksAudioStage: () => {},
        logHmtracksAudioDebugSnapshot: () => {},
        stopHmtracksAudioDebugLogs: () => {}
    });
    const play = createTimelinePlayRuntime({
        getState: () => state,
        isHmtracksAudioEngineFeatureEnabled: () => false,
        updatePlaybackFrame: () => ({ ok: true }),
        syncPlayhead: () => {},
        syncStatus: () => {},
        logMtrack: () => {},
        logMtrackDiag: () => {},
        logHmtracksAudioStage: () => {},
        logHmtracksAudioDebugSnapshot: () => {},
        dispatchMtrackPreviewFrame: () => {},
        startHmtracksAudioDebugLogs: () => {},
        resolveStopTimeline: () => controls.stopTimeline,
        ensureMtraxPerfDebug: () => ({
            beginFrame() {},
            endFrame() {}
        })
    });
    const api = createTransportApiRuntime({
        getState: () => state,
        ensureUi: () => {},
        playTimeline: play.playTimeline,
        pauseTimeline: controls.pauseTimeline,
        stopTimeline: controls.stopTimeline,
        toFiniteNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
        setPlayhead: (next) => { state.playhead = Number(next || 0); },
        normalizeHmtracksRateValue: (value, fallback = 1) => Number(value || fallback),
        isHmtracksAudioEngineFeatureEnabled: () => false,
        syncHmtracksAudioEngineTransport: () => Promise.resolve({ ok: true }),
        toKey: (value) => String(value || '').trim(),
        scheduleActiveGroupTimelinePersist: () => {},
        normalizeHmtracksLoopState: (value) => value && typeof value === 'object' ? value : { enabled: false },
        setLoopGhostRange: () => {},
        normalizeRulerRange: () => null,
        drawRuler: () => {},
        applyHorizontalZoom: () => {},
        applyVerticalZoom: () => {},
        applyTempo: () => {},
        applySnapPreset: () => {},
        deleteMtrackSelection: () => {},
        setClonePlacementMode: () => {}
    });

    const first = api.apiTogglePlay();
    assert.equal(first.action, 'play');
    assert.equal(state.playhead, 10);
    assert.equal(state.playbackStartHead, 10);

    state.playhead = 12.5;
    const second = api.apiTogglePlay();
    assert.equal(second.action, 'pause');
    assert.equal(state.playhead, 12.5);
    assert.equal(stopReasons.at(-1), 'pause');

    const third = api.apiTogglePlay();
    assert.equal(third.action, 'play');
    assert.equal(state.playhead, 12.5);
    assert.equal(state.playbackStartHead, 12.5);

    state.playhead = 14;
    const fourth = api.apiTogglePlay();
    assert.equal(fourth.action, 'pause');
    assert.equal(state.playhead, 14);

    const stopped = api.apiStop();
    assert.equal(stopped.state, 'stopped');
    assert.equal(state.playhead, 0);
    assert.equal(stopReasons.at(-1), 'stop');
});
