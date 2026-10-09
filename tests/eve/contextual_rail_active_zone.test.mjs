import { eveT } from '../../eVe/i18n/i18n.js';
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { buildAtomeContextualEditTree } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_model.js';
import { createAtomeContextualEditRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js';
import { createAtomeContextualEditHandlers } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_handlers.js';
import { normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { createBevyUiScrollRuntime } from '../../eVe/domains/rendering/bevy_ui_scroll_runtime.js';
import { hitTestBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_hit_test_runtime.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { createRuntimeHarness, waitFrame } from './bevy_ui_main_menu_test_helpers.mjs';
import {
    ACTIVE_TOOL_SURFACE,
    isActiveRailToolKey,
    isActiveToolId,
    readActiveRailToolEntries,
    readActiveToolEntries,
    stopActiveToolEntries
} from '../../eVe/intuition/tools/core/active_tool_registry.js';
import { BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE } from '../../eVe/intuition/tools/core/tool_runtime_state.js';
import { buildArmedToolRailDefinitions, invokeArmedToolOption } from '../../eVe/intuition/runtime/eve_intuition/armed_tool_rail_runtime.js';
import { createMainMenuCreateContent } from '../../eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js';
import { createAtomeContextualRailModelRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_model_runtime.js';
import { createAtomeContextualRailDefinitionInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_definition_invocation_runtime.js';
import { TOOL_HANDLER_REGISTRY } from '../../eVe/intuition/runtime/tool_state.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import {
    registerSelectedProjectMediaPlayback,
    stopSelectedProjectMediaPlayback
} from '../../eVe/domains/media/selected_project_media_playback_state.js';

const TREE_ID = 'eve_bevy_panel_atome_contextual_edit';
const RAIL_ID = `${TREE_ID}_rail`;
const ITEM_SIZE = 52;

const findNode = (node, id) => {
    if (node?.id === id) return node;
    for (const child of node?.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};
const collectIds = (node, ids = []) => {
    ids.push(node?.id);
    (node?.children || []).forEach((child) => collectIds(child, ids));
    return ids;
};
// The tools whose halo the tree paints (`lit` in bevy_ui_menu_surface.js).
const glowingIds = (tree) => collectIds(tree.root).filter((id) => String(id).endsWith('_glow')
    && !String(id).endsWith('_icon_glow')).map((id) => id.slice(0, -'_glow'.length)).sort();
const railOf = (tree) => tree.root.children.find((node) => node.id === RAIL_ID);
const levelIds = (tree) => new Set(collectIds(railOf(tree)?.children?.[0]));
const pinnedIds = (tree) => tree.root.children
    .map((node) => node.id)
    .filter((id) => id.startsWith('atome_contextual_tool_') && !levelIds(tree).has(id));
const buildRail = ({
    height = 400, count = 6, activeSlots = [], handedness = 'right', itemSize = ITEM_SIZE, mainMenuHeight = ITEM_SIZE
} = {}) => buildAtomeContextualEditTree({
    surface: { getBoundingClientRect: () => ({ width: 400, height }) },
    activeAtomeId: 'shape', itemSize, mainMenuHeight, handedness,
    definitions: Array.from({ length: count }, (_, index) => ({ key: `tool_${index}`, label: `tool_${index}` })),
    activeSlots
});
const readMenuAccess = async (context) => ({ ...context,
    records: [{ id: context.atomeId, capabilities: { write: true, delete: true } }],
    projectRecord: { capabilities: { create: true } }
});

test('the pinned zone is glued above the Atome handle and pushes the ordinary level up', () => {
    const baseline = buildRail();
    const bottom = baseline.layout.bottom;
    assert.equal(bottom, 400 - ITEM_SIZE - baseline.layout.gap, 'the rail leaves the common seam above the Atome handle');
    assert.equal(railOf(baseline).style.size[1], baseline.layout.railHeight);

    const tree = buildRail({
        activeSlots: [{ key: 'tool_2', label: 'Stop', icon: 'stop', toolType: 'tool' }]
    });
    const pinned = findNode(tree.root, 'atome_contextual_tool_tool_2');
    assert.ok(pinned, 'a lit rail tool keeps its stable node id in the pinned zone');
    assert.deepEqual(pinned.style.position, [tree.layout.x, bottom - ITEM_SIZE]);
    assert.equal(pinned.style.position[1] + ITEM_SIZE, bottom, 'the last case is glued to the rail bottom');
    assert.equal(JSON.stringify(pinned).includes('Stop'), true, 'the pinned case carries the lit presentation');
    assert.equal(railOf(tree).style.position[1], railOf(baseline).style.position[1]);
    assert.equal(railOf(tree).style.size[1] + ITEM_SIZE, railOf(baseline).style.size[1]);
    const level = collectIds(railOf(tree).children[0]);
    assert.equal(level.filter((id) => id === 'atome_contextual_tool_tool_2').length, 0);
    assert.equal(collectIds(tree.root).filter((id) => id === 'atome_contextual_tool_tool_2').length, 1);
    assert.equal(railOf(tree).children[0].style.size[1], (6 - 1) * ITEM_SIZE);
    assert.equal(tree.layout.bottom, bottom, 'the pinned zone never covers the menu band');
});

test('the first tool activated is the closest to Atome, the next ones stack above it', () => {
    for (const handedness of ['left', 'right']) {
        const tree = buildRail({
            handedness,
            activeSlots: [
                { key: 'tool_0', label: 'Stop', icon: 'stop' },
                { key: 'tool_3', label: 'Stop recording', icon: 'stop' }
            ]
        });
        assert.equal(tree.layout.x, handedness === 'left' ? tree.layout.gap : 400 - ITEM_SIZE - tree.layout.gap);
        const first = findNode(tree.root, 'atome_contextual_tool_tool_0');
        const second = findNode(tree.root, 'atome_contextual_tool_tool_3');
        assert.deepEqual(first.style.position, [tree.layout.x, tree.layout.bottom - tree.layout.itemSize]);
        assert.deepEqual(second.style.position, [tree.layout.x, tree.layout.bottom - (2 * tree.layout.itemSize) - tree.layout.gap]);
        assert.ok(first.style.position[1] > second.style.position[1]);
        assert.equal(railOf(tree).style.size[1] + (2 * ITEM_SIZE), buildRail().layout.railHeight);
    }
});

test('a pinned tool keeps the options it declares anchored to its own case', () => {
    const definitions = [
        { key: 'tool_0', label: 'tool_0' },
        { key: 'container_play', label: 'Pause', icon: 'pause', active: true,
            longPressChildren: [{ key: 'container_play_stop', label: 'Stop', icon: 'stop' }] }
    ];
    const build = (activePaletteKey) => buildAtomeContextualEditTree({
        surface: { getBoundingClientRect: () => ({ width: 400, height: 400 }) },
        activeAtomeId: 'shape', itemSize: ITEM_SIZE, mainMenuHeight: ITEM_SIZE, definitions, activePaletteKey,
        activeSlots: [{ key: 'container_play', label: 'Pause', icon: 'pause' }]
    });
    const closed = build('');
    assert.equal(findNode(closed.root, 'atome_contextual_tool_container_play_container_play_stop'), null);
    assert.equal(findNode(closed.root, 'atome_contextual_tool_container_play_palette_accent'), null);
    const open = build('container_play');
    const pinned = findNode(open.root, 'atome_contextual_tool_container_play');
    const option = findNode(open.root, 'atome_contextual_tool_container_play_container_play_stop');
    assert.ok(option, 'the pinned case still opens the options it declares');
    assert.equal(option.style.position[1], pinned.style.position[1], 'the options sit on the pinned case row');
    assert.equal(option.style.position[0], pinned.style.position[0] - ITEM_SIZE);
    assert.ok(option.style.position[1] > open.layout.y, 'the options never fall back to the top of the rail');
    assert.ok(findNode(open.root, 'atome_contextual_tool_container_play_palette_accent'),
        'the open pinned case carries the shared palette accent');
});

test('the pinned zone never scrolls while the ordinary level keeps scrolling', () => {
    const scroll = createBevyUiScrollRuntime({ refreshTree: () => {}, emitTargetEvent: () => {} });
    const tree = buildRail({ height: 260, activeSlots: [{ key: 'tool_0', label: 'Stop', icon: 'stop' }] });
    const applied = scroll.applyTree({ tree, treeId: tree.id });
    const rail = railOf(applied);
    assert.equal(rail.style.size[1], 208 - ITEM_SIZE, 'the viewport is shortened by the reserved zone');
    const pinnedPoint = { x: 375, y: 180 };
    const levelPoint = { x: 375, y: 25 };
    const pinnedHit = () => hitTestBevyUiNode(applied.root, pinnedPoint);
    assert.equal(pinnedHit().node.id, 'atome_contextual_tool_tool_0');
    assert.equal(hitTestBevyUiNode(applied.root, levelPoint).node.id, 'atome_contextual_tool_tool_1');
    assert.equal(scroll.wheel({ treeId: tree.id, ...hitTestBevyUiNode(applied.root, levelPoint) }, { deltaY: 104 }), true);
    const scrolled = scroll.applyTree({ tree, treeId: tree.id });
    assert.equal(hitTestBevyUiNode(scrolled.root, levelPoint).node.id, 'atome_contextual_tool_tool_3');
    assert.equal(hitTestBevyUiNode(scrolled.root, pinnedPoint).node.id, 'atome_contextual_tool_tool_0');
    assert.deepEqual(findNode(scrolled.root, 'atome_contextual_tool_tool_0').style.position,
        findNode(applied.root, 'atome_contextual_tool_tool_0').style.position);
    scroll.clearTree(tree.id);
});

test('the pinned case is the same slot: same id, same handler, same active paint', () => {
    const stop = () => 'stop';
    const handlers = { atome_contextual_tool_tool_2: { activate: stop } };
    const paintOf = ({ activeSlots = [], active = false } = {}) => buildAtomeContextualEditTree({
        surface: { getBoundingClientRect: () => ({ width: 400, height: 400 }) },
        activeAtomeId: 'shape', itemSize: ITEM_SIZE, mainMenuHeight: ITEM_SIZE, handlers,
        definitions: [{ key: 'tool_1' }, { key: 'tool_2', active }],
        activeSlots
    });
    const pinned = findNode(paintOf({ activeSlots: [{ key: 'tool_2', label: 'Stop', icon: 'stop' }] }).root,
        'atome_contextual_tool_tool_2');
    const litLevelPaint = findNode(paintOf({ active: true }).root, 'atome_contextual_tool_tool_2').style.background;
    const neutralPaint = findNode(paintOf().root, 'atome_contextual_tool_tool_1').style.background;
    assert.equal(pinned.on.activate, stop, 'the pinned case stays actionable through the same handler');
    assert.equal(pinned.kind, 'icon_button');
    assert.deepEqual(pinned.style.background, litLevelPaint, 'the pinned case keeps the active paint of its slot');
    assert.notDeepEqual(litLevelPaint, neutralPaint);
});

test('a lit rail tool is pinned on every rail that publishes one, and a ribbon tool never is', () => {
    ['play', 'record_action', 'container_play', 'container_record', 'natural_actions_play',
        'news_play', 'news_record_audio', 'news_record_video'].forEach((key) => {
        assert.equal(isActiveRailToolKey(key), true, `${key} keeps its rail residence`);
    });
    ['news_text', 'news_draw', 'view', 'mode', 'activity'].forEach((key) => {
        assert.equal(isActiveRailToolKey(key), false, `${key} is not a rail-resident lit tool`);
    });
    assert.equal(isActiveToolId('ui.text.create'), true);
    assert.equal(isActiveToolId('tool.main.draw'), true);
    assert.equal(isActiveToolId('ui.font.panel'), false);
});

test('a ribbon-resident lit tool takes no rail case', () => {
    const rail = buildRail({ activeSlots: [] });
    assert.deepEqual(pinnedIds(rail), []);
    assert.deepEqual(glowingIds(rail), [], 'nothing engaged, nothing glows');
});

test('an engaged ribbon tool glows in its slot, a palette showing a value never does', async () => {
    const content = {
        toolbox: { children: ['create', 'contact', 'view'] },
        create: { atome_tool: true, label: 'Creer', icon: 'create', type: 'palette', children: ['text'] },
        text: { atome_tool: true, label: 'Texte', icon: 'edit', tool_id: 'ui.text.create', action: 'toggle' },
        contact: { atome_tool: true, label: 'Contacts', icon: 'contact', tool_id: 'ui.contact.panel', action: 'toggle' },
        // View only shows its current mode: its choices are momentary.
        view: { atome_tool: true, label: 'Vue', icon: 'view', type: 'palette', children: ['view_list'] },
        view_list: { atome_tool: true, label: 'Liste', icon: 'list', tool_id: 'ui.view.mode.list', action: 'momentary' }
    };
    const harness = createRuntimeHarness({ content });
    const lastTree = () => harness.calls.filter((call) => call.payload?.tree).at(-1).payload.tree;
    try {
        await harness.runtime.showFully();
        assert.deepEqual(glowingIds(lastTree()), [], 'nothing engaged: no halo');
        harness.runtime.setToolLatchedState({ tool_id: 'ui.text.create', latched: true });
        harness.runtime.setToolLatchedState({ tool_id: 'ui.contact.panel', latched: true });
        await waitFrame();
        assert.deepEqual(glowingIds(lastTree()), ['eve_bevy_ui_main_menu_tool_contact', 'eve_bevy_ui_main_menu_tool_create'],
            'the slot standing for the locked Text and the open Contacts panel glow; View does not');
        const create = findNode(lastTree().root, 'eve_bevy_ui_main_menu_tool_create');
        assert.ok(findNode(create, 'eve_bevy_ui_main_menu_tool_create_icon_glow'), 'the icon carries its own halo');
        harness.runtime.setToolLatchedState({ tool_id: 'ui.text.create', latched: false });
        await waitFrame();
        const fading = findNode(lastTree().root, 'eve_bevy_ui_main_menu_tool_create_glow');
        assert.ok(fading && fading.style.opacity < 1, 'a stopped tool keeps its halo only while it fades out');
    } finally {
        harness.runtime.destroy();
        harness.restore();
    }
});

test('the lit-tool registry reads and stops each tool through its own owner', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    globalThis.window = {
        __eveTextTool: { isActive: () => true, deactivate: (value) => { calls.push(['text', value]); } },
        __eveDrawTool: { isActive: () => false, deactivate: () => { calls.push(['draw']); } },
        eveProjectViewCreationApi: { finishTool: async (kind) => { calls.push(['finish', kind]); return null; } }
    };
    try {
        assert.deepEqual(readActiveToolEntries().map((entry) => [entry.key, entry.surface]),
            [['text', ACTIVE_TOOL_SURFACE.MENU]]);
        assert.deepEqual(readActiveToolEntries({ keepToolId: 'ui.text.create' }), []);
        await stopActiveToolEntries();
        assert.deepEqual(calls, [['text', false], ['finish', 'text']]);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});


test('the rail pins what is lit in activation order, drops the level entry and pulses each case', async () => {
    const records = [{ id: 'shape', type: 'image', project_id: 'project',
        properties: { kind: 'image', left: 10, top: 10, width: 120, height: 80 } }];
    const scene = { project_id: 'project', records, scene: { byId: new Map() } };
    const rendered = [];
    const motions = [];
    const invocations = [];
    const lit = { play: false, record: false, create: true };
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {},
        resolveDefinitions: () => [
            { key: 'info', label: 'Info', icon: 'info', toolId: 'ui.detail.panel' },
            { key: 'create', label: 'Creer', icon: 'create', toolId: '', toolType: 'palette', active: lit.create,
                children: [{ key: 'text', label: 'Texte', icon: 'edit', toolId: 'ui.text.create', active: lit.create }] },
            { key: 'play', label: lit.play ? 'Stop' : 'Play', icon: lit.play ? 'stop' : 'play', active: lit.play },
            { key: 'record_action', label: 'Enregistrer', icon: 'record', active: lit.record }
        ],
        invokeDefinition: async (definition) => { invocations.push(definition); return { ok: true }; },
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree),
            unmountTree: async () => null,
            updateTreeMotion: ({ updates }) => { motions.push(updates.map((update) => update.nodeId)); }
        }),
        findSceneByAtomeId: (id) => records.some((record) => record.id === id) ? scene : null,
        readMainMenuHeight: () => ITEM_SIZE
    });
    const flushPulse = () => new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(runtime.enter({ atomeId: 'shape', kind: 'image', contextLevel: 'edition', record: records[0] }).ok, true);

    await runtime.render();
    assert.deepEqual(pinnedIds(rendered.at(-1)), [], 'nothing is lit yet');
    assert.equal(levelIds(rendered.at(-1)).has('atome_contextual_tool_play'), true);
    assert.equal(levelIds(rendered.at(-1)).has('atome_contextual_tool_create'), true);

    lit.play = true;
    await runtime.render();
    await flushPulse();
    let tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), ['atome_contextual_tool_play']);
    assert.equal(levelIds(tree).has('atome_contextual_tool_play'), false, 'the moved tool leaves the level');
    assert.equal(JSON.stringify(findNode(tree.root, 'atome_contextual_tool_play')).includes('Stop'), true);
    assert.deepEqual(glowingIds(tree), ['atome_contextual_tool_create', 'atome_contextual_tool_play'],
        'the pinned case glows, and so does the slot that stands for the armed ribbon tool');
    findNode(tree.root, 'atome_contextual_tool_play').on.activate();
    await flushPulse();
    assert.equal(invocations.at(-1).key, 'play');
    assert.equal(invocations.at(-1).active, true, 'the pinned case hands the lit definition to the rail invocation path');

    lit.record = true;
    await runtime.render();
    await flushPulse();
    tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), ['atome_contextual_tool_play', 'atome_contextual_tool_record_action']);
    assert.ok(findNode(tree.root, 'atome_contextual_tool_play').style.position[1]
        > findNode(tree.root, 'atome_contextual_tool_record_action').style.position[1],
    'the first tool activated stays the closest to the Atome handle');
    assert.deepEqual(glowingIds(tree), ['atome_contextual_tool_create',
        'atome_contextual_tool_play', 'atome_contextual_tool_record_action']);
    assert.equal(levelIds(tree).has('atome_contextual_tool_create'), true, 'the palette keeps its own level place');

    lit.play = false;
    await runtime.render();
    await flushPulse();
    tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), ['atome_contextual_tool_record_action']);
    assert.ok(['atome_contextual_tool_create', 'atome_contextual_tool_record_action'].every((id) => glowingIds(tree).includes(id)),
        'the remaining engaged tools keep their halo');
    assert.ok(glowingIds(tree).every((id) => id !== 'atome_contextual_tool_play'
        || findNode(tree.root, `${id}_glow`).style.opacity < 1), 'the stopped case only fades out');

    lit.record = false;
    lit.create = false;
    await runtime.render();
    await flushPulse();
    tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), [], 'the rail stack returns to its ordinary level');
    assert.equal(levelIds(tree).has('atome_contextual_tool_play'), true);
    assert.equal(levelIds(tree).has('atome_contextual_tool_record_action'), true);
    assert.ok(glowingIds(tree).every((id) => findNode(tree.root, `${id}_glow`).style.opacity < 1),
        'what is still drawn only fades out');
    runtime.destroy?.();
});

