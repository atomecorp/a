import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

import { buildAtomeContextualEditTree } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_model.js';
import { createAtomeContextualEditRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js';
import { createAtomeContextualRailDefinitionInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_rail_definition_invocation_runtime.js';
import { resolveBevyMainMenuLitToolIconIds } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createBevyUiScrollRuntime } from '../../eVe/domains/rendering/bevy_ui_scroll_runtime.js';
import { hitTestBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_hit_test_runtime.js';
import { createRuntimeHarness, waitFrame } from './bevy_ui_main_menu_test_helpers.mjs';
import {
    ACTIVE_TOOL_SURFACE,
    isActiveRailToolKey,
    isActiveToolId,
    readActiveToolEntries,
    stopActiveToolEntries
} from '../../eVe/intuition/tools/core/active_tool_registry.js';

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
const railOf = (tree) => tree.root.children.find((node) => node.id === RAIL_ID);
// The pinned zone is glued to the rail exterior: it is a sibling of the scrolling
// viewport, never one of its children. That is what makes it unscrollable.
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
    assert.equal(bottom, 400 - ITEM_SIZE, 'the rail bottom sits exactly above the main-menu band');
    assert.equal(railOf(baseline).style.size[1], baseline.layout.railHeight);

    const tree = buildRail({
        activeSlots: [{ key: 'tool_2', label: 'Stop', icon: 'stop', toolType: 'tool' }]
    });
    const pinned = findNode(tree.root, 'atome_contextual_tool_tool_2');
    assert.ok(pinned, 'a lit rail tool keeps its stable node id in the pinned zone');
    assert.deepEqual(pinned.style.position, [tree.layout.x, bottom - ITEM_SIZE]);
    assert.equal(pinned.style.position[1] + ITEM_SIZE, bottom, 'the last case is glued to the rail bottom');
    assert.equal(JSON.stringify(pinned).includes('Stop'), true, 'the pinned case carries the lit presentation');
    // The ordinary level is pushed up by exactly the reserved height (Tetris)…
    assert.equal(railOf(tree).style.position[1], railOf(baseline).style.position[1]);
    assert.equal(railOf(tree).style.size[1] + ITEM_SIZE, railOf(baseline).style.size[1]);
    // …and the moved tool no longer occupies a slot in that level.
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
        assert.equal(tree.layout.x, handedness === 'left' ? 0 : 400 - ITEM_SIZE);
        const first = findNode(tree.root, 'atome_contextual_tool_tool_0');
        const second = findNode(tree.root, 'atome_contextual_tool_tool_3');
        assert.deepEqual(first.style.position, [tree.layout.x, tree.layout.bottom - ITEM_SIZE]);
        assert.deepEqual(second.style.position, [tree.layout.x, tree.layout.bottom - (2 * ITEM_SIZE)]);
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
    // Folded away: the case shows neither option nor accent.
    const closed = build('');
    assert.equal(findNode(closed.root, 'atome_contextual_tool_container_play_container_play_stop'), null);
    assert.equal(findNode(closed.root, 'atome_contextual_tool_container_play_palette_accent'), null);
    // Long press on the pinned case: the options fan out from THAT case, not from
    // the level the tool left (its old anchor is gone).
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
    // The same key, lit in the ordinary level: that node IS the painted reference.
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
    // `news_text` and `news_draw` latch the ribbon's own tools: their residence is the
    // ribbon, so the rail must not duplicate them in the pinned zone.
    ['news_text', 'news_draw', 'view', 'mode', 'activity'].forEach((key) => {
        assert.equal(isActiveRailToolKey(key), false, `${key} is not a rail-resident lit tool`);
    });
    assert.equal(isActiveToolId('ui.text.create'), true);
    assert.equal(isActiveToolId('tool.main.draw'), true);
    assert.equal(isActiveToolId('ui.font.panel'), false);
});

test('a ribbon-resident lit tool pulses in its own slot and takes no rail case', () => {
    const items = [
        { id: 'eve_bevy_ui_main_menu_tool_create', key: 'create', toolId: '', entry: { isExpandable: true },
            activeChild: { toolId: 'ui.text.create' } },
        { id: 'eve_bevy_ui_main_menu_tool_fonts', key: 'fonts', toolId: 'ui.font.panel', entry: {} },
        { id: 'eve_bevy_ui_main_menu_tool_draw', key: 'draw', toolId: 'tool.main.draw', entry: {} }
    ];
    const ids = resolveBevyMainMenuLitToolIconIds({
        items,
        latchedByToolId: new Map([['tool.main.draw', true], ['ui.font.panel', true]]),
        isStayLitTool: isActiveToolId
    });
    assert.deepEqual(ids, ['eve_bevy_ui_main_menu_tool_create_icon', 'eve_bevy_ui_main_menu_tool_draw_icon']);
    const rail = buildRail({ activeSlots: [] });
    assert.deepEqual(pinnedIds(rail), []);
});

