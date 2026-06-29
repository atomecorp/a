import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLImageElement = window.HTMLImageElement;
globalThis.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 1);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);

const {
    installIntuitionXFlowerContextRuntime
} = await import('../../eVe/intuition/flower/context.js');
const {
    closeFlowerMenu,
    isFlowerMenuOpen
} = await import('../../eVe/intuition/flower/index.js');
const { registerAtomeElement } = await import('../../eVe/core/atome_dom_id.js');
const { ensureIntuitionMenuLayer } = await import('../../eVe/intuition/runtime/layer_contract.js');
const { createLassoContextZone } = await import('../../eVe/shared/lasso_context_zone_runtime.js');

const defineReadonly = (target, key, value) => {
    Object.defineProperty(target, key, {
        configurable: true,
        value
    });
};

const makePointerEvent = (type, options = {}) => {
    const event = new window.Event(type, {
        bubbles: true,
        cancelable: true
    });
    Object.entries({
        pointerId: 51,
        pointerType: 'mouse',
        button: 0,
        buttons: type === 'pointerup' || type === 'mouseup' ? 0 : 1,
        isPrimary: true,
        clientX: 180,
        clientY: 180,
        ...options
    }).forEach(([key, value]) => defineReadonly(event, key, value));
    return event;
};

const makeMouseEvent = (type, options = {}) => {
    const event = new window.Event(type, {
        bubbles: true,
        cancelable: true
    });
    Object.entries({
        button: 0,
        buttons: 0,
        clientX: 180,
        clientY: 180,
        ...options
    }).forEach(([key, value]) => defineReadonly(event, key, value));
    return event;
};

const host = document.createElement('div');
registerAtomeElement(host, {
    atome_id: 'intuitionx_flower_atom',
    kind: 'shape'
});
document.body.appendChild(host);
document.elementsFromPoint = () => [host, document.body];
document.elementFromPoint = (x = 0) => {
    const item = document.querySelector('[data-role="eve_intuitionx-flower-item"]');
    return Number(x) >= 210 && item ? item : host;
};

const activations = [];
const opens = [];
let flowerItems = [{
    key: 'shape',
    label: 'Shape',
    icon: 'tool',
    onSelect: (meta = {}) => activations.push(String(meta.source || ''))
}];
const cleanup = installIntuitionXFlowerContextRuntime({
    longPressMs: 2,
    moveTolerancePx: 8,
    resolveItems: (context = {}) => {
        opens.push({
            source: String(context.source || ''),
            x: Number(context.x || 0),
            y: Number(context.y || 0)
        });
        return flowerItems;
    }
});

host.dispatchEvent(makePointerEvent('pointerdown'));
await delay(8);
document.dispatchEvent(makePointerEvent('pointerup', { buttons: 0 }));
assert.equal(isFlowerMenuOpen(), true, 'left long press release must keep the active IntuitionX flower open');
assert.equal(opens.length, 1);
assert.deepEqual(activations, []);

await delay(360);
host.dispatchEvent(makeMouseEvent('click'));
assert.equal(isFlowerMenuOpen(), true, 'delayed browser click after left long press release must not close the active IntuitionX flower');
assert.deepEqual(activations, []);

host.dispatchEvent(makePointerEvent('pointerdown', {
    pointerId: 52,
    clientX: 190,
    clientY: 180
}));
await delay(8);
document.dispatchEvent(makePointerEvent('pointerup', {
    pointerId: 52,
    buttons: 0,
    clientX: 190,
    clientY: 180
}));
assert.equal(opens.length, 2, 'a new left long press must reopen immediately, not be consumed by stale open state');
assert.equal(opens[1].x, 190);
assert.equal(isFlowerMenuOpen(), true);

document.querySelector('[data-role="eve_intuitionx-flower-item"]')?.dispatchEvent(makeMouseEvent('click', {
    clientX: 214,
    clientY: 180
}));
assert.equal(isFlowerMenuOpen(), false, 'a deliberate active IntuitionX flower tool click must still close after activation');
assert.deepEqual(activations, ['']);
await delay(360);

