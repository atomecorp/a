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

test('an explicitly empty input keeps a text record for the first in-place update', () => {
    const field = textInputNode({ id: 'first_type', value: '', focused: true,
        selection: { start: 0, end: 0, caret: 0 }, caretVisible: true });
    const records = projectBevyUiTreeRecords({ tree: { root: field }, treeId: 'empty_input', workspaceLayer: 'panel' });
    const record = records.find(entry => entry.id === '__eve_bevy_ui_empty_input_first_type_text_text');
    assert.ok(record, 'the first keystroke must target an existing projected text record');
    assert.equal(record.properties.text, '');
});

const editingFixture = async ({ value = '', multiline = false, masked = false } = {}) => {
    const { createPanelTextEditingRuntime } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js');
    const { editableTextInputNode } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_editable_text.js');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    let draft = value, records = new Map(), rebuilds = 0, patches = 0;
    const display = raw => masked ? '•'.repeat(raw.length) : raw;
    const runtime = createPanelTextEditingRuntime({ name: 'first_type', multiline,
        readField: () => draft, writeDraft: (_, next) => { draft = next; },
        ...(masked ? { projectValue: (_, raw) => display(raw), secureField: () => true } : {}) });
    runtime.registerField('field', { width: 160, height: multiline ? 80 : 30, multiline, nodeId: 'input' });
    const refresh = () => {
        rebuilds++;
        const field = editableTextInputNode({ id: 'input', width: 160, height: multiline ? 80 : 30, multiline,
            input: { value: display(draft), placeholder: '', disabled: false }, ...runtime.fieldView('field') });
        records = new Map(projectBevyUiTreeRecords({ tree: { root: field }, treeId: 'typing', workspaceLayer: 'panel' }).map(record=>[record.id,record]));
    };
    const patchText = updates => {
        patches++;
        updates.forEach(update=>{
            const id = `__eve_bevy_ui_typing_${update.nodeId}${update.suffix || ''}`;
            assert.ok(records.has(id), `in-place projection must target existing record ${id}`);
            if(Object.prototype.hasOwnProperty.call(update,'text')) records.get(id).properties.text = update.text;
        });
    };
    runtime.handle({type:'first_type.field.focus',key:'field',event:{x:10,y:15}}, {refresh,patchText});
    const editor = dom.window.document.querySelector('#eve_hidden_text_service textarea');
    return { runtime, dom, editor, read:()=>draft, records:()=>[...records.values()], rebuilds:()=>rebuilds, patches:()=>patches,
        input(next, inputType='insertText') { editor.value=next; editor.setSelectionRange(next.length,next.length); editor.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,inputType})); },
        close() { runtime.stop(); dom.window.close(); globalThis.window=previousWindow; globalThis.document=previousDocument; } };
};

test('empty field first typing, continuous typing, erase and retype keep one editor and update projected text', async () => {
    const fixture = await editingFixture();
    try {
        const rebuilds = fixture.rebuilds();
        for(const value of ['A','Ada','','B','Bonjour ']) {
            fixture.input(value, value ? 'insertText':'deleteContentBackward');
            assert.equal(fixture.read(),value);
            assert.equal(fixture.records().find(record=>record.id.endsWith('_input_text_text')).properties.text,value);
            assert.equal(fixture.dom.window.document.querySelector('#eve_hidden_text_service textarea'),fixture.editor);
            assert.equal(fixture.dom.window.document.activeElement,fixture.editor);
            assert.equal(getTextServiceState().activeEditorCount,1);
        }
        assert.equal(fixture.rebuilds(),rebuilds,'continuous single-line text changes use partial projection');
        assert.ok(fixture.patches()>0);
    } finally { fixture.close(); }
});

test('pre-filled text replacement, selection, paste and secure masking use the same session', async () => {
    const fixture = await editingFixture({value:'secret',masked:true});
    try {
        fixture.editor.setSelectionRange(1,4);
        fixture.dom.window.document.dispatchEvent(new fixture.dom.window.Event('selectionchange'));
        await new Promise(resolve => fixture.dom.window.requestAnimationFrame(resolve));
        assert.equal(fixture.runtime.fieldView('field').selection.end,4);
        fixture.editor.setRangeText('copied',1,4,'end');
        fixture.editor.dispatchEvent(new fixture.dom.window.InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));
        assert.equal(fixture.read(),'scopiedet');
        const projected=fixture.records().find(record=>record.id.endsWith('_input_text_text')).properties.text;
        assert.equal(projected,'•'.repeat(fixture.read().length));
        assert.equal(fixture.editor.getAttribute('autocomplete'),'new-password');
    } finally { fixture.close(); }
});

test('multiline text topology rebuilds without replacing focus or the editor, and caret-only changes patch', async () => {
    const fixture = await editingFixture({multiline:true});
    try {
        const before=fixture.rebuilds();
        fixture.input('First\nSecond','insertLineBreak');
        assert.ok(fixture.rebuilds()>before);
        const lines=fixture.records().filter(record=>record.type==='text').map(record=>record.properties.text);
        assert.deepEqual(lines,['First','Second']);
        const after=fixture.rebuilds();
        fixture.editor.setSelectionRange(1,1);
        fixture.dom.window.document.dispatchEvent(new fixture.dom.window.Event('selectionchange'));
        assert.equal(fixture.rebuilds(),after,'moving the caret on unchanged lines does not rebuild');
        fixture.input('','deleteContentBackward');
        fixture.input('New line');
        assert.equal(fixture.records().find(record=>record.id.endsWith('_input_text_0_text')).properties.text,'New line');
        assert.equal(fixture.dom.window.document.activeElement,fixture.editor);
    } finally { fixture.close(); }
});

test('IME composition publishes the composed value through the shared panel session', async () => {
    const fixture = await editingFixture();
    try {
        fixture.editor.dispatchEvent(new fixture.dom.window.CompositionEvent('compositionstart',{bubbles:true}));
        fixture.input('日','insertCompositionText');
        fixture.input('日本','insertCompositionText');
        fixture.editor.dispatchEvent(new fixture.dom.window.CompositionEvent('compositionend',{bubbles:true,data:'日本'}));
        assert.equal(fixture.read(),'日本');
        assert.equal(fixture.records().find(record=>record.id.endsWith('_input_text_text')).properties.text,'日本');
        assert.equal(fixture.dom.window.document.activeElement,fixture.editor);
    } finally { fixture.close(); }
});
