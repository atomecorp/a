import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addMixModule,
    addTrack,
    createTimeline,
    setMixOutput,
    updateTrack
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import {
    compileMoleculeMixProgram,
    createMoleculeMixEngine
} from '../../eVe/core/media_engine/molecule_mix_engine.js';

const fixture = () => {
    let timeline = createTimeline({
        timeline_id: 'tl_engine', project_id: 'project_engine', owner_atome_id: 'engine',
        initial_section_id: 'section', initial_track_id: 'voice'
    });
    timeline = addClip(timeline, {
        clip_id: 'voice_clip', track_id: 'voice', kind: 'audio', source: { type: 'atome', atome_id: 'a' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'film', next_empty_track_name: 'Film'
    });
    timeline = addClip(timeline, {
        clip_id: 'film_clip', track_id: 'film', kind: 'video', source: { type: 'atome', atome_id: 'v' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'empty', next_empty_track_name: 'Empty'
    });
    timeline = addTrack(timeline, { track_id: 'bus', section_id: 'section', name: 'Bus A', role: 'group' });
    return timeline;
};

test('only audio lanes compile, with buses as strip targets and canonical module ids', () => {
    let timeline = fixture();
    timeline = addMixModule(timeline, {
        strip_id: 'voice:audio', module_id: 'send_1', type: 'send', destination: { kind: 'bus', id: 'bus' }, index: 0
    });
    timeline = addMixModule(timeline, { strip_id: 'voice:audio', module_id: 'rev', type: 'fx', effect: 'reverb' });
    timeline = setMixOutput(timeline, { strip_id: 'film:audio', enabled: false });
    const program = compileMoleculeMixProgram(timeline);
    assert.deepEqual(program.map((strip) => strip.id), ['voice:audio', 'film:audio', 'bus:audio']);
    const voice = program[0];
    assert.deepEqual(voice.chain.map((module) => [module.id, module.type, module.target]), [
        ['send_1', 'send', { kind: 'strip', id: 'bus:audio' }],
        ['voice:audio:volume', 'volume', null],
        ['voice:audio:pan', 'pan', null],
        ['rev', 'fx', null]
    ]);
    assert.equal(voice.chain[3].effect, 'reverb');
    assert.deepEqual(voice.output, { kind: 'main' });
    assert.equal(program[1].output_enabled, false);
    assert.equal(compileMoleculeMixProgram(timeline, { clipHasAudio: () => false }).some((strip) => strip.id === 'film:audio'), false);
});

test('hardware destinations compile to channel pairs; solo mutes the other tracks', () => {
    let timeline = setMixOutput(fixture(), { strip_id: 'voice:audio', destination: { kind: 'device', id: 'interface_a', channel: 2 } });
    timeline = updateTrack(timeline, { track_id: 'film', solo: true });
    assert.deepEqual(compileMoleculeMixProgram(timeline)[0].output, { kind: 'device', channel: 2 });
    const muted = Object.fromEntries(compileMoleculeMixProgram(timeline).map((strip) => [strip.id, strip.muted]));
    assert.deepEqual(muted, { 'voice:audio': true, 'film:audio': false, 'bus:audio': false });
});

test('the engine merges open Molecules, skips identical programs and reports failures', async () => {
    const applied = [];
    let fail = false;
    const audio = { get_runtime: () => ({ playback: 'web_wasm_kira' }), mix_apply: async (program) => { if (fail) throw new Error('engine_down'); applied.push(program); return 2; } };
    const engine = createMoleculeMixEngine({ readAudio: () => audio });
    assert.equal((await engine.update('one', fixture())).ok, true);
    assert.equal((await engine.update('one', fixture())).unchanged, true);
    fail = true;
    const second = createTimeline({ timeline_id: 'tl_2', project_id: 'p', owner_atome_id: 'two', initial_section_id: 's2', initial_track_id: 't2' });
    const failed = await engine.update('two', addTrack(second, { track_id: 'bus2', section_id: 's2', name: 'Bus', role: 'group' }));
    assert.deepEqual(failed, { ok: false, error: 'engine_down' });
    assert.equal(engine.read().last_error, 'engine_down');
    fail = false;
    assert.equal((await engine.flush()).ok, true);
    assert.deepEqual(applied.at(-1).strips.map((strip) => strip.id), ['voice:audio', 'film:audio', 'bus:audio', 'bus2:audio']);
    await engine.remove('two');
    assert.equal(applied.at(-1).strips.length, 3);
    const inactive = createMoleculeMixEngine({ readAudio: () => ({ get_runtime: () => ({ playback: 'tauri_native_kira' }), mix_apply: () => false }) });
    assert.equal((await inactive.update('x', fixture())).error, 'mix_backend_inactive');
    // iOS native (AVAudioEngine) hosts no graph: nothing is applied, voices carry the level.
    const ios = createMoleculeMixEngine({ readAudio: () => ({ get_runtime: () => ({ playback: 'ios_native_kira' }), mix_apply: () => { throw new Error('never'); } }) });
    assert.deepEqual(await ios.update('x', fixture()), { ok: true, graph: false });
});

test('video lanes project opacity and colour onto their clip atomes, hide when unrouted, chain through strips', async () => {
    const { compileMoleculeMixVideo, projectMoleculeMixVideoRecord, setMoleculeMixVideo, removeMoleculeMixVideo } = await import('../../eVe/core/media_engine/molecule_mix_video.js');
    const { addMixModule, updateMixModule, setMixOutput: route } = await import('../../eVe/intuition/tools/molecule/kernel/index.js');
    let timeline = fixture();
    assert.equal(compileMoleculeMixVideo(timeline).size, 0, 'default chains leave the render untouched');
    timeline = updateMixModule(timeline, { strip_id: 'film:video', module_id: 'film:video:opacity', params: { opacity: 0.5 } });
    timeline = addMixModule(timeline, { strip_id: 'film:video', module_id: 'grade', type: 'video_fx', effect: 'color', params: { grayscale: 1, brightness: 1.5 } });
    assert.equal(setMoleculeMixVideo('one', timeline), true);
    const projected = projectMoleculeMixVideoRecord({ id: 'v', properties: { opacity: 0.8, brightness: 1 } });
    assert.equal(projected.properties.opacity, 0.4);
    assert.equal(projected.properties.filter_grayscale, 1);
    assert.equal(projected.properties.filter_brightness, 1.5);
    assert.equal(projectMoleculeMixVideoRecord({ id: 'other', properties: {} }).properties.opacity, undefined, 'other atomes are untouched');
    timeline = route(timeline, { strip_id: 'film:video', destination: null });
    setMoleculeMixVideo('one', timeline);
    assert.equal(projectMoleculeMixVideoRecord({ id: 'v', properties: {} }), null, 'no screen output hides the image');
    removeMoleculeMixVideo('one');
    assert.equal(projectMoleculeMixVideoRecord({ id: 'v', properties: { opacity: 1 } }).properties.opacity, 1);
});