test('a media record keeps its case above the Atome handle with no rail at all', async () => {
    const rendered = [];
    const motions = [];
    const invocations = [];
    let unmounts = 0;
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {},
        resolveDefinitions: () => [],
        invokeDefinition: async (definition, options) => { invocations.push({ definition, options }); return { ok: true }; },
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree),
            unmountTree: async () => { unmounts += 1; return null; },
            updateTreeMotion: ({ updates }) => { motions.push(updates.map((update) => update.nodeId)); }
        }),
        findSceneByAtomeId: () => null,
        readMainMenuHeight: () => ITEM_SIZE
    });
    const flushPulse = () => new Promise((resolve) => setTimeout(resolve, 0));
    const previous = { ...BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE };
    try {
        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE.active = true;
        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE.mode = 'media';
        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE.record_source = 'audio';
        await runtime.render();
        await flushPulse();
        const tree = rendered.at(-1);
        assert.ok(tree, 'a lit tool mounts the pinned zone on its own');
        assert.equal(railOf(tree), undefined, 'nothing is selected: no rail is mounted');
        const pinned = findNode(tree.root, 'atome_contextual_tool_record_action');
        assert.ok(pinned, 'the record keeps its case above the Atome handle');
        assert.deepEqual(pinned.style.position, [tree.layout.x, tree.layout.bottom - tree.layout.itemSize]);
        assert.equal(pinned.style.position[1] + ITEM_SIZE, tree.layout.bottom);
        assert.equal(pinned.accessibility.label, eveT('eve.menu.stop', 'Stop'),
            'the case shows the lit stop face');
        assert.notEqual(pinned.accessibility.label, 'record_action', 'the case never falls back to the raw key');
        assert.equal(findNode(pinned, 'atome_contextual_tool_record_action_icon').image.source
            .endsWith('icons/stop.svg'), true, 'the case carries the stop icon');
        assert.equal(findNode(tree.root, `${TREE_ID}_pinned_shadow`)?.id, `${TREE_ID}_pinned_shadow`,
            'the case keeps the rail exterior depth even with no viewport');
        assert.deepEqual(glowingIds(tree), ['atome_contextual_tool_record_action'],
            'the case glows so the user sees the record is still running');
        pinned.on.activate();
        await flushPulse();
        assert.equal(invocations.at(-1).definition.toolId, 'ui.detail.record.toggle');
        assert.deepEqual(invocations.at(-1).definition.extraInput, { mode: 'media', record_source: 'audio' });
        assert.equal(invocations.at(-1).definition.active, true, 'the lit face is the one that stops it');

        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE.active = false;
        const mountedTrees = rendered.length;
        await runtime.render();
        await flushPulse();
        assert.equal(unmounts, 1, 'the stopped record takes its case away');
        assert.equal(rendered.length, mountedTrees, 'a stopped record mounts nothing back');
    } finally {
        Object.assign(BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE, previous);
    }
});