host.dispatchEvent(makePointerEvent('pointerdown', {
    pointerId: 53,
    clientX: 180,
    clientY: 180
}));
await delay(8);
document.dispatchEvent(makePointerEvent('pointermove', {
    pointerId: 53,
    clientX: 240,
    clientY: 180
}));
document.dispatchEvent(makePointerEvent('pointerup', {
    pointerId: 53,
    buttons: 0,
    clientX: 240,
    clientY: 180
}));
assert.equal(isFlowerMenuOpen(), false, 'a deliberate radial drag onto a tool must still launch and close');
assert.deepEqual(activations, ['', 'intuitionx_flower_hold_release']);
await delay(360);

// Recentre/clamp regression: when the atom sits near a screen edge the flower is
// recentred away from the press point, so an IMMOBILE long-press release leaves the
// cursor sitting over a petal. That release must NOT launch a tool and must keep the
// flower open; only the deliberate hold-drag onto a tool (asserted above) launches.
document.elementFromPoint = () => document.querySelector('[data-role="eve_intuitionx-flower-item"]') || host;
host.dispatchEvent(makePointerEvent('pointerdown', { pointerId: 54, clientX: 180, clientY: 180 }));
await delay(8);
document.dispatchEvent(makePointerEvent('pointerup', { pointerId: 54, buttons: 0, clientX: 180, clientY: 180 }));
assert.deepEqual(activations, ['', 'intuitionx_flower_hold_release'], 'immobile long-press release over a recentred petal must not launch a tool');
assert.equal(isFlowerMenuOpen(), true, 'immobile long-press release must keep the active IntuitionX flower open even when a petal sits under the cursor');
host.dispatchEvent(makeMouseEvent('click', { clientX: 180, clientY: 180 }));
assert.equal(isFlowerMenuOpen(), true, 'synthetic click after an immobile long-press release must not close the recentred flower');
await delay(360);

// Same recentred petal, but now with a jitter-sized drift during the hold (moved=true
// yet below the radial-select distance). This is the real left-click regression: the
// drift must NOT be mistaken for a deliberate radial drag, so the flower stays open.
host.dispatchEvent(makePointerEvent('pointerdown', { pointerId: 55, clientX: 180, clientY: 180 }));
await delay(8);
document.dispatchEvent(makePointerEvent('pointermove', { pointerId: 55, clientX: 193, clientY: 180 }));
document.dispatchEvent(makePointerEvent('pointerup', { pointerId: 55, buttons: 0, clientX: 193, clientY: 180 }));
assert.deepEqual(activations, ['', 'intuitionx_flower_hold_release'], 'a jitter-sized drift over a recentred petal must not launch a tool');
assert.equal(isFlowerMenuOpen(), true, 'a drifted long-press release below the radial-select distance must keep the flower open');
await delay(360);

// Right-click parity: releasing after a contextmenu open keeps the flower open. Left
// long press must reach exactly this behaviour.
closeFlowerMenu();
await delay(20);
document.elementFromPoint = (x = 0) => (Number(x) >= 210 ? (document.querySelector('[data-role="eve_intuitionx-flower-item"]') || host) : host);
host.dispatchEvent(makeMouseEvent('contextmenu', { button: 2, buttons: 0, clientX: 180, clientY: 180 }));
await delay(8);
document.dispatchEvent(makePointerEvent('pointerup', { pointerId: 60, button: 2, buttons: 0, clientX: 180, clientY: 180 }));
assert.equal(isFlowerMenuOpen(), true, 'right-click release must keep the contextual flower open (the parity target for left long press)');

flowerItems = [{
    key: 'perform',
    label: 'Perform',
    icon: 'fullscreen',
    onSelect: (meta = {}) => activations.push(`perform:${String(meta.source || '')}`)
}];

const hideMenuLayerAsPerformModeDoes = () => {
    const layer = ensureIntuitionMenuLayer();
    layer.style.display = 'none';
    layer.dataset.intuitionPrevDisplay = '';
    layer.setAttribute('aria-hidden', 'true');
    return layer;
};

closeFlowerMenu();
await delay(20);
const rightClickHiddenLayer = hideMenuLayerAsPerformModeDoes();
host.dispatchEvent(makeMouseEvent('contextmenu', { button: 2, buttons: 0, clientX: 180, clientY: 180 }));
await delay(8);
assert.notEqual(rightClickHiddenLayer.style.display, 'none', 'perform-mode right-click flower must reveal the hidden menu host layer');
assert.equal(rightClickHiddenLayer.getAttribute('aria-hidden'), null, 'perform-mode right-click flower host layer must become accessible while the flower is open');
assert.equal(isFlowerMenuOpen(), true, 'perform-mode right-click must open the flower');
assert.equal(
    document.querySelector('[data-role="eve_intuitionx-flower-item"]')?.dataset.key,
    'perform',
    'perform-mode right-click flower must expose the perform tool to exit the mode'
);

