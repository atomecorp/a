import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, vi } from 'vitest';
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

// « Organiser » is the one main-menu tool whose destination is not a gateway
// tool: it runs the workspace Dashboard toggle, the same owner as the Mystic
// tile. The module is mocked so the contract stays on the invocation route.
const workspaceSurfaceRuntime = vi.hoisted(() => ({
    toggleWorkspaceDashboardAndMainMenu: vi.fn(async () => ({ ok: true }))
}));

vi.mock('../../eVe/intuition/tools/user_workspace_surface_runtime.js', () => ({
    toggleWorkspaceDashboardAndMainMenu: workspaceSurfaceRuntime.toggleWorkspaceDashboardAndMainMenu
}));

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

test('the capture palette keeps only its capture sources and Actions while the removed tools stay declared', async () => {
    const { createMainMenuContentRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js');
    const inertDependencies = [
        'applyDeleteSelection', 'closeBackgroundPanel', 'closeCalendarPanel', 'closeCanonicalHomePanel',
        'closeCommunicatePanel', 'closeCouleurPanel', 'closeDeletePanel', 'closeFinderPanel',
        'closeFontPanel', 'closeInfoPanel', 'closeLayerPanel', 'closeMatrixView', 'closePastePanel',
        'closeTimelinePanel', 'closeUndoPanel', 'defaultOrientation', 'directionValueToLabel',
        'ensureActivitiesModule', 'ensureCopyModule', 'ensurePastePanelModule', 'handleAiTouch',
        'handleFinderTouch', 'invokeTool', 'openBackgroundPanel', 'openCalendarPanel',
        'openCanonicalHomePanel', 'openCommunicatePanel', 'openCouleurPanel', 'openDeletePanel',
        'openFinderPanel', 'openFontPanel', 'openInfoPanel', 'openLayerPanel', 'openMatrixView',
        'openMediaPanel', 'closeMediaPanel',
        'openPastePanel', 'openTimelinePanel', 'openUndoPanel', 'orientationChanged'
    ];
    const content = createMainMenuContentRuntime({
        ...Object.fromEntries(inertDependencies.map((name) => [name, () => null])),
        directionValues: [],
        mainToolIdByKey: {
            mode: 'ui.mode', create: 'tool.main.create', draw: 'tool.main.draw',
            capture: 'tool.main.capture', view: 'tool.main.view', time: 'tool.main.time',
            find: 'tool.main.find', home: 'tool.main.home', help: 'tool.main.help',
            communicate: 'tool.main.communicate', activity: 'tool.main.activity'
        },
        translate: (_key, fallback) => fallback
    });
    // La palette « rec. » ne garde que les sources de capture et Actions ;
    // import, validation, Relire (capture_actions) et apercu en sortent (2026-09-29).
    assert.deepEqual(content.capture.children, ['audio', 'video', 'photo', 'screen', 'record_actions']);
    for (const key of ['preview', 'import', 'validation', 'capture_actions']) {
        assert.ok(content[key], `${key} doit rester un outil declare, hors palette`);
    }
    // Les trois listes synchronisees du ruban portent la meme composition.
    const runtimeSource = readFileSync(resolve(process.cwd(), 'eVe/intuition/tools/core/tool_runtime.js'), 'utf8');
    const captureSource = readFileSync(resolve(process.cwd(), 'eVe/intuition/tools/capture.js'), 'utf8');
    assert.match(runtimeSource, /children: \['ui\.capture\.audio', 'ui\.capture\.video', 'ui\.capture\.photo', 'ui\.capture\.screen', 'ui\.record\.actions'\]/);
    assert.match(captureSource, /const CAPTURE_CHILDREN = \['audio', 'video', 'photo', 'screen', 'record_actions'\];/);
});

test('the permanent bar is the five intents plus view/help/contact; mode and activity stay declared', async () => {
    const { createMainMenuContentRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js');
    const inertDependencies = [
        'applyDeleteSelection', 'closeBackgroundPanel', 'closeCalendarPanel', 'closeCanonicalHomePanel',
        'closeCommunicatePanel', 'closeCouleurPanel', 'closeDeletePanel', 'closeFinderPanel',
        'closeFontPanel', 'closeInfoPanel', 'closeLayerPanel', 'closeMatrixView', 'closePastePanel',
        'closeTimelinePanel', 'closeUndoPanel', 'defaultOrientation', 'directionValueToLabel',
        'ensureActivitiesModule', 'ensureCopyModule', 'ensurePastePanelModule', 'handleAiTouch',
        'handleFinderTouch', 'invokeTool', 'openBackgroundPanel', 'openCalendarPanel',
        'openCanonicalHomePanel', 'openCommunicatePanel', 'openCouleurPanel', 'openDeletePanel',
        'openFinderPanel', 'openFontPanel', 'openInfoPanel', 'openLayerPanel', 'openMatrixView',
        'openMediaPanel', 'closeMediaPanel',
        'openPastePanel', 'openTimelinePanel', 'openUndoPanel', 'orientationChanged'
    ];
    const content = createMainMenuContentRuntime({
        ...Object.fromEntries(inertDependencies.map((name) => [name, () => null])),
        directionValues: [],
        mainToolIdByKey: {
            mode: 'tool.main.mode', create: 'tool.main.create', draw: 'tool.main.draw',
            capture: 'tool.main.capture', view: 'tool.main.view', help: 'tool.main.help',
            activity: 'tool.main.activity', matrix: 'tool.main.matrix', perform: 'tool.main.perform'
        },
        translate: (_key, fallback) => fallback
    });
    // 2026-09-29 : `mode` et `activity` quittent la barre permanente ; `help`
    // (l'outil existant) et `contact` les remplacent a la meme place.
    assert.deepEqual(content.toolbox.children,
        ['organize', 'capture', 'create', 'find', 'communicate', 'calendar', 'view', 'help', 'contact']);
    for (const key of ['mode', 'activity']) {
        assert.ok(content[key], `${key} reste un outil declare, hors barre permanente`);
        assert.equal(content.toolbox.children.includes(key), false, `${key} ne reside plus dans la barre`);
    }
    assert.equal(content.mode.children.length, 3, 'la palette Mode garde ses trois modes');
    assert.equal(content.activity.type, 'palette', 'activite reste une palette');
    // « Utilitaire » (2026-09-29) : la palette du Mystic qui remplace `mode`
    // dans la liste constante. Aucun outil n'y est redefini : `validation` est
    // la commande de la capture, `matrix` la porte des projets en vignettes.
    assert.equal(content.utilities.type, 'palette');
    assert.equal(content.utilities.tool_type, 'palette');
    assert.deepEqual(content.utilities.children, ['mode', 'validation', 'matrix']);
    assert.deepEqual(content.mode.children, ['perform', 'mode_edit', 'mode_consume']);
    assert.equal(content.validation.tool_id, 'ui.capture.validation');
    assert.equal(content.matrix.tool_id, 'tool.main.matrix');
    assert.equal(typeof content.matrix.active, 'function');
    assert.equal(typeof content.matrix.inactive, 'function');
    // `help` is the existing tool: same tool_id, same handler, no second one.
    assert.equal(content.help.tool_id, 'tool.main.help');
    assert.equal(typeof content.help.touch, 'function');
    // `contact` is a panel command: the taxonomy owns the surface, the bootstrap
    // owns the panel, and no ribbon-local handler is created.
    assert.equal(content.contact.tool_id, 'ui.contact.panel');
    assert.equal(content.contact.touch, undefined);
    // The roots the ribbon really draws come from the taxonomy, in its own order.
    const { resolveMainMenuVisibility } = await import('../../eVe/intuition/menu/context_menu_resolver.js');
    assert.deepEqual(resolveMainMenuVisibility({ level: 'advanced' }).roots, content.toolbox.children);
    // Beginner keeps only the Atom handle; protected levels keep all families.
    assert.deepEqual(resolveMainMenuVisibility({ level: 'beginner' }).roots, []);
    assert.deepEqual(resolveMainMenuVisibility({ level: 'intermediate' }).roots, content.toolbox.children);
    const taxonomy = JSON.parse(readFileSync(resolve(process.cwd(),
        'eVe/intuition/menu/context_menus.json'), 'utf8'));
    assert.equal(taxonomy.commands.contact.panel, 'contact');
    assert.equal(taxonomy.commands.help.labelKey, 'eve.menu.help');
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
    assert.match(editMenuSource, /copy:\s*\{[\s\S]*?touch:[\s\S]*?long_press_tool_id:\s*'ui\.copy\.duplicate'/, 'a long press on Copy is Copy then Paste, never a third verb');
    assert.match(editMenuSource, /long_press_tool_id:\s*'ui\.copy\.duplicate'[\s\S]*?long_press_module:\s*'copy'/, 'the duplicate verb lives in the lazily loaded copy module');
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

test('the main menu is hidden outside an editable work context', () => {
    const legacy = buildBevyMainMenuItems(menuContent());
    assert.deepEqual(buildBevyMainMenuItems(menuContent(), { workContext: 'edit' }), legacy);
    assert.deepEqual(buildBevyMainMenuItems(menuContent(), { workContext: 'consultation' }), []);
    assert.deepEqual(buildBevyMainMenuItems(menuContent(), { workContext: 'performance' }), []);
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

test('« Organiser » runs the Mystic Dashboard toggle instead of a gateway tool', async () => {
    const env = installDom();
    const invocations = [];
    workspaceSurfaceRuntime.toggleWorkspaceDashboardAndMainMenu.mockClear();
    const runtime = createContextToolInvocationRuntime({
        getFinderToolEl: () => null,
        handleFinderTouch: () => null,
        invokeToolFromUiButton: async (input) => {
            invocations.push(input);
            return { ok: true, nextLatched: null };
        }
    });
    try {
        const result = await runtime.invokeIntuitionXMainRibbonToolDefinition({
            key: 'organize',
            type: 'tool',
            actionMode: 'momentary'
        }, 'bevy_ui.activate', { source: 'bevy_ui_main_menu' });
        assert.deepEqual(workspaceSurfaceRuntime.toggleWorkspaceDashboardAndMainMenu.mock.calls,
            [[{ source: 'main_menu_organize' }]], 'the main menu must call the canonical workspace toggle');
        assert.deepEqual(invocations, [], 'no gateway tool may stand between the button and the toggle');
        assert.equal(result.ok, true);
    } finally {
        env.restore();
    }
});

test('« Organiser » keeps one identity across the main menu and Mystic', () => {
    const source = readFileSync(resolve(process.cwd(),
        'eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js'), 'utf8');
    const organizeDef = source.match(/organize:\s*\{[^}]*\}/)?.[0] || '';
    assert.match(organizeDef, /labelKey:\s*'eve\.menu\.organize'/);
    assert.match(organizeDef, /atome_tool:\s*true/, 'the root stays visible in the main toolbox');
    assert.doesNotMatch(organizeDef, /tool_id|touch/,
        'the button declares no gateway tool and no local handler beside the shared invocation route');
    // The Mystic tile's own definition (key `dashboard`) shows the same name.
    assert.match(source, /dashboard:\s*\{\s*labelKey:\s*'eve\.menu\.organize'/);
    const taxonomy = JSON.parse(readFileSync(resolve(process.cwd(),
        'eVe/intuition/menu/context_menus.json'), 'utf8'));
    assert.equal(taxonomy.commands.dashboard.labelKey, 'eve.menu.organize');
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

test('a slide on an already open ribbon palette keeps it and the release applies the option', async () => {
    const invocations = [];
    const harness = createRuntimeHarness({ content: choicePaletteContent(),
        onInvoke: (entry) => { invocations.push(entry?.key); return { ok: true }; } });
    const latest = () => harness.calls.at(-1).payload.tree;
    const node = (id) => findNode(latest().root, id);
    try {
        await harness.runtime.showFully();
        // R1 (2026-09-27) — l'outil porte le glissement partage : le premier
        // deplacement d'un geste revele ses options sans lever le doigt.
        assert.equal(typeof node('eve_bevy_ui_main_menu_tool_view').on.palette_slide_open, 'function');
        await node('eve_bevy_ui_main_menu_tool_view').on.activate({});
        await waitMs(350);
        assert.equal(harness.runtime.measure().activePaletteKey, 'view');
        // Le glissement sur une palette DEJA ouverte revele, il ne bascule pas :
        // le doigt ne reste jamais au-dessus d'une palette refermee.
        await node('eve_bevy_ui_main_menu_tool_view').on.palette_slide_open({});
        assert.equal(harness.runtime.measure().activePaletteKey, 'view');
        assert.deepEqual(invocations, []);
        // Le relachement sur l'option applique le choix et referme.
        await node('eve_bevy_ui_main_menu_tool_view__view_list').on.palette_choose({});
        assert.deepEqual(invocations, ['view_list']);
        assert.equal(harness.runtime.measure().activePaletteKey, '');
    } finally { harness.runtime.destroy(); harness.restore(); }
});

test('a latched tool keeps its palette slot identity and that slot still turns it off', async () => {
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
        // R2 (2026-09-24) — l'emplacement porte l'icone ET le libelle de SA
        // palette : un enfant verrouille ne renomme jamais l'outil qui le contient.
        assert.equal(slot().accessibility.label, 'Create');
        assert.match(slotIcon(), /add\.svg$/);
        // Le niveau affiche est celui de l'outil actif : Text n'a aucune option.
        assert.equal(node('eve_bevy_ui_main_menu_tool_create__text_create'), null);
        // L'emplacement reste une palette : il ouvrirait son niveau s'il n'etait pas allume.
        assert.equal(typeof slot().on.palette_open, 'function');
        // R4 — l'appui eteint l'outil par le chemin canonique et n'ouvre pas la palette.
        await node('eve_bevy_ui_main_menu_tool_create').on.activate({});
        assert.deepEqual(invocations, [{ key: 'text_create', previousLatched: true }]);
        assert.equal(harness.runtime.measure().activePaletteKey, '');
        assert.equal(harness.runtime.getToolLatchedState({ tool_id: 'ui.text.create' }), false);
        await waitMs(20);
        // L'emplacement a garde son identite pendant tout le cycle de verrouillage.
        assert.equal(slot().accessibility.label, 'Create');
        assert.match(slotIcon(), /add\.svg$/);
        // L'extinction rend a la palette ses autres choix : elle se rouvre normalement.
        await slot().on.activate({});
        await waitMs(350);
        assert.equal(harness.runtime.measure().activePaletteKey, 'create');
        assert.ok(node('eve_bevy_ui_main_menu_tool_create__text_create'));
        assert.deepEqual(invocations, [{ key: 'text_create', previousLatched: true }]);
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
        // R3 ne touche que les CHOIX : l'emplacement garde le libelle de sa palette.
        assert.equal(node('eve_bevy_ui_main_menu_tool_create').accessibility.label, 'Create');
        // Eteint, les autres choix reviennent : il faut l'eteindre pour les revoir.
        harness.runtime.setToolLatchedState({ tool_id: 'tool.main.draw', latched: false });
        await waitMs(20);
        assert.ok(node('eve_bevy_ui_main_menu_tool_create__text_create'));
        assert.equal(node('eve_bevy_ui_main_menu_tool_create__draw_size'), null);
    } finally { harness.runtime.destroy(); harness.restore(); }
});

test('View keeps its own icon and label when the canonical view mode changes', async () => {
    const content = choicePaletteContent();
    const harness = createRuntimeHarness({ content, onInvoke: () => ({ ok: true }) });
    const latest = () => harness.calls.at(-1).payload.tree;
    const node = (id) => findNode(latest().root, id);
    try {
        await harness.runtime.showFully();
        // La palette Vue garde SON icone et SON libelle, ici comme ailleurs
        // (2026-09-24) : elle ne porte plus le mode de vue courant.
        assert.match(node('eve_bevy_ui_main_menu_tool_view_icon').image.source, /visible_true\.svg$/);
        assert.equal(node('eve_bevy_ui_main_menu_tool_view').accessibility.label, 'View');
        await harness.runtime.refresh();
        assert.match(node('eve_bevy_ui_main_menu_tool_view_icon').image.source, /visible_true\.svg$/);
        assert.equal(node('eve_bevy_ui_main_menu_tool_view').accessibility.label, 'View');
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
