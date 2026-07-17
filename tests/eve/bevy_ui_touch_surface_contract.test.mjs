import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { clearAllProjectScenes, getProjectSceneState } from '../../eVe/domains/rendering/project_scene_runtime.js';
import { buildAtomeContextualEditTree } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_model.js';
import { createAtomeContextualEditRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js';

test('BevyUI canvas binding owns touch gestures for mobile pointer scroll', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.getElementById('eve_surface_project');
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => null,
        requestFrame: () => 0
    });

    await runtime.mountTree({
        id: 'touch_tree',
        surface,
        tree: {
            id: 'touch_root',
            kind: 'root',
            style: { size: [120, 80] },
            children: [{ id: 'scroll_target', kind: 'scroll_area', style: { size: [120, 80] } }]
        }
    });

    assert.equal(surface.style.touchAction, 'none');
    surface.getBoundingClientRect = () => ({ left: 20, top: 30, width: 120, height: 80 });
    assert.deepEqual(runtime.hitTestAtClientPoint({ surface, clientX: 40, clientY: 50 }), {
        treeId: 'touch_tree',
        nodeId: 'scroll_target',
        kind: 'scroll_area',
        box: { x: 0, y: 0, width: 120, height: 80 }
    });
    assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 200, clientY: 200 }), null);
    assert.equal(dom.window.document.querySelectorAll('button, input, [data-bevy-ui]').length, 0);
});

const findNode = (node, id) => {
    if (node?.id === id) return node;
    for (const child of node?.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};

test('Atome contextual edit stays on one clipped Bevy tree with handed rail and 3x slider', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const records = [{ id: 'a', properties: { left: 40, top: 50, width: 200, height: 120 } }, {
        id: 'b', properties: { left: 300, top: 70, width: 160, height: 90 }
    }];
    const input = {
        surface, records, editing: [{ atomeId: 'a' }, { atomeId: 'b' }], activeAtomeId: 'a',
        fullscreenAtomeId: 'a', definitions: [{ key: 'size', toolType: 'slider' }],
        sliderStateByKey: new Map([['size', { expanded: true }]])
    };
    const right = buildAtomeContextualEditTree(input);
    const rail = findNode(right.root, 'eve_bevy_panel_atome_contextual_edit_rail');
    assert.deepEqual(rail.style.position, [748, 392]);
    assert.equal(rail.children.length, 1);
    assert.deepEqual(findNode(rail, 'atome_contextual_tool_size_background').style.size, [52, 156]);
    assert.equal(findNode(right.root, 'atome_contextual_edit_b_footer'), null);
    assert.equal(findNode(rail, 'atome_contextual_tool_size').style.size[1], 156);
    const left = buildAtomeContextualEditTree({ ...input, handedness: 'left' });
    assert.equal(findNode(left.root, 'eve_bevy_panel_atome_contextual_edit_rail').style.position[0], 0);
});

test('Atome contextual footer follows projected media bounds and uses compact dark chrome', () => {
    const tree = buildAtomeContextualEditTree({
        surface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
        records: [{ id: 'media', properties: { left: 40, top: 50, width: 120 } }],
        geometryByAtomeId: new Map([['media', { x: 40, y: 50, width: 310, height: 420 }]]),
        editing: [{ atomeId: 'media', kind: 'image' }], activeAtomeId: 'media',
        definitions: [{ key: 'detail', label: 'detail', toolType: 'standard' }]
    });
    const footer = findNode(tree.root, 'atome_contextual_edit_media_footer');
    const background = findNode(tree.root, 'atome_contextual_edit_media_footer_background');
    assert.deepEqual(footer.style.position, [40, 470]);
    assert.deepEqual(footer.style.size, [310, 24]);
    assert.deepEqual(background.style.background, [0.12, 0.13, 0.17, 0.98]);
    assert.ok(findNode(tree.root, 'atome_contextual_tool_detail_background'));
});

test('Atome contextual rail projects visible tool records inside the lateral rail', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const rgba = new Uint8Array([255, 255, 255, 255]);
    const runtime = createEveBevyUiRuntime({
        nativeUiEnabled: false,
        imageResolverFactory: () => async () => ({ width: 1, height: 1, rgba }),
        requestFrame: (callback) => { callback(); return 1; }
    });
    const tree = buildAtomeContextualEditTree({
        surface, records: [{ id: 'a', properties: { left: 40, top: 50, width: 200, height: 120 } }],
        editing: [{ atomeId: 'a', kind: 'image' }], activeAtomeId: 'a',
        definitions: [{ key: 'detail', label: 'detail', icon: 'edit', toolType: 'standard' }]
    });
    await runtime.mountTree({ id: tree.id, surface, tree });
    const projected = getProjectSceneState('__eve_dashboard_workspace__');
    const tool = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_background'));
    const toolIcon = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_icon_image'));
    const toolLabel = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_label_text'));
    const footer = projected.records.find((record) => record.id.includes('atome_contextual_edit_a_footer_background'));
    const footerTitle = projected.records.find((record) => record.id.includes('atome_contextual_edit_a_title_text'));
    assert.deepEqual([tool.properties.left, tool.properties.top, tool.properties.width, tool.properties.height], [748, 496, 52, 52]);
    assert.deepEqual([footer.properties.left, footer.properties.top, footer.properties.width, footer.properties.height], [40, 170, 200, 24]);
    assert.ok(toolIcon.properties.renderLayer > tool.properties.renderLayer);
    assert.ok(toolLabel.properties.renderLayer > tool.properties.renderLayer);
    assert.ok(footerTitle.properties.renderLayer > footer.properties.renderLayer);
});

