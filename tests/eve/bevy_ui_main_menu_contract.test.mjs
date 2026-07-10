import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    BEVY_MAIN_MENU_ATOME_ID,
    BEVY_MAIN_MENU_LEGACY_ID,
    buildBevyMainMenuItems,
    resolveBevyMainMenuItemSize
} from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createBevyUiMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js';
import { createBevyMainMenuHoldRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_hold_runtime.js';
import { resolveDashboardBlockUnitSize } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { readToolboxReservedHeight } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { MAIN_HANDLE_ICON } from '../../eVe/intuition/ribbon/tokens.js';

const TOOL_KEYS = Object.freeze(['home', 'find', 'capture', 'time', 'communicate', 'mode', 'view']);
const LIGHTGRAY_ICON_TINT = Object.freeze([211 / 255, 211 / 255, 211 / 255, 1]);
const STANDARD_ITEM_BACKGROUND = Object.freeze([0.17, 0.19, 0.22, 1]);
const STANDARD_LABEL_TINT = Object.freeze([0.94, 0.96, 0.98, 1]);

test('BevyUI Atome hold triggers at exactly 520 ms, never at 519 ms, and only once', () => {
    let scheduled;
    let triggered = 0;
    const hold = createBevyMainMenuHoldRuntime({
        onHold: () => { triggered += 1; },
        schedule: (callback, delay) => {
            scheduled = { callback, delay, cancelled: false };
            return 1;
        },
        cancelSchedule: () => { scheduled.cancelled = true; }
    });
    hold.press('atome', { x: 0, y: 0 });
    assert.equal(scheduled.delay, 520);
    assert.equal(triggered, 0);
    scheduled.callback();
    scheduled.callback();
    assert.equal(triggered, 1);
    assert.equal(hold.consumeActivation('atome'), true);
    assert.equal(hold.consumeActivation('atome'), false);
});

const menuContent = () => ({
    toolbox: { children: [...TOOL_KEYS] },
    ...Object.fromEntries(TOOL_KEYS.map((key) => [key, {
        atome_tool: true,
        label: key,
        icon: key,
        tool_id: `tool.main.${key}`,
        action: 'toggle'
    }]))
});

const installDom = () => {
    const dom = new JSDOM('<!doctype html><main><canvas id="eve_surface_project"></canvas></main>');
    const previous = {
        window: global.window,
        document: global.document,
        HTMLElement: global.HTMLElement,
        Node: global.Node
    };
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    const surface = dom.window.document.getElementById('eve_surface_project');
    let surfaceRect = { width: 960, height: 720 };
    surface.setProbeRect = (next = {}) => {
        surfaceRect = {
            width: Number(next.width || surfaceRect.width),
            height: Number(next.height || surfaceRect.height)
        };
    };
    surface.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: surfaceRect.width,
        bottom: surfaceRect.height,
        width: surfaceRect.width,
        height: surfaceRect.height
    });
    return {
        dom,
        window: dom.window,
        document: dom.window.document,
        surface,
        restore: () => {
            global.window = previous.window;
            global.document = previous.document;
            global.HTMLElement = previous.HTMLElement;
            global.Node = previous.Node;
        }
    };
};

const findNode = (node, id) => {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};

const childBySuffix = (node, suffix) => (node.children || []).find((child) => String(child.id || '').endsWith(suffix));
const barChildren = (tree) => tree.root.children[0].children;
const collectNodes = (node, predicate, out = []) => {
    if (!node) return out;
    if (predicate(node)) out.push(node);
    for (const child of node.children || []) collectNodes(child, predicate, out);
    return out;
};
const idsFromHandleEdge = (tree, handedness) => {
    const ids = barChildren(tree).map((node) => node.id);
    return handedness === 'right' ? ids.reverse() : ids;
};
const waitFrame = () => new Promise((resolve) => setTimeout(resolve, 8));
const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createRuntimeHarness = ({
    onInvoke = () => null,
    toggleDashboard = () => null,
    toggleAssistant = () => null,
    handedness = 'right'
} = {}) => {
    const env = installDom();
    const calls = [];
    env.dom.window.eveBevyUiRuntime = {
        mountTree: async (payload) => { calls.push({ type: 'mount', payload }); return payload.tree; },
        updateTree: async (payload) => { calls.push({ type: 'update', payload }); return payload.tree; },
        unmountTree: async (id) => { calls.push({ type: 'unmount', id }); return { id }; }
    };
    const runtime = createBevyUiMainMenuRuntime({
        content: menuContent(),
        onInvoke,
        toggleDashboard,
        toggleAssistant,
        surfaceResolver: () => env.surface,
        runtimeResolver: () => env.dom.window.eveBevyUiRuntime,
        handednessResolver: () => handedness
    });
    return { ...env, calls, runtime };
};

