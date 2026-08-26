import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {}
    }
});
Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
        localStorage: globalThis.localStorage,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true
    }
});

const {
    createProjectViewWindowState,
    loadProjectViewRecordsForPlayback
} = await import('../../eVe/domains/rendering/project_view_records.js');
const { createProjectViewPlaybackRuntime } = await import('../../eVe/domains/rendering/project_view_playback_runtime.js');
const {
    invalidatePlaybackMirrorIndex,
    playbackMirrorsFor
} = await import('../../eVe/domains/rendering/project_scene_invalidation_runtime.js');
const {
    applyCaptureToTimeline,
    normalizeCapturedEvents
} = await import('../../eVe/domains/rendering/project_view_capture_to_timeline.js');
const {
    PERFORMANCE_MODE,
    hasUsablePerformanceClips,
    readPlaybackRuleOverride,
    resolvePlaybackRule,
    writePlaybackRuleOverride
} = await import('../../eVe/domains/rendering/project_view_playback_rules.js');
const {
    absorbCanonicalMolecule,
    buildCanonicalMoleculeTimeline,
    deleteCanonicalMolecule,
    extractCanonicalMoleculeMember,
    transformCanonicalMolecule,
    ungroupCanonicalMolecule
} = await import('../../eVe/intuition/tools/core/tool_runtime_atome_mutation.js');
const {
    PROJECT_VIEW_ABSORB_DELAY_MS,
    absorbInto,
    armStationaryAbsorb,
    clearStationaryAbsorb,
    hasStationaryAbsorbOverlap,
    orderedIdsAfterInsertion,
    persistLevelOrder,
    reconcilePendingLevelOrder,
    beginPendingLevelOrder,
    resolveStructuredDropIntent
} = await import('../../eVe/domains/rendering/project_view_reorder_runtime.js');
const { followSelectionWhilePlaying } = await import('../../eVe/domains/rendering/project_view_playback_follow.js');
const { invokeFlowerMoleculeUngroup } = await import('../../eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js');
const {
    deleteMoleculeContextualOwner,
    playMoleculeContextualOwner
} = await import('../../eVe/domains/rendering/project_view_molecule_info.js');
const { clipKindFor } = await import('../../eVe/intuition/tools/molecule/runtime_creation.js');
const {
    resolveRecordCompositePreviewLayout
} = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_record_composite_preview.js');
const { resolveProjectViewVisualSubject } = await import('../../eVe/domains/rendering/project_view_visual_subject.js');

const mediaRecord = (id) => ({
    id,
    type: 'sound',
    properties: { kind: 'sound', media_url: `/api/recordings/${id}.wav`, duration_sec: 0.001 }
});

