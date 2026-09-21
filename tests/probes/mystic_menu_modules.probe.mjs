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
    clearMysticContextHoldCandidate,
    clearMysticContextLongPressActive,
    clearAllMysticPointerLocks,
    getMysticContextHoldCandidate,
    getMysticContextLongPressActive,
    getMysticPointerLock,
    scheduleMysticPointerUnlock,
    setMysticContextHoldCandidate,
    setMysticContextLongPressActive,
    setMysticPointerLock
} = await import('../../eVe/intuition/mystic/context_pointer_lock.js');
const { setMysticRuntime } = await import('../../eVe/intuition/ribbon/bevy_ui_product_registry.js');
const { closeMysticMenu } = await import('../../eVe/intuition/mystic/index.js');
const { installIntuitionXMysticContextRuntime } = await import('../../eVe/intuition/mystic/context.js');
const {
    isBlockedTarget,
    resolveContextFromTarget
} = await import('../../eVe/intuition/mystic/context_target.js');
const {
    resolveMysticTransportSelectionIds,
    resolveMysticSelectionMode
} = await import('../../eVe/intuition/mystic/context_selection.js');
const { createMysticContextItemsRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/mystic_context_items_runtime.js');
const { executeBootstrapDuplicateOperation } = await import('../../eVe/intuition/tools/core/tool_runtime_atome_mutation.js');

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
projectSceneHost.id = 'project_view_mystic_canvas';
setBox(projectSceneHost, 300, 220);
document.body.appendChild(projectSceneHost);
await renderProjectScene({
    projectId: 'mystic_canvas',
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
assert.equal(canvasContext.projectId, 'mystic_canvas');

const mixedSelectionMode = resolveMysticSelectionMode({
    context: {
        atomeId: 'shape_a',
        kind: 'shape'
    },
    selectedIds: ['shape_a', 'video_b'],
    kindForId: (id) => (id === 'shape_a' ? 'shape' : 'video')
});
assert.equal(mixedSelectionMode.useSelection, true);
assert.equal(mixedSelectionMode.mixedKinds, true);
assert.deepEqual(
    resolveMysticTransportSelectionIds({
        atomeId: 'shape_a',
        selectionIds: mixedSelectionMode.activeIds
    }),
    ['shape_a', 'video_b']
);

const pointerOutsideSelectionMode = resolveMysticSelectionMode({
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

const staleProjectSelectionMode = resolveMysticSelectionMode({
    context: {
        type: 'project',
        projectId: 'mystic_canvas'
    },
    selectedIds: ['missing_selection_atom'],
    kindForId: () => ''
});
assert.deepEqual(staleProjectSelectionMode.activeIds, []);
assert.equal(staleProjectSelectionMode.useSelection, false);
assert.equal(staleProjectSelectionMode.mixedKinds, false);
assert.equal(staleProjectSelectionMode.kind, '');

const audioWaveformSelectionMode = resolveMysticSelectionMode({
    context: {
        atomeId: 'audio_atom',
        kind: 'audio_waveform'
    },
    selectedIds: ['audio_atom'],
    kindForId: () => 'audio_waveform'
});
assert.deepEqual(audioWaveformSelectionMode.activeIds, ['audio_atom']);
assert.equal(audioWaveformSelectionMode.kind, 'audio');

const { CONTEXT_MENUS } = await import('../../eVe/intuition/menu/context_menus_loader.js');
const catalog = Object.fromEntries(Object.keys(CONTEXT_MENUS.commands).map(key=>[key,{icon:key,tool_id:'ui.'+key}]));
catalog.communicate.type = 'palette';
catalog.capture.type = 'palette';
catalog.capture.children = ['info'];
const surfaceItemsRuntime = createMysticContextItemsRuntime({
    applyDeleteSelection: async () => ({ ok: true }),
    cloneToolExtraInput: (value) => value,
    getAtomeElement: () => null,
    getAtomeKindFromElement: () => '',
    getDefaultContent: () => catalog,
    hasProjectAutomationForAtomeSync: () => false,
    invokeProjectMediaImport: async () => ({ ok: true }),
    invokeUnifiedContextTool: async () => ({ ok: true }),
    isWorkspaceActive: () => true,
    normalizeMainToolKey: (key) => String(key || '').trim(),
    readSelectionSnapshot: () => ({ selectedIds: [] }),
    resolveCanonicalMainToolId: (_toolId, key) => `ui.${key}`,
    resolveMainToolKeyFromToolId: (toolId) => String(toolId || '').replace(/^ui\./, ''),
    translate: (_key, fallback) => fallback,
    triggerMainToolInteraction: async () => ({ ok: true })
});
const classifiedItems = surfaceItemsRuntime.resolveMysticContextItems({ type: 'surface_item', atomeId: 'surface_project_a' });
assert.equal(classifiedItems.find(item => item.key === 'communicate').type, 'tool');
assert.equal(classifiedItems.find(item => item.key === 'communicate').hoverActivate, true);
assert.equal(classifiedItems.find(item => item.key === 'capture').type, 'palette');
assert.deepEqual(
    surfaceItemsRuntime.resolveMysticContextItems({
        type: 'surface_item',
        atomeId: 'surface_project_a',
        onRename: () => ({ ok: true })
    }).map((item) => item.key),
    ['ai', 'find', 'capture', 'dashboard', 'communicate', 'rename', 'duplicate', 'copy', 'paste', 'delete', 'info'],
    'Dashboard cards, List rows, and Matrix cells must share the complete surface-item Mystic menu'
);
let dashboardProjectDeleteCount = 0;
const dashboardProjectActionCounts = { duplicate: 0, copy: 0, paste: 0 };
const previousPublishAtomeSelection = window.eveToolBase?.publishAtomeSelection;
window.eveToolBase = {
    ...(window.eveToolBase || {}),
    publishAtomeSelection: () => 'surface_project_a'
};
const dashboardProjectDelete = surfaceItemsRuntime.resolveMysticContextItems({
    type: 'surface_item',
    atomeId: 'surface_project_a',
    onDelete: async () => {
        dashboardProjectDeleteCount += 1;
        return { ok: true, owner: 'project' };
    }
}).find((item) => item.key === 'delete');
assert.deepEqual(await dashboardProjectDelete.onSelect({}), { ok: true, owner: 'project' });
assert.equal(dashboardProjectDeleteCount, 1, 'Dashboard project Delete must use the context project owner, not generic Atome deletion');
for (const key of ['duplicate', 'copy', 'paste']) {
    const item = surfaceItemsRuntime.resolveMysticContextItems({
        type: 'surface_item',
        atomeId: 'surface_project_a',
        [key === 'duplicate' ? 'onDuplicate' : (key === 'copy' ? 'onCopy' : 'onPaste')]: async () => {
            dashboardProjectActionCounts[key] += 1;
            return { ok: true, owner: 'project', action: key };
        }
    }).find((entry) => entry.key === key);
    assert.deepEqual(await item.onSelect({}), { ok: true, owner: 'project', action: key });
}
assert.deepEqual(dashboardProjectActionCounts, { duplicate: 1, copy: 1, paste: 1 }, 'surface actions must delegate to their supplied canonical owner');

const duplicateCommits = [];
window.Atome = {
    getStateCurrent: async () => {
        throw new Error('Copy/Paste must duplicate the supplied snapshot, not reread live source state');
    },
    commitBatch: async (events) => {
        duplicateCommits.push(...events);
        return { ok: true };
    }
};
const snapshotDuplicate = await executeBootstrapDuplicateOperation({
    selection_ids: ['copied_parent', 'copied_child'],
    source_states: [{
        id: 'copied_parent', type: 'group', project_id: 'source_project', parent_id: 'source_project',
        properties: { left: 30, top: 40, children: ['copied_child'] }
    }, {
        id: 'copied_child', type: 'shape', project_id: 'source_project', parent_id: 'copied_parent',
        properties: { left: 50, top: 70 }
    }],
    project_id: 'pasted_project',
    placement_mode: 'preserve_relative',
    left: 0,
    top: 0
}, { mergeStack: () => ({}) });
assert.equal(snapshotDuplicate.ok, true);
assert.equal(duplicateCommits.length, 2);
const pastedParent = duplicateCommits.find((event) => event.type === 'group');
const pastedChild = duplicateCommits.find((event) => event.type === 'shape');
assert.equal(pastedParent.project_id, 'pasted_project');
assert.equal(pastedParent.parent_id, 'pasted_project');
assert.equal(pastedChild.parent_id, pastedParent.atome_id, 'internal parent relations must be remapped');
assert.deepEqual(pastedParent.props.children, [pastedChild.atome_id], 'internal structural relations must be remapped');
if (previousPublishAtomeSelection === undefined) delete window.eveToolBase.publishAtomeSelection;
else window.eveToolBase.publishAtomeSelection = previousPublishAtomeSelection;

window.Atome.getStateCurrent = async id => ({ id, properties: {}, capabilities: { write: true, delete: true, create: true } });

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

assert.equal(setMysticPointerLock(7, { phase: 'test' }), true);
assert.equal(getMysticPointerLock(7).phase, 'test');
assert.equal(scheduleMysticPointerUnlock(7, 0), true);
await delay(1);
assert.equal(getMysticPointerLock(7), null);
clearAllMysticPointerLocks();
assert.equal(setMysticContextHoldCandidate(8, { contextType: 'atome', atomeId: 'shape_a' }), true);
assert.equal(getMysticContextHoldCandidate().atomeId, 'shape_a');
assert.equal(clearMysticContextHoldCandidate(8), true);
assert.equal(getMysticContextHoldCandidate(), null);
assert.equal(setMysticContextLongPressActive(9, { contextType: 'atome', atomeId: 'shape_b', kind: 'shape' }), true);
assert.equal(getMysticContextLongPressActive().preserveSelection, true);
assert.equal(getMysticContextLongPressActive().surfaceInteraction, true);
assert.equal(clearMysticContextLongPressActive(9), true);
assert.equal(getMysticContextLongPressActive(), null);
assert.equal(setMysticPointerLock(11, { phase: 'contextmenu_hold' }), true);
assert.equal(setMysticContextHoldCandidate(11, { contextType: 'atome', atomeId: 'shape_c' }), true);
assert.equal(setMysticContextLongPressActive(11, { contextType: 'atome', atomeId: 'shape_c', kind: 'shape' }), true);
closeMysticMenu();
assert.equal(getMysticPointerLock(11), null);
assert.equal(getMysticContextHoldCandidate(), null);
assert.equal(getMysticContextLongPressActive(), null);

const mysticInteraction = { closeCount: 0, open: true, openCount: 0, activationCount: 0, button: null };
setMysticRuntime({
    isOpen: () => mysticInteraction.open,
    close: async () => {
        mysticInteraction.closeCount += 1;
        mysticInteraction.open = false;
    },
    openAt: () => {
        mysticInteraction.openCount += 1;
        mysticInteraction.open = true;
    },
    updateHover: () => mysticInteraction.button,
    releaseAt: ({ allowActivation }) => { if (allowActivation && mysticInteraction.button) mysticInteraction.activationCount += 1; },
    resolveButtonFromPoint: () => mysticInteraction.button
});
const disposeMysticContext = installIntuitionXMysticContextRuntime({ longPressMs: 5 });
let downstreamMysticPointerCancelCount = 0;
let downstreamMysticPointerUpCount = 0;
projectCanvas.addEventListener('pointercancel', () => {
    downstreamMysticPointerCancelCount += 1;
});
projectCanvas.addEventListener('pointerup', () => {
    downstreamMysticPointerUpCount += 1;
});
const makeMysticPointerEvent = (type, properties = {}) => {
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
window.eveDashboardBevyUiRuntime = {
    readMysticTargetAtPoint: ({ clientX, clientY }) => (
        clientX === 140 && clientY === 120 ? { kind: 'item', atomeId: 'dashboard_project_a' } : null
    )
};
mysticInteraction.open = false;
const dashboardRightClick = makeMysticPointerEvent('contextmenu', { button: 2, pointerType: 'mouse' });
projectCanvas.dispatchEvent(dashboardRightClick);
assert.equal(dashboardRightClick.defaultPrevented, true, 'Dashboard secondary click must still suppress the browser menu');
await delay(1);
assert.equal(mysticInteraction.open, true, 'Dashboard secondary click must open Mystic');
assert.equal(mysticInteraction.openCount, 1, 'Dashboard secondary click must open Mystic exactly once');
mysticInteraction.open = false;
const dashboardLongPress = makeMysticPointerEvent('pointerdown', { pointerId: 72, pointerType: 'touch' });
projectCanvas.addEventListener('pointerdown', (event) => event.preventDefault(), { once: true });
projectCanvas.dispatchEvent(dashboardLongPress);
assert.equal(dashboardLongPress.defaultPrevented, true, 'Dashboard BevyUI must be represented as the pointerdown owner');
await delay(10);
assert.equal(mysticInteraction.open, true, 'Dashboard card long press must open Mystic');
assert.equal(mysticInteraction.openCount, 2, 'Dashboard card long press must open Mystic exactly once');
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', { pointerId: 72, pointerType: 'touch' }));
delete window.eveDashboardBevyUiRuntime;
mysticInteraction.closeCount = 0;
mysticInteraction.openCount = 0;
mysticInteraction.open = true;
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { button: 2, pointerType: 'mouse' }));
const rightClickWhileOpen = makeMysticPointerEvent('contextmenu', { button: 2, pointerType: 'mouse' });
projectCanvas.dispatchEvent(rightClickWhileOpen);
assert.equal(rightClickWhileOpen.defaultPrevented, true, 'a right-click must suppress the browser context menu while Mystic is open');
assert.equal(mysticInteraction.closeCount, 1);
assert.equal(mysticInteraction.openCount, 0);

mysticInteraction.open = true;
mysticInteraction.button = { key: 'info', type: 'tool' };
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown'));
await delay(10);
assert.equal(mysticInteraction.open, false, 'a second long press must close the open Mystic menu');
assert.equal(mysticInteraction.closeCount, 2);
assert.equal(mysticInteraction.openCount, 0, 'closing an open Mystic menu must not reopen it');

mysticInteraction.open = false;
mysticInteraction.button = null;
projectCanvas.addEventListener('pointerdown', (event) => event.preventDefault(), { once: true });
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', {
    pointerId: 72,
    pointerType: 'touch',
    clientX: 148,
    clientY: 124
}));
await delay(10);
assert.equal(mysticInteraction.open, false, 'a BevyUI-consumed pointerdown must cancel the pending Mystic long press');
assert.equal(mysticInteraction.openCount, 0, 'a panel-owned gesture must never open Mystic behind it');

const longPressPointerId = 73;
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', {
    pointerId: longPressPointerId,
    pointerType: 'touch',
    clientX: 154,
    clientY: 126
}));
await delay(10);
assert.equal(mysticInteraction.open, true, 'an immobile long press must open Mystic');
assert.equal(mysticInteraction.openCount, 1);
const longPressPointerCancel = makeMysticPointerEvent('pointercancel', {
    pointerId: longPressPointerId,
    pointerType: 'touch',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(longPressPointerCancel);
assert.equal(longPressPointerCancel.defaultPrevented, true, 'the long-press pointercancel must be consumed before BevyUI');
assert.equal(downstreamMysticPointerCancelCount, 0, 'the long-press pointercancel must not reach the Mystic BevyUI cancel handler');
assert.equal(mysticInteraction.open, true, 'the long-press pointercancel must not close Mystic');
const longPressContextMenu = makeMysticPointerEvent('contextmenu', {
    button: 2,
    pointerId: longPressPointerId,
    pointerType: 'touch',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(longPressContextMenu);
assert.equal(longPressContextMenu.defaultPrevented, true, 'the native contextmenu derived from the long press must be consumed');
assert.equal(mysticInteraction.open, true, 'an immobile long press must keep Mystic open after release');
assert.equal(mysticInteraction.closeCount, 2, 'the derived contextmenu must not close Mystic');
assert.equal(mysticInteraction.button, null, 'an immobile long press must not select a Mystic tool');

const longPressCompatibilityClick = makeMysticPointerEvent('click', {
    pointerId: undefined,
    pointerType: 'mouse',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(longPressCompatibilityClick);
assert.equal(longPressCompatibilityClick.defaultPrevented, false, 'the terminal compatibility click is harmless once Mystic owns the canvas target');
assert.equal(mysticInteraction.open, true, 'the terminal compatibility click must not close Mystic');
const secondLongPressCompatibilityClick = makeMysticPointerEvent('click', {
    pointerId: undefined,
    pointerType: 'mouse',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(secondLongPressCompatibilityClick);
assert.equal(secondLongPressCompatibilityClick.defaultPrevented, false, 'a second terminal compatibility click remains harmless');
assert.equal(mysticInteraction.open, true, 'a second terminal compatibility click must not close Mystic');
const duplicateLongPressPointerDown = makeMysticPointerEvent('pointerdown', {
    pointerId: undefined,
    pointerType: 'mouse',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(duplicateLongPressPointerDown);
assert.equal(duplicateLongPressPointerDown.defaultPrevented, true, 'a new primary pointerdown is handled by the normal Mystic dismissal path');
assert.equal(mysticInteraction.open, false, 'a new primary pointerdown must close Mystic even at the long-press release point');
assert.equal(mysticInteraction.closeCount, 3);

mysticInteraction.open = true;
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', {
    button: 2,
    pointerId: longPressPointerId,
    pointerType: 'mouse',
    clientX: 230,
    clientY: 160
}));
const laterRightClick = makeMysticPointerEvent('contextmenu', {
    button: 2,
    pointerId: longPressPointerId,
    pointerType: 'mouse',
    clientX: 230,
    clientY: 160
});
projectCanvas.dispatchEvent(laterRightClick);
assert.equal(laterRightClick.defaultPrevented, true, 'a genuine right-click must still suppress the browser menu');
assert.equal(mysticInteraction.open, false, 'a genuine right-click after a long press must still close Mystic');
assert.equal(mysticInteraction.closeCount, 4);

mysticInteraction.open = false;
const coordinateOnlyLongPressPointerId = 74;
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', {
    pointerId: coordinateOnlyLongPressPointerId,
    pointerType: 'touch',
    clientX: 178,
    clientY: 132
}));
await delay(10);
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', {
    pointerId: coordinateOnlyLongPressPointerId,
    pointerType: 'touch',
    clientX: 178,
    clientY: 132
}));
const coordinateOnlyContextMenu = makeMysticPointerEvent('contextmenu', {
    button: 2,
    pointerId: undefined,
    pointerType: 'touch',
    clientX: 178,
    clientY: 132
});
projectCanvas.dispatchEvent(coordinateOnlyContextMenu);
assert.equal(coordinateOnlyContextMenu.defaultPrevented, true, 'a pointerless derived contextmenu must match its release point');
assert.equal(mysticInteraction.open, true, 'a pointerless derived contextmenu must leave Mystic open');
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', {
    pointerId: coordinateOnlyLongPressPointerId,
    pointerType: 'touch',
    clientX: 260,
    clientY: 176
}));
assert.equal(mysticInteraction.open, false, 'a later outside tap must retain the normal Mystic-close behaviour');
assert.equal(mysticInteraction.closeCount, 5);

