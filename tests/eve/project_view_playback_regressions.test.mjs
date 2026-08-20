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

test('a durationless video advances after its media owner reports natural completion', async () => {
    const calls = [];
    const active = new Set();
    const runtime = createProjectViewPlaybackRuntime({
        runMediaAction: async ({ action, atomeIds }) => {
            const id = atomeIds[0];
            calls.push(`${action}:${id}`);
            if (action === 'play') active.add(id);
            if (action === 'stop') active.delete(id);
            return { ok: true };
        },
        readMediaState: (ids) => ({ anyPlaying: ids.some((id) => active.has(id)) }),
        readMediaDuration: (record) => record.id === 'queue_after_whatsapp' ? 0.001 : null,
        setTimer: (callback, delayMs) => {
            if (delayMs === 250 && active.has('whatsapp_without_duration')) {
                active.delete('whatsapp_without_duration');
            }
            queueMicrotask(callback);
            return 1;
        },
        clearTimer: () => {}
    });
    const whatsapp = {
        id: 'whatsapp_without_duration',
        type: 'video',
        properties: {
            kind: 'video',
            media_url: '/api/uploads/WhatsApp_Video_2026-04-28_at_21.27.38.mp4'
        }
    };
    const result = await runtime.toggleLevel({
        level: { entity: 'project', id: 'project_whatsapp_queue' },
        projectId: 'project_whatsapp_queue',
        children: [whatsapp, mediaRecord('queue_after_whatsapp')],
        rule: { mode: 'sequential', loop: false }
    });
    assert.equal(result.ok, true);
    for (let attempt = 0; attempt < 20 && runtime.readState().playing; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(calls, [
        'play:whatsapp_without_duration',
        'stop:whatsapp_without_duration',
        'play:queue_after_whatsapp',
        'stop:queue_after_whatsapp'
    ]);
    assert.deepEqual(runtime.readState(), { playing: false, scope: '', playingIds: [] });
});

test('manual Stop releases a durationless video and resets the transport state', async () => {
    const calls = [];
    let pendingTimer = null;
    const runtime = createProjectViewPlaybackRuntime({
        runMediaAction: async ({ action, atomeIds }) => {
            calls.push(`${action}:${atomeIds[0]}`);
            return { ok: true };
        },
        readMediaState: () => ({ anyPlaying: true }),
        readMediaDuration: () => null,
        setTimer: (callback) => {
            pendingTimer = callback;
            return 1;
        },
        clearTimer: () => { pendingTimer = null; }
    });
    const level = { entity: 'project', id: 'project_manual_video_stop' };
    const children = [{
        id: 'durationless_manual_stop',
        type: 'video',
        properties: { kind: 'video', media_url: '/api/uploads/manual-stop.mp4' }
    }];
    await runtime.toggleLevel({ level, projectId: level.id, children, rule: { mode: 'sequential', loop: false } });
    const stopped = await runtime.toggleLevel({ level, projectId: level.id, children, rule: { mode: 'sequential', loop: false } });
    assert.equal(stopped.playing, false);
    assert.equal(pendingTimer, null);
    assert.deepEqual(calls, ['play:durationless_manual_stop', 'stop:durationless_manual_stop']);
    assert.deepEqual(runtime.readState(), { playing: false, scope: '', playingIds: [] });
});

test('loop playback can leave and re-enter a durationless video without retaining its prior session', async () => {
    const calls = [];
    const active = new Set();
    const runtime = createProjectViewPlaybackRuntime({
        runMediaAction: async ({ action, atomeIds }) => {
            const id = atomeIds[0];
            calls.push(`${action}:${id}`);
            if (action === 'play') active.add(id);
            if (action === 'stop') active.delete(id);
            return { ok: true };
        },
        readMediaState: (ids) => ({ anyPlaying: ids.some((id) => active.has(id)) }),
        readMediaDuration: () => null,
        setTimer: (callback) => {
            const handle = setImmediate(() => {
                active.clear();
                callback();
            });
            return handle;
        },
        clearTimer: (handle) => clearImmediate(handle)
    });
    const level = { entity: 'project', id: 'project_loop_video_end' };
    const children = [{
        id: 'durationless_loop_video',
        type: 'video',
        properties: { kind: 'video', media_url: '/api/uploads/loop-video.mp4' }
    }];
    await runtime.toggleLevel({ level, projectId: level.id, children, rule: { mode: 'random', loop: true } });
    for (let attempt = 0; attempt < 20 && calls.filter((entry) => entry.startsWith('play:')).length < 2; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    await runtime.stop();
    assert.equal(calls.filter((entry) => entry === 'play:durationless_loop_video').length >= 2, true);
    assert.equal(calls.filter((entry) => entry === 'stop:durationless_loop_video').length >= 2, true);
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
