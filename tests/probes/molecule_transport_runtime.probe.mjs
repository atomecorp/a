import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildTransportTimeline,
    createMoleculeTransportRuntime
} from '../../eVe/intuition/tools/molecule/runtime_transport.js';
import { addClip, addSection, createTimeline, setClipBlockLoop, updateSection, updateTrack } from '../../eVe/intuition/tools/molecule/kernel/index.js';

const createTransportFixture = () => {
    let timeline = createTimeline({
        timeline_id: 'tl_transport', project_id: 'project_transport', owner_atome_id: 'molecule_transport',
        initial_section_id: 'section_a', initial_track_id: 'track_a'
    });
    timeline = updateSection(timeline, { section_id: 'section_a', duration_frames: 96000 });
    timeline = addClip(timeline, {
        clip_id: 'clip_a', track_id: 'track_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'audio_a' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'track_a_empty', next_empty_track_name: 'Piste 2'
    });
    timeline = addSection(timeline, {
        section_id: 'section_b', name: 'Section 2', duration_frames: 48000,
        initial_track_id: 'track_b', initial_track_name: 'Piste 1'
    });
    timeline = addClip(timeline, {
        clip_id: 'clip_b', track_id: 'track_b', kind: 'audio',
        source: { type: 'atome', atome_id: 'audio_b' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'track_b_empty', next_empty_track_name: 'Piste 2'
    });
    return timeline;
};

const env = {
    Atome: {
        getStateCurrent: async (id) => ({
            id, properties: { kind: 'audio', media_url: `/api/uploads/${id}.wav` }
        })
    }
};

test('transport projection unfolds Sections left-to-right and scopes Section playback', async () => {
    const timeline = updateTrack(createTransportFixture(), { track_id: 'track_a', gain: 1.35, pan: -0.4 });
    const molecule = await buildTransportTimeline(env, timeline);
    assert.equal(molecule.duration, 3);
    assert.deepEqual(molecule.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip.start]), [
        ['clip_a', 0], ['clip_b', 2]
    ]);
    assert.deepEqual([molecule.tracks[0].gain, molecule.tracks[0].pan], [1.35, -0.4]);
    const section = await buildTransportTimeline(env, timeline, { section_id: 'section_b' });
    assert.deepEqual(section.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip.start]), [
        ['clip_b', 0]
    ]);
});

test('List transport chains Molecules in order and toggles the shared sequence session', async () => {
    const sessions = new Map();
    let projected = null;
    const engine = {
        getSession: (id) => sessions.get(id) || null,
        createSession: ({ id }) => {
            const session = {
                async setTimeline(timeline) { projected = timeline; },
                async play() {}, async stop() {}, async dispose() {}
            };
            sessions.set(id, session);
            return session;
        },
        async disposeSession() { return { ok: true }; }
    };
    const runtime = createMoleculeTransportRuntime({ env, engine });
    const first = createTransportFixture();
    const second = createTransportFixture();
    const started = await runtime.toggleSequence({ items: [
        { groupId: 'molecule_a', timeline: first },
        { groupId: 'molecule_b', timeline: second }
    ] });
    assert.equal(started.duration, 6);
    assert.deepEqual(started.offsets.map(({ group_id, start_seconds }) => [group_id, start_seconds]), [
        ['molecule_a', 0], ['molecule_b', 3]
    ]);
    assert.ok(projected.tracks.every((track) => track.id.startsWith('molecule_')));
    assert.equal(Math.max(...projected.tracks.flatMap((track) => track.clips).map((clip) => clip.start)), 5);
    assert.equal((await runtime.toggleSequence({ items: [] })).playing, false);
});

test('one Molecule transport replaces its active scope and toggles Stop', async () => {
    const sessions = new Map();
    const calls = [];
    const engine = {
        getSession: (id) => sessions.get(id) || null,
        createSession: ({ id }) => {
            const session = {
                async setTimeline(timeline) { calls.push(['set', timeline.selected_track_ids]); },
                async play() { calls.push(['play']); },
                async stop() { calls.push(['stop']); },
                async dispose() { calls.push(['dispose']); }
            };
            sessions.set(id, session);
            return session;
        },
        async disposeSession(id) {
            const session = sessions.get(id);
            sessions.delete(id);
            return session?.dispose() || { ok: true };
        }
    };
    const runtime = createMoleculeTransportRuntime({ env, engine });
    const timeline = createTransportFixture();
    assert.equal((await runtime.toggle({ groupId: 'molecule_transport', timeline })).playing, true);
    assert.equal((await runtime.toggle({
        groupId: 'molecule_transport', timeline, sectionId: 'section_a'
    })).scope, 'section:section_a');
    assert.equal((await runtime.toggle({
        groupId: 'molecule_transport', timeline, sectionId: 'section_a'
    })).playing, false);
    assert.deepEqual(calls.map((entry) => entry[0]), ['set', 'play', 'stop', 'set', 'play', 'stop']);
});

test('transport expands a block loop into repeated reads of one source', async () => {
    let timeline = updateTrack(createTransportFixture(), { track_id: 'track_b', continue_beyond_section: true });
    timeline = setClipBlockLoop(timeline, {
        clip_id: 'clip_b', enabled: true, duration_frames: 120000
    });
    const projected = await buildTransportTimeline(env, timeline, { section_id: 'section_b' });
    assert.deepEqual(projected.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip.start, clip.duration]), [
        ['clip_b', 0, 1], ['clip_b:loop:1', 1, 1], ['clip_b:loop:2', 2, 0.5]
    ]);
});

test('transport virtually clips Track overflow unless continuation is enabled', async () => {
    let timeline = setClipBlockLoop(createTransportFixture(), {
        clip_id: 'clip_b', enabled: true, duration_frames: 120000
    });
    let projected = await buildTransportTimeline(env, timeline, { section_id: 'section_b' });
    assert.equal(projected.duration, 1);
    timeline = updateTrack(timeline, { track_id: 'track_b', continue_beyond_section: true });
    projected = await buildTransportTimeline(env, timeline, { section_id: 'section_b' });
    assert.equal(projected.duration, 2.5);
});

test('independent Track loop points repeat content to the Section boundary', async () => {
    let timeline = createTransportFixture();
    timeline = updateTrack(timeline, {
        track_id: 'track_a',
        loop: { enabled: true, start_frame: 0, end_frame: 48000, repeat_count: null }
    });
    const projected = await buildTransportTimeline(env, timeline, { section_id: 'section_a', track_id: 'track_a' });
    assert.deepEqual(projected.tracks[0].clips.map((clip) => [clip.id, clip.start, clip.duration]), [
        ['clip_a', 0, 1], ['clip_a:track-loop:1', 1, 1]
    ]);
});