const radialSelectionPointerId = 75;
const pointerUpCountBeforeRadialSelection = downstreamMysticPointerUpCount;
mysticInteraction.button = { key: 'audio', type: 'tool' };
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', {
    pointerId: radialSelectionPointerId,
    pointerType: 'touch',
    clientX: 154,
    clientY: 126
}));
await delay(10);
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointermove', {
    pointerId: radialSelectionPointerId,
    pointerType: 'touch',
    clientX: 254,
    clientY: 126
}));
const radialSelectionRelease = makeMysticPointerEvent('pointerup', {
    pointerId: radialSelectionPointerId,
    pointerType: 'touch',
    clientX: 254,
    clientY: 126
});
projectCanvas.dispatchEvent(radialSelectionRelease);
assert.equal(radialSelectionRelease.defaultPrevented, true, 'a radial Mystic selection must consume its terminal release');
assert.equal(mysticInteraction.activationCount, 1, 'a radial Mystic selection must activate exactly once');
assert.equal(downstreamMysticPointerUpCount, pointerUpCountBeforeRadialSelection, 'the Bevy route must not receive the same terminal release');
mysticInteraction.open = false;
const delayedReads = [];
window.Atome.getStateCurrent = id => new Promise(resolve => delayedReads.push(() => resolve({ id, capabilities: { write: true, create: true, delete: true } })));
const beforeDelayedOpening = mysticInteraction.openCount;
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { pointerId: 76, pointerType: 'touch', clientX: 154, clientY: 126 }));
await delay(10);
assert.ok(delayedReads.length > 0, 'opening must await canonical access');
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', { pointerId: 76, pointerType: 'touch', clientX: 154, clientY: 126 }));
delayedReads.forEach(resolve => resolve());
await delay(1);
assert.equal(mysticInteraction.openCount, beforeDelayedOpening, 'a released initial gesture cannot open a delayed held menu');
disposeMysticContext();
setMysticRuntime(null);

console.log('Mystic context routing and captured pointer contracts passed.');
dom.window.close();
