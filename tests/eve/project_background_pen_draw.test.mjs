import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createProjectLayerRuntime } from '../../eVe/core/atome_events/project_layer_runtime.js';
import { createProjectLayerRouting } from '../../eVe/core/atome_events/project_layer_routing.js';
import { resolveProjectBackgroundTap } from '../../eVe/core/atome_events/project_layer_tap_classifier.js';
import { restoreProjectWorkModeValue } from '../../eVe/domains/rendering/project_work_mode_state.js';
import { invokeToolGateway } from '../../eVe/intuition/runtime/tool_gateway.js';

vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({ invokeToolGateway: vi.fn(async () => ({ ok: true })) }));
// Tool catalog persistence is outside this brush lifecycle fixture.
vi.mock('../../eVe/intuition/runtime/tool.js', () => ({ registerUiAction: vi.fn() }));

let dom, layer, text, focus, selections, batches;
beforeEach(() => {
    // Product timers (click suppression, deferred background selection) must settle before teardown.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    dom = new JSDOM('<main id="project_view_pen_qa"><canvas id="eve_surface_project"></canvas></main>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('Node', dom.window.Node);
    layer = document.querySelector('main');
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400 });
    text = vi.fn(); focus = vi.fn(); selections = vi.fn(() => 'pen_qa'); batches = vi.fn();
    window.__eveTextTool = { prepareProvisionalFocus: focus, cancelProvisionalFocus: vi.fn() };
    window.__currentProject = { id: 'pen_qa' };
    restoreProjectWorkModeValue('pen_qa', 'edit');
    vi.mocked(invokeToolGateway).mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); restoreProjectWorkModeValue('pen_qa', 'edit'); dom.window.close(); vi.unstubAllGlobals(); });

const bind = ({ hit = null, uiHit = null, locked = () => false, textActive = false } = {}) => {
    createProjectLayerRuntime({
        hasBindMark: () => false, setBindMark: () => {}, isSystemRootHost: () => false,
        isToolHost: () => false, isToolUiTarget: () => false, isPrimaryPointerActivation: () => true,
        isMysticPointerLocked: locked, isValidProjectIdCandidate: () => true,
        hitTestProjectSceneAtClientPoint: () => hit, hitTestBevyUiAtClientPoint: () => uiHit,
        applySelectionIntent: selections, applySelectionBatch: batches, clearAllSelection: () => {},
        collectProjectSceneAtomsInClientRect: () => [], isTextToolActive: () => textActive,
        isTemporaryBackgroundTextToolSessionActive: () => false, notifyTextToolProjectBackgroundClick: text
    }).bindProjectLayerEvents(layer);
};
const pointer = (type, pointerType, { id = 1, x = 100, y = 100, canvasTarget = false } = {}) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: pointerType } });
    (type === 'pointerdown' || canvasTarget ? document.querySelector('canvas') : document).dispatchEvent(event);
};
const tap = (kind, id) => { pointer('pointerdown', kind, { id }); pointer('pointerup', kind, { id }); };

test.each(['mouse', 'touch'])('%s double background tap keeps exactly one text creation and provisional focus', kind => {
    bind(); tap(kind, 1); tap(kind, 2);
    expect(text).toHaveBeenCalledTimes(1);
    expect(text.mock.calls[0][0].clickCount).toBe(2);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(invokeToolGateway).not.toHaveBeenCalled();
});

test.each(['touch', 'mouse'])('native Draw surface lets %s double-tap switch back to text and then pen rearm Draw', async kind => {
    vi.stubGlobal('CustomEvent', window.CustomEvent);
    window.eveToolBase = { getCurrentProjectId: () => 'pen_qa' };
    const { ensureRenderSurface } = await import('../../eVe/domains/rendering/surface_runtime.js');
    const { installSvgDrawRuntime } = await import('../../eVe/intuition/tools/core/svg_draw_runtime.js');
    const canvas = ensureRenderSurface({ zone: 'project', host: layer });
    canvas.getBoundingClientRect = layer.getBoundingClientRect;
    const draw = installSvgDrawRuntime();
    text.mockImplementation(() => draw.deactivate());
    vi.mocked(invokeToolGateway).mockImplementation(async () => { draw.activate(); return { ok: true }; });
    bind(); draw.activate();
    try {
        for (const id of [1, 2]) {
            pointer('pointerdown', kind, { id });
            pointer('pointermove', kind, { id, x: 104, canvasTarget: true });
            pointer('pointerup', kind, { id, x: 104, canvasTarget: true });
        }
        expect(text).toHaveBeenCalledTimes(1);
        expect(draw.isActive()).toBe(false);
        tap('pen', 3); tap('pen', 4);
        expect(invokeToolGateway).toHaveBeenCalledTimes(1);
        expect(draw.isActive()).toBe(true);
    } finally { draw.deactivate(); }
});

