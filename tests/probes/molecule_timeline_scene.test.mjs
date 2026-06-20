import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addTrack,
    createTimeline,
    setPlayhead
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import {
    MOLECULE_SCENE_LAYER,
    createMoleculeTimelineScene,
    projectTimelineToSceneRecords
} from '../../eVe/intuition/tools/molecule/render/timeline_scene.js';
import { diffVirtualSceneTrees } from '../../eVe/domains/rendering/virtual_scene_contract.js';

const PX = 80; // DEFAULT_TIMELINE_LAYOUT.pxPerSecond
const LANE_H = 48;

const buildTimeline = () => {
    let timeline = createTimeline({
        timeline_id: 'tl_scene',
        project_id: 'proj_scene',
        owner_atome_id: 'grp_scene'
    });
    timeline = addTrack(timeline, { track_id: 'track_video', kind: 'video', name: 'video', order: 10 });
    timeline = addTrack(timeline, { track_id: 'track_audio', kind: 'audio', name: 'audio', order: 20 });
    timeline = addClip(timeline, {
        clip_id: 'clip_a', track_id: 'track_video', kind: 'video',
        source: { type: 'atome', atome_id: 'atome_a' },
        timeline: { start_seconds: 1, duration_seconds: 4, source_in_seconds: 0, source_out_seconds: 4 }
    });
    timeline = addClip(timeline, {
        clip_id: 'clip_b', track_id: 'track_audio', kind: 'audio',
        source: { type: 'media_ref', media_ref: 'mref_b' },
        timeline: { start_seconds: 2, duration_seconds: 3, source_in_seconds: 0, source_out_seconds: 3 }
    });
    return timeline;
};

test('projection places lanes, clips and playhead on the molecule layer with seconds-based x', () => {
    const timeline = setPlayhead(buildTimeline(), { playhead_seconds: 3 });
    const records = projectTimelineToSceneRecords(timeline);

    assert.ok(records.every((record) => record.properties.layer === MOLECULE_SCENE_LAYER));

    const lanes = records.filter((record) => record.id.startsWith('mol:lane:'));
    assert.equal(lanes.length, 2, 'one lane per track');

    const clipA = records.find((record) => record.id === 'mol:clip:clip_a');
    assert.equal(clipA.properties.left, 1 * PX, 'clip x derives from start_seconds');
    assert.equal(clipA.properties.width, 4 * PX, 'clip width derives from duration_seconds');
    assert.equal(clipA.kind, 'shape', 'clip blocks render as shapes so the Bevy projection filter cannot drop source-less clips');
    assert.equal(clipA.properties.clip_kind, 'video', 'media kind is carried as metadata for later texture binding');
    assert.deepEqual(clipA.properties.source_ref, { type: 'atome', atome_id: 'atome_a' });

    const clipB = records.find((record) => record.id === 'mol:clip:clip_b');
    assert.equal(clipB.properties.top, LANE_H + 4, 'second-track clip sits in lane 1 (inset by clipInsetY)');
    assert.deepEqual(clipB.properties.source_ref, { type: 'media_ref', media_ref: 'mref_b' });

    const playhead = records.find((record) => record.id === 'mol:playhead');
    assert.equal(playhead.properties.left, 3 * PX, 'playhead x derives from transport.playhead_seconds');
    assert.equal(playhead.properties.height, 2 * LANE_H, 'playhead spans every lane');
    assert.ok(playhead.properties.zIndex > clipA.properties.zIndex, 'playhead renders above clips');
});

test('per-clip filter and transition flow to render material only when present', () => {
    let timeline = buildTimeline();
    const decorated = {
        ...timeline,
        clips: timeline.clips.map((clip) => (
            clip.clip_id === 'clip_a'
                ? { ...clip, filter: { brightness: 1.2, saturate: 0.5 }, transition: { type: 'fade', progress: 0.25 } }
                : clip
        ))
    };
    const records = projectTimelineToSceneRecords(decorated);
    const clipA = records.find((record) => record.id === 'mol:clip:clip_a');
    const clipB = records.find((record) => record.id === 'mol:clip:clip_b');

    assert.equal(clipA.properties.filter_brightness, 1.2);
    assert.equal(clipA.properties.filter_saturate, 0.5);
    assert.deepEqual(clipA.properties.transition, { type: 'fade', progress: 0.25 });
    assert.ok(!('filter_brightness' in clipB.properties), 'untouched clips carry no filter channels');
    assert.ok(!('transition' in clipB.properties), 'untouched clips carry no transition');
});

test('projection feeds the canonical virtual scene chain and scrub is a single playhead transform', () => {
    const before = setPlayhead(buildTimeline(), { playhead_seconds: 1 });
    const sceneBefore = createMoleculeTimelineScene(before);
    // 2 lanes + 2 clips + 1 playhead.
    assert.equal(sceneBefore.nodes.length, 5);
    assert.ok(sceneBefore.nodes.every((node) => node.layer === MOLECULE_SCENE_LAYER));

    const after = setPlayhead(before, { playhead_seconds: 4 });
    const sceneAfter = createMoleculeTimelineScene(after);

    const ops = diffVirtualSceneTrees(sceneBefore, sceneAfter);
    assert.equal(ops.length, 1, 'scrubbing only moves the playhead');
    assert.equal(ops[0].type, 'updateTransform');
    assert.equal(ops[0].id, 'mol:playhead');
    assert.equal(ops[0].node.localTransform.x, 4 * PX);
});
