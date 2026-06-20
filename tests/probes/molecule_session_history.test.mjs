import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addTrack,
    createTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';
import { createMoleculePersistenceController } from '../../eVe/intuition/tools/molecule/persistence/index.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createEventSink = () => {
    const events = [];
    return {
        events,
        async append(event) {
            events.push(clone(event));
            return { ok: true, seq: events.length, tx_id: event.tx_id };
        }
    };
};

const createFixtureTimeline = () => {
    let timeline = createTimeline({
        timeline_id: 'timeline_history',
        project_id: 'project_history',
        owner_atome_id: 'group_history'
    });
    timeline = addTrack(timeline, {
        track_id: 'track_video',
        kind: 'video',
        name: 'Video',
        order: 10
    });
    return addClip(timeline, {
        clip_id: 'clip_video',
        track_id: 'track_video',
        kind: 'video',
        source: { type: 'atome', atome_id: 'video_source' },
        timeline: {
            start_seconds: 0,
            duration_seconds: 8,
            source_in_seconds: 0,
            source_out_seconds: 8
        }
    });
};

test('Molecule session undo and redo restore durable clip operations', async () => {
    const eventSink = createEventSink();
    const persisted = [];
    const session = createMoleculeSession({
        timeline: createFixtureTimeline(),
        eventSink,
        txIdFactory: (() => {
            let index = 0;
            return () => `tx_${++index}`;
        })(),
        now: () => '2026-05-23T00:00:00.000Z',
        onStateCommitted: async (timeline, detail) => {
            persisted.push({ timeline, detail });
        }
    });

    await session.apply('molecule.clip.move', {
        clip_id: 'clip_video',
        start_seconds: 3
    });
    assert.equal(session.getState().clips[0].timeline.start_seconds, 3);
    assert.equal(session.canUndo(), true);
    assert.equal(session.canRedo(), false);

    const undo = await session.undo();
    assert.equal(undo.ok, true);
    assert.equal(session.getState().clips[0].timeline.start_seconds, 0);
    assert.equal(session.canUndo(), false);
    assert.equal(session.canRedo(), true);

    const redo = await session.redo();
    assert.equal(redo.ok, true);
    assert.equal(session.getState().clips[0].timeline.start_seconds, 3);
    assert.equal(session.canUndo(), true);
    assert.equal(session.canRedo(), false);

    assert.deepEqual(eventSink.events.map((event) => event.event_type), [
        'molecule.clip.move',
        'molecule.history.undo',
        'molecule.history.redo'
    ]);
    assert.equal(eventSink.events[1].timeline_snapshot.clips[0].timeline.start_seconds, 0);
    assert.equal(eventSink.events[2].timeline_snapshot.clips[0].timeline.start_seconds, 3);
    assert.deepEqual(persisted.map((entry) => entry.detail.operation), [
        'molecule.clip.move',
        'molecule.history.undo',
        'molecule.history.redo'
    ]);
});

test('Molecule persistence controller saves undo and redo snapshots', async () => {
    const eventSink = createEventSink();
    const saved = [];
    const projectStore = {
        async saveTimeline(projectId, timeline) {
            saved.push({ projectId, timeline: clone(timeline) });
            return { ok: true };
        },
        async loadTimeline() {
            return createFixtureTimeline();
        }
    };
    const session = createMoleculeSession({
        timeline: createFixtureTimeline(),
        eventSink,
        txIdFactory: (() => {
            let index = 0;
            return () => `tx_persist_${++index}`;
        })()
    });
    const persistence = createMoleculePersistenceController({
        session,
        projectStore,
        now: () => '2026-05-23T00:00:00.000Z'
    });

    await persistence.applyAndPersist('molecule.clip.resize', {
        clip_id: 'clip_video',
        edge: 'end',
        value_seconds: 5
    });
    assert.equal(saved.at(-1).timeline.clips[0].timeline.duration_seconds, 5);

    await persistence.undoAndPersist();
    assert.equal(saved.at(-1).timeline.clips[0].timeline.duration_seconds, 8);

    await persistence.redoAndPersist();
    assert.equal(saved.at(-1).timeline.clips[0].timeline.duration_seconds, 5);
});

