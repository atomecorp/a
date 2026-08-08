import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    beginBevyToolSliderSession,
    buildBevyVerticalToolSliderNode,
    closeBevyToolSliderSession,
    dragBevyToolSliderSession,
    releaseBevyToolSliderSession,
    resolveBevyToolSliderConfig
} from '../../eVe/intuition/shared/bevy_ui_tool_slider.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';

const findNode = (node, id) => {
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

test('shared vertical tool slider renders an upward compact anchor and clamps its session', () => {
    const config = resolveBevyToolSliderConfig({ min: 0, max: 100, step: 10 });
    const started = beginBevyToolSliderSession(50, config);
    const raised = dragBevyToolSliderSession(started, -180, 180, config);
    const lowered = dragBevyToolSliderSession(started, 360, 180, config);
    assert.equal(raised.value, 100);
    assert.equal(lowered.value, 0);
    assert.equal(closeBevyToolSliderSession(raised, { cancelled: true }).value, 50);

    const collapsed = buildBevyVerticalToolSliderNode({ id: 'slider', label: 'Size', value: 50 });
    assert.deepEqual(collapsed.style.size, [60, 60]);
    assert.equal(findNode(collapsed, 'slider_rail'), null);

    const expanded = buildBevyVerticalToolSliderNode({
        id: 'slider', label: 'Size', value: 50, unit: '%', expanded: true
    });
    assert.deepEqual(expanded.style.size, [60, 180]);
    assert.deepEqual(findNode(expanded, 'slider_background').style.position, [0, 120]);
    assert.equal(findNode(expanded, 'slider_value').text, '50 %');
    assert.ok(findNode(expanded, 'slider_rail'));
    assert.ok(findNode(expanded, 'slider_thumb'));
});

test('shared tool slider distinguishes pinned clicks from transient direct drags', () => {
    const config = resolveBevyToolSliderConfig({ min: 0, max: 100, step: 1 });
    const pressed = beginBevyToolSliderSession(50, config);
    const pinned = releaseBevyToolSliderSession(pressed, { compactAnchor: true });
    assert.equal(pinned.expanded, true);
    assert.equal(pinned.pinned, true);

    const pinnedPress = beginBevyToolSliderSession(pinned.value, config, {
        expanded: pinned.expanded,
        pinned: pinned.pinned,
        compactAnchor: true
    });
    const closed = releaseBevyToolSliderSession(pinnedPress, { compactAnchor: true });
    assert.equal(closed.expanded, false);
    assert.equal(closed.pinned, false);

    const transientPress = beginBevyToolSliderSession(50, config);
    const jitter = dragBevyToolSliderSession(transientPress, -3, 100, config);
    assert.equal(jitter.dragged, false);
    assert.equal(jitter.value, 50);
    const dragged = dragBevyToolSliderSession(jitter, -7, 100, config);
    assert.equal(dragged.dragged, true);
    assert.equal(dragged.value, 60);
    const transientEnd = releaseBevyToolSliderSession(dragged);
    assert.equal(transientEnd.expanded, false);
    assert.equal(transientEnd.pinned, false);

    const pinnedRailPress = beginBevyToolSliderSession(60, config, {
        expanded: true,
        pinned: true,
        compactAnchor: false
    });
    const pinnedDrag = dragBevyToolSliderSession(pinnedRailPress, -10, 100, config);
    const pinnedEnd = releaseBevyToolSliderSession(pinnedDrag, { compactAnchor: false });
    assert.equal(pinnedEnd.expanded, true);
    assert.equal(pinnedEnd.pinned, true);
});

test('a tool slider owns its vertical drag instead of starting panel scroll', () => {
    const emitted = [];
    const scrollCalls = { begin: 0, drag: 0, end: 0 };
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const target = { treeId: 'panel', nodeId: 'slider', kind: 'tool_slider', box: {}, scrollAncestors: [{}] };
    const runtime = createBevyUiPointerRuntime({
        state: { lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null, hoverTarget: null, pendingTextActivation: null },
        hitTestTrees: () => target,
        localEventForTarget: (_, type, __, delta) => ({ type, delta }),
        emitUiEvents: (events) => emitted.push(...events),
        scrollRuntime: {
            begin: () => { scrollCalls.begin += 1; },
            drag: () => { scrollCalls.drag += 1; return true; },
            end: () => { scrollCalls.end += 1; return true; },
            hover: () => {}, wheel: () => false
        }
    });
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 10, y: 100 }, event: { pointerId: 4 } });
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: { x: 10, y: 70 }, event: { pointerId: 4 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 10, y: 70 }, event: { pointerId: 4 } });
    assert.deepEqual(scrollCalls, { begin: 0, drag: 0, end: 0 });
    assert.deepEqual(emitted.map((event) => event.type), ['press', 'focus', 'drag', 'release', 'activate']);
});
