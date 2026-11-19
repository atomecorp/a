// A cell's launch settings (R-231, user 17 Nov. 2026): speed, reverse, level, ADSR, resume, retrig, ratchet,
// chance and choke groups, One-shot (`once`), what a new cell takes, on the cell player and the cells runtime over a fake engine; the MIDI plan shaped alike.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCellPlayer } from '../../eVe/core/media_engine/molecule_cell_player.js';
import { createMoleculeCellsRuntime } from '../../eVe/intuition/tools/molecule/runtime_cells.js';
import { shapeMidiPlan } from '../../eVe/intuition/tools/molecule/runtime_midi.js';
import { addClip, addScene, cellDefaultsOf, createTimeline, setCellDefaults, setCellSettings, updateSection } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { validateCellSettings } from '../../eVe/intuition/tools/molecule/kernel/scene_schema.js';
import { RATE, fakeSession } from '../helpers/molecule_cell_fake_session.mjs';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const until = async (predicate, ms = 3000) => {
    const end = Date.now() + ms;
    while (!predicate() && Date.now() < end) await wait(10);
    return predicate();
};
const near = (value, expected, label) => assert.ok(Math.abs(value - expected) < 1e-6, `${label}: ${value} ≠ ${expected}`);
const track = [{ id: 'a', gain: 1, clips: [{ id: 'ca', kind: 'audio', start: 0, duration: 4, fadeIn: 0.1, fadeOut: 0.3, source: { assetId: 'ca' } }] }];

test('speed: passes twice as short, the voice twice as fast, its envelope in output time', async () => {
    const session = fakeSession(track);
    const player = createCellPlayer(session);
    const launched = await player.launch({ key: 'k', from: 0.5, until: 0.7, trackIds: ['a'], passes: 2, speed: 2 });
    assert.ok(await until(() => !player.isPlaying('k')));
    assert.deepEqual(session.calls.map((voice) => voice.startRenderFrame), [0, 1].map((pass) => launched.start_frame + pass * 0.1 * RATE));
    assert.ok(session.calls.every((voice) => voice.rate === 2), 'the rate carries the speed');
    const [first] = session.calls;
    near(first.envelope.offsetSeconds, 0.25, 'offset');
    near(first.envelope.endSeconds, 0.35, 'end');
    near(first.envelope.durationSeconds, 2, 'clip length');
    near(first.envelope.fadeOutSeconds, 0.15, 'fade out');
});

test('reverse: the voice plays exactly its window backwards, the clip read from its end, its fades swapped', async () => {
    const session = fakeSession(track);
    const player = createCellPlayer(session);
    await player.launch({ key: 'k', from: 0.5, until: 0.7, trackIds: ['a'], passes: 1, reverse: true, attackSeconds: 0.01 });
    assert.ok(await until(() => !player.isPlaying('k')));
    const [voice] = session.calls;
    assert.equal(voice.reverse, true);
    near(voice.startSeconds, 0.5, 'source start');
    near(voice.durationSeconds, 0.2, 'exactly the window');
    near(voice.envelope.offsetSeconds, 3.3, 'clip time runs from its end');
    near(voice.envelope.endSeconds, 3.5, 'and stops at the window start');
    near(voice.envelope.fadeInSeconds, 0.3, 'the fade out is heard first');
    near(voice.envelope.attackStartSeconds, 3.3, 'the attack rises where the window is first heard');
    assert.ok(!('loopStartSeconds' in voice), 'no forward loop on a reversed voice');
});

test('resume: the first pass starts into the window, the next ones play it whole on the same grid', async () => {
    const session = fakeSession(track);
    const player = createCellPlayer(session);
    const launched = await player.launch({ key: 'k', from: 0.5, until: 0.7, trackIds: ['a'], passes: 2, offsetSeconds: 0.05 });
    assert.ok(await until(() => !player.isPlaying('k')));
    const [first, second] = session.calls;
    near(first.startSeconds, 0.55, 'the first pass starts where it was');
    assert.equal(second.startRenderFrame, launched.start_frame + 0.15 * RATE, 'the second pass starts where the first one ends');
    near(second.startSeconds, 0.5, 'and plays the window whole');
});

test('ADSR: the envelope carries the decay from the attack\'s end and the sustain level', async () => {
    const session = fakeSession(track);
    const player = createCellPlayer(session);
    await player.launch({ key: 'k', from: 0.5, until: 0.7, trackIds: ['a'], passes: 1, attackSeconds: 0.02, decaySeconds: 0.05, sustain: 0.5, releaseSeconds: 0.03 });
    assert.ok(await until(() => !player.isPlaying('k')));
    const { envelope } = session.calls[0];
    near(envelope.attackStartSeconds, 0.5, 'attack start');
    near(envelope.decayStartSeconds, 0.52, 'decay start');
    assert.equal(envelope.decaySeconds, 0.05);
    assert.equal(envelope.sustainLevel, 0.5);
    assert.equal(envelope.releaseSeconds, 0.03);
});

