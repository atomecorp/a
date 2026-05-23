import test from 'node:test';
import assert from 'node:assert/strict';

import { createGroupTimelineLoadRuntime } from '../../eVe/domains/mtrax/timeline/group_timeline_load_runtime.js';

const identityObject = (value) => (value && typeof value === 'object' ? value : {});
const emptyState = () => ({});

test('MTraX group reload for play preserves playhead without sending stop first', async () => {
    const stopCalls = [];
    const state = {
        activeGroupId: 'group_1',
        groupTimelineLoadSeq: 0,
        selectedTrackIds: new Set(),
        selectedClipIds: new Set(),
        mediaRecordCompletedLoopCellEntryIds: new Set(),
        playhead: 10,
        maxTime: 30,
        tracks: [],
        clips: [],
        nextTrackId: 1,
        nextClipId: 1,
        rulerMarkers: [],
        hmtracksAudioLoop: { enabled: false, start_seconds: 0, end_seconds: 0 },
        hmtracksAudioLoopGhost: { start_seconds: 0, end_seconds: 0 },
        persistRev: 0
    };
    const runtime = createGroupTimelineLoadRuntime({
        getState: () => state,
        normalizeClipKind: (value, fallback = 'video') => String(value || fallback),
        resolveDefaultClipNameByKind: (kind) => String(kind || 'clip'),
        resolveTimelineSchema: (schema) => schema || 'mtrax.timeline',
        resolveTimelineVersion: (version, fallback) => Number(version || fallback || 1),
        mtrackGroupTimelineSchema: 'mtrack.group',
        mtrackGroupTimelineVersion: 1,
        mtraxTimelineVersion: 1,
        hasObjectShape: (value) => value && typeof value === 'object' && !Array.isArray(value),
        normalizeTimelineTimebaseState: identityObject,
        normalizeTimelineRenderState: identityObject,
        normalizeTimelineAudioState: identityObject,
        normalizeTimelineEffectGraphState: identityObject,
        normalizeTimelineAutomationLanes: (value) => Array.isArray(value) ? value : [],
        normalizeTimelineMixState: identityObject,
        normalizeTimelineAutomationState: identityObject,
        normalizeTimelineTransitionState: identityObject,
        normalizeRulerRange: () => null,
        normalizeRulerMarkersState: (value) => Array.isArray(value) ? value : [],
        logMtrack: () => {},
        omitObjectKeys: (source) => ({ ...source }),
        normalizeTrackRecordSource: (value) => value || 'mixed',
        toKey: (value) => String(value || '').trim(),
        parseBooleanLike: (value, fallback = false) => {
            if (typeof value === 'boolean') return value;
            if (value === 'true' || value === '1' || value === 1) return true;
            if (value === 'false' || value === '0' || value === 0) return false;
            return fallback;
        },
        trackRecordSourceAudio: 'audio',
        roundTimelineNumber: (value) => Number(value || 0),
        mtrackMinClipDuration: 0.01,
        resolveSourceDurationLimitByKind: (kind, duration) => Number(duration || 0),
        normalizeMtrackMediaSource: (value) => String(value || ''),
        resolveClipSourceForPersist: emptyState,
        sanitizeClipExtrasForPersist: identityObject,
        cloneData: (value, fallback = null) => (value == null ? fallback : JSON.parse(JSON.stringify(value))),
        normalizeHmtracksRateValue: (value, fallback = 1) => Number(value || fallback),
        normalizeHmtracksLoopState: (value) => value && typeof value === 'object' ? value : { enabled: false, start_seconds: 0, end_seconds: 0 },
        createTrack: (seed = {}) => ({ id: state.nextTrackId++, key: seed.key || 't1', name: seed.name || 'T1' }),
        ensureTrackSelectionValidity: () => {},
        clamp: (value, min, max) => Math.max(min, Math.min(max, Number(value || 0))),
        syncTempoControls: () => {},
        setRulerMarkersState: (markers) => { state.rulerMarkers = Array.isArray(markers) ? markers : []; },
        mtrackMinZoomPxPerSec: 10,
        mtrackMaxZoomPxPerSec: 500,
        applyPreviewSectionHeight: () => {},
        isHmtracksAudioEngineFeatureEnabled: () => false,
        syncHmtracksAudioEngineTransport: () => Promise.resolve({ ok: true }),
        clearAllClips: () => { state.clips = []; },
        findTrackByKey: (key) => state.tracks.find((track) => track.key === key) || null,
        createMediaElementFromDescriptor: () => Promise.resolve({ resolvedSource: '', duration: 0 }),
        invalidateClipIndex: () => {},
        ensureSpareEmptyTrack: () => {},
        ensureUi: () => {},
        normalizeGroupLabel: (value) => String(value || ''),
        normalizeGroupTrackLabels: (value) => Array.isArray(value) ? value : [],
        stopTimeline: (options = {}) => {
            stopCalls.push(options);
            if (options.resetPlayhead !== false) state.playhead = 0;
            return { ok: true };
        },
        resetTracks: () => {},
        snapTime: (value) => Number(value || 0),
        getClipDuration: (clip) => Number(clip?.duration || 0),
        buildTimelineContentHash: () => 'hash',
        buildGroupTimelineSnapshot: () => ({ tracks: state.tracks, clips: state.clips }),
        buildGroupStepsFromTimelineSnapshot: () => [],
        applyGroupTrackLabels: () => {},
        updateTrackHeightVar: () => {},
        updateMaxTime: () => { state.maxTime = 30; },
        drawRuler: () => {},
        renderTracks: () => {},
        syncPlayhead: () => {},
        syncStatus: () => {},
        syncMtrackHeaderTitle: () => {},
        updatePlaybackFrame: () => ({ ok: true }),
        ensureClipSelectionValidity: () => {},
        syncMtraxRendererTimeline: () => Promise.resolve({ ok: true }),
        syncHmtracksAudioEngineSession: () => Promise.resolve({ ok: true }),
        requestHmtracksAudioEngineSeek: () => Promise.resolve({ ok: true }),
        scheduleActiveGroupTimelinePersist: () => {}
    });

    const result = await runtime.apiLoadGroupTimeline({
        group_id: 'group_1',
        preserve_playhead: true,
        group_timeline: {
            schema: 'mtrax.timeline',
            version: 1,
            tracks: [],
            clips: [{
                id: 'clip_1',
                kind: 'video',
                track_id: 't1',
                start: 0,
                duration: 10,
                src: 'fixture.mp4'
            }],
            transport: {}
        }
    });

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(stopCalls.length, 0);
    assert.equal(state.playhead, 10);
});
