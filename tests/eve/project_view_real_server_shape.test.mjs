import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    createProjectViewWindowState,
    loadProjectViewPage
} from '../../eVe/domains/rendering/project_view_records.js';
import { createProjectViewMatrixContent } from '../../eVe/domains/rendering/project_view_matrix_content.js';

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
    globalThis.HTMLElement = class HTMLElement {};
    globalThis.window = {
        eveBevyUiRuntime: {
            hitTestAtClientPoint: () => ({ nodeId: `project_view_matrix_tile_${targetIndex}` })
        },
        eveToolBase: {
            updateAtomeProperties: async (id, properties) => {
                writes.push({ id, properties });
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
            await matrix.handleEvent({ type: 'project_view.matrix.drag.start', id: 'first', event: { client_x: 0, client_y: 0 } });
            await matrix.handleEvent({ type: 'project_view.matrix.drag.move', event: { client_x: 20, client_y: 20 } });
            const result = await matrix.handleEvent({ type: 'project_view.matrix.drag.end', event: { client_x: 20, client_y: 20 } });
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
        eveBevyUiRuntime: {
            hitTestAtClientPoint: () => ({ nodeId: 'project_view_matrix_tile_1' })
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
        await matrix.handleEvent({ type: 'project_view.matrix.drag.move', event: { client_x: 20, client_y: 20 } });
        const result = await matrix.handleEvent({ type: 'project_view.matrix.drag.end', event: { client_x: 20, client_y: 20 } });
        assert.equal(result.ok, true);
        assert.deepEqual(batches, [[
            { kind: 'set', atome_id: 'second', props: { hierarchy_order: 0 } },
            { kind: 'set', atome_id: 'first', props: { hierarchy_order: 1 } }
        ]]);
    } finally {
        globalThis.window = previousWindow;
        globalThis.HTMLElement = previousHTMLElement;
    }
});
