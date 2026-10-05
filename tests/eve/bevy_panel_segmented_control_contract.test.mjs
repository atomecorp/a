import { BEVY_ICON_BUTTON_TOKENS } from '../../eVe/intuition/shared/bevy_ui_icon_button.js';
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeSegmentedControlPresentation } from '../../atome/src/squirrel/components/segmented_control_contract.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { INTERACTIVE_KINDS, SUPPORTED_KINDS } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import { segmentedControlNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_segmented_control.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';

const options = [
    { value: 'list', label: 'List' },
    { value: 'table', label: 'Table' },
    { value: 'natural', label: 'Natural' }
];

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

test('canonical Squirrel segmented-control contract requires two unique options and one known selection', () => {
    const presentation = normalizeSegmentedControlPresentation({ options, value: 'table' });

    assert.equal(presentation.value, 'table');
    assert.equal(presentation.selectedIndex, 1);
    assert.equal(presentation.selectedOption.label, 'Table');
    assert.throws(() => normalizeSegmentedControlPresentation({ options: [options[0]], value: 'list' }), /squirrel_segmented_control_options_minimum:2/);
    assert.throws(() => normalizeSegmentedControlPresentation({ options, value: null }), /squirrel_segmented_control_value_required/);
    assert.throws(() => normalizeSegmentedControlPresentation({ options, value: 'grid' }), /squirrel_select_value_unknown:grid/);
    assert.throws(() => normalizeSegmentedControlPresentation({
        options: [options[0], { value: 'list', label: 'Other' }], value: 'list'
    }), /squirrel_select_option_value_duplicate:list/);
});

test('shared segmented builder composes native BevyUI primitives with token-owned geometry and distinct states', () => {
    const control = segmentedControlNode({
        id: 'view_mode', options, value: 'table', hoveredValue: 'natural', focusedValue: 'natural', pressedValue: 'list',
        on: { activate: () => {} }
    });
    const list = findNode(control, 'view_mode_segment_0');
    const table = findNode(control, 'view_mode_segment_1');
    const natural = findNode(control, 'view_mode_segment_2');

    assert.equal(control.kind, 'segmented_control');
    assert.equal(SUPPORTED_KINDS.has(control.kind), true);
    assert.equal(INTERACTIVE_KINDS.has(control.kind), true);
    assert.deepEqual(control.style.size, [BEVY_PANEL_TOKENS.inputWidthPx, BEVY_PANEL_TOKENS.segmentedControl.heightPx]);
    assert.deepEqual([list, table, natural].map((segment) => segment.style.size[0]), [119, 119, 120]);
    assert.deepEqual([list, table, natural].map((segment) => segment.style.position[0]), [0, 119, 238]);
    assert.deepEqual(findNode(table, 'view_mode_segment_1_surface').style.background, BEVY_PANEL_TOKENS.buttonMaterial.selected.background);
    assert.deepEqual(findNode(list, 'view_mode_segment_0_surface').style.background, BEVY_PANEL_TOKENS.buttonMaterial.pressed.background);
    assert.deepEqual(findNode(natural, 'view_mode_segment_2_surface').style.background, BEVY_PANEL_TOKENS.buttonMaterial.hover.background);
    assert.deepEqual(findNode(natural, 'view_mode_segment_2_surface').style.shadows.at(-1), BEVY_PANEL_TOKENS.buttonMaterial.focusShadow);
    assert.equal(findNode(control, 'view_mode_segment_1_divider'), null);
    assert.equal(list.on.activate instanceof Function, true);

    const disabled = segmentedControlNode({ id: 'disabled_mode', options, value: 'list', disabled: true, on: { activate: () => {} } });
    disabled.children.forEach((segment) => {
        assert.equal(segment.on, undefined);
        assert.equal(segment.style.opacity, BEVY_PANEL_TOKENS.select.disabledOpacity);
    });
});


test('segmented buttons activate through the canonical pointer lifecycle', () => {
    const emitted = [];
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const target = { treeId: 'segmented_tree', nodeId: 'segment_table', kind: 'button', box: {}, scrollAncestors: [] };
    const runtime = createBevyUiPointerRuntime({
        state: { lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null, hoverTarget: null, pendingTextActivation: null },
        hitTestTrees: () => target,
        localEventForTarget: (_, type) => ({ type }),
        emitUiEvents: (events) => emitted.push(...events),
        scrollRuntime: { begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false }
    });

    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 12, y: 12 }, event: { pointerId: 12 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 12, y: 12 }, event: { pointerId: 12 } });
    assert.deepEqual(emitted.map((event) => event.type), ['press', 'focus', 'release', 'activate']);
});
