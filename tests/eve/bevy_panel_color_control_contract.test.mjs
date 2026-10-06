// Shared panel colour control: the Couleur panel hides the heading its footer
// already carries, the brightness/opacity bars paint and answer at the same
// place, the handles stay inside their track, and a panel quick-mode release
// over the wheel or a bar chooses the pointed value exactly once.

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;

const { BEVY_PANEL_TOKENS } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js');
const { COLOR_CONTROL_CHANNELS, colorWheelTexture, createColorControlRuntime, hsvToRgb } =
    await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_color_control.js');
const { createColorPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_color_runtime.js');

const findNode = (value, id) => {
    const nodes = Array.isArray(value) ? value : [value];
    for (const candidate of nodes) {
        if (!candidate) continue;
        if (candidate.id === id) return candidate;
        const nested = findNode(candidate.children || [], id);
        if (nested) return nested;
    }
    return null;
};

test('the Couleur surface drops its duplicate heading and keeps the accessible label', () => {
    const runtime = createColorPanelSurface({ applyColor: async () => ({ ok: true }) });
    const panelContent = runtime.surface.buildContent(runtime.readState(), { bodyWidth: 358, emit: () => {} });
    assert.equal(findNode(panelContent, 'color_title'), null, 'the footer already names the panel');
    const control = findNode(panelContent, 'color_wheel');
    assert.ok(control, 'the shared control still mounts');
    const root = findNode(panelContent, 'color');
    assert.match(String(root?.accessibility?.label || ''), /^Couleur\+:/, 'the label stays for assistive text');

    // The background panel keeps the heading: it uses it as the field label.
    const labelled = createColorControlRuntime({ id: 'background_colorBase', label: 'Base color' });
    const labelledTree = labelled.buildNode(labelled.readState(), () => {}, { width: 240 });
    assert.equal(findNode(labelledTree, 'background_colorBase_title')?.text, 'Base color');
});

test('brightness and opacity bars paint and answer on the same box, with clamped handles', () => {
    const width = 320;
    const knob = BEVY_PANEL_TOKENS.unitScalePx(18);
    const trackHeight = BEVY_PANEL_TOKENS.unitScalePx(32);
    const control = createColorControlRuntime({ id: 'color', label: 'Color', initial: { r: 0, g: 0, b: 0, a: 0 } });
    let tree = control.buildNode(control.readState(), () => {}, { width });

    ['value', 'opacity'].forEach((kind) => {
        const image = findNode(tree, `color_${kind}_image`);
        const capture = findNode(tree, `color_${kind}_capture`);
        assert.deepEqual(image.style.position, [0, 0], `${kind} paint is absolute in its stack`);
        assert.deepEqual(capture.style.position, [0, 0], `${kind} capture overlays the painted bar`);
        assert.deepEqual(capture.style.size, image.style.size);
        assert.deepEqual(capture.style.size, [width, trackHeight]);
        assert.equal(typeof capture.on.palette_choose, 'function', `${kind} answers panel quick mode`);
    });

    const knobAt = (kind) => findNode(tree, `color_${kind}_knob`);
    assert.equal(knobAt('value').style.position[0], 0, 'the handle never overflows the left end');
    assert.equal(knobAt('opacity').style.position[0], 0);
    assert.deepEqual(knobAt('value').style.shadow, BEVY_PANEL_TOKENS.buttonMaterial.knobShadow);
    assert.deepEqual(knobAt('value').style.background, BEVY_PANEL_TOKENS.buttonMaterial.dot);

    control.setChannels({ r: 255, g: 255, b: 255, a: 100 });
    tree = control.buildNode(control.readState(), () => {}, { width });
    assert.equal(knobAt('value').style.position[0], width - knob, 'the handle never overflows the right end');
    assert.equal(knobAt('opacity').style.position[0], width - knob);
});

test('the wheel texture is generated above the render device scale', () => {
    const texture = colorWheelTexture();
    assert.ok(texture.width >= 512, `expected a sharp wheel, got ${texture.width}`);
    assert.equal(texture.height, texture.width);
    // The rim stays anti-aliased: the last opaque texel sits next to the edge.
    const size = texture.width;
    const radius = (size - 1) / 2 - 1;
    const center = (size - 1) / 2;
    const alphaAt = (saturation) => {
        const x = Math.round(center + saturation * radius);
        return texture.rgba[(((size >> 1) * size) + x) * 4 + 3];
    };
    assert.equal(alphaAt(0.5), 255, 'the body of the wheel is opaque');
    assert.ok(alphaAt(0.999) < 255, 'the rim fades instead of aliasing');
    assert.equal(texture.rgba[3], 0, 'outside the circle stays transparent');
});

test('a panel quick-mode release on the wheel or a bar chooses the pointed value once', async () => {
    const applied = [];
    const control = createColorControlRuntime({
        id: 'color', label: 'Color', initial: { r: 248, g: 248, b: 248, a: 100 },
        onChange: async (channels, options) => { applied.push({ channels, phase: options?.phase }); return { ok: true }; }
    });
    const width = 320;
    const wheelSize = 280;

    control.buildNode(control.readState(), () => {}, { width });
    await control.handleEvent({ type: 'color.wheel.choose', event: { x: wheelSize / 2, y: wheelSize / 2 }, size: wheelSize },
        { refresh: () => {} });
    assert.equal(applied.length, 1);
    assert.equal(applied[0].phase, 'end');
    assert.deepEqual(applied[0].channels, { r: 248, g: 248, b: 248, a: 100 }, 'the wheel centre keeps the current brightness');

    applied.length = 0;
    await control.handleEvent({ type: 'color.value.choose', event: { x: width / 2 }, width }, { refresh: () => {} });
    assert.equal(applied.length, 1);
    assert.equal(applied[0].phase, 'end');
    const expected = hsvToRgb({ h: 0, s: 0, v: 0.5 });
    assert.deepEqual(applied[0].channels, { ...expected, a: 100 }, 'the bar takes the pointed ratio');

    applied.length = 0;
    await control.handleEvent({ type: 'color.opacity.choose', event: { x: 0 }, width }, { refresh: () => {} });
    assert.equal(applied.length, 1);
    assert.equal(applied[0].channels.a, 0);
    assert.equal(COLOR_CONTROL_CHANNELS.length, 4);
});
