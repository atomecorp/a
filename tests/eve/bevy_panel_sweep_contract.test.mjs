// Panel quick mode: sliding from a tool opens its panel without lifting the
// pointer and releasing applies the action once before closing the panel. Panel
// trees never expose hover handlers or hover paint: scrolling content under a
// stationary pointer must not trigger visual changes or tree refreshes.

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createBevyUiPointerRuntime, localBevyEventForTarget } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { createBevyUiMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js';
import { registerPanelApi, clearPanelApi } from '../../eVe/intuition/runtime/panel_api.js';
import { createPanelSurfaceRuntime } from '../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js';
import {
    bevyPanelRuntimeState,
    closeBevyPanelSurface,
    openBevyPanelSurface,
    registerBevyPanelSurface
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js';
import { node, textNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createAtomeContextualEditHandlers } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_handlers.js';
import { createRuntimeHarness, findNode, installDom, waitMs } from './bevy_ui_main_menu_test_helpers.mjs';

const SWEEP_SURFACE = 'sweep_fixture';

// The fixture covers both an activate-only control and a control that attempts
// to declare local hover handlers. The panel runtime must remove both hover
// routes while retaining activation and quick-mode selection.
const registerSweepSurface = (surfaceKey = SWEEP_SURFACE) => {
    registerBevyPanelSurface({
        surfaceKey,
        title: 'Sweep fixture',
        defaultGeometry: { width: 320, height: 240 },
        onClose: () => { registerSweepSurface.closed += 1; },
        readState: () => ({ title: 'Sweep fixture' }),
        buildContent: (_state, { emit }) => [
            node('sweep_swatch', 'button', { size: [32, 32] }, [], {
                on: { activate: () => emit({ type: 'sweep.choose', value: 'swatch' }) }
            }),
            node('sweep_field', 'button', { size: [120, 32] }, [], {
                on: {
                    activate: () => emit({ type: 'sweep.choose', value: 'field' }),
                    hover: () => emit({ type: 'sweep.field.hover' }),
                    hover_leave: () => emit({ type: 'sweep.field.leave' })
                }
            }),
            // Un controle qui sait deja convertir le point de relachement en
            // valeur declare son propre `palette_choose` : il recoit l'evenement
            // local et le panneau se referme derriere lui.
            node('sweep_pick', 'button', { size: [32, 32] }, [], {
                on: {
                    palette_choose: (event) => { registerSweepSurface.picks.push(event?.x); return { ok: true }; },
                    palette_preview: (event) => { registerSweepSurface.previews.push(event?.x); },
                    palette_preview_leave: () => { registerSweepSurface.previews.push(null); }
                }
            }),
            textNode('sweep_label', 'Fixture', { size: [120, 24] })
        ],
        handleEvent: (intent) => {
            registerSweepSurface.chosen.push(intent?.type || '');
            return { ok: true };
        }
    });
};
registerSweepSurface.chosen = [];
registerSweepSurface.closed = 0;
registerSweepSurface.picks = [];
registerSweepSurface.previews = [];

const installPanelEnv = () => {
    const env = installDom();
    const previous = {
        CustomEvent: globalThis.CustomEvent,
        requestAnimationFrame: globalThis.requestAnimationFrame
    };
    const window = env.dom.window;
    window.__eveWorkspaceMode = { mode: 'project', projectId: 'sweep_fixture', transitioning: false };
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    globalThis.CustomEvent = window.CustomEvent;
    const mounted = [];
    window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => { mounted.push(tree); return tree; },
        updateTree: async ({ tree }) => { mounted.push(tree); return tree; },
        unmountTree: async (id) => ({ id })
    };
    setMainMenuRuntime({ showFully: async () => true, getReservedHeight: () => 74, handedness: 'right' }, window);
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    bevyPanelRuntimeState.definitions.clear();
    registerPanelApi(createPanelSurfaceRuntime());
    return {
        ...env,
        mounted,
        restore: () => {
            setMainMenuRuntime(null, window);
            clearPanelApi();
            globalThis.CustomEvent = previous.CustomEvent;
            globalThis.requestAnimationFrame = previous.requestAnimationFrame;
            env.restore();
        }
    };
};

test('every panel control answers quick mode without hover handlers or hover refreshes', async () => {
    const env = installPanelEnv();
    try {
        registerSweepSurface.chosen.length = 0;
        registerSweepSurface.closed = 0;
        registerSweepSurface();
        await openBevyPanelSurface(SWEEP_SURFACE);
        // The runtime mounts a `{ id, root }` envelope.
        const tree = () => env.mounted.at(-1)?.root;
        const swatch = findNode(tree(), 'sweep_swatch');
        assert.equal(typeof swatch.on.palette_choose, 'function');
        assert.notEqual(swatch.on.palette_choose, swatch.on.activate);
        assert.equal(swatch.on.hover, undefined);
        assert.equal(swatch.on.hover_leave, undefined);

        const field = findNode(tree(), 'sweep_field');
        assert.equal(typeof field.on.palette_choose, 'function');
        assert.equal(field.on.hover, undefined, 'panel-local hover handlers are removed centrally');
        assert.equal(field.on.hover_leave, undefined, 'panel-local hover leave handlers are removed centrally');

        const label = findNode(tree(), 'sweep_label');
        assert.equal(label.on, undefined, 'a passive node receives no gesture handler');
        const hoverNodes = [];
        const visit = (entry) => {
            if (!entry || typeof entry !== 'object') return;
            if (typeof entry.on?.hover === 'function' || typeof entry.on?.hover_leave === 'function') hoverNodes.push(entry.id);
            (entry.children || []).forEach(visit);
        };
        visit(tree());
        assert.deepEqual(hoverNodes, [], 'the complete panel tree is hover-free, including shared chrome');

        // Clic simple dans un panneau deja ouvert : l'action s'applique et le
        // panneau reste en place.
        findNode(tree(), 'sweep_swatch').on.activate({});
        await waitMs(5);
        assert.deepEqual(registerSweepSurface.chosen, ['sweep.choose']);
        assert.equal(registerSweepSurface.closed, 0);
        assert.equal(bevyPanelRuntimeState.mounted.has(SWEEP_SURFACE), true, 'a plain click keeps the panel open');

        // Relachement du mode rapide : l'action s'applique UNE fois, puis le
        // panneau se referme comme la palette qu'il copie.
        findNode(tree(), 'sweep_swatch').on.palette_choose({});
        await waitMs(5);
        assert.deepEqual(registerSweepSurface.chosen, ['sweep.choose', 'sweep.choose']);
        assert.equal(registerSweepSurface.closed, 1);
        assert.equal(bevyPanelRuntimeState.mounted.has(SWEEP_SURFACE), false, 'the quick-mode choice closes the panel');
        // Un second relachement ne referme pas deux fois.
        findNode(tree(), 'sweep_swatch').on.palette_choose({});
        await waitMs(5);
        assert.equal(registerSweepSurface.closed, 1);

        // Un controle qui declare son propre choix rapide garde sa route, recoit
        // le point de relachement et le panneau se referme sur le meme geste.
        const reopen = await openBevyPanelSurface(SWEEP_SURFACE);
        assert.equal(reopen.ok, true);
        await waitMs(5);
        const pick = findNode(tree(), 'sweep_pick');
        assert.equal(typeof pick.on.palette_choose, 'function');
        assert.equal(typeof pick.on.palette_preview, 'function', 'the palette preview pair survives the sweep decorator');
        assert.equal(typeof pick.on.palette_preview_leave, 'function');
        assert.equal(typeof pick.on.hover, 'undefined', 'only hover is removed centrally');
        registerSweepSurface.picks.length = 0;
        pick.on.palette_choose({ x: 12 });
        await waitMs(5);
        assert.deepEqual(registerSweepSurface.picks, [12], 'the release point reaches the declared pick');
        assert.equal(registerSweepSurface.closed, 2, 'the panel closes after a declared quick-mode pick');
        await closeBevyPanelSurface(SWEEP_SURFACE);
    } finally {
        env.restore();
    }
});

const sweepContent = () => ({
    // Les cles sont celles des RACINES du menu principal (context_menus.json ->
    // menus.main.roots) : le niveau par defaut filtre tout ce qui n'en fait pas
    // partie, et un harnais qui invente ses cles ne monte rien.
    toolbox: { children: ['find', 'communicate', 'create'] },
    find: {
        label: 'trouver', icon: 'search', type: 'tool', action: 'momentary', latch: true,
        atome_tool: true, tool_id: 'tool.main.find',
        active: () => ({ ok: true }), inactive: () => ({ ok: true })
    },
    communicate: {
        label: 'communication', icon: 'communicate', type: 'tool', action: 'toggle',
        atome_tool: true, tool_id: 'tool.main.communicate',
        active: () => ({ ok: true }), inactive: () => ({ ok: true })
    },
    create: {
        label: 'mode', icon: 'settings', type: 'palette', tool_type: 'palette',
        children: ['mode_edit'], action: 'momentary', atome_tool: true, tool_id: 'tool.main.create'
    },
    mode_edit: { label: 'edition', icon: 'tool', type: 'tool', action: 'momentary', tool_id: 'ui.mode.edit' }
});

test('a panel tool sweeps and holds through one reveal while a palette keeps its own route', async () => {
    const invocations = [];
    const openSurfaces = new Set();
    registerPanelApi({
        openPanelSurface: async (key) => { openSurfaces.add(key); return { ok: true }; },
        closePanelSurface: async (key) => { openSurfaces.delete(key); return { ok: true }; },
        isPanelSurfaceOpen: (key) => openSurfaces.has(String(key || '').trim())
    });
    const harness = createRuntimeHarness({
        content: sweepContent(),
        onInvoke: (entry, source, payload) => {
            invocations.push({ key: entry?.key, source, actionOverride: payload?.actionOverride || '' });
            return { ok: true };
        }
    });
    const tree = () => harness.calls.at(-1).payload.tree?.root;
    const ribbonTool = (key) => findNode(tree(), `eve_bevy_ui_main_menu_tool_${key}`);
    try {
        await harness.runtime.showFully();
        const findTool = ribbonTool('find');
        assert.equal(typeof findTool.on.palette_slide_open, 'function');
        // Holding is owned by the pointer lens, not a second native long-press route.
        assert.equal(findTool.on.long_press, undefined);
        assert.equal(typeof findTool.on.press, 'function');
        assert.equal(typeof findTool.on.release, 'function');

        await findTool.on.palette_slide_open({});
        assert.deepEqual(invocations, [{ key: 'find', source: 'bevy_ui.activate', actionOverride: 'state.on' }]);

        // Panneau deja ouvert : le glissement ne le bascule jamais en fermeture.
        openSurfaces.add('finder');
        await findTool.on.palette_slide_open({});
        await findTool.on.palette_slide_open({});
        assert.equal(invocations.length, 1, 'an open panel is never toggled shut by the reveal');
        openSurfaces.delete('finder');

        const communicateTool = ribbonTool('communicate');
        invocations.length = 0;
        await communicateTool.on.palette_slide_open({});
        assert.deepEqual(invocations, [{ key: 'communicate', source: 'bevy_ui.activate', actionOverride: 'state.on' }]);

        // Une palette garde sa route de glissement et n'ouvre aucun appui
        // immobile : ce lot ne change rien a son comportement.
        const modeTool = ribbonTool('create');
        assert.equal(typeof modeTool.on.palette_slide_open, 'function');
        assert.equal(modeTool.on.long_press, undefined);
    } finally {
        harness.runtime.destroy();
        harness.restore();
        clearPanelApi();
    }
});

test('the contextual rail reveals a panel case and keeps a panel hold as its single owner', () => {
    const runs = [];
    const railState = { activePaletteKey: '', activeAtomeId: 'shape', railScrollOffset: 0 };
    const build = () => createAtomeContextualEditHandlers({
        state: railState,
        keyOf: (value) => String(value == null ? '' : value).trim(),
        scheduleRender: () => {},
        definitions: () => [
            { key: 'couleur', label: 'colorize', toolId: 'tool.main.couleur' },
            { key: 'paste', label: 'coller', toolId: 'tool.main.paste', longPressToolId: 'ui.paste.panel' }
        ],
        sliderHandlers: () => ({}),
        runActiveDefinition: (definition, payload) => runs.push({
            key: definition.key, toolId: definition.toolId, source: payload?.source
        }),
        announceChange: () => {},
        activeToolIds: () => null
    });
    const openSurfaces = new Set();
    registerPanelApi({
        openPanelSurface: async (key) => { openSurfaces.add(key); return { ok: true }; },
        closePanelSurface: async (key) => { openSurfaces.delete(key); return { ok: true }; },
        isPanelSurfaceOpen: (key) => openSurfaces.has(String(key || '').trim())
    });
    try {
        const handlers = build();
        const color = handlers.atome_contextual_tool_couleur;
        assert.equal(typeof color.activate, 'function');
        assert.equal(typeof color.palette_slide_open, 'function');
        // Le glissement emprunte EXACTEMENT l'invocation du clic, sans fermer.
        color.palette_slide_open();
        assert.deepEqual(runs, [{ key: 'couleur', toolId: 'tool.main.couleur', source: 'bevy_ui.activate' }]);

        openSurfaces.add('couleur');
        color.palette_slide_open();
        assert.equal(runs.length, 1, 'an open panel is never toggled shut by the reveal');
        openSurfaces.delete('couleur');

        // Coller : l'appui long ouvre deja son panneau ; le glissement appelle
        // cette seule route, jamais une seconde.
        const paste = handlers.atome_contextual_tool_paste;
        assert.equal(typeof paste.long_press, 'function');
        assert.equal(paste.palette_slide_open, paste.long_press);
        runs.length = 0;
        paste.palette_slide_open();
        assert.deepEqual(runs, [{ key: 'paste_long_press', toolId: 'ui.paste.panel', source: 'bevy_ui.long_press' }]);
        assert.equal(railState.activePaletteKey, '', 'the panel route never leaves a palette open');
    } finally {
        clearPanelApi();
    }
});

test('the shared pointer route applies the release on the panel control and never activates the tool', () => {
    const emitted = [];
    const ribbonTarget = {
        treeId: 'ribbon', nodeId: 'tool_couleur', kind: 'icon_button',
        box: { x: 0, y: 0, width: 60, height: 60 }
    };
    const panelTarget = {
        treeId: 'panel', nodeId: 'panel_swatch_red', kind: 'button',
        box: { x: 0, y: 0, width: 32, height: 32 }
    };
    const handlers = new Map([
        ['ribbon:tool_couleur:press', () => {}],
        ['ribbon:tool_couleur:release', () => {}],
        ['ribbon:tool_couleur:drag', () => {}],
        ['ribbon:tool_couleur:activate', () => emitted.push({ event: 'activate', node: ribbonTarget.nodeId })],
        ['ribbon:tool_couleur:palette_slide_open', () => emitted.push({ event: 'palette_slide_open' })],
        ['panel:panel_swatch_red:palette_choose', () => emitted.push({ event: 'palette_choose', node: panelTarget.nodeId })],
        ['panel:panel_swatch_red:hover', () => emitted.push({ event: 'hover', node: panelTarget.nodeId })],
        ['panel:panel_swatch_red:hover_leave', () => emitted.push({ event: 'hover_leave', node: panelTarget.nodeId })]
    ]);
    const state = {
        handlers,
        lastSurfacePoints: new Map(),
        hoverTarget: null,
        pointerTarget: null,
        focusTarget: null,
        pendingTextActivation: null
    };
    const runtime = createBevyUiPointerRuntime({
        state,
        hitTestTrees: (_canvas, point) => (point.y > 400 ? ribbonTarget : panelTarget),
        localEventForTarget: (target, event, point) => ({ target, event, point }),
        emitUiEvents: (events) => {
            events.forEach((entry) => {
                const handler = handlers.get(`${entry.target.treeId}:${entry.target.nodeId}:${entry.event}`);
                handler?.(entry);
            });
        },
        scrollRuntime: { begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false }
    });
    const canvas = {};
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 30, y: 470 }, event: {} });
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: { x: 30, y: 420 }, event: {} });
    assert.deepEqual(emitted.map((entry) => entry.event), ['palette_slide_open']);
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: { x: 80, y: 200 }, event: {} });
    assert.deepEqual(emitted.map((entry) => entry.event), ['palette_slide_open', 'hover']);
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 80, y: 200 }, event: {} });
    // Le relachement applique le choix ET retire l'anneau de survol.
    assert.deepEqual(emitted.map((entry) => entry.event), ['palette_slide_open', 'hover', 'hover_leave', 'palette_choose']);
    assert.equal(emitted.some((entry) => entry.event === 'activate'), false, 'the tool itself is never activated by a sweep');

    // Le tap simple garde son comportement : un appui sans glissement active l'outil.
    emitted.length = 0;
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 30, y: 470 }, event: {} });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 30, y: 470 }, event: {} });
    assert.deepEqual(emitted.map((entry) => entry.event), ['activate']);
});

