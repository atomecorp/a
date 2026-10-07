import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { normalizeSliderOptions, resolveSliderLength, quantizeSliderValue } from '../../atome/src/squirrel/components/slider_contract.js';
import { buildBevyToolSliderNode, createBevyToolSliderHandlers } from '../../eVe/intuition/shared/bevy_ui_tool_slider.js';
import { resolveSliderPreviewGeometry, createLinearMenuLensController } from '../../eVe/intuition/ribbon/bevy_ui_linear_menu_lens.js';
import { serializeToolParams, buildToolParamsFromPayload, buildToolParamsFromEntry } from '../../eVe/intuition/tools/ui/tool_button_params.js';
const options = { showBounds: true, lengthPx: 360, valueInsetPx: 8 };
const find = (node, id) => node.id === id ? node : (node.children || []).map(child => find(child, id)).find(Boolean);
const withDom = async callback => {
    const dom = new JSDOM('<!doctype html><body><button id="tool"></button></body>');
    const globals = { window: dom.window, document: dom.window.document, Node: dom.window.Node, Element: dom.window.Element,
        HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, CustomEvent: dom.window.CustomEvent,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} };
    const previous = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]])); Object.assign(globalThis, globals);
    try { await callback(dom.window); } finally { Object.assign(globalThis, previous); dom.window.close(); }
};
describe('framework optional slider contract', () => {
    it('keeps the ordinary presentation opt-in and validates the shared length', () => {
        expect(normalizeSliderOptions()).toEqual({ showBounds: false, lengthPx: null, valueInsetPx: 0 });
        expect(resolveSliderLength({ lengthPx: 'fill' }, 180, 344)).toBe(344);
        expect(() => resolveSliderLength({ lengthPx: 'fill' }, 180)).toThrow('slider_available_length_required');
        expect(() => normalizeSliderOptions({ lengthPx: -1 })).toThrow('slider_length_invalid');
        expect(quantizeSliderValue(2.7, { min: 1, max: 11, step: .5 })).toBe(2.5);
        expect(quantizeSliderValue(100, { min: 3, max: 3 })).toBe(3);
    });
    it.each(['horizontal', 'vertical'])('renders optional %s endpoints from the actual range', orientation => {
        const ordinary = buildBevyToolSliderNode({ id: 's', orientation, expanded: true });
        expect(find(ordinary, 's_min')).toBeUndefined();
        const configured = buildBevyToolSliderNode({ id: 's', orientation, expanded: true, min: 1, max: 11, unit: 'h', sliderOptions: options });
        expect(configured.style.size).toEqual(orientation === 'horizontal' ? [360, 60] : [60, 360]);
        expect(find(configured, 's_min').text).toBe('1 h'); expect(find(configured, 's_max').text).toBe('11 h');
        const current = find(configured, 's_value'); expect(current.style.position[1]).toBeGreaterThanOrEqual(8);
        for (const part of ['background', 'thumb']) {
            const a = find(ordinary, 's_' + part).style, b = find(configured, 's_' + part).style;
            expect(b.background).toEqual(a.background); expect(b.radius).toEqual(a.radius);
        }
    });
    it('uses the configured travel for quantized drag and preserves cancellation', () => {
        let session = { expanded: true }, value;
        const handlers = createBevyToolSliderHandlers({ definition: { sliderMin: 1, sliderMax: 11, sliderStep: .5,
            sliderValue: 8, sliderOrientation: 'horizontal', sliderOptions: options }, read: () => session,
            write: next => { session = next; }, itemSize: () => 60, refresh: () => {}, change: next => { value = next; } });
        handlers.press(); handlers.drag({ delta_x: -180 }); expect(value).toBe(3); handlers.cancel(); expect(value).toBe(8);
    });
    it.each([false, true])('vertical bounds leave room for both end thumbs (preview=%s)', previewOnly => {
        for (const value of [1, 11]) {
            const tree = buildBevyToolSliderNode({ id: 'v', orientation: 'vertical', expanded: true, previewOnly,
                value, min: 1, max: 11, sliderOptions: options });
            const thumb = find(tree, 'v_thumb').style, minimum = find(tree, 'v_min').style, maximum = find(tree, 'v_max').style;
            expect(thumb.position[1] + thumb.size[1]).toBeLessThanOrEqual(minimum.position[1]);
            expect(thumb.position[1]).toBeGreaterThanOrEqual(maximum.position[1] + maximum.size[1]);
        }
    });
    it('reverse bounds keep their semantic identity and fill requires measured space', () => {
        const tree = buildBevyToolSliderNode({ id: 'r', orientation: 'horizontal', reverse: true, min: 1, max: 11, sliderOptions: options });
        expect(find(tree, 'r_min').text).toBe('1'); expect(find(tree, 'r_min').style.position[0]).toBeGreaterThan(find(tree, 'r_max').style.position[0]);
        expect(() => resolveSliderPreviewGeometry({ tile: { x: 0, y: 0, size: 60 }, sliderOptions: { lengthPx: 'fill' } })).toThrow('slider_available_length_required');
    });
    it('a measured ribbon preserves its old preview placement until length is configured', () => {
        for (const [sliderOptions, expected] of [[{}, { x: -40, width: 180 }], [{ showBounds: true }, { x: -40, width: 180 }],
            [{ lengthPx: 'fill' }, { x: 0, width: 800 }]]) {
            let opened;
            const controller = createLinearMenuLensController({ treeId: 'fixture', runtimeResolver: () => null,
                collect: () => ({ tiles: [{ nodeId: 's', rest: { x: 20, y: 100, size: 60 } }], sliderAvailableBounds: [0, 800] }),
                slider: { read: () => ({ value: 8, min: 1, max: 11, sliderOptions }), open: value => { opened = value; } } });
            expect(controller.togglePinned('s')).toBe(true); expect(opened.rect).toMatchObject(expected); controller.cancel();
        }
    });
    it('keeps options and zero minima through tool serialization and preview geometry', () => {
        const serialized = serializeToolParams({ entry: { key: 'size', toolType: 'slider', sliderMin: 0, sliderValue: 0, sliderOptions: options } });
        const restored = buildToolParamsFromPayload({ factory_params: serialized });
        expect(restored.entry.sliderOptions).toEqual(options); expect(restored.entry.sliderMin).toBe(0); expect(restored.entry.sliderValue).toBe(0);
        const geometry = resolveSliderPreviewGeometry({ tile: { x: 400, y: 500, size: 60 }, bounds: [0, 800], sliderOptions: options });
        expect(geometry.length).toBe(360); expect(geometry.rect.width).toBe(360);
        const filled = buildToolParamsFromEntry({ key: 'fill', sliderOptions: { lengthPx: 'fill' } }, { availableLength: 344 });
        expect(filled.options.availableLength).toBe(344); expect(serializeToolParams(filled).options.availableLength).toBeUndefined();
    });
    it.each(['horizontal', 'vertical', 'circular'])('the generic %s API supports options and live range changes', async type => withDom(async window => {
        const { createSlider } = await import('../../atome/src/squirrel/components/slider_builder.js');
        const slider = createSlider({ id: 'generic', type, min: 1, max: 11, value: 8, step: .5, unit: 'h', sliderOptions: options });
        window.document.body.appendChild(slider);
        expect(slider.querySelector('#generic_min').textContent).toBe('1 h'); expect(slider.getValue()).toBe(8);
        slider.setRange(2, 4); expect(slider.getValue()).toBe(4);
        expect(slider.querySelector('#generic_max').textContent).toBe('4 h');
        slider.setValue(2.7); expect(slider.getValue()).toBe(2.5);
        slider.setDisabled(true);
        const track = slider.querySelector('#generic_track');
        track.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 10 }));
        expect(slider.getValue()).toBe(2.5); slider.destroy();
    }));
    it.each(['horizontal', 'vertical', 'circular'])('generic %s gestures use the current range and release listeners', async type => withDom(async window => {
        const { createSlider } = await import('../../atome/src/squirrel/components/slider_builder.js');
        const slider = createSlider({ id: 'gesture', type, min: 1, max: 11, value: 8, step: .5, sliderOptions: options });
        window.document.body.appendChild(slider); slider.setRange(2, 4);
        const track = slider.querySelector('#gesture_track'), rect = () => ({ left: 0, top: 0, width: 100, height: 100 });
        track.getBoundingClientRect = rect; slider.getBoundingClientRect = rect;
        track.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 50, clientY: 100 }));
        expect(slider.getValue()).toBe(type === 'vertical' ? 2 : 3);
        window.document.dispatchEvent(new window.MouseEvent('mouseup')); slider.destroy();
        track.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 0 }));
        expect(slider.getValue()).toBe(type === 'vertical' ? 2 : 3);
    }));
    it.each(['horizontal', 'vertical'])('the canonical DOM ToolSlider exposes optional %s bounds', async orientation => withDom(async window => {
        const { mountIntuitionXSliderToolContent } = await import('../../atome/src/squirrel/components/tool_slider_builder.js');
        const button = window.document.getElementById('tool');
        const slider = mountIntuitionXSliderToolContent({ button, orientation, collapsedWidthPx: 60,
            definition: { label: 'Size', sliderMin: 1, sliderMax: 11, sliderValue: 8, sliderUnit: 'h', sliderOptions: options } });
        expect(button.querySelector('#tool_min').hidden).toBe(true); slider.setExpanded(true);
        expect(button.querySelector('#tool_min').textContent).toBe('1 h'); expect(button.querySelector('#tool_max').textContent).toBe('11 h');
        expect(button.style[orientation === 'horizontal' ? 'width' : 'height']).toBe('360px');
        slider.setExpanded(false); expect(button.querySelector('#tool_max').hidden).toBe(true);
    }));
});
