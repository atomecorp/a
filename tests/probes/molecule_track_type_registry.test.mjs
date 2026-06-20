import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY,
    createMoleculeTrackTypeRegistry,
    createTimeline,
    addTrack,
    addClip
} from '../../eVe/intuition/tools/molecule/kernel/index.js';

const requiredTrackTypes = ['video', 'audio', 'image', 'text', 'automation'];

const createBaseTimeline = () => createTimeline({
    timeline_id: 'timeline_track_types',
    project_id: 'project_track_types',
    owner_atome_id: 'owner_track_types'
});

test('Molecule track type registry exposes built-in v1 track types', () => {
    const kinds = DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY.trackKinds();
    for (const kind of requiredTrackTypes) {
        assert.equal(kinds.includes(kind), true, `missing track type ${kind}`);
    }
    assert.equal(DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY.allowsClip('video', 'video'), true);
    assert.equal(DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY.allowsClip('video', 'image'), true);
    assert.equal(DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY.allowsClip('image', 'video'), false);
    assert.equal(DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY.allowsClip('automation', 'video'), false);
});

test('Molecule track type registry can be extended without mutating defaults', () => {
    const registry = createMoleculeTrackTypeRegistry([
        {
            id: 'chord',
            time_domain: 'musical',
            clip_kinds: ['text'],
            renderer: 'bevy_chord'
        }
    ]);
    assert.equal(registry.has('chord'), true);
    assert.equal(registry.allowsClip('chord', 'text'), true);
    assert.equal(DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY.has('chord'), false);
});

test('Molecule kernel consumes the registry for track and clip compatibility', () => {
    let timeline = createBaseTimeline();
    timeline = addTrack(timeline, {
        track_id: 'image_track',
        kind: 'image',
        name: 'Images',
        order: 10
    });
    timeline = addClip(timeline, {
        clip_id: 'image_clip',
        track_id: 'image_track',
        kind: 'image',
        source: { type: 'atome', atome_id: 'image_source' },
        timeline: {
            start_seconds: 0,
            duration_seconds: 3,
            source_in_seconds: 0,
            source_out_seconds: 3
        }
    });
    assert.equal(timeline.clips.length, 1);

    assert.throws(() => addClip(timeline, {
        clip_id: 'video_clip',
        track_id: 'image_track',
        kind: 'video',
        source: { type: 'atome', atome_id: 'video_source' },
        timeline: {
            start_seconds: 4,
            duration_seconds: 3,
            source_in_seconds: 0,
            source_out_seconds: 3
        }
    }), /not allowed on track kind image/);
});