test('Natural mode retains the canonical video mirror resolver after structured view teardown', () => {
    const source = fs.readFileSync(new URL(
        '../../eVe/domains/rendering/project_view_surface_runtime.js', import.meta.url
    ), 'utf8');
    const unmountSource = source.slice(
        source.indexOf('const unmountProjectViewSurface'),
        source.indexOf('const mountProjectViewSurface')
    );
    assert.match(unmountSource, /projectViewPlayback\.setVideoNodeResolver\(videoSurfaceIdsFor\)/);
    assert.doesNotMatch(unmountSource, /projectViewPlayback\.stop\(\)/,
        'switching from List or Matrix to Natural must not implicitly stop playback');
    assert.match(unmountSource, /preserveMoleculeTransportRail[\s\S]*contextRuntime\.openCurrentLevel\(\)/,
        'an active Molecule must keep its explicit Stop control across the Natural transition');
    assert.match(unmountSource, /activeKind[\s\S]*molecule_molecule[\s\S]*preserveMoleculeSelectionRail/,
        'a Molecule selected in List must keep its Molecule rail when Natural takes the canvas');
    assert.match(unmountSource, /!preserveMoleculeTransportRail && !preserveMoleculeSelectionRail[\s\S]*promoteActiveToCanvas/,
        'Natural must not downgrade a selected Molecule to generic group tools');
    assert.match(unmountSource, /state\.projectId = targetProjectId/,
        'Natural must retain the project owner used by its video-surface resolver');
    assert.doesNotMatch(unmountSource, /projectViewPlayback\.setVideoNodeResolver\(null\)/);
    assert.match(unmountSource, /await reconcileNaturalProjectSurface\(\)/,
        'Natural transition must rebuild durable records after removing the structured prefix');
    assert.match(source, /runtime\.forceSurfaceReconcile = true[\s\S]*renderScheduler\?\.renderNow/,
        'Natural transition must wait for the canonical surface reconcile before reporting readiness');
    assert.match(source, /currentProjectId\(\)[\s\S]*PROJECT_SCENES\.get\(targetProjectId\)/,
        'Natural must resolve the canonical current-project runtime when the foreground pointer trails');
    assert.match(source, /currentProjectId\(\)[\s\S]*claimProjectSceneForeground\(runtime\.project_id\)[\s\S]*forceSurfaceReconcile/,
        'Natural must claim the verified current project before the engine background guard runs');
    assert.match(unmountSource, /allowNaturalSceneUnavailable && reconciled\?\.error === 'project_view_natural_scene_unavailable'/,
        'only an explicit workspace activation may defer the first Natural scene paint to its loader');
    const projectActivationSource = fs.readFileSync(new URL(
        '../../eVe/intuition/matrix/core/project_data.js', import.meta.url
    ), 'utf8');
    assert.match(projectActivationSource,
        /setProjectViewMode\(preparedViewMode\.mode,[\s\S]*allowNaturalSceneUnavailable: true[\s\S]*loadProjectAtomes/,
        'workspace activation must opt into the pre-loader Natural transition explicitly');
    assert.ok(
        unmountSource.indexOf('await reconcileNaturalProjectSurface()')
        < unmountSource.lastIndexOf('state.mode = MODES.NATURAL'),
        'Natural mode must not be published before its canonical surface is ready'
    );
    assert.match(source, /foreground\?\.records\?\.has\?\.\(id\) \? \[id\] : \[\]/,
        'the Natural video Atome itself must be a playback surface, not only its mirrors');
});

test('structured views reset shared navigation before resolving content for a new project', () => {
    const source = fs.readFileSync(new URL(
        '../../eVe/domains/rendering/project_view_surface_runtime.js', import.meta.url
    ), 'utf8');
    const mountSource = source.slice(source.indexOf('const mountProjectViewSurface'));
    assert.match(mountSource, /readNavigationState\(\)\.projectId !== target/);
    assert.match(mountSource, /resetProjectViewNavigation\(target, currentProjectName\(\)\)/);
    assert.ok(
        mountSource.indexOf('resetProjectViewNavigation(target, currentProjectName())')
        < mountSource.indexOf('const content = activeContent()'),
        'stale Detail state must not choose the content runtime for the next project'
    );
});

test('Natural absorption resolves a visible member hit to its canonical Molecule owner', () => {
    const source = fs.readFileSync(new URL(
        '../../eVe/domains/rendering/project_scene_engine.js', import.meta.url
    ), 'utf8');
    assert.match(source, /resolveMoleculeAbsorbTargetId\(runtime, overlapTargetId\)/);
    assert.match(source, /if \(isMoleculeRecord\(record\)\) return currentId/);
    assert.match(source, /sourceId, targetId: canonicalTargetId/);
});

test('canonical sound records become audio clips even when their top-level type is generic', () => {
    assert.equal(clipKindFor({ type: 'atome', properties: { kind: 'sound' } }), 'audio');
    assert.equal(clipKindFor({ properties: { media_kind: 'sound' } }), 'audio');
    assert.equal(clipKindFor({ properties: { kind: 'image' } }), 'image');
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
    assert.deepEqual(runtime.readState(), {
        playing: false, scope: '', playingIds: [], playingRecords: [],
        armed: false, armedProjectId: ''
    });
});

test('sequential playback publishes the canonical selection target for each item without changing transport', async () => {
    const announcements = [];
    const runtime = createProjectViewPlaybackRuntime({
        publish: (detail) => announcements.push(detail),
        runMediaAction: async () => ({ ok: true }),
        readMediaDuration: () => 0.001,
        setTimer: (callback) => { queueMicrotask(callback); return 1; },
        clearTimer: () => {}
    });
    const children = [mediaRecord('selection_one'), mediaRecord('selection_two'), mediaRecord('selection_three')];
    await runtime.toggleLevel({
        level: { entity: 'project', id: 'project_selection_follow' },
        projectId: 'project_selection_follow', children,
        rule: { mode: 'sequential', loop: false }
    });
    for (let attempt = 0; attempt < 30 && runtime.readState().playing; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(announcements.map((detail) => detail.followSelectionId).filter(Boolean), [
        'selection_one', 'selection_two', 'selection_three'
    ]);
    assert.equal(runtime.readState().playing, false);
});

test('a Molecule plays every direct member once in sequential and random modes', async () => {
    const owner = {
        id: 'molecule_owner', type: 'group',
        properties: {
            kind: 'group',
            molecule_timeline: { schema_version: 2, owner_atome_id: 'molecule_owner' }
        }
    };
    const members = [mediaRecord('member_one'), mediaRecord('member_two')]
        .map((record) => ({ ...record, parent_id: 'molecule_owner' }));
    const run = async (mode, shuffle = (items) => items) => {
        const calls = [];
        const runtime = createProjectViewPlaybackRuntime({
            runMediaAction: async ({ action, atomeIds }) => {
                calls.push(`${action}:${atomeIds[0]}`);
                return { ok: true };
            },
            readMediaDuration: () => 0.001,
            readMoleculeMembers: async ({ moleculeId }) => moleculeId === 'molecule_owner' ? members : [],
            resolveMoleculeRule: async () => ({ mode, loop: false }),
            setTimer: (callback) => { queueMicrotask(callback); return 1; },
            clearTimer: () => {},
            shuffle
        });
        const result = await runtime.toggleLevel({
            level: { entity: 'project', id: `project_${mode}` }, projectId: `project_${mode}`,
            children: [owner], rule: { mode: 'sequential', loop: false }
        });
        assert.equal(result.ok, true);
        for (let attempt = 0; attempt < 30 && runtime.readState().playing; attempt += 1) {
            await new Promise((resolve) => setImmediate(resolve));
        }
        assert.equal(runtime.readState().playing, false);
        return calls;
    };

    assert.deepEqual(await run('sequential'), [
        'play:member_one', 'stop:member_one', 'play:member_two', 'stop:member_two'
    ]);
    assert.deepEqual(await run('random', (items) => [items[1], items[0]]), [
        'play:member_two', 'stop:member_two', 'play:member_one', 'stop:member_one'
    ]);
});

test('a Molecule in Ensemble mode delegates one transport for its canonical owner', async () => {
    const calls = [];
    const owner = {
        id: 'molecule_ensemble', type: 'group',
        properties: {
            kind: 'group',
            molecule_timeline: { schema_version: 2, owner_atome_id: 'molecule_ensemble' }
        }
    };
    const runtime = createProjectViewPlaybackRuntime({
        timelineApi: () => ({
            listOpenGroupTimelines: () => ({ timelines: [] }),
            openGroupTimeline: async ({ group_id }) => calls.push(`open:${group_id}`),
            stopGroupTimelineTransport: async ({ group_id }) => calls.push(`stop:${group_id}`),
            toggleGroupTimelineTransport: async ({ group_id }) => {
                calls.push(`play:${group_id}`);
                return { playing: true, duration: 0.001 };
            }
        }),
        readMoleculeMembers: async () => [mediaRecord('member_one'), mediaRecord('member_two')],
        resolveMoleculeRule: async () => ({ mode: 'layer', loop: false }),
        setTimer: (callback) => { queueMicrotask(callback); return 1; },
        clearTimer: () => {}
    });
    await runtime.toggleLevel({
        level: { entity: 'project', id: 'project_ensemble' }, projectId: 'project_ensemble',
        children: [owner], rule: { mode: 'sequential', loop: false }
    });
    for (let attempt = 0; attempt < 30 && runtime.readState().playing; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(calls, [
        'open:molecule_ensemble', 'stop:molecule_ensemble', 'play:molecule_ensemble', 'stop:molecule_ensemble'
    ]);
});

test('the selected Molecule contextual Play action forwards every requested playback mode to the canonical runtime', async () => {
    const timeline = { schema_version: 2, project_id: 'project_contextual_modes', owner_atome_id: 'molecule_modes' };
    const calls = [];
    const transportCalls = [];
    const timelineApi = {
        listOpenGroupTimelines: () => ({ timelines: [] }),
        openGroupTimeline: async ({ group_id }) => transportCalls.push(`open:${group_id}`),
        toggleGroupTimelineTransport: async ({ group_id }) => {
            transportCalls.push(`play:${group_id}`);
            return { ok: true, playing: true, mode: 'layer' };
        },
        stopGroupTimelineTransport: async ({ group_id }) => transportCalls.push(`stop:${group_id}`)
    };
    const adopted = [];
    for (const mode of ['sequential', 'random', 'layer']) {
        const result = await playMoleculeContextualOwner({
            ownerId: 'molecule_modes', moleculeId: 'molecule_modes', projectId: timeline.project_id,
            timeline, ownerState: { properties: { name: 'Modes' } },
            resolveRule: async () => ({ mode, loop: false }),
            timelineApi,
            playback: {
                toggleLevel: async (input) => {
                    calls.push(input);
                    return { ok: true, mode: input.rule.mode };
                },
                adoptDelegatedMoleculeTransport: async (input) => adopted.push(input)
            }
        });
        assert.equal(result.ok, true);
        assert.equal(result.mode, mode);
    }
    assert.deepEqual(calls.map((call) => ({
        mode: call.rule.mode,
        scope: `${call.level.entity}:${call.level.id}`,
        childId: call.children[0].atome_id,
        timeline: call.children[0].properties.molecule_timeline
    })), ['sequential', 'random'].map((mode) => ({
        mode, scope: 'molecule:molecule_modes', childId: 'molecule_modes', timeline
    })));
    assert.deepEqual(transportCalls, ['open:molecule_modes', 'play:molecule_modes']);
    assert.equal(adopted.length, 1);
    assert.equal(adopted[0].level.entity, 'molecule');
    assert.equal(adopted[0].playing, true);
});

test('cold Molecule Play unlocks Web Kira before rule resolution and timeline opening', async () => {
    const calls = [];
    const previousSquirrel = globalThis.window.Squirrel;
    globalThis.window.Squirrel = {
        av: { audio: {
            get_runtime: () => ({ playback: 'web_wasm_kira' }),
            unlockPlayback: () => { calls.push('unlock'); return Promise.resolve(true); }
        } }
    };
    try {
        const result = await playMoleculeContextualOwner({
            ownerId: 'molecule_cold', moleculeId: 'molecule_cold', projectId: 'project_cold',
            timeline: { schema_version: 2, project_id: 'project_cold', owner_atome_id: 'molecule_cold' },
            resolveRule: async () => { calls.push('rule'); return { mode: 'layer', loop: false }; },
            playback: {
                toggleLevel: async () => ({ ok: true }),
                adoptDelegatedMoleculeTransport: async () => calls.push('adopt')
            },
            timelineApi: {
                listOpenGroupTimelines: () => ({ timelines: [] }),
                openGroupTimeline: async () => calls.push('open'),
                toggleGroupTimelineTransport: async () => { calls.push('play'); return { ok: true, playing: true }; },
                stopGroupTimelineTransport: async () => {}
            }
        });
        assert.equal(result.ok, true);
        assert.deepEqual(calls, ['unlock', 'rule', 'open', 'play', 'adopt']);
    } finally {
        globalThis.window.Squirrel = previousSquirrel;
    }
});

test('the contextual Ensemble action keeps the Molecule runtime playing until explicit Stop', async () => {
    const timeline = { schema_version: 2, project_id: 'project_contextual_layer', owner_atome_id: 'molecule_layer' };
    const runtime = createProjectViewPlaybackRuntime();
    const transportCalls = [];
    const started = await playMoleculeContextualOwner({
        ownerId: 'molecule_layer', moleculeId: 'molecule_layer', projectId: timeline.project_id, timeline,
        resolveRule: async () => ({ mode: 'layer', loop: false }), playback: runtime,
        timelineApi: {
            listOpenGroupTimelines: () => ({ timelines: [{ group_id: 'molecule_layer' }] }),
            toggleGroupTimelineTransport: async () => {
                transportCalls.push('play');
                return { ok: true, playing: true, duration: 0 };
            },
            stopGroupTimelineTransport: async () => transportCalls.push('stop')
        }
    });
    assert.equal(started.playing, true);
    assert.deepEqual(runtime.readState(), {
        playing: true, scope: 'molecule:molecule_layer', playingIds: [], playingRecords: [],
        armed: false, armedProjectId: ''
    });
    await runtime.stop();
    assert.deepEqual(transportCalls, ['play', 'stop']);
    assert.equal(runtime.readState().playing, false);
});

test('Molecule contextual Delete loads its canonical action owner before invoking the selected owner', async () => {
    const calls = [];
    const result = await deleteMoleculeContextualOwner({
        ownerId: 'molecule_delete_owner',
        projectId: 'project_delete_owner',
        loadDeleteModule: async () => calls.push('load'),
        invokeDelete: async (input) => {
            calls.push('invoke');
            return { ok: true, input };
        }
    });
    assert.deepEqual(calls, ['load', 'invoke']);
    assert.deepEqual(result.input.extraInput, {
        atome_id: 'molecule_delete_owner',
        selection_ids: ['molecule_delete_owner'],
        project_id: 'project_delete_owner'
    });
});

test('a delegated Molecule transport releases the shared playback state at its natural duration', () => {
    const timers = [];
    const runtime = createProjectViewPlaybackRuntime({
        setTimer: (callback, delayMs) => { timers.push({ callback, delayMs }); return timers.length; },
        clearTimer: () => {}
    });
    runtime.adoptDelegatedTransport({
        level: { entity: 'molecule', id: 'molecule_natural_end' },
        playing: true,
        duration: 2
    });
    assert.equal(runtime.readState().playing, true);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delayMs, 2000);
    timers[0].callback();
    assert.deepEqual(runtime.readState(), {
        playing: false, scope: '', playingIds: [], playingRecords: [],
        armed: false, armedProjectId: ''
    });
});

test('a delegated Molecule publishes every member without replacing its canonical composition order', async () => {
    const image = { id: 'visual_image', type: 'image', properties: { kind: 'image', media_url: '/image.png' } };
    const audio = mediaRecord('audible_sound');
    const announcements = [];
    const runtime = createProjectViewPlaybackRuntime({
        readMoleculeMembers: async () => [audio, image],
        publish: (state) => announcements.push(state),
        setTimer: () => 1,
        clearTimer: () => {}
    });
    await runtime.adoptDelegatedMoleculeTransport({
        level: { entity: 'molecule', id: 'composite' },
        projectId: 'project', moleculeId: 'composite', playing: true, duration: 4
    });
    assert.deepEqual(runtime.readState().playingIds, ['audible_sound', 'visual_image']);
    assert.deepEqual(runtime.readState().playingRecords, [audio, image]);
    assert.equal(announcements.at(-1).playing, true);
});

test('Molecule composite preview preserves member layout and canonical z order', () => {
    const video = {
        id: 'video_low', type: 'video',
        properties: { kind: 'video', media_url: '/video.mp4', left: 0, top: 0, width: 200, height: 100, z_index: 2 }
    };
    const text = {
        id: 'text_high', type: 'text',
        properties: { kind: 'text', text: 'Visible', left: 100, top: 50, width: 100, height: 20, z_index: 9 }
    };
    const layout = resolveRecordCompositePreviewLayout({ records: [text, video], width: 400, height: 200 });
    assert.equal(layout.scale, 2);
    assert.deepEqual(layout.entries.map((entry) => entry.id), ['video_low', 'text_high']);
    assert.deepEqual(
        layout.entries.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
        [
            { id: 'video_low', x: 0, y: 0, width: 400, height: 200 },
            { id: 'text_high', x: 200, y: 100, width: 200, height: 40 }
        ]
    );
});

test('Molecule visual subject refreshes a moved member from the current project records', () => {
    const owner = { id: 'molecule_owner', type: 'group', properties: { kind: 'group' } };
    const stale = {
        id: 'member_text', parent_id: 'molecule_owner', type: 'text',
        properties: { text: 'Move me', left: 10, top: 20, width: 80, height: 20 }
    };
    const moved = { ...stale, properties: { ...stale.properties, left: 140, top: 75 } };
    const subject = resolveProjectViewVisualSubject({
        content: {
            contextualTarget: () => ({ id: owner.id, record: owner }),
            levelChildren: () => [owner],
            recordsFor: () => [moved]
        },
        playingIds: [stale.id],
        playingRecords: [stale],
        playbackScope: 'molecule:molecule_owner'
    });
    assert.equal(subject.record, owner);
    assert.equal(subject.records[0], moved);
    assert.equal(subject.records[0].properties.left, 140);
});

test('delegated Molecule video uses the shared projected decoder and stops at natural end', async () => {
    const timers = [];
    const videoCalls = [];
    const video = {
        id: 'composite_video', parent_id: 'composite', type: 'video',
        properties: { kind: 'video', media_url: '/video.mp4' }
    };
    const text = {
        id: 'composite_text', parent_id: 'composite', type: 'text',
        properties: { kind: 'text', text: 'Visible' }
    };
    const runtime = createProjectViewPlaybackRuntime({
        readMoleculeMembers: async () => [text, video],
        driveVideoPlayback: (nodeIds, active) => {
            videoCalls.push({ nodeIds, active });
            return { ok: true };
        },
        setTimer: (callback, delayMs) => { timers.push({ callback, delayMs }); return timers.length; },
        clearTimer: () => {}
    });
    runtime.setVideoNodeResolver((atomeId) => [`visual_${atomeId}`]);
    await runtime.adoptDelegatedMoleculeTransport({
        level: { entity: 'molecule', id: 'composite' },
        projectId: 'project', moleculeId: 'composite', playing: true, duration: 3
    });
    assert.deepEqual(videoCalls, [{ nodeIds: ['visual_composite_video'], active: true }]);
    assert.equal(timers[0].delayMs, 3000);
    timers[0].callback();
    assert.deepEqual(videoCalls.at(-1), { nodeIds: ['visual_composite_video'], active: false });
    assert.equal(runtime.readState().playing, false);
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
    const timers = [];
    const runtime = createProjectViewPlaybackRuntime({
        setTimer: (callback, delayMs) => { timers.push({ callback, delayMs }); return timers.length; },
        clearTimer: () => {}
    });
    const result = await runtime.playChild({
        record: { id: 'caption', type: 'text', properties: { kind: 'text' } },
        projectId: 'structured_project'
    });
    assert.deepEqual(result, {
        ok: true, playing: true, id: 'caption', kind: 'still', scope: 'trigger:caption'
    });
    assert.equal(timers[0].delayMs, 2000);
    timers[0].callback();
    for (let attempt = 0; attempt < 10 && runtime.readState().playing; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(runtime.readState().playing, false);
    assert.equal(runtime.readState().armed, true);
    await runtime.stop();
});

test('structured item playback stays armed after completion and a failed next selection', async () => {
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
    assert.equal(runtime.isItemPlaybackArmed({ record: video, projectId: 'facade_project' }), true);
    const failed = mediaRecord('failed_video');
    const failedResult = await followSelectionWhilePlaying({
        record: failed, projectId: 'facade_project'
    }, { playback: runtime });
    assert.equal(failedResult.ok, false);
    assert.equal(runtime.isPlayingTarget({ record: failed }), false);
    assert.equal(runtime.readState().armed, true);
    const next = mediaRecord('next_video');
    const nextResult = await followSelectionWhilePlaying({
        record: next, projectId: 'facade_project'
    }, { playback: runtime });
    assert.equal(nextResult.ok, true);
    assert.equal(runtime.isPlayingTarget({ record: next }), true);
    const stopped = await runtime.stop();
    assert.equal(stopped.armed, false);
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
    assert.deepEqual(runtime.readState(), {
        playing: false, scope: '', playingIds: [], playingRecords: [],
        armed: false, armedProjectId: ''
    });
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
    assert.deepEqual(runtime.readState(), {
        playing: false, scope: '', playingIds: [], playingRecords: [],
        armed: false, armedProjectId: ''
    });
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
    assert.deepEqual(runtime.readState(), {
        playing: false, scope: '', playingIds: [], playingRecords: [],
        armed: false, armedProjectId: ''
    });
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
    assert.deepEqual(runtime.readState(), {
        playing: false, scope: '', playingIds: [], playingRecords: [],
        armed: false, armedProjectId: ''
    });
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
        atome_id: 'atom', project_id: 'project_molecules', parent_id: 'molecule_target',
        props: { hierarchy_order: 0, zIndex: 1, z_index: 1, order: 1, render_order: 1, renderOrder: 1 }
    });
    assert.equal(batches[1].events[0].props.molecule_timeline.clips[0].source.atome_id, 'atom');

    const moleculeOntoAtom = await absorbCanonicalMolecule({
        projectId: 'project_molecules', sourceId: 'molecule_source', targetId: 'atom_target'
    }, mutationDependencies([
        moleculeState('molecule_source'), atomeState('atom_target', 'project_molecules', { left: '40px', top: '50px' })
    ], batches));
    assert.equal(moleculeOntoAtom.operation, 'absorb');
    assert.deepEqual(batches[2].events.slice(1), [
        {
            atome_id: 'atom_target', project_id: 'project_molecules', parent_id: 'molecule_source',
            props: { hierarchy_order: 0, zIndex: 1, z_index: 1, order: 1, render_order: 1, renderOrder: 1 }
        }
    ]);
    assert.equal(batches[2].events[0].props.molecule_timeline.clips[0].source.atome_id, 'atom_target');

    const merge = await absorbCanonicalMolecule({
        projectId: 'project_molecules', sourceId: 'molecule_source', targetId: 'molecule_target'
    }, mutationDependencies([
        moleculeState('molecule_source'), moleculeState('molecule_target'), atomeState('child_a', 'molecule_source')
    ], batches));
    assert.equal(merge.operation, 'merge');
    assert.deepEqual(batches[3].events.slice(1), [
        {
            atome_id: 'child_a', project_id: 'project_molecules', parent_id: 'molecule_target',
            props: { hierarchy_order: 0, zIndex: 1, z_index: 1, order: 1, render_order: 1, renderOrder: 1 }
        },
        { kind: 'delete', atome_id: 'molecule_source', project_id: 'project_molecules', props: {} }
    ]);
    assert.equal(batches[3].events[0].props.molecule_timeline.clips[0].source.atome_id, 'child_a');
});

test('canonical absorb places a newly added member on the first visible row and preserves one visual order', async () => {
    const batches = [];
    const result = await absorbCanonicalMolecule({
        projectId: 'project_molecules', sourceId: 'text_new', targetId: 'molecule_target'
    }, mutationDependencies([
        moleculeState('molecule_target'),
        atomeState('video_existing', 'molecule_target', { zIndex: 1, order: 4 }),
        atomeState('audio_existing', 'molecule_target', { z_index: 2, render_order: 5 }),
        atomeState('text_new')
    ], batches));

    assert.equal(result.ok, true);
    assert.deepEqual(batches[0].events.slice(1).map((event) => ({
        id: event.atome_id,
        hierarchy: event.props.hierarchy_order,
        z: event.props.z_index
    })), [{ id: 'text_new', hierarchy: 0, z: 3 }, {
        id: 'video_existing', hierarchy: 1, z: 2
    }, {
        id: 'audio_existing', hierarchy: 2, z: 1
    }]);
    assert.deepEqual(batches[0].events[1], {
        atome_id: 'text_new',
        project_id: 'project_molecules',
        parent_id: 'molecule_target',
        props: {
            hierarchy_order: 0,
            zIndex: 3, z_index: 3, order: 3, render_order: 3, renderOrder: 3
        }
    });
    assert.equal(batches[0].events[0].props.molecule_timeline.clips.length, 3);
    assert.equal(batches[0].events[0].props.molecule_timeline.clips.every((clip) => clip.timeline.start_frame === 0), true);
});

test('canonical absorb uses visible canonical records when its second list read is empty', async () => {
    const batches = [];
    const source = atomeState('persisted_image');
    const target = atomeState('persisted_file', 'project_molecules', { left: '20px', top: '30px' });
    const result = await absorbCanonicalMolecule({
        projectId: 'project_molecules', sourceId: 'persisted_image', targetId: 'persisted_file'
    }, {
        readList: async () => [],
        knownRecords: [source, target],
        commitBatch: async (events, options) => {
            batches.push({ events, options });
            return { ok: true };
        }
    });
    assert.equal(result.ok, true);
    assert.equal(result.operation, 'create');
    assert.equal(batches.length, 1);
    assert.deepEqual(new Set(batches[0].events.slice(1).map((event) => event.atome_id)),
        new Set(['persisted_file', 'persisted_image']));
});

test('canonical ungroup and delete operate on direct members in one history transaction', async () => {
    const batches = [];
    const closedTimelines = [];
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

    const deleteDependencies = mutationDependencies([
        moleculeState('molecule'), atomeState('one', 'molecule'), atomeState('two', 'molecule')
    ], batches);
    deleteDependencies.closeTimeline = async (moleculeId) => {
        closedTimelines.push(moleculeId);
        return { ok: true, closed: true };
    };
    const deleted = await deleteCanonicalMolecule({
        projectId: 'project_molecules', moleculeId: 'molecule'
    }, deleteDependencies);
    assert.equal(deleted.ok, true);
    assert.deepEqual(closedTimelines, ['molecule']);
    assert.deepEqual(batches[1].events, [
        { kind: 'delete', atome_id: 'one', project_id: 'project_molecules', props: {} },
        { kind: 'delete', atome_id: 'two', project_id: 'project_molecules', props: {} },
        { kind: 'delete', atome_id: 'molecule', project_id: 'project_molecules', props: {} }
    ]);
});

test('canonical member extraction preserves other clips, gains, ownership and the active transport snapshot', async () => {
    const one = atomeState('one', 'molecule', { duration_sec: 2, hierarchy_order: 0 });
    const two = atomeState('two', 'molecule', { duration_sec: 4, hierarchy_order: 1 });
    const three = atomeState('three', 'molecule', { duration_sec: 3, hierarchy_order: 2 });
    const timeline = buildCanonicalMoleculeTimeline({
        projectId: 'project_molecules', moleculeId: 'molecule', members: [one, two, three]
    });
    const firstTrackId = timeline.clips.find((clip) => clip.source.atome_id === 'one').track_id;
    const thirdTrackId = timeline.clips.find((clip) => clip.source.atome_id === 'three').track_id;
    timeline.tracks = timeline.tracks.map((track) => {
        if (track.track_id === firstTrackId) return { ...track, gain: 0.25, mute: true };
        if (track.track_id === thirdTrackId) return { ...track, gain: 1.5 };
        return track;
    });
    const batches = [];
    const adopted = [];
    const result = await extractCanonicalMoleculeMember({
        projectId: 'project_molecules', moleculeId: 'molecule', memberId: 'two'
    }, {
        readList: async () => [
            moleculeState('molecule', 'project_molecules', { hierarchy_order: 4, molecule_timeline: timeline }),
            one, two, three
        ],
        commitBatch: async (events, options) => { batches.push({ events, options }); return { ok: true }; },
        timelineApi: {
            listOpenGroupTimelines: () => ({ timelines: [{ group_id: 'molecule' }] }),
            adoptCommittedGroupTimelineSnapshot: async (detail) => { adopted.push(detail); return { ok: true }; }
        }
    });
    assert.equal(result.ok, true);
    assert.equal(result.molecule_deleted, false);
    assert.deepEqual(result.remaining_member_ids, ['one', 'three']);
    assert.deepEqual(result.timeline.clips.map((clip) => clip.source.atome_id), ['one', 'three']);
    assert.equal(result.timeline.tracks.find((track) => track.track_id === firstTrackId).gain, 0.25);
    assert.equal(result.timeline.tracks.find((track) => track.track_id === firstTrackId).mute, true);
    assert.equal(result.timeline.tracks.find((track) => track.track_id === thirdTrackId).gain, 1.5);
    assert.equal(result.timeline.duration_seconds, 3);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].events.find((event) => event.atome_id === 'two').parent_id, 'project_molecules');
    assert.deepEqual(batches[0].events.filter((event) => ['one', 'three'].includes(event.atome_id)).map((event) => ({
        id: event.atome_id,
        hierarchy: event.props.hierarchy_order,
        z: event.props.z_index
    })), [
        { id: 'one', hierarchy: 0, z: 2 },
        { id: 'three', hierarchy: 1, z: 1 }
    ]);
    assert.equal(adopted.length, 1);
    assert.equal(adopted[0].timeline, result.timeline);
});

