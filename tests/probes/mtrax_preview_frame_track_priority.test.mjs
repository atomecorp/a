import assert from 'node:assert/strict';
import { createPreviewFrameDispatchRuntime } from '../../eVe/domains/mtrax/preview/preview_frame_dispatch_runtime.js';
import { createPreviewTrackVisibilityRuntime } from '../../eVe/domains/mtrax/preview/preview_track_visibility_runtime.js';

globalThis.window = {
    __EVE_MTRACK_DEBUG_PERF__: null
};

const toKey = (value) => String(value ?? '').trim();

const createHarness = ({ isPlaying }) => {
    let dispatched = null;
    const state = {
        activeGroupId: 'group-1',
        clips: [
            { id: 1, persistId: 'top-video', trackId: 1, kind: 'video', runtimeActive: true, start: 0, duration: 4, in: 0, out: 4 },
            { id: 2, persistId: 'bottom-video', trackId: 2, kind: 'video', runtimeActive: true, start: 0, duration: 4, in: 0, out: 4 },
            { id: 3, persistId: 'bottom-image', trackId: 2, kind: 'image', runtimeActive: true, start: 0, duration: 4, in: 0, out: 4 },
            { id: 4, persistId: 'audio', trackId: 2, kind: 'audio', runtimeActive: true, start: 0, duration: 4, in: 0, out: 4 }
        ],
        tracks: [
            { id: 1, visible: true },
            { id: 2, visible: true }
        ],
        selectedClipIds: new Set([2]),
        selectedTrackIds: new Set(),
        playhead: 1,
        maxTime: 4,
        isPlaying,
        previewFrameLastDispatchTs: -1000,
        previewMetadataRequestAtByKey: new Map(),
        ui: { root: { dataset: {} } }
    };
    const findTrack = (trackId) => state.tracks.find((track) => track.id === trackId) || null;
    const trackVisibility = createPreviewTrackVisibilityRuntime({
        getState: () => state,
        findTrack,
        isTrackVisible: (track) => track?.visible !== false,
        clipTimelineRange: (clip) => ({ start: Number(clip.start || 0), end: Number(clip.start || 0) + Number(clip.duration || 0) })
    });
    const runtime = createPreviewFrameDispatchRuntime({
        getState: () => state,
        ensureMtraxPerfDebug: () => ({ enabled: false, startPhase: () => 0 }),
        resolveMtraxRendererState: () => ({ mode: 'test' }),
        resolveHmtracksAudioEngineState: () => ({ enabled: false }),
        mtrackPreviewFrameIntervalMs: 0,
        getClipById: (clipId) => state.clips.find((clip) => clip.id === clipId) || null,
        toKey,
        dispatchMtraxRendererFrame: (detail) => {
            dispatched = detail;
            return { ok: true, detail };
        },
        findTrack,
        isTrackVisible: (track) => track?.visible !== false,
        buildRuntimeClipPreview: (clip) => ({
            clip_id: toKey(clip.persistId || clip.id),
            kind: clip.kind,
            track_id: clip.trackId,
            track_order: state.tracks.findIndex((track) => track.id === clip.trackId),
            start: clip.start,
            end: clip.start + clip.duration
        }),
        buildTrackOrderIndex: trackVisibility.buildTrackOrderIndex,
        resolveTopVisibleVideoTrackIdAtTime: trackVisibility.resolveTopVisibleVideoTrackIdAtTime,
        resolveActivePreviewTransitions: () => [],
        resolveTimelineTransitionState: () => ({ defaults: { video: 'cut', audio: 'cut' }, items: [] }),
        resolveTimelineEffectGraphState: () => ({ track_racks: {}, clip_racks: {}, master_rack: [] }),
        comparePreviewClipsForPrimaryAsc: (left, right) => Number(left.track_order) - Number(right.track_order),
        comparePreviewClipsForDrawOrder: (left, right) => Number(right.track_order) - Number(left.track_order),
        pickPrimaryPreviewClip: (clips) => clips[0] || null,
        resolveUpcomingPrimaryPreviewClip: () => null,
        dispatchPreviewMetadataRequests: () => {},
        runPreviewFrameInvariants: () => {}
    });
    return {
        dispatch: (reason = 'test_priority') => runtime.dispatchMtrackPreviewFrame(reason),
        readDispatched: () => dispatched
    };
};

const playbackHarness = createHarness({ isPlaying: true });
playbackHarness.dispatch();
assert.deepEqual(
    playbackHarness.readDispatched().active_clips.map((clip) => clip.clip_id),
    ['top-video', 'audio'],
    'playback must use track order for visual priority while preserving audio clips'
);

const pausedHarness = createHarness({ isPlaying: false });
pausedHarness.dispatch();
assert.deepEqual(
    pausedHarness.readDispatched()
        .ordered_active_clips
        .filter((clip) => clip.kind === 'video' || clip.kind === 'image')
        .map((clip) => clip.clip_id),
    ['top-video', 'bottom-video'],
    'paused editing keeps the selected clip visually promoted'
);
assert.equal(
    pausedHarness.readDispatched().ordered_active_clips.some((clip) => clip.clip_id === 'audio'),
    true,
    'paused editing must preserve audio clips'
);

const scrubHarness = createHarness({ isPlaying: false });
scrubHarness.dispatch('transport_scrub_pointer');
assert.deepEqual(
    scrubHarness.readDispatched().active_clips.map((clip) => clip.clip_id),
    ['top-video', 'audio'],
    'scrubbing must use playback visual track priority while preserving audio clips'
);

console.log('mtrax_preview_frame_track_priority.test.mjs ok');
