import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
    createProjectViewWindowState,
    loadProjectViewRecordsForPlayback
} from '../../eVe/domains/rendering/project_view_records.js';
import { createProjectViewPlaybackRuntime } from '../../eVe/domains/rendering/project_view_playback_runtime.js';
import {
    invalidatePlaybackMirrorIndex,
    playbackMirrorsFor
} from '../../eVe/domains/rendering/project_scene_invalidation_runtime.js';

const mediaRecord = (id) => ({
    id,
    type: 'sound',
    properties: { kind: 'sound', media_url: `/api/recordings/${id}.wav`, duration_sec: 0.001 }
});

test('playback loads every canonical page instead of only the visible List window', async () => {
    const records = Array.from({ length: 201 }, (_, index) => ({
        atome_id: `media_${index}`,
        atome_type: 'sound',
        meta: { project_id: 'project_paged_playback' },
        properties: { kind: 'sound', media_url: `/api/recordings/media_${index}.wav` }
    }));
    const result = await loadProjectViewRecordsForPlayback({
        projectId: 'project_paged_playback',
        readList: async (_projectId, options) => ({
            records: records.slice(options.offset, options.offset + options.limit),
            totalCount: records.length
        })
    });

    assert.equal(result.ok, true);
    assert.equal(result.records.length, 201);
    assert.equal(result.records.at(-1).id, 'media_200');
    assert.equal(createProjectViewWindowState().pageIndex, 0);
});

test('sequential playback starts and stops the final item of a complete queue', async () => {
    const started = [];
    const stopped = [];
    const runtime = createProjectViewPlaybackRuntime({
        runMediaAction: async ({ action, atomeIds }) => {
            const id = atomeIds[0];
            if (action === 'play') started.push(id);
            if (action === 'stop') stopped.push(id);
            return { ok: true };
        },
        readMediaDuration: () => 0.001,
        setTimer: (callback) => {
            queueMicrotask(callback);
            return 1;
        },
        clearTimer: () => {}
    });
    const children = Array.from({ length: 201 }, (_, index) => mediaRecord(`queue_${index}`));
    const result = await runtime.toggleLevel({
        level: { entity: 'project', id: 'project_queue' },
        projectId: 'project_queue',
        children,
        rule: { mode: 'sequential', loop: false }
    });
    assert.equal(result.ok, true);
    for (let attempt = 0; attempt < 300 && stopped.length < children.length; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(started.length, children.length);
    assert.equal(stopped.length, children.length);
    assert.equal(started.at(-1), 'queue_200');
    assert.equal(stopped.at(-1), 'queue_200');
    assert.deepEqual(runtime.readState(), { playing: false, scope: '', playingIds: [] });
});

test('a refused media start is stopped before its Visualizer id is removed or the queue advances', async () => {
    const calls = [];
    let runtime = null;
    runtime = createProjectViewPlaybackRuntime({
        runMediaAction: async ({ action, atomeIds }) => {
            const id = atomeIds[0];
            calls.push({ action, id, playingIds: runtime.readState().playingIds });
            if (action === 'play' && id === 'queue_refused') {
                return { ok: false, error: 'paired_transport_start_failed' };
            }
            return { ok: true };
        },
        readMediaDuration: () => 0.001,
        setTimer: (callback) => {
            queueMicrotask(callback);
            return 1;
        },
        clearTimer: () => {}
    });
    const result = await runtime.toggleLevel({
        level: { entity: 'project', id: 'project_atomic_queue' },
        projectId: 'project_atomic_queue',
        children: [mediaRecord('queue_refused'), mediaRecord('queue_next')],
        rule: { mode: 'sequential', loop: false }
    });
    assert.equal(result.ok, true);
    for (let attempt = 0; attempt < 20 && runtime.readState().playing; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(calls.slice(0, 3).map(({ action, id }) => `${action}:${id}`), [
        'play:queue_refused',
        'stop:queue_refused',
        'play:queue_next'
    ]);
    assert.deepEqual(calls[1].playingIds, ['queue_refused']);
    assert.equal(calls.some(({ action, id }) => action === 'stop' && id === 'queue_next'), true);
    assert.deepEqual(runtime.readState(), { playing: false, scope: '', playingIds: [] });
});

test('playback mirror invalidation follows A to B to C source replacement at stable projection ids', () => {
    const runtime = {
        project_revision: 7,
        records: new Map([['mirror', { properties: { playback_source_atome_id: 'audio_a' } }]])
    };
    assert.deepEqual(playbackMirrorsFor(runtime, 'audio_a'), ['mirror']);

    runtime.records.set('mirror', { properties: { playback_source_atome_id: 'audio_b' } });
    invalidatePlaybackMirrorIndex(runtime);
    assert.deepEqual(playbackMirrorsFor(runtime, 'audio_a'), []);
    assert.deepEqual(playbackMirrorsFor(runtime, 'audio_b'), ['mirror']);

    runtime.records.set('mirror', { properties: { playback_source_atome_id: 'audio_c' } });
    invalidatePlaybackMirrorIndex(runtime);
    assert.deepEqual(playbackMirrorsFor(runtime, 'audio_b'), []);
    assert.deepEqual(playbackMirrorsFor(runtime, 'audio_c'), ['mirror']);
});
