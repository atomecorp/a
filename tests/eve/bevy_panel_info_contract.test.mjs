import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';

import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';
import { createInfoPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js';
import { hierarchyEntries } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_info_model.js';
import { executeBootstrapDuplicateOperation } from '../../eVe/intuition/tools/core/tool_runtime_atome_mutation.js';
import { buildAtomeContextualEditTree, ATOME_CONTEXTUAL_EDIT_TREE_ID } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_model.js';
import { createAtomeContextualToolDropRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_tool_drop_runtime.js';
import { createAtomeEditFooterModelRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_edit_footer_model_runtime.js';
import { projectViewPlayback } from '../../eVe/domains/rendering/project_view_playback_runtime.js';
import { createFinderPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js';
import {
    createSelectableListDragSession,
    hierarchicalSelectableListNode,
    virtualizedHierarchicalSelectableListNode,
    virtualizedListCountLabel
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list.js';

const ROOT = new URL('../../', import.meta.url);
const source = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const lineCount = (path) => source(path).trimEnd().split('\n').length;
const visit = (node, callback) => {
    if (!node) return;
    callback(node);
    (node.children || []).forEach((child) => visit(child, callback));
};
const find = (nodes, id) => {
    let result = null;
    nodes.forEach((node) => visit(node, (candidate) => {
        if (candidate.id === id) result = candidate;
    }));
    return result;
};
const withTotal = (records, total) => {
    Object.defineProperty(records, 'totalCount', { value: total, enumerable: false });
    return records;
};

const records = [
    {
        atome_id: 'project_a', type: 'project', properties: { name: 'Project A' }
    },
    {
        atome_id: 'parent_a', type: 'shape', project_id: 'project_a', parent_id: 'project_a',
        properties: { name: 'Parent', color: '#112233', width: 220, height: 120, locked: false }
    },
    {
        atome_id: 'child_a', type: 'text', project_id: 'project_a', parent_id: 'parent_a',
        owner_id: 'owner_a',
        properties: { name: 'Child', text: 'Hello', width: 120, height: 48, locked: true, metadata: { stable: true } }
    }
];

test('Info derives selection hierarchy detail and preview from canonical state without DOM controls', async () => {
    const previewCalls = [];
    const subscriptions = [];
    const runtime = createInfoPanelSurface({
        readAll: async () => records,
        readOne: async (id) => records.find((record) => record.atome_id === id) || null,
        readSelection: () => ['child_a'],
        selectAtome: () => 'child_a',
        persist: async () => ({ ok: true }),
        copyText: async () => ({ ok: true }),
        renderPreview: async (input) => {
            previewCalls.push(input);
            return { ok: true, preview_url: 'data:image/webp;base64,AA==' };
        },
        events: { on: (name, handler) => { subscriptions.push({ name, handler }); return () => true; } }
    });

    await runtime.load();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const snapshot = runtime.surface.readState();
    const nodes = runtime.surface.buildContent(snapshot, { emit: () => {}, bodyWidth: 430 });

    assert.equal(snapshot.primary.id, 'child_a');
    assert.equal(snapshot.selected.length, 1);
    assert.equal(snapshot.immutable.find((row) => row.key === 'parent').value, 'parent_a');
    assert.equal(snapshot.properties.find((entry) => entry.key === 'metadata').editable, false);
    assert.equal(snapshot.properties.find((entry) => entry.key === 'locked').editable, true);
    assert.equal(snapshot.properties.some((entry) => entry.key === 'type' || entry.key === 'parent_id'), false);
    assert.ok(find(nodes, 'info_selection_summary'));
    assert.ok(find(nodes, 'info_immutable_table'));
    assert.ok(find(nodes, 'info_property_locked_toggle'));
    assert.ok(find(nodes, 'info_property_metadata_value'));
    assert.equal(previewCalls.length, 1);
    assert.equal(previewCalls[0].forceCapture, true);
    assert.equal(previewCalls[0].records.length, 1);
    assert.equal(previewCalls[0].records[0].properties.left, 24);
    assert.equal(globalThis.document?.querySelectorAll?.('button,input,select,textarea').length || 0, 0);
});

test('Info property mutations use one canonical commit batch and never mutate the canonical read record first', async () => {
    const persisted = [];
    const canonical = records.map((record) => ({ ...record, properties: { ...record.properties } }));
    const runtime = createInfoPanelSurface({
        readAll: async () => canonical,
        readOne: async (id) => canonical.find((record) => record.atome_id === id) || null,
        readSelection: () => ['child_a'],
        selectAtome: () => 'child_a',
        persist: async (events) => {
            assert.equal(canonical[2].properties.locked, true, 'derived UI state must not pre-mutate canonical records');
            persisted.push(events);
            return { ok: true };
        },
        renderPreview: async () => ({ ok: true, preview_url: '' }),
        copyText: async () => ({ ok: true }),
        events: { on: () => () => true }
    });
    await runtime.load();
    const result = await runtime.surface.handleEvent({ type: 'info.field.boolean', key: 'locked', value: false });

    assert.equal(result.ok, true);
    assert.deepEqual(persisted, [[{
        kind: 'set', atome_id: 'child_a', project_id: 'project_a', props: { locked: false }
    }]]);
    assert.equal(canonical[2].properties.locked, true);
});

test('Info edits a contextual Molecule Track through its canonical mutation callback', async () => {
    const calls = [];
    const runtime = createInfoPanelSurface({
        readSelection: () => [],
        renderPreview: async () => { throw new Error('contextual preview must stay disabled'); },
        events: { on: () => () => true }
    });
    await runtime.showContextualRecord({
        atome_id: 'molecule-track:timeline_a:voice',
        type: 'molecule_track', kind: 'track', project_id: 'project_a',
        properties: { name: 'Voice', track_type: 'audio', mute: false },
        contextual_info: {
            no_preview: true,
            readonly_fields: ['track_type'],
            commit_property: async (key, value) => {
                calls.push({ key, value });
                return { properties: { name: 'Voice', track_type: 'audio', mute: value } };
            }
        }
    });
    const before = runtime.surface.readState();
    assert.equal(before.primary.id, 'molecule-track:timeline_a:voice');
    assert.equal(before.properties.find((entry) => entry.key === 'track_type').editable, false);
    await runtime.load();
    assert.equal(runtime.surface.readState().primary.id, 'molecule-track:timeline_a:voice');
    const result = await runtime.surface.handleEvent({ type: 'info.field.boolean', key: 'mute', value: true });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [{ key: 'mute', value: true }]);
    assert.equal(runtime.surface.readState().properties.find((entry) => entry.key === 'mute').value, true);
});

test('Info hierarchy preserves depth and only reveals descendants of expanded parents', () => {
    const collapsed = hierarchyEntries(records, new Set(), ['child_a']);
    assert.deepEqual(collapsed.map((entry) => entry.id), ['project_a']);
    const expanded = hierarchyEntries(records, new Set(['project_a', 'parent_a']), ['child_a']);
    assert.deepEqual(expanded.map(({ id, depth }) => [id, depth]), [
        ['project_a', 0], ['parent_a', 1], ['child_a', 2]
    ]);
    assert.equal(expanded.at(-1).selected, true);
});

test('Info lazily reads independent project and global pages and never projects more than 200 rows per page', async () => {
    const calls = [];
    const projectPage = Array.from({ length: 200 }, (_, index) => ({
        atome_id: `project_record_${index}`, type: index === 0 ? 'panel' : 'generic',
        project_id: 'project_a', properties: { name: `Project ${index}`, visible: index % 2 === 0 }
    }));
    const globalFirst = Array.from({ length: 200 }, (_, index) => ({
        atome_id: `global_record_${index}`, type: index === 0 ? 'tool' : (index === 1 ? 'panel' : 'activity'),
        properties: { name: `Global ${index}` }
    }));
    const globalSecond = [{ atome_id: 'global_last', type: 'blackHole', properties: { name: 'Last' } }];
    const runtime = createInfoPanelSurface({
        readAll: async (projectId, options) => {
            calls.push({ projectId, ...options });
            if (projectId) return withTotal(projectPage, 199);
            return withTotal(options.offset === 0 ? globalFirst : globalSecond, 201);
        },
        readSelection: () => [],
        readProjectId: () => 'project_a',
        renderPreview: async () => ({ ok: true, preview_url: '' }),
        events: { on: () => () => true }
    });

    await runtime.load();
    assert.deepEqual(calls, [], 'collapsed lists must not read canonical pages');
    await runtime.surface.handleEvent({ type: 'info.accordion.toggle', key: 'project' });
    await runtime.surface.handleEvent({ type: 'info.accordion.toggle', key: 'all' });
    assert.deepEqual(calls, [
        { projectId: 'project_a', limit: 200, offset: 0, includeTotal: true, excludeSystem: true },
        { projectId: null, limit: 200, offset: 0, includeTotal: true, excludeSystem: false }
    ]);
    let snapshot = runtime.surface.readState();
    assert.equal(snapshot.projectEntries.length, 199);
    assert.equal(snapshot.allEntries.length, 200);
    assert.equal(snapshot.allEntries.some((entry) => entry.id === 'global_record_0'), true, 'tools remain in All atomes');
    assert.equal(snapshot.projectEntries.some((entry) => entry.id === 'project_record_0'), false, 'system panels never enter Project atomes');
    assert.equal(snapshot.pages.project.totalCount, 199);
    assert.equal(snapshot.pages.all.totalCount, 201);
    const listNodes = runtime.surface.buildContent(snapshot, { emit: () => {}, bodyWidth: 430 });
    assert.ok(find(listNodes, 'info_project_hierarchy_virtual_list'));
    assert.ok(find(listNodes, 'info_all_hierarchy_virtual_list'));
    assert.equal(find(listNodes, 'info_all_previous'), null);
    assert.equal(find(listNodes, 'info_all_next'), null);

    await runtime.surface.handleEvent({ type: 'info.list.window', key: 'all', pageIndex: 1 });
    snapshot = runtime.surface.readState();
    assert.deepEqual(calls.at(-1), {
        projectId: null, limit: 200, offset: 200, includeTotal: true, excludeSystem: false
    });
    assert.deepEqual(snapshot.allEntries.map((entry) => entry.id), ['global_last']);
    assert.equal(snapshot.pages.all.hasNext, false);
});

test('Info preloads page metadata on open and shows exact totals while both lists stay collapsed', async () => {
    const calls = [];
    const runtime = createInfoPanelSurface({
        readAll: async (projectId, options) => {
            calls.push({ projectId, ...options });
            return withTotal([], projectId ? 37 : 812);
        },
        readSelection: () => [],
        readProjectId: () => 'project_a',
        renderPreview: async () => ({ ok: true, preview_url: '' }),
        events: { on: () => () => true }
    });

    const cleanup = runtime.surface.onOpen({ refresh: () => {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const snapshot = runtime.surface.readState();
    const nodes = runtime.surface.buildContent(snapshot, { emit: () => {}, bodyWidth: 430 });

    assert.deepEqual(calls, [
        { projectId: 'project_a', limit: 1, offset: 0, includeTotal: true, excludeSystem: true },
        { projectId: null, limit: 1, offset: 0, includeTotal: true, excludeSystem: false }
    ]);
    assert.match(find(nodes, 'info_project_accordion_label').text, /\(37\)$/);
    assert.match(find(nodes, 'info_all_accordion_label').text, /\(812\)$/);
    assert.equal(find(nodes, 'info_project_hierarchy_virtual_list'), null);
    assert.equal(find(nodes, 'info_all_hierarchy_virtual_list'), null);
    cleanup();
});

test('Info keeps thirty page projections bounded and below the existing 350 ms p95 budget', async () => {
    const runtime = createInfoPanelSurface({
        readAll: async (_projectId, { offset }) => Array.from({ length: 200 }, (_, index) => ({
            atome_id: `record_${offset + index}`, type: index % 5 === 0 ? 'tool' : 'shape',
            properties: { name: `Record ${offset + index}` }
        })),
        readSelection: () => [],
        readProjectId: () => 'project_a',
        renderPreview: async () => ({ ok: true, preview_url: '' }),
        events: { on: () => () => true }
    });
    runtime.state.expanded.add('all');
    const durations = [];
    for (let page = 0; page < 30; page += 1) {
        const started = performance.now();
        await runtime.loadPage('all', page);
        const snapshot = runtime.surface.readState();
        runtime.surface.buildContent(snapshot, { emit: () => {}, bodyWidth: 430 });
        durations.push(performance.now() - started);
        assert.equal(snapshot.allEntries.length, 200);
        assert.equal(runtime.state.pages.all.records.length, 200);
    }
    durations.sort((left, right) => left - right);
    assert.ok(durations[Math.floor(durations.length * 0.95)] <= 350);
});

test('shared Bevy list virtualizes a bounded window and resolves scroll pages for Infos and Finder reuse', () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({
        id: `row_${index}`, value: `row_${index}`, label: `Row ${index}`
    }));
    const windows = [];
    const result = virtualizedHierarchicalSelectableListNode({
        id: 'shared_records', entries, width: 420,
        windowState: { pageIndex: 0, pageSize: 200, recordCount: 200, totalCount: 450, hasNext: true },
        onWindowChange: (pageIndex) => windows.push(pageIndex)
    });
    let rows = 0;
    visit(result.node, (candidate) => {
        if (/^shared_records_entry_\d+$/.test(candidate.id || '')) rows += 1;
    });
    assert.ok(rows > 0 && rows <= 20, 'the shared tree constructs only the viewport plus bounded overscan');
    result.node.on.scroll({ scroll_offset_y: 7400, scroll_viewport_height: 320 });
    assert.deepEqual(windows, [1]);
    assert.equal(virtualizedListCountLabel({ totalCount: 450 }, 200), '450');
});

test('shared Bevy list drag arms synchronously while canonical selection hydration remains asynchronous', async () => {
    const state = {};
    let releaseHydration;
    let dropped = false;
    const drag = createSelectableListDragSession({
        state,
        resolvePayload: () => ({ ok: true, selectionIds: ['image_a'] }),
        onArm: () => new Promise((resolve) => { releaseHydration = resolve; }),
        onDrop: () => { dropped = true; return { ok: true }; }
    });
    assert.equal(drag.begin('image_a', { client_x: 10, client_y: 10 }).armed, true);
    assert.equal(drag.move({ client_x: 40, client_y: 40 }).dragging, true,
        'the first move must not be lost behind state hydration');
    const ending = drag.end({ client_x: 200, client_y: 200 });
    assert.equal(dropped, false);
    releaseHydration();
    assert.equal((await ending).ok, true);
    assert.equal(dropped, true);
});

test('shared Bevy list drag owns move and cancel lifecycle for Infos, Finder and future consumers', () => {
    const state = {};
    const calls = [];
    const drag = createSelectableListDragSession({
        state,
        sessionKey: 'sharedDrag',
        resolvePayload: () => ({ ok: true, payload: { kind: 'tool' } }),
        onMove: ({ payload }) => { calls.push(['move', payload.kind]); return { ok: true }; },
        onCancel: ({ payload } = {}) => calls.push(['cancel', payload?.kind || 'none'])
    });
    drag.begin('tool_a', { client_x: 0, client_y: 0 });
    drag.move({ client_x: 20, client_y: 20 });
    drag.cancel();
    assert.deepEqual(calls, [['move', 'tool'], ['cancel', 'tool']]);
    assert.equal(state.sharedDrag, null);
});

test('shared Bevy list drag preserves the pointer anchor when its drop target changes', () => {
    const state = {};
    const refreshes = [];
    const drag = createSelectableListDragSession({
        state,
        resolvePayload: () => ({ ok: true }),
        onMove: () => ({ ok: true, refresh: true })
    });
    drag.begin('item_a', { client_x: 5, client_y: 5, node_id: 'project_view_list_entry_0_name' });
    drag.move({ client_x: 25, client_y: 25 }, {
        refresh: (options) => refreshes.push(options)
    });
    drag.move({ client_x: 35, client_y: 35 }, {
        refresh: (options) => refreshes.push(options)
    });
    assert.deepEqual(refreshes, [
        { preserveNodeId: 'project_view_list_entry_0_name' },
        { preserveNodeId: 'project_view_list_entry_0_name' }
    ]);
});

test('shared Bevy list exposes an insertion marker without moving row hit geometry', () => {
    const result = hierarchicalSelectableListNode({
        id: 'reorder_list', width: 300, rowHeight: 32,
        insertionSlot: 2,
        entries: [
            { id: 'first', value: 'first', label: 'First', dragging: true },
            { id: 'second', value: 'second', label: 'Second' },
            { id: 'third', value: 'third', label: 'Third' }
        ]
    });
    const [first, second, third, marker] = result.node.children;
    assert.equal(first.style.opacity, 0.38);
    assert.equal(second.style.border, undefined, 'an insertion slot never illuminates a row');
    assert.equal(third.style.position[1], second.style.position[1] * 2,
        'the insertion hint must not move the row under the pointer');
    assert.equal(marker.id, 'reorder_list_insertion_marker');
    assert.equal(marker.style.position[1] + (marker.style.size[1] / 2), third.style.position[1]);
});

test('Info migration retires every HTML source and keeps only a DOM-free Bevy bridge', () => {
    const retired = [
        'eVe/intuition/tools/infos_state.js',
        'eVe/intuition/tools/infos_model_a.js',
        'eVe/intuition/tools/infos_model_b.js',
        'eVe/intuition/tools/infos_model_c.js',
        'eVe/intuition/tools/infos_render_a.js',
        'eVe/intuition/tools/infos_render_b.js',
        'eVe/intuition/tools/infos_render_c.js',
        'eVe/intuition/runtime/info_panel_sync_runtime.js'
    ];
    retired.forEach((path) => assert.equal(existsSync(new URL(path, ROOT)), false, `${path} must be retired`));
    const bridge = source('eVe/intuition/tools/infos.js');
    assert.match(bridge, /openBevyPanelSurface\('info'/);
    assert.match(bridge, /closeBevyPanelSurface\('info'/);
    assert.doesNotMatch(bridge, /createEve|document\.|innerHTML|createElement|eveInfoPanelUpdate/);
    assert.equal(PANEL_SURFACE_DEFINITIONS.info.surface_id, 'eve_bevy_panel_info');

    const packageSources = [
        'eVe/intuition/runtime/bevy_panel/bevy_panel_info_model.js',
        'eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js',
        'eVe/intuition/runtime/bevy_panel/bevy_panel_info_drag_runtime.js',
        'eVe/intuition/runtime/bevy_panel/bevy_panel_info_view.js',
        'eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js'
    ];
    packageSources.forEach((path) => {
        assert.ok(lineCount(path) <= 500, `${path} must remain within the mandatory file-size ceiling`);
        assert.doesNotMatch(source(path), /document\.|createElement|innerHTML|createEveDialog/);
    });
    const runtimeSource = source(packageSources.at(-1));
    const viewSource = source('eVe/intuition/runtime/bevy_panel/bevy_panel_info_view.js');
    const sharedListSource = source('eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list.js');
    const finderRuntimeSource = source('eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js');
    assert.match(runtimeSource, /listStateCurrent/);
    assert.match(runtimeSource, /commitBatch/);
    assert.match(runtimeSource, /renderProjectPreview/);
    assert.match(runtimeSource, /events\.on\('atome:changed'/);
    assert.doesNotMatch(runtimeSource, /setInterval|setTimeout|localStorage|sessionStorage/);
    assert.doesNotMatch(`${runtimeSource}\n${viewSource}`, /info\.page\.(previous|next)|eve\.info\.page\./);
    assert.match(sharedListSource, /virtualizedHierarchicalSelectableListNode/);
    assert.match(sharedListSource, /createSelectableListDragSession/);
    assert.match(finderRuntimeSource, /createSelectableListDragSession/);
    assert.doesNotMatch(finderRuntimeSource, /activeToolDragPayload/);
});

test('the historical line registry covers all 3,033 Infos HTML lines without gaps or overlaps', () => {
    const registry = source('todo/ui_bevy/info_html_line_migration_registry.md');
    const expected = new Map([
        ['eVe/intuition/tools/infos.js', 452],
        ['eVe/intuition/tools/infos_state.js', 170],
        ['eVe/intuition/tools/infos_model_a.js', 422],
        ['eVe/intuition/tools/infos_model_b.js', 346],
        ['eVe/intuition/tools/infos_model_c.js', 355],
        ['eVe/intuition/tools/infos_render_a.js', 334],
        ['eVe/intuition/tools/infos_render_b.js', 403],
        ['eVe/intuition/tools/infos_render_c.js', 499],
        ['eVe/intuition/runtime/info_panel_sync_runtime.js', 52]
    ]);
    let total = 0;
    for (const [path, count] of expected) {
        const heading = `## \`${path}\` — ${count} lines`;
        const start = registry.indexOf(heading);
        assert.notEqual(start, -1, `${path} ledger heading must exist`);
        const end = registry.indexOf('\n## ', start + heading.length);
        const section = registry.slice(start, end < 0 ? registry.length : end);
        const ranges = [...section.matchAll(/^\| (\d+)(?:–(\d+))? \|/gm)]
            .map((match) => [Number(match[1]), Number(match[2] || match[1])]);
        assert.ok(ranges.length > 0, `${path} must contain coverage ranges`);
        let next = 1;
        for (const [first, last] of ranges) {
            assert.equal(first, next, `${path} must cover line ${next} next`);
            assert.ok(last >= first, `${path} range must not be inverted`);
            next = last + 1;
        }
        assert.equal(next - 1, count, `${path} must end at its historical line count`);
        total += count;
    }
    assert.equal(total, 3033);
    assert.match(registry, /3,033 \/ 3,033/);
});

test('Info applies SelectionAPI events immediately and projects Contact-style project checkboxes plus typed drag handles', async () => {
    const previousWindow = globalThis.window;
    const listeners = new Map();
    globalThis.window = {
        __eveWorkspaceMode: { mode: 'project' },
        addEventListener: (name, handler) => listeners.set(name, handler),
        removeEventListener: (name) => listeners.delete(name)
    };
    try {
        const runtime = createInfoPanelSurface({
            readAll: async () => records,
            readOne: async (id) => records.find((record) => record.atome_id === id) || null,
            readSelection: () => ['child_a'],
            selectAtome: () => 'child_a',
            readProjectId: () => 'project_a',
            renderPreview: async () => ({ ok: true, preview_url: '' }),
            events: { on: () => () => true }
        });
        await runtime.load();
        const cleanup = runtime.surface.onOpen({ refresh: () => {} });
        await new Promise((resolve) => setTimeout(resolve, 0));
        listeners.get('adole-atome-selected')?.({ detail: { selected: ['parent_a', 'child_a'] } });
        assert.equal(runtime.surface.readState().selected.length, 2, 'counter must update in the selection event turn');

        runtime.state.hierarchyExpanded.add('project_a');
        runtime.state.hierarchyExpanded.add('parent_a');
        await runtime.loadPage('project');
        runtime.state.expanded.add('project');
        const emitted = [];
        const nodes = runtime.surface.buildContent(runtime.surface.readState(), {
            emit: (intent) => emitted.push(intent), bodyWidth: 430
        });
        const parentCheckbox = find(nodes, 'info_project_hierarchy_entry_0_checkbox');
        const parentDrag = find(nodes, 'info_project_hierarchy_entry_0_drag');
        const childCheckbox = find(nodes, 'info_project_hierarchy_entry_1_checkbox');
        assert.ok(parentCheckbox, 'project rows reuse the canonical checkbox');
        assert.equal(parentDrag.kind, 'drag_handle');
        assert.ok(childCheckbox);
        childCheckbox.on.press({ y: 2 });
        parentDrag.on.press({ client_x: 10, client_y: 20 });
        assert.equal(emitted.at(-2).type, 'info.selection.press');
        assert.equal(emitted.at(-1).type, 'info.drag.start');
        cleanup();
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Info drag transports the selected renderable atomes through ui.duplicate and rejects clicks or UI drops', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { __eveWorkspaceMode: { mode: 'project' } };
    const invocations = [];
    const applied = [];
    const surface = {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
        scrollLeft: 0,
        scrollTop: 0
    };
    try {
        const runtime = createInfoPanelSurface({
            readAll: async () => records,
            readOne: async (id) => ({ atome_id: id, type: 'shape', project_id: 'project_a', properties: {} }),
            readSelection: () => ['parent_a', 'child_a'],
            selectAtome: () => null,
            selectBatch: (ids, intent) => applied.push({ ids, intent }),
            readProjectId: () => 'project_a',
            resolveProjectSurface: () => surface,
            readMenuHeight: () => 50,
            resolveBevyRuntime: () => ({ hitTestAtClientPoint: () => null }),
            invokeTool: async (payload) => {
                invocations.push(payload);
                return { ok: true, duplicate_ids: ['copy_parent', 'copy_child'] };
            },
            renderPreview: async () => ({ ok: true, preview_url: '' }),
            events: { on: () => () => true }
        });
        await runtime.load();
        await runtime.surface.handleEvent({ type: 'info.drag.start', id: 'child_a', event: { client_x: 20, client_y: 20 } });
        await runtime.surface.handleEvent({ type: 'info.drag.move', event: { client_x: 40, client_y: 40 } });
        const dropped = await runtime.surface.handleEvent({
            type: 'info.drag.end', event: { client_x: 320, client_y: 260 }
        });
        assert.equal(dropped.ok, true);
        assert.deepEqual(invocations[0].input.selection_ids, ['parent_a', 'child_a']);
        assert.equal(invocations[0].tool_id, 'ui.duplicate');
        assert.equal(invocations[0].action, 'drag.end');
        assert.equal(invocations[0].input.placement_mode, 'preserve_relative');
        assert.deepEqual(applied, [{ ids: ['copy_parent', 'copy_child'], intent: 'replace' }]);

        await runtime.surface.handleEvent({ type: 'info.drag.start', id: 'child_a', event: { client_x: 20, client_y: 20 } });
        const click = await runtime.surface.handleEvent({ type: 'info.drag.end', event: { client_x: 22, client_y: 22 } });
        assert.equal(click.ignored, true);
        assert.equal(invocations.length, 1);

        const blockedRuntime = createInfoPanelSurface({
            readProjectId: () => 'project_a', resolveProjectSurface: () => surface, readMenuHeight: () => 0,
            resolveBevyRuntime: () => ({ hitTestAtClientPoint: () => ({ treeId: 'panel' }) }),
            invokeTool: async () => { throw new Error('must_not_invoke'); }, events: { on: () => () => true }
        });
        blockedRuntime.state.recordsById = new Map(records.map((record) => [record.atome_id, record]));
        blockedRuntime.state.selectedIds = ['child_a'];
        await blockedRuntime.surface.handleEvent({ type: 'info.drag.start', id: 'child_a', event: { client_x: 20, client_y: 20 } });
        await blockedRuntime.surface.handleEvent({ type: 'info.drag.move', event: { client_x: 40, client_y: 40 } });
        const blocked = await blockedRuntime.surface.handleEvent({ type: 'info.drag.end', event: { client_x: 300, client_y: 250 } });
        assert.equal(blocked.cancelled, true);

        for (const scenario of [
            { name: 'menu', point: { client_x: 300, client_y: 570 }, menuHeight: 50, mode: 'project' },
            { name: 'outside', point: { client_x: 900, client_y: 250 }, menuHeight: 0, mode: 'project' },
            { name: 'dashboard', point: { client_x: 300, client_y: 250 }, menuHeight: 0, mode: 'dashboard' }
        ]) {
            let rejectedInvocations = 0;
            globalThis.window.__eveWorkspaceMode = { mode: scenario.mode };
            const rejectedRuntime = createInfoPanelSurface({
                readProjectId: () => 'project_a',
                resolveProjectSurface: () => surface,
                readMenuHeight: () => scenario.menuHeight,
                resolveBevyRuntime: () => ({ hitTestAtClientPoint: () => null }),
                invokeTool: async () => { rejectedInvocations += 1; return { ok: true }; },
                events: { on: () => () => true }
            });
            rejectedRuntime.state.recordsById = new Map(records.map((record) => [record.atome_id, record]));
            rejectedRuntime.state.selectedIds = ['child_a'];
            await rejectedRuntime.surface.handleEvent({
                type: 'info.drag.start', id: 'child_a', event: { client_x: 20, client_y: 20 }
            });
            await rejectedRuntime.surface.handleEvent({
                type: 'info.drag.move', event: { client_x: 45, client_y: 45 }
            });
            const rejected = await rejectedRuntime.surface.handleEvent({
                type: 'info.drag.end', event: scenario.point
            });
            assert.equal(rejected.cancelled, true, `${scenario.name} must reject the drop`);
            assert.equal(rejectedInvocations, 0, `${scenario.name} must not reach ui.duplicate`);
        }
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Info drop reaches the canonical duplicate mutation once and exposes the typed clones in state_current', async () => {
    const previousWindow = globalThis.window;
    const projectId = 'project_atomic_drop';
    const sources = [
        {
            atome_id: 'drop_shape_a', type: 'shape', project_id: projectId, parent_id: projectId,
            properties: { left: '40px', top: '70px', width: '32px', height: '24px', color: '#aabbcc' }
        },
        {
            atome_id: 'drop_text_b', type: 'text', project_id: projectId, parent_id: projectId,
            properties: { left: '90px', top: '110px', width: '80px', height: '22px', text: 'copy me' }
        }
    ];
    const stateCurrent = new Map(sources.map((record) => [record.atome_id, structuredClone(record)]));
    const commits = [];
    const projectionRefreshes = [];
    const appliedSelections = [];
    const surface = {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
        scrollLeft: 0, scrollTop: 0
    };
    globalThis.window = {
        __eveWorkspaceMode: { mode: 'project', projectId },
        Atome: {
            getStateCurrent: async (id) => stateCurrent.get(id) || null,
            commitBatch: async (events, options) => {
                commits.push({ events: structuredClone(events), options: structuredClone(options) });
                events.forEach((event) => stateCurrent.set(event.atome_id, {
                    atome_id: event.atome_id,
                    type: event.type,
                    project_id: event.project_id,
                    parent_id: event.parent_id,
                    properties: structuredClone(event.props)
                }));
                return { ok: true };
            }
        },
        eveToolBase: {
            loadProjectAtomes: async (id, options) => projectionRefreshes.push({ id, options })
        }
    };
    try {
        const runtime = createInfoPanelSurface({
            readOne: async (id) => stateCurrent.get(id) || null,
            readSelection: () => sources.map((record) => record.atome_id),
            selectBatch: (ids, intent) => appliedSelections.push({ ids, intent }),
            readProjectId: () => projectId,
            resolveProjectSurface: () => surface,
            readMenuHeight: () => 50,
            resolveBevyRuntime: () => ({ hitTestAtClientPoint: () => null }),
            invokeTool: ({ tool_id: toolId, input }) => {
                assert.equal(toolId, 'ui.duplicate');
                return executeBootstrapDuplicateOperation(input, { mergeStack: () => ({}) });
            },
            renderPreview: async () => ({ ok: true, preview_url: '' }),
            events: { on: () => () => true }
        });
        runtime.state.pages.project.records = sources;
        runtime.state.recordsById = new Map(sources.map((record) => [record.atome_id, record]));
        runtime.state.selectedIds = sources.map((record) => record.atome_id);
        await runtime.surface.handleEvent({
            type: 'info.drag.start', id: 'drop_shape_a', event: { client_x: 20, client_y: 20 }
        });
        await runtime.surface.handleEvent({ type: 'info.drag.move', event: { client_x: 50, client_y: 50 } });
        const result = await runtime.surface.handleEvent({
            type: 'info.drag.end', event: { client_x: 320, client_y: 260 }
        });
        assert.equal(result.ok, true);
        assert.equal(commits.length, 1, 'the complete drop owns exactly one atomic commit');
        assert.equal(commits[0].events.length, 2);
        assert.equal(new Set(commits[0].events.map((event) => event.tx_id)).size, 1);
        assert.deepEqual(commits[0].events.map((event) => event.type), ['shape', 'text']);
        assert.deepEqual(commits[0].events.map((event) => event.props.left), ['320px', '370px']);
        assert.deepEqual(commits[0].events.map((event) => event.props.top), ['260px', '300px']);
        assert.ok(result.duplicate_ids.every((id) => stateCurrent.has(id)));
        assert.deepEqual(appliedSelections, [{ ids: result.duplicate_ids, intent: 'replace' }]);
        assert.deepEqual(projectionRefreshes, [{ id: projectId, options: { force: true } }]);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Info loads selected atomes from other pages before starting one typed group drag', async () => {
    const loaded = [];
    const invocations = [];
    const selected = ['parent_a', 'off_page_video'];
    const surface = {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
        scrollLeft: 0, scrollTop: 0
    };
    const previousWindow = globalThis.window;
    globalThis.window = { __eveWorkspaceMode: { mode: 'project' } };
    try {
        const runtime = createInfoPanelSurface({
            readOne: async (id) => {
                loaded.push(id);
                return id === 'off_page_video'
                    ? { atome_id: id, type: 'video', project_id: 'project_a', properties: { source: '/movie.mp4' } }
                    : records.find((record) => record.atome_id === id) || null;
            },
            readSelection: () => selected,
            selectBatch: () => selected,
            readProjectId: () => 'project_a',
            resolveProjectSurface: () => surface,
            readMenuHeight: () => 0,
            resolveBevyRuntime: () => ({ hitTestAtClientPoint: () => null }),
            invokeTool: async (payload) => { invocations.push(payload); return { ok: true, duplicate_ids: ['a', 'b'] }; },
            renderPreview: async () => ({ ok: true, preview_url: '' }),
            events: { on: () => () => true }
        });
        runtime.state.pages.project.records = [records[1]];
        runtime.state.selectedIds = selected;
        await runtime.surface.handleEvent({ type: 'info.drag.start', id: 'parent_a', event: { client_x: 10, client_y: 10 } });
        await runtime.surface.handleEvent({ type: 'info.drag.move', event: { client_x: 30, client_y: 30 } });
        await runtime.surface.handleEvent({ type: 'info.drag.end', event: { client_x: 300, client_y: 240 } });
        assert.equal(loaded[0], 'off_page_video');
        assert.deepEqual(invocations[0].input.selection_ids, selected);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Info drag rejects the whole selected batch when one canonical source cannot be resolved', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { __eveWorkspaceMode: { mode: 'project' } };
    let invocations = 0;
    const surface = {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
        scrollLeft: 0, scrollTop: 0
    };
    try {
        const runtime = createInfoPanelSurface({
            readOne: async (id) => records.find((record) => record.atome_id === id) || null,
            readSelection: () => ['parent_a', 'missing_image'],
            readProjectId: () => 'project_a',
            resolveProjectSurface: () => surface,
            readMenuHeight: () => 0,
            resolveBevyRuntime: () => ({ hitTestAtClientPoint: () => null }),
            invokeTool: async () => { invocations += 1; return { ok: true, duplicate_ids: ['unexpected'] }; },
            renderPreview: async () => ({ ok: true, preview_url: '' }),
            events: { on: () => () => true }
        });
        runtime.state.pages.project.records = [records[1]];
        runtime.state.selectedIds = ['parent_a', 'missing_image'];
        runtime.surface.handleEvent({ type: 'info.drag.start', id: 'parent_a', event: { client_x: 10, client_y: 10 } });
        runtime.surface.handleEvent({ type: 'info.drag.move', event: { client_x: 30, client_y: 30 } });
        const result = await runtime.surface.handleEvent({
            type: 'info.drag.end', event: { client_x: 300, client_y: 240 }
        });
        assert.equal(result.ok, false);
        assert.equal(invocations, 0);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Info project checkbox rail applies one continuous mode and cancel restores its initial selection', async () => {
    let selected = ['parent_a'];
    const writeSelection = (id, intent) => {
        const next = new Set(selected);
        if (intent === 'replace') selected = [id];
        else if (intent === 'add') { next.add(id); selected = [...next]; }
        else if (intent === 'toggle') { next.has(id) ? next.delete(id) : next.add(id); selected = [...next]; }
        return id;
    };
    const runtime = createInfoPanelSurface({
        readAll: async () => records,
        readOne: async (id) => records.find((record) => record.atome_id === id) || null,
        readSelection: () => selected,
        selectAtome: writeSelection,
        selectBatch: (ids) => { selected = [...ids]; return selected; },
        clearSelection: () => { selected = []; return true; },
        readProjectId: () => 'project_a',
        renderPreview: async () => ({ ok: true, preview_url: '' }),
        events: { on: () => () => true }
    });
    runtime.state.expanded.add('project');
    runtime.state.hierarchyExpanded.add('project_a');
    runtime.state.hierarchyExpanded.add('parent_a');
    await runtime.loadPage('project');
    let nodes = runtime.surface.buildContent(runtime.surface.readState(), { emit: () => {}, bodyWidth: 430 });
    const parentCheckbox = find(nodes, 'info_project_hierarchy_entry_0_checkbox');
    assert.ok(parentCheckbox);

    await runtime.surface.handleEvent({ type: 'info.selection.press', id: 'parent_a', event: { y: 2 } });
    await runtime.surface.handleEvent({ type: 'info.selection.drag', event: { y: 74 } });
    assert.deepEqual(selected, [], 'deselect mode applies to every crossed selected row');
    await runtime.surface.handleEvent({ type: 'info.selection.cancel' });
    assert.deepEqual(selected, ['parent_a'], 'cancel restores the canonical initial selection');

    nodes = runtime.surface.buildContent(runtime.surface.readState(), { emit: () => {}, bodyWidth: 430 });
    assert.ok(find(nodes, 'info_project_hierarchy_entry_1_checkbox'));
});

test('Info selection and drag refreshes preserve the manipulated project row as the viewport anchor', async () => {
    let selected = [];
    const refreshOptions = [];
    const runtime = createInfoPanelSurface({
        readAll: async () => records,
        readOne: async (id) => records.find((record) => record.atome_id === id) || null,
        readSelection: () => selected,
        selectAtome: (id, intent) => {
            selected = intent === 'replace' ? [id] : selected.includes(id)
                ? selected.filter((entry) => entry !== id)
                : [...selected, id];
            return id;
        },
        readProjectId: () => 'project_a',
        renderPreview: async () => ({ ok: true, preview_url: '' }),
        events: { on: () => () => true }
    });
    runtime.state.pages.project.records = records;
    runtime.state.pages.project.loaded = true;
    runtime.state.expanded.add('project');
    runtime.state.hierarchyExpanded.add('project_a');
    runtime.surface.buildContent(runtime.surface.readState(), {
        emit: () => {}, bodyWidth: 430
    });
    const refresh = (options) => { refreshOptions.push(options || null); };
    await runtime.surface.handleEvent({
        type: 'info.selection.press', id: 'parent_a',
        event: { node_id: 'info_project_hierarchy_entry_1_checkbox', y: 2 }
    }, { refresh });
    await Promise.resolve();
    assert.ok(refreshOptions.length > 0);
    assert.ok(refreshOptions.every((options) => (
        options?.preserveNodeId === 'info_project_hierarchy_entry_1_checkbox'
    )));

    refreshOptions.length = 0;
    await runtime.surface.handleEvent({
        type: 'info.drag.start', id: 'parent_a',
        event: { node_id: 'info_project_hierarchy_entry_1_drag', client_x: 20, client_y: 20 }
    }, { refresh });
    await Promise.resolve();
    assert.ok(refreshOptions.length > 0);
    assert.ok(refreshOptions.every((options) => (
        options?.preserveNodeId === 'info_project_hierarchy_entry_1_drag'
    )));
});

test('Info clears a failed page, localizes account provisioning, then clears the page error on success', async () => {
    let fail = true;
    const runtime = createInfoPanelSurface({
        readAll: async () => {
            if (fail) throw new Error('remote_account_not_provisioned');
            return records;
        },
        readSelection: () => ['child_a'],
        renderPreview: async () => ({ ok: true, preview_url: '' }),
        events: { on: () => () => true }
    });
    const failed = await runtime.loadPage('all');
    assert.equal(failed.ok, false);
    runtime.state.expanded.add('all');
    let snapshot = runtime.surface.readState();
    assert.equal(snapshot.records.length, 0);
    assert.match(snapshot.pages.all.error, /provision/i);
    const failedNodes = runtime.surface.buildContent(snapshot, { emit: () => {}, bodyWidth: 430 });
    assert.ok(find(failedNodes, 'info_all_error'));

    fail = false;
    await runtime.loadPage('all');
    snapshot = runtime.surface.readState();
    assert.equal(snapshot.records.length, records.length);
    assert.equal(snapshot.pages.all.error, '');
});

test('Info distinguishes a missing current project from an unavailable data source', async () => {
    const runtime = createInfoPanelSurface({
        readAll: async () => [], readSelection: () => [], readProjectId: () => '',
        renderPreview: async () => ({ ok: true, preview_url: '' }),
        events: { on: () => () => true }
    });
    const result = await runtime.loadPage('project');
    assert.equal(result.ok, false);
    assert.match(runtime.surface.readState().pages.project.error, /project|projet/i);
    assert.doesNotMatch(runtime.surface.readState().pages.project.error, /unavailable|indisponibles/i);
});

test('ui.duplicate creates typed atomic copies with relative placement and internal relationship remapping', async () => {
    const previousWindow = globalThis.window;
    const sources = [
        { atome_id: 'image', type: 'image', project_id: 'old', parent_id: 'old', properties: { left: '10px', top: '20px', source: '/image.png', media_type: 'image/png', metadata: { a: 1 } } },
        { atome_id: 'video', type: 'video', project_id: 'old', parent_id: 'image', properties: { left: '40px', top: '50px', source: '/video.mp4', controls: true } },
        { atome_id: 'audio', type: 'sound', project_id: 'old', parent_id: 'old', properties: { left: 70, top: 80, source: '/audio.wav', loop: true } },
        { atome_id: 'text', type: 'richText', project_id: 'old', parent_id: 'old', properties: { left: 100, top: 110, text: '<b>Hello</b>', rich_text: { bold: true } } },
        { atome_id: 'shape', type: 'shape', project_id: 'old', parent_id: 'old', properties: { left: 130, top: 140, color: '#123456', width: 20, height: 30 } },
        { atome_id: 'svg', type: 'shape', project_id: 'old', parent_id: 'old', properties: { left: 160, top: 170, svg: '<svg></svg>', path: 'M0 0L1 1' } },
        { atome_id: 'group', type: 'group', project_id: 'old', parent_id: 'old', properties: { left: 190, top: 200, group_steps: [['image', 'outside']], group_member_ids: ['image', 'outside'] } }
    ];
    const original = structuredClone(sources);
    const batches = [];
    globalThis.window = {
        Atome: {
            getStateCurrent: async (id) => structuredClone(sources.find((record) => record.atome_id === id)),
            commitBatch: async (events, options) => {
                batches.push({ events, options });
                return { ok: true };
            }
        }
    };
    try {
        const result = await executeBootstrapDuplicateOperation({
            selection_ids: sources.map((record) => record.atome_id),
            project_id: 'project_new', left: 300, top: 240, placement_mode: 'preserve_relative'
        }, { mergeStack: (_projectId, position, { offset }) => ({
            ...position, zIndex: 10 + offset, z_index: 10 + offset,
            order: 20 + offset, render_order: 20 + offset, renderOrder: 20 + offset
        }) });
        assert.equal(result.ok, true);
        assert.equal(batches.length, 1);
        assert.equal(batches[0].events.length, sources.length);
        assert.deepEqual(batches[0].options.refreshState, true);
        assert.deepEqual(batches[0].options.realtimeBroadcast, true);
        assert.deepEqual(sources, original, 'canonical source snapshots stay untouched');
        const eventsBySource = new Map(sources.map((source) => [source.atome_id, batches[0].events.find((event) => (
            event.atome_id === result.source_to_duplicate[source.atome_id]
        ))]));
        sources.forEach((source) => {
            const event = eventsBySource.get(source.atome_id);
            assert.notEqual(event.atome_id, source.atome_id);
            assert.equal(event.type, source.type);
            assert.equal(event.project_id, 'project_new');
        });
        assert.equal(eventsBySource.get('image').props.source, '/image.png');
        assert.equal(eventsBySource.get('image').props.media_type, 'image/png');
        assert.equal(eventsBySource.get('video').props.source, '/video.mp4');
        assert.equal(eventsBySource.get('audio').props.source, '/audio.wav');
        assert.equal(eventsBySource.get('text').props.text, '<b>Hello</b>');
        assert.equal(eventsBySource.get('svg').props.svg, '<svg></svg>');
        assert.equal(eventsBySource.get('image').props.left, '300px');
        assert.equal(eventsBySource.get('video').props.left, '330px');
        assert.equal(eventsBySource.get('video').parent_id, result.source_to_duplicate.image);
        assert.equal(eventsBySource.get('shape').parent_id, 'project_new');
        assert.deepEqual(eventsBySource.get('group').props.group_steps, [[result.source_to_duplicate.image]]);
        assert.deepEqual(eventsBySource.get('group').props.group_member_ids, [result.source_to_duplicate.image]);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('ui.duplicate preflight is atomic when any source is locked', async () => {
    const previousWindow = globalThis.window;
    let commits = 0;
    globalThis.window = {
        Atome: {
            getStateCurrent: async (id) => ({
                atome_id: id, type: 'image', project_id: 'old', parent_id: 'old',
                properties: { left: 0, top: 0, source: '/image.png', locked: id === 'locked' }
            }),
            commitBatch: async () => { commits += 1; return { ok: true }; }
        }
    };
    try {
        const result = await executeBootstrapDuplicateOperation({
            selection_ids: ['ok', 'locked'], project_id: 'new', left: 10, top: 10,
            placement_mode: 'preserve_relative'
        });
        assert.equal(result.ok, false);
        assert.equal(result.error, 'target_locked');
        assert.equal(commits, 0);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Finder contextual tool drop opens a Bevy insertion slot and reorders canonical keys without duplicates', async () => {
    const definitions = ['detail', 'size', 'couleur'].map((key) => ({ key, label: key, icon: key, toolType: 'standard' }));
    const surface = { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const tree = buildAtomeContextualEditTree({
        surface, activeAtomeId: 'shape_a', definitions, itemSize: 52, mainMenuHeight: 52, toolDropPreviewIndex: 1
    });
    assert.equal(Math.abs(find([tree.root], 'atome_contextual_tool_detail').style.position[1]), 0);
    assert.deepEqual(find([tree.root], 'atome_contextual_tool_size').style.position, [0, 104]);
    assert.equal(find([tree.root], `${ATOME_CONTEXTUAL_EDIT_TREE_ID}_rail`).style.size[1], 208);

    const state = {
        activeAtomeId: 'shape_a', activeKind: 'shape', railScrollOffsetPx: 0,
        railLayout: { x: 748, y: 100, itemSize: 52 }, toolDropPreviewIndex: null, toolDropKey: ''
    };
    let keys = ['detail', 'size', 'couleur'];
    const persisted = [];
    const runtime = createAtomeContextualToolDropRuntime({
        state, surfaceResolver: () => surface,
        bevyRuntimeResolver: () => ({ hitTestAtClientPoint: () => ({
            treeId: ATOME_CONTEXTUAL_EDIT_TREE_ID, nodeId: 'atome_contextual_tool_size'
        }) }),
        normalizeToolKey: (value) => String(value || '').trim().toLowerCase(),
        validateToolKey: ({ toolKey }) => ['detail', 'size', 'couleur', 'code'].includes(toolKey),
        readToolKeys: () => [...keys],
        persistToolKeys: async (_id, next) => { persisted.push([...next]); return true; },
        applyToolKeys: (_id, next) => { keys = [...next]; }, scheduleRender: () => {}
    });
    const payload = { source: 'finder', scope: 'tools', tool_key: 'code' };
    assert.equal(runtime.preview(payload, { client_x: 760, client_y: 126 }).index, 1);
    assert.deepEqual((await runtime.commit(payload, { client_x: 760, client_y: 126 })).tool_keys,
        ['detail', 'code', 'size', 'couleur']);
    const moved = await runtime.commit({ source: 'finder', scope: 'tools', tool_key: 'couleur' },
        { client_x: 760, client_y: 126 });
    assert.deepEqual(moved.tool_keys, ['detail', 'couleur', 'code', 'size']);
    assert.equal(moved.tool_keys.filter((key) => key === 'couleur').length, 1);
    assert.equal(persisted.length, 2);
});

test('Finder contextual tool drop rejects non-contextual Bevy targets without committing', async () => {
    let commits = 0;
    const state = {
        activeAtomeId: 'shape_a', activeKind: 'shape', railScrollOffsetPx: 0,
        railLayout: { x: 0, y: 0, itemSize: 52 }, toolDropPreviewIndex: null, toolDropKey: ''
    };
    const runtime = createAtomeContextualToolDropRuntime({
        state, surfaceResolver: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
        bevyRuntimeResolver: () => ({ hitTestAtClientPoint: () => ({ treeId: 'finder', nodeId: 'row' }) }),
        normalizeToolKey: String, validateToolKey: () => true, readToolKeys: () => ['detail'],
        persistToolKeys: async () => { commits += 1; return true; }, applyToolKeys: () => {}, scheduleRender: () => {}
    });
    const result = await runtime.commit({ source: 'finder', scope: 'tools', tool_key: 'code' },
        { client_x: 10, client_y: 10 });
    assert.equal(result.cancelled, true);
    assert.equal(commits, 0);
});

test('Finder tools expose hold, drag, release and cancel with the shared active payload', async () => {
    const calls = [];
    const runtime = createFinderPanelSurface({
        startToolDrag: (payload) => calls.push(['start', payload]),
        previewToolDrag: (payload, event) => { calls.push(['preview', payload, event]); return { ok: true }; },
        commitToolDrag: async (payload, event) => { calls.push(['commit', payload, event]); return { ok: true }; },
        cancelToolDrag: () => calls.push(['cancel']), clearToolDrag: () => calls.push(['clear']),
        events: { on: () => () => true }
    });
    runtime.state.scope = 'tools';
    runtime.state.records = [{
        id: 'tool_ui.code', type: 'tool', name: 'Code', projectId: null,
        properties: { tool_id: 'ui.code', tool_key: 'code', tool_registry_version: 2, name: 'Code' }, raw: {}
    }];
    const emitted = [];
    const content = runtime.surface.buildContent(runtime.readState(), { bodyWidth: 430, emit: (event) => emitted.push(event) });
    const row = find(content, 'finder_row_id_tool_ui_code');
    row.on.long_press({ client_x: 10, client_y: 10 });
    row.on.drag({ client_x: 20, client_y: 20 });
    row.on.release({ client_x: 30, client_y: 30 });
    for (const event of emitted) await runtime.handleEvent(event);
    assert.deepEqual(emitted.map(({ type }) => type), ['finder.row.drag_start', 'finder.row.drag_move', 'finder.row.drag_end']);
    assert.deepEqual(calls.map(([type]) => type), ['start', 'preview', 'commit', 'clear']);
    assert.equal(calls[0][1].tool_key, 'code');
});

test('footer_tools reload and commit use the established canonical property owner', async () => {
    const previousWindow = globalThis.window;
    const writes = [];
    globalThis.window = {
        Atome: { getStateCurrent: async () => ({ properties: { footer_tools: ['detail', 'code'] } }) },
        eveToolBase: { updateAtomeProperties: async (id, props) => { writes.push({ id, props }); } }
    };
    try {
        const model = createAtomeEditFooterModelRuntime({
            mainToolIdByKey: { detail: 'ui.detail.panel', code: 'ui.code' },
            intuitionContent: { detail: { tool_id: 'ui.detail.panel', label: 'Detail' }, code: { tool_id: 'ui.code', label: 'Code' } },
            normalizeMainToolKey: (key) => String(key || '').trim().toLowerCase(),
            normalizeCatalogToolEntry: ({ key, def }) => ({ key, toolId: def.tool_id, label: def.label, toolType: 'standard' }),
            normalizeRecordActionRecordSource: () => null, resolveCanonicalMainToolId: (id) => id,
            resolveCurrentTextSizeValue: (value) => value, isSelectionRequiredToolKey: () => false,
            getAtomeElement: () => null, getAtomeRuntimeState: () => ({}), translate: (_key, fallback) => fallback
        });
        assert.deepEqual(await model.loadPersistedAtomeEditFooterTools('shape_a'), ['detail', 'code']);
        assert.equal(await model.persistAtomeEditFooterTools('shape_a', ['code', 'detail', 'code']), true);
        assert.deepEqual(writes, [{ id: 'shape_a', props: { footer_tools: ['code', 'detail'], footerTools: ['code', 'detail'] } }]);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('structured List and Matrix contexts always expose the persistent rail Play tool without an inline item control', () => {
    const model = createAtomeEditFooterModelRuntime({
        mainToolIdByKey: { detail: 'ui.detail.panel', delete: 'ui.delete.selection', play: 'ui.play', record_action: 'ui.detail.record.toggle' },
        intuitionContent: {
            detail: { tool_id: 'ui.detail.panel', label: 'Detail' },
            delete: { tool_id: 'ui.delete.selection', label: 'Delete' },
            play: { tool_id: 'ui.play', label: 'Play', action: 'toggle', latch: true },
            record_action: {
                tool_id: 'ui.detail.record.toggle', label: 'Record', icon: 'record', type: 'palette',
                selection_required: true, children: ['record_action_key', 'record_action_live', 'record_action_audio', 'record_action_video']
            },
            record_action_live: {
                tool_id: 'ui.detail.record.toggle', label: 'Live', icon: 'false', type: 'tool',
                action: 'toggle', latch: true, selection_required: true, extra_input: { mode: 'live' }
            }
        },
        normalizeMainToolKey: (key) => String(key || '').trim().toLowerCase(),
        normalizeCatalogToolEntry: ({ key, def }) => ({ key, toolId: def.tool_id, label: def.label, toolType: 'standard', actionMode: def.action, latch: def.latch }),
        normalizeRecordActionRecordSource: () => null, resolveCanonicalMainToolId: (id) => id,
        resolveCurrentTextSizeValue: (value) => value, isSelectionRequiredToolKey: () => false,
        getAtomeElement: () => null, getAtomeRuntimeState: () => ({}), translate: (_key, fallback) => fallback
    });
    ['sound', 'video', 'image', 'text', 'shape', 'group', 'unknown'].forEach((kind) => {
        const keys = model.resolveAtomeEditFooterToolKeysForAtome({
            atomeId: `${kind}_row`, kind, toolKeys: ['detail', 'delete', 'play', 'record_action'], hasProjectAutomation: true, railOnly: true
        });
        assert.equal(keys.includes('play'), true, `${kind} lacks rail Play`);
        assert.equal(keys.includes('record_action'), true, `${kind} lacks rail action Record`);
        const definition = model.resolveAtomeEditFooterToolDefinition('play', { structuredContext: true });
        assert.equal(definition?.toolId, 'ui.play');
        assert.equal(definition?.label, 'Play');
        assert.equal(Object.prototype.hasOwnProperty.call(definition, 'tooltip'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(definition, 'popup'), false);
        const recordDefinition = model.resolveAtomeEditFooterToolDefinition('record_action', { structuredContext: true });
        assert.equal(recordDefinition?.label, 'Record');
        assert.equal(recordDefinition?.icon, 'record');
        assert.equal(recordDefinition?.toolType, 'standard');
        assert.equal(recordDefinition?.latch, true);
        assert.deepEqual(recordDefinition?.extraInput, { mode: 'live' });
        assert.deepEqual(recordDefinition?.children, []);
    });
});

test('structured item and container Play presentation read the project playback facade', async () => {
    const model = createAtomeEditFooterModelRuntime({
        mainToolIdByKey: { play: 'ui.play' }, intuitionContent: { play: { tool_id: 'ui.play', label: 'Play', icon: 'play' } },
        normalizeMainToolKey: (key) => String(key || '').trim().toLowerCase(),
        normalizeCatalogToolEntry: ({ key, def }) => ({ key, toolId: def.tool_id, label: def.label, toolType: 'standard' }),
        normalizeRecordActionRecordSource: () => null, resolveCanonicalMainToolId: (id) => id,
        resolveCurrentTextSizeValue: (value) => value, isSelectionRequiredToolKey: () => false,
        getAtomeElement: () => null, getAtomeRuntimeState: () => ({}), translate: (_key, fallback) => fallback
    });
    const records = ['video', 'audio', 'image', 'text', 'shape'].map((kind) => ({
        id: `${kind}_row`, type: kind, project_id: 'structured_project', properties: { kind }
    }));
    for (const record of records) {
        assert.equal(model.resolveAtomeEditFooterToolDefinition('play', { structuredContext: true, record }).label, 'Play');
        await projectViewPlayback.triggerChild({ record, projectId: record.project_id });
        const active = model.resolveAtomeEditFooterToolDefinition('play', { structuredContext: true, record });
        assert.equal(active.label, 'Stop');
        assert.equal(active.icon, 'stop');
        assert.equal(active.active, true);
        assert.equal(projectViewPlayback.isPlayingTarget({ record }), true);
        await projectViewPlayback.stop();
        assert.equal(model.resolveAtomeEditFooterToolDefinition('play', { structuredContext: true, record }).label, 'Play');
    }
    const molecule = {
        id: 'molecule_row', type: 'group', project_id: 'structured_project',
        properties: { kind: 'group', molecule_entity: 'molecule' }
    };
    projectViewPlayback.adoptDelegatedTransport({ level: { entity: 'molecule', id: molecule.id }, playing: true });
    assert.equal(projectViewPlayback.isPlayingTarget({ record: molecule }), true);
    assert.equal(projectViewPlayback.isPlayingTarget({ level: { entity: 'molecule', id: molecule.id } }), true);
    assert.equal(model.resolveAtomeEditFooterToolDefinition('play', { structuredContext: true, record: molecule }).label, 'Stop');
    await projectViewPlayback.stop();
    assert.equal(model.resolveAtomeEditFooterToolDefinition('play', { structuredContext: true, record: molecule }).label, 'Play');

    const still = { id: 'armed_still', type: 'image', project_id: 'structured_project', properties: { kind: 'image' } };
    await projectViewPlayback.playChild({ record: still, projectId: 'structured_project' });
    await projectViewPlayback.stop({ disarm: false });
    assert.equal(projectViewPlayback.readState().playing, false);
    assert.equal(projectViewPlayback.readState().armed, true);
    assert.equal(model.resolveAtomeEditFooterToolDefinition('play', {
        structuredContext: true, record: still
    }).label, 'Stop');
    await projectViewPlayback.stop();
    assert.equal(model.resolveAtomeEditFooterToolDefinition('play', {
        structuredContext: true, record: still
    }).label, 'Play');
});
