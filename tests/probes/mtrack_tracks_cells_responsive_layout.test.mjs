import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;

const {
    createMtrackPanelLayoutRuntime,
    resolveContentLayout,
    resolveContentLayoutAxis
} = await import('../../eve/application/domains/mtrax/ui/panel_layout_runtime.js');
const { createLoopCellsRuntime } = await import('../../eve/application/domains/mtrax/timeline/loop_cells_runtime.js');

const createNode = (id) => {
    const node = document.createElement('div');
    node.id = id;
    document.body.appendChild(node);
    return node;
};

const setRect = (node, width, height) => {
    Object.defineProperty(node, 'clientWidth', { configurable: true, get: () => width });
    Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => height });
    node.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width,
        height,
        right: width,
        bottom: height
    });
};

const dispatchPointer = (target, type, init = {}) => {
    const event = new window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: Number(init.clientX || 0),
        clientY: Number(init.clientY || 0),
        button: init.button ?? 0
    });
    Object.defineProperty(event, 'pointerId', {
        configurable: true,
        value: init.pointerId ?? 1
    });
    target.dispatchEvent(event);
    return event;
};

const root = createNode('eve_mtrack_dialog');
const body = createNode('eve_mtrack_dialog__body');
const content = createNode('eve_mtrack_dialog__content');
const loopCellsSplitter = createNode('eve_mtrack_dialog__loop_cells_splitter');
const loopCellsPanel = createNode('eve_mtrack_dialog__loop_cells_panel');

const state = {
    ui: {
        root,
        body,
        content,
        loopCellsSplitter,
        loopCellsPanel
    },
    loopCellsVisible: true
};

const calls = {
    ruler: 0,
    tracks: 0,
    cells: 0,
    preview: 0
};

const runtime = createMtrackPanelLayoutRuntime({
    getState: () => state,
    drawRuler: () => { calls.ruler += 1; },
    renderTracks: () => { calls.tracks += 1; },
    renderLoopCells: () => { calls.cells += 1; },
    schedulePreviewLayoutResizeSync: () => { calls.preview += 1; }
});

setRect(root, 1100, 640);
assert.equal(resolveContentLayout(root), 'landscape', 'wide panel must use landscape layout');
assert.equal(resolveContentLayoutAxis('landscape'), 'horizontal', 'landscape layout must size cells horizontally');
runtime.syncMtrackPanelLayout('wide');
assert.equal(root.dataset.eveMtrackContentLayout, 'landscape', 'root must expose landscape layout');
assert.equal(root.dataset.eveMtrackContentAxis, 'horizontal', 'root must expose horizontal content axis');
assert.equal(content.dataset.eveMtrackContentAxis, 'horizontal', 'content must expose horizontal content axis');
assert.equal(loopCellsSplitter.getAttribute('aria-orientation'), 'vertical', 'landscape splitter must be vertical');
assert.equal(loopCellsPanel.dataset.eveMtrackContentAxis, 'horizontal', 'cells panel must expose horizontal axis');

setRect(root, 760, 900);
assert.equal(resolveContentLayout(root), 'portrait', 'tall panel must use portrait layout');
assert.equal(resolveContentLayoutAxis('portrait'), 'vertical', 'portrait layout must size cells vertically');
runtime.syncMtrackPanelLayout('tall');
assert.equal(root.dataset.eveMtrackContentLayout, 'portrait', 'root must expose portrait layout');
assert.equal(root.dataset.eveMtrackContentAxis, 'vertical', 'root must expose vertical content axis');
assert.equal(loopCellsSplitter.getAttribute('aria-orientation'), 'horizontal', 'portrait splitter must be horizontal');
assert.equal(loopCellsPanel.dataset.eveMtrackContentAxis, 'vertical', 'cells panel must expose vertical axis');

setRect(root, 620, 520);
assert.equal(resolveContentLayout(root), 'compact', 'narrow panel must use compact layout');
runtime.syncMtrackPanelLayout('compact');
assert.equal(root.dataset.eveMtrackContentLayout, 'compact', 'root must expose compact layout');
assert.equal(root.dataset.eveMtrackContentAxis, 'vertical', 'compact layout must use vertical cells sizing');
assert.equal(loopCellsSplitter.getAttribute('aria-orientation'), 'horizontal', 'compact splitter must be horizontal');

assert.ok(calls.preview >= 3, 'layout changes must schedule preview resize sync');
assert.ok(calls.ruler >= 3, 'layout changes must redraw the ruler');
assert.ok(calls.tracks >= 3, 'layout changes must rerender tracks');
assert.ok(calls.cells >= 3, 'visible cells must rerender after layout changes');