test('native Draw claims a real background stroke, releases the layer pending tap and creates once', async () => {
    vi.stubGlobal('DOMParser', window.DOMParser); vi.stubGlobal('XMLSerializer', window.XMLSerializer);
    vi.stubGlobal('CustomEvent', window.CustomEvent);
    const created = vi.fn(async () => ({ ok: true, id: 'surface_stroke' }));
    const commits = vi.fn(async () => ({ ok: true }));
    window.eveToolBase = { createAtome: created, getCurrentProjectId: () => 'pen_qa' };
    window.Atome = { commit: commits };
    const { ensureRenderSurface } = await import('../../eVe/domains/rendering/surface_runtime.js');
    const { installSvgDrawRuntime } = await import('../../eVe/intuition/tools/core/svg_draw_runtime.js');
    ensureRenderSurface({ zone: 'project', host: layer }).getBoundingClientRect = layer.getBoundingClientRect;
    const draw = installSvgDrawRuntime(); bind(); draw.activate();
    try {
        pointer('pointerdown', 'pen');
        pointer('pointermove', 'pen', { x: 150, canvasTarget: true });
        pointer('pointerup', 'pen', { x: 180, canvasTarget: true });
        await vi.waitFor(() => expect(commits.mock.calls.map(([event]) => event.kind)).toEqual(['gesture_start', 'gesture_end']));
        expect(created).toHaveBeenCalledTimes(1);
        expect(text).not.toHaveBeenCalled(); expect(selections).not.toHaveBeenCalled(); expect(batches).not.toHaveBeenCalled();
        draw.deactivate(); tap('pen', 2);
        expect(invokeToolGateway).not.toHaveBeenCalled();
    } finally { draw.deactivate(); }
});

test('armed Draw preserves the project classifier second-contact tolerance for a jittering Pencil double-tap', async () => {
    vi.stubGlobal('CustomEvent', window.CustomEvent);
    const created = vi.fn();
    window.eveToolBase = { createAtome: created, getCurrentProjectId: () => 'pen_qa' };
    const { ensureRenderSurface } = await import('../../eVe/domains/rendering/surface_runtime.js');
    const { installSvgDrawRuntime } = await import('../../eVe/intuition/tools/core/svg_draw_runtime.js');
    ensureRenderSurface({ zone: 'project', host: layer }).getBoundingClientRect = layer.getBoundingClientRect;
    const draw = installSvgDrawRuntime(); bind(); draw.activate();
    try {
        pointer('pointerdown', 'pen'); pointer('pointerup', 'pen', { canvasTarget: true });
        pointer('pointerdown', 'pen', { id: 2 });
        pointer('pointermove', 'pen', { id: 2, x: 114, canvasTarget: true });
        pointer('pointerup', 'pen', { id: 2, x: 114, canvasTarget: true });
        expect(invokeToolGateway).toHaveBeenCalledTimes(1);
        expect(created).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled(); expect(batches).not.toHaveBeenCalled();
    } finally { draw.deactivate(); }
});

test.each(['beginner', 'intermediate', 'advanced'])('two pen tip contacts arm the canonical brush at %s level without text or keyboard', level => {
    window.__eveProfilePreferences = { visual: { masteryLevel: level } };
    bind(); tap('pen', 1); tap('pen', 2);
    expect(invokeToolGateway).toHaveBeenCalledExactlyOnceWith({
        tool_id: 'tool.main.draw', action: 'state.on',
        input: { mode: 'brush', project_id: 'pen_qa' }, presentation: 'ui',
        source: { type: 'ui', layer: 'draw_background_double_tap' }
    });
    expect(text).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
});

test.each(['consultation', 'performance'])('background pen and text shortcuts are blocked in %s', mode => {
    restoreProjectWorkModeValue('pen_qa', mode); bind();
    for (const kind of ['pen', 'touch', 'mouse']) { tap(kind, 1); tap(kind, 2); }
    expect(invokeToolGateway).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
});

test.each(['object', 'chrome'])('pen taps on %s never invoke a background creation', target => {
    bind(target === 'object' ? { hit: { id: 'existing' } } : { uiHit: { id: 'menu' } });
    tap('pen', 1); tap('pen', 2);
    expect(invokeToolGateway).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
    if (target === 'object') expect(selections.mock.calls.every(([id]) => id === 'existing')).toBe(true);
});

test('alternating pen/finger input does not combine taps, then a second finger tap still creates text', () => {
    bind(); tap('pen', 1); tap('touch', 2); tap('pen', 3); tap('touch', 4);
    expect(invokeToolGateway).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
    tap('touch', 5); expect(text).toHaveBeenCalledTimes(1); expect(focus).toHaveBeenCalledTimes(1);
});

