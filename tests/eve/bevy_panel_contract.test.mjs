import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import { WORKSPACE_SCENE_LAYER_IDS } from '../../eVe/domains/rendering/workspace_scene_layers.js';
import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { EVE_TOOL_SKIN_TOKENS } from '../../eVe/elements/skin/tool_skin.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { buildBevyFooterCloseRingNode } from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const installPanelDom = () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 1024,
        bottom: 768,
        width: 1024,
        height: 768
    });
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'panel_project', transitioning: false };
    let menuActive = false;
    setMainMenuRuntime({
        showFully: async () => {
            menuActive = true;
            return true;
        },
        measure: () => ({ active: menuActive, treeMounted: menuActive })
    }, dom.window);
    return { dom, surface };
};

const visit = (node, fn) => {
    if (!node) return;
    fn(node);
    (node.children || []).forEach((child) => visit(child, fn));
};

const findNode = (tree, id) => {
    let found = null;
    visit(tree.root, (node) => {
        if (node.id === id) found = node;
    });
    return found;
};

test('Bevy panel contract removes tools dock and keeps system controls in footer', async () => {
    const { dom } = installPanelDom();
    const mounted = [];
    const unmounted = [];
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => {
            mounted.push(tree);
            return tree;
        },
        updateTree: async ({ tree }) => {
            mounted.push(tree);
            return tree;
        },
        unmountTree: async (id) => {
            unmounted.push(id);
            return { id };
        }
    };
    dom.window.AtomeTimeline = {
        load: async () => [],
        onUpdate: () => () => false
    };
    const { createPanelSurfaceRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js');
    const { bevyPanelRuntimeState } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();

    const runtime = createPanelSurfaceRuntime({
        capturePanelVisibilitySnapshot: () => ({}),
        preparePanelSurfaceDuringOpen: () => {
            throw new Error('legacy_panel_prepare_should_not_run');
        },
        resolvePanelAnchorRect: () => null
    });

    const result = await runtime.openPanelSurface('timeline');
    assert.equal(result.ok, true);
    assert.equal(result.bevy, true);
    assert.equal(dom.window.document.querySelectorAll('button,input,select,textarea').length, 0);
    assert.equal(mounted.length >= 1, true);

    const tree = mounted[0];
    const ids = [];
    visit(tree.root, (node) => ids.push(node.id));
    assert.equal(tree.layer, 'panel');
    assert.equal(tree.root.layer, 'panel');
    assert.equal(tree.root.parent_id, WORKSPACE_SCENE_LAYER_IDS.panel);
    assert.equal(ids.some((id) => id.includes('tools_dock')), false);

    const footer = findNode(tree, 'eve_bevy_panel_timeline_footer');
    const body = findNode(tree, 'eve_bevy_panel_timeline_body');
    const panel = findNode(tree, 'eve_bevy_panel_timeline_panel');
    const accent = findNode(tree, 'eve_bevy_panel_timeline_footer_accent');
    const close = findNode(tree, 'eve_bevy_panel_timeline_footer_close');
    const closeIndicator = findNode(tree, 'eve_bevy_panel_timeline_footer_close_indicator');
    const drag = findNode(tree, 'eve_bevy_panel_timeline_footer_drag');
    assert.equal(body.kind, 'scroll_area');
    assert.equal(footer.kind, 'row');
    assert.equal(BEVY_PANEL_TOKENS.footerHeightPx, EVE_TOOL_SKIN_TOKENS.bevyMenu.footerHeightPx);
    assert.equal(close.accessibility?.role, 'button');
    assert.deepEqual(close.accessibility?.actions, ['activate']);
    assert.equal(close.style.size[1], BEVY_PANEL_TOKENS.footerHeightPx, 'close target must occupy the full footer height');
    const closeDiameter = EVE_TOOL_SKIN_TOKENS.bevyMenu.footerCloseRing.diameterPx;
    const closeBorder = EVE_TOOL_SKIN_TOKENS.bevyMenu.footerCloseRing.borderPx;
    assert.deepEqual(closeIndicator.style.size, [closeDiameter, closeDiameter]);
    assert.deepEqual(closeIndicator.style.position, [4.5, 7.5]);
    assert.equal(closeIndicator.kind, 'panel');
    const closeFill = findNode(tree, 'eve_bevy_panel_timeline_footer_close_indicator_fill');
    const closeSegments = closeIndicator.children.filter((segment) => segment.id.includes('_segment_'));
    assert.deepEqual(closeFill.style.size, [closeDiameter - (closeBorder * 2), closeDiameter - (closeBorder * 2)]);
    assert.deepEqual(closeFill.style.position, [3, 7]);
    assert.deepEqual(closeFill.style.background, EVE_TOOL_SKIN_TOKENS.bevyMenu.footerCloseRing.fillColor);
    assert.equal(closeIndicator.children.length, 37);
    assert.equal(closeSegments.length, 36);
    assert.ok(closeSegments.every((segment) => (
        segment.kind === 'panel'
        && segment.style.background === EVE_TOOL_SKIN_TOKENS.bevyMenu.footerCloseRing.color
        && segment.style.radius === EVE_TOOL_SKIN_TOKENS.bevyMenu.footerCloseRing.borderPx / 2
    )));
    assert.equal(
        Math.min(...closeSegments.map((segment) => segment.style.position[1])),
        EVE_TOOL_SKIN_TOKENS.bevyMenu.footerCloseRing.offsetYPx
    );
    const unfilledCloseIndicator = buildBevyFooterCloseRingNode({ id: 'unfilled_close_indicator', filled: false });
    assert.equal(unfilledCloseIndicator.children.some((child) => child.id.endsWith('_fill')), false, 'skin consumers can disable the red close fill');
    const rightAnchoredCloseIndicator = buildBevyFooterCloseRingNode({
        id: 'right_anchored_close_indicator', anchorSize: close.style.size[0], edge: 'right'
    });
    assert.deepEqual(rightAnchoredCloseIndicator.style.position, [10.5, 7.5], 'a reversed footer must move Close toward its nearest exterior edge');
    assert.equal(findNode(tree, 'eve_bevy_panel_timeline_header'), null);
    assert.equal(footer.children.some((node) => node.id.endsWith('_close')), true);
    assert.equal(footer.children.some((node) => node.id.endsWith('_drag')), true);
    assert.equal(footer.children.some((node) => node.id.endsWith('_resize_left')), true);
    assert.equal(footer.children.some((node) => node.id.endsWith('_resize')), true);
    assert.equal(drag.on.activate, undefined, 'only Panel Lab opts into footer fullscreen activation');
    assert.equal(body.style.overflow, 'scroll');
    assert.ok(findNode(tree, 'timeline_status_row').style.z_index > panel.style.z_index, 'body content must render above the panel shell');
    assert.deepEqual(body.style.position, [0, 0]);
    assert.equal(footer.style.shadow, undefined);
    assert.ok(panel.style.shadow, 'only the outer panel owns the drop shadow');
    assert.deepEqual(accent.style.position, [0, 0]);
    assert.deepEqual(accent.style.size, [panel.style.size[0], EVE_TOOL_SKIN_TOKENS.bevyMenu.footerAccentThicknessPx]);
    assert.deepEqual(accent.style.background, EVE_TOOL_SKIN_TOKENS.bevyMenu.footerAccentColor);
    assert.equal(accent.style.shadow, undefined);
    assert.equal(accent.style.border, undefined);
    assert.equal(accent.on, undefined);
    assert.ok(findNode(tree, 'eve_bevy_panel_timeline_footer_close_indicator').style.z_index > accent.style.z_index);
    const { BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE } = await import('../../eVe/intuition/ribbon/bevy_ui_menu_surface.js');
    const leftGripIcon = findNode(tree, 'eve_bevy_panel_timeline_footer_resize_left_icon');
    const rightGripIcon = findNode(tree, 'eve_bevy_panel_timeline_footer_resize_icon');
    const footerTitle = findNode(tree, 'eve_bevy_panel_timeline_footer_status');
    assert.equal(leftGripIcon.image.source, BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE);
    assert.equal(rightGripIcon.image.source, BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE);
    const expectedGripWidth = Math.round(BEVY_PANEL_TOKENS.resizeHandlePx * EVE_TOOL_SKIN_TOKENS.bevyMenu.footerGripVisualRatio);
    const expectedGripHeight = Math.round(BEVY_PANEL_TOKENS.footerHeightPx * EVE_TOOL_SKIN_TOKENS.bevyMenu.footerGripVisualRatio);
    assert.deepEqual(leftGripIcon.style.size, [expectedGripWidth, expectedGripHeight]);
    assert.deepEqual(rightGripIcon.style.size, [expectedGripWidth, expectedGripHeight]);
    assert.deepEqual(leftGripIcon.style.position, [0, BEVY_PANEL_TOKENS.footerHeightPx - expectedGripHeight]);
    assert.deepEqual(rightGripIcon.style.position, [BEVY_PANEL_TOKENS.resizeHandlePx - expectedGripWidth, BEVY_PANEL_TOKENS.footerHeightPx - expectedGripHeight]);
    assert.deepEqual(leftGripIcon.style.scale, [-1, 1]);
    assert.deepEqual(rightGripIcon.style.scale, [1, 1]);
    assert.equal(footerTitle.style.position[0] + (footerTitle.style.size[0] / 2), footer.style.size[0] / 2, 'footer title must center against the complete footer width');
    assert.equal(footerTitle.style.position[1], EVE_TOOL_SKIN_TOKENS.bevyMenu.footerTitleOffsetYPx, 'footer title must use the shared optical downward offset');

    await drag.on.drag({ delta_x: 40, delta_y: 30 });
    const movedPanel = findNode(mounted.at(-1), 'eve_bevy_panel_timeline_panel');
    assert.deepEqual(movedPanel.style.position, [250, 150]);

    await close.on.activate();
    assert.deepEqual(unmounted, ['eve_bevy_panel_timeline']);
});