test('a cell launched again hands over: the one playing ends exactly where the new one starts', async () => {
    const session = fakeSession(track);
    const player = createCellPlayer(session);
    await player.launch({ key: 'k', from: 0.5, until: 1.5, trackIds: ['a'], passes: null });
    await wait(80);
    const again = await player.launch({ key: 'k', from: 0.5, until: 1.5, trackIds: ['a'], passes: null, quantumSeconds: 0.25 });
    const first = session.calls[0];
    assert.ok(session.ends.some((end) => end.voiceId === first.voiceId && end.endFrame === again.start_frame - first.startRenderFrame && end.releaseFrames > 0),
        JSON.stringify(session.ends));
    assert.equal(player.read().length, 1, 'one cell listed');
    assert.ok(player.isPlaying('k'));
    await player.stopAll();
});

const cellsTimeline = () => {
    let timeline = createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: 't' });
    timeline = updateSection(timeline, { section_id: 's', duration_frames: 10 * RATE });
    timeline = addClip(timeline, {
        clip_id: 'c', track_id: 't', kind: 'audio', source: { type: 'atome', atome_id: 'x' },
        timeline: { start_seconds: 0, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
        next_empty_track_id: 't2', next_empty_track_name: 'Piste 2'
    });
    timeline = addClip(timeline, {
        clip_id: 'd', track_id: 't2', kind: 'audio', source: { type: 'atome', atome_id: 'y' },
        timeline: { start_seconds: 0, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
        next_empty_track_id: 't3', next_empty_track_name: 'Piste 3'
    });
    timeline = addScene(timeline, { scene_id: 'A', name: 'A', start_frame: 0, duration_frames: RATE });
    return timeline;
};
const runtime = (timeline, random = Math.random) => {
    const session = fakeSession();
    const engine = { getSession: () => session, createSession: () => session, disposeSession: async () => ({ ok: true }) };
    const midi = { start: async () => ({ ok: true, playing: 0, errors: [] }), stop: async () => ({ ok: true }) };
    return { session, cells: createMoleculeCellsRuntime({ env: {}, engine, midi, random, readTimeline: () => timeline.current }) };
};
const loop = { play_mode: 'loop', passes: null, quantize_start: 'off', quantize_end: 'off' };

test('runtime: chance, choke group, velocity', async () => {
    const holder = { current: cellsTimeline() };
    holder.current = setCellSettings(holder.current, { scene_id: 'A', track_id: 't', settings: { ...loop, chance: 0.5, choke_group: 'g', velocity: 0.5 } });
    holder.current = setCellSettings(holder.current, { scene_id: 'A', track_id: 't2', settings: { ...loop, choke_group: 'g' } });
    const draws = [0.9, 0.1];
    const { session, cells } = runtime(holder, () => draws.shift());
    const skipped = await cells.trigger({ groupId: 'm', timeline: holder.current, cells: [{ scene_id: 'A', track_id: 't' }] });
    assert.equal(skipped.cells[0].skipped, true, 'a draw over its chance does not play');
    await cells.trigger({ groupId: 'm', timeline: holder.current, cells: [{ scene_id: 'A', track_id: 't2' }] });
    await cells.trigger({ groupId: 'm', timeline: holder.current, cells: [{ scene_id: 'A', track_id: 't', velocity: 0.5 }] });
    assert.ok(await until(() => cells.read('m').cells.length === 1, 1000), 'the cell of the same group was choked');
    assert.equal(cells.read('m').cells[0].key, 'A|t');
    const struck = session.calls.filter((voice) => voice.assetId.includes('c') && !voice.assetId.includes('d')).at(-1);
    near(struck.gain, 0.25, 'its level times the strike');
    await cells.stop('m');
});

test('runtime: resume continue, retrig, ratchet', async () => {
    const holder = { current: cellsTimeline() };
    holder.current = setCellSettings(holder.current, { scene_id: 'A', track_id: 't', settings: { ...loop, resume: 'continue' } });
    const { session, cells } = runtime(holder);
    const press = () => cells.trigger({ groupId: 'm', timeline: holder.current, cells: [{ scene_id: 'A', track_id: 't' }] });
    await press();
    await wait(300);
    await press();
    assert.ok(await until(() => !cells.read('m').playing, 1000));
    session.calls.length = 0;
    await press();
    assert.ok(session.calls[0].startSeconds > 0.2, `continues where it was: ${session.calls[0].startSeconds}`);
    await cells.stop('m');

    holder.current = setCellSettings(holder.current, { scene_id: 'A', track_id: 't', settings: { resume: 'start', repeat: 'retrig' } });
    await press();
    await wait(150);
    session.calls.length = 0;
    const again = await press();
    assert.ok(cells.read('m').playing && again.cells[0].ok, 'a retrig never stops it');
    near(session.calls[0].startSeconds, 0, 'it starts again from the start');
    await cells.stop('m');

    holder.current = setCellSettings(holder.current, { scene_id: 'A', track_id: 't', settings: { repeat: 'ratchet', ratchet_count: 3, ratchet_division: 'beat' } });
    session.calls.length = 0;
    await press();
    assert.ok(await until(() => session.calls.length >= 4, 2000), `three steps then the cell: ${session.calls.length}`);
    const [a, b, c, cell] = session.calls;
    assert.ok([a, b, c].every((voice) => voice.startSeconds === 0 && Math.abs(voice.envelope.endSeconds - 0.5) < 1e-9), 'each step plays the first beat');
    assert.equal(cell.startRenderFrame - a.startRenderFrame, 1.5 * RATE, 'the cell starts right after the third step');
    assert.equal(cell.envelope.endSeconds, 1, 'and plays its whole window');
    await cells.stop('m');
});

test('runtime: a One-shot (once) plays to its end whatever the touches; a Latch stops at the next', async () => {
    const holder = { current: cellsTimeline() };
    holder.current = setCellSettings(holder.current, { scene_id: 'A', track_id: 't', settings: { ...loop, play_mode: 'one_shot', trigger: 'once' } });
    const { cells } = runtime(holder);
    const press = () => cells.trigger({ groupId: 'm', timeline: holder.current, cells: [{ scene_id: 'A', track_id: 't' }] });
    await press();
    const again = await press();
    assert.equal(again.cells[0].ignored, 'cell_plays_once');
    assert.ok(cells.read('m').playing, 'a second touch leaves it playing');
    await cells.stop('m');
    holder.current = setCellSettings(holder.current, { scene_id: 'A', track_id: 't', settings: { trigger: 'latch' } });
    await press();
    await press();
    assert.ok(await until(() => !cells.read('m').playing, 2000), 'a Latch stops at the next touch');
});

test('what a new cell takes: every setting of the row but its MIDI note', () => {
    const settings = { trigger: 'once', speed: 2, reverse: true, decay_ms: 144, sustain: 0.55, repeat: 'ratchet', chance: 0.5, choke_group: 'A', fade_in_ms: 13 };
    const timeline = setCellDefaults(cellsTimeline(), { settings });
    assert.deepEqual(Object.fromEntries(Object.keys(settings).map((key) => [key, cellDefaultsOf(timeline).settings[key]])), settings);
    assert.throws(() => setCellDefaults(cellsTimeline(), { settings: { midi: { note: 60 } } }));
});

test('shapeMidiPlan: backwards a note keeps its length, faster it is shorter, softer its velocity falls', () => {
    const plan = { events: [{ at_ms: 100, bytes: [0x90, 60, 100] }, { at_ms: 300, bytes: [0x80, 60, 0] }], duration_ms: 1000 };
    assert.deepEqual(shapeMidiPlan(plan, { reverse: true }).events.map((event) => [event.at_ms, event.bytes[0]]), [[700, 0x90], [900, 0x80]]);
    assert.deepEqual(shapeMidiPlan(plan, { speed: 2 }).events.map((event) => event.at_ms), [50, 150]);
    assert.equal(shapeMidiPlan(plan, { velocity: 0.5 }).events[0].bytes[2], 50);
    assert.equal(shapeMidiPlan(plan, { speed: 2 }).duration_ms, 500);
});

test('the schema takes the new settings and refuses wrong values', () => {
    validateCellSettings({ decay_ms: 144, sustain: 0.55, speed: 2, reverse: true, velocity: 0.55, resume: 'marker', resume_marker_id: 'm1',
        repeat: 'ratchet', ratchet_count: 3, ratchet_division: '1/4beat', chance: 0.5, choke_group: 'g' });
    for (const wrong of [{ speed: 9 }, { sustain: 2 }, { resume: 'x' }, { repeat: 'x' }, { ratchet_division: 'off' }, { reverse: 1 }]) {
        assert.throws(() => validateCellSettings(wrong), undefined, JSON.stringify(wrong));
    }
});