const gestureRoot = createNode('eve_mtrack_dialog_gesture');
const gestureContent = createNode('eve_mtrack_dialog_gesture__content');
const gestureScroll = createNode('eve_mtrack_dialog_gesture__scroll');
const gestureSplitter = createNode('eve_mtrack_dialog_gesture__loop_cells_splitter');
const gesturePanel = createNode('eve_mtrack_dialog_gesture__loop_cells_panel');
const gestureHeaderRow = createNode('eve_mtrack_dialog_gesture__loop_cells_header_row');
const gestureBody = createNode('eve_mtrack_dialog_gesture__loop_cells_body');
gestureRoot.id = 'eve_mtrack_dialog_gesture';
gestureContent.className = 'eve-mtrack-content';
gestureSplitter.className = 'eve-mtrack-loop-cells-splitter';
gesturePanel.className = 'eve-mtrack-loop-cells-panel';
gestureHeaderRow.className = 'eve-mtrack-loop-cells-header-row';
gestureBody.className = 'eve-mtrack-loop-cells-body';
gesturePanel.appendChild(gestureHeaderRow);
gesturePanel.appendChild(gestureBody);
gestureRoot.appendChild(gestureContent);
gestureContent.appendChild(gestureScroll);
gestureContent.appendChild(gestureSplitter);
gestureContent.appendChild(gesturePanel);

let gestureContentRight = 800;
setRect(gestureRoot, 800, 500);
Object.defineProperty(gestureContent, 'clientWidth', {
    configurable: true,
    get: () => Math.round(gestureContentRight)
});
Object.defineProperty(gestureContent, 'clientHeight', {
    configurable: true,
    get: () => 400
});
gestureContent.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: gestureContentRight,
    bottom: 400,
    width: gestureContentRight,
    height: 400
});
setRect(gestureSplitter, 6, 400);

let capturedPointerId = null;
let releasedPointerId = null;
gestureSplitter.setPointerCapture = (pointerId) => { capturedPointerId = pointerId; };
gestureSplitter.releasePointerCapture = (pointerId) => { releasedPointerId = pointerId; };
gestureSplitter.hasPointerCapture = (pointerId) => pointerId === capturedPointerId;

let rootPointerDownCount = 0;
gestureRoot.addEventListener('pointerdown', () => {
    rootPointerDownCount += 1;
});

const gestureState = {
    ui: {
        root: gestureRoot,
        content: gestureContent,
        scroll: gestureScroll,
        loopCellsSplitter: gestureSplitter,
        loopCellsPanel: gesturePanel,
        loopCellsHeaderRow: gestureHeaderRow,
        loopCellsBody: gestureBody
    },
    activeGroupId: 'group_1',
    clips: [],
    tracks: [],
    loopCellsVisible: true,
    loopCellsWidth: 320,
    loopCellEntries: [],
    loopCellColorsByKey: new Map(),
    loopCellRecordByKey: new Map(),
    selectedLoopCellKeys: new Set()
};

let gestureRulerSyncCount = 0;
let gestureTrackSyncCount = 0;
const loopCellsRuntime = createLoopCellsRuntime({
    getState: () => gestureState,
    toKey: (value) => String(value || ''),
    cloneData: (value) => structuredClone(value),
    scheduleActiveGroupTimelinePersist: () => {},
    drawRuler: () => { gestureRulerSyncCount += 1; },
    renderTracks: () => { gestureTrackSyncCount += 1; }
});

loopCellsRuntime.renderLoopCells();

const down = dispatchPointer(gestureSplitter, 'pointerdown', { pointerId: 17, clientX: 500, clientY: 200 });
assert.equal(down.defaultPrevented, true, 'loop cells splitter pointerdown must prevent default browser drag');
assert.equal(rootPointerDownCount, 0, 'loop cells splitter pointerdown must not bubble to panel or host drag handlers');
assert.equal(capturedPointerId, 17, 'loop cells splitter must capture the active pointer');
assert.equal(gestureSplitter.dataset.dragging, 'true', 'loop cells splitter must expose active resize state');
assert.equal(gestureRoot.dataset.eveMtrackCellsResizing, 'true', 'root must disable panel drag while cells resize is active');

dispatchPointer(window, 'pointermove', { pointerId: 17, clientX: 560, clientY: 200 });
assert.equal(Math.round(gestureState.loopCellsWidth), 240, 'loop cells splitter move must size cells from the live content right edge');

gestureContentRight = 900;
dispatchPointer(window, 'pointermove', { pointerId: 17, clientX: 560, clientY: 200 });
assert.equal(Math.round(gestureState.loopCellsWidth), 340, 'loop cells splitter move must recalculate content bounds during drag');
assert.ok(gestureRulerSyncCount >= 2, 'live loop cells splitter resize must sync the timeline ruler');
assert.ok(gestureTrackSyncCount >= 2, 'live loop cells splitter resize must sync tracks');

dispatchPointer(window, 'pointerup', { pointerId: 17, clientX: 560, clientY: 200 });
assert.equal(gestureSplitter.dataset.dragging, undefined, 'loop cells splitter must clear active resize state');
assert.equal(gestureRoot.dataset.eveMtrackCellsResizing, undefined, 'root must re-enable panel drag after cells resize');
assert.equal(releasedPointerId, 17, 'loop cells splitter must release the captured pointer');
