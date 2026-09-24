import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { clearAllProjectScenes, getProjectSceneState } from '../../eVe/domains/rendering/project_scene_runtime.js';
import {
    buildAtomeContextualEditTree
} from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_model.js';
import { BEVY_MENU_TOKENS } from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';
import { buildBevyUiMysticTree } from '../../eVe/intuition/ribbon/bevy_ui_mystic_model.js';
import { buildBevyMainMenuTree } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createAtomeContextualEditRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js';
import { createAtomeContextualSurfaceInterceptor } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_handlers.js';
import { resolveComposedInteractionTarget } from '../../eVe/domains/rendering/surface_interaction_runtime.js';
import { createAtomeContextualRailModelRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_model_runtime.js';
import { projectViewPlayback } from '../../eVe/domains/rendering/project_view_playback_runtime.js';
import {
    markDashboardWorkspaceMode,
    markProjectWorkspaceMode
} from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';

test('BevyUI canvas binding owns touch gestures for mobile pointer scroll', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.getElementById('eve_surface_project');
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => null,
        requestFrame: () => 0
    });

    await runtime.mountTree({
        id: 'touch_tree',
        surface,
        tree: {
            id: 'touch_root',
            kind: 'root',
            style: { size: [120, 80] },
            children: [{ id: 'scroll_target', kind: 'scroll_area', style: { size: [120, 80] } }]
        }
    });

    assert.equal(surface.style.touchAction, 'none');
    surface.getBoundingClientRect = () => ({ left: 20, top: 30, width: 120, height: 80 });
    const hit = runtime.hitTestAtClientPoint({ surface, clientX: 40, clientY: 50 });
    assert.deepEqual({
        treeId: hit?.treeId,
        nodeId: hit?.nodeId,
        kind: hit?.kind,
        box: hit?.box
    }, {
        treeId: 'touch_tree',
        nodeId: 'scroll_target',
        kind: 'scroll_area',
        box: { x: 0, y: 0, width: 120, height: 80 }
    });
    assert.deepEqual(
        hit?.scrollAncestors?.map((entry) => entry.node?.id),
        ['scroll_target'],
        'touch hit testing must retain the canonical scroll ownership chain'
    );
    assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 200, clientY: 200 }), null);
    assert.equal(dom.window.document.querySelectorAll('button, input, [data-bevy-ui]').length, 0);
});

const readMenuAccess = async context => ({ ...context,
    records: [{ id: context.atomeId, capabilities: { write: true, delete: true } }],
    projectRecord: { capabilities: { create: true } }
});

const findNode = (node, id) => {
    if (node?.id === id) return node;
    for (const child of node?.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};

test('all three Bevy menu trees stay outside the workspace backdrop capture', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const main = buildBevyMainMenuTree({
        surface,
        handedness: 'left',
        content: {
            toolbox: { children: ['view'] },
            view: { atome_tool: true, label: 'Vue', icon: 'view', tool_id: 'tool.view' }
        },
        state: { activePaletteKey: '', latchedByToolId: new Map(), externalOpenByToolId: new Map() }
    });
    const mystic = buildBevyUiMysticTree({
        surface,
        center: { x: 400, y: 300 },
        items: [{ key: 'view', label: 'Vue', type: 'tool' }]
    });
    const contextual = buildAtomeContextualEditTree({
        surface,
        activeAtomeId: 'a',
        definitions: [{ key: 'detail', label: 'detail', toolType: 'standard' }]
    });
    for (const tree of [main, mystic, contextual]) {
        const normalizedTree = normalizeBevyUiTree({ id: tree.id, tree });
        const records = projectBevyUiTreeRecords({
            tree: normalizedTree,
            treeId: tree.id,
            workspaceLayer: tree.layer
        });
        assert.equal(normalizedTree.presentation, true, tree.id);
        assert.ok(records.length > 0);
        assert.equal(records.every((record) => record.properties.presentation === true), true, tree.id);
    }
    const workspaceTree = normalizeBevyUiTree({
        id: 'workspace_fixture',
        tree: {
            id: 'workspace_fixture',
            root: { id: 'workspace_fixture_root', kind: 'panel', style: { size: [40, 40], background: [1, 1, 1, 1] } }
        }
    });
    const workspaceRecords = projectBevyUiTreeRecords({
        tree: workspaceTree,
        treeId: 'workspace_fixture',
        workspaceLayer: 'project'
    });
    assert.equal(workspaceTree.presentation, false);
    assert.equal(workspaceRecords.every((record) => record.properties.presentation === false), true);
});

test('Atome contextual edit keeps only the handed tool rail and 3x slider', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const records = [{ id: 'a', properties: { left: 40, top: 50, width: 200, height: 120 } }, {
        id: 'b', properties: { left: 300, top: 70, width: 160, height: 90 }
    }];
    const input = {
        surface, records, editing: [{ atomeId: 'a' }, { atomeId: 'b' }], activeAtomeId: 'a',
        definitions: [{ key: 'size', toolType: 'slider' }],
        sliderStateByKey: new Map([['size', { expanded: true }]])
    };
    const right = buildAtomeContextualEditTree(input);
    const rail = findNode(right.root, 'eve_bevy_panel_atome_contextual_edit_rail');
    const railShadow = findNode(right.root, 'eve_bevy_panel_atome_contextual_edit_rail_shadow');
    assert.deepEqual(rail.style.position, [740, 360]);
    assert.equal(railShadow.style.shadow, BEVY_MENU_TOKENS.surface.material.shadow);
    assert.deepEqual(railShadow.style.position, rail.style.position);
    assert.deepEqual(railShadow.style.size, rail.style.size);
    assert.equal(findNode(right.root, 'atome_contextual_edit_a_surface'), null);
    assert.equal(findNode(right.root, 'atome_contextual_edit_a_outline'), null);
    assert.equal(findNode(right.root, 'atome_contextual_edit_a_footer'), null);
    assert.equal(findNode(right.root, 'atome_contextual_edit_a_close'), null);
    assert.equal(findNode(right.root, 'atome_contextual_edit_a_drag'), null);
    assert.equal(rail.children.length, 1);
    assert.deepEqual(findNode(rail, 'atome_contextual_tool_size_background').style.size, [60, 60]);
    assert.equal(findNode(right.root, 'atome_contextual_edit_b_footer'), null);
    assert.equal(findNode(rail, 'atome_contextual_tool_size').style.size[1], 180);
    const left = buildAtomeContextualEditTree({ ...input, handedness: 'left' });
    assert.equal(findNode(left.root, 'eve_bevy_panel_atome_contextual_edit_rail').style.position[0], 0);
});

