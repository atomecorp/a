import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeSelectPresentation } from '../../atome/src/squirrel/components/select_contract.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { hitTestBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_hit_test_runtime.js';
import { createBevyUiScrollRuntime } from '../../eVe/domains/rendering/bevy_ui_scroll_runtime.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import { selectNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_select.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';

const options = [
    { value: 'fr', label: 'French' },
    { value: 'en', label: 'English' },
    { value: 'de', label: 'German' }
];

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

test('canonical Squirrel Select contract normalizes explicit options without DOM state', () => {
    const presentation = normalizeSelectPresentation({ options, value: 'en' });

    assert.equal(presentation.value, 'en');
    assert.equal(presentation.selectedIndex, 1);
    assert.deepEqual(presentation.selectedOption, { value: 'en', label: 'English', disabled: false });
    assert.throws(() => normalizeSelectPresentation({ options: [], value: 'fr' }), /squirrel_select_options_required/);
    assert.throws(() => normalizeSelectPresentation({ options, value: 'unknown' }), /squirrel_select_value_unknown:unknown/);
    assert.throws(() => normalizeSelectPresentation({
        options: [{ value: 'fr', label: 'French' }, { value: 'fr', label: 'Duplicate' }]
    }), /squirrel_select_option_value_duplicate:fr/);
});

test('shared panel Select uses the native select node and panel token contract while closed', () => {
    const closed = selectNode({ id: 'select_fixture', options, value: 'fr' });
    const control = findNode(closed, 'select_fixture_control');
    const label = findNode(closed, 'select_fixture_label');

    assert.equal(closed.kind, 'panel');
    assert.deepEqual(closed.style.size, [BEVY_PANEL_TOKENS.inputWidthPx, BEVY_PANEL_TOKENS.select.controlHeightPx]);
    assert.equal(control.kind, 'select');
    assert.deepEqual(control.style.size, [BEVY_PANEL_TOKENS.inputWidthPx, BEVY_PANEL_TOKENS.select.controlHeightPx]);
    assert.deepEqual(control.style.padding, [0, 10, 0, 10]);
    assert.deepEqual(control.style.background, BEVY_PANEL_TOKENS.controlMaterial.background);
    assert.deepEqual(control.style.shadow, BEVY_PANEL_TOKENS.controlMaterial.shadow);
    assert.equal(control.style.radius, BEVY_PANEL_TOKENS.radiusPx);
    assert.equal(label.text, 'French');
    assert.deepEqual(
        findNode(closed, 'select_fixture_indicator_divider').style.position,
        [BEVY_PANEL_TOKENS.inputWidthPx - BEVY_PANEL_TOKENS.select.indicatorWidthPx, BEVY_PANEL_TOKENS.select.dividerInsetPx]
    );
    assert.equal(findNode(closed, 'select_fixture_chevron').style.rotation, undefined);
    assert.equal(findNode(closed, 'select_fixture_chevron_upper').style.rotation, 45);
    assert.equal(findNode(closed, 'select_fixture_chevron_lower').style.rotation, -45);
    assert.equal(findNode(closed, 'select_fixture_options'), null);
    assert.equal(findNode(closed, 'select_fixture_option_0'), null);

    const hovered = selectNode({ id: 'select_hovered', options, value: 'fr', hovered: true });
    const focused = selectNode({ id: 'select_focused', options, value: 'fr', focused: true });
    const disabled = selectNode({ id: 'select_disabled', options, value: 'fr', disabled: true });
    assert.deepEqual(findNode(hovered, 'select_hovered_control').style.background, BEVY_PANEL_TOKENS.controlMaterial.background);
    assert.deepEqual(findNode(focused, 'select_focused_control').style.background, BEVY_PANEL_TOKENS.controlMaterial.background);
    assert.deepEqual(findNode(focused, 'select_focused_control').style.shadow, BEVY_PANEL_TOKENS.select.focusShadow);
    assert.equal(findNode(disabled, 'select_disabled_control').style.opacity, BEVY_PANEL_TOKENS.select.disabledOpacity);
    assert.equal(findNode(disabled, 'select_disabled_control').on, undefined);
});