test('a lit tool pulses in its ribbon slot and a latched panel never does', async () => {
    const content = {
        toolbox: { children: ['create', 'mode'] },
        create: { atome_tool: true, label: 'Creer', icon: 'create', type: 'palette', children: ['text'] },
        text: { atome_tool: true, label: 'Texte', icon: 'edit', tool_id: 'ui.text.create', action: 'toggle' },
        mode: { atome_tool: true, label: 'mode', icon: 'mode', tool_id: 'tool.main.mode', action: 'toggle' }
    };
    const harness = createRuntimeHarness({ content });
    const motions = [];
    harness.dom.window.eveBevyUiRuntime.updateTreeMotion = ({ updates }) => {
        motions.push(updates.map((update) => update.nodeId));
    };
    try {
        await harness.runtime.showFully();
        harness.runtime.setToolLatchedState({ tool_id: 'ui.text.create', latched: true });
        harness.runtime.setToolLatchedState({ tool_id: 'tool.main.mode', latched: true });
        await waitFrame();
        const lit = motions.at(-1) || [];
        assert.deepEqual(lit, ['eve_bevy_ui_main_menu_tool_create_icon'],
            'the slot standing for the locked Text pulses; a latched mode panel never does');
        const settled = motions.length;
        harness.runtime.setToolLatchedState({ tool_id: 'ui.text.create', latched: false });
        await waitFrame();
        assert.equal(motions.length, settled, 'the stopped tool stops pulsing');
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

test('one press on a pinned case stops the lit tool through the rail invocation path', async () => {
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const calls = [];
    try {
        const invocation = createAtomeContextualRailDefinitionInvocationRuntime({
            state: { activeAtomeId: 'shape' },
            ensureDeletePanelModule: async () => null,
            maybeBlockSelectionRequiredToolActivation: () => null,
            handleFinderTouch: async () => ({ ok: true }),
            getFinderToolEl: () => null,
            invokeToolFromUiButton: async () => ({ ok: true }),
            invokeUnifiedContextTool: async (input) => { calls.push(input); return { ok: true }; },
            resolveDefinitionToolId: (definition) => definition?.toolId || '',
            buildToolExtraInput: () => null,
            isContextBoundTransportToolId: () => false
        });
        const lit = { key: 'play', label: 'Stop', icon: 'stop', toolType: 'tool', active: true };
        await invocation.invokeAtomeContextualRailToolDefinitionWithContext(lit, { atomeId: 'shape' });
        assert.equal(calls.at(-1).previousLatched, true, 'the lit case stops its tool');
        await invocation.invokeAtomeContextualRailToolDefinitionWithContext({ ...lit, active: false }, { atomeId: 'shape' });
        assert.equal(calls.at(-1).previousLatched, false, 'the same slot starts the tool again');
    } finally {
        dom.window.close();
        delete globalThis.window;
        delete globalThis.document;
        delete globalThis.HTMLElement;
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
    // A lit MENU-resident tool displays in the ribbon, never as a rail case.
    assert.equal(levelIds(rendered.at(-1)).has('atome_contextual_tool_create'), true);

    lit.play = true;
    await runtime.render();
    await flushPulse();
    let tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), ['atome_contextual_tool_play']);
    assert.equal(levelIds(tree).has('atome_contextual_tool_play'), false, 'the moved tool leaves the level');
    assert.equal(JSON.stringify(findNode(tree.root, 'atome_contextual_tool_play')).includes('Stop'), true);
    assert.deepEqual(motions.at(-1).sort(),
        ['atome_contextual_tool_create_icon', 'atome_contextual_tool_play_icon'],
    'the pinned case pulses, and so does the slot that stands for the armed ribbon tool');
    // One press on the pinned case runs the SAME definition the rail publishes.
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
    assert.deepEqual(motions.at(-1).sort(), ['atome_contextual_tool_create_icon',
        'atome_contextual_tool_play_icon', 'atome_contextual_tool_record_action_icon']);
    assert.equal(levelIds(tree).has('atome_contextual_tool_create'), true, 'the palette keeps its own level place');

    lit.play = false;
    await runtime.render();
    await flushPulse();
    tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), ['atome_contextual_tool_record_action']);
    assert.deepEqual(motions.at(-1).sort(),
        ['atome_contextual_tool_create_icon', 'atome_contextual_tool_record_action_icon'],
        'the stopped case stops pulsing and only the remaining lit tools keep their own');

    lit.record = false;
    lit.create = false;
    await runtime.render();
    await flushPulse();
    tree = rendered.at(-1);
    assert.deepEqual(pinnedIds(tree), [], 'the rail stack returns to its ordinary level');
    assert.equal(levelIds(tree).has('atome_contextual_tool_play'), true);
    assert.equal(levelIds(tree).has('atome_contextual_tool_record_action'), true);
    const motionCount = motions.length;
    await flushPulse();
    assert.equal(motions.length, motionCount, 'nothing lit means no pulse left running');
});