test('horizontal and vertical tools share the same material structure and relative layer contract', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const main = buildBevyMainMenuTree({
        surface,
        content: {
            toolbox: { children: ['detail'] },
            detail: { atome_tool: true, label: 'detail', icon: 'detail', tool_id: 'tool.detail' }
        },
        state: { activePaletteKey: '', latchedByToolId: new Map(), externalOpenByToolId: new Map() }
    });
    const contextual = buildAtomeContextualEditTree({
        surface,
        activeAtomeId: 'a',
        records: [{ id: 'a', properties: { left: 20, top: 20, width: 100, height: 100 } }],
        definitions: [{ key: 'detail', label: 'detail', icon: 'detail', toolType: 'standard' }]
    });
    const mainShell = findNode(main.root, 'eve_bevy_ui_main_menu_tool_detail');
    const mainSurface = findNode(mainShell, `${mainShell.id}_background`);
    const mainIcon = findNode(mainShell, `${mainShell.id}_icon`);
    const contextualShell = findNode(contextual.root, 'atome_contextual_tool_detail');
    const contextualSurface = findNode(contextualShell, `${contextualShell.id}_background`);
    const contextualIcon = findNode(contextualShell, `${contextualShell.id}_icon`);
    for (const property of ['background', 'radius', 'shadow', 'backdrop']) {
        assert.deepEqual(mainSurface.style[property], contextualSurface.style[property], property);
    }
    assert.equal(mainShell.style.z_index - mainSurface.style.z_index, contextualShell.style.z_index - contextualSurface.style.z_index);
    assert.equal(mainIcon.style.z_index - mainSurface.style.z_index, contextualIcon.style.z_index - contextualSurface.style.z_index);
    assert.deepEqual(mainShell.style.background, BEVY_MENU_TOKENS.clear);
    assert.deepEqual(contextualShell.style.background, BEVY_MENU_TOKENS.clear);
});

test('contextual rail remains below the main menu at their shared boundary', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const main = buildBevyMainMenuTree({
        surface,
        content: {
            toolbox: { children: ['detail'] },
            detail: { atome_tool: true, label: 'detail', icon: 'detail', tool_id: 'tool.detail' }
        },
        state: { activePaletteKey: '', latchedByToolId: new Map(), externalOpenByToolId: new Map() }
    });
    const contextual = buildAtomeContextualEditTree({
        surface, activeAtomeId: 'a', definitions: [{ key: 'detail', label: 'detail', toolType: 'standard' }]
    });
    const mainRecords = projectBevyUiTreeRecords({
        tree: normalizeBevyUiTree({ id: main.id, tree: main }), treeId: main.id, workspaceLayer: main.layer
    });
    const contextualRecords = projectBevyUiTreeRecords({
        tree: normalizeBevyUiTree({ id: contextual.id, tree: contextual }), treeId: contextual.id, workspaceLayer: contextual.layer
    });
    const mainSurface = mainRecords.find((record) => record.id.endsWith('_eve_bevy_ui_main_menu_tool_detail_background'));
    const contextualSurface = contextualRecords.find((record) => record.id.endsWith('_atome_contextual_tool_detail_background'));
    assert.ok(mainSurface);
    assert.ok(contextualSurface);
    assert.ok(
        mainSurface.properties.renderLayer > contextualSurface.properties.renderLayer,
        'the main menu must paint over any contextual shadow at their shared boundary'
    );
});

test('contextual palettes keep the semantic accent on the rail interior in both handedness modes', () => {
    const input = {
        surface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
        activeAtomeId: 'a',
        definitions: [{ key: 'mode', toolType: 'palette', children: [{ key: 'perform', toolType: 'standard' }] }],
        activePaletteKey: 'mode'
    };
    const right = buildAtomeContextualEditTree(input);
    const left = buildAtomeContextualEditTree({ ...input, handedness: 'left' });
    const rightAccent = findNode(right.root, 'atome_contextual_tool_mode_palette_accent');
    const leftAccent = findNode(left.root, 'atome_contextual_tool_mode_palette_accent');
    const verticalPosition = BEVY_MENU_TOKENS.paletteAccent.insetPx;
    assert.deepEqual(rightAccent.style.position, [BEVY_MENU_TOKENS.paletteAccent.insetPx, verticalPosition]);
    assert.deepEqual(leftAccent.style.position, [60 - BEVY_MENU_TOKENS.paletteAccent.insetPx - BEVY_MENU_TOKENS.paletteAccent.thicknessPx, verticalPosition]);
    assert.equal(rightAccent.style.size[1], 60 - BEVY_MENU_TOKENS.paletteAccent.insetPx * 2);
    assert.equal(leftAccent.style.size[1], 60 - BEVY_MENU_TOKENS.paletteAccent.insetPx * 2);
});