test('a single pen stroke or canceled second contact creates neither text nor a drawing shortcut', () => {
    bind(); pointer('pointerdown', 'pen'); pointer('pointermove', 'pen', { x: 180 }); pointer('pointerup', 'pen', { x: 180 });
    tap('pen', 2); pointer('pointerdown', 'pen', { id: 3 }); pointer('pointercancel', 'pen', { id: 3 });
    expect(invokeToolGateway).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
});

test('a long press claimed by Mystic does not activate drawing', () => {
    let locked = false; bind({ locked: () => locked }); tap('pen', 1);
    pointer('pointerdown', 'pen', { id: 2 }); locked = true; pointer('pointerup', 'pen', { id: 2 });
    expect(invokeToolGateway).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
});

test('multitouch takeover cancels the pending background tap', () => {
    bind(); tap('touch', 1); pointer('pointerdown', 'touch', { id: 2 }); pointer('pointerdown', 'touch', { id: 3 });
    pointer('pointerup', 'touch', { id: 2 }); pointer('pointerup', 'touch', { id: 3 });
    expect(text).not.toHaveBeenCalled(); expect(invokeToolGateway).not.toHaveBeenCalled();
});

test('native pen click detail cannot replace two compatible tip contacts', () => {
    const event = { clientX: 100, clientY: 100, pointerType: 'pen', detail: 2 };
    expect(resolveProjectBackgroundTap({ event, projectId: 'qa', now: 1000 }).clickCount).toBe(1);
    const lastTap = { at: 900, clientX: 100, clientY: 100, pointerType: 'touch', projectId: 'qa' };
    expect(resolveProjectBackgroundTap({ lastTap, event, projectId: 'qa', now: 1000 }).clickCount).toBe(1);
    lastTap.pointerType = 'pen';
    expect(resolveProjectBackgroundTap({ lastTap, event, projectId: 'qa', now: 1000 }).clickCount).toBe(2);
    expect(resolveProjectBackgroundTap({ lastTap, event, projectId: 'qa', now: 1600 }).clickCount).toBe(1);
    expect(resolveProjectBackgroundTap({ lastTap, event: { ...event, clientX: 140 }, projectId: 'qa', now: 1000 }).clickCount).toBe(1);
    expect(resolveProjectBackgroundTap({ lastTap, event, projectId: 'another', now: 1000 }).clickCount).toBe(1);
});

test.each(['mouse', 'touch'])('%s native double-click detail still creates text without a stored first tap', kind => {
    const eventLike = { clientX: 100, clientY: 100, pointerType: kind, detail: 2 };
    const { clickCount } = resolveProjectBackgroundTap({ event: eventLike, projectId: 'pen_qa' });
    const routing = createProjectLayerRouting({ bs: {}, layer, applySelectionIntent: selections,
        isTextToolActive: () => false, isTemporaryBackgroundTextToolSessionActive: () => false,
        notifyTextToolProjectBackgroundClick: text, resolveLayerProjectId: () => 'pen_qa',
        resolveLayerPoint: () => ({ x: 100, y: 100 }), logBackgroundTextTrace: () => {} });
    routing.routeBackgroundClick({ eventLike, clickCount });
    expect(text).toHaveBeenCalledTimes(1); expect(focus).toHaveBeenCalledTimes(1); expect(invokeToolGateway).not.toHaveBeenCalled();
});

test('pen double-tap takes priority even when the text tool is active', () => {
    const routing = createProjectLayerRouting({ bs: {}, layer, exitTextEditMode: vi.fn(), applySelectionIntent: selections,
        isTextToolActive: () => true, isTemporaryBackgroundTextToolSessionActive: () => false,
        notifyTextToolProjectBackgroundClick: text, resolveLayerProjectId: () => 'pen_qa',
        resolveLayerPoint: () => ({ x: 100, y: 100 }), logBackgroundTextTrace: () => {} });
    const eventLike = { pointerType: 'pen', clientX: 100, clientY: 100 };
    expect(routing.prepareBackgroundTextFocus({ eventLike, clickCount: 2 })).toBe(false);
    routing.routeBackgroundClick({ eventLike, clickCount: 2 });
    expect(invokeToolGateway).toHaveBeenCalledTimes(1); expect(text).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
});

test('the first Pencil contact while Text is armed does not create a text target that swallows the second contact', () => {
    bind({ textActive: true }); tap('pen', 1);
    expect(text).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
    tap('pen', 2);
    expect(invokeToolGateway).toHaveBeenCalledTimes(1);
    expect(text).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
});

