import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'vitest';
import { BEVY_MAIN_MENU_ATOME_ID, buildBevyMainMenuItems, resolveBevyMainMenuItemSize } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createBevyUiMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createBevyMainMenuHoldRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_hold_runtime.js';
import { createContextToolInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/context_tool_invocation_runtime.js';
import { resolveDashboardBlockUnitSize } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { readToolboxReservedHeight } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { MAIN_HANDLE_ICON } from '../../eVe/intuition/ribbon/tokens.js';
import { BEVY_MENU_TOKENS } from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';
import { EVE_BUTTON_SKIN_TOKENS } from '../../eVe/elements/skin/button_skin.js';
import { EVE_COMMON_SKIN_TOKENS } from '../../eVe/elements/skin/tokens.js';
import { TOOL_KEYS, menuContent, installDom, findNode, waitFrame, waitMs, createRuntimeHarness } from './bevy_ui_main_menu_test_helpers.mjs';

const collectJavaScriptSources = (directory) => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScriptSources(path);
        return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
    });

test('system menu content consumes the global content color contract', () => {
    assert.equal(BEVY_MENU_TOKENS.surface.text, EVE_COMMON_SKIN_TOKENS.systemContent.gpu);
    assert.equal(BEVY_MENU_TOKENS.surface.icon, EVE_COMMON_SKIN_TOKENS.systemContent.gpu);
    assert.equal(BEVY_MENU_TOKENS.surface.grip, EVE_COMMON_SKIN_TOKENS.systemContent.gpu);
});

test('standard menu tools inherit the canonical button surface while Flower overrides only its circular geometry', () => {
    const button = EVE_BUTTON_SKIN_TOKENS.bevyButton;
    assert.equal(BEVY_MENU_TOKENS.surface.material, button.surface);
    assert.equal(BEVY_MENU_TOKENS.shape.standardRadiusPx, button.radiusPx);
    assert.equal(BEVY_MENU_TOKENS.shape.paletteRadiusPx, button.radiusPx);
    assert.equal(BEVY_MENU_TOKENS.chrome.outlineRadiusPx, button.radiusPx);
    assert.notEqual(BEVY_MENU_TOKENS.shape.flowerRadiusPx, button.radiusPx);
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

test('BevyUI recording tools route the second activation as an off transition without a DOM latch', async () => {
    const content = {
        toolbox: { children: ['capture'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            action: 'toggle',
            children: ['video']
        },
        video: {
            atome_tool: true,
            label: 'video',
            icon: 'video_camera',
            tool_id: 'ui.capture.video',
            action: 'toggle'
        }
    };
    const previousStates = [];
    const harness = createRuntimeHarness({
        content,
        onInvoke: async (_definition, _eventName, payload) => {
            previousStates.push(payload.previousLatched);
            return { ok: true, nextLatched: payload.previousLatched !== true };
        }
    });
    try {
        const initialTree = await harness.runtime.showFully();
        const capture = findNode(initialTree.root, 'eve_bevy_ui_main_menu_tool_capture');
        assert.ok(capture);
        await capture.on.activate();
        await waitFrame();
        const video = harness.calls
            .map((call) => call.payload?.tree)
            .filter(Boolean)
            .map((tree) => findNode(tree.root, 'eve_bevy_ui_main_menu_tool_capture__video'))
            .find(Boolean);
        assert.ok(video);
        await video.on.activate();
        await video.on.activate();
        assert.deepEqual(previousStates, [false, true]);
        assert.equal(harness.runtime.getToolLatchedState({ toolId: 'ui.capture.video' }), false);
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});

test('BevyUI invocation forwards its latch state as routing metadata, never tool input', async () => {
    const env = installDom();
    const invocations = [];
    const runtime = createContextToolInvocationRuntime({
        getFinderToolEl: () => null,
        handleFinderTouch: () => null,
        invokeToolFromUiButton: async (input) => {
            invocations.push(input);
            return { ok: true, nextLatched: false };
        }
    });
    try {
        const result = await runtime.invokeIntuitionXMainRibbonToolDefinition({
            key: 'video',
            toolId: 'ui.capture.video',
            latch: true,
            actionMode: 'toggle'
        }, 'bevy_ui.activate', {
            source: 'bevy_ui_main_menu',
            itemId: 'eve_bevy_ui_main_menu_tool_capture__video',
            previousLatched: true
        });
        assert.equal(result.nextLatched, false);
        assert.equal(invocations.length, 1);
        assert.equal(invocations[0].sourceLayer, 'bevy_ui_main_menu');
        assert.equal(invocations[0].previousLatched, true);
        assert.equal(Object.hasOwn(invocations[0].extraInput, 'previousLatched'), false);
    } finally {
        env.restore();
    }
});

test('retired Panel Lab shortcuts are absent from product menu content', () => {
    const source = readFileSync(resolve(process.cwd(), 'eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js'), 'utf8');
    assert.doesNotMatch(source, /panel_lab:/);
});
