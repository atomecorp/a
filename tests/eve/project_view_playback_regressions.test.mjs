import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import { moleculeState, atomeState, mutationDependencies, createProjectViewWindowState, loadProjectViewRecordsForPlayback, invalidatePlaybackMirrorIndex, playbackMirrorsFor, applyCaptureToTimeline, normalizeCapturedEvents, PERFORMANCE_MODE, hasUsablePerformanceClips, readPlaybackRuleOverride, resolvePlaybackRule, writePlaybackRuleOverride, absorbCanonicalMolecule, clipKindFor, resolveRecordCompositePreviewLayout, resolveProjectViewVisualSubject } from './project_view_regression_test_helpers.mjs';

test('Natural mode retains the canonical video mirror resolver after structured view teardown', () => {
    const source = fs.readFileSync(new URL(
        '../../eVe/domains/rendering/project_view_surface_runtime.js', import.meta.url
    ), 'utf8');
    const unmountSource = fs.readFileSync(new URL(
        '../../eVe/domains/rendering/project_view_surface_unmount.js', import.meta.url
    ), 'utf8');
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
        '../../eVe/intuition/matrix/core/project_workspace_activation_runtime.js', import.meta.url
    ), 'utf8');
    assert.match(projectActivationSource,
        /loadProjectAtomes\(projectId,[\s\S]*setProjectViewMode\(preparedViewMode\.mode,[\s\S]*allowNaturalSceneUnavailable: true/,
        'workspace activation must prepare the scene before revealing its selected representation');
    assert.ok(
        unmountSource.indexOf('await reconcileNaturalProjectSurface()')
        < unmountSource.lastIndexOf('state.mode = naturalMode'),
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
        < mountSource.indexOf('const content = activeContent(nextMode)'),
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

test('nested Molecules resolve only their local playback mode and normalize legacy layer', async () => {
    const records = new Map([
        ['album', { properties: { playback_mode: 'random', playback_loop: true } }],
        ['song', { properties: { playback_mode: 'layer' } }],
        ['plain_song', { properties: {} }]
    ]);
    const stack = [{ entity: 'molecule', id: 'album', ownerId: 'album' }];
    const readRecord = async (id) => records.get(id) || null;
    assert.deepEqual(await resolvePlaybackRule({
        level: { entity: 'molecule', id: 'song', ownerId: 'song' }, stack, readRecord
    }), { mode: 'simultaneous', loop: false, source: 'override', from: 'song' });
    assert.deepEqual(await resolvePlaybackRule({
        level: { entity: 'molecule', id: 'plain_song', ownerId: 'plain_song' }, stack, readRecord
    }), { mode: 'simultaneous', loop: false, source: 'default', from: 'plain_song' });
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

test('canonical absorb creates and absorbs Molecules through direct parent_id mutations without flattening envelopes', async () => {
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
    assert.equal(merge.operation, 'absorb_molecule');
    assert.deepEqual(batches[3].events.slice(1), [
        {
            atome_id: 'molecule_source', project_id: 'project_molecules', parent_id: 'molecule_target',
            props: { hierarchy_order: 0, zIndex: 1, z_index: 1, order: 1, render_order: 1, renderOrder: 1 }
        }
    ]);
    assert.equal(batches[3].events[0].props.molecule_timeline.clips[0].source.atome_id, 'molecule_source');
});
