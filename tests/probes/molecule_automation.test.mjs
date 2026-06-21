import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addAutomationKeyframe,
    addAutomationLane,
    addTrack,
    createTimeline,
    editAutomationKeyframe,
    moveAutomationKeyframe,
    removeAutomationKeyframe,
    removeAutomationLane,
    validateTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { projectTimelineToSceneRecords } from '../../eVe/intuition/tools/molecule/render/timeline_scene.js';

const base = () => {
    let tl = createTimeline({ timeline_id: 'tl_a', project_id: 'p', owner_atome_id: 'g' });
    tl = addTrack(tl, { track_id: 'track_video', kind: 'video', name: 'video', order: 10 });
    return tl;
};

test('createTimeline carries an empty automation array and validates', () => {
    const tl = base();
    assert.deepEqual(tl.automation, []);
    assert.doesNotThrow(() => validateTimeline(tl));
});

test('automation lane + keyframe lifecycle is pure and time-ordered', () => {
    let tl = addAutomationLane(base(), { automation_id: 'a1', target_id: 'track_video', param: 'opacity' });
    assert.equal(tl.automation.length, 1);
    assert.deepEqual(tl.automation[0].keyframes, []);

    tl = addAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k2', time_seconds: 4, value: 1, curve: 'smooth' });
    tl = addAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k1', time_seconds: 1, value: 0 });
    // keyframes stay sorted by time regardless of insertion order
    assert.deepEqual(tl.automation[0].keyframes.map((k) => k.keyframe_id), ['k1', 'k2']);
    assert.equal(tl.automation[0].keyframes[1].curve, 'smooth');
    assert.equal(tl.automation[0].keyframes[0].curve, 'linear'); // defaulted

    tl = moveAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k1', time_seconds: 6 });
    assert.deepEqual(tl.automation[0].keyframes.map((k) => k.keyframe_id), ['k2', 'k1']); // reordered

    tl = editAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k1', value: 0.5, curve: 'hold' });
    const k1 = tl.automation[0].keyframes.find((k) => k.keyframe_id === 'k1');
    assert.equal(k1.value, 0.5);
    assert.equal(k1.curve, 'hold');

    tl = removeAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k2' });
    assert.deepEqual(tl.automation[0].keyframes.map((k) => k.keyframe_id), ['k1']);

    tl = removeAutomationLane(tl, { automation_id: 'a1' });
    assert.deepEqual(tl.automation, []);
});

test('automation reducers reject invalid commands', () => {
    const tl = addAutomationLane(base(), { automation_id: 'a1', target_id: 'track_video', param: 'opacity' });
    const hasCode = (code) => (err) => err.code === code;
    assert.throws(() => addAutomationKeyframe(tl, { automation_id: 'missing', keyframe_id: 'k', time_seconds: 1, value: 0 }), hasCode('molecule_kernel/automation_not_found'));
    assert.throws(() => addAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k', time_seconds: -1, value: 0 }), hasCode('molecule_kernel/negative_position'));
    assert.throws(() => addAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k', time_seconds: 1, value: 0, curve: 'bogus' }), hasCode('molecule_kernel/invalid_automation'));
    assert.throws(() => moveAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'nope', time_seconds: 1 }), hasCode('molecule_kernel/keyframe_not_found'));
});

test('automation keyframes render as dots on the target lane (time -> x, value -> y)', () => {
    let tl = addAutomationLane(base(), { automation_id: 'a1', target_id: 'track_video', param: 'opacity' });
    tl = addAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k1', time_seconds: 2, value: 1 });
    tl = addAutomationKeyframe(tl, { automation_id: 'a1', keyframe_id: 'k2', time_seconds: 5, value: 0 });
    const records = projectTimelineToSceneRecords(tl);
    const dots = records.filter((r) => r.id.startsWith('mol:kf:'));
    assert.equal(dots.length, 2);
    const k1 = records.find((r) => r.id === 'mol:kf:a1:k1');
    // center x = 2s * 80 px = 160 (minus half the 8px dot)
    assert.equal(k1.properties.left + 4, 160);
    // value 1 -> lane top (y 0), center at top of lane 0
    assert.equal(k1.properties.top + 4, 0);
    const k2 = records.find((r) => r.id === 'mol:kf:a1:k2');
    // value 0 -> lane bottom (y = laneHeight 48)
    assert.equal(k2.properties.top + 4, 48);
    assert.ok(k1.properties.zIndex > 1 && k1.properties.zIndex < 10, 'above clips, below playhead');
});