test('extracting the final member deletes the empty Molecule in the same batch', async () => {
    const only = atomeState('only', 'molecule', { duration_sec: 1 });
    const timeline = buildCanonicalMoleculeTimeline({
        projectId: 'project_molecules', moleculeId: 'molecule', members: [only]
    });
    const batches = [];
    const closed = [];
    const result = await extractCanonicalMoleculeMember({
        projectId: 'project_molecules', moleculeId: 'molecule', memberId: 'only'
    }, {
        readList: async () => [
            moleculeState('molecule', 'project_molecules', { hierarchy_order: 7, molecule_timeline: timeline }), only
        ],
        commitBatch: async (events) => { batches.push(events); return { ok: true }; },
        closeTimeline: async (id) => { closed.push(id); return { ok: true, closed: true }; }
    });
    assert.equal(result.ok, true);
    assert.equal(result.molecule_deleted, true);
    assert.deepEqual(batches[0], [
        { atome_id: 'only', project_id: 'project_molecules', parent_id: 'project_molecules', props: { hierarchy_order: 7 } },
        { kind: 'delete', atome_id: 'molecule', project_id: 'project_molecules', props: {} }
    ]);
    assert.deepEqual(closed, ['molecule']);
});

test('an armed overlap survives normal movement inside the same target', async () => {
    const timers = [];
    const setTimer = (callback, delayMs) => timers.push({ callback, delayMs }) - 1;
    const clearTimer = (handle) => { if (timers[handle]) timers[handle] = null; };
    const fire = () => timers.filter(Boolean).forEach((timer) => timer.callback());

    let now = 1000;
    const session = { hoverId: '', sourceId: 'source' };
    const armed = [];
    armStationaryAbsorb({
        session, targetId: 'target', onArmed: (id) => armed.push(id), setTimer, clearTimer,
        now: () => now
    });
    assert.equal(timers.filter(Boolean)[0].delayMs, PROJECT_VIEW_ABSORB_DELAY_MS);
    assert.equal(hasStationaryAbsorbOverlap(session, 'target'), false);
    now += PROJECT_VIEW_ABSORB_DELAY_MS;
    assert.equal(hasStationaryAbsorbOverlap(session, 'target'), true);
    fire();
    assert.deepEqual(armed, ['target']);
    assert.equal(hasStationaryAbsorbOverlap(session, 'target'), true);

    armStationaryAbsorb({
        session, targetId: 'target', onArmed: () => {}, setTimer, clearTimer
    });
    assert.equal(hasStationaryAbsorbOverlap(session, 'target'), true);

    // Moving on disarms: the previous target must not stay armed behind the finger.
    armStationaryAbsorb({ session, targetId: 'different_target', onArmed: () => {}, setTimer, clearTimer });
    assert.equal(hasStationaryAbsorbOverlap(session, 'target'), false);
    clearStationaryAbsorb(session, clearTimer);
    assert.equal(hasStationaryAbsorbOverlap(session, 'different_target'), false);

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

test('member reordering persists the first row as the front visual layer in one batch', async () => {
    const batches = [];
    const records = [
        atomeState('text', 'molecule', { hierarchy_order: 1, z_index: 1 }),
        atomeState('video', 'molecule', { hierarchy_order: 0, z_index: 2 }),
        atomeState('audio', 'molecule', { hierarchy_order: 2, z_index: 0 })
    ];
    const result = await persistLevelOrder({
        projectId: 'project_molecules',
        records,
        orderedIds: ['text', 'video', 'audio'],
        visualStack: true,
        commitBatch: async (events, options) => { batches.push({ events, options }); return { ok: true }; }
    });
    assert.equal(result.ok, true);
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].events.map((event) => ({
        id: event.atome_id,
        hierarchy: event.props.hierarchy_order,
        z: event.props.z_index,
        renderLayer: event.props.renderLayer,
        render_layer: event.props.render_layer
    })), [
        { id: 'text', hierarchy: 0, z: 3, renderLayer: 3, render_layer: 3 },
        { id: 'video', hierarchy: 1, z: 2, renderLayer: 2, render_layer: 2 },
        { id: 'audio', hierarchy: 2, z: 1, renderLayer: 1, render_layer: 1 }
    ]);
});

