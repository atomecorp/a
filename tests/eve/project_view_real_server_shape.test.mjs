import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import {
    createProjectViewWindowState,
    loadProjectViewPage,
    resetProjectViewWindowState
} from '../../eVe/domains/rendering/project_view_records.js';
import { createProjectViewMatrixContent } from '../../eVe/domains/rendering/project_view_matrix_content.js';
import { createProjectViewListContent } from '../../eVe/domains/rendering/project_view_list_content.js';
import { createProjectViewListDragRuntime } from '../../eVe/domains/rendering/project_view_list_drag_runtime.js';
import { createProjectViewMatrixDragRuntime } from '../../eVe/domains/rendering/project_view_matrix_drag_runtime.js';
import {
    enterProjectViewLevel,
    resetProjectViewNavigation
} from '../../eVe/domains/rendering/project_view_navigation.js';
import { readCurrentInsertionTarget } from '../../eVe/domains/rendering/project_view_insertion_target.js';
import { buildCanonicalMoleculeTimeline } from '../../eVe/intuition/tools/core/tool_runtime_atome_mutation.js';

test('a new project import cannot inherit the previous project temporal insertion level', () => {
    resetProjectViewNavigation('project_old', 'Old');
    enterProjectViewLevel({
        id: 'track_old',
        properties: {
            molecule_entity: 'track',
            owner_atome_id: 'molecule_old',
            section_id: 'section_old',
            track_id: 'track_old'
        }
    });
    assert.deepEqual(readCurrentInsertionTarget({ projectId: 'project_new' }), {
        projectId: 'project_new',
        parentId: 'project_new',
        temporal: null
    });
});