test('Molecule session batch is atomic and creates one undo point', async () => {
    const eventSink = createEventSink();
    const session = createMoleculeSession({
        timeline: createFixtureTimeline(),
        eventSink,
        txIdFactory: (() => {
            let index = 0;
            return () => `tx_batch_${++index}`;
        })()
    });

    const result = await session.applyBatch([
        {
            operation: 'molecule.clip.move',
            command: { clip_id: 'clip_video', start_seconds: 2 }
        },
        {
            operation: 'molecule.transport.loop',
            command: { enabled: true, start_seconds: 2, end_seconds: 5 }
        }
    ], { label: 'move and loop' });

    assert.equal(result.ok, true);
    assert.equal(result.tx_id, 'tx_batch_1');
    assert.equal(eventSink.events.length, 1);
    assert.equal(eventSink.events[0].event_type, 'molecule.batch');
    assert.equal(eventSink.events[0].command.operations.length, 2);
    assert.equal(session.getHistory().undo.length, 1);
    assert.equal(session.getState().clips[0].timeline.start_seconds, 2);
    assert.equal(session.getState().transport.loop.enabled, true);

    await session.undo();
    assert.equal(session.getState().clips[0].timeline.start_seconds, 0);
    assert.equal(session.getState().transport.loop.enabled, false);
});

test('Molecule session batch rejects invalid operations without partial state', async () => {
    const eventSink = createEventSink();
    const session = createMoleculeSession({
        timeline: createFixtureTimeline(),
        eventSink
    });

    await assert.rejects(() => session.applyBatch([
        {
            operation: 'molecule.clip.move',
            command: { clip_id: 'clip_video', start_seconds: 2 }
        },
        {
            operation: 'molecule.clip.move',
            command: { clip_id: 'clip_missing', start_seconds: 4 }
        }
    ]), /clip clip_missing not found/);

    assert.equal(eventSink.events.length, 0);
    assert.equal(session.getHistory().undo.length, 0);
    assert.equal(session.getState().clips[0].timeline.start_seconds, 0);
});

test('Molecule session timeline verbs expose clipboard edits through one undo point', async () => {
    const eventSink = createEventSink();
    const session = createMoleculeSession({
        timeline: createFixtureTimeline(),
        eventSink,
        txIdFactory: (() => {
            let index = 0;
            return () => `tx_clipboard_${++index}`;
        })()
    });

    const copied = session.copyClips({ clip_id: 'clip_video' });
    assert.equal(copied.ok, true);
    assert.equal(copied.count, 1);
    assert.equal(eventSink.events.length, 0);

    const pasted = await session.applyTimelineOperation('eve.timeline.clip.paste', {
        start_seconds: 10,
        new_clip_ids: ['clip_video_copy']
    });
    assert.equal(pasted.ok, true);
    assert.equal(pasted.tx_id, 'tx_clipboard_1');
    assert.equal(session.getState().clips.some((clip) => clip.clip_id === 'clip_video_copy'), true);

    const cut = await session.applyTimelineOperation('ui.timeline.clip.cut', {
        clip_id: 'clip_video_copy'
    });
    assert.equal(cut.ok, true);
    assert.equal(cut.clipboard_count, 1);
    assert.equal(session.getState().clips.some((clip) => clip.clip_id === 'clip_video_copy'), false);

    const duplicated = await session.applyTimelineOperation('eve.timeline.clip.duplicate', {
        clip_id: 'clip_video',
        start_seconds: 12,
        new_clip_ids: ['clip_video_dup']
    });
    assert.equal(duplicated.ok, true);
    assert.equal(session.getState().clips.some((clip) => clip.clip_id === 'clip_video_dup'), true);
    assert.deepEqual(eventSink.events.map((event) => event.event_type), [
        'molecule.batch',
        'molecule.batch',
        'molecule.batch'
    ]);
    assert.equal(session.getHistory().undo.length, 3);
});