closeFlowerMenu();
await delay(20);
const longPressHiddenLayer = hideMenuLayerAsPerformModeDoes();
host.dispatchEvent(makePointerEvent('pointerdown', { pointerId: 61, clientX: 180, clientY: 180 }));
await delay(8);
document.dispatchEvent(makePointerEvent('pointerup', { pointerId: 61, buttons: 0, clientX: 180, clientY: 180 }));
assert.notEqual(longPressHiddenLayer.style.display, 'none', 'perform-mode long-press flower must reveal the hidden menu host layer');
assert.equal(longPressHiddenLayer.getAttribute('aria-hidden'), null, 'perform-mode long-press flower host layer must become accessible while the flower is open');
assert.equal(isFlowerMenuOpen(), true, 'perform-mode long press must open the flower');
assert.equal(
    document.querySelector('[data-role="eve_intuitionx-flower-item"]')?.dataset.key,
    'perform',
    'perform-mode long-press flower must expose the perform tool to exit the mode'
);

// Matrix tile label is a flower-blocked target. A long press there opens the inline
// rename editor owned by matrix_interaction_runtime, so the radial flower must NOT
// also open on that hit-area (it must behave like any other blocked target).
closeFlowerMenu();
await delay(20);
const matrixTile = document.createElement('div');
matrixTile.className = 'eve-matrix-tile';
const matrixLabel = document.createElement('div');
matrixLabel.className = 'eve-matrix-tile__label';
matrixTile.appendChild(matrixLabel);
document.body.appendChild(matrixTile);
document.elementFromPoint = () => matrixLabel;
document.elementsFromPoint = () => [matrixLabel, matrixTile, document.body];
const opensBeforeMatrixLabel = opens.length;
matrixLabel.dispatchEvent(makePointerEvent('pointerdown', { pointerId: 62, clientX: 180, clientY: 180 }));
await delay(8);
document.dispatchEvent(makePointerEvent('pointerup', { pointerId: 62, buttons: 0, clientX: 180, clientY: 180 }));
assert.equal(isFlowerMenuOpen(), false, 'a long press on a matrix tile label must not open the IntuitionX flower (the inline rename editor owns that gesture)');
assert.equal(opens.length, opensBeforeMatrixLabel, 'a blocked matrix tile label must not resolve flower items');

closeFlowerMenu();
await delay(20);
document.elementFromPoint = () => host;
document.elementsFromPoint = () => [host, document.body];
const lassoOverlay = document.createElement('div');
lassoOverlay.className = 'eve-atome-lasso';
lassoOverlay.getBoundingClientRect = () => ({
    left: 150,
    top: 150,
    right: 250,
    bottom: 250,
    width: 100,
    height: 100
});
document.body.appendChild(lassoOverlay);
const lassoZone = createLassoContextZone({
    overlay: lassoOverlay,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    actions: [],
    autoDismissMs: 10000,
    longPressMs: 10000
});
const opensBeforeLassoBlock = opens.length;
host.dispatchEvent(makePointerEvent('pointerdown', { pointerId: 63, clientX: 180, clientY: 180 }));
await delay(8);
document.dispatchEvent(makePointerEvent('pointerup', { pointerId: 63, buttons: 0, clientX: 180, clientY: 180 }));
assert.equal(isFlowerMenuOpen(), false, 'a long press inside an active lasso selection must not open the IntuitionX flower');
assert.equal(opens.length, opensBeforeLassoBlock, 'a lasso-blocked point must not resolve flower items');

lassoZone.dismiss({ immediate: true });
host.dispatchEvent(makePointerEvent('pointerdown', { pointerId: 64, clientX: 180, clientY: 180 }));
await delay(8);
document.dispatchEvent(makePointerEvent('pointerup', { pointerId: 64, buttons: 0, clientX: 180, clientY: 180 }));
assert.equal(isFlowerMenuOpen(), true, 'dismissing the lasso selection must release the IntuitionX flower block');
assert.equal(opens.length, opensBeforeLassoBlock + 1, 'flower items must resolve again after lasso dismiss');

closeFlowerMenu();
cleanup();
