// Cells playback (todo/timeline v1.6 §2, §3): passes on their exact frames,
// quantized launches on one shared grid, Follow Actions on the exact end frame.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCellPlayer } from '../../eVe/core/media_engine/molecule_cell_player.js';
import { normalizeTimeline } from '../../eVe/core/media_engine/molecule_support.js';
import { createMoleculeCellsRuntime } from '../../eVe/intuition/tools/molecule/runtime_cells.js';
import { addClip, addScene, createTimeline, setCellSettings, updateSection } from '../../eVe/intuition/tools/molecule/kernel/index.js';

const RATE = 48000;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const until = async (predicate, ms = 3000) => {
    const end = Date.now() + ms;
    while (!predicate() && Date.now() < end) await wait(10);
    return predicate();
};

// A session over a fake engine: the render clock follows the wall clock.
const fakeSession = (tracks) => {
    const calls = [];
    const stopped = [];
    const origin = globalThis.performance.now();
    const frames = () => Math.floor(((globalThis.performance.now() - origin) / 1000) * RATE);
    const session = {
        calls, stopped, ends: [], voiceState: new Map(), runtimeClips: new Map(),
        _ensureVideoAudioAsset: async () => true,
        _stopRuntimeVoice: async (runtime, voiceId) => {
            if (!runtime.liveVoiceIds.has(voiceId)) return;
            runtime.liveVoiceIds.delete(voiceId);
            stopped.push(voiceId);
        },
        setTimeline: async (timeline) => {
            session.timeline = normalizeTimeline(timeline);
            session.timeline.tracks.flatMap((track) => track.clips).forEach((clip) => {
                if (!session.runtimeClips.has(clip.id)) {
                    session.runtimeClips.set(clip.id, { assetId: clip.id, voiceId: `${clip.id}:voice`, audioAvailable: true, liveVoiceIds: new Set() });
                }
            });
        },
        audio: {
            readRenderClock: async () => ({ sample_rate: RATE, frames_rendered: frames(), block_frames: 128, played_frame_now: frames() }),
            readRenderClockNow: () => null,
            scheduleVoices: async (voices) => { calls.push(...voices); return voices.map((voice) => voice.startRenderFrame); },
            setVoiceEnd: async (voiceId, endFrame, releaseFrames) => { session.ends.push({ voiceId, endFrame, releaseFrames }); return true; },
            stopVoice: async () => {}
        }
    };
    if (tracks) void session.setTimeline({ tracks });
    return session;
};

const twoTracks = [
    { id: 'a', gain: 1, clips: [{ id: 'ca', kind: 'audio', start: 0, duration: 4, source: { assetId: 'ca' } }] },
    { id: 'b', gain: 1, clips: [{ id: 'cb', kind: 'audio', start: 0, duration: 4, source: { assetId: 'cb' } }] }
];

test('a cell plays its passes back to back on exact frames, then ends', async () => {
    const session = fakeSession(twoTracks);
    const player = createCellPlayer(session);
    const launched = await player.launch({ key: 'k', from: 0.5, until: 0.7, trackIds: ['a'], passes: 3, attackSeconds: 0.01, releaseSeconds: 0.02 });
    assert.ok(await until(() => !player.isPlaying('k')), 'the cell ends after its passes');
    const starts = session.calls.map((voice) => voice.startRenderFrame);
    assert.deepEqual(starts, [0, 1, 2].map((pass) => launched.start_frame + pass * 0.2 * RATE), 'one voice per pass, each where the last ends');
    assert.ok(session.calls.every((voice) => voice.assetId === 'ca'), 'only the cell\'s track plays');
    assert.ok(session.calls.every((voice) => Math.abs(voice.startSeconds - 0.5) < 1e-9 && voice.envelope.endSeconds === 0.7), 'each pass plays the window');
    const shapes = session.calls.map(({ envelope }) => [envelope.attackStartSeconds ?? null, envelope.attackSeconds ?? 0, envelope.releaseSeconds ?? 0]);
    assert.deepEqual(shapes, [[0.5, 0.01, 0], [null, 0, 0], [null, 0, 0.02]], 'the attack on the first pass from the cell start, the release on the last');
});