test('a contextual palette slot keeps its own icon and label while the child in force reads pressed', () => {
    const tree = buildAtomeContextualEditTree({
        surface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
        activeAtomeId: 'a', activePaletteKey: 'container_play_mode', itemSize: 44, mainMenuHeight: 60,
        definitions: [{
            key: 'container_play_mode', label: 'Play Mode', icon: 'sequence', toolType: 'palette', priority: 10,
            children: [
                { key: 'container_play_random', label: 'Random', icon: 'matrix2', toolType: 'tool', active: true },
                { key: 'container_play_loop', label: 'Loop', icon: 'redo', toolType: 'tool', active: false }
            ]
        }]
    });
    const slot = findNode(tree.root, 'atome_contextual_tool_container_play_mode');
    const slotIcon = findNode(tree.root, 'atome_contextual_tool_container_play_mode_icon');
    const chosen = findNode(tree.root, 'atome_contextual_tool_container_play_mode_container_play_random');
    const other = findNode(tree.root, 'atome_contextual_tool_container_play_mode_container_play_loop');
    assert.equal(slot.accessibility.label, 'Play Mode');
    assert.equal(slotIcon.image.source, './assets/images/icons/sequence.svg');
    assert.deepEqual(chosen.style.translation, [0, 2]);
    assert.equal(other.style.translation, undefined);
});

test('Mystic palette accents are individual rounded top arcs', () => {
    const tree = buildBevyUiMysticTree({
        surface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
        items: [{ key: 'mode', type: 'palette' }, { key: 'view', type: 'palette' }]
    });
    const petals = tree.root.children.filter((node) => node.kind === 'icon_button' && node.mystic);
    const accents = petals.map((petal) => findNode(petal, `${petal.id}_accent`));
    assert.equal(accents.length, 2);
    assert.equal(accents.every(Boolean), true);
    assert.equal(accents.every((accent) => accent.style.radius === BEVY_MENU_TOKENS.shape.mysticRadiusPx), true);
    assert.equal(petals.every((petal) => petal.style.radius === BEVY_MENU_TOKENS.shape.mysticRadiusPx), true);
    assert.equal(petals.every((petal) => petal.style.shadow === null), true);
    assert.equal(accents.every((accent) => accent.style.position[1] === Math.max(BEVY_MENU_TOKENS.paletteAccent.insetPx, 6)), true);
});

test('Atome contextual edition has no per-atome footer or solid editor chrome', () => {
    const tree = buildAtomeContextualEditTree({
        surface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
        records: [{ id: 'media', properties: { left: 40, top: 50, width: 120 } }],
        geometryByAtomeId: new Map([['media', { x: 40, y: 50, width: 310, height: 420 }]]),
        editing: [{ atomeId: 'media', kind: 'image' }], activeAtomeId: 'media',
        definitions: [{ key: 'detail', label: 'detail', toolType: 'standard' }]
    });
    for (const id of [
        'atome_contextual_edit_media_surface',
        'atome_contextual_edit_media_outline',
        'atome_contextual_edit_media_footer_background',
        'atome_contextual_edit_media_footer',
        'atome_contextual_edit_media_close',
        'atome_contextual_edit_media_drag',
        'atome_contextual_edit_media_title'
    ]) {
        assert.equal(findNode(tree.root, id), null, id);
    }
    assert.ok(findNode(tree.root, 'atome_contextual_tool_detail_background'));
});

test('Atome contextual rail projects visible tool records inside the lateral rail', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const rgba = new Uint8Array([255, 255, 255, 255]);
    const runtime = createEveBevyUiRuntime({
        nativeUiEnabled: false,
        imageResolverFactory: () => async () => ({ width: 1, height: 1, rgba }),
        requestFrame: (callback) => { callback(); return 1; }
    });
    const tree = buildAtomeContextualEditTree({
        surface, records: [{ id: 'a', properties: { left: 40, top: 50, width: 200, height: 120 } }],
        editing: [{ atomeId: 'a', kind: 'image' }], activeAtomeId: 'a',
        definitions: [{ key: 'detail', label: 'detail', icon: 'edit', toolType: 'standard' }],
        handlers: {
            atome_contextual_edit_a_drag: { drag: () => null }
        }
    });
    await runtime.mountTree({ id: tree.id, surface, tree });
    const projected = getProjectSceneState('__eve_dashboard_workspace__');
    const tool = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_background'));
    const toolIcon = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_icon_image'));
    const toolLabel = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_label_text'));
    assert.deepEqual([tool.properties.left, tool.properties.top, tool.properties.width, tool.properties.height], [740, 480, 60, 60]);
    assert.ok(toolIcon.properties.renderLayer > tool.properties.renderLayer);
    assert.ok(toolLabel.properties.renderLayer > tool.properties.renderLayer);
    assert.equal(projected.records.some((record) => record.id.includes('atome_contextual_edit_a_footer')), false);
});

