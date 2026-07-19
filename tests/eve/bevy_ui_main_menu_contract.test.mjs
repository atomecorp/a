import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    BEVY_MAIN_MENU_ATOME_ID,
    buildBevyMainMenuItems,
    buildBevyMainMenuTree,
    resolveBevyMainMenuItemSize
} from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import {
    applyBevyMainMenuPaletteMotion,
    bevyMainMenuPaletteMotionUpdates,
    createBevyMainMenuPaletteMotion,
    createBevyMainMenuPaletteMotionController,
    sampleBevyMainMenuPaletteMotion
} from '../../eVe/intuition/ribbon/bevy_ui_main_menu_palette_motion.js';
import { createBevyUiMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createBevyMainMenuHoldRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_hold_runtime.js';
import { resolveDashboardBlockUnitSize } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { readToolboxReservedHeight } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { MAIN_HANDLE_ICON } from '../../eVe/intuition/ribbon/tokens.js';

const TOOL_KEYS = Object.freeze(['home', 'find', 'capture', 'time', 'communicate', 'mode', 'view']);
const LIGHTGRAY_ICON_TINT = Object.freeze([211 / 255, 211 / 255, 211 / 255, 1]);
const STANDARD_ITEM_BACKGROUND = Object.freeze([0.17, 0.19, 0.22, 1]);
const STANDARD_LABEL_TINT = Object.freeze([0.94, 0.96, 0.98, 1]);

const collectJavaScriptSources = (directory) => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScriptSources(path);
        return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
    });

test('Capture screen icon is canonical before and after its lazy module loads', () => {
    const initialContentSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js'),
        'utf8'
    );
    const lazyCaptureSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/tools/capture.js'),
        'utf8'
    );
    assert.match(initialContentSource, /screen:\s*\{[^\n]*icon:\s*'screen_capturesvg'[^\n]*tool_id:\s*'ui\.capture\.screen'/);
    assert.match(lazyCaptureSource, /tool_id:\s*'ui\.capture\.screen'[^\n]*icon:\s*'screen_capturesvg'/);
    assert.doesNotMatch(initialContentSource, /tool_id:\s*'ui\.capture\.screen',\s*icon:\s*'screen'/);
});

test('BevyUI product runtimes never restore legacy browser menu or Flower state', () => {
    const forbidden = [
        /window\.new_menu/,
        /eveGoeyMenuApi/,
        /eveBevyFlowerRuntime/,
        /__EVE_FLOWER_POINTER_LOCK__/,
        /__EVE_FLOWER_CONTEXT_HOLD__/,
        /__EVE_FLOWER_CONTEXT_LONG_PRESS__/,
        /__EVE_FLOWER_TRACE__/,
        /__eveFlowerTrace/
    ];
    const violations = collectJavaScriptSources(resolve(process.cwd(), 'eVe'))
        .flatMap((path) => {
            const source = readFileSync(path, 'utf8');
            return forbidden
                .filter((pattern) => pattern.test(source))
                .map((pattern) => `${path}:${pattern.source}`);
        });
    assert.deepEqual(violations, []);
});

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

test('BevyUI Atome hold suppression expires when its release emits no activation', async () => {
    const scheduled = [];
    const hold = createBevyMainMenuHoldRuntime({
        onHold: () => { },
        schedule: (callback, delay) => {
            scheduled.push({ callback, delay });
            return scheduled.length;
        },
        cancelSchedule: () => { }
    });
    hold.press(BEVY_MAIN_MENU_ATOME_ID, { x: 4, y: 4 });
    scheduled[0].callback();
    hold.release(BEVY_MAIN_MENU_ATOME_ID);
    await Promise.resolve();
    assert.equal(hold.consumeActivation(BEVY_MAIN_MENU_ATOME_ID), true);

    hold.press(BEVY_MAIN_MENU_ATOME_ID, { x: 4, y: 4 });
    scheduled[2].callback();
    hold.release(BEVY_MAIN_MENU_ATOME_ID);
    assert.equal(scheduled[3].delay, 420);
    scheduled[3].callback();
    assert.equal(hold.consumeActivation(BEVY_MAIN_MENU_ATOME_ID), false);
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
    content = menuContent(),
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
        content,
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
        ...TOOL_KEYS.map((key) => `eve_bevy_ui_main_menu_tool_${key}`)
    ]);
    assert.equal(items[0].type, 'tool');
    assert.equal(items[0].key, 'atome');
    assert.equal(items[0].passive, undefined);
    assert.equal(items[0].icon, MAIN_HANDLE_ICON);
    assert.deepEqual(items.slice(1).map((item) => item.key), menuContent().toolbox.children);
    assert.deepEqual(items.slice(1).map((item) => item.label), TOOL_KEYS);
    assert.deepEqual(items.slice(1).map((item) => item.icon), TOOL_KEYS.map((key) => `./assets/images/icons/${key}.svg`));
    assert.equal(items.some((item) => item.key === 'legacy_menu'), false);
});

