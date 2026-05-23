import assert from 'node:assert/strict';
import { createClipDeletionRuntime } from '../../eVe/domains/mtrax/clips/deletion_runtime.js';

const createDeleteHarness = () => {
    const state = {
        clips: [
            { id: 1, persistId: 'split-left', trackId: 10, kind: 'video', start: 0, duration: 2, src: 'movie.mp4', sync_group_id: 'movie-pair' },
            { id: 2, persistId: 'split-middle', trackId: 10, kind: 'video', start: 2, duration: 2, src: 'movie.mp4', sync_group_id: 'movie-pair' },
            { id: 3, persistId: 'split-right', trackId: 10, kind: 'video', start: 4, duration: 2, src: 'movie.mp4', sync_group_id: 'movie-pair' },
            { id: 4, persistId: 'other-audio', trackId: 20, kind: 'audio', start: 0, duration: 6, src: 'movie.wav', sync_group_id: 'movie-pair' }
        ],
        selectedClipIds: new Set(),
        selectedTrackIds: new Set(),
        svgLayerSelectionByClipKey: new Map(),
        isPlaying: false
    };
    const runtime = createClipDeletionRuntime({
        getState: () => state,
        toKey: (value) => String(value ?? '').trim(),
        hasObjectShape: (value) => value && typeof value === 'object' && !Array.isArray(value),
        cloneData: (value, fallback) => JSON.parse(JSON.stringify(value ?? fallback)),
        roundTimelineNumber: (value) => Math.round(Number(value) * 1000000) / 1000000,
        getClipDuration: (clip) => Number(clip?.duration || clip?.timelineDuration || 0),
        mtrackMinClipDuration: 0.05,
        normalizeClipKind: (value, fallback = 'video') => String(value || fallback),
        createMediaElementFromDescriptor: async (descriptor) => ({
            resolvedSource: descriptor.src,
            playbackSource: descriptor.src,
            media: null,
            release: null
        }),
        invalidateClipIndex: () => {},
        collectOwnedClipSourceAtomeIdsForCleanup: () => [],
        trackPendingAtomePersistTask: () => {},
        logMtrack: () => {},
        releaseClipRuntimePlaybackSource: () => {},
        releaseClipRuntimeJoinMediaPool: () => {},
        resolveClipSelectionKey: (clip) => String(clip?.persistId || clip?.id || ''),
        ensureClipSelectionValidity: () => {},
        syncGlobalAtomeSelectionFromClips: () => {},
        ensureSpareEmptyTrack: () => {},
        updateMaxTime: () => {},
        drawRuler: () => {},
        renderTracks: () => {},
        syncStatus: () => {},
        updatePlaybackFrame: () => {},
        commitActiveGroupTimelineMutation: async () => ({ ok: true }),
        scheduleActiveGroupTimelinePersist: () => {},
        clearLoopCellRecordSources: () => ({ ok: false, cleared: 0 })
    });
    return { runtime, state };
};

const assertDeleteSelectionContract = async () => {
    const clipHarness = createDeleteHarness();
    clipHarness.state.selectedClipIds.add(2);
    const clipResult = await clipHarness.runtime.deleteMtrackSelection();
    assert.equal(clipResult.ok, true);
    assert.equal(clipResult.selection, 'clip');
    assert.equal(clipResult.removed, 1);
    assert.deepEqual(clipHarness.state.clips.map((clip) => clip.persistId), [
        'split-left',
        'split-right',
        'other-audio'
    ]);

    const trackHarness = createDeleteHarness();
    trackHarness.state.selectedTrackIds.add(10);
    const trackResult = await trackHarness.runtime.deleteMtrackSelection();
    assert.equal(trackResult.ok, true);
    assert.equal(trackResult.selection, 'track');
    assert.equal(trackResult.removed, 3);
    assert.deepEqual(trackHarness.state.clips.map((clip) => clip.persistId), ['other-audio']);
};

if (process.env.VITEST_WORKER_ID != null) {
    const { test } = await import('vitest');
    test('mtrax delete only removes selected clips or selected tracks', assertDeleteSelectionContract);
} else {
    await assertDeleteSelectionContract();
    console.log('mtrax_delete_selected_targets.test.mjs ok');
}