test('structured List and Matrix rows carry persistent Play through production rail resolution into the Bevy tree', async () => {
    const records = ['video', 'sound', 'image', 'text', 'shape', 'group'].map((kind, index) => ({
        id: `${kind}_row`, type: kind, project_id: 'structured_project',
        properties: { kind, left: 20 + (index * 10), top: 20, width: 120, height: 70 }
    }));
    const scene = { project_id: 'structured_project', records, scene: { byId: new Map() } };
    const rendered = [];
    const model = createAtomeContextualRailModelRuntime({
        mainToolIdByKey: { detail: 'ui.detail.panel', delete: 'ui.delete.selection', play: 'ui.play' },
        intuitionContent: {
            detail: { tool_id: 'ui.detail.panel', label: 'Detail' },
            delete: { tool_id: 'ui.delete.selection', label: 'Delete' },
            play: { tool_id: 'ui.play', label: 'Play', action: 'toggle', latch: true }
        },
        normalizeMainToolKey: (key) => String(key || '').trim().toLowerCase(),
        normalizeCatalogToolEntry: ({ key, def }) => ({ key, toolId: def.tool_id, label: def.label, toolType: 'standard', actionMode: def.action, latch: def.latch }),
        normalizeRecordActionRecordSource: () => null, resolveCanonicalMainToolId: (id) => id,
        resolveCurrentTextSizeValue: (value) => value, isSelectionRequiredToolKey: () => false,
        getAtomeElement: () => null, getAtomeRuntimeState: () => ({}), translate: (_key, fallback) => fallback
    });
    const observed = [];
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {},
        resolveDefinitions: ({ atomeId, kind, railOnly, record }) => {
            const structuredContext = record?.structured_context === true;
            observed.push({ atomeId, kind, railOnly, structuredContext });
            const keys = model.resolveAtomeContextualRailToolKeysForAtome({
                atomeId, kind, toolKeys: ['detail', 'delete', 'play'],
                hasProjectAutomation: structuredContext === true, railOnly
            });
            return keys.map((key) => model.resolveAtomeContextualRailToolDefinition(key, { structuredContext, record }));
        },
        invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree), updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        findSceneByAtomeId: (id) => records.some((record) => record.id === id) ? scene : null,
        readMainMenuHeight: () => 52
    });
    for (const record of records) {
        runtime.enter({ atomeId: record.id, kind: record.type, railOnly: true, record: { ...record, structured_context: true } });
        await runtime.render();
        assert.equal(runtime.readState().railOnly, true);
        const tree = rendered.at(-1);
        const play = findNode(tree.root, 'atome_contextual_tool_play');
        assert.ok(play, `${record.type} must project Play into the persistent rail`);
        assert.equal(play.kind, 'icon_button');
        assert.equal(findNode(tree.root, 'atome_contextual_edit_' + record.id + '_footer'), null);
        assert.equal(JSON.stringify(play).includes('tooltip'), false);
        assert.equal(JSON.stringify(play).includes('popup'), false);
        if (record.type === 'video') {
            await projectViewPlayback.triggerChild({ record, projectId: record.project_id });
            await runtime.render();
            const stopped = findNode(rendered.at(-1).root, 'atome_contextual_tool_play');
            assert.equal(JSON.stringify(stopped).includes('Stop'), true);
            await projectViewPlayback.stop();
            await runtime.render();
            assert.equal(JSON.stringify(findNode(rendered.at(-1).root, 'atome_contextual_tool_play')).includes('Play'), true);
        }
    }
    assert.equal(observed.every((entry) => entry.railOnly && entry.structuredContext), true);
});

test('Atome contextual runtime keeps edition ephemeral and renders only its tool rail', async () => {
    const records = [{ id: 'a', properties: { left: 40, top: 30, width: 200, height: 100 } }, {
        id: 'b', properties: { left: 300, top: 40, width: 120, height: 80 }
    }];
    const scene = { project_id: 'project', records, text: null };
    const rendered = [];
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        emitSceneIntent: async () => ({ ok: true }),
        findSceneByAtomeId: (id) => records.some((record) => record.id === id) ? scene : null,
        readSceneState: () => scene, hitTestScene: () => null, readMainMenuHeight: () => 52,
        updateSceneRecord: async ({ atomeId, properties }) => Object.assign(records.find((record) => record.id === atomeId).properties, properties)
    });
    runtime.enter({ atomeId: 'a', kind: 'image', contextLevel: 'edition' });
    runtime.enter({ atomeId: 'b', kind: 'image' });
    runtime.exit({ atomeId: 'b' });
    assert.deepEqual(runtime.readState().editingAtomeIds, ['a']);
    assert.equal(runtime.readState().menuVisible, false);
    runtime.activate({ atomeId: 'a' });
    await runtime.render();
    assert.equal(runtime.readState().editMode, 'spatial_crop');
    assert.ok(findNode(rendered.at(-1).root, 'eve_bevy_panel_atome_contextual_edit_rail'));
    assert.equal(findNode(rendered.at(-1).root, 'atome_contextual_edit_a_footer'), null);
    assert.equal(findNode(rendered.at(-1).root, 'atome_contextual_edit_a_drag'), null);
});

test('Atome contextual runtime reuses its handed rail for virtual Molecule selections without editor chrome', async () => {
    const rendered = [];
    const invocations = [];
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        findSceneByAtomeId: () => null, readMainMenuHeight: () => 52
    });
    const entered = runtime.enterVirtual({
        atomeId: 'molecule-track:one', kind: 'molecule_track', projectId: 'project',
        record: { id: 'molecule-track:one', properties: { name: 'Piste 1' } },
        definitions: [{ key: 'molecule_info', label: 'Info', icon: 'info', toolType: 'tool' }],
        invokeDefinition: async (definition) => { invocations.push(definition.key); return { ok: true }; }
    });
    assert.equal(entered.rail_only, true);
    await runtime.render();
    const root = rendered.at(-1).root;
    assert.ok(findNode(root, 'atome_contextual_tool_molecule_info'));
    assert.equal(findNode(root, 'atome_contextual_edit_molecule-track_one_footer'), null);
    findNode(root, 'atome_contextual_tool_molecule_info').on.activate();
    await Promise.resolve();
    assert.deepEqual(invocations, ['molecule_info']);
    assert.equal(runtime.readState().menuVisible, true);
});

