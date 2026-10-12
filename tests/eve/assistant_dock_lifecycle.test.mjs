import assert from 'node:assert/strict';
import { test } from 'vitest';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createAssistantDock, resolveAssistantDockGeometry } from '../../eVe/voice/assistant/assistant_dock.js';
import { installDom, findNode, createRuntimeHarness } from './bevy_ui_main_menu_test_helpers.mjs';
import { buildInlineSearchNodes } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_inline_search.js';
import { vi } from 'vitest';

test('Message contains a scrollable status and separate action while preserving the editable draft', () => {
    const activate = vi.fn(), focus = vi.fn();
    const options = { id: 'prompt', itemSize: 48, width: 230, iconOffsetX: 182, value: 'My exact draft',
        on: { activate: focus }, status: { text: 'A long precise cause '.repeat(12), action: { icon: 'link', label: 'Settings', activate } } };
    const display = { children: buildInlineSearchNodes(options) };
    const field = findNode(display, 'prompt_field'), scroll = findNode(field, 'prompt_status_scroll');
    assert.equal(field.style.overflow, 'hidden'); assert.equal(scroll.style.overflow, 'scroll_x');
    assert.ok(findNode(scroll, 'prompt_status_text').style.size[0] > scroll.style.size[0]);
    findNode(field, 'prompt_accessory_status_action').on.activate(); assert.equal(activate.mock.calls.length, 1);
    assert.equal(focus.mock.calls.length, 0);
    scroll.on.activate(); assert.equal(focus.mock.calls.length, 1);
    const editing = { children: buildInlineSearchNodes({ ...options, focused: true }) };
    assert.equal(findNode(editing, 'prompt_status_text'), null);
    assert.equal(findNode(editing, 'prompt_text').text, 'My exact draft');
});

test('the assistant uses the published ribbon origin and slot size on either hand', () => {
    for (const handedness of ['left', 'right']) {
        const slot = { x: 73, y: 0, width: 360, itemSize: 64, iconOffsetX: handedness === 'left' ? 0 : 296 };
        const layout = { y: 714, itemSize: 64 };
        expectGeometry(resolveAssistantDockGeometry({ width: 900, height: 800, handedness, slot, layout }), slot, layout);
    }
});
const expectGeometry = (geometry, slot, layout) => {
    assert.deepEqual(geometry.anchorRect, { left: slot.x + slot.iconOffsetX, top: layout.y, width: 64, height: 64 });
};

test('assistant input reserves ribbon space and replaces Atom content until teardown', async () => {
    const h = createRuntimeHarness(); h.dom.reconfigure({ url: 'http://localhost:3001/' });
    let inputMode = 'voice';
    const api = { getState: () => ({ active: true, inputMode, connected: true }),
        focusText: () => { inputMode = 'text'; }, listen: async () => { inputMode = 'voice'; } };
    const dock = createAssistantDock({ env: h.window, api: () => api });
    const tree = () => h.calls.filter(call => call.payload?.id === 'eve_bevy_ui_main_menu').at(-1).payload.tree;
    try {
        setMainMenuRuntime(h.runtime, h.window); await h.runtime.open();
        const before = tree().itemBoxes;
        const atomBefore = before.find(box => box.item.key === 'atome');
        // `capture` is the tool the widened Atome handle pushes: the reserved
        // room is taken out of its neighbours on the inner side.
        const neighborBefore = before.find(box => box.item.key === 'capture');
        await dock.open(); await dock.toggleInput();
        await new Promise(resolve => setTimeout(resolve, 260)); await dock.refresh();
        const expanded = tree();
        const atom = expanded.itemBoxes.find(box => box.item.key === 'atome');
        const neighbor = expanded.itemBoxes.find(box => box.item.key === 'capture');
        assert.ok(atom.width > atomBefore.width + 250);
        assert.equal(atom.x + atom.iconOffsetX, atomBefore.x + atomBefore.iconOffsetX);
        assert.ok(neighbor.x < neighborBefore.x);
        assert.equal(findNode(expanded.root, atom.item.id + '_icon'), null);
        const field = findNode(expanded.root, 'assistant_prompt_field');
        assert.ok(field); assert.equal(inputMode, 'text');
        field.on.activate(); assert.equal(inputMode, 'text');
        // The microphone square answers the live lane, exactly like the glyph it
        // carries: the row is not a second gesture to discover.
        await findNode(expanded.root, 'assistant_prompt_accessory_microphone').on.activate();
        assert.equal(inputMode, 'voice');
        await dock.close();
        assert.ok(findNode(tree().root, atom.item.id + '_icon'));
        assert.equal(h.runtime.state.externalOpenByToolId.get('voice.assistant.toggle'), 0);
    } finally { await dock.close(); setMainMenuRuntime(null, h.window); h.runtime.destroy(); h.restore(); }
});

test('connecting blink updates opacity only and releases its tree on close', async () => {
    const dom = installDom(), calls = []; dom.dom.reconfigure({ url: 'http://localhost:3001/' });
    dom.window.eveBevyUiRuntime = {
        mountTree: async () => calls.push('mount'), updateTree: async () => calls.push('tree'),
        updateTreeMotion: async payload => calls.push(payload), unmountTree: async () => calls.push('unmount')
    };
    const dock = createAssistantDock({ env: dom.window, api: () => ({ getState: () => ({ active: true, transition: 'connecting' }) }) });
    try {
        await dock.open(); const initial = calls.length;
        await dock.connecting(.25); await dock.connecting(.25); await dock.connecting(1);
        assert.equal(calls.length, initial + 2);
        assert.deepEqual(calls.at(-1).updates, [{ nodeId: 'assistant_connecting', style: { opacity: 1 } }]);
        await dock.close(); const closed = calls.length; await dock.connecting(.25);
        assert.equal(calls.length, closed); assert.equal(calls.at(-1), 'unmount');
    } finally { await dock.close(); dom.restore(); }
});

test('Atom short press closes the active assistant or opens the workspace, with no toggle during disappearance', async () => {
    const { activateAtomShortPress } = await import('../../eVe/intuition/ribbon/bevy_ui_product_runtime.js');
    for (const transition of ['connecting', 'appearing', 'visible', 'disappearing']) {
        const calls = [];
        const assistant = { getState: () => ({ active: true, transition }), close: async payload => calls.push(['close', payload]) };
        await activateAtomShortPress({ source: 'mystic_center_click' }, { assistant, openDashboard: () => calls.push(['dashboard']) });
        assert.deepEqual(calls, [['close', { source: 'mystic_center_click' }]]);
    }
    const calls = [];
    await activateAtomShortPress({ source: 'bevy_ui_main_menu_atome' }, { assistant: null, professional: false, openDashboard: payload => calls.push(payload) });
    assert.deepEqual(calls, [{ source: 'bevy_ui_main_menu_atome' }]);
});