test('Calendar and Contact panel surfaces route to Bevy UI instead of legacy HTML', async () => {
    const { dom } = installPanelDom();
    const mounted = [];
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => {
            mounted.push(tree);
            return tree;
        },
        updateTree: async ({ tree }) => {
            mounted.push(tree);
            return tree;
        },
        unmountTree: async (id) => ({ id })
    };
    const { createPanelSurfaceRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js');
    const { bevyPanelRuntimeState } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    const runtime = createPanelSurfaceRuntime({
        capturePanelVisibilitySnapshot: () => ({}),
        preparePanelSurfaceDuringOpen: () => {
            throw new Error('legacy_panel_prepare_should_not_run');
        },
        resolvePanelAnchorRect: () => null
    });

    const calendar = await runtime.openPanelSurface('calendar');
    const contact = await runtime.openPanelSurface('contact');

    assert.equal(calendar.ok, true);
    assert.equal(calendar.bevy, true);
    assert.equal(contact.ok, true);
    assert.equal(contact.bevy, true);
    assert.equal(dom.window.document.querySelectorAll('button,input,select,textarea').length, 0);
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_calendar_root'), 'calendar must mount as a Bevy panel tree');
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_contact_root'), 'contact must mount as a Bevy panel tree');
    assert.equal(mounted.every((tree) => tree.layer === 'panel' && tree.root.parent_id === WORKSPACE_SCENE_LAYER_IDS.panel), true);
});