test('Natural Molecule editing keeps the rail without restoring legacy frame chrome', async () => {
    const rendered = [];
    const invocations = [];
    const ownerRecord = {
        id: 'natural_molecule', project_id: 'project', type: 'group',
        properties: { molecule_entity: 'molecule', left: 20, top: 30, width: 180, height: 90 }
    };
    const ownerAtom = { id: ownerRecord.id, parentId: '', bounds: { x: 20, y: 30, width: 180, height: 90 } };
    const memberAtom = { id: 'natural_member', parentId: ownerRecord.id, bounds: { x: 30, y: 40, width: 40, height: 30 } };
    const scene = {
        project_id: 'project', records: [ownerRecord],
        scene: { byId: new Map([[ownerAtom.id, ownerAtom], [memberAtom.id, memberAtom]]) }
    };
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        findSceneByAtomeId: (id) => id === ownerRecord.id ? scene : null,
        readMainMenuHeight: () => 52
    });
    runtime.enter({
        atomeId: ownerRecord.id, kind: 'group', projectId: 'project', record: ownerRecord,
        definitions: [{ key: 'molecule_info', label: 'Info', icon: 'info', toolType: 'tool' }],
        invokeDefinition: async (definition) => { invocations.push(definition.key); return { ok: true }; }
    });
    await runtime.render();

    const tree = rendered.at(-1).root;
    assert.equal(runtime.readState().railOnly, false);
    assert.equal(findNode(tree, 'atome_contextual_edit_natural_molecule_outline'), null);
    assert.equal(findNode(tree, 'atome_contextual_edit_natural_molecule_footer'), null);
    findNode(tree, 'atome_contextual_tool_molecule_info').on.activate();
    await Promise.resolve();
    assert.deepEqual(invocations, ['molecule_info']);
    assert.equal(resolveComposedInteractionTarget(scene.scene, memberAtom, runtime.readState().activeAtomeId)?.id, memberAtom.id);

    runtime.exit({ atomeId: ownerRecord.id });
    assert.equal(runtime.readState().activeAtomeId, '');
    assert.equal(resolveComposedInteractionTarget(scene.scene, memberAtom, runtime.readState().activeAtomeId)?.id, ownerAtom.id);
});

test('Natural Molecule keeps inside background presses and exits only beyond its frame', () => {
    const owner = { id: 'molecule', parentId: '' };
    const member = { id: 'member', parentId: owner.id };
    const outside = { id: 'outside', parentId: '' };
    const project = { project_id: 'outside_exit', scene: { byId: new Map([
        [owner.id, owner], [member.id, member], [outside.id, outside]
    ]) } };
    const state = {
        suspended: false, activeAtomeId: owner.id,
        editingByAtomeId: new Map([[owner.id, {
            atomeId: owner.id, kind: 'group', contextLevel: 'edition', projectId: project.project_id
        }]])
    };
    let target = member;
    const exits = [];
    const intercept = createAtomeContextualSurfaceInterceptor({
        state, editingEntries: () => Array.from(state.editingByAtomeId.values()),
        activeProjectState: () => project, hitTestScene: () => target, readSceneState: () => project,
        projectedGeometryFor: () => ({ x: 10, y: 10, width: 100, height: 80 }),
        readRenderedGeometry: () => new Map(), surfaceResolver: () => ({
            getBoundingClientRect: () => ({ left: 5, top: 5 })
        }), scheduleRender: () => {},
        activate: () => ({ ok: true }),
        exit: ({ atomeId }) => { exits.push(atomeId); state.editingByAtomeId.delete(atomeId); }
    });
    target = outside;
    assert.equal(intercept({
        phase: 'pointerdown', target: member, event: { clientX: 20, clientY: 20 }
    }), false, 'the surface-resolved member must win over a conflicting secondary hit test');
    assert.deepEqual(exits, []);
    assert.equal(intercept({ phase: 'pointerdown', event: { clientX: 50, clientY: 50 } }), true);
    assert.deepEqual(exits, []);
    target = null;
    assert.equal(intercept({ phase: 'pointerdown', event: { clientX: 300, clientY: 200 } }), false);
    assert.deepEqual(exits, [owner.id]);
});

test('clicking another atome or project background exits edition without consuming the click', () => {
    const edited = { id: 'edited', parentId: '', bounds: { x: 20, y: 20, width: 100, height: 80 } };
    const other = { id: 'other', parentId: '', bounds: { x: 180, y: 20, width: 100, height: 80 } };
    const project = { project_id: 'outside_exit', scene: { byId: new Map([
        [edited.id, edited], [other.id, other]
    ]) } };
    const makeState = () => ({
        suspended: false, activeAtomeId: edited.id,
        editingByAtomeId: new Map([[edited.id, {
            atomeId: edited.id, kind: 'image', contextLevel: 'edition', projectId: project.project_id
        }]])
    });
    for (const target of [other, null]) {
        const state = makeState();
        const exits = [];
        const intercept = createAtomeContextualSurfaceInterceptor({
            state,
            editingEntries: () => Array.from(state.editingByAtomeId.values()),
            activeProjectState: () => project,
            hitTestScene: () => target,
            readSceneState: () => project,
            projectedGeometryFor: () => edited.bounds,
            readRenderedGeometry: () => new Map(),
            surfaceResolver: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
            scheduleRender: () => {}, activate: () => {},
            exit: ({ atomeId }) => { exits.push(atomeId); state.editingByAtomeId.delete(atomeId); }
        });
        const consumed = intercept({
            phase: 'pointerdown', target,
            event: { clientX: target ? 190 : 500, clientY: target ? 30 : 400 }
        });
        assert.equal(consumed, false);
        assert.deepEqual(exits, [edited.id]);
    }
});

