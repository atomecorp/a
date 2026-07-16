import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLImageElement = window.HTMLImageElement;

const {
    clearFlowerContextHoldCandidate,
    clearFlowerContextLongPressActive,
    clearAllFlowerPointerLocks,
    getFlowerContextHoldCandidate,
    getFlowerContextLongPressActive,
    getFlowerPointerLock,
    scheduleFlowerPointerUnlock,
    setFlowerContextHoldCandidate,
    setFlowerContextLongPressActive,
    setFlowerPointerLock
} = await import('../../eVe/intuition/flower/context_pointer_lock.js');
const { setFlowerRuntime } = await import('../../eVe/intuition/ribbon/bevy_ui_product_registry.js');
const { closeFlowerMenu } = await import('../../eVe/intuition/flower/index.js');
const { installIntuitionXFlowerContextRuntime } = await import('../../eVe/intuition/flower/context.js');
const {
    isBlockedTarget,
    resolveContextFromTarget
} = await import('../../eVe/intuition/flower/context_target.js');
const {
    FLOWER_MIXED_SELECTION_TOOL_KEYS,
    resolveFlowerTransportSelectionIds,
    resolveFlowerSelectionMode
} = await import('../../eVe/intuition/flower/context_selection.js');
const {
    computeFlowerLayout,
    computeFlowerSubmenuLayout
} = await import('../../eVe/intuition/flower/menu_layout.js');
const {
    normalizeItem,
    withForcedAlpha
} = await import('../../eVe/intuition/flower/menu_items.js');
const { registerAtomeElement } = await import('../../eVe/core/atome_dom_id.js');
const {
    clearAllProjectScenes,
    renderProjectScene
} = await import('../../eVe/domains/rendering/project_scene_runtime.js');

const project = document.createElement('div');
project.id = 'project_view_alpha';
const group = document.createElement('div');
registerAtomeElement(group, {
    atome_id: 'group_alpha',
    kind: 'group'
});
const child = document.createElement('div');
registerAtomeElement(child, {
    atome_id: 'child_alpha',
    kind: 'shape'
});
group.appendChild(child);
project.appendChild(group);
document.body.appendChild(project);

document.elementsFromPoint = () => [group, child, project];

const context = await resolveContextFromTarget(group, {
    clientX: 42,
    clientY: 24,
    source: 'test'
});

assert.equal(context.type, 'atome');
assert.equal(context.atomeId, 'child_alpha');
assert.equal(context.kind, 'shape');
assert.equal(context.projectId, 'alpha');
assert.equal(context.x, 42);
assert.equal(context.y, 24);
assert.equal(context.source, 'test');

const setBox = (element, width, height) => {
    Object.defineProperty(element, 'clientWidth', {
        configurable: true,
        value: width
    });
    Object.defineProperty(element, 'clientHeight', {
        configurable: true,
        value: height
    });
    element.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height
    });
};

clearAllProjectScenes();
const projectSceneHost = document.createElement('div');
projectSceneHost.id = 'project_view_flower_canvas';
setBox(projectSceneHost, 300, 220);
document.body.appendChild(projectSceneHost);
await renderProjectScene({
    projectId: 'flower_canvas',
    host: projectSceneHost,
    compositor: {
        default: async () => {},
        run_atome_bevy_renderer: () => {}
    },
    records: [{
        id: 'canvas_shape_atom',
        type: 'shape',
        properties: {
            left: 20,
            top: 30,
            width: 80,
            height: 60
        }
    }]
});
const projectCanvas = document.getElementById('eve_surface_project');
document.elementsFromPoint = () => [projectCanvas, projectSceneHost];
const canvasContext = await resolveContextFromTarget(projectCanvas, {
    clientX: 30,
    clientY: 40,
    source: 'test'
});
assert.equal(canvasContext.type, 'atome');
assert.equal(canvasContext.atomeId, 'canvas_shape_atom');
assert.equal(canvasContext.kind, 'shape');
assert.equal(canvasContext.projectId, 'flower_canvas');

