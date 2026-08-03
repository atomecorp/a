import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeToggleablePresentation } from '../../atome/src/squirrel/components/toggleable_contract.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { INTERACTIVE_KINDS } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import {
    BEVY_ICON_BUTTON_TOKENS,
    resolveBevyIconButtonSurface
} from '../../eVe/intuition/shared/bevy_ui_icon_button.js';
import { radioGroupNode, toggleableRowNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_choice.js';
import { panelLabSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_lab_surface.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';

const tokens = BEVY_PANEL_TOKENS.choice;
const rowWidth = BEVY_ICON_BUTTON_TOKENS.sizePx
    + BEVY_ICON_BUTTON_TOKENS.labelGapPx
    + BEVY_ICON_BUTTON_TOKENS.labelWidthPx;

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

const radioOptions = [{ value: 'left', label: 'Left handed' }, { value: 'right', label: 'Right handed' }];

test('canonical Squirrel toggleable contract validates kind, label, and boolean state', () => {
    const presentation = normalizeToggleablePresentation({ kind: 'checkbox', label: '  Show items  ', checked: true });

    assert.deepEqual(presentation, { kind: 'checkbox', label: 'Show items', checked: true, disabled: false });
    assert.throws(() => normalizeToggleablePresentation({ label: 'x' }), /squirrel_toggleable_kind_required/);
    assert.throws(() => normalizeToggleablePresentation({ kind: 'slider', label: 'x' }), /squirrel_toggleable_kind_unsupported:slider/);
    assert.throws(() => normalizeToggleablePresentation({ kind: 'checkbox', label: ' ' }), /squirrel_toggleable_label_required/);
    assert.throws(() => normalizeToggleablePresentation({ kind: 'checkbox', label: 'x', checked: 'yes' }), /squirrel_toggleable_checked_boolean_required/);
});

test('each choice control uses its own native interactive kind and the shared row geometry', () => {
    const checkbox = toggleableRowNode({ id: 'cb', kind: 'checkbox', label: 'Checkbox' });
    const toggle = toggleableRowNode({ id: 'sw', kind: 'switch', label: 'Switch' });
    const group = radioGroupNode({ id: 'rg', options: radioOptions, value: 'left' });

    assert.equal(checkbox.kind, 'checkbox');
    assert.equal(toggle.kind, 'toggle');
    assert.equal(findNode(group, 'rg_left').kind, 'radio');
    [checkbox.kind, toggle.kind, 'radio'].forEach((kind) => assert.equal(INTERACTIVE_KINDS.has(kind), true));

    const gap = BEVY_PANEL_TOKENS.controlGroupGapPx;
    assert.deepEqual(checkbox.style.size, [rowWidth, BEVY_ICON_BUTTON_TOKENS.rowHeightPx]);
    assert.deepEqual(toggle.style.size, [rowWidth, BEVY_ICON_BUTTON_TOKENS.rowHeightPx]);
    assert.deepEqual(group.style.size, [rowWidth, (BEVY_ICON_BUTTON_TOKENS.rowHeightPx * 2) + gap]);
    assert.deepEqual(findNode(group, 'rg_right').style.position, [0, BEVY_ICON_BUTTON_TOKENS.rowHeightPx + gap]);

    // One shared indicator column keeps every label aligned whatever the shape.
    const labelLeft = (node, id) => findNode(node, id).style.position[0];
    assert.equal(labelLeft(checkbox, 'cb_label'), BEVY_ICON_BUTTON_TOKENS.sizePx + BEVY_ICON_BUTTON_TOKENS.labelGapPx);
    assert.equal(labelLeft(toggle, 'sw_label'), labelLeft(checkbox, 'cb_label'));
    assert.equal(labelLeft(group, 'rg_left_label'), labelLeft(checkbox, 'cb_label'));
    assert.deepEqual(findNode(checkbox, 'cb_indicator').style.size, [tokens.boxSizePx, tokens.boxSizePx]);
    assert.deepEqual(findNode(toggle, 'sw_indicator').style.size, [tokens.switchWidthPx, tokens.switchHeightPx]);
    assert.equal(findNode(group, 'rg_left_indicator').style.radius, tokens.radioSizePx / 2);
});

test('a compact checkbox rail keeps its accessible label and owns vertical drag events', () => {
    const events = [];
    const rail = toggleableRowNode({
        id: 'contact_rail',
        kind: 'checkbox',
        label: 'Select Ada',
        indicatorOnly: true,
        on: {
            press: () => events.push('press'),
            drag: () => events.push('drag'),
            release: () => events.push('release')
        }
    });

    assert.equal(findNode(rail, 'contact_rail_label'), null);
    assert.deepEqual(rail.style.size, [BEVY_ICON_BUTTON_TOKENS.sizePx, BEVY_ICON_BUTTON_TOKENS.sizePx]);
    assert.deepEqual(rail.accessibility, { label: 'Select Ada' });
    assert.equal(typeof rail.on.drag, 'function');
    rail.on.press();
    rail.on.drag();
    rail.on.release();
    assert.deepEqual(events, ['press', 'drag', 'release']);
});

test('the selected state is a distinct indicator treatment reusing the shared check mark', () => {
    const off = toggleableRowNode({ id: 'off', kind: 'checkbox', label: 'A' });
    const on = toggleableRowNode({ id: 'on', kind: 'checkbox', label: 'A', checked: true });

    assert.equal(findNode(off, 'off_selected_mark'), null);
    assert.ok(findNode(on, 'on_selected_mark_short'));
    assert.ok(findNode(on, 'on_selected_mark_long'));
    assert.deepEqual(findNode(on, 'on_background').style.background, resolveBevyIconButtonSurface({ tone: 'neutral', active: true }).background);
    assert.deepEqual(findNode(off, 'off_background').style.background, resolveBevyIconButtonSurface({ tone: 'neutral' }).background);

    const group = radioGroupNode({ id: 'rg', options: radioOptions, value: 'right' });
    assert.ok(findNode(group, 'rg_right_indicator_dot'));
    assert.equal(findNode(group, 'rg_left_indicator_dot'), null);

    const switchOff = findNode(toggleableRowNode({ id: 'so', kind: 'switch', label: 'A' }), 'so_indicator_knob');
    const switchOn = findNode(toggleableRowNode({ id: 'sn', kind: 'switch', label: 'A', checked: true }), 'sn_indicator_knob');
    assert.equal(switchOff.style.position[0], tokens.switchKnobInsetPx);
    assert.equal(switchOn.style.position[0], tokens.switchWidthPx - tokens.switchKnobPx - tokens.switchKnobInsetPx);
});

test('the complete visual-state matrix reuses the canonical icon-button surface', () => {
    const idle = toggleableRowNode({ id: 'i', kind: 'checkbox', label: 'A' });
    const focused = toggleableRowNode({ id: 'f', kind: 'checkbox', label: 'A', focused: true });
    const pressed = toggleableRowNode({ id: 'p', kind: 'checkbox', label: 'A', pressed: true });
    const selected = toggleableRowNode({ id: 's', kind: 'checkbox', label: 'A', checked: true });
    const disabled = toggleableRowNode({ id: 'd', kind: 'checkbox', label: 'A', disabled: true, on: { activate: () => {} } });
    const radio = findNode(radioGroupNode({ id: 'r', options: radioOptions, value: 'left' }), 'r_left');
    const toggle = toggleableRowNode({ id: 't', kind: 'switch', label: 'A' });

    assert.deepEqual(idle.style.background, BEVY_PANEL_TOKENS.colors.transparent);
    assert.deepEqual(pressed.style.translation, BEVY_ICON_BUTTON_TOKENS.pressedTranslation);
    assert.deepEqual(findNode(focused, 'f_background').style.shadow, BEVY_ICON_BUTTON_TOKENS.focusShadow);
    assert.notDeepEqual(findNode(pressed, 'p_background').style.background, findNode(selected, 's_background').style.background);
    assert.deepEqual(findNode(radio, 'r_left_background').style.background, resolveBevyIconButtonSurface({ tone: 'danger', active: true }).background);
    assert.deepEqual(findNode(toggle, 't_background').style.background, resolveBevyIconButtonSurface({ tone: 'warning' }).background);
    assert.equal(disabled.style.opacity, BEVY_ICON_BUTTON_TOKENS.disabled.opacity);
    assert.equal(disabled.on, undefined, 'a disabled control must expose no handler');
    assert.equal(idle.style.opacity, 1);
});

test('Panel Lab mounts the approved four-variant contract before the table and proves each semantic', () => {
    panelLabSurface.onOpen();
    try {
        const body = panelLabSurface.buildContent(panelLabSurface.readState(), { emit: () => {}, bodyWidth: 400 });
        const dividerIndex = body.findIndex((node) => node.id === 'panel_lab_choice_divider');
        const groupIndex = body.findIndex((node) => node.id === 'panel_lab_choice_group');

        assert.equal(body.length, 41);
        assert.equal(groupIndex, dividerIndex + 1);
        assert.equal(dividerIndex > body.findIndex((node) => node.id === 'panel_lab_select'), true);
        assert.equal(groupIndex < body.findIndex((node) => node.id === 'panel_lab_table'), true);
        assert.equal(EVE_DEFAULT_MESSAGES.fr['eve.panel_lab.choice.switch'], 'Synchronisation automatique');
        assert.equal(EVE_DEFAULT_MESSAGES.en['eve.panel_lab.choice.radio_left'], 'Left handed');

        // checkbox: independent boolean, both directions.
        assert.deepEqual(panelLabSurface.handleEvent({ type: 'panel_lab.choice.checkbox.activate' }), { ok: true, checked: true });
        assert.deepEqual(panelLabSurface.handleEvent({ type: 'panel_lab.choice.checkbox.activate' }), { ok: true, checked: false });

        // radio: exclusive group, and reactivating the current choice keeps it.
        assert.equal(panelLabSurface.readState().choice.radioValue, 'left');
        assert.deepEqual(panelLabSurface.handleEvent({ type: 'panel_lab.choice.radio.activate', value: 'right' }), { ok: true, value: 'right' });
        assert.deepEqual(panelLabSurface.handleEvent({ type: 'panel_lab.choice.radio.activate', value: 'right' }), { ok: true, value: 'right' });
        assert.equal(panelLabSurface.readState().choice.radioValue, 'right');
        const afterRadio = panelLabSurface.buildContent(panelLabSurface.readState(), { emit: () => {}, bodyWidth: 400 });
        assert.ok(findNode(afterRadio, 'panel_lab_choice_radio_right_indicator_dot'));
        assert.equal(findNode(afterRadio, 'panel_lab_choice_radio_left_indicator_dot'), null);
        assert.equal(panelLabSurface.handleEvent({ type: 'panel_lab.choice.radio.activate', value: 'up' }).ok, false);

        // switch: single on/off value.
        assert.deepEqual(panelLabSurface.handleEvent({ type: 'panel_lab.choice.switch.activate' }), { ok: true, checked: true });

        // pressed state is ephemeral presentation state only.
        panelLabSurface.handleEvent({ type: 'panel_lab.choice.checkbox.press' });
        assert.equal(panelLabSurface.readState().choice.checkboxPressed, true);
        panelLabSurface.handleEvent({ type: 'panel_lab.choice.checkbox.cancel' });
        assert.equal(panelLabSurface.readState().choice.checkboxPressed, false);

        const records = projectBevyUiTreeRecords({
            tree: { root: body[groupIndex] }, treeId: 'choice_projection', workspaceLayer: 'panel'
        });
        assert.equal(records.some((record) => record.id.includes('panel_lab_choice_switch')), true);
        assert.equal(records.every((record) => !String(record.id).includes('data-')), true);
    } finally {
        panelLabSurface.onClose();
    }
    const reset = panelLabSurface.readState().choice;
    assert.equal(reset.radioValue, 'left');
    assert.equal(reset.checkboxChecked, false);
    assert.equal(reset.switchChecked, false);
    assert.equal('radioHovered' in reset, false);
});

test('native choice controls activate through the canonical pointer route', () => {
    const emitted = [];
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const target = { treeId: 'choice_tree', nodeId: 'choice_row', kind: 'checkbox', box: {}, scrollAncestors: [] };
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
