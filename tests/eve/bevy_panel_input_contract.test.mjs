import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import { normalizeTextInputPresentation } from '../../atome/src/squirrel/components/input_contract.js';
import { getTextServiceState } from '../../eVe/domains/rendering/hidden_text_service_runtime.js';
import { createTextEditingLayout } from '../../eVe/domains/rendering/text_editing_layout.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { textInputNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { textInputProjectionUpdates } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_editable_text.js';

const visit = (node, callback) => {
    if (!node) return;
    callback(node);
    (node.children || []).forEach((child) => visit(child, callback));
};

const findNode = (nodes, id) => {
    let found = null;
    nodes.forEach((node) => visit(node, (candidate) => {
        if (candidate.id === id) found = candidate;
    }));
    return found;
};

const installDom = () => new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');

test('canonical input presentation is single-line and renderer-neutral', () => {
    assert.deepEqual(normalizeTextInputPresentation({
        value: 'one\ntwo', placeholder: 'three\rfour', disabled: true, readOnly: true
    }), {
        value: 'onetwo', placeholder: 'threefour', disabled: true, readOnly: true
    });
});

test('single-line typing patches only text and caret records', () => {
    const updates = textInputProjectionUpdates({
        id: 'name_input', text: 'Ada',
        previous: { focused: true, selection: { start: 2, end: 2 }, caretRect: { x: 22, y: 8 }, caretVisible: false },
        next: { focused: true, selection: { start: 3, end: 3 }, caretRect: { x: 29, y: 8 }, caretVisible: true }
    });
    assert.deepEqual(updates, [
        { nodeId: 'name_input_text', suffix: '_text', text: 'Ada' },
        { nodeId: 'name_input_caret', deltaPosition: [7, 0], opacity: 1 }
    ]);
});

test('shared panel input builder owns geometry, state paint, and selection projection', () => {
    const focused = textInputNode({
        id: 'field', value: 'Hello', focused: true, selection: { start: 1, end: 4 }
    });
    assert.equal(focused.kind, 'text_input');
    assert.deepEqual(focused.style.size, [BEVY_PANEL_TOKENS.inputWidthPx, BEVY_PANEL_TOKENS.inputHeightPx]);
    assert.equal(focused.style.radius, BEVY_PANEL_TOKENS.radiusPx);
    assert.deepEqual(focused.style.background, BEVY_PANEL_TOKENS.surfaces.input.background);
    assert.deepEqual(focused.style.shadow, BEVY_PANEL_TOKENS.input.focusShadow);
    assert.equal(findNode([focused], 'field_text').text, 'Hello');
    assert.deepEqual(findNode([focused], 'field_text').style.position, [10, 0]);
    const layout = createTextEditingLayout({
        value: 'Hello',
        bounds: { x: 0, y: 0, width: BEVY_PANEL_TOKENS.inputWidthPx, height: BEVY_PANEL_TOKENS.inputHeightPx },
        style: { font_size: BEVY_PANEL_TOKENS.inputTextSizePx, font_weight: 500, line_height: 16, padding_x: 10, vertical_align: 'center' }
    });
    const expectedSelection = layout.selectionRectsFor(1, 4)[0];
    assert.deepEqual(findNode([focused], 'field_selection').style.size, [
        expectedSelection.width,
        expectedSelection.height
    ]);
    const visibleCaret = textInputNode({
        id: 'caret_visible',
        value: 'Hello',
        focused: true,
        caretVisible: true,
        selection: { start: 2, end: 2, caret: 2 }
    });
    const hiddenCaret = textInputNode({
        id: 'caret_hidden',
        value: 'Hello',
        focused: true,
        caretVisible: false,
        selection: { start: 2, end: 2, caret: 2 }
    });
    assert.deepEqual(findNode([visibleCaret], 'caret_visible_caret').style.background, BEVY_PANEL_TOKENS.input.caret);
    assert.deepEqual(findNode([hiddenCaret], 'caret_hidden_caret').style.background, BEVY_PANEL_TOKENS.input.caret);
    assert.equal(findNode([hiddenCaret], 'caret_hidden_caret').style.opacity, 0);
    const focusedEmpty = textInputNode({
        id: 'focused_empty',
        placeholder: 'Type text',
        focused: true,
        caretVisible: true,
        selection: { start: 0, end: 0, caret: 0 }
    });
    assert.equal(findNode([focusedEmpty], 'focused_empty_text').text, '');
    assert.ok(findNode([focusedEmpty], 'focused_empty_caret'));

    const disabled = textInputNode({ id: 'disabled', placeholder: 'Type text', disabled: true });
    assert.equal(findNode([disabled], 'disabled_text').text, 'Type text');
    assert.equal(disabled.style.opacity, BEVY_PANEL_TOKENS.input.disabledOpacity);
    assert.equal(disabled.on, undefined);

    const records = projectBevyUiTreeRecords({
        tree: { root: { id: 'root', kind: 'root', style: { size: [420, 80] }, children: [focused] } },
        treeId: 'text_input_contract', workspaceLayer: 'panel'
    });
    assert.ok(records.some((record) => record.id === '__eve_bevy_ui_text_input_contract_field'));
    assert.ok(records.some((record) => record.id === '__eve_bevy_ui_text_input_contract_field_text_text'));
    assert.ok(records.some((record) => record.id === '__eve_bevy_ui_text_input_contract_field_selection'));
});
