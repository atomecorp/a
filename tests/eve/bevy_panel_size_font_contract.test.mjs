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
// Modules dispatch their custom events on this window: they must be its own class.
globalThis.CustomEvent = dom.window.CustomEvent;

const {
    FONT_CHOICES,
    createFontPanelSurface
} = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_font_runtime.js');
const {
    SIZE_MAX,
    SIZE_MIN,
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
const { resolveBevyPanelGridSlab } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js');
const { readState: readIntuitionState, setHandedness } = await import('../../eVe/intuition/core/state.js');
const { BEVY_PANEL_TOKENS } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js');
const { BEVY_MENU_TOKENS } = await import('../../eVe/intuition/ribbon/bevy_ui_menu_surface.js');
const { fitSingleLineText } = await import('../../eVe/domains/rendering/text_editing_layout.js');

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

// Size is the one tool slider (AGENTS.md rule 14, dashboard_band_sliders.js `grid`): dragged, it follows live
// on the selection (start, frames, end); its presets and numeric field were retired.
test('Size keeps only its canonical tool slider', async () => {
    const applies = [];
    const runtime = createSizePanelSurface({
        applySize: async (value, options) => { applies.push({ value, options }); return { ok: true, count: 2 }; },
        currentTextSize: () => 72
    });
    const cleanup = runtime.surface.onOpen({ refresh: () => {} });
    try {
        const content = runtime.surface.buildContent(runtime.readState(), { bodyWidth: 358, emit: () => {} });
        assert.equal(runtime.surface.surfaceId, 'eve_bevy_panel_size');
        assert.equal(findNode(content, 'size_hint'), null);
        assert.equal(findNode(content, 'size_selection_summary'), null);
        assert.equal(findNode(content, 'size_presets'), null);
        assert.equal(findNode(content, 'size_numeric_field_input'), null);
        const slider = findNode(content, 'size_values_size');
        assert.equal(slider.kind, 'tool_slider');
        assert.equal(runtime.readState().value, 72);

        slider.on.press({});
        slider.on.drag({ delta_x: 30 });
        slider.on.drag({ delta_x: 30 });
        slider.on.release({});
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(applies.map(({ options }) => options), [
            { phase: 'start', live: true }, { phase: 'frame', live: true }, { phase: 'frame', live: true }, { phase: 'end', live: false }
        ]);
        assert.equal(applies[0].value, 72, 'the session starts from the selection size');
        assert.ok(applies[1].value > 72 && applies[2].value > applies[1].value);
        assert.equal(applies[3].value, applies[2].value, 'the release commits the last live value');
        assert.ok(applies.every(({ value }) => value >= SIZE_MIN && value <= SIZE_MAX));
        assert.equal(runtime.readState().value, applies[3].value);
        const unknown = await runtime.surface.handleEvent({ type: 'size.preset.activate', value: '144' });
        assert.equal(unknown.ok, false);
    } finally {
        cleanup?.();
        runtime.surface.onClose();
    }
    assert.equal(runtime.readState().value, BEVY_PANEL_TOKENS.unitScalePx(96));
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

// The contextual rail owns a column on the hand's side while it shows (bevy_panel_layout.js): Font opens at that
// edge, against the column, at the foot above the toolbar, its slab laid on the screen grid's columns.
test('Font opens glued beside the contextual rail at the hand\'s edge', () => {
    const runtime = createFontPanelSurface();
    const surface = { getBoundingClientRect: () => ({ width: 1024, height: 768 }) };
    const reserve = Math.round(resolveBevyMainMenuItemSize() + BEVY_MENU_TOKENS.toolGapPx + BEVY_PANEL_TOKENS.dockGapPx);
    const width = runtime.surface.defaultGeometry.width;
    const foot = 768 - 74 - BEVY_PANEL_TOKENS.dockGapPx;
    const previous = readIntuitionState().handedness;
    assert.equal(runtime.surface.openAtHandednessEdge, true);
    setMainMenuRuntime({ getReservedHeight: () => 74 });
    const open = (handedness, menuVisible) => {
        setHandedness(handedness);
        setAtomeContextualEditApi({ readState: () => ({ menuVisible, handedness }) });
        return resolveBevyPanelGeometry({ surface, defaultGeometry: runtime.surface.defaultGeometry,
            openAtHandednessEdge: runtime.surface.openAtHandednessEdge });
    };
    try {
        const left = open('left', true);
        assert.equal(left.x, resolveBevyPanelGridSlab({ surface, x: reserve, width, left: reserve }).x);
        assert.ok(left.x >= reserve, 'never over the rail column');
        assert.equal(left.y + left.height, foot);

        const right = open('right', true);
        assert.equal(right.x, resolveBevyPanelGridSlab({ surface, x: 1024 - reserve - width, width, right: 1024 - reserve }).x);
        assert.ok(right.x + right.width <= 1024 - reserve, 'never over the rail column');
        assert.equal(right.y + right.height, foot);

        const withoutContextualRail = open('right', false);
        assert.equal(withoutContextualRail.x, resolveBevyPanelGridSlab({ surface, x: 1024 - width, width }).x);
        assert.ok(withoutContextualRail.x > right.x, 'without the rail the panel takes the screen edge');
        assert.ok(withoutContextualRail.x + withoutContextualRail.width <= 1024);

        setAtomeContextualEditApi(null);
        // A phone lays the panel at the foot across the grid's width, as tall as asked.
        const narrowSurface = { getBoundingClientRect: () => ({ width: 390, height: 844 }) };
        const narrow = resolveBevyPanelGeometry({ surface: narrowSurface, defaultGeometry: runtime.surface.defaultGeometry,
            openAtHandednessEdge: runtime.surface.openAtHandednessEdge });
        const slab = resolveBevyPanelGridSlab({ surface: narrowSurface, x: 0, width: 390 });
        assert.equal(narrow.mobile, true);
        assert.deepEqual([narrow.x, narrow.width], [slab.x, slab.width]);
        assert.equal(narrow.height, runtime.surface.defaultGeometry.height);
        assert.equal(narrow.y + narrow.height, 844 - 74 - BEVY_PANEL_TOKENS.dockGapPx);
    } finally {
        setAtomeContextualEditApi(null);
        setMainMenuRuntime(null);
        setHandedness(previous);
    }
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
    // The RGBA value is cut with « … » when its room lacks (AGENTS.md rule 12).
    const rgba = findNode(content, 'color_rgba_text');
    assert.equal(rgba.text, fitSingleLineText({ value: 'rgba(248, 248, 248, 1.00)', width: rgba.style.size[0],
        style: { font_size: BEVY_PANEL_TOKENS.controlTextSizePx } }).text);
    assert.ok(rgba.text.startsWith('rgba(248, 248, '));
    assert.equal(COLOR_SWATCHES.length, 12);
    assert.ok(['r', 'g', 'b', 'a'].every((key) => findNode(content, `color_channels_${key}`)?.kind === 'tool_slider'));
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