test('a record lit by the rail level never duplicates its case and outlives the object', async () => {
    const records = [
        { id: 'shape', type: 'image', project_id: 'project', properties: { kind: 'image', left: 10, top: 10, width: 120, height: 80 } },
        { id: 'other', type: 'image', project_id: 'project', properties: { kind: 'image', left: 40, top: 40, width: 120, height: 80 } }
    ];
    const scene = { project_id: 'project', records, scene: { byId: new Map() } };
    const rendered = [];
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {},
        resolveDefinitions: () => [
            { key: 'info', label: 'Info', icon: 'info', toolId: 'ui.detail.panel' },
            { key: 'record_action', label: 'Stop', icon: 'stop', toolId: 'ui.detail.record.toggle', active: true }
        ],
        invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree),
            unmountTree: async () => null,
            updateTreeMotion: () => {}
        }),
        findSceneByAtomeId: (id) => records.some((record) => record.id === id) ? scene : null,
        readMainMenuHeight: () => ITEM_SIZE
    });
    assert.equal(runtime.enter({ atomeId: 'shape', kind: 'image', record: records[0] }).ok, true);
    await runtime.render();
    let tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), ['atome_contextual_tool_record_action']);
    assert.equal(collectIds(tree.root).filter((id) => id === 'atome_contextual_tool_record_action').length, 1,
        'a lit rail tool is displayed exactly once');
    assert.equal(levelIds(tree).has('atome_contextual_tool_record_action'), false, 'it left the ordinary level');

    assert.equal(runtime.enter({ atomeId: 'other', kind: 'image', record: records[1] }).ok, true);
    await runtime.render();
    tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), ['atome_contextual_tool_record_action']);
    assert.deepEqual(findNode(tree.root, 'atome_contextual_tool_record_action').style.position,
        [tree.layout.x, tree.layout.bottom - tree.layout.itemSize]);
});

