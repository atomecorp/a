import assert from 'node:assert/strict';
import { test } from 'vitest';

import { resolveContextMenu, resolveContextMenuContext } from '../../eVe/intuition/menu/context_menu_resolver.js';
import { resolveMysticSelectionMode } from '../../eVe/intuition/mystic/context_selection.js';
import { createAtomeContextualRailModelRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_model_runtime.js';
import { expandMaskedMediaTransportIds } from '../../eVe/domains/media/masked_media_transport_targets.js';

// A RECORDED media keeps its provenance in the persisted type
// (`video_recording`, `audio_recording`). Playback only depends on the family
// (video/audio): a selected recording must therefore offer exactly the same tools
// as an imported media, on the contextual rail as in the Mystic menu.

const menuKeys = (kind, menu = 'mystic') => resolveContextMenu({
    menu,
    context: resolveContextMenuContext({ type: 'atome', kind, selected: true })
}).map((entry) => entry.key);

const createRailModel = () => createAtomeContextualRailModelRuntime({
    mainToolIdByKey: { play: 'ui.play', record_action: 'ui.detail.record.toggle' },
    intuitionContent: {
        play: { key: 'play', labelKey: 'eve.menu.play', icon: 'play', tool_id: 'ui.play' },
        record_action: { key: 'record_action', labelKey: 'eve.menu.record', icon: 'record', tool_id: 'ui.detail.record.toggle' }
    },
    normalizeMainToolKey: (value) => String(value || '').trim().toLowerCase(),
    normalizeCatalogToolEntry: ({ key, def }) => ({ key, ...def }),
    normalizeRecordActionRecordSource: (value) => String(value || '').trim().toLowerCase() || null,
    resolveCanonicalMainToolId: (value) => String(value || '').trim(),
    resolveCurrentTextSizeValue: (value) => value,
    isSelectionRequiredToolKey: () => false,
    getAtomeElement: () => null,
    getAtomeRuntimeState: () => null,
    translate: (key, fallback) => fallback || key
});

const railRecord = (kind) => ({
    id: `${kind}_1`, type: kind, project_id: 'recorded_media_project',
    properties: { file_name: 'clip.mp4', file_path: 'recordings/clip.mp4', mime_type: 'video/mp4' }
});

const railKeysFor = (rail, kind) => rail.resolveAtomeContextualRailToolKeysForAtome({
    atomeId: `${kind}_1`,
    kind,
    toolKeys: rail.resolveAtomeContextualRailDefaultTools(kind),
    hasProjectAutomation: false,
    record: railRecord(kind)
});

test('a recorded video keeps Play in the Mystic menu exactly like an imported video', () => {
    assert.ok(menuKeys('video').includes('play'), 'an imported video plays');
    assert.ok(menuKeys('video_recording').includes('play'),
        'a recorded video is a video: the playback capability must not depend on its provenance');
    assert.deepEqual(menuKeys('video_recording'), menuKeys('video'));
    assert.deepEqual(menuKeys('video_recording', 'sidebar'), menuKeys('video', 'sidebar'));
});

test('a recorded audio keeps Play like every other audio kind', () => {
    for (const kind of ['audio', 'sound']) assert.ok(menuKeys(kind).includes('play'), `${kind} plays`);
    // The Mystic folds the audio provenance before composing (MYSTIC_KIND_ALIASES):
    // the recording reaches the same menu as the imported sound.
    const selectionMode = resolveMysticSelectionMode({
        context: { atomeId: 'audio_recording_1', kind: 'audio_recording' },
        kindForId: () => 'audio_recording'
    });
    assert.equal(selectionMode.kind, 'audio');
    assert.ok(menuKeys(selectionMode.kind).includes('play'));
});

test('photo and image keep the fixed Mystic Play tile even without playback capability', () => {
    for (const kind of ['image', 'photo']) assert.ok(menuKeys(kind).includes('play'), `${kind} keeps the fixed tile`);
});

test('the contextual rail keeps Play for a recorded video and drops record_action like an imported video', () => {
    const rail = createRailModel();
    const video = railKeysFor(rail, 'video');
    const recording = railKeysFor(rail, 'video_recording');
    assert.ok(video.includes('play'), 'the imported video is playable');
    assert.ok(recording.includes('play'), 'the recorded video keeps its Play tool');
    assert.ok(!recording.includes('record_action'), 'an existing recording is not an empty media placeholder');
    assert.deepEqual(recording, video, 'both video provenances resolve the same rail');
});

test('the contextual rail keeps Play for a recorded audio', () => {
    const rail = createRailModel();
    const sound = railKeysFor(rail, 'sound');
    assert.ok(sound.includes('play'));
    // Every provenance of an audio converges on the same rail: the persisted type
    // of the recording and the rendering name of the waveform.
    for (const kind of ['audio', 'audio_recording', 'audio_waveform']) {
        assert.ok(railKeysFor(rail, kind).includes('play'), `${kind} keeps its Play tool`);
        assert.deepEqual(railKeysFor(rail, kind), sound, `${kind} resolves the audio rail`);
    }
});

const transportRecord = (id, type, parentId = '', properties = {}) => ({
    id, type, parent_id:parentId, properties:{ kind:type, ...properties }
});

const transportScenes = (records) => new Map([['project', {
    records:new Map(records.map((entry) => [entry.id,entry]))
}]]);

test('Play on a mask wrapper targets its video and never the parametric source', () => {
    const scenes = transportScenes([
        transportRecord('mask','group','project',{ mask:{ sourceId:'star', mode:'alpha' } }),
        transportRecord('video','video','mask',{ media_url:'/clip.mp4' }),
        transportRecord('star','shape','mask',{ shape_variant:'star' })
    ]);
    assert.deepEqual(expandMaskedMediaTransportIds(['mask'],{ scenes }),['video']);
});

test('Play on a masked molecule recursively targets all content descendants', () => {
    const scenes = transportScenes([
        transportRecord('mask','group','project',{ mask:{ sourceId:'star', mode:'alpha' } }),
        transportRecord('target_group','group','mask'),
        transportRecord('video','video','target_group',{ media_url:'/clip.mp4' }),
        transportRecord('wave','audio_waveform','target_group',{ source:'/sound.wav' }),
        transportRecord('star','shape','mask',{ shape_variant:'star' })
    ]);
    assert.deepEqual(expandMaskedMediaTransportIds(['mask'],{ scenes }),['target_group','video','wave']);
    assert.deepEqual(expandMaskedMediaTransportIds(['target_group'],{ scenes }),['target_group']);
});