test('BevyUI main menu model keeps the required item order and fixed dashboard half-size', () => {
    const items = buildBevyMainMenuItems(menuContent());
    assert.equal(resolveBevyMainMenuItemSize(), Math.round(resolveDashboardBlockUnitSize() / 2));
    assert.deepEqual(items.map((item) => item.id), [
        BEVY_MAIN_MENU_ATOME_ID,
        ...TOOL_KEYS.map((key) => `eve_bevy_ui_main_menu_tool_${key}`),
        BEVY_MAIN_MENU_LEGACY_ID
    ]);
    assert.equal(items[0].type, 'tool');
    assert.equal(items[0].key, 'atome');
    assert.equal(items[0].passive, undefined);
    assert.equal(items[0].icon, MAIN_HANDLE_ICON);
    assert.deepEqual(items.slice(1, -1).map((item) => item.key), menuContent().toolbox.children);
    assert.deepEqual(items.slice(1, -1).map((item) => item.label), TOOL_KEYS);
    assert.deepEqual(items.slice(1, -1).map((item) => item.icon), TOOL_KEYS.map((key) => `./assets/images/icons/${key}.svg`));
    assert.equal(items.at(-1).type, 'legacy');
    assert.equal(items.at(-1).icon, './assets/images/icons/menu.svg');
});

test('BevyUI main menu mounts only BevyUI nodes and preserves the public new_menu_v2 API', async () => {
    const harness = createRuntimeHarness();
    try {
        await harness.runtime.showFully();
        const tree = harness.calls[0].payload.tree;
        const expectedSize = Math.round(resolveDashboardBlockUnitSize() / 2);
        assert.equal(tree.layout.itemSize, expectedSize);
        assert.deepEqual(idsFromHandleEdge(tree, 'right'), [
            BEVY_MAIN_MENU_ATOME_ID,
            ...TOOL_KEYS.map((key) => `eve_bevy_ui_main_menu_tool_${key}`),
            BEVY_MAIN_MENU_LEGACY_ID
        ]);
        assert.equal(barChildren(tree).at(-1).id, BEVY_MAIN_MENU_ATOME_ID);
        assert.equal(barChildren(tree)[0].id, BEVY_MAIN_MENU_LEGACY_ID);
        const iconSize = Math.round(expectedSize * 0.38);
        const atome = findNode(tree.root, BEVY_MAIN_MENU_ATOME_ID);
        assert.equal(childBySuffix(atome, '_icon').image.source, MAIN_HANDLE_ICON);
        assert.deepEqual(childBySuffix(atome, '_icon').style.size, [iconSize, iconSize]);
        assert.deepEqual(childBySuffix(atome, '_icon').image.tint, LIGHTGRAY_ICON_TINT);
        assert.deepEqual(childBySuffix(atome, '_icon').image.tint, childBySuffix(findNode(tree.root, 'eve_bevy_ui_main_menu_tool_home'), '_icon').image.tint);
        assert.equal(childBySuffix(atome, '_label').text, 'Atome');
        assert.equal(childBySuffix(atome, '_label').image.text, 'Atome');
        assert.deepEqual(childBySuffix(atome, '_label').image.tint, STANDARD_LABEL_TINT);
        assert.equal(childBySuffix(atome, '_label').image.opacity, 1);
        assert.equal(childBySuffix(atome, '_icon').image.opacity, 1);
        assert.deepEqual(atome.style.background, STANDARD_ITEM_BACKGROUND);
        assert.equal(atome.style.radius, undefined);
        assert.ok(atome.style.padding[0] > atome.style.padding[2]);
        const iconTints = [];
        for (const key of TOOL_KEYS) {
            const item = findNode(tree.root, `eve_bevy_ui_main_menu_tool_${key}`);
            assert.equal(childBySuffix(item, '_icon').kind, 'image');
            assert.equal(childBySuffix(item, '_icon').image.source, `./assets/images/icons/${key}.svg`);
            assert.deepEqual(childBySuffix(item, '_icon').style.size, [iconSize, iconSize]);
            assert.deepEqual(childBySuffix(item, '_icon').image.tint, LIGHTGRAY_ICON_TINT);
            assert.equal(childBySuffix(item, '_icon').image.opacity, 1);
            iconTints.push(childBySuffix(item, '_icon').image.tint);
            assert.equal(childBySuffix(item, '_label').text, key);
            assert.equal(childBySuffix(item, '_label').image.text, key);
            assert.deepEqual(childBySuffix(item, '_label').image.tint, STANDARD_LABEL_TINT);
            assert.equal(childBySuffix(item, '_label').image.opacity, 1);
            assert.deepEqual(item.style.background, STANDARD_ITEM_BACKGROUND);
            assert.equal(item.style.radius, undefined);
            assert.ok(item.style.padding[0] > item.style.padding[2]);
        }
        iconTints.push(childBySuffix(atome, '_icon').image.tint);
        iconTints.push(childBySuffix(findNode(tree.root, BEVY_MAIN_MENU_LEGACY_ID), '_icon').image.tint);
        assert.equal(new Set(iconTints.map((tint) => JSON.stringify(tint))).size, 1);
        assert.equal(childBySuffix(findNode(tree.root, BEVY_MAIN_MENU_LEGACY_ID), '_label').text, 'Menu');
        assert.equal(childBySuffix(findNode(tree.root, BEVY_MAIN_MENU_LEGACY_ID), '_icon').image.source, './assets/images/icons/menu.svg');
        [
            'open', 'close', 'reveal', 'hide', 'hideCompletely', 'showFully',
            'getContent', 'updateContent', 'add', 'remove',
            'setToolLatchedState', 'getToolLatchedState', 'setToolExternalOpen',
            'measure', 'place', 'getReservedHeight'
        ].forEach((name) => assert.equal(typeof harness.runtime[name], 'function', name));
        assert.equal(harness.document.querySelectorAll('button, input, [data-bevy-ui]').length, 0);
    } finally {
        harness.restore();
    }
});