test('selecting a Molecule member keeps the Molecule as contextual edition owner', () => {
    const dom = new JSDOM('');
    const oldWindow = globalThis.window;
    globalThis.window = dom.window;
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'member_selection' };
    dom.window.requestAnimationFrame = () => 1;
    const ownerRecord = { id: 'selection_owner', project_id: 'member_selection', type: 'group' };
    const memberRecord = { id: 'selection_member', project_id: 'member_selection', type: 'shape' };
    const owner = { id: ownerRecord.id, parentId: '' };
    const member = { id: memberRecord.id, parentId: owner.id };
    const project = {
        project_id: 'member_selection', records: [ownerRecord, memberRecord],
        scene: { byId: new Map([[owner.id, owner], [member.id, member]]) }
    };
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => null, findSceneByAtomeId: () => project, readSceneState: () => project
    });
    try {
        runtime.install();
        runtime.enter({ atomeId: owner.id, kind: 'group', contextLevel: 'edition' });
        dom.window.dispatchEvent(new dom.window.CustomEvent('adole-atome-selected', {
            detail: { selected: [member.id], atomeId: member.id }
        }));
        assert.equal(runtime.readState().activeAtomeId, owner.id);
        assert.equal(runtime.isEditing(owner.id), true);
        assert.equal(runtime.hasContext(member.id), false);
    } finally {
        dom.window.close();
        globalThis.window = oldWindow;
    }
});

test('selection cannot replace an edited nested media with its Molecule owner', () => {
    const dom = new JSDOM('');
    const oldWindow = globalThis.window;
    globalThis.window = dom.window;
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'nested_media_selection' };
    dom.window.requestAnimationFrame = () => 1;
    const ownerRecord = { id: 'nested_media_owner', project_id: 'nested_media_selection', type: 'group' };
    const mediaRecord = { id: 'nested_media_video', project_id: 'nested_media_selection', type: 'video' };
    const owner = { id: ownerRecord.id, parentId: '' };
    const media = { id: mediaRecord.id, parentId: owner.id };
    const project = {
        project_id: 'nested_media_selection', records: [ownerRecord, mediaRecord],
        scene: { byId: new Map([[owner.id, owner], [media.id, media]]) }
    };
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => null, findSceneByAtomeId: () => project, readSceneState: () => project
    });
    try {
        runtime.install();
        runtime.enter({ atomeId: owner.id, kind: 'group', contextLevel: 'edition' });
        runtime.enter({ atomeId: media.id, kind: 'video', contextLevel: 'edition' });
        dom.window.dispatchEvent(new dom.window.CustomEvent('adole-atome-selected', {
            detail: { selected: [media.id], atomeId: media.id }
        }));
        assert.equal(runtime.readState().activeAtomeId, media.id);
        assert.equal(runtime.readState().editMode, 'spatial_crop');
        assert.equal(runtime.isEditing(owner.id), true);
        assert.equal(runtime.isEditing(media.id), true);
    } finally {
        dom.window.close();
        globalThis.window = oldWindow;
    }
});

test('Natural Molecule entry resets the rail and Escape leaves child cancellation first', () => {
    const dom = new JSDOM('');
    const oldWindow = globalThis.window;
    globalThis.window = dom.window;
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'escape_project' };
    dom.window.requestAnimationFrame = () => 1;
    const record = { id: 'escape_molecule', project_id: 'escape_project', type: 'group' };
    const project = { project_id: 'escape_project', records: [record], scene: { byId: new Map() } };
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => null, findSceneByAtomeId: (id) => id === record.id ? project : null,
        readSceneState: () => project
    });
    try {
        runtime.install();
        runtime.state.railScrollOffset = 180;
        runtime.enter({ atomeId: record.id, kind: 'group', contextLevel: 'edition' });
        assert.equal(runtime.state.railScrollOffset, 0);
        const childEscape = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        childEscape.preventDefault();
        dom.window.dispatchEvent(childEscape);
        assert.equal(runtime.isEditing(record.id), true);
        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        assert.equal(runtime.isEditing(record.id), false);
    } finally {
        dom.window.close();
        globalThis.window = oldWindow;
    }
});

test('Structured row context accepts its canonical record when Natural has no projected scene', async () => {
    const rendered = [];
    const invocations = [];
    const record = { id: 'audio_row', project_id: 'project', type: 'audio', properties: { kind: 'audio' } };
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        findSceneByAtomeId: () => null, readMainMenuHeight: () => 52
    });
    const entered = runtime.enter({
        atomeId: record.id, projectId: record.project_id, kind: 'audio', railOnly: true, record,
        extraDefinitions: [{ key: 'split', label: 'Split', icon: 'split', toolType: 'tool', occurrenceAction: 'split' }],
        extraInvoker: async (definition) => { invocations.push(definition.key); return { ok: true }; }
    });
    assert.equal(entered.ok, true);
    await runtime.render();
    const split = findNode(rendered.at(-1).root, 'atome_contextual_tool_split');
    assert.ok(split);
    split.on.activate();
    await Promise.resolve();
    assert.deepEqual(invocations, ['split']);
});

