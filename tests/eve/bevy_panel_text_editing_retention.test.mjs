import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

import { createPanelTextEditingRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js';
import { getTextServiceState } from '../../eVe/domains/rendering/hidden_text_service_runtime.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { setMysticRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';

// iOS ends a long press by blurring the hidden editor. The field session is
// allowed to survive that blur, but only while its Mystic menu really stands:
// a session kept behind a dismissed keyboard holds the hidden textarea mounted,
// takes focus back on every tap, and the bottom tool band stops answering.

const installDom = () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    return dom;
};

const createRuntime = () => {
    const state = { text: 'bonjour' };
    const editing = createPanelTextEditingRuntime({
        name: 'retention_probe',
        readField: () => state.text,
        writeDraft: (_key, next) => { state.text = next; }
    });
    editing.registerField('notes', { width: 300, height: 40, nodeId: 'retention_probe_notes' });
    return { editing, state };
};

const hiddenEditor = (dom) => dom.window.document.querySelector('#eve_hidden_text_service textarea');

const focusField = (editing) => {
    editing.handle({
        type: 'retention_probe.field.focus',
        key: 'notes',
        event: { client_x: 12, client_y: 18 }
    });
};

const longPressField = (editing) => editing.handle({
    type: 'retention_probe.field.long_press',
    key: 'notes',
    event: { client_x: 12, client_y: 18 }
});

const pointerFocusFixture = ({ targetKind = 'panel' } = {}) => {
    const canvas = {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
        setPointerCapture() {}, releasePointerCapture() {}
    };
    const input = {
        treeId: 'focus_panel', nodeId: 'active_input', kind: 'text_input',
        box: { x: 0, y: 0, width: 100, height: 32 }
    };
    const target = {
        treeId: 'focus_panel', nodeId: targetKind === 'text_input' ? 'other_input' : 'panel_surface', kind: targetKind,
        box: { x: 0, y: 40, width: 200, height: 200 },
        scrollAncestors: [{ node: { id: 'panel_scroll' }, box: { x: 0, y: 0, width: 200, height: 240 } }]
    };
    const events = [];
    let scrolling = false;
    let clock = 0;
    const state = {
        handlers: new Map([
            ['focus_panel:active_input:blur', () => {}],
            [`focus_panel:${target.nodeId}:focus`, () => {}],
            [`focus_panel:${target.nodeId}:activate`, () => {}]
        ]),
        lastSurfacePoints: new Map(), pointerTarget: null,
        focusTarget: { ...input, canvas }, hoverTarget: null, pendingTextActivation: null
    };
    const runtime = createBevyUiPointerRuntime({
        state, now: () => clock,
        hitTestTrees: () => target,
        localEventForTarget: (node, event) => ({ node_id: node.nodeId, event }),
        emitUiEvents: (next) => events.push(...next),
        scrollRuntime: {
            begin: () => { scrolling = false; },
            drag: () => { scrolling = true; return true; },
            end: () => scrolling,
            hover() {}, wheel: () => false
        }
    });
    const route = (phase, y = 80) => runtime.routePointerEvent({
        canvas, phase, point: { x: 50, y },
        event: { pointerId: 8, pointerType: 'touch', button: 0, isPrimary: true }
    });
    return { events, input, route, state, target, setClock: (value) => { clock = value; } };
};