test('the rail record reads the owner of the record that is actually running', () => {
    const previous = { ...BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE };
    try {
        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE.active = false;
        assert.deepEqual(readActiveRailToolEntries(), [], 'a stopped rail is not lit');
        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE.active = true;
        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE.mode = 'media';
        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE.record_source = 'video';
        const [entry] = readActiveRailToolEntries();
        assert.equal(entry.key, 'record_action');
        assert.equal(entry.toolId, 'ui.detail.record.toggle');
        assert.equal(entry.surface, ACTIVE_TOOL_SURFACE.RAIL);
        assert.deepEqual(entry.extraInput, { mode: 'media', record_source: 'video' },
            'the stop hands the running source back to its owner');
    } finally {
        Object.assign(BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE, previous);
    }
});


test('a running playback keeps its case above the Atome handle with nothing selected', async () => {
    const playbackWindow = {
        addEventListener: () => {}, removeEventListener: () => {},
        setTimeout: () => 0, clearTimeout: () => {}, dispatchEvent: () => {}
    };
    registerSelectedProjectMediaPlayback({
        windowRef: playbackWindow, atomeId: 'clip', record: null, kind: 'audio', durationSeconds: 0
    });
    try {
        assert.deepEqual(readActiveRailToolEntries().map((entry) => entry.key), ['play'],
            'the running playback is the lit fact');
        assert.deepEqual(readActiveRailToolEntries()[0].extraInput, { selection_ids: ['clip'] },
            'the stop targets the playback that is running');
        const rendered = [];
        const invocations = [];
        const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
            legacyState: {},
            resolveDefinitions: () => [],
            invokeDefinition: async (definition, options) => { invocations.push({ definition, options }); return { ok: true }; },
            surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
            bevyRuntimeResolver: () => ({
                mountTree: async ({ tree }) => rendered.push(tree),
                updateTree: async ({ tree }) => rendered.push(tree),
                unmountTree: async () => null,
                updateTreeMotion: () => {}
            }),
            findSceneByAtomeId: () => null,
            readMainMenuHeight: () => ITEM_SIZE
        });
        await runtime.render();
        const tree = rendered.at(-1);
        const pinned = findNode(tree.root, 'atome_contextual_tool_play');
        assert.ok(pinned, 'a playback keeps its case above the Atome handle with no rail');
        assert.deepEqual(pinned.style.position, [tree.layout.x, tree.layout.bottom - tree.layout.itemSize]);
        pinned.on.activate();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(invocations.at(-1).definition.toolId, 'ui.play');
        assert.deepEqual(invocations.at(-1).definition.extraInput, { selection_ids: ['clip'] },
            'the pinned case stops the playback that is actually running');
    } finally {
        await stopSelectedProjectMediaPlayback({ Squirrel: null }, 'clip');
    }
});

// A pinned creation tool (Page, Placeholder, Code, Generator) leaves the menu
// and lives here while it is armed: one case in the pinned zone, and its press
// disarms the tool through the owner that publishes its state.
const armedCreationWindow = (stopped) => ({
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
    eveProjectViewCreationApi: {
        isPageToolActive: () => true,
        setPageToolActive: (active) => { stopped.push(['page', active]); return active === true; },
        finishTool: () => null
    },
    evePlaceholderCreationApi: {
        isActive: () => true,
        setActive: (active) => { stopped.push(['placeholder', active]); return active === true; }
    },
    eveCodeToolApi: {
        isOpen: () => true,
        close: () => { stopped.push(['code', false]); return true; }
    },
    eveGeneratorApi: {
        isActive: () => true,
        setActive: (active) => { stopped.push(['generator', active]); return active === true; }
    }
});

const renderArmedRail = async ({ definitions = [], invoker }) => {
    const rendered = [];
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {},
        resolveDefinitions: () => [],
        invokeDefinition: invoker,
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree),
            unmountTree: async () => null,
            updateTreeMotion: () => {}
        }),
        findSceneByAtomeId: () => null,
        readMainMenuHeight: () => ITEM_SIZE
    });
    if (definitions.length) {
        const entered = runtime.enterVirtual({
            atomeId: 'rail_project', kind: 'tool', projectId: 'rail_project',
            record: { id: 'rail_project', atome_id: 'rail_project', project_id: 'rail_project', type: 'project', properties: {} },
            definitions,
            invokeDefinition: invoker
        });
        assert.equal(entered.ok, true, 'the armed tool takes the rail before any object exists');
    }
    await runtime.render();
    return rendered.at(-1);
};

test('an armed creation tool keeps its pinned case glued to the rail bottom, and the press stops it through its owner', async () => {
    const stopped = [];
    const previousWindow = globalThis.window;
    globalThis.window = armedCreationWindow(stopped);
    try {
        assert.deepEqual(readActiveToolEntries().map((entry) => entry.key),
            ['code', 'page', 'placeholder', 'generator'],
            'the operative reader keeps the menu keys: a rail key is a residence, not a second tool');
        assert.deepEqual(readActiveRailToolEntries().map((entry) => entry.key),
            ['code_create', 'page_create', 'create_placeholder', 'generator'],
            'each armed creation tool resides in the rail, keyed by its menu content key');
        const tree = await renderArmedRail({ invoker: async () => ({ ok: true }) });
        const keys = ['code_create', 'page_create', 'create_placeholder', 'generator'];
        const nodes = keys.map((key) => findNode(tree.root, `atome_contextual_tool_${key}`));
        assert.ok(nodes.every(Boolean), 'Code, Page, Placeholder and Generator are all pinned');
        nodes.forEach((node, index) => {
            assert.deepEqual(node.style.position, [tree.layout.x, tree.layout.bottom - (index + 1) * tree.layout.itemSize - index * tree.layout.gap],
                `${keys[index]} stacks in the pinned zone`);
        });
        assert.equal(nodes[0].style.position[1] + tree.layout.itemSize, tree.layout.bottom,
            'the first tool activated is the closest to the Atome handle');
        findNode(tree.root, 'atome_contextual_tool_page_create').on.activate();
        await new Promise((resolve) => setTimeout(resolve, 0));
        findNode(tree.root, 'atome_contextual_tool_generator').on.activate();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(stopped, [['page', false], ['generator', false]],
            'a press disarms the tool through the owner that reads it, never through a rail state');
    } finally {
        globalThis.window = previousWindow;
    }
});