test('BevyUI main menu mounts only BevyUI nodes and preserves the internal runtime API', async () => {
    const harness = createRuntimeHarness();
    try {
        await harness.runtime.showFully();
        const tree = harness.calls[0].payload.tree;
        const expectedSize = Math.round(resolveDashboardBlockUnitSize() / 2);
        assert.equal(tree.layout.itemSize, expectedSize);
        assert.deepEqual(idsFromHandleEdge(tree, 'right'), [
            BEVY_MAIN_MENU_ATOME_ID,
            ...TOOL_KEYS.map((key) => `eve_bevy_ui_main_menu_tool_${key}`)
        ]);
        assert.equal(barChildren(tree).at(-1).id, BEVY_MAIN_MENU_ATOME_ID);
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
        assert.equal(new Set(iconTints.map((tint) => JSON.stringify(tint))).size, 1);
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
        assert.equal(nextTree.layout.x, 1200 - (itemSize * 8));
        assert.equal(nextTree.layout.y, 840 - itemSize);
        assert.equal(nextTree.root.style.size[0], 1200);
        assert.equal(nextTree.root.style.size[1], 840);
        harness.surface.setProbeRect({ width: 240, height: 240 });
        harness.window.dispatchEvent(new harness.window.Event('resize'));
        await waitFrame();
        const compactTree = harness.calls.at(-1).payload.tree;
        assert.equal(compactTree.layout.x, 240 - (itemSize * 8));
        assert.equal(compactTree.layout.y, 240 - itemSize);
        assert.equal(compactTree.layout.x + (itemSize * 7), 240 - itemSize);
        assert.equal(compactTree.layout.x + (itemSize * 6), 240 - (itemSize * 2));
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
        const naturalWidth = itemSize * 8;

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
        assert.equal(snappedTree.layout.x, 240 - (itemSize * 8) + (itemSize * 2));
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
            ...TOOL_KEYS.map((key) => `eve_bevy_ui_main_menu_tool_${key}`)
        ]);
        assert.equal(barChildren(tree)[0].id, BEVY_MAIN_MENU_ATOME_ID);
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

test('active assistant survives ten Dashboard toggles before a second hold closes it', async () => {
    let assistantActive = false;
    let dashboardToggles = 0;
    const harness = createRuntimeHarness({
        toggleDashboard: () => { dashboardToggles += 1; },
        toggleAssistant: () => { assistantActive = !assistantActive; }
    });
    const holdAtome = async () => {
        const atome = findNode(harness.calls.at(-1).payload.tree.root, BEVY_MAIN_MENU_ATOME_ID);
        atome.on.press({ x: 30, y: 30 });
        await waitMs(540);
        const current = findNode(harness.calls.at(-1).payload.tree.root, BEVY_MAIN_MENU_ATOME_ID);
        current.on.release({ x: 30, y: 30 });
        await current.on.activate();
    };
    try {
        await harness.runtime.showFully();
        await holdAtome();
        assert.equal(assistantActive, true);
        for (let index = 0; index < 10; index += 1) {
            const atome = findNode(harness.calls.at(-1).payload.tree.root, BEVY_MAIN_MENU_ATOME_ID);
            await atome.on.activate();
        }
        assert.equal(dashboardToggles, 10);
        assert.equal(assistantActive, true);
        await holdAtome();
        assert.equal(assistantActive, false);
        assert.equal(dashboardToggles, 10);
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

test('BevyUI main menu is the sole dashboard toolbox height authority', async () => {
    const harness = createRuntimeHarness();
    try {
        setMainMenuRuntime(harness.runtime);
        await harness.runtime.showFully();
        assert.equal(readToolboxReservedHeight(harness.surface), resolveBevyMainMenuItemSize());
        harness.runtime.hideCompletely();
        assert.equal(readToolboxReservedHeight(harness.surface), 0);
    } finally {
        setMainMenuRuntime(null);
        harness.restore();
    }
});

test('BevyUI main menu has no legacy menu bridge or legacy projection item', async () => {
    const harness = createRuntimeHarness();
    const runtime = createBevyUiMainMenuRuntime({
        content: menuContent(),
        surfaceResolver: () => harness.surface,
        runtimeResolver: () => harness.dom.window.eveBevyUiRuntime,
        handednessResolver: () => 'right'
    });
    try {
        await runtime.showFully();
        assert.equal(runtime.measure().activePaletteKey, '');
        assert.equal(buildBevyMainMenuItems(menuContent()).some((item) => item.key === 'legacy_menu'), false);
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

test('BevyUI main menu removes closed palette children so reopening starts from the canonical parent edge', async () => {
    const content = {
        toolbox: { children: ['capture'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import']
        },
        import: {
            atome_tool: true,
            label: 'import',
            icon: 'import',
            tool_id: 'ui.capture.import',
            action: 'momentary'
        }
    };
    const inactive = buildBevyMainMenuItems(content);
    const active = buildBevyMainMenuItems(content, { activePaletteKey: 'capture' });
    assert.equal(inactive.some((item) => item.key === 'import'), false);
    assert.deepEqual(active.map((item) => item.key), ['atome', 'capture', 'import']);
    assert.equal(active.at(-1).parentKey, 'capture');

    const invoked = [];
    const harness = createRuntimeHarness({
        content,
        onInvoke: (definition, eventName) => invoked.push({ toolId: definition.toolId, eventName })
    });
    try {
        await harness.runtime.showFully();
        const closedTree = harness.calls.at(-1).payload.tree;
        assert.equal(findNode(closedTree.root, 'eve_bevy_ui_main_menu_tool_capture__import'), null);
        const capture = findNode(closedTree.root, 'eve_bevy_ui_main_menu_tool_capture');
        await capture.on.activate();
        assert.deepEqual(invoked, []);
        assert.equal(harness.runtime.measure().activePaletteKey, 'capture');
        const expandedTree = harness.calls.at(-1).payload.tree;
        const importNode = findNode(expandedTree.root, 'eve_bevy_ui_main_menu_tool_capture__import');
        assert.ok(importNode);
        assert.ok(importNode.style.opacity > 0, 'the first moving frame presents the tool without a delayed icon');
        assert.equal(typeof importNode.on.activate, 'function');
        await importNode.on.activate();
        assert.deepEqual(invoked, [{ toolId: 'ui.capture.import', eventName: 'bevy_ui.activate' }]);
        harness.runtime.dismissPalettes();
        await Promise.resolve();
        await Promise.resolve();
        const closedAgain = harness.calls.at(-1).payload.tree;
        assert.equal(findNode(closedAgain.root, 'eve_bevy_ui_main_menu_tool_capture__import'), null);
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});

test('BevyUI palette first moving frame contains the complete tool and overshoots every target by 6 to 14 px', () => {
    const content = {
        toolbox: { children: ['capture', 'time'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import']
        },
        import: { atome_tool: true, label: 'import', icon: 'import', tool_id: 'ui.capture.import' },
        time: { atome_tool: true, label: 'time', icon: 'time', tool_id: 'tool.main.time' }
    };
    const surface = {
        getBoundingClientRect: () => ({ width: 960, height: 720 })
    };
    const treeState = (activePaletteKey = '') => ({
        activePaletteKey,
        externalOpenByToolId: new Map(),
        hoveredId: '',
        latchedByToolId: new Map(),
        pressedId: ''
    });
    const closedTree = buildBevyMainMenuTree({ content, surface, handedness: 'right', itemSize: 60, state: treeState() });
    const openTree = buildBevyMainMenuTree({ content, surface, handedness: 'right', itemSize: 60, state: treeState('capture') });
    const motion = createBevyMainMenuPaletteMotion({ closedTree, openTree, paletteKey: 'capture' });
    const childId = 'eve_bevy_ui_main_menu_tool_capture__import';
    const initial = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 0 });
    const firstMoving = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 16 });
    const arrival = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 180 });
    const recoil = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 250 });
    const final = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 370 });
    const initialTree = applyBevyMainMenuPaletteMotion(openTree, initial, motion);
    const initialChild = findNode(initialTree.root, childId);
    const paletteParent = findNode(initialTree.root, 'eve_bevy_ui_main_menu_tool_capture');
    const initialFrame = initial.frames.get(childId);
    const movingUpdates = bevyMainMenuPaletteMotionUpdates(firstMoving, motion);

    assert.deepEqual(initialChild.style.position, initialFrame.position);
    assert.equal(findNode(initialChild, `${childId}_icon`).style.position, undefined);
    assert.equal(findNode(initialChild, `${childId}_label`).style.position, undefined);
    assert.ok(paletteParent.style.z_index > initialChild.style.z_index, 'the child must emerge from behind its palette parent');
    assert.equal(findNode(initialChild, `${childId}_icon`).style.z_index, initialChild.style.z_index + 1);
    assert.equal(findNode(initialChild, `${childId}_label`).style.z_index, initialChild.style.z_index + 1);
    assert.equal(initialChild.style.opacity, 1);
    assert.equal(Object.hasOwn(movingUpdates.find((update) => update.nodeId === childId), 'opacity'), false);
    assert.equal(Object.hasOwn(movingUpdates.find((update) => update.nodeId === `${childId}_icon`), 'opacity'), false);
    assert.equal(Object.hasOwn(movingUpdates.find((update) => update.nodeId === `${childId}_label`), 'opacity'), false);
    assert.notDeepEqual(firstMoving.frames.get(childId).position, initialFrame.position);
    assert.equal(arrival.extent, 1);
    assert.ok(recoil.extent > 1);
    motion.targets.forEach((target) => {
        const arrived = arrival.frames.get(target.id).position;
        const overshot = recoil.frames.get(target.id).position;
        const overshootPx = Math.hypot(overshot[0] - arrived[0], overshot[1] - arrived[1]);
        const travel = [
            target.finalPosition[0] - target.fromPosition[0],
            target.finalPosition[1] - target.fromPosition[1]
        ];
        const overshoot = [overshot[0] - arrived[0], overshot[1] - arrived[1]];
        assert.ok((travel[0] * overshoot[0]) + (travel[1] * overshoot[1]) > 0, `${target.id} must overshoot outward`);
        assert.ok(overshootPx >= 6 && overshootPx <= 14, `${target.id} overshoot must stay within the visual token`);
    });
    assert.equal(final.extent, 1);
    assert.equal(final.done, true);
    assert.equal(motion.durationMs, 370);
});