test('legacy Timeline module no longer creates an HTML dialog', () => {
    const source = readFileSync(join(repoRoot, 'eVe/intuition/tools/timeline.js'), 'utf8');
    assert.doesNotMatch(source, /createEveDialog/);
    assert.doesNotMatch(source, /createEveButton|createEveSlider|createEveNumberInput/);
});

test('Panel Lab is development-gated and uses the shared panel skin', async () => {
    const { dom } = installPanelDom();
    const mounted = [];
    dom.window.__EVE_PANEL_LAB__ = true;
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => { mounted.push(tree); return tree; },
        updateTree: async ({ tree }) => { mounted.push(tree); return tree; },
        unmountTree: async (id) => ({ id })
    };
    const { panelLabSurface, panelLabSurfaceDefinition, registerBevyPanelSurfaces } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_surfaces.js');
    const { bevyPanelRuntimeState } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
    const { createPanelSurfaceRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js');
    const { EVE_COMMON_SKIN_TOKENS, EVE_PANEL_SKIN_TOKENS } = await import('../../eVe/elements/skin/index.js');
    const { BEVY_MENU_TOKENS } = await import('../../eVe/intuition/ribbon/bevy_ui_menu_surface.js');
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    registerBevyPanelSurfaces();
    const runtime = createPanelSurfaceRuntime({
        capturePanelVisibilitySnapshot: () => ({}),
        preparePanelSurfaceDuringOpen: () => {
            throw new Error('legacy_panel_prepare_should_not_run');
        },
        resolvePanelAnchorRect: () => null
    });
    runtime.registerPanelSurfaceDefinition(panelLabSurfaceDefinition);
    const result = await runtime.openPanelSurface('panel_lab');
    assert.equal(result.ok, true);
    assert.equal(mounted.length, 1);
    assert.equal(PANEL_SURFACE_DEFINITIONS.panel_lab, undefined);
    const material = EVE_COMMON_SKIN_TOKENS.bevy.systemSurface;
    assert.equal(BEVY_PANEL_TOKENS.material, material);
    assert.equal(BEVY_MENU_TOKENS.surface.material, material);
    assert.deepEqual(material.shadow.offset, [0, 0]);
    assert.equal(material.shadow.spread, 0);
    assert.deepEqual(material.backdrop, { blurPx: 18, tint: [0, 0, 0, 0.3] });
    const panel = findNode(mounted[0], 'eve_bevy_panel_panel_lab_panel');
    const body = findNode(mounted[0], 'eve_bevy_panel_panel_lab_body');
    const footer = findNode(mounted[0], 'eve_bevy_panel_panel_lab_footer');
    const drag = findNode(mounted[0], 'eve_bevy_panel_panel_lab_footer_drag');
    assert.deepEqual(panel.style.background, material.background);
    assert.deepEqual(panel.style.backdrop, material.backdrop);
    assert.deepEqual(panel.style.shadow, material.shadow);
    assert.equal(mounted[0].presentation, true);
    assert.deepEqual(body.style.background, EVE_PANEL_SKIN_TOKENS.bevyPanel.colors.transparent);
    assert.equal(body.children.length, 3, 'Panel Lab must retain every approved component specimen');
    const textSpecimen = findNode(mounted[0], 'panel_lab_static_body_text');
    assert.equal(textSpecimen.kind, 'text');
    assert.equal(textSpecimen.text, 'Texte de démonstration');
    assert.equal(textSpecimen.on, undefined);
    assert.deepEqual(textSpecimen.style.size, [200, 24]);
    assert.equal(textSpecimen.style.font_size, BEVY_PANEL_TOKENS.bodyTextSizePx);
    assert.equal(textSpecimen.style.font_weight, BEVY_PANEL_TOKENS.bodyTextWeight);
    assert.equal(textSpecimen.style.line_height, BEVY_PANEL_TOKENS.bodyTextLineHeightPx);
    assert.equal(textSpecimen.style.text_align, 'left');
    const dividerSpecimen = findNode(mounted[0], 'panel_lab_horizontal_divider');
    assert.equal(dividerSpecimen.kind, 'divider');
    assert.equal(dividerSpecimen.text, undefined);
    assert.equal(dividerSpecimen.on, undefined);
    assert.equal(dividerSpecimen.style.size, undefined);
    assert.deepEqual(dividerSpecimen.style.background, BEVY_PANEL_TOKENS.colors.divider);
    assert.deepEqual(dividerSpecimen.style.margin, [0, BEVY_PANEL_TOKENS.dividerMarginHorizontalPx, 0, BEVY_PANEL_TOKENS.dividerMarginHorizontalPx]);
    assert.equal(BEVY_PANEL_TOKENS.dividerMarginHorizontalPx, 21);
    assert.deepEqual(BEVY_PANEL_TOKENS.colors.divider, [1, 1, 1, 0.25]);
    assert.equal(EVE_DEFAULT_MESSAGES.fr['eve.panel_lab.static_body_text'], 'Texte de démonstration');
    assert.equal(EVE_DEFAULT_MESSAGES.en['eve.panel_lab.static_body_text'], 'Demonstration text');
    assert.equal(EVE_DEFAULT_MESSAGES.fr['eve.panel_lab.tool_button'], 'Outil');
    assert.equal(EVE_DEFAULT_MESSAGES.en['eve.panel_lab.tool_button'], 'Tool');
    const toolButtonSpecimen = findNode(mounted[0], 'panel_lab_tool_button');
    const toolButtonBackground = findNode(mounted[0], 'panel_lab_tool_button_background');
    const toolButtonIcon = findNode(mounted[0], 'panel_lab_tool_button_icon');
    const toolButtonLabel = findNode(mounted[0], 'panel_lab_tool_button_label');
    assert.equal(toolButtonSpecimen.kind, 'icon_button');
    assert.equal(toolButtonSpecimen.style.position, undefined, 'the panel body flow owns tool-button placement');
    assert.deepEqual(toolButtonSpecimen.style.size, [60, 60]);
    assert.deepEqual(toolButtonSpecimen.style.padding, [8, 0, 0, 0], 'the shared tool label must sit two pixels lower');
    assert.deepEqual(toolButtonSpecimen.style.margin, [8, 8, 8, 8], 'the tool shadow must retain a visible body gap');
    assert.equal(typeof toolButtonSpecimen.on.press, 'function');
    assert.equal(typeof toolButtonSpecimen.on.release, 'function');
    assert.equal(typeof toolButtonSpecimen.on.cancel, 'function');
    assert.equal(typeof toolButtonSpecimen.on.activate, 'function');
    assert.deepEqual(toolButtonBackground.style.background, BEVY_MENU_TOKENS.interaction.off.background);
    assert.deepEqual(toolButtonBackground.style.shadow, BEVY_MENU_TOKENS.interaction.off.shadow);
    assert.equal(findNode(mounted[0], 'panel_lab_tool_button_inset_shadow_top'), null, 'the dark off state must remain raised');
    assert.equal(toolButtonBackground.style.radius, BEVY_MENU_TOKENS.shape.standardRadiusPx);
    assert.equal(toolButtonIcon.image.source.endsWith('/tool.svg'), true);
    assert.equal(toolButtonLabel.image.text, 'Outil');
    assert.deepEqual(toolButtonLabel.style.translation, [0, 1], 'the tool label must sit one pixel below the shared content flow');
    toolButtonSpecimen.on.press();
    const pressedButton = findNode(mounted.at(-1), 'panel_lab_tool_button');
    const pressedBackground = findNode(mounted.at(-1), 'panel_lab_tool_button_background');
    assert.deepEqual(pressedButton.style.translation, [0, 1]);
    assert.deepEqual(pressedBackground.style.background, BEVY_MENU_TOKENS.interaction.offPressed.background);
    assert.deepEqual(pressedBackground.style.shadow, BEVY_MENU_TOKENS.interaction.offPressed.shadow);
    const pressedInset = findNode(mounted.at(-1), 'panel_lab_tool_button_inset_shadow');
    assert.ok(pressedInset, 'pressed state must render one tight dark inner shadow');
    assert.deepEqual(pressedInset.style.background, BEVY_MENU_TOKENS.interaction.offPressed.innerShadow.color);
    assert.equal(pressedInset.on, undefined, 'the inner shadow must not become an interaction target');
    assert.ok(pressedInset.style.z_index < pressedButton.style.z_index + 4, 'the inner shadow must remain below content');
    pressedButton.on.release();
    const releasedButton = findNode(mounted.at(-1), 'panel_lab_tool_button');
    assert.equal(releasedButton.style.translation, undefined);
    releasedButton.on.activate();
    const activeBackground = findNode(mounted.at(-1), 'panel_lab_tool_button_background');
    assert.deepEqual(activeBackground.style.background, BEVY_MENU_TOKENS.interaction.on.background);
    assert.deepEqual(activeBackground.style.shadow, BEVY_MENU_TOKENS.interaction.on.shadow);
    assert.ok(findNode(mounted.at(-1), 'panel_lab_tool_button_inset_shadow'));
    findNode(mounted.at(-1), 'panel_lab_tool_button').on.press();
    const activePressedBackground = findNode(mounted.at(-1), 'panel_lab_tool_button_background');
    assert.deepEqual(activePressedBackground.style.background, BEVY_MENU_TOKENS.interaction.onPressed.background);
    assert.deepEqual(activePressedBackground.style.shadow, BEVY_MENU_TOKENS.interaction.onPressed.shadow);
    const emittedIntents = [];
    const specimens = panelLabSurface.buildContent(panelLabSurface.readState(), { emit: (intent) => emittedIntents.push(intent) });
    specimens.at(-1).on.press();
    specimens.at(-1).on.release();
    specimens.at(-1).on.cancel();
    specimens.at(-1).on.activate();
    assert.deepEqual(emittedIntents, [
        { type: 'panel_lab.tool_button.press' },
        { type: 'panel_lab.tool_button.release' },
        { type: 'panel_lab.tool_button.cancel' },
        { type: 'panel_lab.tool_button.activate' }
    ]);
    assert.deepEqual(panelLabSurface.handleEvent({ type: 'panel_lab.tool_button.cancel' }), { ok: true });
    panelLabSurface.onClose();
    assert.equal(panelLabSurface.readState().toolButton.active, false, 'the Lab control state must not survive surface close');
    assert.deepEqual(
        panelLabSurface.handleEvent({ type: 'panel_lab.unsupported' }),
        { ok: false, error: 'panel_lab_intent_unsupported:panel_lab.unsupported' }
    );
    assert.deepEqual(footer.style.background, BEVY_MENU_TOKENS.clear);
    assert.equal(typeof drag.on.activate, 'function');
    const contentTint = EVE_COMMON_SKIN_TOKENS.systemContent.gpu;
    for (const id of [
        'eve_bevy_panel_panel_lab_footer_resize_left_icon',
        'eve_bevy_panel_panel_lab_footer_status',
        'eve_bevy_panel_panel_lab_footer_resize_icon'
    ]) {
        assert.deepEqual(findNode(mounted[0], id).image.tint, contentTint, id);
    }
    assert.equal(findNode(mounted[0], 'eve_bevy_panel_panel_lab_footer_close_indicator').children.length, 37);
    assert.equal(dom.window.document.querySelectorAll('button,input,select,textarea').length, 0);
    await drag.on.activate();
    await drag.on.activate();
    const fullscreenPanel = findNode(mounted.at(-1), 'eve_bevy_panel_panel_lab_panel');
    assert.deepEqual(fullscreenPanel.style.position, [0, 0]);
    assert.deepEqual(fullscreenPanel.style.size, [1024, 694]);
    const fullscreenDrag = findNode(mounted.at(-1), 'eve_bevy_panel_panel_lab_footer_drag');
    await fullscreenDrag.on.activate();
    await fullscreenDrag.on.activate();
    const restoredPanel = findNode(mounted.at(-1), 'eve_bevy_panel_panel_lab_panel');
    assert.deepEqual(restoredPanel.style.position, [260, 120]);
    assert.deepEqual(restoredPanel.style.size, [420, 280]);
    await runtime.closePanelSurface('panel_lab');
});