test('an armed Page shows its formats in the rail level, the current one lit, and a case arms that format', async () => {
    const calls = [];
    const previousWindow = globalThis.window;
    const view = {
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
        eveProjectViewCreationApi: {
            readPageFormat: () => 'a4',
            setActive: (active, format) => { calls.push([active, format]); return active === true; }
        }
    };
    globalThis.window = view;
    try {
        const content = createMainMenuCreateContent({
            translate: eveT, createToolId: 'tool.main.create', drawToolId: 'tool.main.draw'
        });
        const definitions = buildArmedToolRailDefinitions({
            tool: 'page', projectId: 'rail_project', win: view, content
        });
        assert.deepEqual(definitions.map((definition) => definition.key), [
            'page_format_free', 'page_format_sixteen_nine', 'page_format_four_three',
            'page_format_three_two', 'page_format_a4', 'page_format_square'
        ]);
        const tree = await renderArmedRail({ definitions,
            invoker: (definition, options) => invokeArmedToolOption('page', definition, options, view) });
        const nodes = definitions.map((definition) => findNode(tree.root, `atome_contextual_tool_${definition.key}`));
        assert.ok(nodes.every(Boolean), 'the six formats are cases of the rail level');
        assert.deepEqual(pinnedIds(tree), [], 'the options are not pinned: the tool is');
        const lit = nodes.filter((node) => node.style.translation !== undefined);
        assert.deepEqual(lit.map((node) => node.id), ['atome_contextual_tool_page_format_a4'],
            'the format read from its owner is the only lit case');
        findNode(tree.root, 'atome_contextual_tool_page_format_square').on.activate();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(calls, [[true, 'square']], 'choosing a format arms the tool through its owner');
    } finally {
        globalThis.window = previousWindow;
    }
});

test('the lateral rail opens its palette on press and applies the option under the release', () => {
    const definitions = [
        { key: 'tool_0', label: 'tool_0' },
        { key: 'palette_1', label: 'palette_1', toolType: 'palette', children: [
            { key: 'option_a', label: 'option_a' },
            { key: 'option_b', label: 'option_b' }
        ] }
    ];
    for (const handedness of ['left', 'right']) {
        const itemSize = ITEM_SIZE;
        const handlers = {
            atome_contextual_tool_palette_1: { activate: () => null },
            atome_contextual_tool_palette_1_option_a: { activate: () => null },
            atome_contextual_tool_palette_1_option_b: { activate: () => null }
        };
        const tree = buildAtomeContextualEditTree({
            surface: { getBoundingClientRect: () => ({ width: 400, height: 400 }) },
            activeAtomeId: 'shape', itemSize, mainMenuHeight: itemSize, handedness,
            definitions, activePaletteKey: 'palette_1', handlers
        });
        const parent = findNode(tree.root, 'atome_contextual_tool_palette_1');
        const first = findNode(tree.root, 'atome_contextual_tool_palette_1_option_a');
        const second = findNode(tree.root, 'atome_contextual_tool_palette_1_option_b');
        assert.ok(parent && first && second, `palette children exist (${handedness})`);
        // The press opens the palette WITHOUT lifting: the parent carries the
        // one gesture the shared pointer runtime needs, and the children carry
        // the choice a release applies.
        assert.equal(typeof parent.on.palette_open, 'function');
        assert.equal(typeof first.on.palette_choose, 'function');
        assert.equal(typeof second.on.palette_choose, 'function');
        // Glued to the inner edge of the rail and centred on the tool's own row:
        // the finger travels from the tool to the option without a gap. The
        // options live at the surface level, the tool inside the scrolling rail,
        // so both are compared in surface coordinates.
        const toolLeft = tree.layout.x + parent.style.position[0];
        const toolY = tree.layout.y + parent.style.position[1];
        // A right-handed rail keeps its palette on its left, a left-handed rail
        // on its right: either way the row leaves the tool towards the centre of
        // the screen, so the tiling is read from the tool outwards.
        const flowsLeft = handedness === 'right';
        const facing = (option) => (flowsLeft
            ? option.style.position[0] + option.style.size[0] : option.style.position[0]);
        const far = (option) => (flowsLeft ? option.style.position[0] : option.style.position[0] + option.style.size[0]);
        const toolInnerEdge = flowsLeft ? toolLeft : toolLeft + parent.style.size[0];
        assert.equal(facing(first), toolInnerEdge, `the first option touches the tool (${handedness})`);
        assert.equal(first.style.position[1], toolY, `the option sits on the tool row (${handedness})`);
        assert.equal(facing(second), far(first), `the options touch each other (${handedness})`);
    }
});


