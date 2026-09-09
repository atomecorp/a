import assert from 'node:assert/strict';
import { test, vi } from "vitest";
import { createProjectViewWindowState, loadProjectViewPage, resetProjectViewWindowState } from "../../eVe/domains/rendering/project_view_records.js";
import { createProjectViewMatrixContent } from "../../eVe/domains/rendering/project_view_matrix_content.js";



import { enterProjectViewLevel, resetProjectViewNavigation } from "../../eVe/domains/rendering/project_view_navigation.js";
import { readCurrentInsertionTarget } from "../../eVe/domains/rendering/project_view_insertion_target.js";
import { compileProjectViewTransportPlan } from '../../eVe/domains/rendering/project_view_transport_plan.js';

test('Matrix transports the full nested hierarchy independently of visible cells', async () => {
    const projectId = 'nested_matrix';
    const records = [
        { id: 'outer', type: 'group', parent_id: projectId, properties: { molecule_entity: 'molecule', playback_mode: 'simultaneous' } },
        { id: 'inner', type: 'group', parent_id: 'outer', properties: { molecule_entity: 'molecule', playback_mode: 'sequential' } },
        ...[2, 3, 5].map((duration, index) => ({ id: `leaf_${index}`, type: 'text', parent_id: index < 2 ? 'inner' : 'outer', properties: { text: 'Leaf', duration, hierarchy_order: index } }))
    ].map(record => ({ ...record, meta: { project_id: projectId } }));
    const matrix = createProjectViewMatrixContent({ requestRefresh() {} });
    resetProjectViewNavigation(projectId);
    await matrix.load({ projectId, readList: async () => records });
    assert.deepEqual(matrix.levelChildren().map(record => record.id), ['outer']);
    const loaded = await matrix.transportRecords();
    assert.equal(loaded.records.length, 5);
    const plan = compileProjectViewTransportPlan({ rootId: 'outer', records: loaded.records });
    assert.equal(plan.durationSeconds, 5);
    assert.equal(plan.leaves.length, 3);
});


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

test('a boot snapshot feeds the structured view without a duplicate native-state read', async () => {
    const readList = vi.fn(async () => {
        throw new Error('duplicate_native_state_read');
    });
    const result = await loadProjectViewPage({
        projectId: 'project_boot_snapshot',
        windowState: createProjectViewWindowState(),
        readList,
        sourceRecords: [{
            atome_id: 'boot_shape',
            atome_type: 'shape',
            meta: { project_id: 'project_boot_snapshot' },
            properties: { name: 'Already loaded' }
        }]
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.records.map((record) => record.id), ['boot_shape']);
    assert.equal(readList.mock.calls.length, 0);
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

test('depth projection loads complete sibling membership beyond one canonical page', async () => {
    const all=Array.from({length:205},(_,i)=>({id:`depth_${i}`,type:'shape',project_id:'depth_project',parent_id:'depth_project',properties:{hierarchy_order:i,z_index:i}}));
    const offsets=[];const windowState=createProjectViewWindowState();
    const loaded=await loadProjectViewPage({projectId:'depth_project',windowState,orderKind:'depth',readList:async(_,options)=>{
        offsets.push(options.offset);return {records:all.slice(options.offset,options.offset+options.limit),totalCount:all.length};
    }});
    assert.equal(loaded.ok,true);
    assert.equal(loaded.records.length,205);
    assert.deepEqual(offsets,[0,200]);
    assert.equal(windowState.hasNext,false);
});


test('Matrix activate handlers keep distinct cell identities through cumulative selection', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('');
    const previousWindow = globalThis.window;
    globalThis.window = dom.window;
    const selection = await import('../../eVe/intuition/runtime/selection.js');
    selection.syncSelectionState([]);
    try {
        const matrix = createProjectViewMatrixContent({ requestRefresh: () => {} });
        await matrix.load({ projectId: 'matrix_cumulative', readList: async () => ['first', 'second'].map((id) => ({
            atome_id: id, atome_type: 'text', meta: { project_id: 'matrix_cumulative' }, properties: { name: id, text: id }
        })) });
        await matrix.load({ projectId: 'matrix_cumulative', readList: async () => ['second', 'first'].map((id) => ({
            atome_id: id, atome_type: 'text', meta: { project_id: 'matrix_cumulative' }, properties: { name: id, text: id }
        })) });
        const buildTiles = () => matrix.build({ width: 600, height: 500, emit: (intent) => matrix.handleEvent(intent) })[0].children[0].children[0].children;
        await buildTiles()[0].on.activate({});
        assert.deepEqual(matrix.readState().selectedIds, ['first']);
        await buildTiles()[1].on.activate({ meta_key: true });
        assert.deepEqual(matrix.readState().selectedIds, ['first', 'second']);
    } finally {
        selection.syncSelectionState([]); dom.window.close(); globalThis.window = previousWindow;
    }
});
