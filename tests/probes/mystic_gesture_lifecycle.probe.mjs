import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="project_view_alpha"><canvas id="eve_surface_project"></canvas></div>');
const { window } = dom;
Object.assign(globalThis, { window, document: window.document, Element: window.Element, HTMLElement: window.HTMLElement, HTMLImageElement: window.HTMLImageElement });
const projectCanvas = document.getElementById('eve_surface_project');
document.elementsFromPoint = () => [projectCanvas];
window.Atome = { getStateCurrent: async id => ({ id, properties: {}, capabilities: { write: true, create: true, delete: true } }) };
const { installIntuitionXMysticContextRuntime } = await import('../../eVe/intuition/mystic/context.js');
const { closeMysticMenu } = await import('../../eVe/intuition/mystic/index.js');
const { setMysticRuntime } = await import('../../eVe/intuition/ribbon/bevy_ui_product_registry.js');
const { getMysticPointerLock } = await import('../../eVe/intuition/mystic/context_pointer_lock.js');
const mysticInteraction = { closeCount: 0, open: true, openCount: 0, activationCount: 0, button: null };
setMysticRuntime({
    isOpen: () => mysticInteraction.open,
    close: async () => {
        mysticInteraction.closeCount += 1;
        mysticInteraction.open = false;
    },
    openAt: (options) => {
        mysticInteraction.holding = options.holding;
        mysticInteraction.context = options.context;
        mysticInteraction.openCount += 1;
        mysticInteraction.open = true;
    },
    updateHover: (options) => { mysticInteraction.hoverActivation = options.allowActivation; return mysticInteraction.button; },
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
assert.equal(mysticInteraction.open, true, 'a new press inside an open menu must not arm another opening timer');
closeMysticMenu();
assert.equal(mysticInteraction.closeCount, 2);
assert.equal(mysticInteraction.openCount, 0, 'closing an open Mystic menu must not reopen it');

mysticInteraction.open = false;
mysticInteraction.button = null;
projectCanvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    window.eveBevyUiRuntime = { hitTestAtClientPoint: () => ({ nodeId: 'panel_input' }) };
}, { once: true });
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', {
    pointerId: 72,
    pointerType: 'touch',
    clientX: 148,
    clientY: 124
}));
await delay(10);
assert.equal(mysticInteraction.open, false, 'a BevyUI-consumed pointerdown must cancel the pending Mystic long press');
assert.equal(mysticInteraction.openCount, 0, 'a panel-owned gesture must never open Mystic behind it');
delete window.eveBevyUiRuntime;

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
assert.equal(longPressCompatibilityClick.defaultPrevented, true, 'the terminal compatibility click must be consumed before BevyUI');
assert.equal(mysticInteraction.open, true, 'the terminal compatibility click must not close Mystic');
const secondLongPressCompatibilityClick = makeMysticPointerEvent('click', {
    pointerId: undefined,
    pointerType: 'mouse',
    clientX: 154,
    clientY: 126
});
projectCanvas.dispatchEvent(secondLongPressCompatibilityClick);
assert.equal(secondLongPressCompatibilityClick.defaultPrevented, true, 'a second terminal compatibility click remains consumed');
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
assert.equal(mysticInteraction.openCount, beforeDelayedOpening + 1, 'a recognized hold must still open after delayed access resolves');
assert.equal(mysticInteraction.holding, false, 'released pending opening must not arm the assistant');
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointermove', { buttons: 0 }));
assert.equal(mysticInteraction.hoverActivation, false, 'free movement must never activate');