test('a focused panel input only yields focus to a completed tap, never to scroll or hold', () => {
    const fixture = pointerFocusFixture();
    fixture.route('pointerdown');
    fixture.route('pointermove', 120);
    fixture.route('pointerup', 120);
    assert.equal(fixture.events.some((event) => event.event === 'blur'), false);
    assert.equal(fixture.state.focusTarget?.nodeId, fixture.input.nodeId);

    fixture.events.length = 0;
    fixture.route('pointerdown', 120);
    fixture.route('pointermove', 80);
    fixture.route('pointerup', 80);
    assert.equal(fixture.events.some((event) => event.event === 'blur'), false,
        'the reverse scroll direction also retains the input focus');
    assert.equal(fixture.state.focusTarget?.nodeId, fixture.input.nodeId);

    fixture.events.length = 0;
    fixture.setClock(1000);
    fixture.route('pointerdown');
    fixture.setClock(1500);
    fixture.route('pointerup');
    fixture.route('click');
    assert.equal(fixture.events.some((event) => event.event === 'blur'), false);
    assert.equal(fixture.events.some((event) => event.event === 'activate'), false);
    assert.equal(fixture.state.focusTarget?.nodeId, fixture.input.nodeId);

    fixture.events.length = 0;
    fixture.setClock(2000);
    fixture.route('pointerdown');
    fixture.setClock(2010);
    fixture.route('pointerup');
    assert.deepEqual(fixture.events.map((event) => event.event), ['press', 'release', 'blur', 'focus', 'activate']);
    assert.equal(fixture.state.focusTarget?.nodeId, fixture.target.nodeId);
});

test('a completed tap on another panel input transfers focus on the terminal click', () => {
    const fixture = pointerFocusFixture({ targetKind: 'text_input' });
    fixture.route('pointerdown');
    fixture.route('pointerup');
    assert.deepEqual(fixture.events.map((event) => event.event), ['press', 'release']);
    fixture.route('click');
    assert.deepEqual(fixture.events.map((event) => event.event), ['press', 'release', 'blur', 'focus', 'activate']);
    assert.equal(fixture.state.focusTarget?.nodeId, fixture.target.nodeId);
});

test('a refused Mystic opening must not retain the hidden editor for the session', async () => {
    const dom = installDom();
    const { editing } = createRuntime();
    try {
        focusField(editing);
        const editor = hiddenEditor(dom);
        assert.ok(editor, 'the focused field owns the hidden editor');
        assert.equal(getTextServiceState().activeEditorCount, 1);

        // The Mystic runtime is mounted after the boot presentation, so the first
        // long press of a session can precede it: the opening is refused, and the
        // refusal must not leave a retention flag behind.
        await assert.rejects(longPressField(editing), /bevy_mystic_runtime_unavailable/);

        editor.dispatchEvent(new dom.window.Event('blur'));
        assert.equal(
            getTextServiceState().activeEditorCount,
            0,
            'a refused opening must release the field on the next blur'
        );
    } finally {
        editing.stop();
        setMysticRuntime(null);
    }
});

test('a standing Mystic menu still retains the field, and its removal releases it', async () => {
    const dom = installDom();
    const { editing } = createRuntime();
    let menuOpen = false;
    setMysticRuntime({
        isOpen: () => menuOpen,
        openAt: () => { menuOpen = true; return true; },
        close: () => { menuOpen = false; }
    });
    try {
        focusField(editing);
        const editor = hiddenEditor(dom);
        const opened = await longPressField(editing);
        assert.equal(opened.ok, true);
        assert.equal(menuOpen, true, 'the long press must have opened the menu');
        assert.equal(getTextServiceState().activeEditorCount, 1);

        // iOS blurs the editor as the long press ends while the menu stands.
        editor.dispatchEvent(new dom.window.Event('blur'));
        assert.equal(
            getTextServiceState().activeEditorCount,
            1,
            'the field holds only for the menu standing over it'
        );

        // A rotation or a work-mode change removes the menu without ever calling
        // our onClose: the next blur must release the field on its own.
        menuOpen = false;
        hiddenEditor(dom).dispatchEvent(new dom.window.Event('blur'));
        assert.equal(
            getTextServiceState().activeEditorCount,
            0,
            'a menu removed without onClose must not pin the keyboard open'
        );
    } finally {
        editing.stop();
        setMysticRuntime(null);
    }
});

test('closing a panel stops its active input session and releases the hidden editor', () => {
    const dom = installDom();
    const { editing } = createRuntime();
    focusField(editing);
    assert.equal(getTextServiceState().activeEditorCount, 1);

    editing.stop();

    assert.equal(getTextServiceState().activeEditorCount, 0,
        'panel teardown must release focus and remove the canonical hidden editor');
    dom.window.close();
});
