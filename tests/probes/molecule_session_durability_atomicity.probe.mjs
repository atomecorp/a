import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addTrack,
    createTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';

const createTimelineFixture = () => {
    let timeline = createTimeline({
        timeline_id: 'timeline_atomicity',
        project_id: 'project_atomicity',
        owner_atome_id: 'owner_atomicity'
    });
    timeline = addTrack(timeline, {
        track_id: 'track_audio',
        section_id: 'timeline_atomicity:section:1',
        kind: 'audio',
        name: 'Audio',
        order: 10
    });
    return addClip(timeline, {
        clip_id: 'clip_audio',
        track_id: 'track_audio',
        kind: 'audio',
        source: { type: 'atome', atome_id: 'audio_source' },
        timeline: {
            start_seconds: 0,
            duration_seconds: 4,
            source_in_seconds: 0,
            source_out_seconds: 4
        }
    });
};

const createControlledSink = () => {
    const events = [];
    let rejectNext = false;
    return {
        events,
        rejectOnce() {
            rejectNext = true;
        },
        async append(event) {
            if (rejectNext) {
                rejectNext = false;
                throw new Error('durable_append_failed');
            }
            events.push(structuredClone(event));
            return { ok: true, seq: events.length };
        }
    };
};

const createSessionFixture = () => {
    const eventSink = createControlledSink();
    let txIndex = 0;
    const session = createMoleculeSession({
        timeline: createTimelineFixture(),
        eventSink,
        txIdFactory: () => `tx_atomicity_${++txIndex}`
    });
    return { eventSink, session };
};

test('a rejected durable append leaves a single mutation and its history unchanged', async () => {
    const { eventSink, session } = createSessionFixture();
    eventSink.rejectOnce();

    await assert.rejects(() => session.apply('molecule.clip.move', {
        clip_id: 'clip_audio',
        start_seconds: 2
    }), /durable_append_failed/);

    assert.equal(session.getState().clips[0].timeline.start_seconds, 0);
    assert.deepEqual(session.getHistory(), { undo: [], redo: [] });
    assert.equal(eventSink.events.length, 0);
});

test('a rejected durable append leaves a batch and its history unchanged', async () => {
    const { eventSink, session } = createSessionFixture();
    eventSink.rejectOnce();

    await assert.rejects(() => session.applyBatch([
        {
            operation: 'molecule.clip.move',
            command: { clip_id: 'clip_audio', start_seconds: 2 }
        },
        {
            operation: 'molecule.transport.loop',
            command: { enabled: true, start_seconds: 1, end_seconds: 3 }
        }
    ]), /durable_append_failed/);

    assert.equal(session.getState().clips[0].timeline.start_seconds, 0);
    assert.equal(session.getState().transport.loop.enabled, false);
    assert.deepEqual(session.getHistory(), { undo: [], redo: [] });
    assert.equal(eventSink.events.length, 0);
});

test('rejected undo and redo history events preserve state and stack ownership', async () => {
    const { eventSink, session } = createSessionFixture();
    await session.apply('molecule.clip.move', {
        clip_id: 'clip_audio',
        start_seconds: 2
    });

    eventSink.rejectOnce();
    await assert.rejects(() => session.undo(), /durable_append_failed/);
    assert.equal(session.getState().clips[0].timeline.start_seconds, 2);
    assert.equal(session.canUndo(), true);
    assert.equal(session.canRedo(), false);

    await session.undo();
    eventSink.rejectOnce();
    await assert.rejects(() => session.redo(), /durable_append_failed/);
    assert.equal(session.getState().clips[0].timeline.start_seconds, 0);
    assert.equal(session.canUndo(), false);
    assert.equal(session.canRedo(), true);
});
