import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import { WORKSPACE_SCENE_LAYER_IDS } from '../../eVe/domains/rendering/workspace_scene_layers.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { EVE_TOOL_SKIN_TOKENS } from '../../eVe/elements/skin/tool_skin.js';
import { EVE_PANEL_SKIN_TOKENS } from '../../eVe/elements/skin/panel_skin.js';
import {
    SYSTEM_UI_INPUT_TOKENS,
    SYSTEM_UI_ROOT_VARS,
    SYSTEM_UI_THEME_TOKENS
} from '../../eVe/elements/system_ui_tokens.js';
import { EVE_PANEL_CHROME_TOKENS } from '../../eVe/elements/design/panel_chrome_tokens.js';
import { EVE_CONTROL_PRESETS } from '../../eVe/elements/look/preset_controls.js';
import { EVE_PANEL_CHROME_PRESETS } from '../../eVe/elements/look/preset_chrome.js';
import { MATRIX_VISUAL_THEME_TOKENS } from '../../eVe/intuition/matrix/visual/matrix_visual_tokens.js';
import { RIBBON_TOKENS } from '../../eVe/intuition/ribbon/tokens.js';
import { buildAtomeEditorStyle } from '../../eVe/intuition/tools/visual/tool_visual_tokens.js';
import { buildBevyFooterCloseRingNode } from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';
import {
    normalizeActionButtonHandlers,
    normalizeActionButtonPresentation
} from '../../atome/src/squirrel/components/action_button_contract.js';
import {
    BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE,
    BEVY_MENU_TOKENS
} from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';