test('a held palette gesture previews the choice under the finger and reverts when it leaves', () => {
    const state = {
        handlers: new Map(),
        lastSurfacePoints: new Map(),
        capturedPointerHandlers: new Map(),
        paletteHoverTarget: null,
        hoverTarget: null,
        pointerTarget: null
    };
    const names = [];
    const previews = [];
    const leaves = [];
    const dispatch = (list) => list.forEach((event) => {
        names.push(event.event);
        if (event.event === 'palette_preview') previews.push(event);
        if (event.event === 'palette_preview_leave') leaves.push(event);
        state.handlers.get(`${event.tree_id}:${event.node_id}:${event.event}`)?.(event);
    });
    const tool = { treeId: 'menu', nodeId: 'tool_color', kind: 'icon_button', box: { x: 0, y: 0, width: 60, height: 60 } };
    const wheel = { treeId: 'panel', nodeId: 'color_wheel_capture', kind: 'pointer_capture', box: { x: 100, y: 100, width: 200, height: 200 } };
    state.handlers.set('menu:tool_color:palette_slide_open', () => {});
    state.handlers.set('panel:color_wheel_capture:palette_choose', () => {});
    state.handlers.set('panel:color_wheel_capture:palette_preview', () => {});
    state.handlers.set('panel:color_wheel_capture:palette_preview_leave', () => {});
    const pointer = createBevyUiPointerRuntime({
        state,
        hitTestTrees: (_canvas, point) => (
            point.y < 80 ? tool : (point.x >= 100 && point.y >= 100 ? wheel : null)
        ),
        localEventForTarget: localBevyEventForTarget,
        emitUiEvents: dispatch,
        scrollRuntime: { begin() {}, drag() { return false; }, end() { return false; }, hover() {}, wheel() { return false; } }
    });
    const canvas = {};
    const move = (x, y) => pointer.routePointerEvent({ canvas, phase: 'pointermove', point: { x, y, rectLeft: 0, rectTop: 0 }, event: { pointerId: 7 } });

    // An ordinary hover (no held gesture) must never preview: that is the path a
    // scrolling panel sees, and it must stay paint-free.
    move(200, 200);
    assert.equal(previews.length, 0, 'an ordinary hover does not preview');
    assert.equal(leaves.length, 0);

    pointer.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 10, y: 10, rectLeft: 0, rectTop: 0 }, event: { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 } });
    move(10, 40);      // the slide reveals the panel under the finger
    move(200, 220);    // the finger lands on the colour wheel
    assert.equal(previews.length, 1, 'the held sweep previews the wheel under the finger');
    assert.equal(previews[0].tree_id, 'panel');
    assert.equal(previews[0].node_id, 'color_wheel_capture');
    assert.equal(previews[0].x, 100, 'the preview carries the point inside the wheel');
    assert.equal(previews[0].y, 120);

    // Sliding inside the same element keeps following: the preview is re-sent
    // with the new point instead of freezing on the colour the finger entered
    // on. This is what lets the object's background track the finger.
    move(160, 260);
    assert.equal(previews.length, 2, 'moving inside the wheel keeps previewing');
    assert.equal(previews[1].x, 60);
    assert.equal(previews[1].y, 160);
    assert.equal(leaves.length, 0, 'staying inside the wheel does not revert');

    move(50, 220);     // off every colour element
    assert.equal(leaves.length, 1, 'leaving the colour element reverts the preview');
    assert.equal(leaves[0].node_id, 'color_wheel_capture');

    pointer.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 50, y: 220, rectLeft: 0, rectTop: 0 }, event: { pointerId: 7 } });
    assert.ok(names.includes('palette_choose') === false, 'releasing off the wheel chooses nothing');
});
