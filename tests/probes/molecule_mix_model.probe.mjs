import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addMixModule,
    addTrack,
    bypassMixModule,
    createMixGroup,
    createTimeline,
    dissolveMixGroup,
    joinMixGroup,
    leaveMixGroup,
    moveMixModule,
    normalizeTimelineMix,
    readMixStrip,
    removeMixModule,
    removeTrack,
    resolveMixGroups,
    resolveMixStrips,
    setMixOutput,
    transferTracksBetweenTimelines,
    updateMixModule,
    validateTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';

const base = (id = 'mix') => createTimeline({
    timeline_id: `tl_${id}`, project_id: 'project_mix', owner_atome_id: id,
    initial_section_id: `${id}_section`, initial_track_id: `${id}_empty_1`
});

const clip = (timeline, { clipId, trackId, kind, next }) => addClip(timeline, {
    clip_id: clipId, track_id: trackId, kind,
    source: { type: 'atome', atome_id: `atome_${clipId}` },
    timeline: { start_seconds: 0, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
    next_empty_track_id: next, next_empty_track_name: next
});

// voice (audio), film (video with sound), bus (group track)
const fixture = (id = 'mix') => {
    let timeline = base(id);
    timeline = clip(timeline, { clipId: `${id}_voice_clip`, trackId: `${id}_empty_1`, kind: 'audio', next: `${id}_empty_2` });
    timeline = clip(timeline, { clipId: `${id}_film_clip`, trackId: `${id}_empty_2`, kind: 'video', next: `${id}_empty_3` });
    timeline = addTrack(timeline, { track_id: `${id}_bus`, section_id: `${id}_section`, name: 'Bus A', role: 'group' });
    return timeline;
};

const voice = 'mix_empty_1:audio';
const filmVideo = 'mix_empty_2:video';
const filmAudio = 'mix_empty_2:audio';
const busStrip = 'mix_bus:audio';

test('legacy track gain/pan/bus routing migrate into the strip chain and leave the track', () => {
    const legacy = fixture();
    legacy.tracks = legacy.tracks.map((track) => track.track_id === 'mix_empty_1'
        ? { ...track, gain: 0.5, pan: -0.25, output_group_track_id: 'mix_bus' } : track);
    assert.throws(() => validateTimeline(legacy), /moved to timeline.mix/);
    const migrated = normalizeTimelineMix(legacy);
    validateTimeline(migrated);
    const strip = readMixStrip(migrated, voice);
    assert.equal(Math.round(strip.chain.find((module) => module.type === 'volume').params.gain_db), -6);
    assert.equal(strip.chain.find((module) => module.type === 'pan').params.pan, -0.25);
    assert.deepEqual(strip.output.destination, { kind: 'bus', id: 'mix_bus' });
    assert.equal('gain' in migrated.tracks.find((track) => track.track_id === 'mix_empty_1'), false);
});

test('strips follow content lanes; a video with sound is a native group, a silent one is not', () => {
    const timeline = fixture();
    const ids = resolveMixStrips(timeline).map((strip) => strip.strip_id);
    assert.deepEqual(ids, [voice, filmVideo, filmAudio, busStrip]);
    assert.deepEqual(resolveMixGroups(timeline).map((group) => [group.master_strip_id, group.member_strip_ids]), [[filmVideo, [filmAudio]]]);
    const silent = { clipHasAudio: () => false };
    assert.deepEqual(resolveMixStrips(timeline, silent).map((strip) => strip.strip_id), [voice, filmVideo, busStrip]);
    assert.equal(resolveMixGroups(timeline, silent).length, 0);
    const defaults = readMixStrip(timeline, filmVideo);
    assert.deepEqual(defaults.chain.map((module) => module.type), ['opacity']);
    assert.deepEqual(defaults.output.destination, { kind: 'screen', id: 'main' });
});

test('modules are added, tuned, moved, bypassed and removed on the chain', () => {
    let timeline = fixture();
    timeline = addMixModule(timeline, { strip_id: voice, module_id: 'fx_rev', type: 'dsp', effect: 'reverb', index: 0 });
    timeline = updateMixModule(timeline, { strip_id: voice, module_id: 'fx_rev', params: { mix: 0.5 } });
    timeline = addMixModule(timeline, { strip_id: voice, module_id: 'send_a', type: 'send', destination: { kind: 'bus', id: 'mix_bus' } });
    timeline = moveMixModule(timeline, { strip_id: voice, module_id: 'mix_empty_1:audio:volume', index: 0 });
    timeline = bypassMixModule(timeline, { strip_id: voice, module_id: 'fx_rev', bypass: true });
    let chain = readMixStrip(timeline, voice).chain;
    assert.deepEqual(chain.map((module) => module.module_id), ['mix_empty_1:audio:volume', 'fx_rev', 'mix_empty_1:audio:pan', 'send_a']);
    assert.equal(chain[1].params.mix, 0.5);
    assert.equal(chain[1].bypass, true);
    timeline = updateMixModule(timeline, { strip_id: voice, module_id: 'fx_rev', effect: 'echo' });
    assert.equal(readMixStrip(timeline, voice).chain[1].params.time_ms, 377);
    timeline = removeMixModule(timeline, { strip_id: voice, module_id: 'fx_rev' });
    chain = readMixStrip(timeline, voice).chain;
    assert.equal(chain.length, 3);
    assert.throws(() => addMixModule(timeline, { strip_id: filmVideo, module_id: 'bad', type: 'volume' }), /not compatible/);
    assert.throws(() => updateMixModule(timeline, { strip_id: voice, module_id: 'mix_empty_1:audio:volume', params: { gain_db: 40 } }), /between/);
});

test('outputs: none keeps sends, incompatible destinations are refused, loops are allowed', () => {
    let timeline = fixture();
    timeline = addMixModule(timeline, { strip_id: voice, module_id: 'send_a', type: 'send', destination: { kind: 'bus', id: 'mix_bus' } });
    timeline = setMixOutput(timeline, { strip_id: voice, destination: null });
    const strip = readMixStrip(timeline, voice);
    assert.equal(strip.output.destination, null);
    assert.equal(strip.chain.find((module) => module.type === 'send').destination.id, 'mix_bus');
    timeline = setMixOutput(timeline, { strip_id: voice, enabled: false });
    assert.equal(readMixStrip(timeline, voice).output.enabled, false);
    assert.throws(() => setMixOutput(timeline, { strip_id: filmVideo, destination: { kind: 'main' } }), /not compatible/);
    assert.throws(() => setMixOutput(timeline, { strip_id: voice, destination: { kind: 'strip', id: filmVideo } }), /another signal type/);
    // A loop is allowed: the engine closes it through a return (D27).
    timeline = setMixOutput(timeline, { strip_id: voice, destination: { kind: 'bus', id: 'mix_bus' } });
    timeline = setMixOutput(timeline, { strip_id: busStrip, destination: { kind: 'strip', id: voice } });
    assert.deepEqual(readMixStrip(timeline, busStrip).output.destination, { kind: 'strip', id: voice });
});

test('audio groups are sub-mix buses; leaving restores the master destination; native groups detach', () => {
    let timeline = fixture();
    timeline = createMixGroup(timeline, { group_id: 'g1', master_strip_id: busStrip, member_strip_ids: [voice] });
    assert.deepEqual(readMixStrip(timeline, voice).output.destination, { kind: 'bus', id: 'mix_bus' });
    timeline = joinMixGroup(timeline, { strip_id: filmAudio, group_id: 'g1' });
    assert.equal(resolveMixGroups(timeline).some((group) => group.native), false);
    assert.deepEqual(readMixStrip(timeline, filmAudio).output.destination, { kind: 'bus', id: 'mix_bus' });
    timeline = leaveMixGroup(timeline, { strip_id: voice });
    assert.deepEqual(readMixStrip(timeline, voice).output.destination, { kind: 'main' });
    timeline = dissolveMixGroup(timeline, { group_id: 'g1' });
    assert.equal(resolveMixGroups(timeline).length, 0);
    let native = fixture();
    native = leaveMixGroup(native, { strip_id: filmAudio });
    assert.equal(resolveMixGroups(native).length, 0);
    assert.deepEqual(native.mix.detached_strip_ids, [filmAudio]);
});

test('removing a bus track prunes routes to it and transfers carry strip settings', () => {
    let timeline = fixture();
    timeline = setMixOutput(timeline, { strip_id: voice, destination: { kind: 'bus', id: 'mix_bus' } });
    const pruned = removeTrack(timeline, { track_id: 'mix_bus' });
    assert.deepEqual(readMixStrip(pruned, voice).output.destination, { kind: 'main' });
    const tuned = updateMixModule(fixture(), { strip_id: voice, module_id: 'mix_empty_1:audio:pan', params: { pan: 0.75 } });
    const result = transferTracksBetweenTimelines(tuned, fixture('other'), { track_id: 'mix_empty_1', target_section_id: 'other_section' });
    assert.equal(readMixStrip(result.target, voice).chain.find((module) => module.type === 'pan').params.pan, 0.75);
    assert.equal(result.source.mix.strips[voice], undefined);
});

test('mix operations are durable session operations with undo', async () => {
    const events = [];
    const session = createMoleculeSession({ timeline: fixture(), eventSink: { append: async (event) => events.push(event) } });
    await session.applyTimelineOperation('eve.timeline.mix.module.add', { strip_id: voice, module_id: 'mono_1', type: 'mono' });
    assert.equal(events.at(-1).event_type, 'molecule.mix.module.add');
    assert.equal(readMixStrip(session.getState(), voice).chain.at(-1).type, 'mono');
    await session.undo();
    assert.equal(readMixStrip(session.getState(), voice).chain.some((module) => module.type === 'mono'), false);
});