test('Structured member context promotes in place to canvas tools when Natural view returns', async () => {
    const rendered = [];
    const record = { id: 'video_member', type: 'video', properties: { kind: 'video', left: 20, top: 20, width: 160, height: 90 } };
    const scene = { project_id: 'project', records: [record], scene: { byId: new Map() } };
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {},
        resolveDefinitions: () => [{ key: 'z_order', label: 'Plan', icon: 'modules', toolType: 'tool' }],
        invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        findSceneByAtomeId: (id) => id === record.id ? scene : null,
        readMainMenuHeight: () => 52
    });
    runtime.enterVirtual({
        atomeId: record.id, kind: 'video', projectId: 'project', record,
        definitions: [{ key: 'structured_info', label: 'Info', icon: 'info', toolType: 'tool' }],
        invokeDefinition: async () => ({ ok: true })
    });
    await runtime.render();
    assert.ok(findNode(rendered.at(-1).root, 'atome_contextual_tool_structured_info'));
    assert.deepEqual(runtime.promoteActiveToCanvas(), { ok: true, atome_id: record.id, rail_only: true });
    assert.equal(runtime.readState().contextLevel, 'selection');
    assert.deepEqual(runtime.readState().editingAtomeIds, []);
    await runtime.render();
    assert.ok(findNode(rendered.at(-1).root, 'atome_contextual_tool_z_order'));
    assert.equal(findNode(rendered.at(-1).root, 'atome_contextual_tool_structured_info'), null);
    assert.equal(runtime.readState().activeAtomeId, record.id);
});

test('Atome contextual Size slider pins on click and closes only after a transient direct drag', async () => {
    const records = [{ id: 'text_a', properties: { kind: 'text', text: 'Styled', left: 20, top: 20, width: 160, height: 60 } }];
    const scene = { project_id: 'project', records, text: null };
    const rendered = [];
    const invocations = [];
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {},
        resolveDefinitions: () => [{
            key: 'size', label: 'Size', icon: 'volume', toolType: 'slider',
            sliderMin: 8, sliderMax: 108, sliderStep: 1, sliderValue: 48, sliderUnit: 'px'
        }],
        invokeDefinition: async (_, options) => { invocations.push(options); return { ok: true }; },
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        findSceneByAtomeId: (id) => id === 'text_a' ? scene : null,
        readSceneState: () => scene, hitTestScene: () => null, readMainMenuHeight: () => 52
    });
    runtime.enter({ atomeId: 'text_a', kind: 'text' });
    await runtime.render();
    let slider = findNode(rendered.at(-1).root, 'atome_contextual_tool_size');
    slider.on.press({ y: 26 });
    slider.on.release();
    await runtime.render();
    slider = findNode(rendered.at(-1).root, 'atome_contextual_tool_size');
    assert.equal(slider.style.size[1], 156);
    assert.equal(invocations.length, 0);

    slider.on.press({ y: 30 });
    slider.on.drag({ delta_y: -16 });
    slider.on.release();
    await runtime.render();
    slider = findNode(rendered.at(-1).root, 'atome_contextual_tool_size');
    assert.equal(slider.style.size[1], 156);
    assert.deepEqual(invocations.map((entry) => entry.payload.phase), ['start', 'frame', 'end']);

    slider.on.press({ y: 140 });
    slider.on.release();
    await runtime.render();
    slider = findNode(rendered.at(-1).root, 'atome_contextual_tool_size');
    assert.equal(slider.style.size[1], 52);

    invocations.length = 0;
    slider.on.press({ y: 26 });
    slider.on.drag({ delta_y: -16 });
    slider.on.release();
    await runtime.render();
    slider = findNode(rendered.at(-1).root, 'atome_contextual_tool_size');
    assert.equal(slider.style.size[1], 52);
    assert.deepEqual(invocations.map((entry) => entry.payload.phase), ['start', 'frame', 'end']);
});

test('Dashboard mode clears contextual edit chrome and project return keeps it closed', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const { window } = dom;
    let renderFrameCallback = null;
    window.requestAnimationFrame = (callback) => {
        renderFrameCallback = callback;
        return 1;
    };
    globalThis.window = window;
    globalThis.document = window.document;
    const records = [{ id: 'a', properties: { left: 20, top: 30, width: 100, height: 80 } }];
    const scene = { project_id: 'project_a', records, text: null };
    let mounts = 0;
    let updates = 0;
    let unmounts = 0;
    try {
        window.__eveWorkspaceMode = { mode: 'project', projectId: 'project_a', transitioning: false, targetMode: '' };
        const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
            legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
            surfaceResolver: () => window.document.getElementById('eve_surface_project'),
            bevyRuntimeResolver: () => ({
                mountTree: async () => { mounts += 1; }, updateTree: async () => { updates += 1; },
                unmountTree: async () => { unmounts += 1; }
            }),
            findSceneByAtomeId: (id) => id === 'a' ? scene : null,
            readSceneState: () => scene, hitTestScene: () => null, readMainMenuHeight: () => 52
        });
        runtime.install();
        runtime.enter({ atomeId: 'a', kind: 'image' });
        await runtime.render();
        assert.equal(mounts, 1);

        markDashboardWorkspaceMode();
        await runtime.render();
        assert.equal(runtime.readState().suspended, true);
        assert.equal(runtime.readState().menuVisible, false);
        assert.deepEqual(runtime.readState().editingAtomeIds, []);
        assert.equal(unmounts, 1);

        markProjectWorkspaceMode('project_a');
        await runtime.render();
        assert.equal(runtime.readState().suspended, false);
        assert.deepEqual(runtime.readState().editingAtomeIds, []);
        assert.equal(mounts, 1);
        runtime.enter({ atomeId: 'a', kind: 'image' });
        await runtime.render();
        assert.equal(mounts, 2);

        renderFrameCallback = null;
        const hiddenEditor = window.document.createElement('textarea');
        hiddenEditor.setAttribute('data-role', 'active-text-editor');
        window.document.body.appendChild(hiddenEditor);
        const updatesBeforeTextInput = updates;
        hiddenEditor.dispatchEvent(new window.Event('input', { bubbles: true }));
        assert.equal(typeof renderFrameCallback, 'function');
        await renderFrameCallback();
        assert.equal(updates, updatesBeforeTextInput + 1);

        markDashboardWorkspaceMode();
        markProjectWorkspaceMode('project_b');
        await runtime.render();
        assert.deepEqual(runtime.readState().editingAtomeIds, []);
        assert.equal(runtime.readState().menuVisible, false);
    } finally {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        dom.window.close();
    }
});