test('shared panel Select expands with selected option state and a single WebGPU list', () => {
    const open = selectNode({ id: 'select_open', options, value: 'en', expanded: true, pressedValue: 'de' });
    const control = findNode(open, 'select_open_control');
    const optionsRoot = findNode(open, 'select_open_options');

    assert.deepEqual(open.style.size, [
        BEVY_PANEL_TOKENS.inputWidthPx,
        BEVY_PANEL_TOKENS.select.controlHeightPx
            + BEVY_PANEL_TOKENS.select.menuGapPx
            + 3 * BEVY_PANEL_TOKENS.select.optionHeightPx
    ]);
    assert.equal(open.style.overflow, 'visible');
    assert.equal(open.style.z_index, BEVY_PANEL_TOKENS.select.popupZIndex);
    assert.equal(control.style.radius, BEVY_PANEL_TOKENS.radiusPx);
    assert.equal(findNode(open, 'select_open_chevron').style.rotation, undefined);
    assert.equal(findNode(open, 'select_open_chevron_upper').style.rotation, -45);
    assert.equal(findNode(open, 'select_open_chevron_lower').style.rotation, 45);
    assert.deepEqual(optionsRoot.style.size, [BEVY_PANEL_TOKENS.inputWidthPx, 3 * BEVY_PANEL_TOKENS.select.optionHeightPx]);
    assert.deepEqual(optionsRoot.style.position, [0, BEVY_PANEL_TOKENS.select.controlHeightPx + BEVY_PANEL_TOKENS.select.menuGapPx]);
    assert.deepEqual(optionsRoot.style.radius_corners, [0, 0, 3, 3]);
    assert.deepEqual(optionsRoot.style.shadow, BEVY_PANEL_TOKENS.select.menuShadow);
    assert.deepEqual(findNode(open, 'select_open_option_1').style.background, BEVY_PANEL_TOKENS.select.selectedBackground);
    assert.deepEqual(findNode(open, 'select_open_option_2').style.background, BEVY_PANEL_TOKENS.select.pressedBackground);
    assert.ok(findNode(open, 'select_open_option_1_selected_mark'));
    assert.equal(findNode(open, 'select_open_option_1_label').text, 'English');

    const disabledOption = selectNode({
        id: 'select_option_disabled',
        options: [{ value: 'fr', label: 'French', disabled: true }],
        value: 'fr',
        expanded: true
    });
    assert.equal(findNode(disabledOption, 'select_option_disabled_option_0').on, undefined);

    const records = projectBevyUiTreeRecords({
        tree: { root: open }, treeId: 'select_projection', workspaceLayer: 'panel'
    });
    assert.equal(records.some((record) => record.id === '__eve_bevy_ui_select_projection_select_open_option_1'), true);
    assert.equal(records.every((record) => !String(record.id).includes('data-')), true);
});

test('open Select options reserve their interactive WebGPU area and remain scroll-revealable', () => {
    const select = selectNode({ id: 'floating_select', options, value: 'fr', expanded: true });
    const tree = {
        root: {
            id: 'floating_root',
            kind: 'root',
            style: { size: [400, 100] },
            children: [{
                id: 'floating_scroll',
                kind: 'scroll_area',
                style: { size: [400, 100], overflow: 'scroll_y' },
                children: [{ ...select, style: { ...select.style, position: [0, 40] } }]
            }]
        }
    };
    const hit = hitTestBevyUiNode(tree.root, { x: 20, y: 90 });
    assert.equal(hit?.node?.id, 'floating_select_option_0');

    const scroll = createBevyUiScrollRuntime({ refreshTree: () => {}, emitTargetEvent: () => {} });
    assert.equal(scroll.revealNode({ tree, treeId: 'floating_tree', nodeId: 'floating_select_options', marginPx: 10 }), true);
    const applied = scroll.applyTree({ tree, treeId: 'floating_tree' });
    assert.equal(findNode(applied.root, 'floating_scroll').style.scroll[1] > 0, true);
});


test('native Select controls use the canonical pointer press, release, and activation route', () => {
    const emitted = [];
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const target = { treeId: 'select_tree', nodeId: 'select_control', kind: 'select', box: {}, scrollAncestors: [] };
    const runtime = createBevyUiPointerRuntime({
        state: { lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null, hoverTarget: null, pendingTextActivation: null },
        hitTestTrees: () => target,
        localEventForTarget: (_, type) => ({ type }),
        emitUiEvents: (events) => emitted.push(...events),
        scrollRuntime: { begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false }
    });

    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 12, y: 12 }, event: { pointerId: 9 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 12, y: 12 }, event: { pointerId: 9 } });
    assert.deepEqual(emitted.map((event) => event.type), ['press', 'focus', 'release', 'activate']);
});
