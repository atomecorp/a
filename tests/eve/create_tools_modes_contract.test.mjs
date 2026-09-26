import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { createProjectLayerRuntime } from '../../eVe/core/atome_events/project_layer_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createMainMenuCreateContent, createMainMenuCreateInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js';
import { textCreationSession } from '../../eVe/core/atome_events/text_creation_session.js';
import * as viewMode from '../../eVe/domains/rendering/project_view_mode_state.js';
import { createContextToolInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/context_tool_invocation_runtime.js';
import { normalizeToolEntry } from '../../eVe/intuition/ribbon/menu_model.js';
import { resolvePageFrame } from '../../eVe/domains/rendering/project_view_creation_geometry.js';
import { resolveInsertionTarget } from '../../eVe/domains/rendering/project_view_insertion_target.js';
import { resolveVisualSourcePoint } from '../../eVe/domains/rendering/project_view_visual_geometry.js';
import { createProjectViewVisualInteractionRuntime } from '../../eVe/domains/rendering/project_view_visual_interaction_runtime.js';
import { createProjectViewCreateDraftRuntime } from '../../eVe/domains/rendering/project_view_create_draft_runtime.js';
import { recordPreviewNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_record_preview.js';
import { createProjectViewVisualPanel } from '../../eVe/domains/rendering/project_view_visual_panel.js';
import { centeredEditorGeometry } from '../../eVe/intuition/tools/code_editor_geometry.js';
import { buildBootstrapDefsA } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js';
import { buildBootstrapDefsB } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js';
import { hasDrawTravelled } from '../../eVe/intuition/tools/core/svg_draw_model.js';
import { buildBevyMainMenuItems, buildBevyMainMenuTree } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createRuntimeHarness, findNode } from './bevy_ui_main_menu_test_helpers.mjs';
import { isActive as generatorIsActive, readChoice as generatorReadChoice, runGeneratorCase, setActive as setGeneratorActive } from '../../eVe/intuition/tools/generator/runtime.js';
import '../../eVe/intuition/tools/generator/index.js';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
const previousElement = globalThis.Element;
const previousHTMLElement = globalThis.HTMLElement;
const previousNode = globalThis.Node;
const previousLocalStorage = globalThis.localStorage;

afterEach(() => {
    vi.restoreAllMocks();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.Element = previousElement;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.Node = previousNode;
    globalThis.localStorage = previousLocalStorage;
    setMainMenuRuntime(null);
});

test('List Create Text focuses before the first await and cleans up a rejected creation', async () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    window.__currentProject = { id: 'focus_project' };
    window.__eveTextTool = { isActive: () => false };
    vi.spyOn(viewMode, 'getProjectViewMode').mockReturnValue('list');
    const invocation = createMainMenuCreateInvocationRuntime({
        invokeToolFromUiButton: async () => { throw new Error('creation_denied'); }
    });
    try {
        const pending = invocation.invoke({ definition: { toolId: 'ui.text.create', extraInput: {
            content_kind: 'text', create_tool_ids: ['ui.text.create']
        } } });
        const editor = document.activeElement;
        assert.equal(editor.tagName, 'TEXTAREA');
        assert.equal(textCreationSession.isCreating(), true);
        await assert.rejects(pending, /creation_denied/);
        assert.equal(editor.isConnected, false);
        assert.equal(textCreationSession.isIdle(), true);
    } finally {
        textCreationSession.abort();
        dom.window.close();
    }
});