test('BevyUI main menu recomputes bottom placement after surface resize', async () => {
    const harness = createRuntimeHarness();
    try {
        await harness.runtime.showFully();
        const firstTree = harness.calls.at(-1).payload.tree;
        const itemSize = firstTree.layout.itemSize;
        harness.surface.setProbeRect({ width: 1200, height: 840 });
        harness.window.dispatchEvent(new harness.window.Event('resize'));
        await waitFrame();
        const nextTree = harness.calls.at(-1).payload.tree;
        assert.equal(harness.calls.at(-1).type, 'update');
        assert.equal(nextTree.layout.x, 1200 - (itemSize * 9));
        assert.equal(nextTree.layout.y, 840 - itemSize);
        assert.equal(nextTree.root.style.size[0], 1200);
        assert.equal(nextTree.root.style.size[1], 840);
        harness.surface.setProbeRect({ width: 240, height: 240 });
        harness.window.dispatchEvent(new harness.window.Event('resize'));
        await waitFrame();
        const compactTree = harness.calls.at(-1).payload.tree;
        assert.equal(compactTree.layout.x, 240 - (itemSize * 9));
        assert.equal(compactTree.layout.y, 240 - itemSize);
        assert.equal(compactTree.layout.x + (itemSize * 8), 240 - itemSize);
        assert.equal(compactTree.layout.x + (itemSize * 7), 240 - (itemSize * 2));
        assert.equal(barChildren(compactTree).at(-1).id, BEVY_MAIN_MENU_ATOME_ID);
        const iconIds = collectNodes(compactTree.root, (node) => String(node.id || '').endsWith('_icon')).map((node) => node.id);
        assert.equal(new Set(iconIds).size, iconIds.length);
        for (const key of TOOL_KEYS) {
            const icon = childBySuffix(findNode(compactTree.root, `eve_bevy_ui_main_menu_tool_${key}`), '_icon');
            assert.deepEqual(icon.style.size, [Math.round(itemSize * 0.38), Math.round(itemSize * 0.38)]);
            assert.deepEqual(icon.image.tint, LIGHTGRAY_ICON_TINT);
        }
    } finally {
        harness.restore();
    }
});

