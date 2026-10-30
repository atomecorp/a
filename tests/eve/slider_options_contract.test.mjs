import { describe, it, expect } from 'vitest';
import { normalizeSliderOptions, resolveSliderLength, quantizeSliderValue, sliderValueCaption, isSliderValueValid } from '../../atome/src/squirrel/components/slider_contract.js';
import { buildBevyToolSliderNode, createBevyToolSliderHandlers } from '../../eVe/intuition/shared/bevy_ui_tool_slider.js';
import { resolveSliderPreviewGeometry, createLinearMenuLensController } from '../../eVe/intuition/ribbon/bevy_ui_linear_menu_lens.js';
import { serializeToolParams, buildToolParamsFromPayload, buildToolParamsFromEntry } from '../../eVe/intuition/tools/ui/tool_button_params.js';
const options = { showBounds: true, lengthPx: 360, valueInsetPx: 8 };
const valueLabels = { 1: 'Minimum', 2: 'Doux', 3: 'Régulier', 4: 'Soutenu', 5: 'Ambitieux' };
const find = (node, id) => node.id === id ? node : (node.children || []).map(child => find(child, id)).find(Boolean);
describe('framework optional slider contract', () => {
    it('validates named values without converting captions into numbers or units', () => {
        const restored = normalizeSliderOptions(JSON.parse(JSON.stringify({ valueLabels })));
        for (const [value, caption] of Object.entries(valueLabels)) {
            expect(sliderValueCaption(Number(value), restored)).toBe(caption);
            expect(isSliderValueValid(Number(value), { min: 1, max: 5, step: 1 }, restored)).toBe(true);
        }
        expect(sliderValueCaption(2.5)).toBeNull();
        expect(() => sliderValueCaption(2.5, restored)).toThrow('slider_value_caption_required');
        for (const labels of [[], {}, { invalid: 'Unknown' }, { '1.0': 'Ambiguous' }, { 1: '' }, { 1: 7 }]) {
            expect(() => normalizeSliderOptions({ valueLabels: labels })).toThrow('slider_value_labels_invalid');
        }
        expect(isSliderValueValid(2.5, { min: 1, max: 5, step: 1 })).toBe(false);
        expect(isSliderValueValid(.3, { min: 0, max: 1, step: .1 })).toBe(true);
        expect(isSliderValueValid(.31, { min: 0, max: 1, step: .1 })).toBe(false);
        expect(isSliderValueValid(1e15 + .5, { min: 0, max: 2e15, step: 1 })).toBe(false);
        expect(isSliderValueValid(2.5, { min: 1, max: 5, step: .5 })).toBe(true);
        expect(isSliderValueValid(3, { min: 1, max: 5, step: 1 }, { valueLabels: { 1: 'Only one' } })).toBe(false);
    });
    it.each(['horizontal', 'vertical'])('the shared Bevy %s owner paints all five captions in normal and deported controls', orientation => {
        for (const previewOnly of [false, true]) for (const [value, caption] of Object.entries(valueLabels)) {
            const tree = buildBevyToolSliderNode({ id: 'named', orientation, expanded: true, previewOnly,
                value: Number(value), min: 1, max: 5, step: 1, sliderOptions: { valueLabels } });
            expect(find(tree, 'named_value').text).toBe(caption);
        }
        const serialized = serializeToolParams({ entry: { key: 'effort', toolType: 'slider', sliderMin: 1,
            sliderMax: 5, sliderStep: 1, sliderValue: 5, sliderOptions: { valueLabels } } });
        expect(buildToolParamsFromPayload({ factory_params: serialized }).entry.sliderOptions.valueLabels).toEqual(valueLabels);
    });
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
        // One look whatever the options: the same pressed-in ground and the same raised slab.
        for (const part of ['gauge', 'fill']) {
            const a = find(ordinary, 's_' + part).style, b = find(configured, 's_' + part).style;
            expect(b.background).toEqual(a.background); expect(b.radius).toEqual(a.radius); expect(b.surfacePaint).toEqual(a.surfacePaint);
        }
    });
    it('uses the configured travel for quantized drag and preserves cancellation', () => {
        let session = { expanded: true }, value;
        const handlers = createBevyToolSliderHandlers({ definition: { sliderMin: 1, sliderMax: 11, sliderStep: .5,
            sliderValue: 8, sliderOrientation: 'horizontal', sliderOptions: options }, read: () => session,
            write: next => { session = next; }, itemSize: () => 60, refresh: () => {}, change: next => { value = next; } });
        handlers.press(); handlers.drag({ delta_x: -180 }); expect(value).toBe(3); handlers.cancel(); expect(value).toBe(8);
    });
    it.each([false, true])('vertical bounds read the maximum above the minimum, inside the gauge (preview=%s)', previewOnly => {
        for (const value of [1, 11]) {
            const tree = buildBevyToolSliderNode({ id: 'v', orientation: 'vertical', expanded: true, previewOnly,
                value, min: 1, max: 11, sliderOptions: options });
            const gauge = find(tree, 'v_gauge').style, minimum = find(tree, 'v_min').style, maximum = find(tree, 'v_max').style;
            expect(maximum.position[1] + maximum.size[1]).toBeLessThanOrEqual(minimum.position[1]);
            expect(minimum.position[1] + minimum.size[1]).toBeLessThanOrEqual(gauge.size[1]);
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
});