// The gesture is proven on the route the product really uses: the rail model
// builds the palette, its own handlers own the choice, and the shared pointer
// runtime decides what a press, a slide without a lift and a release mean.
test('a press-and-slide along the rail applies the option under the finger and closes the palette', () => {
    const definitions = [
        { key: 'tool_0', label: 'tool_0' },
        { key: 'draw', label: 'draw', toolType: 'palette', children: [
            { key: 'draw_colour', label: 'draw_colour' },
            { key: 'draw_opacity', label: 'draw_opacity' }
        ] }
    ];
    const invocations = [];
    const railState = { activePaletteKey: '', activeAtomeId: 'shape', railScrollOffset: 0 };
    const pointerState = {
        lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null,
        hoverTarget: null, pendingTextActivation: null, handlers: new Map()
    };
    let tree = null;
    let root = null;
    // One single rebuild answers both the model and the gesture: the rail
    // rebuilds its tree, then the shared normalizer registers the handlers of
    // every node it carries — exactly the route the runtime takes on mount.
    const render = () => {
        const nodeHandlers = createAtomeContextualEditHandlers({
            state: railState,
            keyOf: (value) => String(value == null ? '' : value).trim(),
            scheduleRender: render,
            definitions: () => definitions,
            sliderHandlers: () => ({}),
            runActiveDefinition: (definition) => { invocations.push(definition.key); },
            announceChange: () => {},
            activeToolIds: () => null
        });
        tree = buildAtomeContextualEditTree({
            surface: { getBoundingClientRect: () => ({ width: 400, height: 400 }) },
            activeAtomeId: 'shape', itemSize: ITEM_SIZE, mainMenuHeight: ITEM_SIZE, handedness: 'right',
            definitions, activePaletteKey: railState.activePaletteKey, handlers: nodeHandlers
        });
        const handlers = new Map();
        root = normalizeBevyUiTree({ id: TREE_ID, tree, handlers }).root;
        pointerState.handlers = handlers;
    };
    render();
    const centreOf = (id) => {
        let box = null;
        const walk = (node, x, y) => {
            if (!node || box) return;
            const [offsetX = 0, offsetY = 0] = node.style?.position || [];
            if (node.id === id) {
                box = [x + offsetX, y + offsetY, node.style.size[0], node.style.size[1]];
                return;
            }
            (node.children || []).forEach((child) => walk(child, x + offsetX, y + offsetY));
        };
        walk(root, 0, 0);
        assert.ok(box, `${id} exists`);
        return { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 };
    };
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const runtime = createBevyUiPointerRuntime({
        state: pointerState,
        hitTestTrees: (_canvas, point) => {
            const hit = hitTestBevyUiNode(root, point);
            return hit ? {
                treeId: TREE_ID, nodeId: hit.node.id, kind: hit.node.kind,
                box: hit.box, scrollAncestors: hit.scrollAncestors || []
            } : null;
        },
        localEventForTarget: (target, eventName) => ({ tree_id: TREE_ID, node_id: target.nodeId, event: eventName }),
        emitUiEvents: (events) => events.forEach((event) => {
            pointerState.handlers.get(`${event.tree_id}:${event.node_id}:${event.event}`)?.(event);
        }),
        scrollRuntime: { begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false }
    });
    const toolPoint = centreOf('atome_contextual_tool_draw');
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: toolPoint, event: { pointerId: 4 } });
    assert.equal(railState.activePaletteKey, 'draw', 'the press opens the palette without a lift');
    const optionPoint = centreOf('atome_contextual_tool_draw_draw_colour');
    assert.ok(optionPoint.x < toolPoint.x, 'the option sits towards the centre of the screen');
    assert.equal(optionPoint.y, toolPoint.y, 'the slide stays on the tool row');
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: optionPoint, event: { pointerId: 4 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: optionPoint, event: { pointerId: 4 } });
    assert.deepEqual(invocations, ['draw_colour'], 'the release applies the option under the finger');
    assert.equal(railState.activePaletteKey, '', 'and the palette closes right after');
    assert.equal(findNode(root, 'atome_contextual_tool_draw_draw_colour'), null);
});

// Le meme geste quand la palette est DEJA ouverte : l'appui la referme comme un
// tap, mais le premier deplacement la revele de nouveau — il ne bascule jamais —
// et le relachement applique l'option sous le doigt.
test('a slide on an already open rail palette reveals it again and still applies the choice', () => {
    const definitions = [
        { key: 'tool_0', label: 'tool_0' },
        { key: 'draw', label: 'draw', toolType: 'palette', children: [
            { key: 'draw_colour', label: 'draw_colour' },
            { key: 'draw_opacity', label: 'draw_opacity' }
        ] }
    ];
    const invocations = [];
    const railState = { activePaletteKey: 'draw', activeAtomeId: 'shape', railScrollOffset: 0 };
    const pointerState = {
        lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null,
        hoverTarget: null, pendingTextActivation: null, handlers: new Map()
    };
    let root = null;
    const render = () => {
        const nodeHandlers = createAtomeContextualEditHandlers({
            state: railState,
            keyOf: (value) => String(value == null ? '' : value).trim(),
            scheduleRender: render,
            definitions: () => definitions,
            sliderHandlers: () => ({}),
            runActiveDefinition: (definition) => { invocations.push(definition.key); },
            announceChange: () => {},
            activeToolIds: () => null
        });
        const tree = buildAtomeContextualEditTree({
            surface: { getBoundingClientRect: () => ({ width: 400, height: 400 }) },
            activeAtomeId: 'shape', itemSize: ITEM_SIZE, mainMenuHeight: ITEM_SIZE, handedness: 'right',
            definitions, activePaletteKey: railState.activePaletteKey, handlers: nodeHandlers
        });
        const handlers = new Map();
        root = normalizeBevyUiTree({ id: TREE_ID, tree, handlers }).root;
        pointerState.handlers = handlers;
    };
    render();
    const centreOf = (id) => {
        let box = null;
        const walk = (node, x, y) => {
            if (!node || box) return;
            const [offsetX = 0, offsetY = 0] = node.style?.position || [];
            if (node.id === id) {
                box = [x + offsetX, y + offsetY, node.style.size[0], node.style.size[1]];
                return;
            }
            (node.children || []).forEach((child) => walk(child, x + offsetX, y + offsetY));
        };
        walk(root, 0, 0);
        assert.ok(box, `${id} exists`);
        return { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 };
    };
    const toolPoint = centreOf('atome_contextual_tool_draw');
    const optionPoint = centreOf('atome_contextual_tool_draw_draw_colour');
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const runtime = createBevyUiPointerRuntime({
        state: pointerState,
        hitTestTrees: (_canvas, point) => {
            const hit = hitTestBevyUiNode(root, point);
            return hit ? {
                treeId: TREE_ID, nodeId: hit.node.id, kind: hit.node.kind,
                box: hit.box, scrollAncestors: hit.scrollAncestors || []
            } : null;
        },
        localEventForTarget: (target, eventName) => ({ tree_id: TREE_ID, node_id: target.nodeId, event: eventName }),
        emitUiEvents: (events) => events.forEach((event) => {
            pointerState.handlers.get(`${event.tree_id}:${event.node_id}:${event.event}`)?.(event);
        }),
        scrollRuntime: { begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false }
    });
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: toolPoint, event: { pointerId: 5 } });
    assert.equal(railState.activePaletteKey, '', 'the press on an open palette behaves like a tap');
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: optionPoint, event: { pointerId: 5 } });
    assert.equal(railState.activePaletteKey, 'draw', 'the slide reveals it again instead of toggling');
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: optionPoint, event: { pointerId: 5 } });
    assert.deepEqual(invocations, ['draw_colour'], 'the release applies the option under the finger');
    assert.equal(railState.activePaletteKey, '', 'and the palette closes right after');
});

