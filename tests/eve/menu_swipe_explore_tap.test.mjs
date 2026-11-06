// The three menus (contextual rail, project ribbon, main ribbon) share one pointer route and one lens (user request of
// 2 Nov. 2026): a quick swipe along a bar that scrolls scrolls it and runs nothing; a slow exploration grows the tool under
// the finger and its release runs nothing; a short tap runs its tool once; a press that stops a glide is no tap; a swipe's
// suppression never swallows the next tap (the grown tool kept whole in a scrolling bar: bevy-core `linear_lens_tests.rs`).
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { LENS_FLING_PX_PER_MS } from '../../eVe/domains/rendering/bevy_ui_pointer_reveal_runtime.js';
import { createBevyMainMenuScrollRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_scroll_runtime.js';

const TREE = 'menu', TOOL = 'tool_a', NEXT = 'tool_b';
const box = { x: 0, y: 800, width: 60, height: 60 };
// One menu tool with a lens, on a bar that scrolls (`scrolls`), the release answering the tool under the finger.
const harness = ({ scrolls = true, gliding = false } = {}) => {
    let clock = 0;
    const events = [], scroll = { begun: 0, dragged: 0 };
    const lens = Object.assign((event) => {
        const phase = event.lens_phase;
        if (phase === 'press') return { armed: true, scrolls, slider: false };
        if (phase === 'engage') return { engaged: true };
        if (phase === 'move') return { hovered: { nodeId: NEXT, box } };
        if (phase === 'release') return { activate: { nodeId: NEXT, box } };
        return {};
    }, { lensAxis: 'x' });
    const handlers = new Map([[`${TREE}:${TOOL}:lens`, lens], [`${TREE}:${TOOL}:activate`, () => {}], [`${TREE}:${NEXT}:activate`, () => {}]]);
    const state = { handlers, lastSurfacePoints: new Map(), pointerTarget: null };
    const scrollRuntime = { begin: () => { scroll.begun += 1; }, drag: () => { if (!scroll.begun) return false; scroll.dragged += 1; return true; },
        end: () => scroll.dragged > 0, hover: () => {}, wheel: () => false, catchGlide: () => gliding };
    const runtime = createBevyUiPointerRuntime({ state, scrollRuntime, emitUiEvents: list => events.push(...list),
        hitTestTrees: () => ({ treeId: TREE, nodeId: TOOL, kind: 'icon_button', box, scrollAncestors: [] }),
        localEventForTarget: (target, event, point) => ({ node_id: target.nodeId, event, client_x: point.x, client_y: point.y }),
        schedule: () => 0, cancelSchedule: () => {}, now: () => clock });
    const canvas = {};
    const at = (x, ms) => { clock = ms; return { x, y: 830 }; };
    const route = (phase, point) => runtime.routePointerEvent({ canvas, phase, point, event: { pointerType: 'touch', pointerId: 1, button: 0 } });
    return { events, scroll, route, at, ran: () => events.filter(entry => entry.event === 'activate').map(entry => entry.node_id) };
};

test('a quick swipe along a bar that scrolls scrolls it and its release runs nothing', () => {
    const { route, at, scroll, ran } = harness();
    route('pointerdown', at(30, 0));
    // 40 px in 40 ms: well past the fling speed.
    assert.ok(40 / 40 >= LENS_FLING_PX_PER_MS);
    route('pointermove', at(70, 40));
    route('pointermove', at(150, 80));
    route('pointerup', at(150, 90));
    assert.equal(scroll.begun, 1);
    assert.ok(scroll.dragged > 0);
    assert.deepEqual(ran(), []);
});

test('a slow exploration grows the tool under the finger and its release runs nothing', () => {
    const { route, at, scroll, ran, events } = harness();
    route('pointerdown', at(30, 0));
    route('pointermove', at(40, 200));
    route('pointermove', at(52, 400));
    route('pointermove', at(90, 900));
    route('pointerup', at(90, 950));
    assert.equal(scroll.begun, 0);
    assert.ok(events.some(entry => entry.event === 'release'));
    assert.deepEqual(ran(), []);
});

test('a short tap runs its own tool once', () => {
    const { route, at, ran } = harness();
    route('pointerdown', at(30, 0));
    route('pointermove', at(33, 40));
    route('pointerup', at(33, 80));
    assert.deepEqual(ran(), [TOOL]);
});

test('a press that stops a glide is no tap', () => {
    const { route, at, ran } = harness({ gliding: true });
    route('pointerdown', at(30, 0));
    route('pointerup', at(30, 60));
    assert.deepEqual(ran(), []);
});

test('a swipe of the ribbon never swallows the next tap; a press while it still snaps is no tap', () => {
    const state = { scrollMaxPx: 300, scrollLeftPx: 0, itemSize: 60 };
    const scroll = createBevyMainMenuScrollRuntime({ state, render: () => null });
    scroll.press('tool_a', { x: 100, y: 800 });
    scroll.drag('tool_a', { x: 40, y: 800 });
    scroll.release('tool_a');
    clearTimeout(state.scrollSnapTimer); state.scrollSnapTimer = 0;
    // The swipe's release emitted no activation: the next tap on that tool runs.
    scroll.press('tool_a', { x: 100, y: 800 });
    assert.equal(scroll.consumeActivation('tool_a'), false);
    scroll.release('tool_a');
    // A press while the bar still snaps (its timer pending) stops it and is no tap.
    state.scrollSnapTimer = setTimeout(() => {}, 1000);
    scroll.press('tool_b', { x: 100, y: 800 });
    assert.equal(state.scrollSnapTimer, 0);
    assert.equal(scroll.consumeActivation('tool_b'), true);
});