test('BevyUI main menu keeps fixed-size tools and scrolls horizontally when the surface is narrow', async () => {
    const toggles = [];
    const harness = createRuntimeHarness({ toggleDashboard: (payload) => toggles.push(payload) });
    try {
        harness.surface.setProbeRect({ width: 240, height: 240 });
        await harness.runtime.showFully();
        const firstTree = harness.calls.at(-1).payload.tree;
        const itemSize = firstTree.layout.itemSize;
        const naturalWidth = itemSize * 9;

        assert.equal(firstTree.layout.overflowX, true);
        assert.equal(firstTree.layout.maxScrollLeft, naturalWidth - 240);
        assert.equal(firstTree.layout.scrollLeftPx, naturalWidth - 240);
        assert.equal(firstTree.layout.x, 240 - naturalWidth);
        for (const item of barChildren(firstTree)) assert.deepEqual(item.style.size, [itemSize, itemSize]);

        findNode(firstTree.root, BEVY_MAIN_MENU_ATOME_ID).on.wheel({ delta_x: -itemSize, delta_y: 0 });
        await waitFrame();
        const wheelTree = harness.calls.at(-1).payload.tree;
        assert.equal(wheelTree.layout.scrollLeftPx, naturalWidth - 240 - itemSize);
        assert.equal(wheelTree.layout.x, 240 - naturalWidth + itemSize);

        const atome = findNode(wheelTree.root, BEVY_MAIN_MENU_ATOME_ID);
        atome.on.press({ x: 30, y: 30 });
        atome.on.drag({ x: 90, y: 31 });
        atome.on.release({ x: 90, y: 31 });
        await atome.on.activate();
        assert.deepEqual(toggles, [], 'horizontal menu drag must not activate the dragged tool');
    } finally {
        harness.runtime.hideCompletely();
        harness.restore();
    }
});

test('BevyUI main menu accelerates tiny vertical wheel deltas over horizontal overflow', async () => {
    const harness = createRuntimeHarness();
    try {
        harness.surface.setProbeRect({ width: 240, height: 240 });
        await harness.runtime.showFully();
        const firstTree = harness.calls.at(-1).payload.tree;
        const itemSize = firstTree.layout.itemSize;
        const maxScrollLeft = firstTree.layout.maxScrollLeft;
        const atome = findNode(firstTree.root, BEVY_MAIN_MENU_ATOME_ID);

        const beforeWheelCalls = harness.calls.length;
        atome.on.wheel({ delta_y: 1, delta_mode: 0 });
        atome.on.wheel({ delta_y: 1, delta_mode: 0 });
        atome.on.wheel({ delta_y: 1, delta_mode: 0 });
        await waitFrame();
        assert.equal(harness.calls.length, beforeWheelCalls + 1, 'wheel render must be coalesced to one frame');
        assert.ok(harness.calls.at(-1).payload.tree.layout.scrollLeftPx < maxScrollLeft);

        await waitMs(120);
        const snappedTree = harness.calls.at(-1).payload.tree;
        assert.equal(snappedTree.layout.scrollLeftPx, maxScrollLeft - (itemSize * 2));
        assert.equal(snappedTree.layout.x, 240 - (itemSize * 9) + (itemSize * 2));
    } finally {
        harness.runtime.hideCompletely();
        harness.restore();
    }
});

test('BevyUI main menu keeps Atome at the handle edge for left handed layout', async () => {
    const harness = createRuntimeHarness({ handedness: 'left' });
    try {
        await harness.runtime.showFully();
        const tree = harness.calls[0].payload.tree;
        assert.deepEqual(idsFromHandleEdge(tree, 'left'), [
            BEVY_MAIN_MENU_ATOME_ID,
            ...TOOL_KEYS.map((key) => `eve_bevy_ui_main_menu_tool_${key}`),
            BEVY_MAIN_MENU_LEGACY_ID
        ]);
        assert.equal(barChildren(tree)[0].id, BEVY_MAIN_MENU_ATOME_ID);
        assert.equal(barChildren(tree).at(-1).id, BEVY_MAIN_MENU_LEGACY_ID);
        harness.surface.setProbeRect({ width: 240, height: 240 });
        harness.window.dispatchEvent(new harness.window.Event('resize'));
        await waitFrame();
        assert.equal(harness.calls.at(-1).payload.tree.layout.x, 0);
    } finally {
        harness.restore();
    }
});