test('the real Bevy invocation keeps Create exclusive even when the gateway envelope has a stale latch', async () => {
    const active = { text: false, draw: true, code: false, page: false };
    const invocations = [];
    const latches = new Map();
    const dom = new JSDOM('<!doctype html><body></body>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.window.__eveTextTool = { isActive: () => active.text };
    globalThis.window.__eveDrawTool = { isActive: () => active.draw };
    globalThis.window.eveCodeToolApi = { isOpen: () => active.code };
    setMainMenuRuntime({
        setToolLatchedState: ({ tool_id, latched }) => latches.set(tool_id, latched)
    });
    const content = createMainMenuCreateContent({
        translate: (_key, fallback) => fallback,
        createToolId: 'tool.main.create',
        drawToolId: 'tool.main.draw'
    });
    const definition = normalizeToolEntry('text_create', content.text_create, content);
    const invokeToolFromUiButton = async ({ toolId, actionOverride }) => {
        invocations.push([toolId, actionOverride]);
        const key = toolId === 'ui.text.create' ? 'text'
            : toolId === 'tool.main.draw' ? 'draw'
                : toolId === 'ui.code.editor' ? 'code' : 'page';
        active[key] = actionOverride === 'state.on';
        return { ok: true, active: active[key], latched: active[key], nextLatched: false };
    };
    const invocation = createContextToolInvocationRuntime({
        getFinderToolEl: () => null,
        handleFinderTouch: () => null,
        invokeToolFromUiButton
    });

    const enabled = await invocation.invokeIntuitionXMainRibbonToolDefinition(
        definition, 'pointer.click', { source: 'bevy_ui_main_menu', previousLatched: false }
    );
    assert.deepEqual(invocations, [
        ['tool.main.draw', 'state.off'],
        ['ui.text.create', 'state.on']
    ]);
    assert.equal(active.text, true);
    assert.equal(active.draw, false);
    assert.equal(latches.get('ui.text.create'), true);
    assert.equal(enabled.nextLatched, true);

    invocations.length = 0;
    const disabled = await invocation.invokeIntuitionXMainRibbonToolDefinition(
        definition, 'pointer.click', { source: 'bevy_ui_main_menu', previousLatched: true }
    );
    assert.deepEqual(invocations, [['ui.text.create', 'state.off']]);
    assert.equal(latches.get('ui.text.create'), false);
    assert.equal(disabled.nextLatched, false);
});

test('activating Text never wakes a lazy inactive Code toggle', async () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.window.__eveTextTool = { isActive: () => false };
    globalThis.window.__eveDrawTool = { isActive: () => false };
    globalThis.window.eveProjectViewCreationApi = { isPageToolActive: () => false };
    const invocations = [];
    const content = createMainMenuCreateContent({
        translate: (_key, fallback) => fallback,
        createToolId: 'tool.main.create',
        drawToolId: 'tool.main.draw'
    });
    const definition = normalizeToolEntry('text_create', content.text_create, content);
    const invocation = createContextToolInvocationRuntime({
        getFinderToolEl: () => null,
        handleFinderTouch: () => null,
        invokeToolFromUiButton: async (input) => {
            invocations.push([input.toolId, input.actionOverride]);
            return { ok: true, active: input.actionOverride === 'state.on' };
        }
    });
    await invocation.invokeIntuitionXMainRibbonToolDefinition(
        definition, 'pointer.click', { source: 'bevy_ui_main_menu', previousLatched: false }
    );
    assert.deepEqual(invocations, [['ui.text.create', 'state.on']]);
    assert.equal(globalThis.window.eveCodeToolApi, undefined);
});

test('the latched Create tool keeps its own slot identity and its level', () => {
    const content = createMainMenuCreateContent({
        translate: (_key, fallback) => fallback,
        createToolId: 'tool.main.create',
        drawToolId: 'tool.main.draw'
    });
    content.toolbox = { children: ['create'] };
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const treeFor = (latched) => buildBevyMainMenuTree({
        content,
        surface,
        itemSize: 60,
        state: {
            activePaletteKey: latched ? '' : 'create',
            externalOpenByToolId: new Map(),
            hoveredId: '',
            latchedByToolId: new Map([['ui.text.create', latched]]),
            pressedId: '',
            recordingVisualByToolId: new Map()
        }
    });
    const find = (node, id) => {
        if (node?.id === id) return node;
        for (const child of node?.children || []) {
            const found = find(child, id);
            if (found) return found;
        }
        return null;
    };
    const slotId = 'eve_bevy_ui_main_menu_tool_create';
    const childId = 'eve_bevy_ui_main_menu_tool_create__text_create_background';
    const slot = (latched) => find(treeFor(latched).root, slotId);
    // Le libelle se lit sur l'accessibilite du noeud, l'icone sur son enfant.
    const slotLabel = (latched) => slot(latched).accessibility.label;
    const slotIcon = (latched) => find(treeFor(latched).root, `${slotId}_icon`).image.source;
    // Eteint : la palette affiche ses propres choix et son propre libelle.
    assert.ok(find(treeFor(false).root, childId));
    assert.ok(slotLabel(false));
    // Allume (2026-09-24) : l'emplacement garde l'icone et le libelle de SA
    // palette ; seul le NIVEAU devient celui de l'outil verrouille (R3).
    assert.equal(slotLabel(true), slotLabel(false));
    assert.equal(slotIcon(true), slotIcon(false));
    assert.equal(find(treeFor(true).root, childId), null);
    // L'emplacement se lit comme allume, palette refermee : meme peignage que le
    // ruban actif, alors que la palette eteinte ne l'aurait pas.
    assert.deepEqual(slot(true).style.translation, [0, 2]);
});