// The quick mode of a tool that keeps its own action (Lecture/Play, Replay
// actions): the options are armed on the press, appear on the first travel
// without a lift, and the release applies the one under the finger. A plain tap
// must still run the tool itself, and a still hold must still open the options
// after the delay — the two shipped routes are not replaced.
test('a slide from a rail hold tool opens its options, while a tap keeps the tool action', () => {
    const definitions = [{
        key: 'play', label: 'play', toolType: 'tool',
        longPressChildren: [{ key: 'stop', label: 'stop', toolType: 'tool' }]
    }];
    const invocations = [];
    const railState = { activePaletteKey: '', activeAtomeId: 'shape', railScrollOffset: 0 };
    const pointerState = {
        lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null,
        hoverTarget: null, pendingTextActivation: null, handlers: new Map()
    };
    let root = null;
    const render = () => {
        const nodeHandlers = createAtomeContextualEditHandlers({
            state: railState,
            keyOf: (value) => String(value == null ? '' : value).trim(),
            scheduleRender: render,
            definitions: () => definitions,
            sliderHandlers: () => ({}),
            runActiveDefinition: (definition) => { invocations.push(definition.key); },
            announceChange: () => {},
            activeToolIds: () => null
        });
        const tree = buildAtomeContextualEditTree({
            surface: { getBoundingClientRect: () => ({ width: 400, height: 400 }) },
            activeAtomeId: 'shape', itemSize: ITEM_SIZE, mainMenuHeight: ITEM_SIZE, handedness: 'right',
            definitions, activePaletteKey: railState.activePaletteKey, handlers: nodeHandlers
        });
        const handlers = new Map();
        root = normalizeBevyUiTree({ id: TREE_ID, tree, handlers }).root;
        pointerState.handlers = handlers;
    };
    render();
    const centreOf = (id) => {
        let box = null;
        const walk = (node, x, y) => {
            if (!node || box) return;
            const [offsetX = 0, offsetY = 0] = node.style?.position || [];
            if (node.id === id) {
                box = [x + offsetX, y + offsetY, node.style.size[0], node.style.size[1]];
                return;
            }
            (node.children || []).forEach((child) => walk(child, x + offsetX, y + offsetY));
        };
        walk(root, 0, 0);
        assert.ok(box, `${id} exists`);
        return { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 };
    };
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const runtime = createBevyUiPointerRuntime({
        state: pointerState,
        hitTestTrees: (_canvas, point) => {
            const hit = hitTestBevyUiNode(root, point);
            return hit ? {
                treeId: TREE_ID, nodeId: hit.node.id, kind: hit.node.kind,
                box: hit.box, scrollAncestors: hit.scrollAncestors || []
            } : null;
        },
        localEventForTarget: (target, eventName) => ({ tree_id: TREE_ID, node_id: target.nodeId, event: eventName }),
        emitUiEvents: (events) => events.forEach((event) => {
            pointerState.handlers.get(`${event.tree_id}:${event.node_id}:${event.event}`)?.(event);
        }),
        scrollRuntime: { begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false }
    });

    // 1. A tap runs the tool itself and never opens the options.
    const toolPoint = centreOf('atome_contextual_tool_play');
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: toolPoint, event: { pointerId: 7 } });
    assert.equal(railState.activePaletteKey, '', 'the press alone opens nothing');
    assert.equal(findNode(root, 'atome_contextual_tool_play_stop'), null);
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: toolPoint, event: { pointerId: 7 } });
    assert.deepEqual(invocations, ['play'], 'the tap keeps the tool action');
    assert.equal(railState.activePaletteKey, '');

    // 2. A slide opens the options without a lift and the release applies the one
    // under the finger, exactly like a palette opened by a press.
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: toolPoint, event: { pointerId: 8 } });
    const nudged = { x: toolPoint.x - ITEM_SIZE * 0.6, y: toolPoint.y };
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: nudged, event: { pointerId: 8 } });
    assert.equal(railState.activePaletteKey, 'play', 'the slide opens the options without lifting');
    const stopPoint = centreOf('atome_contextual_tool_play_stop');
    assert.ok(stopPoint.x < toolPoint.x, 'the option sits towards the centre of the screen');
    assert.equal(stopPoint.y, toolPoint.y, 'the option sits on the tool row');
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: stopPoint, event: { pointerId: 8 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: stopPoint, event: { pointerId: 8 } });
    assert.deepEqual(invocations, ['play', 'stop'], 'the release applies the option under the finger');
    assert.equal(railState.activePaletteKey, '', 'and the options close right after');
});

test('the rail reserves the band the menu publishes, and re-renders when that band moves', async () => {
    const records = [{ id: 'shape', type: 'image', project_id: 'project',
        properties: { kind: 'image', left: 10, top: 10, width: 120, height: 80 } }];
    const scene = { project_id: 'project', records, scene: { byId: new Map() } };
    const rendered = [];
    let band = ITEM_SIZE;
    const listeners = new Map();
    const previousWindow = globalThis.window;
    globalThis.window = {
        __eveWorkspaceMode: { mode: 'project', projectId: 'project' },
        __selectedAtomeIds: [],
        addEventListener: (type, handler) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(handler);
        },
        removeEventListener: (type, handler) => listeners.get(type)?.delete(handler),
        dispatchEvent: (event) => {
            (listeners.get(event?.type) || []).forEach((handler) => handler(event));
            return true;
        },
        CustomEvent: class CustomEvent {
            constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
        },
        requestAnimationFrame: (callback) => setTimeout(() => callback(0), 0),
        cancelAnimationFrame: (id) => clearTimeout(id)
    };
    const runtime = createAtomeContextualEditRuntime({ readMenuAccess,
        legacyState: {},
        resolveDefinitions: () => [{ key: 'info', label: 'Info', icon: 'info', toolId: 'ui.detail.panel' }],
        invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree),
            unmountTree: async () => null,
            updateTreeMotion: () => {}
        }),
        findSceneByAtomeId: (id) => records.some((record) => record.id === id) ? scene : null,
        readMainMenuHeight: () => band
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    try {
        runtime.install();
        runtime.enter({ atomeId: 'shape', kind: 'image', contextLevel: 'selection', record: records[0] });
        await runtime.render();
        const first = rendered.at(-1);
        assert.equal(first.layout.bottom, 600 - ITEM_SIZE - first.layout.gap,
            'the rail level stops at the band the menu reserves');

        // The band moves (an input box is laid out, the Atome slot stays visible):
        // the menu publishes the new geometry and the rail re-reads it.
        band = ITEM_SIZE * 2;
        globalThis.window.dispatchEvent(new globalThis.window.CustomEvent('eve:intuitionx-state-changed', {
            detail: { source: 'bevy_ui_main_menu', reservedHeight: band }
        }));
        await settle();
        const second = rendered.at(-1);
        assert.notEqual(second, first, 'the rail re-renders on the geometry the menu publishes');
        assert.equal(second.layout.bottom, 600 - ITEM_SIZE * 2 - second.layout.gap,
            'and reserves the band where it is now, never the one it remembered');

        globalThis.window.dispatchEvent(new globalThis.window.CustomEvent('eve:intuitionx-state-changed', {
            detail: { source: 'other_publisher', reservedHeight: 400 }
        }));
        await settle();
        assert.equal(rendered.at(-1).layout.bottom, second.layout.bottom,
            'another publisher never moves the band: only the menu height counts');
    } finally {
        globalThis.window = previousWindow;
    }
});

