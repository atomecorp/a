import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { afterAll, test } from 'vitest';

import { normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { hitTestBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_hit_test_runtime.js';
import {
    createBevyUiPointerRuntime, localBevyEventForTarget
} from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import {
    createProjectViewVisualInteractionRuntime
} from '../../eVe/domains/rendering/project_view_visual_interaction_runtime.js';
import { openProjectViewAtomeMenu } from '../../eVe/domains/rendering/project_view_item_actions.js';
import { createBevyUiMysticRuntime } from '../../eVe/intuition/ribbon/bevy_ui_mystic_runtime.js';
import { setMysticRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { projectViewVisualPanel } from '../../eVe/domains/rendering/project_view_visual_panel.js';
import { installIntuitionXMysticContextRuntime } from '../../eVe/intuition/mystic/context.js';
import { closeMysticMenu } from '../../eVe/intuition/mystic/index.js';

// The project Visual preview is a BevyUI node, so its press is owned by the
// BevyUI pointer runtime — not by the canvas surface. A long press on the media
// opens the Flower from that node; from that instant the menu owns the gesture,
// and the preview must never follow the finger behind it.
const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project" width="640" height="480"></canvas>');
const { window } = dom;
Object.assign(globalThis, {
    window, document: window.document, Element: window.Element,
    HTMLElement: window.HTMLElement, CustomEvent: window.CustomEvent
});
globalThis.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 1);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
window.__eveWorkspaceMode = { projectId: 'probe_project', mode: 'edit' };
window.Atome = {
    getStateCurrent: async () => ({
        capabilities: { read: true, write: true, edit: true, create: true }, properties: {}
    })
};

const TREE_ID = 'eve_bevy_ui_project_view';
const PANEL_ID = 'project_view_visual';
const PANEL_W = 320;
const PANEL_H = 240;
const POINTER_ID = 7;
const MEDIA_POINT = { x: 150, y: 110 };
const RECT = { left: 0, top: 0, width: 640, height: 480, right: 640, bottom: 480 };
const wait = (ms) => delay(ms);
// Real gestures are separated by frames: without this beat the release would
// land before the asynchronous press finished arming.
const tick = () => delay(8);

afterAll(() => window.close());

const createHarness = ({ visualPanel = null, type = 'video', composite = false } = {}) => {
    const canvas = document.getElementById('eve_surface_project');
    canvas.getBoundingClientRect = () => RECT;
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    canvas.hasPointerCapture = () => true;
    document.elementFromPoint = () => canvas;
    document.elementsFromPoint = () => [canvas];

    const record = {
        atome_id: 'media_atom',
        type,
        properties: { left: 40, top: 40, width: 200, height: 150, media_url: '/v.mp4' }
    };
    const intents = [];
    const harness = { intents, menuOpens: 0, pointerState: null, mysticRuntime: null };

    const visualRuntime = createProjectViewVisualInteractionRuntime({
        emitIntent: ({ intent }) => { intents.push(intent); return intent; },
        openAtomeMenu: (args) => { harness.menuOpens += 1; return openProjectViewAtomeMenu(args); },
        feedRail: async () => ({ ok: true })
    });
    const invoke = (method, event) => visualRuntime[method]({
        event, record, width: PANEL_W, height: PANEL_H
    });
    const interaction = {
        press: (event) => invoke('press', event),
        drag: (event) => invoke('drag', event),
        release: (event) => invoke('release', event),
        cancel: (event) => invoke('cancel', event),
        activate: (event) => invoke('activate', event),
        double_click: (event) => invoke('doubleClick', event),
        long_press: (event) => invoke('longPress', event)
    };

    const handlers = new Map();
    if (visualPanel) visualPanel.setSubject(record, { records: composite ? [
        { atome_id: 'page_frame', type: 'group', properties: { left: 40, top: 40, width: 200, height: 150, container_kind: 'page' } },
        record, { ...record, atome_id: 'front_text', type: 'text', properties: { ...record.properties, text: 'Welcome', z_index: 2 } }
    ] : [] });
    const preview = visualPanel?.build({ width: PANEL_W, height: PANEL_H });
    const root = normalizeBevyUiTree({
        id: TREE_ID,
        tree: preview ? { ...preview, style: { ...preview.style, position: [30, 25] } } : {
            id: PANEL_ID, kind: 'pointer_capture',
            style: { position: [0, 0], size: [PANEL_W, PANEL_H], overflow: 'hidden' },
            on: interaction
        },
        handlers
    }).root;
    const hitAt = (point) => {
        const hit = hitTestBevyUiNode(root, point);
        return hit ? {
            treeId: TREE_ID, nodeId: hit.node.id, kind: hit.node.kind,
            box: hit.box, scrollAncestors: hit.scrollAncestors || []
        } : null;
    };

    harness.pointerState = {
        lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null,
        hoverTarget: null, pendingTextActivation: null, handlers
    };
    const pointerRuntime = createBevyUiPointerRuntime({
        state: harness.pointerState,
        holdDelayMs: 20,
        hitTestTrees: (_canvas, point) => hitAt(point),
        localEventForTarget: localBevyEventForTarget,
        emitUiEvents: (events) => events.filter(Boolean).forEach((event) => {
            const handler = handlers.get(`${event.tree_id}:${event.node_id}:${event.event}`);
            if (typeof handler === 'function') handler(event);
        }),
        // The Visual preview has no scrollable ancestor: the real runtime then
        // reports `false` from `end()`.
        scrollRuntime: {
            begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false
        }
    });

    const mounted = new Map();
    const stubRuntime = {
        mountTree: async ({ id, tree }) => { mounted.set(id, tree); return tree; },
        updateTree: async ({ id, tree }) => { mounted.set(id, tree); return tree; },
        unmountTree: async (id) => { mounted.delete(id); },
        hitTestAtClientPoint: ({ clientX, clientY }) => {
            const hit = hitAt({ x: clientX - RECT.left, y: clientY - RECT.top });
            return hit ? { treeId: TREE_ID, nodeId: hit.nodeId, box: hit.box } : null;
        },
        surfacePointFromEvent: (_surface, event) => ({ x: event.clientX, y: event.clientY }),
        // The real BevyUI owner of the captured pointer.
        cancelPointerGesture: pointerRuntime.cancelPointerGesture
    };
    window.eveBevyUiRuntime = stubRuntime;
    const surface = { clientWidth: 640, clientHeight: 480, getBoundingClientRect: () => RECT };
    let frameTime = 0;
    harness.mysticRuntime = createBevyUiMysticRuntime({
        surfaceResolver: () => surface,
        runtimeResolver: () => stubRuntime,
        requestFrame: (callback) => window.setTimeout(() => callback(frameTime += 300), 0),
        cancelFrame: (id) => window.clearTimeout(id),
        surfaceSizeSubscriber: () => () => {},
        assistantOpener: async () => true
    });
    setMysticRuntime(harness.mysticRuntime);

    harness.route = (phase, point) => pointerRuntime.routePointerEvent({
        canvas, phase, point,
        event: { pointerId: POINTER_ID, pointerType: 'touch', isPrimary: true, button: 0 }
    });
    harness.moveIntents = () => intents.filter((intent) => (
        intent.kind === 'drag.move' || intent.kind === 'resize.move'
    ));
    harness.endIntents = () => intents.filter((intent) => (
        intent.kind === 'drag.end' || intent.kind === 'resize.end'
    ));
    return harness;
};

test('the visual preview follows a plain drag when no menu owns the pointer', { timeout: 20000 }, async () => {
    const harness = createHarness();
    closeMysticMenu();
    await wait(20);
    harness.intents.length = 0;
    harness.route('pointerdown', MEDIA_POINT); await tick();
    harness.route('pointermove', { x: 190, y: 140 }); await tick();
    harness.route('pointermove', { x: 230, y: 170 }); await tick();
    harness.route('pointerup', { x: 230, y: 170 });
    await wait(30);

    assert.ok(harness.moveIntents().length >= 1, 'a plain drag still moves the media');
    assert.equal(
        harness.endIntents().some((intent) => intent.commit === true), true,
        'and its release still commits the move'
    );
});

test('a long press hands the visual preview gesture over to the Flower', { timeout: 20000 }, async () => {
    const harness = createHarness();
    closeMysticMenu();
    await wait(30);
    harness.intents.length = 0;

    harness.route('pointerdown', MEDIA_POINT);
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && harness.mysticRuntime.isOpen() !== true) await wait(2);
    assert.equal(harness.menuOpens, 1, 'the long press opens the media menu from the preview');
    assert.equal(harness.mysticRuntime.isOpen(), true, 'the Flower is open');

    const movesAtOpen = harness.moveIntents().length;
    for (const step of [1, 2, 3, 4, 5, 6]) {
        harness.route('pointermove', { x: MEDIA_POINT.x, y: MEDIA_POINT.y - step * 18 });
        await wait(12);
    }
    harness.route('pointerup', { x: MEDIA_POINT.x, y: MEDIA_POINT.y - 6 * 18 });
    await wait(60);

    assert.equal(harness.moveIntents().length - movesAtOpen, 0,
        'the preview never follows the finger behind the open Flower');
    assert.equal(harness.endIntents().some((intent) => intent.commit === true), false,
        'the gesture is cancelled, never committed behind the menu');
    assert.equal(harness.mysticRuntime.isOpen(), true, 'the Flower stays open');
    assert.equal(harness.pointerState.pointerTarget, null, 'the BevyUI owner let the pointer go');

    // The menu owns one gesture, not the panel: the very next drag still works.
    closeMysticMenu();
    await wait(30);
    harness.intents.length = 0;
    harness.route('pointerdown', MEDIA_POINT); await tick();
    harness.route('pointermove', { x: MEDIA_POINT.x + 60, y: MEDIA_POINT.y + 30 }); await tick();
    harness.route('pointerup', { x: MEDIA_POINT.x + 60, y: MEDIA_POINT.y + 30 });
    await wait(30);
    assert.ok(harness.moveIntents().length >= 1, 'the panel is not left frozen after the hand-over');
});

test.each([['video', false, 'media_atom', 'video'], ['text', false, 'media_atom', 'text'], ['video', true, 'front_text', 'text']])('right-click opens Mystic once on the displayed %s preview (composite=%s)', async (type, composite, expectedId, expectedKind) => {
    const harness = createHarness({ visualPanel: projectViewVisualPanel, type, composite });
    closeMysticMenu();
    await wait(30);
    const contexts = [];
    const dispose = installIntuitionXMysticContextRuntime({ resolveItems: context => { contexts.push(context); return []; } });
    const canvas = document.getElementById('eve_surface_project');
    const send = (type) => canvas.dispatchEvent(new window.MouseEvent(type, {
        bubbles: true, cancelable: true, button: 2, clientX: MEDIA_POINT.x, clientY: MEDIA_POINT.y
    }));
    try {
        send('pointerdown');
        send('pointerup');
        send('contextmenu');
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline && !harness.mysticRuntime.isOpen()) await wait(2);
        assert.equal(harness.mysticRuntime.isOpen(), true);
        assert.equal(contexts.length, 1);
        assert.equal(contexts[0].type, 'atome');
        assert.equal(contexts[0].atomeId, expectedId);
        assert.equal(contexts[0].kind, expectedKind);
        assert.equal(harness.moveIntents().length, 0);
        assert.equal(harness.endIntents().length, 0);
        send('pointerdown'); send('pointerup'); send('contextmenu');
        await wait(30);
        assert.equal(harness.mysticRuntime.isOpen(), false, 'another right-click closes Mystic');
        assert.equal(contexts.length, 1, 'closing does not reopen or dispatch twice');
        const hitTest = window.eveBevyUiRuntime.hitTestAtClientPoint;
        window.eveBevyUiRuntime.hitTestAtClientPoint = args => ({ ...hitTest(args), treeId: 'ordinary_panel' });
        send('pointerdown'); send('pointerup'); send('contextmenu');
        await wait(30);
        assert.equal(harness.mysticRuntime.isOpen(), false, 'an ordinary control still owns its point');
        assert.equal(contexts.length, 1);
        window.eveBevyUiRuntime.hitTestAtClientPoint = hitTest;
    } finally {
        dispose(); closeMysticMenu(); projectViewVisualPanel.reset();
    }
});
