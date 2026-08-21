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
import {
    applyCaptureToTimeline,
    normalizeCapturedEvents
} from '../../eVe/domains/rendering/project_view_capture_to_timeline.js';
import {
    PERFORMANCE_MODE,
    hasUsablePerformanceClips,
    readPlaybackRuleOverride,
    resolvePlaybackRule,
    writePlaybackRuleOverride
} from '../../eVe/domains/rendering/project_view_playback_rules.js';
import {
    absorbCanonicalMolecule,
    deleteCanonicalMolecule,
    transformCanonicalMolecule,
    ungroupCanonicalMolecule
} from '../../eVe/intuition/tools/core/tool_runtime_atome_mutation.js';
import {
    PROJECT_VIEW_ABSORB_DELAY_MS,
    absorbInto,
    hasStationaryAbsorbOverlap,
    trackStationaryOverlap
} from '../../eVe/domains/rendering/project_view_reorder_runtime.js';
import { invokeFlowerMoleculeUngroup } from '../../eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js';

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

test('a queue jump restarts the chosen item and preserves the frozen random order', async () => {
    const calls = [];
    const timers = [];
    const runtime = createProjectViewPlaybackRuntime({
        runMediaAction: async ({ action, atomeIds }) => {
            calls.push(`${action}:${atomeIds[0]}`);
            return { ok: true };
        },
        readMediaDuration: () => 10,
        setTimer: (callback) => { timers.push(callback); return timers.length; },
        clearTimer: () => {},
        shuffle: (items) => [items[2], items[0], items[1]]
    });
    const children = ['a', 'b', 'c'].map(mediaRecord);
    await runtime.toggleLevel({
        level: { entity: 'project', id: 'jump_project' }, projectId: 'jump_project', children,
        rule: { mode: 'random', loop: false }
    });
    await Promise.resolve();
    const jumped = await runtime.jumpToChild({ atomeId: 'a' });
    await Promise.resolve();
    assert.equal(jumped.ok, true);
    assert.deepEqual(calls.slice(0, 3), ['play:c', 'stop:c', 'play:a']);
    await runtime.stop();
});

test('item-context Play starts the selected item, preserves a frozen queue, and toggles that item off', async () => {
    const calls = [];
    const timers = [];
    const runtime = createProjectViewPlaybackRuntime({
        runMediaAction: async ({ action, atomeIds }) => {
            calls.push(`${action}:${atomeIds[0]}`);
            return { ok: true };
        },
        readMediaDuration: () => 10,
        setTimer: (callback) => { timers.push(callback); return timers.length; },
        clearTimer: () => {},
        shuffle: (items) => [items[2], items[0], items[1]]
    });
    const children = ['a', 'b', 'c'].map(mediaRecord);
    await runtime.toggleLevel({
        level: { entity: 'project', id: 'item_context_project' }, projectId: 'item_context_project', children,
        rule: { mode: 'random', loop: false }
    });
    await Promise.resolve();
    const jumped = await runtime.playChild({ record: children[0], projectId: 'item_context_project' });
    await Promise.resolve();
    assert.equal(jumped.ok, true);
    assert.deepEqual(calls.slice(0, 3), ['play:c', 'stop:c', 'play:a']);
    const stopped = await runtime.playChild({ record: children[0], projectId: 'item_context_project' });
    assert.equal(stopped.stopped, true);
    assert.deepEqual(calls.slice(3), ['stop:a']);
});

test('item-context Play starts a still record through the project runtime instead of the global transport latch', async () => {
    const runtime = createProjectViewPlaybackRuntime({
        setTimer: () => 1,
        clearTimer: () => {}
    });
    const result = await runtime.playChild({
        record: { id: 'caption', type: 'text', properties: { kind: 'text' } },
        projectId: 'structured_project'
    });
    assert.deepEqual(result, {
        ok: true, playing: true, id: 'caption', kind: 'still', scope: 'trigger:caption'
    });
    await runtime.stop();
});