test('the reused native brush creates only on travel and commits the same SVG gesture through Atome', async () => {
    vi.stubGlobal('DOMParser', window.DOMParser);
    vi.stubGlobal('XMLSerializer', window.XMLSerializer);
    vi.stubGlobal('CustomEvent', window.CustomEvent);
    const created = vi.fn(async () => ({ ok: true, id: 'native_stroke' }));
    const commits = vi.fn(async () => ({ ok: true }));
    window.eveToolBase = { createAtome: created, getCurrentProjectId: () => 'pen_qa' };
    window.Atome = { commit: commits };
    const { installSvgDrawRuntime } = await import('../../eVe/intuition/tools/core/svg_draw_runtime.js');
    const draw = installSvgDrawRuntime();
    draw.activate(); draw.setMode('brush');
    try {
        expect(created).not.toHaveBeenCalled();
        await draw.beginGesture({ projectId: 'pen_qa', point: { x: 100, y: 100 }, pointerId: 1 });
        await draw.endGesture({ point: { x: 100, y: 100 }, pointerId: 1 });
        expect(created).not.toHaveBeenCalled(); expect(commits).not.toHaveBeenCalled();
        await draw.beginGesture({ projectId: 'pen_qa', point: { x: 100, y: 100 }, pointerId: 2 });
        draw.moveGesture({ point: { x: 150, y: 140 }, pointerId: 2 });
        await vi.waitFor(() => expect(commits).toHaveBeenCalled());
        await draw.endGesture({ pointerId: 2 });
        expect(created).toHaveBeenCalledTimes(1);
        expect(created.mock.calls[0][0]).toMatchObject({ kind: 'shape', type: 'shape', projectId: 'pen_qa' });
        expect(created.mock.calls[0][0].svg_markup).toContain('<path');
        expect(commits.mock.calls.map(([event]) => event.kind)).toEqual(['gesture_start', 'gesture_end']);
        const events = commits.mock.calls.map(([event]) => event);
        expect(events[0].gesture_id).toBe(events[1].gesture_id);
        expect(events.every(event => event.atome_id === 'native_stroke' && event.project_id === 'pen_qa')).toBe(true);
    } finally { draw.deactivate(); }
});

// Recorded on iPad Pro (iPadOS 27.2): the second Pencil tip contact dispatches no
// pointer event, only a mouse-typed click (detail 2) and a dblclick.
const webkitPenDoubleTap = ({ drift = 7 } = {}) => {
    pointer('pointerdown', 'pen', { id: 11, x: 830, y: 103 });
    pointer('pointermove', 'pen', { id: 11, x: 830 - drift, y: 103, canvasTarget: true });
    pointer('pointerup', 'pen', { id: 11, x: 830 - drift, y: 99, canvasTarget: true });
    for (const [type, detail] of [['click', 1], ['click', 2], ['dblclick', 2]]) {
    document.querySelector('canvas').dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 829, clientY: 102, detail }));
    }
};

test.each([0, 7, 14])('WebKit Pencil double-tap (%i px tip slide) arms Draw and never toggles the background selection', drift => {
    bind({ textActive: drift === 7 }); webkitPenDoubleTap({ drift });
    expect(invokeToolGateway).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(selections).not.toHaveBeenCalled(); expect(batches).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
});

test('a lone dblclick, a mouse dblclick or a stale pen tap never arms Draw', () => {
    bind();
    document.querySelector('canvas').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 100, detail: 2 }));
    tap('mouse', 1);
    document.querySelector('canvas').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 100, detail: 2 }));
    tap('pen', 2); vi.advanceTimersByTime(600);
    document.querySelector('canvas').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 100, detail: 2 }));
    expect(invokeToolGateway).not.toHaveBeenCalled();
});

test.each(['pen', 'touch', 'mouse'])('a single %s background tap selects the project only after the double-tap window', kind => {
    bind(); tap(kind, 1);
    expect(selections).not.toHaveBeenCalled();
    vi.advanceTimersByTime(520);
    expect(selections).toHaveBeenCalledExactlyOnceWith('pen_qa', 'replace');
});

test.each(['touch', 'mouse'])('a %s double-tap creates text without first selecting the background', kind => {
    bind(); tap(kind, 1); tap(kind, 2); vi.advanceTimersByTime(1000);
    expect(text).toHaveBeenCalledTimes(1); expect(selections).not.toHaveBeenCalled();
});

test('a pending background selection yields to a press on an object', () => {
    bind(); tap('touch', 1);
    window.dispatchEvent(new window.MouseEvent('pointerdown'));
    vi.advanceTimersByTime(1000);
    expect(selections).not.toHaveBeenCalled();
});