test('List and Matrix keep the real meta.project_id sound and exclude system projections', async () => {
    const projectId = 'audio_prj2';
    const system = Array.from({ length: 107 }, (_, index) => ({
        atome_id: `tool.ui.system_${index}`,
        atome_type: index % 2 ? 'tool' : 'panel',
        meta: { project_id: projectId },
        properties: { type: index % 2 ? 'tool' : 'panel', tool_scope: 'catalog', atome_tool: true }
    }));
    const sound = {
        atome_id: 'sound_audio_prj2',
        atome_type: 'sound',
        meta: { project_id: projectId, owner_id: 'user_a' },
        properties: { kind: 'sound', media_url: '/api/recordings/audio.wav' }
    };
    const result = await loadProjectViewPage({
        projectId,
        windowState: createProjectViewWindowState(),
        readList: async (_id, options) => {
            assert.equal(options.excludeSystem, true);
            return [sound, ...system];
        }
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.records.map((record) => record.id), ['sound_audio_prj2']);
});

test('project pages retain a child whose ancestor is outside the page when its canonical meta project is present', async () => {
    const windowState = createProjectViewWindowState();
    const result = await loadProjectViewPage({
        projectId: 'project_a',
        windowState,
        readList: async () => ({
            records: [{
                atome_id: 'child_without_local_parent', atome_type: 'image', parent_id: 'parent_on_other_page',
                meta: { project_id: 'project_a' }, properties: { name: 'Still in project' }
            }],
            totalCount: 1
        })
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.records.map((record) => record.id), ['child_without_local_parent']);
    assert.equal(windowState.hasNext, false, 'an exact final page must not create a phantom next page');
});

test('resetting a project view window retires an in-flight read from the previous project', async () => {
    const windowState = createProjectViewWindowState();
    let resolveRead;
    const pending = loadProjectViewPage({
        projectId: 'project_old',
        windowState,
        readList: () => new Promise((resolve) => { resolveRead = resolve; })
    });
    const replacement = resetProjectViewWindowState(windowState);
    resolveRead({ records: [] });
    const result = await pending;
    assert.equal(result.stale, true);
    assert.equal(replacement.revision, 0);
    assert.equal(replacement.loaded, false);
});

test('project pages never project canonical deletion tombstones', async () => {
    const result = await loadProjectViewPage({
        projectId: 'project_deleted_rows',
        windowState: createProjectViewWindowState(),
        readList: async () => ({
            records: [{
                atome_id: 'deleted_molecule', atome_type: 'group',
                meta: { project_id: 'project_deleted_rows' },
                properties: { kind: 'group', __deleted: true }
            }, {
                atome_id: 'deleted_child', atome_type: 'audio',
                meta: { project_id: 'project_deleted_rows' },
                properties: { kind: 'audio', deleted_at: '2026-08-24T00:00:00Z' }
            }, {
                atome_id: 'visible_child', atome_type: 'image',
                meta: { project_id: 'project_deleted_rows' },
                properties: { kind: 'image' }
            }],
            totalCount: 3
        })
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.records.map((record) => record.id), ['visible_child']);
});

test('Matrix never paints a rejected canonical selection as selected', async () => {
    const matrix = createProjectViewMatrixContent({ requestRefresh: () => {} });
    await matrix.load({
        projectId: 'project_selection',
        readList: async () => [{
            atome_id: 'ui.blocked_item', atome_type: 'image', meta: { project_id: 'project_selection' },
            properties: { name: 'Blocked only by selection policy' }
        }]
    });
    const result = await matrix.handleEvent({ type: 'project_view.matrix.activate', id: 'ui.blocked_item' });
    assert.deepEqual(result, {
        ok: false, error: 'project_view_selection_rejected', selectedId: 'ui.blocked_item'
    });
    assert.deepEqual(matrix.readState().selectedIds, []);
});

test('Matrix tiles expose the same press-drag-release lifecycle used for persistent reordering', async () => {
    const matrix = createProjectViewMatrixContent({ requestRefresh: () => {} });
    await matrix.load({
        projectId: 'project_matrix_drag',
        readList: async () => [
            { atome_id: 'first', atome_type: 'image', meta: { project_id: 'project_matrix_drag' }, properties: { name: 'First' } },
            { atome_id: 'second', atome_type: 'image', meta: { project_id: 'project_matrix_drag' }, properties: { name: 'Second' } }
        ]
    });
    const root = matrix.build({ width: 600, height: 500, emit: () => {} })[0];
    const tiles = root.children[0].children[0].children;
    assert.equal(typeof tiles[0].on.press, 'function');
    assert.equal(typeof tiles[0].on.drag, 'function');
    assert.equal(typeof tiles[0].on.release, 'function');
    assert.equal(typeof tiles[0].on.cancel, 'function');
});

test('Matrix reordering clears each completed drag so the same item can move repeatedly', async () => {
    const previousWindow = globalThis.window;
    const previousHTMLElement = globalThis.HTMLElement;
    const writes = [];
    let targetIndex = 1;
    let dropPoint = { x: 95, y: 50 };
    globalThis.HTMLElement = class HTMLElement {};
    globalThis.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
        eveBevyUiRuntime: {
            hitTestAtClientPoint: () => ({
                nodeId: `project_view_matrix_tile_${targetIndex}`,
                box: { x: 0, y: 0, width: 100, height: 100 }, point: dropPoint
            })
        },
        Atome: {
            commitBatch: async (events) => {
                writes.push(...events);
                return { ok: true };
            }
        }
    };
    try {
        const matrix = createProjectViewMatrixContent({ requestRefresh: () => {} });
        const records = () => [
            { atome_id: 'first', atome_type: 'image', meta: { project_id: 'project_matrix_repeat' }, properties: { name: 'First' } },
            { atome_id: 'second', atome_type: 'image', meta: { project_id: 'project_matrix_repeat' }, properties: { name: 'Second' } }
        ];
        await matrix.load({ projectId: 'project_matrix_repeat', readList: async () => records() });
        for (let attempt = 0; attempt < 2; attempt += 1) {
            targetIndex = attempt === 0 ? 1 : 0;
            dropPoint = attempt === 0 ? { x: 95, y: 50 } : { x: 5, y: 50 };
            await matrix.handleEvent({ type: 'project_view.matrix.drag.start', id: 'first', event: { client_x: 0, client_y: 0 } });
            await matrix.handleEvent({ type: 'project_view.matrix.drag.move', event: { client_x: dropPoint.x, client_y: dropPoint.y } });
            const result = await matrix.handleEvent({ type: 'project_view.matrix.drag.end', event: { client_x: dropPoint.x, client_y: dropPoint.y } });
            assert.equal(result.ok, true);
        }
        assert.equal(writes.length, 4, 'each completed move persists its two changed order positions');
    } finally {
        globalThis.window = previousWindow;
        globalThis.HTMLElement = previousHTMLElement;
    }
});

test('Matrix persists one reorder as one canonical commit batch', async () => {
    const previousWindow = globalThis.window;
    const previousHTMLElement = globalThis.HTMLElement;
    const batches = [];
    globalThis.HTMLElement = class HTMLElement {};
    globalThis.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
        eveBevyUiRuntime: {
            hitTestAtClientPoint: () => ({
                nodeId: 'project_view_matrix_tile_1',
                box: { x: 0, y: 0, width: 100, height: 100 },
                point: { x: 95, y: 50 }
            })
        },
        Atome: {
            commitBatch: async (events) => {
                batches.push(events);
                return { ok: true };
            }
        }
    };
    try {
        const matrix = createProjectViewMatrixContent({ requestRefresh: () => {} });
        const records = [
            { atome_id: 'first', atome_type: 'image', meta: { project_id: 'project_matrix_batch' }, properties: { name: 'First' } },
            { atome_id: 'second', atome_type: 'image', meta: { project_id: 'project_matrix_batch' }, properties: { name: 'Second' } }
        ];
        await matrix.load({ projectId: 'project_matrix_batch', readList: async () => records });
        await matrix.handleEvent({ type: 'project_view.matrix.drag.start', id: 'first', event: { client_x: 0, client_y: 0 } });
        await matrix.handleEvent({ type: 'project_view.matrix.drag.move', event: { client_x: 95, client_y: 50 } });
        const result = await matrix.handleEvent({ type: 'project_view.matrix.drag.end', event: { client_x: 95, client_y: 50 } });
        assert.equal(result.ok, true);
        assert.deepEqual(batches, [[
            { kind: 'set', atome_id: 'second', project_id: 'project_matrix_batch', props: { hierarchy_order: 0 } },
            { kind: 'set', atome_id: 'first', project_id: 'project_matrix_batch', props: { hierarchy_order: 1 } }
        ]]);
    } finally {
        globalThis.window = previousWindow;
        globalThis.HTMLElement = previousHTMLElement;
    }
});

test('List bottom-quarter insertion traverses the real drag handler and commits the exact slot', async () => {
    const previousWindow = globalThis.window;
    const previousHTMLElement = globalThis.HTMLElement;
    const batches = [];
    globalThis.HTMLElement = class HTMLElement {};
    globalThis.window = {
        addEventListener: () => {}, removeEventListener: () => {},
        eveBevyUiRuntime: {
            hitTestAtClientPoint: () => ({
                nodeId: 'project_view_list_entry_1',
                box: { x: 0, y: 40, width: 300, height: 40 }, point: { x: 100, y: 78 }
            })
        },
        Atome: {
            commitBatch: async (events, options) => {
                batches.push({ events, options });
                return { ok: true };
            }
        }
    };
    try {
        const list = createProjectViewListContent({ requestRefresh: () => {} });
        await list.load({
            projectId: 'project_list_insert',
            readList: async () => [
                { atome_id: 'first', atome_type: 'image', meta: { project_id: 'project_list_insert' }, properties: { name: 'First' } },
                { atome_id: 'second', atome_type: 'image', meta: { project_id: 'project_list_insert' }, properties: { name: 'Second' } }
            ]
        });
        await list.handleEvent({ type: 'project_view.list.drag.start', id: 'first', event: { client_x: 0, client_y: 0 } });
        await list.handleEvent({ type: 'project_view.list.drag.move', event: { client_x: 100, client_y: 78 } });
        const result = await list.handleEvent({ type: 'project_view.list.drag.end', event: { client_x: 100, client_y: 78 } });
        assert.equal(result.ok, true);
        assert.equal(result.slot, 2);
        assert.deepEqual(batches[0].events.map((event) => [event.atome_id, event.props.hierarchy_order]), [
            ['second', 0], ['first', 1]
        ]);
        assert.equal(batches[0].options.refreshState, true);
        assert.equal(batches[0].options.realtimeBroadcast, true);
    } finally {
        globalThis.window = previousWindow;
        globalThis.HTMLElement = previousHTMLElement;
    }
});

test('Matrix center overlap stays inert before 500ms and illuminates only after the deadline', async () => {
    const previousWindow = globalThis.window;
    const previousHTMLElement = globalThis.HTMLElement;
    const batches = [];
    const motions = [];
    vi.useFakeTimers();
    globalThis.HTMLElement = class HTMLElement {};
    globalThis.window = {
        addEventListener: () => {}, removeEventListener: () => {},
        eveBevyUiRuntime: {
            hitTestAtClientPoint: () => ({
                nodeId: 'project_view_matrix_tile_1',
                box: { x: 0, y: 0, width: 100, height: 100 }, point: { x: 50, y: 50 }
            })
        },
        Atome: { commitBatch: async (events) => { batches.push(events); return { ok: true }; } }
    };
    try {
        const matrix = createProjectViewMatrixContent({ requestRefresh: () => {} });
        await matrix.load({
            projectId: 'project_matrix_overlap',
            readList: async () => [
                { atome_id: 'first', atome_type: 'image', meta: { project_id: 'project_matrix_overlap' }, properties: { name: 'First' } },
                { atome_id: 'second', atome_type: 'image', meta: { project_id: 'project_matrix_overlap' }, properties: { name: 'Second' } }
            ]
        });
        await matrix.handleEvent({ type: 'project_view.matrix.drag.start', id: 'first', event: { client_x: 0, client_y: 0 } });
        await matrix.handleEvent({ type: 'project_view.matrix.drag.move', event: { client_x: 50, client_y: 50 } }, {
            patchMotion: (updates) => { motions.push(...updates); }
        });
        vi.advanceTimersByTime(499);
        let tiles = matrix.build({ width: 600, height: 500, emit: () => {} })[0].children[0].children[0].children;
        assert.equal(tiles[1].style.border, undefined);
        const early = await matrix.handleEvent({ type: 'project_view.matrix.drag.end', event: { client_x: 50, client_y: 50 } });
        assert.equal(early.ignored, true);
        assert.equal(batches.length, 0);

        await matrix.handleEvent({ type: 'project_view.matrix.drag.start', id: 'first', event: { client_x: 0, client_y: 0 } });
        await matrix.handleEvent({ type: 'project_view.matrix.drag.move', event: { client_x: 50, client_y: 50 } }, {
            patchMotion: (updates) => { motions.push(...updates); }
        });
        vi.advanceTimersByTime(500);
        tiles = matrix.build({ width: 600, height: 500, emit: () => {} })[0].children[0].children[0].children;
        assert.deepEqual(tiles[1].style.border, [3, 3, 3, 3]);
        assert.equal(motions.some((update) => update.nodeId === 'project_view_matrix_tile_1'
            && Array.isArray(update.style?.background)), true);
        await matrix.handleEvent({ type: 'project_view.matrix.drag.cancel' });
    } finally {
        vi.useRealTimers();
        globalThis.window = previousWindow;
        globalThis.HTMLElement = previousHTMLElement;
    }
});

test('Matrix overlap calls the canonical Molecule owner only after 500ms and release', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    vi.useFakeTimers();
    globalThis.window = {
        eveBevyUiRuntime: {
            hitTestAtClientPoint: ({ ignoredNodeIds = [] } = {}) => ({
                nodeId: ignoredNodeIds.includes('project_view_matrix_drag_preview')
                    ? 'project_view_matrix_tile_1'
                    : 'project_view_matrix_drag_preview',
                box: { x: 0, y: 0, width: 100, height: 100 }, point: { x: 50, y: 50 }
            })
        }
    };
    try {
        const rows = [
            { id: 'first', properties: { molecule_entity: 'atome' } },
            { id: 'second', properties: { molecule_entity: 'atome' } }
        ];
        const state = {
            projectId: 'project_matrix_merge', rows, records: rows,
            selectedIds: [], dragSession: null, dragPreview: null
        };
        const runtime = createProjectViewMatrixDragRuntime({
            state,
            rowFor: (id) => rows.find((row) => row.id === id) || null,
            load: async () => ({ ok: true }), requestRefresh: () => {},
            absorb: async (input) => { calls.push(input); return { ok: true, operation: 'merge' }; }
        });
        runtime.matrixDrag.begin('first', { client_x: 0, client_y: 0 });
        runtime.matrixDrag.move({ client_x: 50, client_y: 50 });
        vi.advanceTimersByTime(499);
        const early = await runtime.matrixDrag.end({ client_x: 50, client_y: 50 });
        assert.equal(early.ignored, true);
        assert.deepEqual(calls, []);

        runtime.matrixDrag.begin('first', { client_x: 0, client_y: 0 });
        runtime.matrixDrag.move({ client_x: 50, client_y: 50 });
        vi.advanceTimersByTime(500);
        runtime.matrixDrag.move({ client_x: 60, client_y: 50 });
        const merged = await runtime.matrixDrag.end({ client_x: 60, client_y: 50 });
        assert.equal(merged.operation, 'merge');
        assert.deepEqual(calls, [{
            projectId: 'project_matrix_merge', sourceId: 'first', targetId: 'second'
        }]);
    } finally {
        vi.useRealTimers();
        globalThis.window = previousWindow;
    }
});