test('canonical vertical slider is relative for touch and collapses on mouse cancel or stylus capture loss', async () => {
    const dom = new JSDOM('<!doctype html><button id="slider"></button>');
    const { window } = dom;
    Object.assign(globalThis, {
        window, document: window.document, Node: window.Node, Element: window.Element,
        HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
        CustomEvent: window.CustomEvent, Event: window.Event, MouseEvent: window.MouseEvent,
        getComputedStyle: window.getComputedStyle.bind(window)
    });
    class PointerEventShim extends window.MouseEvent {
        constructor(type, init = {}) {
            super(type, init);
            Object.defineProperties(this, {
                pointerId: { value: Number(init.pointerId || 1) },
                pointerType: { value: String(init.pointerType || 'touch') },
                button: { value: Number(init.button || 0) }
            });
        }
    }
    window.PointerEvent = PointerEventShim;
    globalThis.PointerEvent = PointerEventShim;
    const { mountIntuitionXSliderToolContent } = await import('../../atome/src/squirrel/components/tool_slider_builder.js');
    const button = document.getElementById('slider');
    mountIntuitionXSliderToolContent({
        button, orientation: 'vertical', collapsedWidthPx: 40, expandedWidthPx: 120,
        definition: { label: 'Size', sliderMin: 0, sliderMax: 100, sliderStep: 1, sliderValue: 50 }
    });
    const hitzone = button.querySelector('[data-role="eve_intuitionx-slider-hitzone"]');
    const input = button.querySelector('[data-role="eve_intuitionx-slider-input"]');
    const rect = { left: 0, top: 0, right: 18, bottom: 120, width: 18, height: 120 };
    hitzone.getBoundingClientRect = () => rect;
    input.getBoundingClientRect = () => rect;
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 7, clientY: 80 }));
    window.dispatchEvent(new PointerEventShim('pointermove', { bubbles: true, pointerId: 7, clientY: 56 }));
    assert.equal(button.style.height, '120px');
    assert.equal(input.value, '70');
    window.dispatchEvent(new PointerEventShim('pointerup', { bubbles: true, pointerId: 7, clientY: 56 }));
    assert.equal(button.style.height, '40px');
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 8, pointerType: 'mouse', clientY: 70 }));
    window.dispatchEvent(new PointerEventShim('pointercancel', { bubbles: true, pointerId: 8, pointerType: 'mouse', clientY: 70 }));
    assert.equal(button.dataset.sliderExpanded, 'false');
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 9, pointerType: 'pen', clientY: 70 }));
    input.dispatchEvent(new PointerEventShim('lostpointercapture', { bubbles: true, pointerId: 9, pointerType: 'pen', clientY: 70 }));
    assert.equal(button.dataset.sliderExpanded, 'false');
});

test('depth palette survives structured target selection and closes on explicit rail clear', async () => {
    const previousWindow=globalThis.window, previousDocument=globalThis.document;
    const dom=new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    globalThis.window=dom.window;globalThis.document=dom.window.document;
    dom.window.__eveWorkspaceMode={mode:'project',projectId:'p'};
    dom.window.requestAnimationFrame=()=>1;
    let tree;
    const runtime=createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState:{},resolveDefinitions:()=>[],invokeDefinition:async()=>({ok:true}),
        surfaceResolver:()=>dom.window.document.getElementById('eve_surface_project'),
        bevyRuntimeResolver:()=>({mountTree:async payload=>{tree=payload.tree;},updateTree:async payload=>{tree=payload.tree;},unmountTree:async()=>{}}),
        findSceneByAtomeId:()=>null,readSceneState:()=>null,hitTestScene:()=>null,readMainMenuHeight:()=>52
    });
    const enter=(id,projectId='p')=>runtime.enterVirtual({atomeId:id,kind:'image',projectId,record:{id,properties:{}},
        definitions:[{key:'z_order',toolType:'palette',label:'Depth',children:[{key:'front',label:'Front'}]}],invokeDefinition:async()=>({ok:true})});
    try {
        enter('a');await runtime.render();
        findNode(tree.root,'atome_contextual_tool_z_order').on.activate();
        assert.equal(runtime.readState().activePaletteKey,'z_order');
        enter('b');await runtime.render();
        assert.equal(runtime.readState().activePaletteKey,'z_order');
        runtime.clear();assert.equal(runtime.readState().activePaletteKey,'');
        enter('c');await runtime.render();
        findNode(tree.root,'atome_contextual_tool_z_order').on.activate();
        enter('d','other');assert.equal(runtime.readState().activePaletteKey,'');
    } finally {runtime.clear();globalThis.window=previousWindow;globalThis.document=previousDocument;dom.window.close();}
});