const mixedSelectionMode = resolveFlowerSelectionMode({
    context: {
        atomeId: 'shape_a',
        kind: 'shape'
    },
    selectedIds: ['shape_a', 'video_b'],
    kindForId: (id) => (id === 'shape_a' ? 'shape' : 'video')
});
assert.equal(mixedSelectionMode.useSelection, true);
assert.equal(mixedSelectionMode.mixedKinds, true);
assert.deepEqual(FLOWER_MIXED_SELECTION_TOOL_KEYS, ['info', 'play']);
assert.deepEqual(
    resolveFlowerTransportSelectionIds({
        atomeId: 'shape_a',
        selectionIds: mixedSelectionMode.activeIds
    }),
    ['shape_a', 'video_b']
);

const pointerOutsideSelectionMode = resolveFlowerSelectionMode({
    context: {
        atomeId: 'text_c',
        kind: 'text'
    },
    selectedIds: ['shape_a', 'video_b'],
    kindForId: (id) => (id === 'text_c' ? 'text' : 'shape')
});
assert.equal(pointerOutsideSelectionMode.useSelection, false);
assert.equal(pointerOutsideSelectionMode.mixedKinds, false);
assert.equal(pointerOutsideSelectionMode.kind, 'text');

const staleProjectSelectionMode = resolveFlowerSelectionMode({
    context: {
        type: 'project',
        projectId: 'flower_canvas'
    },
    selectedIds: ['missing_selection_atom'],
    kindForId: () => ''
});
assert.deepEqual(staleProjectSelectionMode.activeIds, []);
assert.equal(staleProjectSelectionMode.useSelection, false);
assert.equal(staleProjectSelectionMode.mixedKinds, false);
assert.equal(staleProjectSelectionMode.kind, '');

const audioWaveformSelectionMode = resolveFlowerSelectionMode({
    context: {
        atomeId: 'audio_atom',
        kind: 'audio_waveform'
    },
    selectedIds: ['audio_atom'],
    kindForId: () => 'audio_waveform'
});
assert.deepEqual(audioWaveformSelectionMode.activeIds, ['audio_atom']);
assert.equal(audioWaveformSelectionMode.kind, 'audio');

const panel = document.createElement('div');
panel.dataset.evePanel = 'true';
document.body.appendChild(panel);
assert.equal(isBlockedTarget(panel), true);
assert.equal(isBlockedTarget(child), false);

window.eveBevyUiRuntime = {
    hitTestAtClientPoint: ({ surface, clientX, clientY }) => (
        surface === projectCanvas && clientX === 30 && clientY === 40
            ? { treeId: 'eve_bevy_ui_main_menu', nodeId: 'eve_bevy_ui_main_menu_atome' }
            : null
    )
};
assert.equal(isBlockedTarget(projectCanvas, {
    clientX: 30,
    clientY: 40,
    type: 'pointerdown'
}), true);
assert.equal(isBlockedTarget(projectCanvas, {
    clientX: 140,
    clientY: 120,
    type: 'pointerdown'
}), false);
delete window.eveBevyUiRuntime;

window.eveAssistantApi = { getState: () => ({ active: true }) };
assert.equal(isBlockedTarget(projectCanvas, {
    clientX: 140,
    clientY: 120,
    type: 'pointerdown'
}), true);
window.eveAssistantApi = { getState: () => ({ active: false }) };
assert.equal(isBlockedTarget(projectCanvas, {
    clientX: 140,
    clientY: 120,
    type: 'pointerdown'
}), false);
delete window.eveAssistantApi;