test('BevyUI palette samples exact outward overshoot and settlement in both handedness modes', () => {
    const content = {
        toolbox: { children: ['capture', 'time'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import', 'photo']
        },
        import: { atome_tool: true, label: 'import', icon: 'import', tool_id: 'ui.capture.import' },
        photo: { atome_tool: true, label: 'photo', icon: 'photo', tool_id: 'ui.capture.photo' },
        time: { atome_tool: true, label: 'time', icon: 'time', tool_id: 'tool.main.time' }
    };
    const surface = { getBoundingClientRect: () => ({ width: 960, height: 720 }) };
    const stateFor = (activePaletteKey = '') => ({
        activePaletteKey,
        externalOpenByToolId: new Map(),
        hoveredId: '',
        latchedByToolId: new Map(),
        pressedId: ''
    });
    for (const handedness of ['left', 'right']) {
        const closedTree = buildBevyMainMenuTree({ content, surface, handedness, itemSize: 60, state: stateFor() });
        const openTree = buildBevyMainMenuTree({ content, surface, handedness, itemSize: 60, state: stateFor('capture') });
        const motion = createBevyMainMenuPaletteMotion({ closedTree, openTree, paletteKey: 'capture' });
        const initial = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 0 });
        const arrival = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 180 });
        const overshoot = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 250 });
        const final = sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 370 });
        motion.targets.forEach((target) => {
            assert.deepEqual(initial.frames.get(target.id).position, target.fromPosition);
            assert.deepEqual(arrival.frames.get(target.id).position, target.finalPosition);
            const arrived = arrival.frames.get(target.id).position;
            const exceeded = overshoot.frames.get(target.id).position;
            const distance = Math.hypot(exceeded[0] - arrived[0], exceeded[1] - arrived[1]);
            const travel = [target.finalPosition[0] - target.fromPosition[0], target.finalPosition[1] - target.fromPosition[1]];
            const extra = [exceeded[0] - arrived[0], exceeded[1] - arrived[1]];
            assert.ok((travel[0] * extra[0]) + (travel[1] * extra[1]) > 0, `${handedness}:${target.id}`);
            assert.ok(distance >= 6 && distance <= 14, `${handedness}:${target.id}`);
            assert.deepEqual(final.frames.get(target.id).position, target.finalPosition);
        });
    }
});

