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

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

test('Size composes the canonical numeric field, preset chips, and selection summary', async () => {
    const applies = [];
    const runtime = createSizePanelSurface({
        applySize: async (value, options) => { applies.push({ value, options }); return { ok: true, count: 2 }; },
        selectionCount: () => 2,
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
        assert.equal(findNode(content, 'size_selection_summary_count').text, '2');
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
        applyFont: async (value) => { applies.push(value); return { ok: true, count: 1 }; },
        selectionCount: () => 1
    });
    const cleanup = runtime.surface.onOpen({ refresh: () => {} });
    try {
        const content = runtime.surface.buildContent(runtime.readState(), { bodyWidth: 358, emit: () => {} });
        const list = findNode(content, 'font_families');
        assert.equal(runtime.surface.surfaceId, 'eve_bevy_panel_font');
        assert.equal(findNode(content, 'font_selection_summary_count').text, '1');
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

test('Size and Font bridges retain public tools and contain no legacy DOM route', () => {
    const sizeSource = readFileSync(new URL('../../eVe/intuition/tools/size.js', import.meta.url), 'utf8');
    const fontSource = readFileSync(new URL('../../eVe/intuition/tools/font.js', import.meta.url), 'utf8');
    assert.match(sizeSource, /ui\.size\.apply/);
    assert.match(fontSource, /ui\.font\.apply/);
    [sizeSource, fontSource].forEach((source) => {
        assert.doesNotMatch(source, /createEveDialog|document\.createElement|dataset\.|style\.display/);
    });
    assert.doesNotMatch(sizeSource, /elastic_slider|createElasticSlider/);
});
