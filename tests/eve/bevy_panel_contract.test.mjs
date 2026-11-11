import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import { loadAudioKernels } from '../../atome/src/application/audio_runtime/audio_kernels.js';
import { WORKSPACE_SCENE_LAYER_IDS } from '../../eVe/domains/rendering/workspace_scene_layers.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';
import { resolveBevyMainMenuItemSize } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { buildBevyPanelTree } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { panelBandHeight } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_band.js';
import { resolveBevyPanelGridSlab } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js';
import { EVE_TOOL_SKIN_TOKENS } from '../../eVe/elements/skin/tool_skin.js';
import { EVE_PANEL_SKIN_TOKENS } from '../../eVe/elements/skin/panel_skin.js';
import {
    SYSTEM_UI_INPUT_TOKENS,
    SYSTEM_UI_METRICS,
    SYSTEM_UI_PANEL_CHROME_TOKENS,
    SYSTEM_UI_ROOT_VARS,
    SYSTEM_UI_THEME_TOKENS
} from '../../eVe/elements/system_ui_tokens.js';
import { eveTokens } from '../../eVe/elements/look/tokens.js';
import { EVE_CONTROL_PRESETS } from '../../eVe/elements/look/preset_controls.js';
import { RIBBON_TOKENS } from '../../eVe/intuition/ribbon/tokens.js';
import { buildAtomeEditorStyle } from '../../eVe/intuition/tools/visual/tool_visual_tokens.js';
import {
    normalizeActionButtonHandlers,
    normalizeActionButtonPresentation
} from '../../atome/src/squirrel/components/action_button_contract.js';
import { BEVY_MENU_TOKENS } from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';

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
const { colorSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_color_runtime.js');
const { createInfoPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js');
const { registerBevyPanelSurfaces } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_surfaces.js');
const { EVE_COMMON_SKIN_TOKENS } = await import('../../eVe/elements/skin/index.js');

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const installPanelDom = () => {
    // A real origin: the panels read their preferences from localStorage.
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>', { url: 'http://localhost/' });
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
const FRAME_FALLBACK_WAIT_MS = 100;

test('style projections keep one source for system depth and panel control paint', () => {
    assert.equal(SYSTEM_UI_THEME_TOKENS.panelBackdropFilter, SYSTEM_UI_THEME_TOKENS.backdropFilter);
    assert.equal(RIBBON_TOKENS.backdropFilter, SYSTEM_UI_THEME_TOKENS.backdropFilter);
    assert.equal(SYSTEM_UI_ROOT_VARS['--system-input-text-shadow'], SYSTEM_UI_INPUT_TOKENS.textShadow);
    // The panel chrome design tokens were folded into the look tokens.
    assert.equal(eveTokens.input.textShadow, SYSTEM_UI_INPUT_TOKENS.textShadow);
    assert.equal(eveTokens.panelFooterChrome.background, SYSTEM_UI_PANEL_CHROME_TOKENS.background);
    assert.equal(EVE_CONTROL_PRESETS.text.css.textShadow, SYSTEM_UI_INPUT_TOKENS.textShadow);

    // The panel shell and its cards compose the live system glass (Settings ›
    // Visual): its ground and backdrop, each with its own depth.
    const panel = EVE_PANEL_SKIN_TOKENS.bevyPanel;
    const system = EVE_COMMON_SKIN_TOKENS.bevy.systemSurface;
    assert.notEqual(panel.material, system);
    assert.equal(panel.material, panel.surfaces.shell);
    assert.equal(panel.controlMaterial, panel.surfaces.control);
    assert.equal(BEVY_PANEL_TOKENS.material, panel.material);
    assert.equal(BEVY_PANEL_TOKENS.controlMaterial, panel.controlMaterial);
    for (const material of [panel.material, panel.controlMaterial, panel.footerMaterial]) {
        assert.deepEqual(material.background, system.background);
        assert.deepEqual(material.backdrop, system.backdrop);
    }
    assert.notDeepEqual(panel.material.shadow, system.shadow, 'the shell casts its own deeper shadow');
    assert.equal(BEVY_MENU_TOKENS.surface.material, EVE_COMMON_SKIN_TOKENS.bevy.toolSurface);
    assert.equal(panel.colors.control, panel.actionButton.idleBackground);
    assert.equal(panel.colors.control, panel.table.rowBackground);
    assert.equal(panel.colors.control, panel.select.optionBackground);
    assert.equal(panel.colors.control, panel.mediaCard.background);
    assert.equal(panel.colors.control, panel.selectionSummary.background);
    // A field is the one surface darker than the cards around it.
    assert.deepEqual(panel.input.idleBackground, panel.surfaces.input.background);
    assert.notDeepEqual(panel.input.idleBackground, panel.colors.control);
    assert.equal(panel.state.tones.empty, panel.state.tones.loading);
    // One radius rule (AGENTS.md rule 14): Mystic plates and standard tools share it.
    assert.equal(EVE_TOOL_SKIN_TOKENS.bevyMenu.shape.mysticRadiusPx, SYSTEM_UI_METRICS.radiusPx);
    assert.equal(EVE_TOOL_SKIN_TOKENS.bevyMenu.shape.standardRadiusPx, SYSTEM_UI_METRICS.radiusPx);
});

test('factored legacy presets remain independently mutable', () => {
    // The legacy presets left share their input look through the look tokens,
    // each keeping its own object.
    const { input, passwordToggle, button, text } = EVE_CONTROL_PRESETS;
    assert.equal(passwordToggle.css.height, input.css.height);
    assert.equal(passwordToggle.css.borderRadius, input.css.borderRadius);
    assert.notEqual(passwordToggle.css, input.css);
    assert.equal(button.css.textShadow, text.css.textShadow);
    assert.notEqual(button.css, text.css);
    assert.equal(EVE_CONTROL_PRESETS.text.css.textShadow, eveTokens.input.textShadow);
});

test('Generated editor CSS consumes factored style owners', () => {
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

test('Close follows handedness while invisible resize targets and centered title remain stable', async () => {
    // The foot band reads the canonical handedness preference; the resize grips
    // are the glass's two bottom corners, beside the band rather than inside it.
    const { readState, setHandedness } = await import('../../eVe/intuition/core/state.js');
    const previous = readState().handedness;
    const build = (handedness) => {
        setHandedness(handedness);
        return buildBevyPanelTree({
            id: `handed_${handedness}`,
            title: 'Panel',
            name: 'Panel',
            geometry: { x: 0, y: 0, width: 360, height: 180 },
            surfaceSize: { width: 800, height: 600 },
            onClose: () => {},
            onDrag: () => {},
            onResize: () => {}
        });
    };
    const controls = (tree, handedness) => findNode(tree, `handed_${handedness}_footer`).children
        .map(({ id }) => id)
        .filter((id) => !id.endsWith('_name') && !id.endsWith('_status'));
    try {
        const left = build('left');
        const right = build('right');
        assert.deepEqual(controls(left, 'left'), ['handed_left_footer_drag', 'handed_left_footer_close']);
        assert.deepEqual(controls(right, 'right'), ['handed_right_footer_drag', 'handed_right_footer_close']);
        const closeX = (tree, handedness) => findNode(tree, `handed_${handedness}_footer_close`).style.position[0];
        const footerWidth = findNode(left, 'handed_left_footer').style.size[0];
        const closeWidth = findNode(left, 'handed_left_footer_close').style.size[0];
        assert.equal(closeX(left, 'left'), 0, 'a left hand finds Close in the left corner');
        assert.equal(closeX(right, 'right'), footerWidth - closeWidth, 'a right hand finds Close in the right corner');
        for (const [tree, handedness] of [[left, 'left'], [right, 'right']]) {
            const footer = findNode(tree, `handed_${handedness}_footer`);
            const title = findNode(tree, `handed_${handedness}_footer_name`);
            const panel = findNode(tree, `handed_${handedness}_panel`);
            assert.equal(title.text, 'Panel');
            assert.equal(title.style.position[0] + (title.style.size[0] / 2), footer.style.size[0] / 2);
            const grips = panel.children.map(({ id }) => id).filter((id) => id.includes('_resize'));
            assert.deepEqual(grips, [`handed_${handedness}_footer_resize_left`, `handed_${handedness}_footer_resize`]);
            assert.deepEqual(findNode(tree, `handed_${handedness}_footer_resize_left`).children, []);
            assert.deepEqual(findNode(tree, `handed_${handedness}_footer_resize`).children, []);
        }
    } finally {
        setHandedness(previous);
    }
});

test('Bevy panel contract removes tools dock and keeps system controls in footer', async () => {
    const { dom, surface } = installPanelDom();
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
        },
        // The panel runtime compares the user scroll revision around an opening.
        treeScrollRevision: () => 0
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

    // The foot band (AGENTS.md rule 13) lies on the glass, inside the slab: the
    // shared tools band with Close in its corner, the room beside the tools moving
    // the panel and showing its passing status; the resize grips are the glass's corners.
    const footer = findNode(tree, 'eve_bevy_panel_timeline_footer');
    const body = findNode(tree, 'eve_bevy_panel_timeline_body');
    const panel = findNode(tree, 'eve_bevy_panel_timeline_panel');
    const close = findNode(tree, 'eve_bevy_panel_timeline_footer_close');
    const closeGround = findNode(tree, 'eve_bevy_panel_timeline_footer_close_background');
    const closeIcon = findNode(tree, 'eve_bevy_panel_timeline_footer_close_icon');
    const drag = findNode(tree, 'eve_bevy_panel_timeline_footer_drag');
    const bandHeight = panelBandHeight();
    assert.equal(body.kind, 'scroll_area');
    assert.equal(footer.kind, 'panel');
    assert.equal(footer.style.size[1], bandHeight);
    assert.deepEqual(footer.style.size, [panel.style.size[0] - (BEVY_PANEL_TOKENS.paddingPx * 2), bandHeight]);
    assert.equal(footer.style.position[1], panel.style.position[1] + panel.style.size[1] - BEVY_PANEL_TOKENS.paddingPx - bandHeight);
    assert.equal(close.kind, 'icon_button');
    assert.equal(close.accessibility?.role, 'button');
    assert.deepEqual(close.accessibility?.actions, ['activate']);
    assert.deepEqual(close.style.size, [bandHeight, bandHeight], 'close target is one band tool');
    assert.equal(close.style.position[0], footer.style.size[0] - bandHeight, 'a right hand finds Close in the right corner');
    assert.equal(closeGround.style.radius, EVE_TOOL_SKIN_TOKENS.bevyMenu.shape.standardRadiusPx);
    assert.deepEqual(closeGround.style.backdrop, EVE_COMMON_SKIN_TOKENS.bevy.toolSurface.backdrop, 'Close is a tool on the tool glass');
    assert.equal(closeIcon.kind, 'image');
    assert.equal(closeIcon.image.source, './assets/images/icons/close.svg');
    assert.equal(findNode(tree, 'eve_bevy_panel_timeline_header'), null);
    assert.equal(findNode(tree, 'eve_bevy_panel_timeline_footer_accent'), null);
    assert.equal(footer.children.some((node) => node.id.endsWith('_close')), true);
    assert.equal(footer.children.some((node) => node.id.endsWith('_drag')), true);
    assert.equal(panel.children.some((node) => node.id.endsWith('_footer_resize_left')), true);
    assert.equal(panel.children.some((node) => node.id.endsWith('_footer_resize')), true);
    assert.equal(drag.on.activate, undefined, 'only Panel Lab opts into footer fullscreen activation');
    assert.equal(body.style.overflow, 'scroll_y');
    assert.deepEqual(footer.style.background, BEVY_MENU_TOKENS.clear, 'the band paints nothing over the glass');
    assert.equal(footer.style.shadow, undefined, 'footer must not duplicate the outer panel shadow');
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
        768 - resolveBevyMainMenuItemSize() - BEVY_PANEL_TOKENS.dockGapPx,
        'desktop panel opening geometry stops one dock gap above the main toolbar'
    );
    assert.equal(findNode(tree, 'eve_bevy_panel_timeline_footer_resize_left_icon'), null);
    assert.equal(findNode(tree, 'eve_bevy_panel_timeline_footer_resize_icon'), null);
    assert.deepEqual(findNode(tree, 'eve_bevy_panel_timeline_footer_resize_left').children, []);
    assert.deepEqual(findNode(tree, 'eve_bevy_panel_timeline_footer_resize').children, []);
    const footerStatus = findNode(tree, 'eve_bevy_panel_timeline_footer_status');
    assert.deepEqual(footerStatus.style.position, drag.style.position, 'the status fills the room the tools leave');
    assert.deepEqual(footerStatus.style.size, drag.style.size);
    assert.ok(footerStatus.style.z_index > drag.style.z_index);

    drag.on.press({ client_x: 0, client_y: 0 });
    await drag.on.drag({ client_x: 40, client_y: 30 });
    drag.on.release();
    const movedPanel = findNode(mounted.at(-1), 'eve_bevy_panel_timeline_panel');
    // The dragged slab stays on the screen grid's columns (D5) and is moved right.
    const movedX = movedPanel.style.position[0];
    assert.ok(movedX > panel.style.position[0]);
    assert.equal(resolveBevyPanelGridSlab({ surface, x: movedX, width: movedPanel.style.size[0] }).x, movedX);
    assert.equal(
        movedPanel.style.position[1],
        768 - movedPanel.style.size[1] - resolveBevyMainMenuItemSize() - BEVY_PANEL_TOKENS.dockGapPx,
        'a panel cannot drag down across the toolbar boundary'
    );

    await close.on.activate();
    assert.deepEqual(unmounted, ['eve_bevy_panel_timeline']);
});

test('Calendar Contact Info and Color route to Bevy UI instead of legacy HTML', async () => {
    // The Calendar's occurrences are expanded by the Rust kernels (icalendar.js#calendarRangeOccurrences).
    await loadAudioKernels({
        moduleUrl: new URL('../../atome/src/wasm/squirrel_audio_wasm.js', import.meta.url).href,
        binary: readFileSync(new URL('../../atome/src/wasm/squirrel_audio_wasm_bg.wasm', import.meta.url))
    });
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
        unmountTree: async (id) => ({ id }),
        treeScrollRevision: () => 0
    };
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    registerBevyPanelSurface(contactSurface);
    registerBevyPanelSurface(colorSurface);
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
    await flushPanelRefresh();
    // The views and the calendars are shown on demand: the band's Display tool
    // swaps the search for the Month/Week/Day/Agenda selector and unfolds the list.
    const latestCalendarTree = () => mounted.filter((tree) => tree.root.id === 'eve_bevy_panel_calendar_root').at(-1);
    const calendarBand = (suffix) => findNode(latestCalendarTree(), `eve_bevy_panel_calendar_footer_${suffix}`);
    assert.ok(calendarBand('calendar_search'), 'calendar keeps its search in the band');
    assert.equal(calendarBand('calendar_view_selector'), null);
    await calendarBand('calendar_display').on.activate();
    // The refresh waits for the next frame (its timer fallback outside a browser).
    await new Promise((resolve) => setTimeout(resolve, FRAME_FALLBACK_WAIT_MS));
    assert.ok(calendarBand('calendar_view_selector'), 'calendar must expose the shared Month/Week/Day/Agenda selector');
    assert.ok(findNode(latestCalendarTree(), 'calendar_list'), 'calendar must expose its canonical calendar filter in the canvas');
    const contact = await runtime.openPanelSurface('contact');
    const info = await runtime.openPanelSurface('info');
    const color = await runtime.openPanelSurface('couleur');
    await flushPanelRefresh();

    assert.equal(calendar.ok, true);
    assert.equal(calendar.bevy, true);
    assert.equal(contact.ok, true);
    assert.equal(contact.bevy, true);
    assert.equal(info.ok, true);
    assert.equal(info.bevy, true);
    assert.equal(color.bevy, true);
    assert.equal(dom.window.document.querySelectorAll('button,input,select,textarea').length, 0);
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_calendar_root'), 'calendar must mount as a Bevy panel tree');
    const calendarTree = mounted.filter((tree) => tree.root.id === 'eve_bevy_panel_calendar_root').at(-1);
    assert.ok(findNode(calendarTree, 'calendar_month_grid'), 'calendar must project a bounded month grid through BevyUI');
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_contact_root'), 'contact must mount as a Bevy panel tree');
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_info_root'), 'Info must mount as a Bevy panel tree');
    const colorTree = mounted.filter((tree) => tree.root.id === 'eve_bevy_panel_couleur_root').at(-1);
    assert.ok(colorTree, 'Color must mount as a Bevy panel tree');
    assert.ok(findNode(colorTree, 'color_swatch_0_2'));
    // Each RGBA channel is the shared tool slider.
    assert.equal(findNode(colorTree, 'color_channels_r')?.kind, 'tool_slider');
    assert.equal(dom.window.document.getElementById('eve_couleur_dialog'), null);
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
    assert.equal(BEVY_PANEL_TOKENS.material, EVE_PANEL_SKIN_TOKENS.bevyPanel.surfaces.shell);
    assert.deepEqual(BEVY_PANEL_TOKENS.material.backdrop, material.backdrop);
    assert.equal(BEVY_MENU_TOKENS.surface.material, EVE_COMMON_SKIN_TOKENS.bevy.toolSurface);
    assert.deepEqual(material.shadow.offset, [0, 0]);
    assert.equal(material.shadow.spread, 0);
    assert.deepEqual(material.backdrop.tint, material.tint, 'the backdrop tints with the live glass');
});
