import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
import { resolveLiquidSystemSurfaceUniforms } from '../../eVe/intuition/liquid/intuition_liquid_menu_renderer.js';
import { normalizeNavigationTaxonomy } from '../../eVe/intuition/menu/navigation_taxonomy.js';
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

test('standard menu tools inherit the canonical button surface while Mystic overrides only its circular geometry', () => {
    const button = EVE_BUTTON_SKIN_TOKENS.bevyButton;
    assert.equal(BEVY_MENU_TOKENS.surface.material, button.surface);
    assert.equal(BEVY_MENU_TOKENS.shape.standardRadiusPx, button.radiusPx);
    assert.equal(BEVY_MENU_TOKENS.shape.paletteRadiusPx, button.radiusPx);
    assert.equal(BEVY_MENU_TOKENS.chrome.outlineRadiusPx, button.radiusPx);
    assert.notEqual(BEVY_MENU_TOKENS.shape.mysticRadiusPx, button.radiusPx);
});

test('liquid Mystic and main-menu projections derive their backdrop and shadow from the system surface', () => {
    const material = EVE_COMMON_SKIN_TOKENS.bevy.systemSurface;
    const uniforms = resolveLiquidSystemSurfaceUniforms({ surface_parameters: [] }, [{ diameter: 60 }]);
    assert.equal(uniforms.background_blur_px, material.backdrop.blurPx);
    assert.deepEqual(uniforms.assistant_background_tint, material.backdrop.tint);
    assert.deepEqual(uniforms.surface_parameters[20], material.shadow.color);
});

