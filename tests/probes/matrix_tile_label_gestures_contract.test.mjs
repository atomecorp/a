// Behavioral contract for matrix tile label gestures, driving the real press-gesture
// runtime (registerPressGesture) through bindMatrixTileInteractions:
//   1. a single click on the label opens the project;
//   2. a double click on the label edits the label;
//   3. a long press on the label edits the label.
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
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 1);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);

const { bindMatrixTileInteractions } = await import('../../eVe/intuition/matrix/ui/matrix_interaction_runtime.js');
const { matrixState } = await import('../../eVe/intuition/matrix/core/state.js');
const { registerProjectElement } = await import('../../eVe/intuition/matrix/core/project_dom_state.js');
const { LONG_PRESS_MS, MATRIX_LABEL_DOUBLE_CLICK_MS } = await import('../../eVe/intuition/matrix/core/constants.js');

const defineReadonly = (target, key, value) => Object.defineProperty(target, key, { configurable: true, value });
const rect = (x, y, w, h) => ({ left: x, top: y, right: x + w, bottom: y + h, x, y, width: w, height: h, toJSON() { } });

const pointer = (type, options = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.entries({
        pointerType: 'mouse',
        button: 0,
        buttons: type.endsWith('up') ? 0 : 1,
        isPrimary: true,
        clientX: 30,
        clientY: 30,
        ...options
    }).forEach(([key, value]) => defineReadonly(event, key, value));
    return event;
};

const scroll = document.createElement('div');
scroll.id = 'eve_project_matrix_scroll';
const tile = document.createElement('div');
tile.className = 'eve-matrix-tile';
const labelRow = document.createElement('div');
labelRow.className = 'eve-matrix-tile__label-row';
const label = document.createElement('div');
label.className = 'eve-matrix-tile__label';
label.textContent = 'Proj1';
labelRow.appendChild(label);
tile.appendChild(labelRow);
scroll.appendChild(tile);
document.body.appendChild(scroll);

registerProjectElement(tile, { id: 'p1' });
matrixState.projects = [{ id: 'p1', name: 'Proj1' }];
matrixState.transitionInFlight = false;

scroll.getBoundingClientRect = () => rect(0, 0, 200, 200);
tile.getBoundingClientRect = () => rect(0, 0, 100, 100);
document.elementFromPoint = () => label;

const openCalls = [];
const renameCalls = [];
bindMatrixTileInteractions(scroll, {
    handlers: {
        onSelect: async (project) => { openCalls.push(String(project?.id || '')); },
        onRename: async (id, name) => { renameCalls.push([String(id), String(name)]); return true; },
        onCreate: async () => { }
    },
    currentId: null
});

const resetLabel = () => {
    label.contentEditable = 'false';
    openCalls.length = 0;
};

const clickLabel = async (pointerId) => {
    label.dispatchEvent(pointer('pointerdown', { pointerId }));
    await delay(15);
    label.dispatchEvent(pointer('pointerup', { pointerId, buttons: 0 }));
};

// Rule 1 — a single click opens the project (deferred until the double-click window elapses).
resetLabel();
await clickLabel(1);
assert.equal(openCalls.length, 0, 'the single-click open must be deferred to detect a possible double click');
await delay(MATRIX_LABEL_DOUBLE_CLICK_MS + 90);
assert.deepEqual(openCalls, ['p1'], 'a lone click on the label opens the project');
assert.notEqual(label.contentEditable, 'true', 'a lone click must not edit the label');

// Rule 2 — a double click edits the label and must not open the project.
resetLabel();
await clickLabel(2);
await delay(40);
await clickLabel(3);
assert.equal(label.contentEditable, 'true', 'a double click on the label edits it');
await delay(MATRIX_LABEL_DOUBLE_CLICK_MS + 90);
assert.equal(openCalls.length, 0, 'a double click must not open the project');

// End the inline edit before the next case.
label.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await delay(20);

// Rule 3 — a long press edits the label and must not open the project.
resetLabel();
label.dispatchEvent(pointer('pointerdown', { pointerId: 4 }));
await delay(LONG_PRESS_MS + 80);
assert.equal(label.contentEditable, 'true', 'a long press on the label edits it');
label.dispatchEvent(pointer('pointerup', { pointerId: 4, buttons: 0 }));
await delay(40);
assert.equal(openCalls.length, 0, 'a long press must not open the project');

console.log('matrix tile label gestures contract: OK');