test('member Plan commands project the same persisted visual order immediately', () => {
    const source = fs.readFileSync(new URL(
        '../../eVe/intuition/tools/z_order_actions.js', import.meta.url
    ), 'utf8');
    assert.match(source, /persistLevelOrder\([\s\S]*updateProjectSceneRecords\(/,
        'the canonical order batch must be followed by its disposable project-scene projection');
    assert.match(source, /projectRecordsWithOrder\(siblings, orderedIds, \{ visualStack: true \}\)/,
        'Plan and List must project the same first-row-is-front ordering');
    assert.match(source, /record\.meta\?\.parent_id/,
        'Plan must recognize canonical Molecule membership carried by the record envelope');
    assert.match(source, /projectedOwner \|\|[\s\S]*Atome\?\.getStateCurrent\?\.\(parentId\)/,
        'Plan must resolve a non-visual Molecule owner from canonical Atome state');
});

test('structured drop geometry separates exact insertion slots from the shared overlap delay', () => {
    const box = { x: 10, y: 20, width: 200, height: 100 };
    assert.deepEqual(resolveStructuredDropIntent({
        layout: 'list', sourceId: 'source', targetId: 'target', targetIndex: 3,
        point: { x: 100, y: 30 }, box
    }).slotIndex, 3);
    assert.equal(resolveStructuredDropIntent({
        layout: 'list', sourceId: 'source', targetId: 'target', targetIndex: 3,
        point: { x: 100, y: 70 }, box
    }).kind, 'overlap');
    assert.deepEqual(resolveStructuredDropIntent({
        layout: 'list', sourceId: 'source', targetId: 'target', targetIndex: 3,
        point: { x: 100, y: 115 }, box
    }).slotIndex, 4);
    assert.equal(resolveStructuredDropIntent({
        layout: 'matrix', sourceId: 'source', targetId: 'target', targetIndex: 2,
        point: { x: 110, y: 70 }, box
    }).kind, 'overlap');
    assert.equal(resolveStructuredDropIntent({
        layout: 'matrix', sourceId: 'source', targetId: 'target', targetIndex: 2,
        point: { x: 12, y: 70 }, box
    }).kind, 'insert');

    const timers = [];
    armStationaryAbsorb({
        session: { sourceId: 'source' }, targetId: 'target', point: { x: 50, y: 50 },
        delayMs: PROJECT_VIEW_ABSORB_DELAY_MS,
        setTimer: (callback, delayMs) => timers.push({ callback, delayMs }) - 1,
        clearTimer: () => {}
    });
    assert.equal(timers[0].delayMs, 500);
});

test('exact insertion order is protected until the canonical read confirms it', () => {
    assert.deepEqual(orderedIdsAfterInsertion(['a', 'b', 'c'], 'a', 3), ['b', 'c', 'a']);
    assert.deepEqual(orderedIdsAfterInsertion(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
    const oldRecords = ['a', 'b', 'c'].map((id, index) => ({
        id, properties: { hierarchy_order: index }
    }));
    beginPendingLevelOrder({
        projectId: 'pending_project', containerId: 'pending_project',
        orderedIds: ['b', 'c', 'a'], txId: 'tx_pending'
    });
    const stale = reconcilePendingLevelOrder({
        records: oldRecords, projectId: 'pending_project', containerId: 'pending_project'
    });
    assert.equal(stale.pending, true);
    assert.deepEqual(stale.records.map((record) => record.properties.hierarchy_order), [2, 0, 1]);
    const confirmed = reconcilePendingLevelOrder({
        records: stale.records, projectId: 'pending_project', containerId: 'pending_project'
    });
    assert.equal(confirmed.confirmed, true);
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
