import assert from 'node:assert/strict';
import { createClipSelectionContextRuntime } from '../../eVe/domains/mtrax/clips/selection_context_runtime.js';

const createSelectionHarness = () => {
    const state = {
        activeGroupId: 'group-a',
        clips: [
            { id: 1, persistId: 'clip-left', trackId: 10, kind: 'video', start: 0, duration: 2, atomeId: 'movie' },
            { id: 2, persistId: 'clip-middle', clip_id: 'selection-middle', trackId: 10, kind: 'video', start: 2, timelineDuration: 2, atomeId: 'movie' },
            { id: 3, persistId: 'clip-right', timelineId: 'timeline-right', trackId: 10, kind: 'video', start: 4, duration: 2, atomeId: 'movie' }
        ],
        selectedClipIds: new Set(),
        selectedTrackIds: new Set(),
        selectedLoopCellKeys: new Set(),
        selectionFocusKind: '',
        selectedMarkerId: ''
    };
    const findClipByIdentifier = (identifier) => {
        const key = String(identifier ?? '').trim();
        return state.clips.find((clip) => (
            String(clip.id) === key
            || String(clip.persistId || '') === key
            || String(clip.clip_id || '') === key
            || String(clip.timelineId || '') === key
        )) || null;
    };
    const setSelectedClipIds = (clipIds) => {
        const next = new Set();
        for (const value of clipIds || []) {
            const id = Number(value);
            if (Number.isFinite(id) && state.clips.some((clip) => clip.id === id)) next.add(id);
        }
        const changed = next.size !== state.selectedClipIds.size
            || Array.from(next).some((id) => !state.selectedClipIds.has(id));
        state.selectedClipIds = next;
        if (next.size) state.selectionFocusKind = 'clip';
        return changed;
    };
    const runtime = createClipSelectionContextRuntime({
        getState: () => state,
        ensureUi: () => {},
        resolveSelectedClips: () => state.clips.filter((clip) => state.selectedClipIds.has(clip.id)),
        toKey: (value) => String(value ?? '').trim(),
        resolveSelectedAtomeIdsFromClipSelection: () => [],
        buildSvgLayerManifestForClip: () => null,
        resolveSelectedSvgLayerForClip: () => null,
        isMtrackActive: () => true,
        isMtrackFocused: () => true,
        dedupeIds: (values = []) => Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))),
        resolveClipIdsFromAtomeSelection: () => [],
        syncClipSelectionFromGlobalAtomeSelection: () => false,
        findClipByIdentifier,
        setSelectedClipIds
    });
    return { runtime, state };
};

const assertClipSelectionApiContract = () => {
    const harness = createSelectionHarness();
    const setResult = harness.runtime.apiSetClipSelection({
        clip_ids: ['selection-middle', 'timeline-right']
    });
    assert.equal(setResult.ok, true);
    assert.deepEqual(setResult.selected_clip_runtime_ids, [2, 3]);
    assert.deepEqual(setResult.selected_clip_ids, ['clip-middle', 'clip-right']);
    assert.deepEqual(setResult.selected_clip_selection_ids, ['selection-middle', 'timeline-right']);
    assert.deepEqual(setResult.selected_clips.map((clip) => clip.clip_runtime_id), [2, 3]);

    const removeResult = harness.runtime.apiSetClipSelection({
        clip_id: 'selection-middle',
        mode: 'remove'
    });
    assert.equal(removeResult.ok, true);
    assert.deepEqual(removeResult.selected_clip_runtime_ids, [3]);
    assert.deepEqual(removeResult.selected_clip_selection_ids, ['timeline-right']);
};

if (process.env.VITEST_WORKER_ID != null) {
    const { test } = await import('vitest');
    test('mtrax clip selection API resolves selection ids and runtime ids explicitly', assertClipSelectionApiContract);
} else {
    assertClipSelectionApiContract();
    console.log('mtrax_clip_selection_api.test.mjs ok');
}
