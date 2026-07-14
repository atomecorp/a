import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="stage"></div></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 1);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);

const { createDragRuntime } = await import('../../eVe/core/atome_events/drag_runtime.js');
const {
    getAtomeRuntimeState,
    registerAtomeElement
} = await import('../../eVe/core/atome_dom_id.js');

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
        pointerId: 31,
        pointerType: 'touch',
        buttons: 1,
        clientX: 0,
        clientY: 0,
        ...options
    }).forEach(([key, value]) => defineReadonly(event, key, value));
    event.stopImmediatePropagation = () => {
        defineReadonly(event, 'stoppedImmediate', true);
    };
    return event;
};

const stage = document.getElementById('stage');
defineReadonly(stage, 'clientWidth', 500);
defineReadonly(stage, 'clientHeight', 400);

const host = document.createElement('div');
registerAtomeElement(host, {
    atome_id: 'flower_drag_atom',
    kind: 'shape'
});
host.style.position = 'absolute';
host.style.left = '10px';
host.style.top = '20px';
host.style.width = '80px';
host.style.height = '60px';
host.setPointerCapture = () => {};
host.releasePointerCapture = () => {};
host.hasPointerCapture = () => true;
stage.appendChild(host);

const commitBatchCalls = [];
const updatePropsCalls = [];
const toolboxPhases = [];
const activeDragSessions = new Set();
const currentSelectionIds = ['flower_drag_atom'];
let flowerLongPressActive = false;

window.addEventListener('eve:atome-drag-main-toolbox', (event) => {
    toolboxPhases.push(String(event?.detail?.phase || ''));
});

const runtime = createDragRuntime({
    hasBindMark: (element, key) => element[key] === true,
    setBindMark: (element, key) => {
        element[key] = true;
    },
    atomeDragBindMark: '__drag_bound_test',
    isToolHost: () => false,
    beginActiveDragPromotion: () => null,
    normalizePointerId: (id) => (id == null ? null : Number(id)),
    isFlowerPointerLocked: () => false,
    isFlowerContextSurfaceHoldCandidateActive: () => false,
    isFlowerContextSurfaceLongPressActive: () => flowerLongPressActive,
    isFlowerContextLongPressSelectionActive: () => false,
    selectionMoveTolerance: 2,
    gestureFrameIntervalMs: 0,
    gestureFrameMaxIntervalMs: 0,
    gestureMinDistance: 0,
    dragFrameTraceEnabled: () => false,
    logDragEvents: () => {},
    logAtomeEvents: () => {},
    resolveNearestSnapCandidate: () => null,
    resolveSnapTargets: () => [],
    generateGestureId: () => 'flower_drag_gesture',
    generateTxId: () => 'flower_drag_tx',
    getCurrentSelectionIds: () => currentSelectionIds.slice(),
    resolveAtomeElement: (id) => (String(id) === 'flower_drag_atom' ? host : null),
    resolveElementPosition: (element) => ({
        left: Number.parseFloat(element.style.left || '0'),
        top: Number.parseFloat(element.style.top || '0')
    }),
    parsePx: (value) => Number.parseFloat(String(value || '0')) || 0,
    toPx: (value) => `${Number(value)}px`,
    touchLocalInteractionEdit: () => {},
    scheduleLocalInteractionEditRelease: () => {},
    rememberRecentLocalDragEnds: () => {
        throw new Error('cancelled flower drag must not be remembered as a completed local drag');
    },
    applySelectionIntent: () => {
        throw new Error('cancelled flower drag must not replace selection on release');
    },
    isAtomeSelected: (id) => currentSelectionIds.includes(String(id || '')),
    isFooterInteractionTargetWithinHost: () => false,
    isInteractiveTargetWithinHost: () => false,
    resolveResizeDirection: () => '',
    isPrimaryPointerActivation: () => true,
    isTextToolActive: () => false,
    markAtomeAsEditing: () => {},
    shouldDeferSelectionReplaceForFlowerContext: () => false,
    claimActiveDragSession: (id) => {
        activeDragSessions.add(String(id || ''));
        return true;
    },
    releaseActiveDragSession: (id) => {
        activeDragSessions.delete(String(id || ''));
    },
    resolveDescribedGeometry: (id, element) => ({
        left: element.style.left,
        top: element.style.top,
        width: element.style.width,
        height: element.style.height
    })
});

runtime.bindDrag(host, 'flower_drag_atom', {
    emitCommitBatch: (events = [], options = {}) => {
        commitBatchCalls.push({
            events: events.map((event) => ({
                kind: String(event?.kind || ''),
                atome_id: String(event?.atome_id || ''),
                props: { ...(event?.payload?.props || {}) }
            })),
            options: { ...options }
        });
    },
    onUpdateProps: (...args) => {
        updatePropsCalls.push(args);
    }
});

host.dispatchEvent(makePointerEvent('pointerdown', {
    clientX: 100,
    clientY: 100
}));

document.dispatchEvent(makePointerEvent('pointermove', {
    clientX: 112,
    clientY: 118
}));

assert.equal(host.style.left, '22px');
assert.equal(host.style.top, '38px');
assert.equal(getAtomeRuntimeState(host)?.drag?.active, true);

flowerLongPressActive = true;
document.dispatchEvent(makePointerEvent('pointermove', {
    clientX: 150,
    clientY: 160
}));

assert.equal(host.style.left, '10px');
assert.equal(host.style.top, '20px');
assert.equal(getAtomeRuntimeState(host)?.drag?.active, false);
assert.equal(activeDragSessions.size, 0);
assert.equal(updatePropsCalls.length, 0);
assert.equal(
    commitBatchCalls.some((call) => call.events.some((event) => event.kind === 'gesture_end')),
    false,
    'flower context activation must cancel the armed drag instead of committing gesture_end'
);
assert.equal(toolboxPhases.includes('cancel'), true);

const projectDropSource = await readFile(
    new URL('../../eVe/intuition/tools/project_drop_projection_move_runtime.js', import.meta.url),
    'utf8'
);
assert.equal(
    projectDropSource.includes('isFlowerPointerInteractionActive(moveEvent.pointerId)')
        && projectDropSource.includes("pushFlowerDragTrace('tool_projection.move_cancelled_by_flower'")
        && projectDropSource.includes('cancel(moveEvent);'),
    true,
    'tool projection move drag must cancel while the Flower pointer interaction is active'
);
assert.equal(
    projectDropSource.includes('isFlowerPointerInteractionActive(upEvent.pointerId)')
        && projectDropSource.includes("pushFlowerDragTrace('tool_projection.stop_cancelled_by_flower'")
        && projectDropSource.includes('cancel(upEvent);'),
    true,
    'tool projection release must not commit a move while the Flower pointer interaction is active'
);

const surfaceRuntimeSource = await readFile(
    new URL('../../eVe/domains/rendering/surface_runtime.js', import.meta.url),
    'utf8'
);
assert.equal(
    surfaceRuntimeSource.includes('isFlowerPointerInteractionActive(session.pointer_id, ownerWindowFor(canvas))')
        && surfaceRuntimeSource.includes("endSurfacePointerSession(canvas, 'flower.active.pointermove', event)")
        && surfaceRuntimeSource.includes("endSurfacePointerSession(canvas, 'flower.active.pointerup', event)"),
    true,
    'WebGPU project surface drag must cancel before drag.move or drag.end when Flower owns the pointer'
);