test('Bevy UI text projection preserves canonical node typography', () => {
    const records = projectBevyUiTreeRecords({
        tree: {
            root: {
                id: 'root', kind: 'root', style: { size: [240, 80] }, children: [{
                    id: 'text', kind: 'text', text: 'Demonstration text',
                    style: {
                        position: [10, 10], size: [200, 24], font_size: 16,
                        font_weight: 500, line_height: 19, text_align: 'left'
                    }
                }]
            }
        },
        treeId: 'typography_contract',
        workspaceLayer: 'panel'
    });
    const text = records.find((record) => record.id === '__eve_bevy_ui_typography_contract_text_text');
    assert.deepEqual(text?.properties?.text_style, {
        font_size: 16,
        font_weight: 500,
        line_height: 19,
        align: 'left',
        baseline: 'middle',
        padding_x: 0,
        padding_y: 0
    });
});

test('Bevy UI divider projection preserves native stretch and margins', () => {
    const records = projectBevyUiTreeRecords({
        tree: {
            root: {
                id: 'root', kind: 'root', style: { size: [420, 260] }, children: [{
                    id: 'body', kind: 'scroll_area', style: {
                        size: [420, 260], padding: [10, 10, 10, 10], flex_direction: 'column'
                    }, children: [{
                        id: 'divider', kind: 'divider', style: {
                            background: [1, 1, 1, 0.25], margin: [0, 21, 0, 21]
                        }
                    }]
                }]
            }
        },
        treeId: 'divider_contract',
        workspaceLayer: 'panel'
    });
    const divider = records.find((record) => record.id === '__eve_bevy_ui_divider_contract_divider');
    assert.deepEqual(
        [divider?.properties?.left, divider?.properties?.top, divider?.properties?.width, divider?.properties?.height],
        [31, 10, 358, 1]
    );
});