test('BevyUI palette projects complete content before motion and coalesces GPU backpressure to the latest frame', async () => {
    const content = {
        toolbox: { children: ['capture', 'time'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import']
        },
        import: { atome_tool: true, label: 'import', icon: 'import', tool_id: 'ui.capture.import' },
        time: { atome_tool: true, label: 'time', icon: 'time', tool_id: 'tool.main.time' }
    };
    const surface = { getBoundingClientRect: () => ({ width: 960, height: 720 }) };
    const state = {
        active: true,
        activePaletteKey: '',
        externalOpenByToolId: new Map(),
        hoveredId: '',
        latchedByToolId: new Map(),
        pressedId: ''
    };
    const scheduledFrames = [];
    const pendingMotions = [];
    const submitted = [];
    const requestFrame = (callback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
    };
    let controller;
    let structuralTree = null;
    controller = createBevyMainMenuPaletteMotionController({
        state,
        buildTree: () => buildBevyMainMenuTree({ content, surface, handedness: 'right', itemSize: 60, state }),
        render: async () => {
            structuralTree = controller.decorateTree(buildBevyMainMenuTree({
                content, surface, handedness: 'right', itemSize: 60, state
            }));
            return true;
        },
        runtimeResolver: () => ({
            updateTreeMotion: ({ updates }) => new Promise((resolveMotion) => {
                submitted.push(updates);
                pendingMotions.push(resolveMotion);
            })
        }),
        requestFrame,
        cancelFrame: () => {},
        reducedMotionResolver: () => false
    });
    const flush = async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    };
    const runFrame = async (timestamp) => {
        const callback = scheduledFrames.shift();
        assert.equal(typeof callback, 'function');
        callback(timestamp);
        await flush();
    };
    const childId = 'eve_bevy_ui_main_menu_tool_capture__import';
    const childPosition = (updates) => updates.find((update) => update.nodeId === childId)?.position;

    controller.open('capture');
    await flush();
    await runFrame(1000);
    const closedTree = buildBevyMainMenuTree({ content, surface, handedness: 'right', itemSize: 60, state: { ...state, activePaletteKey: '' } });
    const openTree = buildBevyMainMenuTree({ content, surface, handedness: 'right', itemSize: 60, state: { ...state, activePaletteKey: 'capture' } });
    const motion = createBevyMainMenuPaletteMotion({ closedTree, openTree, paletteKey: 'capture' });
    assert.deepEqual(
        findNode(structuralTree.root, childId).style.position,
        sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 0 }).frames.get(childId).position,
        'the structural hot path must create the complete palette before its first movement'
    );
    assert.ok(findNode(structuralTree.root, `${childId}_icon`));
    assert.ok(findNode(structuralTree.root, `${childId}_label`));
    assert.equal(findNode(structuralTree.root, childId).style.opacity, 1);
    assert.equal(submitted.length, 1, 'the first requestAnimationFrame must already submit movement');
    assert.ok(childPosition(submitted[0])[0] !== motion.targets.find((target) => target.id === childId).fromPosition[0]);
    await runFrame(1016);
    await runFrame(1050);
    await runFrame(1100);
    await runFrame(1390);
    assert.equal(submitted.length, 1, 'the first slow GPU submission remains in flight');
    assert.equal(scheduledFrames.length, 1, 'the animation clock must continue while a GPU submission is in flight');

    pendingMotions.shift()();
    await flush();
    await runFrame(1400);
    assert.equal(submitted.length, 2, 'all obsolete intermediate samples must collapse into one final submission');
    assert.deepEqual(
        childPosition(submitted[1]),
        childPosition(bevyMainMenuPaletteMotionUpdates(sampleBevyMainMenuPaletteMotion({ motion, elapsedMs: 370 }), motion)),
        'the next available GPU presentation must catch up directly to wall-clock final geometry'
    );
    pendingMotions.shift()();
    await flush();
    assert.equal(controller.active, false);
    controller.cancel();
});

