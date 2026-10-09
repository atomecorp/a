import { test, expect } from 'vitest';
import { createMenuPaletteOwnership, getMainMenuRuntime, setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createAtomeContextualRailGestures } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_gestures.js';
import { installDom, createRuntimeHarness, findNode, waitMs } from './bevy_ui_main_menu_test_helpers.mjs';

const pointer = (win, type, x, y, id = 1) => {
    const event = new win.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: id });
    win.dispatchEvent(event);
};

test('a single palette lease spans menus, preserves product registration and closes only its palette', async () => {
    const env = installDom();
    const panels = { open: true };
    let a = true, b = false;
    const main = createMenuPaletteOwnership({ isOpen: () => a, contains: event => event.clientX === 10, dismiss: () => { a = false; } });
    const rail = createMenuPaletteOwnership({ isOpen: () => b, contains: event => event.clientX === 20, dismiss: () => { b = false; } });
    try {
        main.claim(); setMainMenuRuntime({ id: 'main' });
        b = true; rail.claim();
        expect(a).toBe(false); expect(b).toBe(true);
        expect(getMainMenuRuntime().id).toBe('main');
        pointer(env.window, 'pointerdown', 20, 10); pointer(env.window, 'pointerup', 20, 10);
        await waitMs(0); expect(b).toBe(true);
        pointer(env.window, 'pointerdown', 40, 10); pointer(env.window, 'pointerup', 40, 10);
        await waitMs(0); expect(b).toBe(false);
        expect(panels.open).toBe(true);
    } finally { main.release(); rail.release(); env.restore(); }
});

test('outside taps close after activation, while held travel and cancellation keep their original owners', async () => {
    const env = installDom();
    let open = true;
    const ownership = createMenuPaletteOwnership({ isOpen: () => open, contains: event => event.clientX < 20, dismiss: () => { open = false; } });
    try {
        ownership.claim();
        pointer(env.window, 'pointerdown', 50, 50); pointer(env.window, 'pointerup', 150, 50);
        await waitMs(0); expect(open).toBe(true);
        pointer(env.window, 'pointerdown', 50, 50); pointer(env.window, 'pointercancel', 50, 50);
        pointer(env.window, 'pointerup', 50, 50); await waitMs(0); expect(open).toBe(true);
        pointer(env.window, 'pointerdown', 50, 50); pointer(env.window, 'pointerup', 50, 50);
        expect(open).toBe(true);
        ownership.claim(); // Actual activation opens another palette before dismissal.
        await waitMs(0); expect(open).toBe(true);
        pointer(env.window, 'pointerdown', 50, 50); pointer(env.window, 'pointerup', 50, 50);
        await waitMs(0); expect(open).toBe(false);
    } finally { ownership.release(); env.restore(); }
});

test('real ribbon and rail handlers hand off one palette while retaining slide and long-press entry', async () => {
    const h = createRuntimeHarness({ content: {
        toolbox: { children: ['view', 'time'] },
        view: { atome_tool: true, type: 'palette', label: 'View', tool_id: 'view', children: ['view_list'] },
        view_list: { label: 'List', tool_id: 'view.list' },
        time: { atome_tool: true, label: 'Time', tool_id: 'time' }
    } });
    const state = { activePaletteKey: '', activePalettePath: [], railScrollOffset: 0, sliderStateByKey: new Map(),
        activeAtomeId: 'photo', suspended: false };
    const definitions = [{ key: 'view', toolType: 'palette', children: [{ key: 'view_list', toolType: 'tool' }] }];
    const rail = createAtomeContextualRailGestures({ state, scheduleRender() {}, render() {}, activeToolIds: () => null,
        displayDefinitions: () => definitions, runActiveDefinition() {}, announceChange() {},
        bevyRuntimeResolver: () => h.window.eveBevyUiRuntime });
    const tree = () => h.calls.at(-1).payload.tree;
    try {
        await h.runtime.open();
        await findNode(tree().root, 'eve_bevy_ui_main_menu_tool_view').on.activate({});
        expect(h.runtime.measure().activePaletteKey).toBe('view');
        rail.handlers().atome_contextual_tool_view.palette_slide_open({});
        expect(state.activePaletteKey).toBe('view');
        expect(h.runtime.measure().activePaletteKey).toBe('');
        await h.runtime.refresh();
        findNode(tree().root, 'eve_bevy_ui_main_menu_tool_view').on.palette_slide_open({});
        expect(state.activePaletteKey).toBe('');
        expect(h.runtime.measure().activePaletteKey).toBe('view');
        await waitMs(260);
        await h.runtime.refresh();
        const target = findNode(tree().root, 'eve_bevy_ui_main_menu_tool_view');
        target.on.palette_slide_open({}); // Revealing an open palette still does not toggle it.
        expect(h.runtime.measure().activePaletteKey).toBe('view');
        h.window.eveBevyUiRuntime.hitTestAtClientPoint = () => ({treeId:'eve_bevy_ui_main_menu', nodeId:'eve_bevy_ui_main_menu_tool_view_background'});
        pointer(h.window, 'pointerdown', 30, 30); pointer(h.window, 'pointerup', 30, 30);
        await waitMs(0);
        expect(h.runtime.measure().activePaletteKey).toBe('view');
        const longDefinition = { key: 'play', toolType: 'palette', active: true,
            longPressChildren: [{ key: 'play_mode', toolType: 'tool' }] };
        definitions.push(longDefinition);
        rail.handlers().atome_contextual_tool_play.long_press({});
        expect(state.activePaletteKey).toBe('play');
        expect(h.runtime.measure().activePaletteKey).toBe('');
    } finally { state.activePaletteKey = ''; rail.handlers(); h.runtime.destroy(); h.restore(); }
});