// Load the panel application graph once outside individual timeout budgets.
// Some legacy Squirrel modules inspect HTMLElement during evaluation, so the
// import environment needs the same minimal browser contract as the tests.
const importDom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = importDom.window;
globalThis.document = importDom.window.document;
globalThis.HTMLElement = importDom.window.HTMLElement;
globalThis.CustomEvent = importDom.window.CustomEvent;
const { createPanelSurfaceRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js');
const { bevyPanelRuntimeState, registerBevyPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
const { contactSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js');
const { createInfoPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js');
const { registerBevyPanelSurfaces } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_surfaces.js');
const { EVE_COMMON_SKIN_TOKENS } = await import('../../eVe/elements/skin/index.js');

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

const flushPanelRefresh = () => new Promise((resolve) => setTimeout(resolve, 5));

test('style projections keep one source for system depth and panel control paint', () => {
    assert.equal(SYSTEM_UI_THEME_TOKENS.panelBackdropFilter, SYSTEM_UI_THEME_TOKENS.backdropFilter);
    assert.equal(RIBBON_TOKENS.backdropFilter, SYSTEM_UI_THEME_TOKENS.backdropFilter);
    assert.equal(SYSTEM_UI_ROOT_VARS['--system-input-text-shadow'], SYSTEM_UI_INPUT_TOKENS.textShadow);
    assert.equal(EVE_PANEL_CHROME_TOKENS.textShadow, SYSTEM_UI_INPUT_TOKENS.textShadow);
    assert.equal(EVE_CONTROL_PRESETS.fieldLabel.css.textShadow, SYSTEM_UI_INPUT_TOKENS.textShadow);

    const panel = EVE_PANEL_SKIN_TOKENS.bevyPanel;
    assert.equal(panel.colors.control, panel.actionButton.idleBackground);
    assert.equal(panel.colors.control, panel.table.rowBackground);
    assert.equal(panel.colors.control, panel.select.optionBackground);
    assert.equal(panel.colors.control, panel.mediaCard.background);
    assert.equal(panel.colors.control, panel.selectionSummary.background);
    assert.equal(panel.colors.control, panel.input.idleBackground);
    assert.equal(panel.colors.inputHover, panel.select.hoverBackground);
    assert.equal(panel.select.hoverBackground, panel.select.focusBackground);
    assert.equal(panel.actionButton.pressedBackground, panel.select.pressedBackground);
    assert.equal(panel.state.tones.empty, panel.state.tones.loading);
    assert.notEqual(
        EVE_TOOL_SKIN_TOKENS.bevyMenu.shape.flowerRadiusPx,
        EVE_TOOL_SKIN_TOKENS.bevyMenu.shape.standardRadiusPx
    );
});

test('factored legacy presets remain independently mutable', () => {
    assert.deepEqual(EVE_CONTROL_PRESETS.passwordGroup.css, EVE_CONTROL_PRESETS.dateTimeGroup.css);
    assert.notEqual(EVE_CONTROL_PRESETS.passwordGroup.css, EVE_CONTROL_PRESETS.dateTimeGroup.css);
    assert.deepEqual(EVE_CONTROL_PRESETS.checkbox.checked, EVE_CONTROL_PRESETS.radio.checked);
    assert.notEqual(EVE_CONTROL_PRESETS.checkbox.checked, EVE_CONTROL_PRESETS.radio.checked);
    assert.equal(EVE_PANEL_CHROME_PRESETS.header.css.textShadow, EVE_PANEL_CHROME_TOKENS.textShadow);
});

test('Matrix and generated editor CSS consume factored style owners', () => {
    assert.equal(MATRIX_VISUAL_THEME_TOKENS.filledCellBackground, MATRIX_VISUAL_THEME_TOKENS.currentCellBackground);
    assert.equal(MATRIX_VISUAL_THEME_TOKENS.filledCellShadow, MATRIX_VISUAL_THEME_TOKENS.currentCellShadow);

    const css = buildAtomeEditorStyle({ editorId: 'style_factorization_probe' });
    assert.equal((css.match(/scrollbar-width: none;/g) || []).length, 1);
    assert.equal((css.match(/#style_factorization_probe \[data-role="tools"\] \{/g) || []).length, 1);
    assert.match(css, /\[data-eve-tool-visual-host="atome-editor"\] \.eve-atome-edit-footer-tool/);

    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
    const style = dom.window.document.createElement('style');
    style.textContent = css;
    dom.window.document.head.appendChild(style);
    assert.ok(style.sheet.cssRules.length > 10, 'generated editor CSS must parse as a complete stylesheet');
});

test('Squirrel action-button contract validates presentations and suppresses blocked handlers', () => {
    const presentation = normalizeActionButtonPresentation({ label: 'Apply', variant: 'neutral' });
    const handler = () => true;
    assert.deepEqual(presentation, { label: 'Apply', variant: 'neutral', disabled: false, busy: false });
    assert.equal(normalizeActionButtonHandlers({ activate: handler }, presentation).activate, handler);
    assert.deepEqual(normalizeActionButtonHandlers({ activate: handler }, normalizeActionButtonPresentation({ label: 'Saving', busy: true })), {});
    assert.deepEqual(normalizeActionButtonHandlers({ activate: handler }, normalizeActionButtonPresentation({ label: 'Unavailable', disabled: true })), {});
    assert.throws(() => normalizeActionButtonPresentation({ label: '' }), /squirrel_action_button_label_required/);
    assert.throws(() => normalizeActionButtonPresentation({ label: 'Save', variant: 'warning' }), /squirrel_action_button_variant_unsupported:warning/);
    assert.throws(() => normalizeActionButtonPresentation({ label: 'Save', busy: 'true' }), /squirrel_action_button_busy_boolean_required/);
    assert.throws(() => normalizeActionButtonHandlers(null, {}), /squirrel_action_button_handlers_object_required/);
});

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
    assert.deepEqual(closeFill.style.position, [3, 5]);
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
    assert.equal(body.style.overflow, 'scroll_y');
    assert.deepEqual(footer.style.background, BEVY_PANEL_TOKENS.footerMaterial.background);
    assert.equal(footer.style.background[3], 1);
    assert.deepEqual(footer.style.backdrop, BEVY_PANEL_TOKENS.footerMaterial.backdrop);
    assert.equal(footer.style.shadow, undefined, 'footer backdrop must not duplicate the outer panel shadow');
    assert.deepEqual(body.scrollMotion, BEVY_PANEL_TOKENS.scrollMotion);
    assert.equal(body.scrollbar.widthPx, 3);
    assert.equal(body.scrollbar.insetPx, 3);
    assert.equal(body.scrollbar.minHeightPx, 24);
    assert.equal(body.scrollbar.hideDelayMs, 700);
    assert.equal(body.scrollbar.fadeMs, 120);
    assert.ok(findNode(tree, 'timeline_status_row').style.z_index > panel.style.z_index, 'body content must render above the panel shell');
    assert.deepEqual(body.style.position, [0, 0]);
    assert.ok(panel.style.shadow, 'only the outer panel owns the drop shadow');
    assert.equal(
        panel.style.position[1] + panel.style.size[1],
        768 - 74,
        'desktop panel opening geometry must meet the top of the main toolbar'
    );
    assert.deepEqual(accent.style.position, [0, 0]);
    assert.deepEqual(accent.style.size, [panel.style.size[0], EVE_TOOL_SKIN_TOKENS.bevyMenu.footerAccentThicknessPx]);
    assert.deepEqual(accent.style.background, EVE_TOOL_SKIN_TOKENS.bevyMenu.footerAccentColor);
    assert.equal(accent.style.shadow, undefined);
    assert.equal(accent.style.border, undefined);
    assert.equal(accent.on, undefined);
    assert.ok(findNode(tree, 'eve_bevy_panel_timeline_footer_close_indicator').style.z_index > accent.style.z_index);
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
    assert.deepEqual(movedPanel.style.position, [250, 434], 'a panel cannot drag down across the toolbar boundary');

    await close.on.activate();
    assert.deepEqual(unmounted, ['eve_bevy_panel_timeline']);
});

test('Calendar Contact and Info panel surfaces route to Bevy UI instead of legacy HTML', async () => {
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
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    registerBevyPanelSurface(contactSurface);
    registerBevyPanelSurface(createInfoPanelSurface({
        readAll: async () => [{
            atome_id: 'info_shape', type: 'shape', project_id: 'panel_project',
            properties: { name: 'Info shape', color: '#ff3355', width: 120, height: 80, locked: false }
        }],
        readOne: async () => null,
        readSelection: () => ['info_shape'],
        selectAtome: () => 'info_shape',
        persist: async () => ({ ok: true }),
        copyText: async () => ({ ok: true }),
        renderPreview: async () => ({ ok: true, preview_url: 'data:image/webp;base64,AA==' }),
        events: { on: () => () => false }
    }).surface);
    const runtime = createPanelSurfaceRuntime({
        capturePanelVisibilitySnapshot: () => ({}),
        preparePanelSurfaceDuringOpen: () => {
            throw new Error('legacy_panel_prepare_should_not_run');
        },
        resolvePanelAnchorRect: () => null
    });

    const calendar = await runtime.openPanelSurface('calendar');
    const contact = await runtime.openPanelSurface('contact');
    const info = await runtime.openPanelSurface('info');
    await flushPanelRefresh();

    assert.equal(calendar.ok, true);
    assert.equal(calendar.bevy, true);
    assert.equal(contact.ok, true);
    assert.equal(contact.bevy, true);
    assert.equal(info.ok, true);
    assert.equal(info.bevy, true);
    assert.equal(dom.window.document.querySelectorAll('button,input,select,textarea').length, 0);
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_calendar_root'), 'calendar must mount as a Bevy panel tree');
    const calendarTree = mounted.filter((tree) => tree.root.id === 'eve_bevy_panel_calendar_root').at(-1);
    assert.ok(findNode(calendarTree, 'calendar_view_selector'), 'calendar must expose the shared Month/Week/Day/Agenda selector');
    assert.ok(findNode(calendarTree, 'calendar_month_grid'), 'calendar must project a bounded month grid through BevyUI');
    assert.ok(findNode(calendarTree, 'calendar_source_all'), 'calendar must expose its canonical source filter in the canvas');
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_contact_root'), 'contact must mount as a Bevy panel tree');
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_info_root'), 'Info must mount as a Bevy panel tree');
    const infoTree = mounted.filter((tree) => tree.root.id === 'eve_bevy_panel_info_root').at(-1);
    assert.ok(findNode(infoTree, 'info_selection_summary'), 'Info must project the shared selection summary');
    assert.ok(findNode(infoTree, 'info_detail_accordion'), 'Info must project its selected-atome detail composition');
    assert.ok(findNode(infoTree, 'info_selection_hierarchy'), 'Info must project its hierarchical selection list');
    assert.equal(mounted.every((tree) => tree.layer === 'panel' && tree.root.parent_id === WORKSPACE_SCENE_LAYER_IDS.panel), true);
});

test('legacy Timeline module no longer creates an HTML dialog', () => {
    const source = readFileSync(join(repoRoot, 'eVe/intuition/tools/timeline.js'), 'utf8');
    assert.doesNotMatch(source, /createEveDialog/);
    assert.doesNotMatch(source, /createEveButton|createEveSlider|createEveNumberInput/);
});

test('Calendar bridge and app shell cannot restore the retired DOM/vendor route', () => {
    const bridge = readFileSync(join(repoRoot, 'eVe/intuition/tools/calendar.js'), 'utf8');
    const shell = readFileSync(join(repoRoot, 'atome/src/index.html'), 'utf8');
    const spark = readFileSync(join(repoRoot, 'atome/src/squirrel/spark.js'), 'utf8');
    const application = readFileSync(join(repoRoot, 'atome/src/application/index.js'), 'utf8');
    assert.doesNotMatch(bridge, /createEveDialog|calendar_panel_dom|calendar_panel_init|innerHTML|createElement/);
    assert.doesNotMatch(shell, /event-calendar|eventCalendar/);
    assert.doesNotMatch(shell, /rel=["']modulepreload["'][^>]+(?:application\/index\.js|eVe\/eVe\.js)/, 'deferred app modules must not be preloaded long before their canonical owner imports them');
    assert.match(spark, /applicationEntryModule\s*=\s*\[\{[^}]*path:\s*['"]\.\.\/application\/index\.js['"]/, 'spark must keep ownership of the deferred application import');
    assert.match(spark, /modules:\s*applicationEntryModule/, 'spark must load the application only at its canonical boot stage');
    assert.match(application, /modules:\s*\[\{[^}]*path:\s*['"]\.\.\/\.\.\/\.\.\/eVe\/eVe\.js['"]/, 'application boot must keep ownership of the deferred eVe import');
});

test('shared panel material remains canonical after retirement of the specimen-only Lab', () => {
    const material = EVE_COMMON_SKIN_TOKENS.bevy.systemSurface;
    assert.equal(PANEL_SURFACE_DEFINITIONS.panel_lab, undefined);
    assert.equal(BEVY_PANEL_TOKENS.material, material);
    assert.equal(BEVY_MENU_TOKENS.surface.material, material);
    assert.deepEqual(material.shadow.offset, [0, 0]);
    assert.equal(material.shadow.spread, 0);
    assert.deepEqual(material.backdrop, { blurPx: 18, tint: [0, 0, 0, 0.3] });
});