test('BevyUI palette ignores late GPU completion after replacement and close', async () => {
    const content = {
        toolbox: { children: ['capture', 'time'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import']
        },
        import: { atome_tool: true, label: 'import', icon: 'import', tool_id: 'ui.capture.import' },
        time: {
            atome_tool: true,
            label: 'time',
            icon: 'time',
            tool_id: 'tool.main.time',
            type: 'palette',
            children: ['timer']
        },
        timer: { atome_tool: true, label: 'timer', icon: 'timer', tool_id: 'ui.time.timer' }
    };
    const surface = { getBoundingClientRect: () => ({ width: 960, height: 720 }) };
    const state = {
        active: true,
        activePaletteKey: '',
        externalOpenByToolId: new Map(),
        hoveredId: '',
        latchedByToolId: new Map(),
        pressedId: ''
    };
    const scheduled = new Map();
    const submissions = [];
    const renders = [];
    let nextFrameId = 1;
    let controller;
    const buildTree = () => buildBevyMainMenuTree({ content, surface, handedness: 'right', itemSize: 60, state });
    controller = createBevyMainMenuPaletteMotionController({
        state,
        buildTree,
        render: async () => { renders.push(controller.decorateTree(buildTree())); },
        runtimeResolver: () => ({
            updateTreeMotion: ({ updates }) => new Promise((resolveMotion) => {
                submissions.push({ paletteKey: state.activePaletteKey, resolveMotion, updates });
            })
        }),
        requestFrame: (callback) => {
            const id = nextFrameId++;
            scheduled.set(id, callback);
            return id;
        },
        cancelFrame: (id) => { scheduled.delete(id); },
        reducedMotionResolver: () => false
    });
    const flush = async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    };
    const runNextFrame = async (timestamp) => {
        const next = scheduled.entries().next().value;
        assert.ok(next, 'one current animation frame must exist');
        scheduled.delete(next[0]);
        next[1](timestamp);
        await flush();
    };

    controller.open('capture');
    await flush();
    await runNextFrame(1000);
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].paletteKey, 'capture');
    assert.ok(submissions[0].updates.some((update) => update.nodeId.includes('capture__import')));

    controller.open('time');
    await flush();
    assert.equal(state.activePaletteKey, 'time');
    await runNextFrame(1100);
    assert.equal(submissions.length, 2);
    assert.equal(submissions[1].paletteKey, 'time');
    assert.ok(submissions[1].updates.some((update) => update.nodeId.includes('time__timer')));

    const scheduledForTime = [...scheduled.keys()];
    submissions[0].resolveMotion();
    await flush();
    assert.deepEqual([...scheduled.keys()], scheduledForTime, 'late Capture completion must not schedule or replace Time motion');
    assert.equal(state.activePaletteKey, 'time');

    controller.close();
    await flush();
    submissions[1].resolveMotion();
    await flush();
    assert.equal(controller.active, false);
    assert.equal(state.activePaletteKey, '');
    assert.equal(scheduled.size, 0, 'late Time completion must not resurrect a requestAnimationFrame');
    assert.equal(submissions.length, 2, 'no late GPU completion may submit orphan palette motion');
    assert.equal(renders.at(-1).motionLayout.items.some((item) => item.parentKey), false);
});