// Le constructeur du contenu du ruban exige l'ensemble de ses dependances. Ce
// contrat ne porte que sur la palette Mode : les autres restent des stubs inertes.
const modeContentDependencies = (translate) => {
    const inert = [
        'applyDeleteSelection', 'closeBackgroundPanel', 'closeCalendarPanel', 'closeCanonicalHomePanel',
        'closeCommunicatePanel', 'closeCouleurPanel', 'closeDeletePanel', 'closeFinderPanel',
        'closeFontPanel', 'closeInfoPanel', 'closeLayerPanel', 'closeMatrixView', 'closePastePanel',
        'closeTimelinePanel', 'closeUndoPanel', 'defaultOrientation', 'directionValueToLabel',
        'ensureActivitiesModule', 'ensureCopyModule', 'ensurePastePanelModule', 'handleAiTouch',
        'handleFinderTouch', 'invokeTool', 'openBackgroundPanel', 'openCalendarPanel',
        'openCanonicalHomePanel', 'openCommunicatePanel', 'openCouleurPanel', 'openDeletePanel',
        'openFinderPanel', 'openFontPanel', 'openInfoPanel', 'openLayerPanel', 'openMatrixView',
        'openPastePanel', 'openTimelinePanel', 'openUndoPanel', 'orientationChanged'
    ];
    return Object.fromEntries([
        ...inert.map((name) => [name, () => null]),
        ['directionValues', []],
        ['mainToolIdByKey', { mode: 'ui.mode', create: 'tool.main.create', draw: 'tool.main.draw' }],
        ['translate', translate]
    ]);
};