assert.equal(setFlowerPointerLock(7, { phase: 'test' }), true);
assert.equal(getFlowerPointerLock(7).phase, 'test');
assert.equal(scheduleFlowerPointerUnlock(7, 0), true);
await delay(1);
assert.equal(getFlowerPointerLock(7), null);
clearAllFlowerPointerLocks();
assert.equal(setFlowerContextHoldCandidate(8, { contextType: 'atome', atomeId: 'shape_a' }), true);
assert.equal(getFlowerContextHoldCandidate().atomeId, 'shape_a');
assert.equal(clearFlowerContextHoldCandidate(8), true);
assert.equal(getFlowerContextHoldCandidate(), null);
assert.equal(setFlowerContextLongPressActive(9, { contextType: 'atome', atomeId: 'shape_b', kind: 'shape' }), true);
assert.equal(getFlowerContextLongPressActive().preserveSelection, true);
assert.equal(getFlowerContextLongPressActive().surfaceInteraction, true);
assert.equal(clearFlowerContextLongPressActive(9), true);
assert.equal(getFlowerContextLongPressActive(), null);
assert.equal(setFlowerPointerLock(11, { phase: 'contextmenu_hold' }), true);
assert.equal(setFlowerContextHoldCandidate(11, { contextType: 'atome', atomeId: 'shape_c' }), true);
assert.equal(setFlowerContextLongPressActive(11, { contextType: 'atome', atomeId: 'shape_c', kind: 'shape' }), true);
closeFlowerMenu();
assert.equal(getFlowerPointerLock(11), null);
assert.equal(getFlowerContextHoldCandidate(), null);
assert.equal(getFlowerContextLongPressActive(), null);

const flowerInteraction = { closeCount: 0, open: true, openCount: 0, button: null };
setFlowerRuntime({
    isOpen: () => flowerInteraction.open,
    close: async () => {
        flowerInteraction.closeCount += 1;
        flowerInteraction.open = false;
    },
    openAt: () => {
        flowerInteraction.openCount += 1;
        flowerInteraction.open = true;
    },
    resolveButtonFromPoint: () => flowerInteraction.button
});
const disposeFlowerContext = installIntuitionXFlowerContextRuntime({ longPressMs: 5 });
let downstreamFlowerPointerCancelCount = 0;
projectCanvas.addEventListener('pointercancel', () => {
    downstreamFlowerPointerCancelCount += 1;
});
const makeFlowerPointerEvent = (type, properties = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.entries({
        button: 0,
        pointerId: 71,
        pointerType: 'touch',
        isPrimary: true,
        clientX: 140,
        clientY: 120,
        ...properties
    }).forEach(([key, value]) => Object.defineProperty(event, key, { configurable: true, value }));
    return event;
};
const rightClickWhileOpen = makeFlowerPointerEvent('contextmenu', { button: 2, pointerType: 'mouse' });
projectCanvas.dispatchEvent(rightClickWhileOpen);
assert.equal(rightClickWhileOpen.defaultPrevented, true, 'a right-click must suppress the browser context menu while Flower is open');
assert.equal(flowerInteraction.closeCount, 1);
assert.equal(flowerInteraction.openCount, 0);

flowerInteraction.open = true;
flowerInteraction.button = { key: 'info', type: 'tool' };
projectCanvas.dispatchEvent(makeFlowerPointerEvent('pointerdown'));
await delay(10);
assert.equal(flowerInteraction.open, false, 'a second long press must close the open Flower menu');
assert.equal(flowerInteraction.closeCount, 2);
assert.equal(flowerInteraction.openCount, 0, 'closing an open Flower menu must not reopen it');