test('List overlap reaches the canonical Molecule owner after the same 500ms release', async () => {
    const previousWindow = globalThis.window;
    const batches = [];
    vi.useFakeTimers();
    const records = [
        { atome_id: 'first', type: 'shape', project_id: 'project_list_merge', parent_id: 'project_list_merge', properties: {} },
        { atome_id: 'second', type: 'shape', project_id: 'project_list_merge', parent_id: 'project_list_merge', properties: {} }
    ];
    const entries = records.map((record) => ({
        id: record.atome_id,
        label: record.atome_id,
        visualRecord: { ...record, id: record.atome_id, properties: { molecule_entity: 'atome' } }
    }));
    globalThis.window = {
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
        CustomEvent: class CustomEvent {},
        eveBevyUiRuntime: {
            hitTestAtClientPoint: ({ ignoredNodeIds = [] } = {}) => ({
                nodeId: ignoredNodeIds.includes('project_view_list_drag_preview')
                    ? 'project_view_list_entry_1_name'
                    : 'project_view_list_drag_preview',
                box: { x: 0, y: 0, width: 100, height: 100 },
                point: { x: 50, y: 50 }
            })
        },
        Atome: {
            listStateCurrent: async () => records,
            commitBatch: async (events) => { batches.push(events); return { ok: true }; }
        },
        eveToolBase: { loadProjectAtomes: async () => ({ ok: true }) }
    };
    try {
        const state = {
            projectId: 'project_list_merge', entries, records,
            selectedIds: [], primaryId: null, dragSession: null, dragPreview: null,
            readList: async () => []
        };
        const runtime = createProjectViewListDragRuntime({
            state,
            entryFor: (id) => entries.find((entry) => entry.id === id) || null,
            load: async () => ({ ok: true }), requestRefresh: async () => {},
            rebuildEntries: () => {}, timelineApi: () => null
        });
        runtime.listDrag.begin('first', { client_x: 0, client_y: 0 });
        runtime.listDrag.move({ client_x: 50, client_y: 50 });
        vi.advanceTimersByTime(500);
        runtime.listDrag.move({ client_x: 60, client_y: 50 });
        const result = await runtime.listDrag.end({ client_x: 60, client_y: 50 });
        assert.equal(result.operation, 'create');
        assert.equal(batches.length, 1);
        assert.deepEqual(new Set(batches[0].slice(1).map((event) => event.atome_id)), new Set(['first', 'second']));
    } finally {
        vi.useRealTimers();
        globalThis.window = previousWindow;
    }
});