test('Panel layer wins canvas hit-testing over Dashboard-local z-index', async () => {
    const { surface } = installPanelDom();
    const uiRuntime = createEveBevyUiRuntime({
        overlayProjector: { project: async () => [], clear: async () => [] },
        requestFrame: () => 0
    });
    const dashboardTree = {
        id: 'dashboard_bevy_ui',
        layer: 'dashboard',
        root: {
            id: 'dashboard_root', kind: 'root',
            style: { size: [1024, 768], z_index: 9000 },
            children: [{
                id: 'dashboard_card', kind: 'button',
                style: { position: [100, 100], size: [300, 240] },
                on: { activate: () => null }
            }]
        }
    };
    const panelTree = {
        id: 'eve_bevy_panel_test',
        layer: 'panel',
        root: {
            id: 'panel_root', kind: 'root',
            style: { size: [1024, 768], z_index: 1250 },
            children: [{
                id: 'panel_footer_drag', kind: 'drag_handle',
                style: { position: [100, 100], size: [300, 240] },
                on: { drag: () => null }
            }]
        }
    };
    await uiRuntime.mountTree({ id: dashboardTree.id, surface, tree: dashboardTree });
    await uiRuntime.mountTree({ id: panelTree.id, surface, tree: panelTree });
    const hit = uiRuntime.hitTestAtClientPoint({ surface, clientX: 220, clientY: 180 });
    assert.equal(hit?.treeId, 'eve_bevy_panel_test');
    assert.equal(hit?.nodeId, 'panel_footer_drag');
});
