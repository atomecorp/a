import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createProjectLayerRuntime } from '../../eVe/core/atome_events/project_layer_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createMainMenuCreateContent } from '../../eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js';
import { createContextToolInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/context_tool_invocation_runtime.js';
import { normalizeToolEntry } from '../../eVe/intuition/ribbon/menu_model.js';
import { resolvePageFrame } from '../../eVe/domains/rendering/project_view_creation_geometry.js';
import { resolveVisualSourcePoint } from '../../eVe/domains/rendering/project_view_visual_geometry.js';
import { createProjectViewVisualInteractionRuntime } from '../../eVe/domains/rendering/project_view_visual_interaction_runtime.js';
import { createProjectViewCreateDraftRuntime } from '../../eVe/domains/rendering/project_view_create_draft_runtime.js';
import { recordPreviewNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_record_preview.js';
import { createProjectViewVisualPanel } from '../../eVe/domains/rendering/project_view_visual_panel.js';
import { centeredEditorGeometry } from '../../eVe/intuition/tools/code_editor_geometry.js';
import { buildBootstrapDefsA } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js';
import { buildBootstrapDefsB } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js';
import { hasDrawTravelled } from '../../eVe/intuition/tools/core/svg_draw_model.js';
import { buildBevyMainMenuTree } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
const previousElement = globalThis.Element;
const previousHTMLElement = globalThis.HTMLElement;
const previousNode = globalThis.Node;
const previousLocalStorage = globalThis.localStorage;

afterEach(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.Element = previousElement;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.Node = previousNode;
    globalThis.localStorage = previousLocalStorage;
    setMainMenuRuntime(null);
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
    assert.deepEqual(invocations.slice(0, 4), [
        ['tool.main.draw', 'state.off'],
        ['ui.code.editor', 'state.off'],
        ['ui.page.create', 'state.off'],
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

test('the latched Create state changes the real WebGPU tool background and restores it when off', () => {
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
            activePaletteKey: 'create',
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
    const id = 'eve_bevy_ui_main_menu_tool_create__text_create_background';
    const inactive = find(treeFor(false).root, id)?.style?.background;
    const active = find(treeFor(true).root, id)?.style?.background;
    assert.ok(inactive);
    assert.ok(active);
    assert.notDeepEqual(active, inactive);
    assert.deepEqual(find(treeFor(false).root, id).style.background, inactive);
    assert.deepEqual(find(treeFor(true).root, id.replace(/_background$/, '')).style.background, active);
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
        isFlowerPointerLocked: () => false,
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

test('Page is a latch and resolves a canonical frame regardless of drag direction', () => {
    const identity = (definition) => definition;
    const definitions = buildBootstrapDefsA(identity, identity, 'calendar', 'registered');
    const page = definitions.find((entry) => entry.tool_id === 'ui.page.create');
    assert.equal(page.behavior.button_type, 'latch');
    assert.deepEqual(resolvePageFrame({ x: 80, y: 65 }, { x: 20, y: 15 }), {
        left: 20, top: 15, width: 60, height: 50
    });
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
    let parasiteCreates = 0;
    globalThis.window = {
        __eveTextTool: { isActive: () => true },
        eveProjectViewCreationApi: { createTextAtPoint: () => { parasiteCreates += 1; } }
    };
    const runtime = createProjectViewVisualInteractionRuntime({
        emitIntent: async ({ intent }) => { intents.push(intent); return { ok: true }; }
    });
    const record = {
        id: 'text_inline', atome_id: 'text_inline', type: 'text', project_id: 'project_inline',
        properties: { text: 'Inline', left: 40, top: 30, width: 160, height: 40 }
    };
    await runtime.press({ event: { x: 2, y: 2 }, record, width: 400, height: 180 });
    await runtime.release({ event: { x: 2, y: 2 } });
    await runtime.doubleClick({ event: { x: 2, y: 2 }, record, width: 400, height: 180 });

    assert.equal(parasiteCreates, 0);
    assert.deepEqual(intents.slice(-3).map((intent) => intent.kind), [
        'select', 'atome.edit.enter', 'text.edit.begin'
    ]);
    assert.equal(intents.at(-2).atome_id, 'text_inline');
    assert.equal(intents.at(-2).rail_only, true);
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
    assert.equal(typeof interactive.on.press, 'function');
    assert.equal(interactive.children[0].children.some((child) => child.id === 'interactive_visual_caret'), true);
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