test('the structured playback facade returns to Play after completion and a failed start', async () => {
    const timers = [];
    const runtime = createProjectViewPlaybackRuntime({
        runMediaAction: async ({ action, atomeIds }) => ({ ok: action !== 'play' || atomeIds[0] !== 'failed_video' }),
        readMediaDuration: () => 0.001,
        setTimer: (callback) => { timers.push(callback); return timers.length; },
        clearTimer: () => {}
    });
    const video = mediaRecord('completed_video');
    await runtime.playChild({ record: video, projectId: 'facade_project' });
    assert.equal(runtime.isPlayingTarget({ record: video }), true);
    timers.at(-1)();
    for (let attempt = 0; attempt < 10 && runtime.isPlayingTarget({ record: video }); attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(runtime.isPlayingTarget({ record: video }), false);
    const failed = mediaRecord('failed_video');
    const failedResult = await runtime.playChild({ record: failed, projectId: 'facade_project' });
    assert.equal(failedResult.ok, false);
    assert.equal(runtime.isPlayingTarget({ record: failed }), false);
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

test('Record captures into the existing project owner without creating a child Molecule', async () => {
    const calls = [];
    const result = await applyCaptureToTimeline({
        projectId: 'project_root',
        events: [
            { atome_id: 'photo', at_seconds: 0, duration_seconds: 2 },
            { atome_id: 'photo', at_seconds: 2, duration_seconds: 1 },
            { atome_id: 'video', at_seconds: 3, duration_seconds: 4 }
        ],
        records: new Map([
            ['photo', { id: 'photo', type: 'image', properties: { kind: 'image' } }],
            ['video', { id: 'video', type: 'video', properties: { kind: 'video' } }]
        ]),
        api: {
            async openGroupTimeline(detail) {
                calls.push({ kind: 'open', detail });
                return { ok: true };
            },
            readGroupTimeline(detail) {
                calls.push({ kind: 'read', detail });
                return {
                    ok: true,
                    timeline: {
                        sections: [{ section_id: 'section_root' }],
                        tracks: [{
                            track_id: 'track_root', section_id: 'section_root', role: 'content', empty_slot: true
                        }],
                        clips: [{ clip_id: 'legacy_clip', track_id: 'track_root' }]
                    }
                };
            },
            async applyGroupTimelineBatch(detail) {
                calls.push({ kind: 'batch', detail });
                return { ok: true };
            }
        },
        nextId: (prefix) => `${prefix}_test`
    });

    assert.equal(result.ok, true);
    assert.equal(result.owner_atome_id, 'project_root');
    assert.deepEqual(calls[0].detail, {
        group_id: 'project_root', project_id: 'project_root', render_scene: false
    });
    const operations = calls.find((entry) => entry.kind === 'batch').detail.operations;
    const batch = calls.find((entry) => entry.kind === 'batch').detail;
    assert.deepEqual(operations[0], {
        operation: 'molecule.clip.delete', command: { clip_id: 'legacy_clip' }
    });
    const clips = operations.filter((entry) => entry.operation === 'molecule.clip.add');
    assert.equal(clips.length, 3);
    assert.deepEqual(clips.map((entry) => entry.command.source.atome_id), ['photo', 'photo', 'video']);
    assert.equal(clips.every((entry) => entry.command.timeline.source_in_seconds === 0), true);
    assert.deepEqual(batch.owner_properties, { playback_mode: PERFORMANCE_MODE });
    assert.equal(result.clip_ids.length, 3);
});

test('Record preserves repeated occurrence ordering at equal timestamps', () => {
    assert.deepEqual(normalizeCapturedEvents([
        { atome_id: 'video', at_seconds: 2, duration_seconds: 1 },
        { atome_id: 'photo', at_seconds: 2, duration_seconds: 1 },
        { atome_id: 'audio', at_seconds: 3, duration_seconds: 1 }
    ]).map((event) => event.atome_id), ['video', 'photo', 'audio']);
});

test('a performance marker without usable owner clips is an explicit playback error', async () => {
    const record = {
        properties: {
            playback_mode: PERFORMANCE_MODE,
            molecule_timeline: { clips: [{ clip_id: 'marker_only', source: {}, timeline: {} }] }
        }
    };
    assert.equal(hasUsablePerformanceClips(record), false);
    const rule = await resolvePlaybackRule({
        level: { entity: 'project', id: 'project_marker' },
        readRecord: async () => record
    });
    assert.equal(rule.mode, PERFORMANCE_MODE);
    assert.equal(rule.error, 'project_view_performance_clips_required');
});

test('Playback rules no longer persist child performance ownership', async () => {
    const writes = [];
    await writePlaybackRuleOverride({
        level: { entity: 'project', id: 'project_root' },
        rule: { mode: PERFORMANCE_MODE, performanceId: 'legacy_child' },
        updateProperties: async (atomeId, properties) => {
            writes.push({ atomeId, properties });
            return { ok: true };
        }
    });
    assert.deepEqual(writes, [{
        atomeId: 'project_root', properties: { playback_mode: PERFORMANCE_MODE }
    }]);
    assert.deepEqual(readPlaybackRuleOverride({
        properties: { playback_mode: PERFORMANCE_MODE, playback_performance_id: 'legacy_child' }
    }, { entity: 'project', id: 'project_root' }), { mode: PERFORMANCE_MODE });
});

const moleculeState = (id, parentId = 'project_molecules', properties = {}) => ({
    atome_id: id,
    type: 'group',
    project_id: 'project_molecules',
    parent_id: parentId,
    properties: { kind: 'group', ...properties }
});
const atomeState = (id, parentId = 'project_molecules', properties = {}) => ({
    atome_id: id,
    type: 'shape',
    project_id: 'project_molecules',
    parent_id: parentId,
    properties
});
const mutationDependencies = (records, batches) => ({
    readList: async () => records,
    commitBatch: async (events, options) => {
        batches.push({ events, options });
        return { ok: true };
    }
});

test('canonical absorb creates, absorbs, and flattens Molecules through direct parent_id mutations', async () => {
    const batches = [];
    const atomPair = await absorbCanonicalMolecule({
        projectId: 'project_molecules', sourceId: 'source', targetId: 'target'
    }, mutationDependencies([
        atomeState('source'), atomeState('target', 'project_molecules', { left: '20px', top: '30px' })
    ], batches));
    assert.equal(atomPair.ok, true);
    assert.equal(atomPair.operation, 'create');
    assert.equal(batches[0].events[0].parent_id, 'project_molecules');
    assert.equal(batches[0].events.slice(1).every((event) => event.parent_id === atomPair.molecule_id), true);

    const intoMolecule = await absorbCanonicalMolecule({
        projectId: 'project_molecules', sourceId: 'atom', targetId: 'molecule_target'
    }, mutationDependencies([atomeState('atom'), moleculeState('molecule_target')], batches));
    assert.equal(intoMolecule.operation, 'absorb');
    assert.deepEqual(batches[1].events.at(-1), {
        atome_id: 'atom', project_id: 'project_molecules', parent_id: 'molecule_target', props: {}
    });
    assert.equal(batches[1].events[0].props.molecule_timeline.clips[0].source.atome_id, 'atom');

    const moleculeOntoAtom = await absorbCanonicalMolecule({
        projectId: 'project_molecules', sourceId: 'molecule_source', targetId: 'atom_target'
    }, mutationDependencies([
        moleculeState('molecule_source'), atomeState('atom_target', 'project_molecules', { left: '40px', top: '50px' })
    ], batches));
    assert.equal(moleculeOntoAtom.operation, 'absorb');
    assert.deepEqual(batches[2].events.slice(1), [
        { atome_id: 'atom_target', project_id: 'project_molecules', parent_id: 'molecule_source', props: {} }
    ]);
    assert.equal(batches[2].events[0].props.molecule_timeline.clips[0].source.atome_id, 'atom_target');

    const merge = await absorbCanonicalMolecule({
        projectId: 'project_molecules', sourceId: 'molecule_source', targetId: 'molecule_target'
    }, mutationDependencies([
        moleculeState('molecule_source'), moleculeState('molecule_target'), atomeState('child_a', 'molecule_source')
    ], batches));
    assert.equal(merge.operation, 'merge');
    assert.deepEqual(batches[3].events.slice(1), [
        { atome_id: 'child_a', project_id: 'project_molecules', parent_id: 'molecule_target', props: {} },
        { kind: 'delete', atome_id: 'molecule_source', project_id: 'project_molecules', props: {} }
    ]);
    assert.equal(batches[3].events[0].props.molecule_timeline.clips[0].source.atome_id, 'child_a');
});

test('canonical ungroup and delete operate on direct members in one history transaction', async () => {
    const batches = [];
    const ungrouped = await ungroupCanonicalMolecule({
        projectId: 'project_molecules', moleculeId: 'molecule'
    }, mutationDependencies([
        moleculeState('molecule', 'outer_molecule'), atomeState('one', 'molecule'), atomeState('two', 'molecule')
    ], batches));
    assert.equal(ungrouped.ok, true);
    assert.deepEqual(batches[0].events, [
        { atome_id: 'one', project_id: 'project_molecules', parent_id: 'outer_molecule', props: {} },
        { atome_id: 'two', project_id: 'project_molecules', parent_id: 'outer_molecule', props: {} },
        { kind: 'delete', atome_id: 'molecule', project_id: 'project_molecules', props: {} }
    ]);

    const deleted = await deleteCanonicalMolecule({
        projectId: 'project_molecules', moleculeId: 'molecule'
    }, mutationDependencies([
        moleculeState('molecule'), atomeState('one', 'molecule'), atomeState('two', 'molecule')
    ], batches));
    assert.equal(deleted.ok, true);
    assert.deepEqual(batches[1].events, [
        { kind: 'delete', atome_id: 'one', project_id: 'project_molecules', props: {} },
        { kind: 'delete', atome_id: 'two', project_id: 'project_molecules', props: {} },
        { kind: 'delete', atome_id: 'molecule', project_id: 'project_molecules', props: {} }
    ]);
});

test('List and Matrix stationary overlap routes to the shared canonical Molecule command after 500ms', async () => {
    const session = { hoverId: '' };
    trackStationaryOverlap(session, 'target', 100);
    assert.equal(hasStationaryAbsorbOverlap(session, 'target', 100 + PROJECT_VIEW_ABSORB_DELAY_MS - 1), false);
    assert.equal(hasStationaryAbsorbOverlap(session, 'target', 100 + PROJECT_VIEW_ABSORB_DELAY_MS), true);
    trackStationaryOverlap(session, 'different_target', 900);
    assert.equal(hasStationaryAbsorbOverlap(session, 'target', 1400), false);

    const calls = [];
    const result = await absorbInto({
        projectId: 'project_molecules', sourceId: 'source', targetId: 'target',
        absorb: async (input) => {
            calls.push(input);
            return { ok: true, operation: 'merge' };
        }
    });
    assert.equal(result.operation, 'merge');
    assert.deepEqual(calls, [{ projectId: 'project_molecules', sourceId: 'source', targetId: 'target' }]);
});

test('Flower contextual Ungroup routes the selected Molecule to the canonical transaction', async () => {
    const calls = [];
    const result = await invokeFlowerMoleculeUngroup({
        projectId: 'project_molecules', moleculeId: 'molecule_context',
        ungroup: async (input) => {
            calls.push(input);
            return { ok: true, member_ids: ['child'] };
        }
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [{ projectId: 'project_molecules', moleculeId: 'molecule_context' }]);
});

test('Natural Molecule transforms expand proportionally to direct members in one canonical batch', async () => {
    const batches = [];
    const result = await transformCanonicalMolecule({
        projectId: 'project_molecules', moleculeId: 'molecule',
        props: { left: 20, top: 30, width: 200, height: 100, rotation: 20 }
    }, mutationDependencies([
        moleculeState('molecule', 'project_molecules', { left: 10, top: 20, width: 100, height: 50, rotation: 10 }),
        atomeState('child', 'molecule', { left: 30, top: 30, width: 20, height: 10, rotation: 5 })
    ], batches));
    assert.equal(result.ok, true);
    assert.deepEqual(batches[0].events, [
        { atome_id: 'molecule', project_id: 'project_molecules', props: { left: 20, top: 30, width: 200, height: 100, rotation: 20 } },
        { atome_id: 'child', project_id: 'project_molecules', props: { left: 60, top: 50, width: 40, height: 20, rotation: 15 } }
    ]);
});
