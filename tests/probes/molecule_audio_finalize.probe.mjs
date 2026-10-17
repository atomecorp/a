// Regression probe (todo/audio_to_finalize): canonical clip fades through the
// kernel and transport, scheduled voices carrying their envelope and loop, and
// the metronome as native looping runs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTransportTimeline } from '../../eVe/intuition/tools/molecule/runtime_transport.js';
import { scheduleSessionVoices } from '../../eVe/core/media_engine/molecule_render_schedule.js';
import { normalizeTimeline } from '../../eVe/core/media_engine/molecule_support.js';
import {
    addClip, createTimeline, resizeClip, setClipBlockLoop, setClipFades, splitClip, updateSection, validateTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';

const fixture = () => {
    let timeline = createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: 't' });
    timeline = updateSection(timeline, { section_id: 's', duration_frames: 480000 });
    return addClip(timeline, {
        clip_id: 'c', track_id: 't', kind: 'audio', source: { type: 'atome', atome_id: 'a' },
        timeline: { start_seconds: 1, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
        next_empty_track_id: 't2', next_empty_track_name: 'Piste 2'
    });
};
const env = { Atome: { getStateCurrent: async (id) => ({ id, properties: { kind: 'audio', media_url: `/api/uploads/${id}.wav` } }) } };

test('kernel: fades are set, validated, trimmed with the clip and split in halves', () => {
    let timeline = setClipFades(fixture(), { clip_id: 'c', in_frames: 4800, out_frames: 9600 });
    assert.deepEqual(timeline.clips[0].fades, { in_frames: 4800, out_frames: 9600 });
    assert.throws(() => setClipFades(timeline, { clip_id: 'c', in_frames: 96000, out_frames: 1 }), /longer than the clip/);
    assert.throws(() => setClipFades(timeline, { clip_id: 'c', in_frames: 1.5 }), /integers/);
    const split = splitClip(timeline, { clip_id: 'c', at_seconds: 2, left_clip_id: 'l', right_clip_id: 'r' });
    assert.deepEqual(split.clips.find((clip) => clip.clip_id === 'l').fades, { in_frames: 4800, out_frames: 0 });
    assert.deepEqual(split.clips.find((clip) => clip.clip_id === 'r').fades, { in_frames: 0, out_frames: 9600 });
    const short = resizeClip(timeline, { clip_id: 'c', edge: 'end', value_seconds: 1.25 });
    const fades = short.clips[0].fades;
    assert.ok(fades.in_frames + fades.out_frames <= short.clips[0].timeline.duration_frames, 'fades fit the shorter clip');
    validateTimeline(short);
    assert.equal(setClipFades(timeline, { clip_id: 'c', in_frames: 0, out_frames: 0 }).clips[0].fades, undefined, '0/0 removes them');
});

test('session: molecule.clip.fades is a durable operation reachable by its verb', async () => {
    const events = [];
    const session = createMoleculeSession({ timeline: fixture(), eventSink: { append: async (event) => { events.push(event); return event; } } });
    await session.apply('eve.timeline.clip.fades', { clip_id: 'c', in_frames: 480, out_frames: 0 });
    assert.deepEqual(session.getState().clips[0].fades, { in_frames: 480, out_frames: 0 });
    assert.ok(events.some((event) => JSON.stringify(event).includes('molecule.clip.fades')), 'the op is written to history');
});

test('transport: fade-in on the first repeat, fade-out on the last', async () => {
    let timeline = setClipFades(fixture(), { clip_id: 'c', in_frames: 4800, out_frames: 9600 });
    timeline = setClipBlockLoop(timeline, { clip_id: 'c', enabled: true, duration_frames: 288000 });
    const molecule = await buildTransportTimeline(env, timeline);
    const clips = molecule.tracks[0].clips;
    assert.equal(clips.length, 3);
    assert.deepEqual(clips.map((clip) => [clip.fadeIn, clip.fadeOut]), [[0.1, 0], [0, 0], [0, 0.2]]);
});