test('BevyUI main menu gives palette opening priority over queued cosmetic click renders', async () => {
    const content = {
        toolbox: { children: ['capture'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import']
        },
        import: { atome_tool: true, label: 'import', icon: 'import', tool_id: 'ui.capture.import' }
    };
    const harness = createRuntimeHarness({ content });
    try {
        await harness.runtime.showFully();
        const capture = findNode(harness.calls.at(-1).payload.tree.root, 'eve_bevy_ui_main_menu_tool_capture');
        capture.on.hover();
        capture.on.press({ x: 20, y: 20 });
        capture.on.release({ x: 20, y: 20 });
        await capture.on.activate();
        await Promise.resolve();
        await Promise.resolve();

        assert.equal(harness.calls.length, 2, 'the click must produce one structural update, not a cosmetic render queue');
        assert.equal(harness.runtime.measure().activePaletteKey, 'capture');
        assert.ok(findNode(harness.calls.at(-1).payload.tree.root, 'eve_bevy_ui_main_menu_tool_capture__import'));
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});

test('BevyUI main menu prewarms closed palette images without projecting palette children', async () => {
    const content = {
        toolbox: { children: ['capture', 'time'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import']
        },
        import: { atome_tool: true, label: 'import', icon: 'import', tool_id: 'ui.capture.import' },
        time: {
            atome_tool: true,
            label: 'time',
            icon: 'time',
            tool_id: 'tool.main.time',
            type: 'palette',
            children: ['clock']
        },
        clock: { atome_tool: true, label: 'clock', icon: 'time', tool_id: 'ui.clock.set' }
    };
    const harness = createRuntimeHarness({ content });
    const prewarmed = [];
    harness.window.eveBevyUiRuntime.prewarmTreeImages = async ({ tree }) => {
        prewarmed.push([...new Set(tree.motionLayout.items.map((item) => item.parentKey).filter(Boolean))]);
        return tree;
    };
    try {
        await harness.runtime.showFully();
        await waitMs(20);
        assert.deepEqual(prewarmed, [['capture'], ['time']]);
        assert.equal(harness.calls.filter((call) => call.type === 'mount').length, 1);
        assert.equal(harness.calls.filter((call) => call.type === 'update').length, 0);
        assert.equal(findNode(harness.calls[0].payload.tree.root, 'eve_bevy_ui_main_menu_tool_capture__import'), null);
        assert.equal(findNode(harness.calls[0].payload.tree.root, 'eve_bevy_ui_main_menu_tool_time__clock'), null);

        harness.runtime.updateContent({ capture: { label: 'Capture updated' } });
        harness.runtime.hideCompletely();
        await waitMs(20);
        assert.deepEqual(prewarmed, [['capture'], ['time']], 'hidden menu must cancel replacement hydration work');
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});

test('BevyUI main menu hold opens a palette and suppresses the matching activation', async () => {
    const content = {
        toolbox: { children: ['capture'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import'],
            childrenOnLongPress: true,
            longPressDelay: 120
        },
        import: { atome_tool: true, label: 'import', icon: 'import', tool_id: 'ui.capture.import' }
    };
    const invoked = [];
    const harness = createRuntimeHarness({
        content,
        onInvoke: (definition) => invoked.push(definition.toolId)
    });
    try {
        await harness.runtime.showFully();
        const capture = findNode(harness.calls.at(-1).payload.tree.root, 'eve_bevy_ui_main_menu_tool_capture');
        capture.on.press({ x: 20, y: 20 });
        await waitMs(130);
        const currentCapture = findNode(harness.calls.at(-1).payload.tree.root, 'eve_bevy_ui_main_menu_tool_capture');
        currentCapture.on.release({ x: 20, y: 20 });
        await currentCapture.on.activate();
        assert.equal(harness.runtime.measure().activePaletteKey, 'capture');
        assert.deepEqual(invoked, []);
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});