test('BevyUI main menu Atome tool toggles the Dashboard', async () => {
    const toggles = [];
    const harness = createRuntimeHarness({
        toggleDashboard: (payload) => toggles.push(payload)
    });
    try {
        await harness.runtime.showFully();
        const tree = harness.calls[0].payload.tree;
        await findNode(tree.root, BEVY_MAIN_MENU_ATOME_ID).on.activate();
        assert.deepEqual(toggles, [{ source: 'bevy_ui_main_menu_atome' }]);
    } finally {
        harness.restore();
    }
});

test('BevyUI main menu Atome hold toggles the assistant and suppresses Dashboard activation', async () => {
    const toggles = [];
    const assistantToggles = [];
    const harness = createRuntimeHarness({
        toggleDashboard: (payload) => toggles.push(payload),
        toggleAssistant: (payload) => assistantToggles.push(payload)
    });
    try {
        await harness.runtime.showFully();
        let tree = harness.calls.at(-1).payload.tree;
        const atome = findNode(tree.root, BEVY_MAIN_MENU_ATOME_ID);
        atome.on.press({ x: 30, y: 30 });
        await waitMs(540);
        tree = harness.calls.at(-1).payload.tree;
        const currentAtome = findNode(tree.root, BEVY_MAIN_MENU_ATOME_ID);
        currentAtome.on.release({ x: 30, y: 30 });
        await currentAtome.on.activate();
        assert.deepEqual(assistantToggles, [{ source: 'bevy_ui_main_menu_atome' }]);
        assert.deepEqual(toggles, []);
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});

test('BevyUI main menu Atome movement cancels the assistant hold', async () => {
    const assistantToggles = [];
    const harness = createRuntimeHarness({
        toggleAssistant: (payload) => assistantToggles.push(payload)
    });
    try {
        await harness.runtime.showFully();
        const atome = findNode(harness.calls.at(-1).payload.tree.root, BEVY_MAIN_MENU_ATOME_ID);
        atome.on.press({ x: 30, y: 30 });
        atome.on.drag({ x: 41, y: 30 });
        await waitMs(540);
        assert.deepEqual(assistantToggles, []);
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});

test('BevyUI main menu reserves dashboard height before legacy DOM measurement', async () => {
    const harness = createRuntimeHarness();
    try {
        const legacy = harness.document.createElement('div');
        legacy.id = 'eve_intuitionx_main_ribbon';
        legacy.style.display = 'block';
        legacy.style.visibility = 'visible';
        legacy.style.opacity = '1';
        legacy.getBoundingClientRect = () => ({ top: 620, bottom: 720, width: 200, height: 100 });
        harness.document.body.appendChild(legacy);
        harness.window.new_menu_v2 = harness.runtime;
        await harness.runtime.showFully();
        assert.equal(readToolboxReservedHeight(harness.surface), resolveBevyMainMenuItemSize());
        harness.runtime.hideCompletely();
        assert.equal(readToolboxReservedHeight(harness.surface), 100);
    } finally {
        harness.restore();
    }
});

test('BevyUI main menu keeps the legacy DOM ribbon hidden while it is canonical', async () => {
    const legacyCalls = [];
    const harness = createRuntimeHarness();
    const runtime = createBevyUiMainMenuRuntime({
        content: menuContent(),
        legacyMenu: {
            hideCompletely: () => legacyCalls.push('hide'),
            showFully: () => legacyCalls.push('show')
        },
        surfaceResolver: () => harness.surface,
        runtimeResolver: () => harness.dom.window.eveBevyUiRuntime,
        handednessResolver: () => 'right'
    });
    try {
        await runtime.showFully();
        runtime.hideCompletely();
        assert.deepEqual(legacyCalls, ['hide', 'hide', 'hide', 'hide']);
        assert.equal(runtime.measure().legacyVisible, false);
    } finally {
        runtime.destroy();
        harness.restore();
    }
});

test('BevyUI main menu tool activation reuses the normalized ribbon definition tool id', async () => {
    const invoked = [];
    const harness = createRuntimeHarness({
        onInvoke: (definition, eventName) => invoked.push({ toolId: definition.toolId, eventName })
    });
    try {
        await harness.runtime.showFully();
        const tree = harness.calls[0].payload.tree;
        await findNode(tree.root, 'eve_bevy_ui_main_menu_tool_capture').on.activate();
        assert.deepEqual(invoked, [{ toolId: 'tool.main.capture', eventName: 'bevy_ui.activate' }]);
    } finally {
        harness.restore();
    }
});