test('render schedule: each voice carries its envelope, a looped clip its loop', async () => {
    const calls = [];
    const timeline = normalizeTimeline({ tracks: [{ id: 't', gain: 1, clips: [
        { id: 'c', kind: 'audio', start: 1, duration: 2, fadeIn: 0.1, fadeOut: 0.2, source: { assetId: 'a' } },
        { id: 'm', kind: 'audio', start: 0, duration: 8, inPoint: 0.5, loopStart: 0, loopEnd: 2, source: { assetId: 'bar' } }
    ] }] });
    const runtime = (id) => ({ assetId: id, voiceId: `${id}:voice`, audioAvailable: true, liveVoiceIds: new Set() });
    const session = {
        timeline, voiceState: new Map(), runtimeClips: new Map([['c', runtime('c')], ['m', runtime('m')]]),
        _stopRuntimeVoice: async () => {}, _ensureVideoAudioAsset: async () => true,
        audio: { scheduleVoices: async (voices) => { calls.push(...voices); return voices.map((voice) => voice.startRenderFrame); } }
    };
    await scheduleSessionVoices(session, 1.5, { sample_rate: 48000, frames_rendered: 1000, block_frames: 512 });
    const clip = calls.find((voice) => voice.assetId === 'c');
    assert.deepEqual(clip.envelope, { offsetSeconds: 0.5, durationSeconds: 2, fadeInSeconds: 0.1, fadeOutSeconds: 0.2 });
    assert.equal(clip.gain, 1, 'the fade is not baked into the voice gain any more');
    const bar = calls.find((voice) => voice.assetId === 'm');
    assert.deepEqual([bar.loopStartSeconds, bar.loopEndSeconds], [0, 2]);
    assert.equal(bar.envelope.offsetSeconds, 1.5);
});

test('metronome: one native looping voice per tempo run, re-anchored only for fractional bars', async () => {
    const { buildMetronomeTrack } = await import('../../eVe/intuition/tools/molecule/runtime_metronome.js');
    const loaded = [];
    const env = {};
    Object.defineProperty(env, '__SQUIRREL_PLAY_RECORD_CORE__', { value: {
        hasAsset: async () => true, loadTransientAsset: async ({ assetId, bytes }) => { loaded.push([assetId, bytes.length]); }
    } });
    const timeline = (bpm) => ({ settings: { metronome_enabled: true }, timebase: { sample_rate: 48000, tempo_map: [{ start_seconds: 0, bpm, beats_per_bar: 4 }] } });
    // 120 bpm: a bar is exactly 96000 frames, one voice for six hours.
    const whole = await buildMetronomeTrack(env, timeline(120), { startSeconds: 3, endSeconds: 6 * 3600 });
    assert.equal(whole.clips.length, 1);
    assert.deepEqual([whole.clips[0].start, whole.clips[0].inPoint, whole.clips[0].loopEnd], [3, 1, 2]);
    assert.equal(whole.clips[0].start + whole.clips[0].duration, 6 * 3600, 'clicks until the end, no 512-bar cap');
    // 133 bpm: 86616.5 frames per bar, re-anchored every 16 bars on the exact bar start.
    const fractional = await buildMetronomeTrack(env, timeline(133), { startSeconds: 0, endSeconds: 120 });
    const barSeconds = (60 / 133) * 4;
    assert.ok(fractional.clips.length > 1);
    fractional.clips.forEach((clip, index) => assert.ok(Math.abs(clip.start - index * 16 * barSeconds) < 1e-9, `run ${index} starts on its bar`));
    assert.equal(fractional.clips[0].loopEnd, 86617 / 48000, 'the looped bar is a whole number of frames');
    // Count-in only: clicks stop where the take starts.
    const countIn = await buildMetronomeTrack(env, { ...timeline(120), settings: {} }, { startSeconds: 0, endSeconds: 600, countInEndSeconds: 4 });
    assert.equal(countIn.clips[0].start + countIn.clips[0].duration, 4);
});

test('playhead: after a schedule jump the Web playhead follows the segment in force (§2.5)', async () => {
    const { renderClockPosition } = await import('../../eVe/core/media_engine/molecule_render_schedule.js');
    const context = { currentTime: 0 };
    const mapping = { context, start_seconds: 10, render_start_frame: 48000, sample_rate: 48000, base_context_frame: 1000 };
    context.currentTime = (1000 + 96000) / 48000;
    assert.equal(renderClockPosition(mapping), 11, 'without a jump: base of the start');
    // The main thread stalled at rendered frame 72000: from then on frame n plays at context 1000 + 2400 + n.
    const clockNow = { base_segments: [0, 1000, 72000, 3400] };
    assert.equal(renderClockPosition(mapping, clockNow), 10 + (96000 - 2400 - 48000) / 48000, 'the later segment applies');
    context.currentTime = (1000 + 50000) / 48000;
    assert.equal(renderClockPosition(mapping, clockNow), 10 + 2000 / 48000, 'before the jump the first segment still applies');
});