test('the Mode palette keeps its own icon and label whatever the canonical work mode is', async () => {
    const { createMainMenuContentRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js');
    const content = createMainMenuContentRuntime({
        ...modeContentDependencies((_key, fallback) => fallback),
        t: (_key, fallback) => fallback,
        trackContextMenuState: () => {}, announceContextMenuState: () => {}
    });
    // Le mode de travail reste publie par `getProjectWorkMode` ; seule la
    // PRESENTATION de la palette ne le suit plus (2026-09-24).
    const workMode = await import('../../eVe/domains/rendering/project_work_mode_state.js');
    const dom = new JSDOM('<!doctype html>');
    const previousWindow = globalThis.window;
    globalThis.window = dom.window;
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'mode_project' };
    dom.window.__currentProject = { id: 'mode_project' };
    dom.window.evePerformApi = { deactivate: async () => ({ ok: true }) };
    const menuContent = () => ({
        toolbox: { children: ['mode'] }, mode: content.mode, perform: content.perform,
        mode_edit: content.mode_edit, mode_consume: content.mode_consume
    });
    const slot = () => buildBevyMainMenuItems(menuContent()).find((item) => item.key === 'mode');
    try {
        assert.equal(content.mode.selectedChildKey, undefined);
        await workMode.setProjectWorkMode('consultation', { windowRef: dom.window, prepare:async()=>({ok:true}) });
        assert.equal(slot().label, 'mode');
        assert.match(slot().icon, /settings\.svg$/);
        await workMode.setProjectWorkMode('edit', { windowRef: dom.window });
        assert.equal(slot().label, 'mode');
        assert.match(slot().icon, /settings\.svg$/);
        // Le niveau de la palette reste celui de ses trois modes.
        assert.deepEqual(slot().entry.children.map((child) => child.key), ['perform', 'mode_edit', 'mode_consume']);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('shared-canvas BevyUI hit keeps menu ownership while Text is armed', () => {
    const dom = new JSDOM('<!doctype html><main id="project_view_project_a"><canvas id="eve_surface_project"></canvas></main>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    const layer = document.getElementById('project_view_project_a');
    const canvas = document.getElementById('eve_surface_project');
    Object.defineProperty(layer, 'clientWidth', { value: 500 });
    Object.defineProperty(layer, 'clientHeight', { value: 400 });
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400 });
    const selections = [];
    const backgroundTextCalls = [];
    const uiHits = [];
    const runtime = createProjectLayerRuntime({
        hasBindMark: () => false,
        setBindMark: () => {},
        isSystemRootHost: () => false,
        isToolHost: () => false,
        isToolUiTarget: () => false,
        isPrimaryPointerActivation: () => true,
        isMysticPointerLocked: () => false,
        isValidProjectIdCandidate: (value) => !!String(value || '').trim(),
        hitTestBevyUiAtClientPoint: (payload) => (uiHits.push(payload), { nodeId: 'main_menu_create' }),
        hitTestProjectSceneAtClientPoint: () => null,
        collectProjectSceneAtomsInClientRect: () => [],
        applySelectionIntent: (id) => (selections.push(id), id),
        applySelectionBatch: () => [],
        clearAllSelection: () => {},
        isTextToolActive: () => true,
        isTemporaryBackgroundTextToolSessionActive: () => false,
        notifyTextToolProjectBackgroundClick: (payload) => backgroundTextCalls.push(payload)
    });
    runtime.bindProjectLayerEvents(layer);
    const event = new window.MouseEvent('pointerdown', {
        bubbles: true, cancelable: true, clientX: 470, clientY: 385, buttons: 1
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    canvas.dispatchEvent(event);

    assert.equal(uiHits.length, 1);
    assert.equal(uiHits[0].clientX, 470);
    assert.deepEqual(selections, []);
    assert.deepEqual(backgroundTextCalls, []);
    assert.equal(document.querySelectorAll('.eve-atome-lasso').length, 0);
});

test('project background second touch focuses the provisional editor before pointerup', () => {
    const dom = new JSDOM('<!doctype html><main id="project_view_project_a"></main>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    const layer = document.getElementById('project_view_project_a');
    Object.defineProperty(layer, 'clientWidth', { value: 500 });
    Object.defineProperty(layer, 'clientHeight', { value: 400 });
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400 });
    const provisionalFocusCalls = [];
    const provisionalCancelCalls = [];
    const activeEditorFocusCalls = [];
    window.__eveTextTool = {
        prepareProvisionalFocus: (payload) => provisionalFocusCalls.push(payload),
        cancelProvisionalFocus: () => provisionalCancelCalls.push(true),
        focusActiveTextEditor: () => activeEditorFocusCalls.push(true)
    };
    const runtime = createProjectLayerRuntime({
        hasBindMark: () => false,
        setBindMark: () => {},
        isSystemRootHost: () => false,
        isToolHost: () => false,
        isToolUiTarget: () => false,
        isPrimaryPointerActivation: () => true,
        isMysticPointerLocked: () => false,
        markMysticPointerGestureArmed: () => {},
        clearMysticPointerGestureArmed: () => {},
        isValidProjectIdCandidate: (value) => !!String(value || '').trim(),
        hitTestBevyUiAtClientPoint: () => null,
        hitTestProjectSceneAtClientPoint: () => null,
        collectProjectSceneAtomsInClientRect: () => [],
        applySelectionIntent: (id) => id,
        applySelectionBatch: () => [],
        clearAllSelection: () => {},
        isTextToolActive: () => false,
        isTemporaryBackgroundTextToolSessionActive: () => false,
        notifyTextToolProjectBackgroundClick: () => {}
    });
    runtime.bindProjectLayerEvents(layer);
    const dispatchTouch = (target, type, pointerId) => {
        const event = new window.MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: 120,
            clientY: 90,
            buttons: type === 'pointerup' ? 0 : 1
        });
        Object.defineProperty(event, 'pointerId', { value: pointerId });
        Object.defineProperty(event, 'pointerType', { value: 'touch' });
        target.dispatchEvent(event);
    };

    dispatchTouch(layer, 'pointerdown', 1);
    dispatchTouch(document, 'pointerup', 1);
    dispatchTouch(layer, 'click', 1);
    dispatchTouch(layer, 'pointerdown', 2);

    assert.equal(provisionalFocusCalls.length, 1);
    assert.equal(provisionalFocusCalls[0].clientX, 120);
    assert.equal(provisionalFocusCalls[0].clientY, 90);

    dispatchTouch(document, 'pointerup', 2);
    dispatchTouch(layer, 'click', 2);
    assert.equal(provisionalFocusCalls.length, 1);
    assert.equal(provisionalCancelCalls.length, 0);
    assert.equal(activeEditorFocusCalls.length, 1);

    dispatchTouch(layer, 'pointerdown', 3);
    dispatchTouch(document, 'pointerup', 3);
    dispatchTouch(layer, 'click', 3);
    dispatchTouch(layer, 'pointerdown', 4);
    dispatchTouch(document, 'pointercancel', 4);
    assert.equal(provisionalFocusCalls.length, 2);
    assert.equal(provisionalCancelCalls.length, 1);
    dom.window.close();
});

test('Page is a latch and resolves a canonical frame regardless of drag direction', () => {
    const identity = (definition) => definition;
    const definitions = buildBootstrapDefsA(identity, identity, 'calendar', 'registered');
    const page = definitions.find((entry) => entry.tool_id === 'ui.page.create');
    assert.equal(page.behavior.button_type, 'latch');
    assert.deepEqual(resolvePageFrame({ x: 80, y: 65 }, { x: 20, y: 15 }), {
        left: 20, top: 15, width: 60, height: 50
    });
});

test('a Create action inside a Molecule keeps parent_id membership and the temporal clip target', () => {
    assert.deepEqual(resolveInsertionTarget({
        projectId: 'project_text', containerId: 'molecule_text', containerEntity: 'molecule', ownerId: 'molecule_text'
    }), {
        projectId: 'project_text',
        parentId: 'molecule_text',
        temporal: {
            ownerId: 'molecule_text', sectionId: null, trackId: null, entity: 'molecule'
        }
    });
    assert.equal(resolveInsertionTarget({
        projectId: 'project_text', containerId: 'track_text', containerEntity: 'track', ownerId: 'molecule_text'
    }).parentId, 'project_text');
});

test('Visual interaction maps preview coordinates back to canonical scene coordinates', () => {
    assert.deepEqual(resolveVisualSourcePoint(
        { x: 110, y: 70 },
        { x: 10, y: 20, width: 200, height: 100 },
        { x: 300, y: 400, width: 800, height: 500 }
    ), { x: 700, y: 650 });
});

test('Visual double-click edits the displayed source inline and never creates a second Text from its margin', async () => {
    const intents = [];
    const railTargets = [];
    let parasiteCreates = 0;
    globalThis.window = {
        __eveTextTool: { isActive: () => true },
        eveProjectViewCreationApi: { createTextAtPoint: () => { parasiteCreates += 1; } }
    };
    const runtime = createProjectViewVisualInteractionRuntime({
        emitIntent: async ({ intent }) => { intents.push(intent); return { ok: true }; },
        feedRail: async (payload) => { railTargets.push(payload); return { ok: true }; }
    });
    const record = {
        id: 'text_inline', atome_id: 'text_inline', type: 'text', project_id: 'project_inline',
        properties: { text: 'Inline', left: 40, top: 30, width: 160, height: 40 }
    };
    await runtime.press({ event: { x: 2, y: 2 }, record, width: 400, height: 180 });
    await runtime.release({ event: { x: 2, y: 2 } });
    await runtime.doubleClick({ event: { x: 2, y: 2 }, record, width: 400, height: 180 });

    assert.equal(parasiteCreates, 0);
    assert.deepEqual(intents.slice(-2).map((intent) => intent.kind), ['text.edit.begin', 'select']);
    assert.equal(railTargets.length, 1);
    assert.equal(railTargets[0].projectId, 'project_inline');
    assert.equal(railTargets[0].target.id, 'text_inline');
});

test('Visual long-press opens the canonical Atome Mystic context so text style tools remain available', async () => {
    const menus = [];
    const runtime = createProjectViewVisualInteractionRuntime({
        openAtomeMenu: async (payload) => { menus.push(payload); return { ok: true }; }
    });
    await runtime.longPress({
        event: { client_x: 42, client_y: 84 },
        record: { id: 'text_mystic', type: 'text', project_id: 'project_mystic' }
    });
    assert.deepEqual(menus, [{
        event: { client_x: 42, client_y: 84 },
        atomeId: 'text_mystic', kind: 'text', projectId: 'project_mystic'
    }]);
});

test('shared previews stay passive by default and expose the canonical edit caret only when interactive', () => {
    const record = {
        id: 'text_1', type: 'text', properties: {
            text: '',
            rich_text: { editing: true, selection: { start: 0, end: 0, caret: 0 }, caret_visible: true }
        }
    };
    const passive = recordPreviewNode({ id: 'passive', record, width: 120, height: 60 });
    const interactive = recordPreviewNode({
        id: 'interactive', record, width: 120, height: 60, interaction: { press: () => true }
    });
    assert.equal(passive.on, undefined);
    assert.equal(passive.kind, 'panel');
    assert.equal(interactive.kind, 'pointer_capture');
    assert.equal(typeof interactive.on.press, 'function');
    assert.equal(interactive.children[0].children.length, 1);
    assert.equal(interactive.children[0].children[0].style.rich_text.editing, true);
    assert.equal(interactive.children[0].children[0].style.rich_text.caret_visible, true);
    assert.deepEqual(interactive.children[0].children[0].style.rich_text.selection, { start: 0, end: 0, caret: 0 });
});

test('a pinned Visual keeps its source identity but accepts canonical live text updates', () => {
    const panel = createProjectViewVisualPanel();
    panel.pinSubject({ id: 'text_1', type: 'text', properties: { text: '' } }, { reason: 'text_edit' });
    assert.equal(panel.pinReason(), 'text_edit');
    assert.equal(panel.setSubject({
        id: 'text_1', type: 'text', properties: {
            text: 'A', rich_text: { editing: true, selection: { start: 1, end: 1, caret: 1 } }
        }
    }), true);
    assert.equal(panel.setSubject({ id: 'text_2', type: 'text', properties: { text: 'B' } }), false);
    const tree = panel.build({ width: 120, height: 60 });
    assert.equal(tree.children[0].children[0].children[0].text, 'A');
});

test('Code editor geometry is centered and constrained to the usable surface', () => {
    assert.deepEqual(centeredEditorGeometry({ clientWidth: 1000, clientHeight: 700 }, { width: 760, height: 520 }), {
        size: { width: 760, height: 520 },
        position: { x: 120, y: 90 }
    });
    assert.deepEqual(centeredEditorGeometry({ clientWidth: 320, clientHeight: 240 }, { width: 760, height: 520 }), {
        size: { width: 320, height: 240 },
        position: { x: 0, y: 0 }
    });
});

test('Code editor is a registered V2 toggle before Create sends state on or off', () => {
    const defs = buildBootstrapDefsB(
        (definition) => definition,
        (definition) => ({
            ...definition,
            behavior: {
                button_type: 'toggle',
                actions: ['pointer.click', 'state.on', 'state.off']
            },
            execution_mode: 'v2_registered_handler'
        }),
        'v2_calendar_api',
        'v2_registered_handler'
    );
    const code = defs.find((definition) => definition.tool_id === 'ui.code.editor');
    assert.ok(code);
    assert.equal(code.execution_mode, 'v2_registered_handler');
    assert.deepEqual(code.behavior.actions, ['pointer.click', 'state.on', 'state.off']);
});

test('Draw crosses its persistence gate only after a real stroke', () => {
    assert.equal(hasDrawTravelled({ x: 10, y: 10 }, { x: 10, y: 10 }), false);
    assert.equal(hasDrawTravelled({ x: 10, y: 10 }, { x: 10.4, y: 10.4 }), false);
    assert.equal(hasDrawTravelled({ x: 10, y: 10 }, { x: 12, y: 11 }), true);
});

test('structured Create drafts delete an empty canonical Atome and retain the same valid identifier', async () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const deleted = [];
    globalThis.window.Atome = {
        getStateCurrent: async (id) => ({ id, type: 'shape', properties: { svg_markup: '' } })
    };
    globalThis.window.eveDeleteApi = {
        moveAtomesToBlackHole: async (ids) => { deleted.push(...ids); return { ok: true }; }
    };
    const draft = createProjectViewCreateDraftRuntime({
        pinSubject: async () => null,
        publish: () => null,
        select: async () => null
    });
    await draft.set({
        kind: 'draw', projectId: 'project', atomeId: 'draw_empty',
        record: { id: 'draw_empty', parent_id: 'project', properties: {} }
    });
    const removed = await draft.finish('draw');
    assert.equal(removed.kept, false);
    assert.deepEqual(deleted, ['draw_empty']);

    await draft.set({
        kind: 'draw', projectId: 'project', atomeId: 'draw_valid',
        record: { id: 'draw_valid', parent_id: 'project', properties: {} }
    });
    assert.equal(draft.markValid({ kind: 'draw', atomeId: 'draw_valid' }), true);
    const retained = await draft.finish('draw');
    assert.equal(retained.kept, true);
    assert.equal(retained.atome_id, 'draw_valid');
    assert.deepEqual(deleted, ['draw_empty']);
});


