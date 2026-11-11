import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { createBackgroundPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_background_runtime.js';
import { createColorPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_color_runtime.js';
import { colorWheelTexture, createColorControlRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_color_control.js';
import { BEVY_PANEL_COMPONENTS, panelComponent } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_component_registry.js';
import { buildAccordionList } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_accordion_list.js';
import { resolveListRowTokens } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { createShadowPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_shadow_runtime.js';
import {
    resolveTimelineScope,
    runTimelineAction,
    subscribeTimeline
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_timeline_controller.js';
import { resolveVirtualWindow } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_virtual_window.js';

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
const treeShape = (value) => ({ kind: value.kind, children: (value.children || []).map(treeShape) });

test('background composes the complete shared color control', async () => {
    const patches = [];
    const intents = [];
    const runtime = createBackgroundPanelSurface({
        readParams: () => ({ colorBaseR: 30, colorBaseG: 40, colorBaseB: 50 }),
        applyParams: (patch) => patches.push(patch)
    });
    const context = { bodyWidth: 400, emit: (intent) => intents.push(intent) };
    const content = runtime.surface.buildContent(runtime.readState(), context);
    const palette = findNode(content, 'background_colorBase_swatches');
    assert.ok(palette);
    assert.ok(findNode(content, 'background_colorBase_wheel'));
    assert.ok(findNode(content, 'background_colorBase_value_track'));
    assert.ok(findNode(content, 'background_colorBase_opacity_track'));
    assert.equal(palette.children.length, 12);
    assert.ok(palette.children.every((entry) => entry.kind === 'color_swatch'));
    palette.children[2].on.activate();
    await runtime.surface.handleEvent(intents.pop());
    assert.deepEqual(patches.at(-1), { colorBaseR: 244, colorBaseG: 67, colorBaseB: 54 });
});

test('History and Timeline share project scope, actions and subscription lifecycle', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    let listener = null;
    globalThis.window = {
        __currentProject: { id: 'project-1' },
        __selectedAtomeIds: ['project-1', 'shape-1'],
        Atome: { timeline: {
            seek: async (index, options) => { calls.push(['seek', index, options]); return { ok: true }; },
            onUpdate: (next) => { listener = next; return () => calls.push(['unsubscribe']); }
        } }
    };
    try {
        assert.deepEqual(resolveTimelineScope(), { projectId: 'project-1', atomeIds: ['shape-1'], atomeId: 'shape-1' });
        assert.deepEqual(await runTimelineAction('seek', { index: 3, apply: true }), { ok: true });
        const release = subscribeTimeline((snapshot) => calls.push(['snapshot', snapshot.index]));
        listener({ index: 2 });
        release();
        assert.deepEqual(calls, [['seek', 3, { apply: true }], ['snapshot', 2], ['unsubscribe']]);
    } finally {
        globalThis.window = previousWindow;
    }
});

// The notification table was retired: Communication's inbox and Contacts both
// draw the shared list of Atome (one accordion row per record), each panel only
// injecting how to name, unfold and activate its own records.
test('notification surfaces share one list geometry and keep domain callbacks injected', () => {
    const opened = [];
    const list = ({ prefix, label }) => buildAccordionList({
        prefix, bodyWidth: 360,
        entries: [{ id: 'n1', label, expanded: false, selectable: false }],
        buildBody: () => [],
        activate: (entry) => () => opened.push(`${prefix}:${entry.id}`)
    }).node;
    const inbox = list({ prefix: 'probe_notifications', label: '● Ada · Hello' });
    const contacts = list({ prefix: 'probe_contacts', label: 'Ada' });
    const rowHeight = resolveListRowTokens('tall').heightPx;
    const header = findNode(inbox, 'probe_notifications_accordion_n1_header');
    assert.equal(inbox.id, 'probe_notifications_accordion_list');
    assert.deepEqual(findNode(inbox, 'probe_notifications_entry_n1').style.size, [360, rowHeight]);
    assert.deepEqual(header.style.size, findNode(contacts, 'probe_contacts_accordion_n1_header').style.size);
    assert.equal(findNode(inbox, 'probe_notifications_accordion_n1_label').text, '● Ada · Hello');
    header.on.activate();
    assert.deepEqual(opened, ['probe_notifications:n1']);
});

test('shadow embeds the same complete color control and keeps alpha while selecting a swatch', async () => {
    const applied = [];
    const runtime = createShadowPanelSurface({
        readShadow: async () => ({ atome_id: null, shadow: null }),
        applyShadow: async (value) => { applied.push(value); return { ok: true }; }
    });
    const context = { bodyWidth: 358, emit: () => {} };
    const content = runtime.surface.buildContent(runtime.readState(), context);
    const palette = findNode(content, 'shadow_color_swatches');
    assert.ok(palette);
    assert.ok(findNode(content, 'shadow_color_wheel'));
    assert.ok(findNode(content, 'shadow_color_value_track'));
    assert.ok(findNode(content, 'shadow_color_opacity_track'));
    await runtime.surface.handleEvent({ type: 'shadow_color.swatch', value: '#f44336' });
    assert.match(applied.at(-1).color, /^rgba\(244, 67, 54,/);
});

test('Color, Shadow and Background mount the identical complete component tree', () => {
    const emit = () => {};
    const color = createColorPanelSurface().surface;
    const shadow = createShadowPanelSurface().surface;
    const background = createBackgroundPanelSurface({
        readParams: () => ({ colorBaseR: 12, colorBaseG: 34, colorBaseB: 56 })
    }).surface;
    const colorNode = findNode(color.buildContent(color.readState(), { bodyWidth: 358, emit }), 'color');
    const shadowNode = findNode(shadow.buildContent(shadow.readState(), { bodyWidth: 358, emit }), 'shadow_color');
    const backgroundNode = findNode(background.buildContent(background.readState(), { bodyWidth: 400, emit }), 'background_colorBase');
    // Shadow and Background embed the titled control; the Couleur panel lays the
    // same shared control compactly, without the heading its footer carries.
    assert.deepEqual(treeShape(backgroundNode), treeShape(shadowNode));
    // Each probe holds its panel's colour, so the same swatch is ticked.
    const initial = { r: 12, g: 34, b: 56, a: 100 };
    const titled = createColorControlRuntime({ id: 'probe_titled', label: 'Color', initial });
    assert.deepEqual(treeShape(shadowNode), treeShape(titled.buildNode(titled.readState(), emit, { width: 358 })));
    const compact = createColorControlRuntime({ id: 'probe_compact', label: 'Color',
        initial: { r: 248, g: 248, b: 248, a: 100 }, showTitle: false });
    assert.deepEqual(treeShape(colorNode), treeShape(compact.buildNode(compact.readState(), emit, { width: 358, compact: true })));
    const normalized = normalizeBevyUiTree({ id: 'color_control_probe', tree: colorNode });
    // Normalization keeps the shared wheel texture, generated above the device scale.
    assert.equal(findNode(normalized.root, 'color_wheel_image').image.texture.width, colorWheelTexture().width);
});

test('the mobile color wheel publishes live color changes through the canonical runtime', async () => {
    const applied = [];
    const intents = [];
    const runtime = createColorPanelSurface({
        applyColor: async (channels) => { applied.push(channels); return { ok: true }; }
    });
    const build = () => runtime.surface.buildContent(runtime.readState(), {
        bodyWidth: 320,
        emit: (intent) => intents.push(intent)
    });
    const capture = findNode(build(), 'color_wheel_capture');
    capture.on.press({ x: 140, y: 0 });
    await runtime.surface.handleEvent(intents.pop());
    assert.equal(applied.length, 1);
    assert.ok(applied[0].r > applied[0].g);
    assert.ok(findNode(build(), 'color_wheel_indicator'));
});

test('registry names canonical owners and virtual window bounds work is proportional to the viewport', () => {
    assert.equal(panelComponent('colorControl'), BEVY_PANEL_COMPONENTS.colorControl);
    assert.equal(panelComponent('missing'), null);
    const window = resolveVirtualWindow({ itemCount: 100000, scrollOffset: 4000, stride: 40, viewportSize: 400, overscan: 2 });
    assert.equal(window.firstIndex, 98);
    assert.equal(window.lastIndex, 112);
    assert.equal(window.lastIndex - window.firstIndex, 14);
});
