import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';

import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';
import { createInfoPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js';
import { hierarchyEntries } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_info_model.js';

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
        readOne: async () => null,
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
        readOne: async () => null,
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

test('Info hierarchy preserves depth and only reveals descendants of expanded parents', () => {
    const collapsed = hierarchyEntries(records, new Set(), ['child_a']);
    assert.deepEqual(collapsed.map((entry) => entry.id), ['project_a']);
    const expanded = hierarchyEntries(records, new Set(['project_a', 'parent_a']), ['child_a']);
    assert.deepEqual(expanded.map(({ id, depth }) => [id, depth]), [
        ['project_a', 0], ['parent_a', 1], ['child_a', 2]
    ]);
    assert.equal(expanded.at(-1).selected, true);
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
        'eVe/intuition/runtime/bevy_panel/bevy_panel_info_editing.js',
        'eVe/intuition/runtime/bevy_panel/bevy_panel_info_view.js',
        'eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js'
    ];
    packageSources.forEach((path) => {
        assert.ok(lineCount(path) <= 500, `${path} must remain within the mandatory file-size ceiling`);
        assert.doesNotMatch(source(path), /document\.|createElement|innerHTML|createEveDialog/);
    });
    const runtimeSource = source(packageSources.at(-1));
    assert.match(runtimeSource, /listStateCurrent/);
    assert.match(runtimeSource, /commitBatch/);
    assert.match(runtimeSource, /renderProjectPreview/);
    assert.match(runtimeSource, /events\.on\('atome:changed'/);
    assert.doesNotMatch(runtimeSource, /setInterval|setTimeout|localStorage|sessionStorage/);
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