test('Visual preserves a media projection identity when other composition members end', () => {
    const panel = createProjectViewVisualPanel();
    const video = { id: 'video_1', type: 'video', properties: { media_url: '/video.mp4', width: 160, height: 90 } };
    const text = { id: 'text_1', type: 'text', properties: { text: 'Title' } };
    panel.setSubject(video, { records: [video, text] });
    const compositeId = panel.videoNodeIdsFor(video.id);
    const composite = panel.build({ width: 320, height: 180 });
    panel.setSubject(video);
    assert.deepEqual(panel.videoNodeIdsFor(video.id), compositeId);
    const single = panel.build({ width: 320, height: 180 });
    assert.equal(single.children[0].id, composite.children[0].id);
    assert.equal(single.children[0].children[0].id, composite.children[0].children[0].children[0].id);
    panel.pinSubject(video, { reason: 'editing' });
    assert.deepEqual(panel.videoNodeIdsFor(video.id), compositeId);
});

// The Create palette, as the ribbon builds it: the real content runtime plus
// the generator palette the registry projects into it.
const createPaletteContent = () => ({
    toolbox: { children: ['create'] },
    ...createMainMenuCreateContent({
        translate: (_key, fallback) => fallback,
        createToolId: 'tool.main.create',
        drawToolId: 'tool.main.draw'
    }),
    generator: {
        labelKey: 'eve.menu.generator', label: 'generator', type: 'palette', tool_type: 'palette',
        children: [], icon: 'modules', action: 'momentary', submenuInstantOnClick: true,
        atome_tool: true, tool_id: 'tool.main.generator'
    }
});
const createNodeId = (key) => `eve_bevy_ui_main_menu_tool_create__${key}`;
const settleTree = async () => { await Promise.resolve(); await Promise.resolve(); };