// Les trois effets d'objet se rangent SOUS l'ordre (50) et AVANT la
// communication (60) : on range, puis on arrondit et on ombre, puis on masque ce
// que l'objet recouvre, avant de parler de lui.
test('rounding, shadow and mask sit under the z-order and before communicate', () => {
    const TOOL_IDS = {
        z_order: 'ui.z_order', rounding: 'ui.rounding.panel', shadow: 'ui.shadow.panel',
        mask: 'ui.mask.apply', communicate: 'ui.communicate'
    };
    const content = Object.fromEntries(Object.entries(TOOL_IDS).map(([key, toolId]) => [key, {
        key, labelKey: `eve.menu.${key}`, icon: key, tool_id: toolId
    }]));
    const railModel = (locale) => createAtomeContextualRailModelRuntime({
        mainToolIdByKey: TOOL_IDS,
        intuitionContent: content,
        normalizeMainToolKey: (value) => String(value || '').trim().toLowerCase(),
        normalizeCatalogToolEntry: ({ key, def }) => ({ key, ...def }),
        normalizeRecordActionRecordSource: (value) => String(value || '').trim().toLowerCase() || null,
        resolveCanonicalMainToolId: (value) => String(value || '').trim(),
        resolveCurrentTextSizeValue: (value) => value,
        isSelectionRequiredToolKey: () => false,
        getAtomeElement: () => null,
        getAtomeRuntimeState: () => null,
        translate: (key, fallback) => EVE_DEFAULT_MESSAGES[locale][key] || fallback || key
    });
    const rail = railModel('fr');
    const definition = (key) => rail.resolveAtomeContextualRailToolDefinition(key, {});
    const priority = (key) => definition(key).priority;
    assert.ok(priority('z_order') < priority('rounding'), 'the order comes first');
    assert.ok(priority('rounding') < priority('shadow'), 'the rounding, then the shadow');
    assert.ok(priority('shadow') < priority('mask'), 'the mask closes the group');
    assert.ok(priority('mask') < priority('communicate'), 'and the three stay before communication');
    // L'arrondi et l'ombre OUVRENT un panneau : leur case est un bouton on/off,
    // allume tant que le panneau est ouvert, comme la couleur et la police. Le
    // masque reste une action ponctuelle.
    for (const key of ['rounding', 'shadow']) {
        const entry = definition(key);
        assert.equal(entry.actionMode, 'toggle', `${key} is an on/off button`);
        assert.equal(entry.latch, true, `${key} latches`);
        assert.equal(entry.toolType, 'standard');
        assert.equal(entry.gatewayAction, '', 'a panel command never goes to the gateway');
    }
    const mask = definition('mask');
    assert.equal(mask.actionMode, '', 'the mask is applied, never latched');
    assert.equal(mask.latch, false);
    assert.equal(mask.toolId, 'ui.mask.apply');
    assert.equal(definition('rounding').toolId, 'ui.rounding.panel');
    assert.equal(definition('shadow').toolId, 'ui.shadow.panel');
    // Le libelle est traduit, jamais la cle brute.
    assert.equal(definition('rounding').label, 'Arrondi');
    assert.equal(definition('shadow').label, 'Ombre');
    assert.equal(definition('mask').label, 'Masque');
    assert.equal(railModel('en').resolveAtomeContextualRailToolDefinition('rounding', {}).label, 'Rounding');
    assert.equal(railModel('en').resolveAtomeContextualRailToolDefinition('mask', {}).label, 'Mask');
});

test('the contextual rail loads the mask action before invoking it and forwards its selection', async () => {
    const previousHTMLElement = globalThis.HTMLElement;
    globalThis.HTMLElement = class HTMLElement {};
    TOOL_HANDLER_REGISTRY.delete('ui.mask.apply');
    let invocation = null;
    try {
        const runtime = createAtomeContextualRailDefinitionInvocationRuntime({
            state: { activeAtomeId: 'source_shape' },
            ensureDeletePanelModule: async () => {},
            maybeBlockSelectionRequiredToolActivation: () => null,
            handleFinderTouch: async () => ({ ok: true }),
            getFinderToolEl: () => null,
            invokeToolFromUiButton: async () => ({ ok: true }),
            invokeUnifiedContextTool: async (payload) => {
                invocation = payload;
                assert.equal(typeof TOOL_HANDLER_REGISTRY.get('ui.mask.apply'), 'function',
                    'the lazy action is registered before the gateway is crossed');
                return { ok: true };
            },
            resolveDefinitionToolId: (definition) => definition.toolId,
            buildToolExtraInput: ({ activeAtomeId }) => ({ selection_ids: [activeAtomeId] }),
            isContextBoundTransportToolId: () => false
        });
        const result = await runtime.invokeAtomeContextualRailToolDefinitionWithContext({
            key: 'mask', toolId: 'ui.mask.apply', selectionRequired: true
        });
        assert.equal(result.ok, true);
        assert.equal(invocation.toolId, 'ui.mask.apply');
        assert.deepEqual(invocation.extraInput, { selection_ids: ['source_shape'] });
    } finally {
        globalThis.HTMLElement = previousHTMLElement;
    }
});

test('a Bevy rail click captures its atome before the closing render can clear the active slot', () => {
    const state = { activeAtomeId: 'source_shape', activePaletteKey: 'effects' };
    const invocations = [];
    const handlers = createAtomeContextualEditHandlers({
        state,
        keyOf: (value) => String(value || '').trim().toLowerCase(),
        scheduleRender: () => { state.activeAtomeId = ''; },
        definitions: () => [{ key: 'mask', toolType: 'standard', toolId: 'ui.mask.apply' }],
        sliderHandlers: () => ({}),
        runActiveDefinition: (definition, options) => invocations.push({ definition, options }),
        announceChange: () => {},
        activeToolIds: () => new Set()
    });
    handlers.atome_contextual_tool_mask.activate();
    assert.equal(state.activeAtomeId, '', 'the synchronous refresh reproduces the selection race');
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].options.atomeId, 'source_shape',
        'the action keeps the contextual owner captured at pointer activation');
});

test('a mask Shape Edit definition targets the hidden parametric source instead of its wrapper', async () => {
    let invocation = null;
    const runtime = createAtomeContextualRailDefinitionInvocationRuntime({
        state: { activeAtomeId: 'mask_wrapper' },
        ensureDeletePanelModule: async () => {},
        maybeBlockSelectionRequiredToolActivation: () => null,
        handleFinderTouch: async () => ({ ok:true }),
        getFinderToolEl: () => null,
        invokeToolFromUiButton: async () => ({ ok:true }),
        invokeUnifiedContextTool: async (payload) => { invocation = payload; return { ok:true }; },
        resolveDefinitionToolId: (definition) => definition.toolId,
        buildToolExtraInput: ({ activeAtomeId }) => ({
            target_atome_id: activeAtomeId,
            selection_ids: [activeAtomeId]
        }),
        isContextBoundTransportToolId: () => false
    });
    await runtime.invokeAtomeContextualRailToolDefinitionWithContext({
        key:'shape_edit_square', toolId:'ui.shape.variant.square', targetAtomeId:'mask_shape'
    }, { atomeId:'mask_wrapper' });
    assert.equal(invocation.toolId, 'ui.shape.variant.square');
    assert.deepEqual(invocation.extraInput, {
        target_atome_id:'mask_shape', selection_ids:['mask_shape']
    });
});

test('the contextual rail registers and invokes canonical ungroup instead of a missing V2 tool', async () => {
    const previousHTMLElement = globalThis.HTMLElement;
    globalThis.HTMLElement = class HTMLElement {};
    TOOL_HANDLER_REGISTRY.delete('ui.molecule.ungroup');
    let invocation = null;
    try {
        const runtime = createAtomeContextualRailDefinitionInvocationRuntime({
            state: { activeAtomeId: 'mask_wrapper' },
            ensureDeletePanelModule: async () => {},
            maybeBlockSelectionRequiredToolActivation: () => null,
            handleFinderTouch: async () => ({ ok: true }),
            getFinderToolEl: () => null,
            invokeToolFromUiButton: async () => ({ ok: true }),
            invokeUnifiedContextTool: async (payload) => {
                invocation = payload;
                assert.equal(typeof TOOL_HANDLER_REGISTRY.get('ui.molecule.ungroup'), 'function');
                return { ok: true };
            },
            resolveDefinitionToolId: (definition) => definition.toolId,
            buildToolExtraInput: ({ activeAtomeId }) => ({ selection_ids: [activeAtomeId] }),
            isContextBoundTransportToolId: () => false
        });
        const result = await runtime.invokeAtomeContextualRailToolDefinitionWithContext({
            key: 'ungroup', toolId: 'ui.molecule.ungroup', selectionRequired: true
        });
        assert.equal(result.ok, true);
        assert.equal(invocation.toolId, 'ui.molecule.ungroup');
        assert.deepEqual(invocation.extraInput, { selection_ids: ['mask_wrapper'] });
    } finally {
        globalThis.HTMLElement = previousHTMLElement;
    }
});