flowerInteraction.open = false;
flowerInteraction.button = null;
const longPressPointerId = 73;
projectCanvas.dispatchEvent(makeFlowerPointerEvent('pointerdown', {
    pointerId: longPressPointerId,
    pointerType: 'touch',
    clientX: 154,
    clientY: 126
}));
await delay(10);
assert.equal(flowerInteraction.open, true, 'an immobile long press must open Flower');
assert.equal(flowerInteraction.openCount, 1);
const longPressPointerCancel = makeFlowerPointerEvent('pointercancel', {
    pointerId: longPressPointerId,
    pointerType: 'touch',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(longPressPointerCancel);
assert.equal(longPressPointerCancel.defaultPrevented, true, 'the long-press pointercancel must be consumed before BevyUI');
assert.equal(downstreamFlowerPointerCancelCount, 0, 'the long-press pointercancel must not reach the Flower BevyUI cancel handler');
assert.equal(flowerInteraction.open, true, 'the long-press pointercancel must not close Flower');
const longPressContextMenu = makeFlowerPointerEvent('contextmenu', {
    button: 2,
    pointerId: longPressPointerId,
    pointerType: 'touch',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(longPressContextMenu);
assert.equal(longPressContextMenu.defaultPrevented, true, 'the native contextmenu derived from the long press must be consumed');
assert.equal(flowerInteraction.open, true, 'an immobile long press must keep Flower open after release');
assert.equal(flowerInteraction.closeCount, 2, 'the derived contextmenu must not close Flower');
assert.equal(flowerInteraction.button, null, 'an immobile long press must not select a Flower tool');
const longPressCompatibilityClick = makeFlowerPointerEvent('click', {
    pointerId: undefined,
    pointerType: 'mouse',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(longPressCompatibilityClick);
assert.equal(longPressCompatibilityClick.defaultPrevented, false, 'the terminal compatibility click is harmless once Flower owns the canvas target');
assert.equal(flowerInteraction.open, true, 'the terminal compatibility click must not close Flower');
const secondLongPressCompatibilityClick = makeFlowerPointerEvent('click', {
    pointerId: undefined,
    pointerType: 'mouse',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(secondLongPressCompatibilityClick);
assert.equal(secondLongPressCompatibilityClick.defaultPrevented, false, 'a second terminal compatibility click remains harmless');
assert.equal(flowerInteraction.open, true, 'a second terminal compatibility click must not close Flower');
const duplicateLongPressPointerDown = makeFlowerPointerEvent('pointerdown', {
    pointerId: undefined,
    pointerType: 'mouse',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(duplicateLongPressPointerDown);
assert.equal(duplicateLongPressPointerDown.defaultPrevented, true, 'a new primary pointerdown is handled by the normal Flower dismissal path');
assert.equal(flowerInteraction.open, false, 'a new primary pointerdown must close Flower even at the long-press release point');
assert.equal(flowerInteraction.closeCount, 3);

flowerInteraction.open = true;
projectCanvas.dispatchEvent(makeFlowerPointerEvent('pointerdown', {
    button: 2,
    pointerId: longPressPointerId,
    pointerType: 'mouse',
    clientX: 230,
    clientY: 160
}));
const laterRightClick = makeFlowerPointerEvent('contextmenu', {
    button: 2,
    pointerId: longPressPointerId,
    pointerType: 'mouse',
    clientX: 230,
    clientY: 160
});
projectCanvas.dispatchEvent(laterRightClick);
assert.equal(laterRightClick.defaultPrevented, true, 'a genuine right-click must still suppress the browser menu');
assert.equal(flowerInteraction.open, false, 'a genuine right-click after a long press must still close Flower');
assert.equal(flowerInteraction.closeCount, 4);

flowerInteraction.open = false;
const coordinateOnlyLongPressPointerId = 74;
projectCanvas.dispatchEvent(makeFlowerPointerEvent('pointerdown', {
    pointerId: coordinateOnlyLongPressPointerId,
    pointerType: 'touch',
    clientX: 178,
    clientY: 132
}));
await delay(10);
projectCanvas.dispatchEvent(makeFlowerPointerEvent('pointerup', {
    pointerId: coordinateOnlyLongPressPointerId,
    pointerType: 'touch',
    clientX: 178,
    clientY: 132
}));
const coordinateOnlyContextMenu = makeFlowerPointerEvent('contextmenu', {
    button: 2,
    pointerId: undefined,
    pointerType: 'touch',
    clientX: 178,
    clientY: 132
});
projectCanvas.dispatchEvent(coordinateOnlyContextMenu);
assert.equal(coordinateOnlyContextMenu.defaultPrevented, true, 'a pointerless derived contextmenu must match its release point');
assert.equal(flowerInteraction.open, true, 'a pointerless derived contextmenu must leave Flower open');
projectCanvas.dispatchEvent(makeFlowerPointerEvent('pointerdown', {
    pointerId: coordinateOnlyLongPressPointerId,
    pointerType: 'touch',
    clientX: 260,
    clientY: 176
}));
assert.equal(flowerInteraction.open, false, 'a later outside tap must retain the normal Flower-close behaviour');
assert.equal(flowerInteraction.closeCount, 5);
disposeFlowerContext();
setFlowerRuntime(null);

const item = normalizeItem({
    key: 'import',
    type: 'palette',
    icon: 'folder',
    children: ['media']
});
assert.equal(item.type, 'palette');
assert.equal(item.icon.endsWith('/folder.svg'), true);
assert.equal(item.children[0].key, 'media');
assert.equal(withForcedAlpha('rgb(10, 20, 30)', 0.5), 'rgba(10, 20, 30, 0.5)');

const layout = computeFlowerLayout({ count: 3, radius: 100 });
assert.equal(layout.positions.length, 3);
assert.deepEqual(
    layout.positions.map((position) => Number.isFinite(position.tx) && Number.isFinite(position.ty)),
    [true, true, true]
);

const submenu = computeFlowerSubmenuLayout({ childCount: 4, radius: 80 });
assert.equal(submenu.childPositions.length, 4);
assert.equal(Number.isFinite(submenu.backPosition.tx), true);

const flowerContextItemsSource = await readFile(new URL('../../eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js', import.meta.url), 'utf8');
const performSource = await readFile(new URL('../../eVe/intuition/tools/perform.js', import.meta.url), 'utf8');
const flowerRuntimeSource = await readFile(new URL('../../eVe/intuition/ribbon/bevy_ui_flower_runtime.js', import.meta.url), 'utf8');
const flowerModelSource = await readFile(new URL('../../eVe/intuition/ribbon/bevy_ui_flower_model.js', import.meta.url), 'utf8');
const { buildBevyUiFlowerTree } = await import('../../eVe/intuition/ribbon/bevy_ui_flower_model.js');
const {
    FLOWER_PHASE,
    flowerLiquidProcedural,
    flowerMotionTargets,
    sampleFlowerMotion
} = await import('../../eVe/intuition/ribbon/bevy_ui_flower_motion.js');
const { RIBBON_TOKENS } = await import('../../eVe/intuition/ribbon/tokens.js');
const flowerStyleTree = buildBevyUiFlowerTree({
    surface: projectCanvas,
    items: [
        { key: 'palette', type: 'palette' },
        { key: 'action', type: 'tool' }
    ]
});
const flowerPaletteNode = flowerStyleTree.root.children.find((node) => node.id.includes('_palette_'));
const flowerActionNode = flowerStyleTree.root.children.find((node) => node.id.includes('_action_'));
const flowerLiquidNode = flowerStyleTree.root.children.find((node) => node.id.endsWith('_liquid'));
assert.equal(flowerPaletteNode.style.radius, 3, 'Flower palettes must use the compact palette radius');
assert.equal(flowerActionNode.style.radius, 29, 'Flower action tools must be circular');
assert.deepEqual(flowerPaletteNode.style.shadow, {
    color: [0, 0, 0, 0.38], blur: 14, spread: 1, offset: [0, 5]
}, 'Flower tool shadows must come from the centralized token');
assert.deepEqual(flowerPaletteNode.style.backdrop, {
    blurPx: RIBBON_TOKENS.flowerToolBackdropBlurPx,
    tint: RIBBON_TOKENS.flowerPaletteGlassTint
}, 'Flower palettes must carry the centralized glass blur contract');
assert.equal(flowerLiquidNode.overlayRecord.properties.material.procedural.mode, 1, 'Flower must mount one shared liquid SDF record');
const motionCenter = { x: 320, y: 240 };
const motionTree = buildBevyUiFlowerTree({
    surface: projectCanvas,
    center: motionCenter,
    items: Array.from({ length: 6 }, (_, index) => ({ key: `motion_${index}`, type: 'tool' }))
});
const motionTargets = flowerMotionTargets({ tree: motionTree, center: motionCenter });
const openingMiddle = sampleFlowerMotion({ phase: FLOWER_PHASE.opening, elapsedMs: 104, targets: motionTargets });
const openingEnd = sampleFlowerMotion({
    phase: FLOWER_PHASE.opening,
    elapsedMs: RIBBON_TOKENS.flowerMotion.openDurationMs,
    targets: motionTargets
});
motionTargets.forEach((target) => {
    const frame = openingEnd.frames.get(target.nodeId);
    assert.deepEqual(frame.position, target.finalPosition, 'Flower motion must settle on canonical radial geometry');
    assert.deepEqual(frame.scale, [1, 1], 'Flower motion must remove stretch after settling');
});
const interruptedClose = sampleFlowerMotion({
    phase: FLOWER_PHASE.closing,
    elapsedMs: 0,
    targets: motionTargets,
    fromFrames: openingMiddle.frames
});
motionTargets.forEach((target) => {
    assert.deepEqual(
        interruptedClose.frames.get(target.nodeId).position,
        openingMiddle.frames.get(target.nodeId).position,
        'closing must continue from the current opening frame without a jump'
    );
});
const earlyLiquid = flowerLiquidProcedural({
    sample: sampleFlowerMotion({ phase: FLOWER_PHASE.opening, elapsedMs: 35, targets: motionTargets }),
    targets: motionTargets,
    center: motionCenter,
    surfaceSize: [640, 480]
});
const settledLiquid = flowerLiquidProcedural({
    sample: openingEnd,
    targets: motionTargets,
    center: motionCenter,
    surfaceSize: [640, 480]
});
assert.ok(earlyLiquid.flower_petals.some((petal) => petal[3] > 0), 'near-center petals must receive a temporary goo bridge');
assert.equal(settledLiquid.flower_petals.every((petal) => petal[3] === 0), true, 'settled petals must leave no residual bridge');
assert.ok(
    flowerContextItemsSource.includes("type === 'project' && !hasAtomeTarget")
        && flowerContextItemsSource.includes('selectedIds: contextSelectionIds')
        && flowerContextItemsSource.includes('selectionIds,')
        && flowerContextItemsSource.includes('resolveFlowerTransportSelectionIds'),
    'flower context must preserve project-only selection hygiene and pass multi-selection ids into transport tools'
);
assert.ok(
    flowerModelSource.includes("BEVY_FLOWER_TREE_ID = 'eve_bevy_ui_flower'")
        && flowerRuntimeSource.includes("source: 'bevy_flower_hold_release'")
        && flowerRuntimeSource.includes('capturePointerSession'),
    'Flower activation must use the Bevy tree and captured pointer session'
);
assert.ok(
    performSource.includes('PERFORM_FLOWER_EXIT_EVENT')
        && performSource.includes("from './perform_state.js';")
        && performSource.includes('const bindPerformFlowerExitEvent = () => {')
        && performSource.includes("runPerformToolAction({ action: 'state.off', event: 'inactive' });")
        && performSource.includes('bindPerformFlowerExitEvent();'),
    'perform runtime must own the flower exit event and force state.off'
);
assert.ok(
    performSource.includes('const isPerformModeMarkedActive = () => {')
        && performSource.includes("document.body?.classList?.contains(PERFORM_CLASS)")
        && performSource.includes('if (!isPerformModeMarkedActive()) return;')
        && performSource.includes("setElementVisible(menuEl, { preservePrevDisplay: false })"),
    'perform deactivation must honor visible runtime state and restore hidden menu layers'
);