test('system glass keeps white content readable over the brightest backdrop', () => {
    const alpha = EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.backdrop.tint[3];
    const linearChannel = 1 - alpha;
    const brightestBackdropChannel = 255 * (linearChannel <= 0.0031308
        ? linearChannel * 12.92
        : 1.055 * (linearChannel ** (1 / 2.4)) - 0.055);
    assert.ok(alpha < 1, 'system glass must retain the live backdrop');
    assert.ok(brightestBackdropChannel <= 120, 'a white backdrop must not wash the system surface to white');
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

test('Copy, Cut, Paste and Matrix use canonical full-size icon assets', () => {
    const contentSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js'),
        'utf8'
    );
    assert.match(contentSource, /view_table:\s*\{[^\n]*icon:\s*'matrix'/);
    const minimumVisualScale = { copy: 0.125, cut: 0.125, paste: 0.125, matrix: 1.28 };
    for (const key of ['copy', 'cut', 'paste', 'matrix']) {
        const source = readFileSync(resolve(process.cwd(), `atome/src/assets/images/icons/${key}.svg`), 'utf8');
        assert.match(source, /<svg[^>]*width="128"[^>]*height="128"[^>]*viewBox="0 0 128 128"/);
        assert.doesNotMatch(source, /(?:width|height):\s*1em/);
        const scale = Number(source.match(/<g\s+transform="scale\(([^)]+)\)"/)?.[1]);
        assert.ok(scale >= minimumVisualScale[key], `${key}.svg must occupy its canonical visual footprint`);
    }
});

test('the main Paste tool is a direct action while its history panel remains separately registered', () => {
    const bootstrapSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/tools/core/tool_runtime_bootstrap.js'),
        'utf8'
    );
    const runtimeSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/tools/core/tool_runtime.js'),
        'utf8'
    );
    const menuSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js'),
        'utf8'
    );
    const editMenuSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/runtime/eve_intuition/main_menu_edit_content.js'),
        'utf8'
    );
    const shortcutSource = readFileSync(resolve(process.cwd(), 'eVe/default/shortcuts.js'), 'utf8');
    assert.match(bootstrapSource, /'ui\.paste\.panel':\s*\(payload = \{\}\) => executeBootstrapPanelHandler/);
    assert.match(bootstrapSource, /'tool\.main\.paste':\s*\(payload = \{\}\) => executeBootstrapActionProxyHandler\(payload, \{ kind: 'clipboard', operation: 'paste', proxy_tool_id: 'ui\.paste\.action' \}\)/);
    assert.doesNotMatch(runtimeSource, /'tool\.main\.paste':\s*\{ kind: 'panel'/);
    assert.match(editMenuSource, /copy:\s*\{[\s\S]*?extra_input:\s*\{ context_type:\s*'project' \}[\s\S]*?touch:/);
    assert.match(menuSource, /paste:\s*\{[\s\S]*?extra_input:\s*\{ context_type:\s*'project' \}[\s\S]*?touch:[\s\S]*?longPressActive:\s*openPastePanel/);
    assert.match(shortcutSource, /`\$\{modifier\}\+v`[^\n]*triggerClipboardTool\('ui\.paste\.action'/);
});

test('Molecule clipboard preserves structural roots and Mystic opening placement', () => {
    const copySource = readFileSync(resolve(process.cwd(), 'eVe/intuition/tools/copy.js'), 'utf8');
    const stateSource = readFileSync(resolve(process.cwd(), 'eVe/intuition/tools/clipboard/state.js'), 'utf8');
    const pasteSource = readFileSync(resolve(process.cwd(), 'eVe/intuition/tools/paste.js'), 'utf8');
    const mysticItemsSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/runtime/eve_intuition/mystic_context_items_runtime.js'),
        'utf8'
    );
    const mysticTargetSource = readFileSync(resolve(process.cwd(), 'eVe/intuition/mystic/context_target.js'), 'utf8');

    assert.match(copySource, /readCanonicalProjectStates[\s\S]*resolveStateParentId/);
    assert.match(copySource, /root_ids:\s*resolveCopiedRootIds\(ids, records\)/);
    assert.match(stateSource, /root_ids:\s*rootIds/);
    assert.match(stateSource, /copies:[\s\S]*root_ids:\s*group\.root_ids/);
    assert.match(pasteSource, /source_to_duplicate[\s\S]*resolveClipboardRootIds[\s\S]*applySelectionBatch/);
    assert.match(mysticItemsSource, /computedExtraInput\.drop_position\s*=\s*\{ x:\s*Number\(point\.x\), y:\s*Number\(point\.y\) \}/);
    // Le contrat est l'appel compose (scene + atome leve), pas sa mise en page :
    // l'argument peut passer a la ligne sans que le contrat change.
    assert.match(mysticTargetSource, /resolveComposedInteractionTarget\(\s*sceneState\?\.scene,\s*hit\?\.atom/);
    assert.match(mysticTargetSource, /projectPoint/);
});

test('Molecule Ungroup resolves an existing canonical icon before Mystic texture loading', () => {
    const editMenuSource = readFileSync(
        resolve(process.cwd(), 'eVe/intuition/runtime/eve_intuition/main_menu_edit_content.js'),
        'utf8'
    );
    assert.match(editMenuSource, /ungroup:\s*\{[\s\S]*?icon:\s*'group'/);
    assert.ok(existsSync(resolve(process.cwd(), 'atome/src/assets/images/icons/group.svg')));
    assert.equal(existsSync(resolve(process.cwd(), 'atome/src/assets/images/icons/ungroup.svg')), false);
});

test('BevyUI product runtimes never restore legacy browser menu or Mystic state', () => {
    const forbidden = [
        /window\.new_menu/,
        /eveGoeyMenuApi/,
        /eveBevyMysticRuntime/,
        /__EVE_MYSTIC_POINTER_LOCK__/,
        /__EVE_MYSTIC_CONTEXT_HOLD__/,
        /__EVE_MYSTIC_CONTEXT_LONG_PRESS__/,
        /__EVE_MYSTIC_TRACE__/,
        /__eveMysticTrace/
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
    assert.deepEqual(items.slice(1).map((item) => item.icon), TOOL_KEYS.map((key) => `./assets/images/icons/${key}.svg`));
    assert.equal(items.some((item) => item.key === 'legacy_menu'), false);
});

test('modern taxonomy keeps Legacy untouched and hides the edit menu outside an editable project', () => {
    assert.equal(normalizeNavigationTaxonomy(), 'legacy');
    const legacy = buildBevyMainMenuItems(menuContent());
    assert.deepEqual(buildBevyMainMenuItems(menuContent(), { navigationTaxonomy: 'legacy' }), legacy);
    assert.deepEqual(buildBevyMainMenuItems(menuContent(), {
        navigationTaxonomy: 'modern', taxonomyContext: 'dashboard'
    }), []);
    const modern = buildBevyMainMenuItems(menuContent(), {
        navigationTaxonomy: 'modern', taxonomyContext: 'edit'
    });
    assert.equal(modern.some((item) => item.key === 'taxonomy_project'), true);
    assert.equal(modern.some((item) => item.key === 'view'), true);
    assert.equal(modern.some((item) => item.key === 'home'), false);

});

test('BevyUI main menu Atome tool toggles the assistant', async () => {
    const toggles = [];
    const harness = createRuntimeHarness({
        invokeAssistant: (action, payload) => toggles.push({ action, ...payload })
    });
    try {
        await harness.runtime.showFully();
        const tree = harness.calls[0].payload.tree;
        await findNode(tree.root, BEVY_MAIN_MENU_ATOME_ID).on.activate();
        assert.deepEqual(toggles, [{ action: 'toggle', source: 'bevy_ui_main_menu_atome' }]);
    } finally {
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

test('BevyUI Communicate tool reuses the shared external-width projection for unread content', async () => {
    const harness = createRuntimeHarness();
    try {
        await harness.runtime.showFully();
        assert.equal(harness.runtime.setToolInlineNotification({
            tool_id: 'tool.main.communicate', summary: 'Hello', count: 2
        }), true);
        assert.equal(harness.runtime.setToolExternalOpen({
            tool_id: 'tool.main.communicate', widthPx: 240
        }), true);
        await waitFrame();
        const tree = harness.calls.at(-1).payload.tree;
        assert.equal(findNode(tree.root, 'eve_bevy_ui_main_menu_communication_unread_summary')?.text, 'Hello');
        assert.equal(findNode(tree.root, 'eve_bevy_ui_main_menu_communication_unread_count')?.text, '2');
        harness.runtime.setToolInlineNotification({ tool_id: 'tool.main.communicate', count: 0 });
        harness.runtime.setToolExternalOpen({ tool_id: 'tool.main.communicate', widthPx: 0 });
        await waitFrame();
        assert.equal(findNode(harness.calls.at(-1).payload.tree.root,
            'eve_bevy_ui_main_menu_communication_unread_summary'), null);
    } finally {
        harness.runtime.destroy();
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

test('a leaf palette choice closes the palette, a cursor keeps it open and a nested palette opens its level', async () => {
    const invocations = [];
    const harness = createRuntimeHarness({ content: choicePaletteContent(),
        onInvoke: (entry) => { invocations.push(entry?.key); return { ok: true }; } });
    const latest = () => harness.calls.at(-1).payload.tree;
    const node = (id) => findNode(latest().root, id);
    try {
        await harness.runtime.showFully();
        await node('eve_bevy_ui_main_menu_tool_view').on.activate({});
        await waitMs(350);
        assert.equal(harness.runtime.measure().activePaletteKey, 'view');
        // R1 — un clic direct sur un enfant referme la palette.
        await node('eve_bevy_ui_main_menu_tool_view__view_list').on.activate({});
        assert.deepEqual(invocations, ['view_list']);
        assert.equal(harness.runtime.measure().activePaletteKey, '');
        // R1 — l'appui-glisse choisit le meme enfant et referme pareil.
        await node('eve_bevy_ui_main_menu_tool_view').on.activate({});
        await waitMs(350);
        await node('eve_bevy_ui_main_menu_tool_view__view_table').on.palette_choose({});
        assert.deepEqual(invocations, ['view_list', 'view_table']);
        assert.equal(harness.runtime.measure().activePaletteKey, '');
        // R1 — une palette imbriquee n'est pas un choix : elle ouvre son niveau.
        await node('eve_bevy_ui_main_menu_tool_create').on.activate({});
        await waitMs(350);
        await node('eve_bevy_ui_main_menu_tool_create__create_draw').on.activate({});
        await waitMs(350);
        assert.equal(harness.runtime.measure().activePaletteKey, 'create_draw');
        // R1 — un curseur ne referme rien : il ne porte meme pas d'activation.
        const sliderId = 'eve_bevy_ui_main_menu_tool_create_draw__draw_size';
        assert.equal(typeof node(sliderId)?.on?.activate, 'undefined');
        assert.equal(typeof node(sliderId)?.on?.palette_choose, 'undefined');
        node(sliderId).on.press({});
        assert.equal(harness.runtime.measure().activePaletteKey, 'create_draw');
    } finally { harness.runtime.destroy(); harness.restore(); }
});

test('a latched tool takes its palette slot and that slot turns it off without opening the palette', async () => {
    const invocations = [];
    const harness = createRuntimeHarness({ content: choicePaletteContent(),
        onInvoke: (entry, source, payload) => {
            invocations.push({ key: entry?.key, previousLatched: payload?.previousLatched });
            return entry?.key === 'text_create'
                ? { ok: true, nextLatched: payload?.previousLatched !== true }
                : { ok: true };
        } });
    const latest = () => harness.calls.at(-1).payload.tree;
    const node = (id) => findNode(latest().root, id);
    const slot = () => node('eve_bevy_ui_main_menu_tool_create');
    const slotIcon = () => node('eve_bevy_ui_main_menu_tool_create_icon').image.source;
    try {
        await harness.runtime.showFully();
        // Le verrou arrive par le canal canonique, jamais fabrique par le rendu.
        harness.runtime.setToolLatchedState({ tool_id: 'ui.text.create', latched: true });
        await waitMs(20);
        assert.equal(harness.runtime.getToolLatchedState({ tool_id: 'ui.text.create' }), true);
        // R2 — l'emplacement porte l'icone ET le libelle de l'outil actif : le
        // libelle se lit sur l'accessibilite du noeud, l'icone sur son enfant.
        assert.equal(slot().accessibility.label, 'Text');
        assert.match(slotIcon(), /edit\.svg$/);
        // L'emplacement reste une palette : il ouvrirait son niveau s'il n'etait pas allume.
        assert.equal(typeof slot().on.palette_open, 'function');
        // R4 — l'appui eteint l'outil par le chemin canonique et n'ouvre pas la palette.
        await node('eve_bevy_ui_main_menu_tool_create').on.activate({});
        assert.deepEqual(invocations, [{ key: 'text_create', previousLatched: true }]);
        assert.equal(harness.runtime.measure().activePaletteKey, '');
        assert.equal(harness.runtime.getToolLatchedState({ tool_id: 'ui.text.create' }), false);
        await waitMs(20);
        // R2 — l'extinction rend a la palette son icone et son libelle.
        assert.equal(slot().accessibility.label, 'Create');
        assert.match(slotIcon(), /add\.svg$/);
    } finally { harness.runtime.destroy(); harness.restore(); }
});

test('a latched tool that owns options replaces its palette other choices in the ribbon', async () => {
    const harness = createRuntimeHarness({ content: choicePaletteContent(), onInvoke: () => ({ ok: true }) });
    const latest = () => harness.calls.at(-1).payload.tree;
    const node = (id) => findNode(latest().root, id);
    try {
        await harness.runtime.showFully();
        await node('eve_bevy_ui_main_menu_tool_create').on.activate({});
        await waitMs(350);
        assert.ok(node('eve_bevy_ui_main_menu_tool_create__text_create'));
        assert.equal(node('eve_bevy_ui_main_menu_tool_create__draw_size'), null);
        // R3 — les autres choix disparaissent au profit des options de l'outil actif.
        harness.runtime.setToolLatchedState({ tool_id: 'tool.main.draw', latched: true });
        await waitMs(20);
        assert.equal(node('eve_bevy_ui_main_menu_tool_create__text_create'), null);
        assert.equal(node('eve_bevy_ui_main_menu_tool_create__create_draw'), null);
        assert.ok(node('eve_bevy_ui_main_menu_tool_create__draw_size'));
        assert.equal(node('eve_bevy_ui_main_menu_tool_create').accessibility.label, 'Draw');
        // Eteint, les autres choix reviennent : il faut l'eteindre pour les revoir.
        harness.runtime.setToolLatchedState({ tool_id: 'tool.main.draw', latched: false });
        await waitMs(20);
        assert.ok(node('eve_bevy_ui_main_menu_tool_create__text_create'));
        assert.equal(node('eve_bevy_ui_main_menu_tool_create__draw_size'), null);
    } finally { harness.runtime.destroy(); harness.restore(); }
});

test('View and Mode slots present the current choice and still open their palette', async () => {
    let currentView = 'view_list';
    const content = choicePaletteContent();
    content.view.selectedChildKey = () => currentView;
    const harness = createRuntimeHarness({ content, onInvoke: () => ({ ok: true }) });
    const latest = () => harness.calls.at(-1).payload.tree;
    const node = (id) => findNode(latest().root, id);
    try {
        await harness.runtime.showFully();
        assert.match(node('eve_bevy_ui_main_menu_tool_view_icon').image.source, /hamburger\.svg$/);
        assert.equal(node('eve_bevy_ui_main_menu_tool_view').accessibility.label, 'List');
        // Le choix change chez son proprietaire canonique, pas dans le rendu.
        currentView = 'view_table';
        await harness.runtime.refresh();
        assert.match(node('eve_bevy_ui_main_menu_tool_view_icon').image.source, /matrix\.svg$/);
        assert.equal(node('eve_bevy_ui_main_menu_tool_view').accessibility.label, 'Matrix');
        // R5 — un choix momentane n'a rien a eteindre : l'appui rouvre la palette.
        await node('eve_bevy_ui_main_menu_tool_view').on.activate({});
        await waitMs(350);
        assert.equal(harness.runtime.measure().activePaletteKey, 'view');
    } finally { harness.runtime.destroy(); harness.restore(); }
});

test('the main menu keeps assistant input and options owned by the dock', async () => {
 const h=createRuntimeHarness(); let dashboard=0;
 h.window.eveAssistantApi={getState:()=>({active:true}),listen:()=>{throw Error('unexpected voice activation');}};
 try { await h.runtime.showFully();
  assert.equal(h.runtime.assistantFieldOpen,undefined);
  assert.equal(h.runtime.assistantFieldClose,undefined);
  const item=findNode(h.calls.at(-1).payload.tree.root,BEVY_MAIN_MENU_ATOME_ID);
  await item.on.activate();
  assert.equal(h.runtime.state.sliderStateByKey.has('assistant'),false);
 } finally {h.runtime.destroy();h.restore();}
});

const choicePaletteContent = () => ({
    toolbox: { children: ['create', 'view', 'draw'] },
    create: { atome_tool: true, label: 'Create', icon: 'add', tool_id: 'tool.main.create',
        type: 'palette', tool_type: 'palette', action: 'momentary', submenuInstantOnClick: true,
        children: ['text_create', 'create_draw'] },
    text_create: { atome_tool: true, label: 'Text', icon: 'edit', tool_id: 'ui.text.create',
        type: 'tool', action: 'toggle', latch: true },
    create_draw: { atome_tool: true, label: 'Draw', icon: 'draw', tool_id: 'tool.main.draw',
        type: 'palette', tool_type: 'palette', action: 'toggle', latch: true, children: ['draw_size'] },
    draw_size: { label: 'Size', icon: 'size', type: 'slider', tool_id: 'ui.draw.size',
        slider_min: 1, slider_max: 100, slider_value: 10 },
    draw: { atome_tool: true, label: 'Draw', icon: 'draw', tool_id: 'tool.main.draw',
        type: 'palette', tool_type: 'palette', action: 'momentary', children: ['draw_size'] },
    view: { atome_tool: true, label: 'View', icon: 'visible_true', tool_id: 'tool.main.view',
        type: 'palette', tool_type: 'palette', action: 'momentary', submenuInstantOnClick: true,
        children: ['view_list', 'view_table'] },
    view_list: { atome_tool: true, label: 'List', icon: 'hamburger', tool_id: 'ui.view.mode.list',
        type: 'tool', action: 'momentary' },
    view_table: { atome_tool: true, label: 'Matrix', icon: 'matrix', tool_id: 'ui.view.mode.table',
        type: 'tool', action: 'momentary' }
});


test('Atom long press toggles input once and consumes its trailing short click', async () => {
    const actions = [];
    const h = createRuntimeHarness({ invokeAssistant: action => actions.push(action) });
    try {
        await h.runtime.showFully();
        const item = findNode(h.calls.at(-1).payload.tree.root, BEVY_MAIN_MENU_ATOME_ID);
        item.on.press({ x: 930, y: 690 });
        await waitMs(560);
        item.on.release({ x: 930, y: 690 });
        await item.on.activate();
        assert.deepEqual(actions, ['toggleInput']);
        item.on.press({ x: 930, y: 690 });
        item.on.release({ x: 930, y: 690 });
        await item.on.activate();
        assert.deepEqual(actions, ['toggleInput', 'toggle']);
    } finally { h.runtime.destroy(); h.restore(); }
});
