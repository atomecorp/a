import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;

const {
    FONT_CHOICES,
    createFontPanelSurface
} = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_font_runtime.js');
const {
    SIZE_PRESETS,
    createSizePanelSurface
} = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_size_runtime.js');
const {
    COLOR_SWATCHES,
    createColorPanelSurface
} = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_color_runtime.js');
const { resolveBevyPanelGeometry } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js');
const { setMainMenuRuntime } = await import('../../eVe/intuition/ribbon/bevy_ui_product_registry.js');
const { resolveBevyMainMenuItemSize } = await import('../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js');
const { setAtomeContextualEditApi } = await import('../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

test('Size keeps only its canonical numeric field and presets', async () => {
    const applies = [];
    const runtime = createSizePanelSurface({
        applySize: async (value, options) => { applies.push({ value, options }); return { ok: true, count: 2 }; },
        currentTextSize: () => 72
    });
    const cleanup = runtime.surface.onOpen({ refresh: () => {} });
    try {
        const emitted = [];
        const content = runtime.surface.buildContent(runtime.readState(), {
            bodyWidth: 358,
            emit: (intent) => emitted.push(intent)
        });
        assert.equal(runtime.surface.surfaceId, 'eve_bevy_panel_size');
        assert.equal(findNode(content, 'size_hint'), null);
        assert.equal(findNode(content, 'size_selection_summary'), null);
        assert.equal(findNode(content, 'size_numeric_field_input').kind, 'number_input');
        assert.equal(findNode(content, 'size_numeric_field_decrement').kind, 'button');
        assert.equal(findNode(content, 'size_numeric_field_increment').kind, 'button');
        assert.equal(findNode(content, 'size_presets').children.length, SIZE_PRESETS.length);
        assert.equal(runtime.readState().numeric.value, 72);

        findNode(content, 'size_numeric_field_increment').on.activate();
        await runtime.surface.handleEvent(emitted.pop(), { refresh: () => {} });
        assert.deepEqual(applies.at(-1), { value: 73, options: { phase: 'end', live: false } });

        await runtime.surface.handleEvent({ type: 'size.preset.activate', value: '144' }, { refresh: () => {} });
        assert.deepEqual(applies.at(-1), { value: 144, options: { phase: 'end', live: false } });

        await runtime.surface.handleEvent({ type: 'size.numeric.drag', event: { delta_y: -16 } }, { refresh: () => {} });
        await runtime.surface.handleEvent({ type: 'size.numeric.drag', event: { delta_y: -8 } }, { refresh: () => {} });
        await runtime.surface.handleEvent({ type: 'size.numeric.release' }, { refresh: () => {} });
        assert.deepEqual(applies.slice(-3).map(({ options }) => options.phase), ['start', 'frame', 'end']);
        const unknown = await runtime.surface.handleEvent({ type: 'size.preset.activate', value: '999' });
        assert.equal(unknown.ok, false);
    } finally {
        cleanup?.();
        runtime.surface.onClose();
    }
    assert.equal(runtime.readState().numeric.value, 96);
});

test('Font composes the canonical selectable list and applies only known families', async () => {
    const applies = [];
    const runtime = createFontPanelSurface({
        applyFont: async (value) => { applies.push(value); return { ok: true, count: 1 }; }
    });
    const cleanup = runtime.surface.onOpen({ refresh: () => {} });
    try {
        const content = runtime.surface.buildContent(runtime.readState(), { bodyWidth: 358, emit: () => {} });
        const list = findNode(content, 'font_families');
        assert.equal(runtime.surface.surfaceId, 'eve_bevy_panel_font');
        assert.equal(findNode(content, 'font_hint'), null);
        assert.equal(findNode(content, 'font_selection_summary'), null);
        assert.equal(list.children.length, FONT_CHOICES.length);
        assert.equal(list.children.every((row) => row.kind === 'button'), true);
        assert.equal(findNode(content, 'font_families_option_0_label').style.font_family, undefined);

        const result = await runtime.surface.handleEvent({ type: 'font.family.activate', value: 'Georgia' }, { refresh: () => {} });
        assert.equal(result.ok, true);
        assert.deepEqual(applies, ['Georgia']);
        assert.equal(runtime.readState().activeFont, 'Georgia');
        const unknown = await runtime.surface.handleEvent({ type: 'font.family.activate', value: 'Unknown' }, { refresh: () => {} });
        assert.equal(unknown.ok, false);
        assert.deepEqual(applies, ['Georgia']);
    } finally {
        cleanup?.();
        runtime.surface.onClose();
    }
    assert.equal(runtime.readState().activeFont, 'Arial');
});

test('Font opens glued beside the contextual rail and vertically centered on it', () => {
    const runtime = createFontPanelSurface();
    const surface = { getBoundingClientRect: () => ({ width: 1024, height: 768 }) };
    const railWidth = resolveBevyMainMenuItemSize();
    assert.equal(runtime.surface.openAtHandednessEdge, true);
    assert.equal(runtime.surface.openBesideContextualRail, true);
    setAtomeContextualEditApi({ readState: () => ({ menuVisible: true }) });
    assert.equal(runtime.surface.resolveHandednessEdgeInsetPx(), railWidth);
    setAtomeContextualEditApi(null);
    assert.equal(runtime.surface.resolveHandednessEdgeInsetPx(), 0);

    setMainMenuRuntime({ handedness: 'left', getReservedHeight: () => 74 });
    const left = resolveBevyPanelGeometry({
        surface,
        defaultGeometry: runtime.surface.defaultGeometry,
        allowMobileFloating: runtime.surface.allowMobileFloating,
        openAtHandednessEdge: runtime.surface.openAtHandednessEdge,
        handednessEdgeInsetPx: railWidth
    });
    assert.deepEqual([left.x, left.y, left.width], [railWidth, 97, 400]);

    setMainMenuRuntime({ handedness: 'right', getReservedHeight: () => 74 });
    const right = resolveBevyPanelGeometry({
        surface,
        defaultGeometry: runtime.surface.defaultGeometry,
        allowMobileFloating: runtime.surface.allowMobileFloating,
        openAtHandednessEdge: runtime.surface.openAtHandednessEdge,
        handednessEdgeInsetPx: railWidth
    });
    assert.deepEqual([right.x, right.y, right.width], [1024 - railWidth - 400, 97, 400]);
    assert.equal(right.x + right.width, 1024 - railWidth);

    const withoutContextualRail = resolveBevyPanelGeometry({
        surface,
        defaultGeometry: runtime.surface.defaultGeometry,
        allowMobileFloating: runtime.surface.allowMobileFloating,
        openAtHandednessEdge: runtime.surface.openAtHandednessEdge,
        handednessEdgeInsetPx: 0
    });
    assert.equal(withoutContextualRail.x + withoutContextualRail.width, 1024);

    const narrow = resolveBevyPanelGeometry({
        surface: { getBoundingClientRect: () => ({ width: 390, height: 844 }) },
        defaultGeometry: runtime.surface.defaultGeometry,
        allowMobileFloating: runtime.surface.allowMobileFloating,
        openAtHandednessEdge: runtime.surface.openAtHandednessEdge,
        handednessEdgeInsetPx: railWidth
    });
    assert.deepEqual([narrow.x, narrow.y, narrow.width, narrow.height], [0, 135, 370, 500]);
});

test('Color keeps swatches, RGBA value and channels without redundant labels', async () => {
    const applies = [];
    const runtime = createColorPanelSurface({
        applyColor: async (channels) => { applies.push(channels); return { ok: true }; }
    });
    const emitted = [];
    const content = runtime.surface.buildContent(runtime.readState(), {
        bodyWidth: 358,
        emit: (intent) => emitted.push(intent)
    });
    assert.equal(findNode(content, 'color_hint'), null);
    assert.equal(findNode(content, 'color_selection_summary'), null);
    assert.equal(findNode(content, 'color_base_label'), null);
    assert.equal(findNode(content, 'color_rgba_text').text, 'rgba(248, 248, 248, 1.00)');
    assert.equal(COLOR_SWATCHES.length, 12);
    assert.ok(['r', 'g', 'b', 'a'].every((key) => findNode(content, `color_channel_${key}_input`)?.kind === 'number_input'));
    findNode(content, 'color_swatch_0_2').on.activate();
    await runtime.surface.handleEvent(emitted.pop(), { refresh: () => {} });
    assert.deepEqual(applies.at(-1), { r: 244, g: 67, b: 54, a: 100 });
});

test('Size, Font and Color bridges retain public tools and contain no legacy DOM route', () => {
    const sizeSource = readFileSync(new URL('../../eVe/intuition/tools/size.js', import.meta.url), 'utf8');
    const fontSource = readFileSync(new URL('../../eVe/intuition/tools/font.js', import.meta.url), 'utf8');
    const colorSource = readFileSync(new URL('../../eVe/intuition/tools/couleur.js', import.meta.url), 'utf8');
    assert.match(sizeSource, /ui\.size\.apply/);
    assert.match(fontSource, /ui\.font\.apply/);
    assert.match(colorSource, /ui\.couleur\.apply/);
    [sizeSource, fontSource, colorSource].forEach((source) => {
        assert.doesNotMatch(source, /createEveDialog|document\.createElement|dataset\.|style\.display/);
    });
    assert.doesNotMatch(sizeSource, /elastic_slider|createElasticSlider/);
    assert.doesNotMatch(colorSource, /elastic_slider|createElasticSlider|style_panels_visual/);
});
