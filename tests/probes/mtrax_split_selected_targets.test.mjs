import assert from 'node:assert/strict';
import { createClipSplitJoinRuntime } from '../../eVe/domains/mtrax/clips/split_join_runtime.js';

const createSplitHarness = () => {
    const state = {
        clips: [
            {
                id: 1,
                persistId: 'first-video',
                trackId: 10,
                kind: 'video',
                start: 0,
                in: 0,
                out: 6,
                duration: 6,
                src: 'first-video.mp4',
                sync_group_id: 'first-pair'
            },
            {
                id: 2,
                persistId: 'first-audio',
                trackId: 20,
                kind: 'audio',
                start: 0,
                in: 0,
                out: 6,
                duration: 6,
                src: 'first-audio.wav',
                sync_group_id: 'first-pair'
            },
            {
                id: 3,
                persistId: 'second-video',
                trackId: 30,
                kind: 'video',
                start: 0,
                in: 0,
                out: 6,
                duration: 6,
                src: 'second-video.mp4'
            }
        ],
        selectedClipIds: new Set(),
        selectedTrackIds: new Set(),
        nextClipId: 10,
        playhead: 2,
        isPlaying: false
    };
    const resolveTargetClips = (payload = {}) => {
        const ids = [
            ...(Array.isArray(payload.clip_ids) ? payload.clip_ids : []),
            ...(Array.isArray(payload.clipIds) ? payload.clipIds : []),
            ...(payload.clip_id != null ? [payload.clip_id] : []),
            ...(payload.clipId != null ? [payload.clipId] : [])
        ].map((value) => String(value));
        return ids
            .map((id) => state.clips.find((clip) => String(clip.id) === id || String(clip.persistId) === id))
            .filter(Boolean);
    };
    const resolveSelectedClips = () => Array.from(state.selectedClipIds)
        .map((clipId) => state.clips.find((clip) => clip.id === clipId))
        .filter(Boolean);
    const runtime = createClipSplitJoinRuntime({
        getState: () => state,
        ensureUi: () => {},
        resolveTargetClips,
        isMtrackActive: () => true,
        resolveSelectedClips,
        toNumberOrNull: (value) => {
            const number = Number(value);
            return Number.isFinite(number) ? number : null;
        },
        snapTime: (value) => value,
        mtrackMinClipDuration: 0.05,
        mtrackTimelineEpsilon: 0.0001,
        clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
        resolveSourceDurationLimitForClip: (clip) => Number(clip.out || clip.duration || 0),
        getClipDuration: (clip) => Number(clip.duration || 0),
        roundTimelineNumber: (value) => Math.round(Number(value) * 1000000) / 1000000,
        createMediaElementFromDescriptor: async (descriptor) => ({
            resolvedSource: descriptor.src,
            playbackSource: descriptor.src,
            media: null,
            release: null
        }),
        normalizeClipKind: (value, fallback = 'video') => String(value || fallback),
        resolveDefaultClipNameByKind: (kind) => `${kind || 'clip'} clip`,
        hasObjectShape: (value) => value && typeof value === 'object' && !Array.isArray(value),
        cloneData: (value, fallback) => JSON.parse(JSON.stringify(value ?? fallback)),
        invalidateClipIndex: () => {},
        ensureClipSelectionValidity: () => {},
        syncGlobalAtomeSelectionFromClips: () => {},
        updateMaxTime: () => {},
        renderTracks: () => {},
        updatePlaybackFrame: () => {},
        flushActiveGroupTimelinePersist: async () => ({ ok: true }),
        toKey: (value) => String(value ?? '').trim(),
        findTrack: (trackId) => ({ id: trackId }),
        resolveClipSourceForPersist: (clip) => clip?.src || '',
        resolveJoinSegmentsForClip: () => [],
        isVirtualTimelineSource: () => false,
        resolveJoinSegmentCanonicalSource: (segment) => segment?.src || '',
        resolveSourceDurationLimitByKind: () => 6,
        applyClipSourceMetadata: () => {},
        resolveClipSelectionKey: (clip) => String(clip?.persistId || clip?.id || ''),
        releaseClipRuntimePlaybackSource: () => {},
        releaseClipRuntimeJoinMediaPool: () => {},
        ensureSpareEmptyTrack: () => {},
        drawRuler: () => {},
        syncStatus: () => {}
    });
    return { runtime, state };
};

const assertSplitSelectionContract = async () => {
    const audioHarness = createSplitHarness();
    audioHarness.state.selectedClipIds.add(2);
    const audioResult = await audioHarness.runtime.apiSplitClip({ tool_id: 'ui.split', scope: 'mtrack', split_seconds: 2 });
    assert.equal(audioResult.ok, true);
    assert.deepEqual(audioResult.clip_ids, ['first-audio']);
    assert.equal(audioHarness.state.clips.find((clip) => clip.id === 1).out, 6);
    assert.equal(audioHarness.state.clips.find((clip) => clip.id === 2).out, 2);
    assert.equal(audioHarness.state.clips.filter((clip) => clip.trackId === 20).length, 2);
    assert.equal(audioHarness.state.clips.filter((clip) => clip.trackId === 10).length, 1);

    const secondVideoHarness = createSplitHarness();
    secondVideoHarness.state.selectedClipIds.add(3);
    const secondVideoResult = await secondVideoHarness.runtime.apiSplitClip({ tool_id: 'ui.split', scope: 'mtrack', split_seconds: 2 });
    assert.equal(secondVideoResult.ok, true);
    assert.deepEqual(secondVideoResult.clip_ids, ['second-video']);
    assert.equal(secondVideoHarness.state.clips.find((clip) => clip.id === 1).out, 6);
    assert.equal(secondVideoHarness.state.clips.find((clip) => clip.id === 2).out, 6);
    assert.equal(secondVideoHarness.state.clips.find((clip) => clip.id === 3).out, 2);

    const trackHarness = createSplitHarness();
    trackHarness.state.selectedTrackIds.add(20);
    const trackResult = await trackHarness.runtime.apiSplitClip({ tool_id: 'ui.split', scope: 'mtrack', split_seconds: 2 });
    assert.equal(trackResult.ok, true);
    assert.deepEqual(trackResult.clip_ids, ['first-audio']);
    assert.equal(trackHarness.state.clips.find((clip) => clip.id === 1).out, 6);
    assert.equal(trackHarness.state.clips.find((clip) => clip.id === 2).out, 2);

    const exclusiveClipHarness = createSplitHarness();
    exclusiveClipHarness.state.selectedClipIds.add(3);
    exclusiveClipHarness.state.selectedTrackIds.add(20);
    const exclusiveClipResult = await exclusiveClipHarness.runtime.apiSplitClip({
        tool_id: 'ui.split',
        scope: 'mtrack',
        split_seconds: 7
    });
    assert.equal(exclusiveClipResult.ok, false);
    assert.equal(exclusiveClipResult.error, 'no_target_clip');
    assert.equal(exclusiveClipHarness.state.clips.length, 3);
    assert.equal(exclusiveClipHarness.state.clips.find((clip) => clip.id === 2).out, 6);
};

if (process.env.VITEST_WORKER_ID != null) {
    const { test } = await import('vitest');
    test('mtrax split only cuts selected clips or selected tracks at the playhead', assertSplitSelectionContract);
} else {
    await assertSplitSelectionContract();
    console.log('mtrax_split_selected_targets.test.mjs ok');
}