test('MIDI: list playback starts each Molecule at its offset; a seek restarts the lane (§6.3.1-2)', async () => {
    const { createMoleculeTransportRuntime } = await import('../../eVe/intuition/tools/molecule/runtime_transport.js');
    const calls = [];
    const midi = { start: async (input) => { calls.push(['start', input.groupId, input.fromSeconds]); return { ok: true }; },
        stop: async (groupId) => { calls.push(['stop', groupId]); return { ok: true }; } };
    const sessions = new Map();
    const engine = {
        getSession: (id) => sessions.get(id) || null,
        createSession: ({ id }) => {
            const session = { id, transport: { playing: false, position: 0 }, timeline: null,
                setTimeline: async (timeline) => { session.timeline = timeline; },
                play: async ({ startSeconds }) => { session.transport = { playing: true, position: startSeconds }; return { ok: true }; },
                stop: async () => { session.transport.playing = false; },
                seek: async (seconds) => { session.transport.position = seconds; return { ok: true, playing: session.transport.playing, position: seconds }; },
                getTransportState: () => ({ position: session.transport.position }), getRenderMapping: () => null };
            sessions.set(id, session);
            return session;
        },
        disposeSession: async () => ({ ok: true })
    };
    const transport = createMoleculeTransportRuntime({ env, engine, midi });
    const a = fixture();
    const b = fixture();
    const list = await transport.toggleSequence({ items: [{ groupId: 'a', timeline: a }, { groupId: 'b', timeline: b }] });
    assert.deepEqual(list.offsets.map((entry) => entry.start_seconds), [0, 10]);
    assert.deepEqual(calls.filter(([kind]) => kind === 'start'), [['start', 'list:a', -0], ['start', 'list:b', -10]]);
    await transport.toggleSequence({});
    assert.ok(calls.some(([kind, key]) => kind === 'stop' && key === 'list:b'), 'stopping the list stops its MIDI lanes');
    calls.length = 0;
    await transport.play({ groupId: 'a', timeline: a });
    await transport.seek('a', 2.5);
    assert.deepEqual(calls.filter(([kind]) => kind === 'start').at(-1), ['start', 'a', 2.5], 'the MIDI lane restarts at the new position');
});

test('mute/solo: the graph mutes the strip live; the transport keeps the track (§6.3.6)', async () => {
    const { updateTrack } = await import('../../eVe/intuition/tools/molecule/kernel/index.js');
    const { compileMoleculeMixProgram } = await import('../../eVe/core/media_engine/molecule_mix_engine.js');
    const muted = updateTrack(fixture(), { track_id: 't', mute: true });
    const withGraph = await buildTransportTimeline(env, muted);
    assert.ok(withGraph.tracks.some((track) => track.id === 't'), 'the muted track still plays into its strip');
    assert.equal(compileMoleculeMixProgram(muted).find((strip) => strip.id === 't:audio').muted, true, 'its strip is muted by the graph');
});

test('Input on Tauri: the panel lists the engine\'s own (cpal) inputs, so the chosen name is one cpal knows (§1.3)', async () => {
    const previous = globalThis.window;
    globalThis.window = { Squirrel: { av: { audio: {
        get_runtime: () => ({ playback: 'tauri_native_kira' }),
        mix_output_devices: async () => ({ outputs: [], inputs: [{ id: 'MacBook Pro Microphone', name: 'MacBook Pro Microphone', channels: 1 }] })
    } } } };
    try {
        const inputs = await import('../../eVe/domains/media/media_input_devices.js');
        const listed = await inputs.listMediaInputs('audio');
        assert.deepEqual(listed.map((device) => [device.id, device.label]), [['audio:MacBook Pro Microphone', 'MacBook Pro Microphone']]);
        inputs.selectMediaInput('audio', 'audio:MacBook Pro Microphone');
        assert.equal(inputs.mediaInputDeviceName('audio'), 'MacBook Pro Microphone', 'the native recorder receives the cpal name');
    } finally { globalThis.window = previous; }
});
