import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeTablePresentation } from '../../atome/src/squirrel/components/table_contract.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { hitTestBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_hit_test_runtime.js';
import { INTERACTIVE_KINDS, SUPPORTED_KINDS } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { selectNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_select.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import { panelLabSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_surfaces.js';
import { tableNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_table.js';
import { buildBevyPanelTree } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';

const columns = [
    { id: 'name', label: 'Name', flex: 1.6 },
    { id: 'type', label: 'Type' },
    { id: 'value', label: 'Value', align: 'right' }
];

const rows = [
    { id: 'width', cells: { name: 'Width', type: 'Number', value: '120' } },
    { id: 'visible', cells: { name: 'Visible', type: 'Boolean', value: 'Yes' } },
    { id: 'label', cells: { name: 'Name', type: 'Text', value: 'Atome' } }
];

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

const collect = (node, out = []) => {
    if (!node) return out;
    out.push(node);
    (node.children || []).forEach((child) => collect(child, out));
    return out;
};

test('canonical Squirrel Table contract normalizes columns, rows, and typed errors without DOM state', () => {
    const presentation = normalizeTablePresentation({ columns, rows, width: 400 });

    assert.equal(presentation.width, 400);
    assert.equal(presentation.header, true);
    assert.deepEqual(presentation.columns.map((column) => column.id), ['name', 'type', 'value']);
    assert.deepEqual(presentation.columns.map((column) => column.align), ['left', 'left', 'right']);
    assert.deepEqual(presentation.rows[1].values, ['Visible', 'Boolean', 'Yes']);

    assert.throws(() => normalizeTablePresentation({ columns: [], rows, width: 400 }), /squirrel_table_columns_required/);
    assert.throws(() => normalizeTablePresentation({ columns, rows: [], width: 400 }), /squirrel_table_rows_required/);
    assert.throws(() => normalizeTablePresentation({ columns, rows }), /squirrel_table_width_required/);
    assert.throws(() => normalizeTablePresentation({
        columns: [{ id: 'name', label: 'A' }, { id: 'name', label: 'B' }], rows, width: 400
    }), /squirrel_table_column_id_duplicate:name/);
    assert.throws(() => normalizeTablePresentation({
        columns: [{ id: 'name', label: 'A', align: 'center' }], rows, width: 400
    }), /squirrel_table_column_align_unsupported:name:center/);
    assert.throws(() => normalizeTablePresentation({
        columns, rows: [{ id: 'partial', cells: { name: 'Width', type: 'Number' } }], width: 400
    }), /squirrel_table_row_cell_missing:partial:value/);
    assert.throws(() => normalizeTablePresentation({
        columns: [{ id: 'wide', label: 'Wide', widthPx: 500 }], rows, width: 400
    }), /squirrel_table_fixed_columns_exceed_width:500:400/);
});

test('fluid column distribution always sums to the available width and absorbs rounding', () => {
    [400, 358, 220, 683, 901].forEach((width) => {
        const presentation = normalizeTablePresentation({ columns, rows, width });
        const total = presentation.columns.reduce((sum, column) => sum + column.width, 0);
        assert.equal(total, width);
        presentation.columns.forEach((column, index) => {
            assert.equal(Number.isInteger(column.width), true);
            assert.equal(column.offset, presentation.columns.slice(0, index)
                .reduce((sum, previous) => sum + previous.width, 0));
        });
    });

    const proportional = normalizeTablePresentation({ columns, rows, width: 360 });
    assert.deepEqual(proportional.columns.map((column) => column.width), [160, 100, 100]);

    const mixed = normalizeTablePresentation({
        columns: [{ id: 'icon', label: 'Icon', widthPx: 60 }, ...columns],
        rows: rows.map((row) => ({ ...row, cells: { ...row.cells, icon: '·' } })),
        width: 400
    });
    assert.equal(mixed.columns[0].width, 60);
    assert.equal(mixed.columns.reduce((sum, column) => sum + column.width, 0), 400);
});

test('shared panel Table composes the native passive table kind from panel tokens only', () => {
    const tokens = BEVY_PANEL_TOKENS.table;
    const table = tableNode({ id: 'table_fixture', columns, rows, width: 400 });
    const header = findNode(table, 'table_fixture_header');
    const firstRow = findNode(table, 'table_fixture_row_0');
    const lastRow = findNode(table, 'table_fixture_row_2');

    assert.equal(table.kind, 'table');
    assert.equal(SUPPORTED_KINDS.has('table'), true);
    assert.equal(INTERACTIVE_KINDS.has('table'), false);
    assert.deepEqual(table.style.size, [400, tokens.headerHeightPx + (tokens.rowHeightPx * 3)]);
    assert.equal(table.style.shadow, undefined);
    assert.equal(table.style.radius, BEVY_PANEL_TOKENS.radiusPx);

    assert.deepEqual(header.style.size, [400, tokens.headerHeightPx]);
    assert.deepEqual(header.style.background, tokens.headerBackground);
    assert.deepEqual(header.style.radius_corners, [BEVY_PANEL_TOKENS.radiusPx, BEVY_PANEL_TOKENS.radiusPx, 0, 0]);
    assert.equal(findNode(table, 'table_fixture_header_cell_name_label').text, 'Name');
    assert.equal(findNode(table, 'table_fixture_header_cell_name_label').style.opacity, tokens.headerLabelOpacity);

    assert.deepEqual(firstRow.style.position, [0, tokens.headerHeightPx]);
    assert.deepEqual(firstRow.style.background, tokens.rowBackground);
    assert.equal(firstRow.style.radius_corners, undefined);
    assert.deepEqual(lastRow.style.radius_corners, [0, 0, BEVY_PANEL_TOKENS.radiusPx, BEVY_PANEL_TOKENS.radiusPx]);
    assert.equal(findNode(table, 'table_fixture_row_1_cell_value_label').text, 'Yes');
    assert.equal(findNode(table, 'table_fixture_row_1_cell_value_label').style.text_align, 'right');
    assert.equal(findNode(table, 'table_fixture_row_1_cell_name_label').style.text_align, 'left');
    assert.equal(findNode(table, 'table_fixture_row_1_cell_value').style.overflow, 'hidden');

    const rules = collect(table).filter((child) => child.kind === 'divider');
    assert.equal(rules.length, 3);
    rules.forEach((rule) => {
        assert.deepEqual(rule.style.size, [400, tokens.rowDividerThicknessPx]);
        assert.deepEqual(rule.style.background, tokens.rowDivider);
    });
    assert.deepEqual(rules.map((rule) => rule.style.position[1]), [32, 64, 96]);

    collect(table).forEach((child) => {
        assert.equal(child.on, undefined);
        assert.equal(INTERACTIVE_KINDS.has(child.kind), false);
    });
});

test('shared panel Table stretches with its container and floors at the token minimum', () => {
    const wide = tableNode({ id: 'table_wide', columns, rows, width: 901 });
    const clamped = tableNode({ id: 'table_clamped', columns, rows, width: 40 });

    assert.deepEqual(wide.style.size[0], 901);
    assert.deepEqual(findNode(wide, 'table_wide_row_0').style.size[0], 901);
    assert.equal(findNode(wide, 'table_wide_row_0_cell_value').style.position[0]
        + findNode(wide, 'table_wide_row_0_cell_value').style.size[0], 901);
    assert.equal(clamped.style.size[0], BEVY_PANEL_TOKENS.table.minWidthPx);
});

test('the same builder renders a headerless two-column property grid', () => {
    const grid = tableNode({
        id: 'grid_fixture',
        header: false,
        width: 300,
        columns: [{ id: 'key', label: 'Key' }, { id: 'value', label: 'Value', align: 'right' }],
        rows: [{ id: 'a', cells: { key: 'Width', value: '120' } }]
    });

    assert.equal(findNode(grid, 'grid_fixture_header'), null);
    assert.deepEqual(grid.style.size, [300, BEVY_PANEL_TOKENS.table.rowHeightPx]);
    assert.deepEqual(findNode(grid, 'grid_fixture_row_0').style.radius_corners, [
        BEVY_PANEL_TOKENS.radiusPx, BEVY_PANEL_TOKENS.radiusPx,
        BEVY_PANEL_TOKENS.radiusPx, BEVY_PANEL_TOKENS.radiusPx
    ]);
    assert.equal(collect(grid).filter((child) => child.kind === 'divider').length, 0);
});

test('an open Select popup paints above the whole table that follows it in body flow', () => {
    panelLabSurface.onOpen();
    let tree = null;
    try {
        panelLabSurface.handleEvent({ type: 'panel_lab.select.toggle' });
        tree = buildBevyPanelTree({
            id: 'panel_lab',
            title: 'Panel Lab',
            geometry: { x: 260, y: 120, width: 420, height: 620 },
            surfaceSize: { width: 1280, height: 720 },
            bodyChildren: panelLabSurface.buildContent(panelLabSurface.readState(), { emit: () => {}, bodyWidth: 400 }),
            bodyGap: 0
        });
    } finally {
        panelLabSurface.onClose();
    }

    const all = collect(tree.root);
    const popup = all.filter((node) => node.id === 'panel_lab_select_options' || node.id.startsWith('panel_lab_select_option_'));
    const table = all.filter((node) => node.id.startsWith('panel_lab_table'));

    assert.equal(popup.length > 0, true);
    assert.equal(table.length > 0, true);
    // A z_index is local to its subtree: the floating popup must lift its rows
    // and labels too, not only its own root.
    const popupFloor = Math.min(...popup.map((node) => node.style.z_index));
    const tableCeiling = Math.max(...table.map((node) => node.style.z_index));
    assert.equal(popupFloor > tableCeiling, true, `popup floor ${popupFloor} must exceed table ceiling ${tableCeiling}`);
    assert.equal(all.find((node) => node.id === 'panel_lab_select').style.z_index
        < Math.min(...popup.map((node) => node.style.z_index)), true);
});

test('a floating option keeps pointer routing where it overlaps the passive table', () => {
    const select = selectNode({
        id: 'overlap_select',
        options: [{ value: 'fr', label: 'French' }, { value: 'en', label: 'English' }],
        value: 'fr',
        expanded: true,
        on: { optionActivate: () => {} }
    });
    const table = tableNode({ id: 'overlap_table', columns, rows, width: 400 });
    const root = {
        id: 'overlap_root',
        kind: 'root',
        style: { size: [400, 300] },
        children: [
            { ...select, style: { ...select.style, position: [0, 0] } },
            { ...table, style: { ...table.style, position: [0, 36] } }
        ]
    };

    // The first option row starts 36 px below the field and lands inside the
    // table's own band; the passive table must never capture that pointer.
    const hit = hitTestBevyUiNode(root, { x: 40, y: 52 });
    assert.equal(hit?.node?.id, 'overlap_select_option_0');
    assert.equal(hitTestBevyUiNode(root, { x: 40, y: 200 }), null);
});

test('Panel Lab appends the table after the validated Select and keeps it passive and localized', () => {
    panelLabSurface.onOpen();
    try {
        const body = panelLabSurface.buildContent(panelLabSurface.readState(), { emit: () => {}, bodyWidth: 400 });
        const dividerIndex = body.findIndex((node) => node.id === 'panel_lab_table_divider');
        const tableIndex = body.findIndex((node) => node.id === 'panel_lab_table');

        assert.equal(body.length, 41);
        assert.equal(tableIndex < body.findIndex((node) => node.id === 'panel_lab_action_button_group'), true);
        assert.equal(tableIndex, dividerIndex + 1);
        assert.equal(dividerIndex > body.findIndex((node) => node.id === 'panel_lab_select'), true);

        const table = body[tableIndex];
        assert.equal(table.kind, 'table');
        assert.deepEqual(table.style.size, [400, 128]);
        assert.equal(findNode(table, 'panel_lab_table_header_cell_value_label').text, 'Valeur');
        assert.equal(findNode(table, 'panel_lab_table_row_2_cell_value_label').text, 'Atome');
        assert.equal(EVE_DEFAULT_MESSAGES.fr['eve.panel_lab.table.row_visible_type'], 'Booléen');
        assert.equal(EVE_DEFAULT_MESSAGES.en['eve.panel_lab.table.column_value'], 'Value');

        assert.deepEqual(panelLabSurface.handleEvent({ type: 'panel_lab.table.select' }), {
            ok: false,
            error: 'panel_lab_intent_unsupported:panel_lab.table.select'
        });

        const narrow = panelLabSurface.buildContent(panelLabSurface.readState(), { emit: () => {}, bodyWidth: 260 });
        assert.deepEqual(narrow.find((node) => node.id === 'panel_lab_table').style.size, [260, 128]);

        const records = projectBevyUiTreeRecords({
            tree: { root: table }, treeId: 'table_projection', workspaceLayer: 'panel'
        });
        assert.equal(records.some((record) => record.id.includes('panel_lab_table_row_0')), true);
        assert.equal(records.every((record) => !String(record.id).includes('data-')), true);
    } finally {
        panelLabSurface.onClose();
    }
});

// Same regression guard as the accordion: assert the projected record, not the
// builder tree. The tree-level `radius_corners` assertions above stayed green
// while the active overlay route painted every table corner square.
test('table projects its outer corner radii to the GPU records', () => {
    const table = tableNode({
        id: 'table_corner_fixture',
        columns: [{ id: 'name', label: 'Nom' }, { id: 'value', label: 'Valeur', align: 'right' }],
        rows: [
            { id: 'r0', cells: { name: 'A', value: '1' } },
            { id: 'r1', cells: { name: 'B', value: '2' } }
        ],
        header: true,
        width: BEVY_PANEL_TOKENS.inputWidthPx
    });
    const records = projectBevyUiTreeRecords({
        tree: { root: table }, treeId: 'table_corners', workspaceLayer: 'panel'
    });
    const recordFor = (suffix) => records.find((record) => record.id.endsWith(suffix))?.properties;
    const radius = BEVY_PANEL_TOKENS.radiusPx;

    const header = recordFor('table_corner_fixture_header');
    assert.equal(header?.shape, 'rounded_rect');
    assert.deepEqual(header?.corner_radii, [radius, radius, 0, 0]);

    const lastRow = recordFor('table_corner_fixture_row_1');
    assert.equal(lastRow?.shape, 'rounded_rect');
    assert.deepEqual(lastRow?.corner_radii, [0, 0, radius, radius]);

    // A middle row has no rounded corner at all and must stay a plain rect.
    const firstRow = recordFor('table_corner_fixture_row_0');
    assert.equal(firstRow?.shape, 'rect');
    assert.equal(firstRow?.corner_radii, undefined);
});