test('quantized launches share one grid; a Follow Action starts on the exact end frame', async () => {
    const session = fakeSession(twoTracks);
    const player = createCellPlayer(session);
    const handOvers = [];
    const first = await player.launch({ key: 'a', from: 0, until: 0.25, trackIds: ['a'], passes: null });
    await wait(60);
    const second = await player.launch({
        key: 'b', from: 1, until: 1.1, trackIds: ['b'], passes: 2, quantumSeconds: 0.25,
        onEnd: async (frame) => {
            handOvers.push(frame);
            await player.launch({ key: 'c', from: 2, until: 2.1, trackIds: ['b'], passes: 1, startFrame: frame });
        }
    });
    assert.equal((second.start_frame - first.start_frame) % (0.25 * RATE), 0, 'the quantized start is on the grid of the first cell');
    assert.ok(second.start_frame > first.start_frame);
    assert.ok(await until(() => handOvers.length === 1 && !player.isPlaying('c')));
    assert.equal(handOvers[0], second.start_frame + 2 * 0.1 * RATE, 'handed over where the last pass ends');
    assert.ok(session.calls.some((voice) => voice.startRenderFrame === handOvers[0] && Math.abs(voice.startSeconds - 2) < 1e-9));
    assert.ok(player.isPlaying('a'), 'launching another cell never stops a playing one (§2.5)');
    const { stop_frame: stopFrame } = await player.stop('a', { quantumSeconds: 0.25 });
    assert.equal((stopFrame - first.start_frame) % (0.25 * RATE), 0, 'the stop is on the grid');
    const late = session.calls.filter((voice) => voice.assetId === 'ca' && voice.startRenderFrame >= stopFrame);
    assert.ok(late.length > 0 && late.every((voice) => session.stopped.includes(voice.voiceId)), 'passes scheduled past the stop are cancelled at once');
    const sounding = session.calls.filter((voice) => voice.assetId === 'ca' && voice.startRenderFrame < stopFrame
        && voice.startRenderFrame + 0.25 * RATE > stopFrame);
    assert.ok(sounding.every((voice) => session.ends.some((end) => end.voiceId === voice.voiceId && end.endFrame === stopFrame - voice.startRenderFrame)),
        'a voice still sounding at the stop ends exactly on its frame');
    assert.ok(await until(() => !player.isPlaying('a')), 'the sounding pass is cut on the stop');
});

test('runtime: a Scene cell plays every track then the next Scene; a track cell stops; Latch toggles', async () => {
    let timeline = createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: 't' });
    timeline = updateSection(timeline, { section_id: 's', duration_frames: 10 * RATE });
    timeline = addClip(timeline, {
        clip_id: 'c', track_id: 't', kind: 'audio', source: { type: 'atome', atome_id: 'x' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 't2', next_empty_track_name: 'Piste 2'
    });
    timeline = addScene(timeline, { scene_id: 'A', name: 'A', start_frame: 0, duration_frames: 0.2 * RATE });
    timeline = addScene(timeline, { scene_id: 'B', name: 'B', start_frame: 0.2 * RATE, duration_frames: 0.2 * RATE });
    timeline = setCellSettings(timeline, { scene_id: 'A', settings: { quantize_start: 'off' } });
    const session = fakeSession();
    const engine = { getSession: () => session, createSession: () => session, disposeSession: async () => ({ ok: true }) };
    const cells = createMoleculeCellsRuntime({ env: {}, engine, readTimeline: () => timeline });
    const result = await cells.trigger({ groupId: 'm', timeline, cells: [{ scene_id: 'A', track_id: 'scene' }] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(await until(() => !cells.read('m').playing), 'Scene A then Scene B, then the end');
    const starts = session.calls.map((voice) => [voice.startRenderFrame, Number(voice.startSeconds.toFixed(3))]);
    assert.equal(starts.length, 2, JSON.stringify(starts));
    assert.equal(starts[1][0] - starts[0][0], 0.2 * RATE, 'Scene B starts on the exact end of Scene A');
    assert.deepEqual(starts.map(([, at]) => at), [0, 0.2]);

    timeline = setCellSettings(timeline, { scene_id: 'A', track_id: 't', settings: { play_mode: 'loop', passes: null, quantize_start: 'off', quantize_end: 'off' } });
    session.calls.length = 0;
    await cells.trigger({ groupId: 'm', timeline, cells: [{ scene_id: 'A', track_id: 't' }] });
    await wait(300);
    assert.equal(cells.read('m').cells.length, 1, 'an infinite Loop keeps playing');
    await cells.trigger({ groupId: 'm', timeline, cells: [{ scene_id: 'A', track_id: 't' }] });
    assert.ok(await until(() => !cells.read('m').playing, 500), 'a second press stops a Latch cell on the next frame it can');
});