test('Create > Page is a plain tool: the real click arms it and closes the palette', async () => {
    const content = createPaletteContent();
    // Page used to be a ribbon palette of formats (`type:'palette'` plus
    // `invoke_on_expand`): its click opened the list in place and left it open.
    // Its residence is now the armed-tool rail, like Text, Draw and Code.
    assert.equal(content.page_create.type, 'tool');
    assert.equal(content.page_create.tool_type, undefined, 'no tool palette is declared locally');
    assert.equal(content.page_create.children, undefined);
    assert.equal(content.page_create.invoke_on_expand, undefined);
    assert.equal(content.page_create.latch, true);
    assert.equal(content.page_create.extra_input.content_kind, 'page');
    // The formats stay in the catalogue: the rail reads their label and icon there.
    for (const format of ['free', 'sixteen_nine', 'four_three', 'three_two', 'a4', 'square']) {
        const definition = content[`page_format_${format}`];
        assert.equal(definition.tool_id, 'ui.page.create');
        assert.equal(definition.extra_input.page_format, format);
    }

    const invocations = [];
    const harness = createRuntimeHarness({
        content,
        onInvoke: async (definition) => {
            invocations.push(definition.toolId);
            return { ok: true, active: true, latched: true, nextLatched: true };
        }
    });
    try {
        await harness.runtime.showFully();
        const createNode = findNode(harness.calls.at(-1).payload.tree.root, 'eve_bevy_ui_main_menu_tool_create');
        await createNode.on.activate();
        await settleTree();
        assert.equal(harness.runtime.measure().activePaletteKey, 'create');

        const pageNode = findNode(harness.calls.at(-1).payload.tree.root, createNodeId('page_create'));
        assert.ok(pageNode, 'Page is still listed in Create');
        await pageNode.on.activate();
        await settleTree();
        assert.deepEqual(invocations, ['ui.page.create'], 'the click arms the page tool');
        assert.equal(harness.runtime.measure().activePaletteKey, '',
            'and closes the menu, exactly like Text and Code');
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});

test('Create > Placeholder keeps its choices in place, and the choice arms the tool', async () => {
    const content = createPaletteContent();
    assert.equal(content.create_placeholder.type, 'palette', 'the list of choices stays in Create');
    assert.deepEqual(content.create_placeholder.children, [
        'placeholder_text', 'placeholder_video', 'placeholder_audio', 'placeholder_photo',
        'placeholder_image', 'placeholder_shape', 'placeholder_duration', 'placeholder_max_chars'
    ]);
    for (const kind of ['text', 'video', 'audio', 'photo', 'image', 'shape']) {
        assert.equal(content[`placeholder_${kind}`].extra_input.placeholder_kind, kind);
    }

    const invocations = [];
    const harness = createRuntimeHarness({
        content,
        onInvoke: async (definition) => { invocations.push(definition.toolId); return { ok: true }; }
    });
    try {
        await harness.runtime.showFully();
        const createNode = findNode(harness.calls.at(-1).payload.tree.root, 'eve_bevy_ui_main_menu_tool_create');
        await createNode.on.activate();
        await settleTree();
        const placeholderNode = findNode(harness.calls.at(-1).payload.tree.root, createNodeId('create_placeholder'));
        assert.ok(placeholderNode, 'Placeholder is listed in Create');
        await placeholderNode.on.activate();
        await settleTree();
        assert.equal(harness.runtime.measure().activePaletteKey, 'create_placeholder',
            'its choices stay in place: the menu is not closed by the parent case');
        assert.deepEqual(invocations, [], 'and the parent case arms nothing by itself');
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }

    const dom = new JSDOM('<!doctype html><body></body>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const placeholderApi = async () => (await import('../../eVe/domains/rendering/placeholder_creation_runtime.js')).placeholderCreationRuntime;
    const runtime = await placeholderApi();
    try {
        const invocation = createMainMenuCreateInvocationRuntime({
            invokeToolFromUiButton: async () => ({ ok: true, active: true })
        });
        const result = await invocation.invoke({
            definition: normalizeToolEntry('placeholder_audio', content.placeholder_audio, content),
            sourceLayer: 'bevy_ui_main_menu'
        });
        assert.equal(result.active, true);
        assert.equal(runtime.isActive(), true, 'choosing a kind arms the placeholder tool');
        assert.equal(runtime.readChoice(), 'audio', 'through its own owner, with the chosen kind');
    } finally {
        runtime.setActive(false);
        dom.window.close();
    }
});

test('the Generator arms on a run, stays armed, and the next run moves the lit case', async () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const published = [];
    dom.window.addEventListener('eve:tool-state-changed', (event) => published.push(event.detail));
    const created = [];
    dom.window.eveToolBase = {
        createAtome: async (spec) => { created.push(spec); return { ok: true, id: `generated_${created.length}` }; }
    };
    try {
        assert.equal(generatorIsActive(), false);
        const first = await runGeneratorCase('text.title');
        assert.equal(first.ok, true);
        assert.equal(created.length, 1, 'the run still goes through `eveToolBase.createAtome`');
        assert.equal(generatorIsActive(), true, 'running a generator arms its tool');
        assert.equal(generatorReadChoice(), 'text.title', 'the lit case is the generator that ran');
        const second = await runGeneratorCase('text.paragraph');
        assert.equal(second.ok, true);
        assert.equal(generatorIsActive(), true, 'the tool stays armed: generators follow each other');
        assert.equal(generatorReadChoice(), 'text.paragraph');
        assert.deepEqual(published.map((detail) => [detail.active, detail.route]), [[true, 'generator_runtime']],
            'the armed state is published once, on the transition');
        assert.equal(setGeneratorActive(false), false);
        assert.equal(generatorIsActive(), false);
        assert.equal(published.at(-1).action, 'state.off', 'disarming publishes the neutral state');
    } finally {
        setGeneratorActive(false);
        dom.window.close();
    }
});
