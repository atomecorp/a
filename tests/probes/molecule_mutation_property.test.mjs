import assert from 'node:assert/strict';
import test from 'node:test';

import {
    moveClip,
    resizeClip,
    setClipBlockLoop,
    setMetronome,
    setPlayhead,
    setQuantization,
    setTempo,
    updateTrack,
    validateTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { reloadMoleculeTimeline } from '../../eVe/intuition/tools/molecule/persistence/index.js';
import { createMoleculeSessionRegistry } from '../../eVe/intuition/tools/molecule/session/index.js';
import { createMoleculeStores } from '../../eVe/intuition/runtime/molecule_stores.js';
import {
    cloneFixture,
    createMinimalMoleculeFixture,
    createRichMoleculeFixture
} from '../fixtures/molecule/canonical_v2_fixtures.mjs';

const createRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
};

const quantizations = Object.freeze(['off', 'bar', 'beat', '1/4beat', '1/16beat']);

const mutate = (timeline, random, step) => {
    const clips = timeline.clips;
    const clip = clips[Math.floor(random() * clips.length)];
    const track = timeline.tracks.find((entry) => entry.track_id === clip.track_id);
    switch (step % 7) {
    case 0:
        return moveClip(timeline, {
            clip_id: clip.clip_id,
            start_seconds: Math.round(random() * 800) / 100
        });
    case 1: {
        const end = clip.timeline.start_seconds + 4.25 + Math.round(random() * 200) / 100;
        return resizeClip(timeline, { clip_id: clip.clip_id, edge: 'end', value_seconds: end });
    }
    case 2:
        return setClipBlockLoop(timeline, {
            clip_id: clip.clip_id,
            enabled: true,
            duration_frames: clip.timeline.duration_frames * (1 + Math.floor(random() * 4))
        });
    case 3:
        return setPlayhead(timeline, { playhead_seconds: Math.round(random() * 1200) / 100 });
    case 4:
        return setQuantization(timeline, {
            quantization: quantizations[Math.floor(random() * quantizations.length)]
        });
    case 5:
        return setMetronome(timeline, {
            enabled: random() >= 0.5,
            pre_roll_bars: Math.floor(random() * 5)
        });
    default:
        return step % 14 === 6
            ? setTempo(timeline, {
                start_seconds: Math.floor(random() * 8),
                tempo: 60 + Math.floor(random() * 121),
                beats_per_bar: random() >= 0.5 ? 4 : 3,
                beat_unit: 4
            })
            : updateTrack(timeline, { track_id: track.track_id, mute: random() >= 0.5 });
    }
};

const assertSnapshotInvariants = (timeline) => {
    validateTimeline(timeline);
    assert.equal(timeline.schema_version, 2);
    assert.equal(new Set(timeline.clips.map((clip) => clip.clip_id)).size, timeline.clips.length);
    for (const section of timeline.sections) {
        const tracks = timeline.tracks
            .filter((track) => track.section_id === section.section_id)
            .sort((left, right) => left.order - right.order);
        assert.equal(tracks.filter((track) => track.empty_slot).length, 1);
        assert.equal(tracks.at(-1).empty_slot, true);
    }
    timeline.clips.forEach((clip) => {
        assert.equal(clip.timeline.start_frame, Math.round(clip.timeline.start_seconds * timeline.timebase.sample_rate));
        assert.equal(clip.timeline.duration_frame, undefined);
        assert.equal(clip.timeline.duration_frames, Math.round(clip.timeline.duration_seconds * timeline.timebase.sample_rate));
    });
};

test('deterministic mutation sequences preserve every v2 snapshot invariant', () => {
    for (let seed = 1; seed <= 32; seed += 1) {
        const random = createRandom(seed);
        let timeline = createRichMoleculeFixture();
        for (let step = 0; step < 100; step += 1) {
            const previous = timeline;
            const before = cloneFixture(previous);
            timeline = mutate(previous, random, step);
            assert.deepEqual(previous, before, 'reducers must not mutate their input snapshot');
            assert.notEqual(timeline, previous);
            assertSnapshotInvariants(timeline);
        }
    }
});

test('save and reopen preserve the canonical snapshot exactly and reject historical data', async () => {
    const stateByAtome = new Map();
    const atome = {
        async commit(event) {
            stateByAtome.set(event.atome_id, cloneFixture(event.payload.props));
        },
        async getStateCurrent(atomeId) {
            return cloneFixture(stateByAtome.get(atomeId) || null);
        }
    };
    const { projectStore } = createMoleculeStores({ atome, bus: null });
    const timeline = {
        ...createRichMoleculeFixture(),
        timeline_id: 'tl_fixture_rich_owner'
    };
    await projectStore.saveTimeline(timeline.project_id, timeline);
    const reopened = await reloadMoleculeTimeline({
        projectStore,
        projectId: timeline.project_id,
        timelineId: timeline.timeline_id
    });
    assert.deepEqual(reopened, timeline);

    stateByAtome.set(timeline.owner_atome_id, {
        molecule_timeline: { ...timeline, schema_version: 1 }
    });
    await assert.rejects(
        () => reloadMoleculeTimeline({
            projectStore,
            projectId: timeline.project_id,
            timelineId: timeline.timeline_id
        }),
        (error) => error.code === 'molecule_persistence/reload_rejected'
    );
});

test('the session registry rejects concurrent ownership of one timeline and isolates distinct Molecules', async () => {
    const events = [];
    const registry = createMoleculeSessionRegistry({
        eventSink: { async append(event) { events.push(event); } }
    });
    const firstTimeline = createMinimalMoleculeFixture({ timelineId: 'concurrent_first' });
    const secondTimeline = createMinimalMoleculeFixture({ timelineId: 'concurrent_second' });
    const first = registry.open({ timeline: firstTimeline });
    assert.throws(() => registry.open({ timeline: firstTimeline }), /already open/);
    const second = registry.open({ timeline: secondTimeline });

    await first.apply('molecule.transport.playhead', { playhead_seconds: 3 });
    assert.equal(first.getState().transport.playhead_seconds, 3);
    assert.equal(second.getState().transport.playhead_seconds, 0);
    assert.equal(events.length, 1);
});