// All device types exercise the same session and asynchronous access owner.
for (const pointerType of ['mouse', 'touch', 'pen']) {
 for (const termination of ['pointerup', 'pointercancel', 'lostpointercapture', 'close', 'context', 'new_press']) {
  closeMysticMenu(); mysticInteraction.button = null;
  const reads = [];
  window.Atome.getStateCurrent = id => new Promise(resolve => reads.push(() => resolve({ id, capabilities: { write: true } })));
  const before = mysticInteraction.openCount;
  projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { pointerType, pointerId: 80 }));
  await delay(10);
  assert.ok(reads.length, 'recognized hold must reach canonical access');
  if (termination === 'close') closeMysticMenu();
  else if (termination === 'context') window.dispatchEvent(new window.Event('eve:context-menu-context-changed'));
  else if (termination === 'new_press') {
   projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { pointerType, pointerId: 81 }));
   projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', { pointerType, pointerId: 81 }));
  } else projectCanvas.dispatchEvent(makeMysticPointerEvent(termination, { pointerType, pointerId: 80 }));
  reads.forEach(resolve => resolve()); await delay(1);
  assert.equal(mysticInteraction.openCount, before + Number(termination === 'pointerup'), pointerType + ':' + termination);
  assert.equal(getMysticPointerLock(80), null, 'every terminal path must release the lock');
  if (termination === 'pointerup') {
   assert.equal(mysticInteraction.holding, false);
   projectCanvas.dispatchEvent(makeMysticPointerEvent('pointermove', { pointerType, buttons: 0 }));
   assert.equal(mysticInteraction.hoverActivation, false);
  }
 }
 // Browser prevention is not an ownership claim; an ordinary selected-object hold survives it.
 closeMysticMenu();
 window.Atome.getStateCurrent = async id => ({ id, capabilities: { write: true } });
 projectCanvas.addEventListener('pointerdown', event => event.preventDefault(), { once: true });
 projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { pointerType, pointerId: 80 }));
 await delay(10);
 assert.equal(mysticInteraction.open, true, pointerType + ': prevention alone must not cancel the hold');
 projectCanvas.dispatchEvent(makeMysticPointerEvent('pointermove', { pointerType, pointerId: 80, clientX: 250 }));
 assert.equal(mysticInteraction.hoverActivation, true, 'held radial movement activates');
 projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', { pointerType, pointerId: 80 }));
 projectCanvas.dispatchEvent(makeMysticPointerEvent('pointermove', { pointerType, pointerId: 80, buttons: 0 }));
 assert.equal(mysticInteraction.hoverActivation, false, 'released radial movement is passive');
}
// A real scene target retains its context across repeated selected/unselected holds.
closeMysticMenu();
const { renderProjectScene, clearAllProjectScenes } = await import('../../eVe/domains/rendering/project_scene_runtime.js');
const host = projectCanvas.parentElement;
Object.defineProperties(host, { clientWidth: { value: 640 }, clientHeight: { value: 480 } });
host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 480 });
await renderProjectScene({ projectId: 'alpha', host,
 compositor: { default: async () => {}, run_atome_bevy_renderer: () => {} },
 records: [{ id: 'held_shape', type: 'shape', properties: { left: 100, top: 100, width: 100, height: 100 } }] });
for (const pointerType of ['mouse', 'touch', 'pen']) for (const selected of [false, true]) {
 window.SelectionAPI = { selected: () => selected ? ['held_shape'] : [] };
 for (let repeat = 0; repeat < 3; repeat++) {
  closeMysticMenu();
  projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { pointerType, pointerId: 88 }));
  await delay(10);
  assert.equal(mysticInteraction.open, true, pointerType + ': repeated object hold');
  assert.equal(mysticInteraction.context.atomeId, 'held_shape');
  projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', { pointerType, pointerId: 88 }));
  assert.equal(getMysticPointerLock(88), null);
 }
}
// A native contextmenu without pointerId during a held gesture is the same opening.
closeMysticMenu();
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { pointerId: 89 }));
await delay(10);
const beforeNativeContext = mysticInteraction.openCount;
projectCanvas.dispatchEvent(makeMysticPointerEvent('contextmenu', { pointerId: undefined, button: 2 }));
assert.equal(mysticInteraction.open, true);
assert.equal(mysticInteraction.openCount, beforeNativeContext);
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', { pointerId: 89 }));
// A capture released by the explicit Mystic takeover is not an interrupted hold.
closeMysticMenu();
projectCanvas.hasPointerCapture = () => true;
window.eveBevyUiRuntime = { cancelPointerGesture: () => projectCanvas.dispatchEvent(makeMysticPointerEvent('lostpointercapture', { pointerId: 90 })) };
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { pointerId: 90 }));
await delay(10);
assert.equal(mysticInteraction.open, true, 'the transfer must not invalidate the recognized hold');
assert.equal(mysticInteraction.holding, true);
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', { pointerId: 90 }));
delete window.eveBevyUiRuntime;
delete projectCanvas.hasPointerCapture;
closeMysticMenu();
// Movement before the queued timer is armed must also cancel a candidate.
const beforeMoved = mysticInteraction.openCount;
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerdown', { pointerId: 91 }));
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointermove', { pointerId: 91, clientX: 250 }));
await delay(10);
assert.equal(mysticInteraction.openCount, beforeMoved);
projectCanvas.dispatchEvent(makeMysticPointerEvent('pointerup', { pointerId: 91 }));
disposeMysticContext();
setMysticRuntime(null);

console.log('Mystic context routing and captured pointer contracts passed.');
clearAllProjectScenes();
await delay(30);
dom.window.close();