test('Atome contextual runtime keeps local edits and emits one canonical homothetic resize commit', async () => {
    const records = [{ id: 'a', properties: { left: 40, top: 30, width: 200, height: 100 } }, {
        id: 'b', properties: { left: 300, top: 40, width: 120, height: 80 }
    }];
    const scene = { project_id: 'project', records, text: null };
    const rendered = [];
    const intents = [];
    const runtime = createAtomeContextualEditRuntime({
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        emitSceneIntent: async ({ intent }) => { intents.push(intent); return { ok: true }; },
        findSceneByAtomeId: (id) => records.some((record) => record.id === id) ? scene : null,
        readSceneState: () => scene, hitTestScene: () => null, readMainMenuHeight: () => 52,
        updateSceneRecord: async ({ atomeId, properties }) => Object.assign(records.find((record) => record.id === atomeId).properties, properties)
    });
    runtime.enter({ atomeId: 'a', kind: 'shape' });
    runtime.enter({ atomeId: 'b', kind: 'image' });
    runtime.exit({ atomeId: 'b' });
    assert.deepEqual(runtime.readState().editingAtomeIds, ['a']);
    assert.equal(runtime.readState().menuVisible, false);
    runtime.activate({ atomeId: 'a' });
    await runtime.render();
    const grip = findNode(rendered.at(-1).root, 'atome_contextual_edit_a_resize_left');
    grip.on.press({ client_x: 40, client_y: 130 });
    grip.on.drag({ delta_x: 20, delta_y: 0 });
    grip.on.release();
    await Promise.resolve();
    assert.deepEqual(intents.map((intent) => intent.kind), ['resize.start', 'resize.move', 'resize.end']);
    assert.deepEqual(intents[2].props, { left: 60, width: 180, height: 90 });
    assert.equal(intents[2].commit, true);
});

test('canonical vertical slider is relative for touch and collapses on mouse cancel or stylus capture loss', async () => {
    const dom = new JSDOM('<!doctype html><button id="slider"></button>');
    const { window } = dom;
    Object.assign(globalThis, {
        window, document: window.document, Node: window.Node, Element: window.Element,
        HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
        CustomEvent: window.CustomEvent, Event: window.Event, MouseEvent: window.MouseEvent,
        getComputedStyle: window.getComputedStyle.bind(window)
    });
    class PointerEventShim extends window.MouseEvent {
        constructor(type, init = {}) {
            super(type, init);
            Object.defineProperties(this, {
                pointerId: { value: Number(init.pointerId || 1) },
                pointerType: { value: String(init.pointerType || 'touch') },
                button: { value: Number(init.button || 0) }
            });
        }
    }
    window.PointerEvent = PointerEventShim;
    globalThis.PointerEvent = PointerEventShim;
    const { mountIntuitionXSliderToolContent } = await import('../../atome/src/squirrel/components/tool_slider_builder.js');
    const button = document.getElementById('slider');
    mountIntuitionXSliderToolContent({
        button, orientation: 'vertical', collapsedWidthPx: 40, expandedWidthPx: 120,
        definition: { label: 'Size', sliderMin: 0, sliderMax: 100, sliderStep: 1, sliderValue: 50 }
    });
    const hitzone = button.querySelector('[data-role="eve_intuitionx-slider-hitzone"]');
    const input = button.querySelector('[data-role="eve_intuitionx-slider-input"]');
    const rect = { left: 0, top: 0, right: 18, bottom: 120, width: 18, height: 120 };
    hitzone.getBoundingClientRect = () => rect;
    input.getBoundingClientRect = () => rect;
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 7, clientY: 80 }));
    window.dispatchEvent(new PointerEventShim('pointermove', { bubbles: true, pointerId: 7, clientY: 56 }));
    assert.equal(button.style.height, '120px');
    assert.equal(input.value, '70');
    window.dispatchEvent(new PointerEventShim('pointerup', { bubbles: true, pointerId: 7, clientY: 56 }));
    assert.equal(button.style.height, '40px');
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 8, pointerType: 'mouse', clientY: 70 }));
    window.dispatchEvent(new PointerEventShim('pointercancel', { bubbles: true, pointerId: 8, pointerType: 'mouse', clientY: 70 }));
    assert.equal(button.dataset.sliderExpanded, 'false');
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 9, pointerType: 'pen', clientY: 70 }));
    input.dispatchEvent(new PointerEventShim('lostpointercapture', { bubbles: true, pointerId: 9, pointerType: 'pen', clientY: 70 }));
    assert.equal(button.dataset.sliderExpanded, 'false');
});