test('dropping a direct List member on the footer Back button runs one canonical extraction batch', async () => {
    const previousWindow = globalThis.window;
    const batches = [];
    const projectId = 'project_list_extract';
    const members = ['first', 'middle', 'last'].map((id, hierarchy_order) => ({
        atome_id: id, type: 'shape', project_id: projectId, parent_id: 'molecule_extract',
        properties: { hierarchy_order, duration_sec: hierarchy_order + 1 }
    }));
    const timeline = buildCanonicalMoleculeTimeline({
        projectId, moleculeId: 'molecule_extract', members
    });
    const owner = {
        atome_id: 'molecule_extract', type: 'group', project_id: projectId, parent_id: projectId,
        properties: { kind: 'group', molecule_timeline: timeline }
    };
    const records = [owner, ...members];
    const entries = members.map((record) => ({
        id: record.atome_id,
        label: record.atome_id,
        visualRecord: { ...record, id: record.atome_id, properties: { ...record.properties, molecule_entity: 'atome' } }
    }));
    globalThis.window = {
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
        CustomEvent: class CustomEvent {},
        eveBevyUiRuntime: {
            hitTestAtClientPoint: () => ({
                nodeId: 'project_view_footer_back',
                box: { x: 0, y: 0, width: 48, height: 48 }, point: { x: 24, y: 24 }
            })
        },
        Atome: {
            commitBatch: async (events, options) => { batches.push({ events, options }); return { ok: true }; }
        },
        eveMoleculeTimelineApi: { listOpenGroupTimelines: () => ({ timelines: [] }) }
    };
    try {
        resetProjectViewNavigation(projectId, 'Extract');
        enterProjectViewLevel({
            id: owner.atome_id,
            properties: { name: 'Molecule', molecule_entity: 'molecule', owner_atome_id: owner.atome_id }
        });
        const state = {
            projectId, entries, records,
            selectedIds: [], primaryId: null, dragSession: null, dragPreview: null,
            readList: async () => records
        };
        const runtime = createProjectViewListDragRuntime({
            state,
            entryFor: (id) => entries.find((entry) => entry.id === id) || null,
            load: async () => ({ ok: true }), requestRefresh: async () => {},
            rebuildEntries: () => {}, timelineApi: () => globalThis.window.eveMoleculeTimelineApi
        });
        runtime.listDrag.begin('middle', { client_x: 10, client_y: 10 });
        runtime.listDrag.move({ client_x: 24, client_y: 24 });
        const result = await runtime.listDrag.end({ client_x: 24, client_y: 24 });
        assert.equal(result.ok, true);
        assert.equal(result.operation, 'extract');
        assert.equal(result.member_id, 'middle');
        assert.equal(batches.length, 1);
        assert.equal(batches[0].events.find((event) => event.atome_id === 'middle').parent_id, projectId);
        assert.deepEqual(result.timeline.clips.map((clip) => clip.source.atome_id), ['first', 'last']);
    } finally {
        globalThis.window = previousWindow;
    }
});
