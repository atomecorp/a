import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeSelectableListPresentation } from '../../atome/src/squirrel/components/selectable_list_contract.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { createBevyUiScrollRuntime } from '../../eVe/domains/rendering/bevy_ui_scroll_runtime.js';
import { INTERACTIVE_KINDS, SUPPORTED_KINDS } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import {
    hierarchicalSelectableListNode,
    selectableListGroupNode
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list.js';
import { BEVY_PANEL_TOKENS, resolveListRowTokens } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';

const options = [
    { value: 'first', label: 'List item' },
    { value: 'second', label: 'Second list item' },
    { value: 'unavailable', label: 'Unavailable item', disabled: true }
];

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

test('compact canonical rows keep a fixed thumbnail, editable name and independent Play action on either handedness', () => {
    for (const handedness of ['left', 'right']) {
        const events = [];
        const list = hierarchicalSelectableListNode({ id: 'compact', width: 360, rowHeight: 44, handedness,
            fixedColumns: { unit: 44, presentation: 'thumbnail_name_play', namesExpanded: true },
            entries: [{ id: 'molecule', label: 'A long filename', hasChildren: true,
                visualRecord: { id: 'image', type: 'image', properties: { source: '/image.png' } } }],
            onNameDoubleClick: id => events.push(['rename', id]), onPlayActivate: id => events.push(['play', id]) });
        assert.equal(findNode(list.node, 'compact_entry_0_hierarchy'), null);
        assert.equal(findNode(list.node, 'compact_entry_0').listHierarchy, undefined);
        assert.equal(findNode(list.node, 'compact_entry_0_mute'), null);
        assert.equal(findNode(list.node, 'compact_entry_0_transport_progress'), null);
        assert.deepEqual(findNode(list.node, 'compact_entry_0_preview').style.size, [44, 44]);
        assert.deepEqual(findNode(list.node, 'compact_entry_0_name_scroll').style.position, [44, 0]);
        assert.equal(findNode(list.node, 'compact_entry_0_name_scroll').kind, 'panel');
        assert.deepEqual(findNode(list.node, 'compact_entry_0_play').style.position, [316, 0]);
        findNode(list.node, 'compact_entry_0_name').on.double_click({});
        findNode(list.node, 'compact_entry_0_play').on.activate({});
        assert.deepEqual(events, [['rename', 'molecule'], ['play', 'molecule']]);
    }
});

test('canonical Squirrel selectable-list contract requires a known enabled exclusive value', () => {
    const presentation = normalizeSelectableListPresentation({ options, value: 'second' });

    assert.equal(presentation.value, 'second');
    assert.equal(presentation.selectedIndex, 1);
    assert.throws(() => normalizeSelectableListPresentation({ options: [options[0]], value: 'first' }), /squirrel_selectable_list_options_minimum:2/);
    assert.throws(() => normalizeSelectableListPresentation({ options, value: null }), /squirrel_selectable_list_value_required/);
    assert.throws(() => normalizeSelectableListPresentation({ options, value: 'third' }), /squirrel_select_value_unknown:third/);
    assert.throws(() => normalizeSelectableListPresentation({ options, value: 'unavailable' }), /squirrel_selectable_list_selected_option_disabled:unavailable/);
    assert.throws(() => normalizeSelectableListPresentation({
        options: [options[0], { value: 'first', label: 'Other' }], value: 'first'
    }), /squirrel_select_option_value_duplicate:first/);
});

test('shared selectable-list builder uses native buttons, existing Select states, and no disabled handler', () => {
    const group = selectableListGroupNode({
        id: 'list', options, value: 'second', hoveredValue: 'first', focusedValue: 'first', pressedValue: 'second', on: { activate: () => {} }
    });
    const first = findNode(group, 'list_option_0');
    const second = findNode(group, 'list_option_1');
    const unavailable = findNode(group, 'list_option_2');

    const { optionHeightPx, menuGapPx } = BEVY_PANEL_TOKENS.select;

    assert.deepEqual(group.style.size, [
        BEVY_PANEL_TOKENS.inputWidthPx,
        3 * optionHeightPx + 2 * menuGapPx
    ]);
    [first, second, unavailable].forEach((row) => {
        assert.equal(row.kind, 'button');
        assert.equal(SUPPORTED_KINDS.has(row.kind), true);
        assert.equal(INTERACTIVE_KINDS.has(row.kind), true);
        assert.deepEqual(row.style.size, [BEVY_PANEL_TOKENS.inputWidthPx, optionHeightPx]);
    });
    assert.deepEqual(
        [first, second, unavailable].map((row) => row.style.position),
        [0, 1, 2].map((index) => [0, index * (optionHeightPx + menuGapPx)])
    );
    assert.deepEqual(first.style.background, BEVY_PANEL_TOKENS.controlMaterial.background);
    assert.deepEqual(first.style.shadow, BEVY_PANEL_TOKENS.select.focusShadow);
    assert.deepEqual(second.style.background, BEVY_PANEL_TOKENS.controlMaterial.background);
    assert.ok(findNode(group, 'list_option_1_selected_mark_short'));
    assert.ok(findNode(group, 'list_option_1_selected_mark_long'));
    assert.equal(first.on.activate instanceof Function, true);
    assert.equal(unavailable.on, undefined);
    assert.equal(unavailable.style.opacity, BEVY_PANEL_TOKENS.select.disabledOpacity);
});

test('selectable-list buttons use the canonical pointer press-release-activate lifecycle', () => {
    const emitted = [];
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const target = { treeId: 'selectable_list_tree', nodeId: 'list_option_1', kind: 'button', box: {}, scrollAncestors: [] };
    const runtime = createBevyUiPointerRuntime({
        state: { lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null, hoverTarget: null, pendingTextActivation: null },
        hitTestTrees: () => target,
        localEventForTarget: (_, type) => ({ type }),
        emitUiEvents: (events) => emitted.push(...events),
        scrollRuntime: { begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false }
    });

    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 12, y: 12 }, event: { pointerId: 21 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 12, y: 12 }, event: { pointerId: 21 } });
    assert.deepEqual(emitted.map((event) => event.type), ['press', 'focus', 'release', 'activate']);
});

test('fixed List name keeps standard drag events and reserves rename for double-click', () => {
    const emitted = [];
    const list = hierarchicalSelectableListNode({
        id: 'fixed_list',
        entries: [{ id: 'member', label: 'Member', visualRecord: { properties: {} } }],
        value: 'member', width: 360, rowHeight: 44,
        fixedColumns: { unit: 44, hierarchyWidth: 44, muteWidth: 44, nameWidth: 132 },
        onNameActivate: () => emitted.push('activate'),
        onNameDoubleClick: () => emitted.push('rename'),
        onNamePress: () => emitted.push('press'),
        onNameDrag: () => emitted.push('drag'),
        onNameRelease: () => emitted.push('release'),
        onNameCancel: () => emitted.push('cancel')
    });
    const name = findNode(list.node, 'fixed_list_entry_0_name');
    assert.equal(typeof name.on.press, 'function');
    assert.equal(typeof name.on.drag, 'function');
    assert.equal(typeof name.on.release, 'function');
    assert.equal(typeof name.on.cancel, 'function');
    assert.equal(typeof name.on.double_click, 'function');
    assert.equal(name.on.long_press, undefined);
    name.on.press({}); name.on.drag({}); name.on.release({}); name.on.double_click({});
    assert.deepEqual(emitted, ['press', 'drag', 'release', 'rename']);
});

test('fixed Molecule hierarchy zone starts the same reorder drag as its name', () => {
    const emitted = [];
    const list = hierarchicalSelectableListNode({
        id: 'fixed_molecule_list',
        entries: [{
            id: 'molecule', label: 'Molecule', hasChildren: true,
            expanded: true, visualRecord: { properties: { molecule_entity: 'molecule' } }
        }],
        value: 'molecule', width: 360, rowHeight: 44,
        fixedColumns: { unit: 44, hierarchyWidth: 44, muteWidth: 44, nameWidth: 132 },
        onHierarchyPress: () => emitted.push('press'),
        onHierarchyDrag: () => emitted.push('drag'),
        onHierarchyRelease: () => emitted.push('release'),
        onHierarchyCancel: () => emitted.push('cancel')
    });
    const hierarchy = findNode(list.node, 'fixed_molecule_list_entry_0_hierarchy');
    assert.equal(typeof hierarchy.on.press, 'function');
    assert.equal(typeof hierarchy.on.drag, 'function');
    assert.equal(typeof hierarchy.on.release, 'function');
    assert.equal(typeof hierarchy.on.cancel, 'function');
    hierarchy.on.press({}); hierarchy.on.drag({}); hierarchy.on.release({});
    assert.deepEqual(emitted, ['press', 'drag', 'release']);
});

test('canonical pointer hold hands a row drag ownership only after the delay and keeps scroll available before it', () => {
    const emitted = [];
    const timers = [];
    let scrollDragging = false;
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const target = { treeId: 'info', nodeId: 'row', kind: 'button', box: {}, scrollAncestors: ['scroll'] };
    const state = {
        lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null,
        hoverTarget: null, pendingTextActivation: null,
        handlers: new Map([
            ['info:row:long_press', () => {}],
            ['info:row:drag', () => {}],
            ['info:row:release', () => {}]
        ])
    };
    const runtime = createBevyUiPointerRuntime({
        state,
        hitTestTrees: () => target,
        localEventForTarget: (_, type, point) => ({ type, point }),
        emitUiEvents: (events) => emitted.push(...events),
        scrollRuntime: {
            begin: () => {}, drag: () => scrollDragging,
            end: () => scrollDragging, hover: () => {}, wheel: () => false
        },
        schedule: (callback) => { timers.push({ callback, cancelled: false }); return timers.length; },
        cancelSchedule: (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; }
    });

    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 10, y: 10 }, event: { pointerId: 1 } });
    scrollDragging = true;
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: { x: 10, y: 30 }, event: { pointerId: 1 } });
    assert.equal(timers[0].cancelled, true);
    assert.equal(emitted.some(({ type }) => type === 'long_press'), false);
    assert.equal(emitted.some(({ type }) => type === 'drag'), true);
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 10, y: 30 }, event: { pointerId: 1 } });

    // Moving before the long-press delay cancels rename but must still begin a
    // row drag; otherwise List and Matrix can never reorder ordinary rows.
    scrollDragging = false;
    emitted.length = 0;
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 12, y: 12 }, event: { pointerId: 3 } });
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: { x: 12, y: 32 }, event: { pointerId: 3 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 12, y: 32 }, event: { pointerId: 3 } });
    assert.deepEqual(emitted.map(({ type }) => type), ['press', 'focus', 'drag', 'release']);

    scrollDragging = false;
    emitted.length = 0;
    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 20, y: 20 }, event: { pointerId: 2 } });
    timers.at(-1).callback();
    runtime.routePointerEvent({ canvas, phase: 'pointermove', point: { x: 40, y: 40 }, event: { pointerId: 2 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 40, y: 40 }, event: { pointerId: 2 } });
    assert.deepEqual(emitted.map(({ type }) => type), ['press', 'focus', 'long_press', 'drag', 'release']);
});

test('canonical Bevy scroll owner emits window position metadata for every virtualized panel list', () => {
    const emitted = [];
    const scroll = createBevyUiScrollRuntime({
        refreshTree: async () => null,
        emitTargetEvent: (target, eventName, point, delta) => emitted.push({ target, eventName, point, delta }),
        requestFrame: () => 0
    });
    const scrollNode = {
        id: 'shared_virtual_list', kind: 'scroll_area',
        style: { size: [300, 100], overflow: 'scroll_y' },
        children: [{ id: 'content', kind: 'panel', style: { size: [300, 500] }, children: [] }]
    };
    scroll.applyTree({ tree: { id: 'shared_tree', root: scrollNode }, treeId: 'shared_tree' });
    const consumed = scroll.wheel({
        treeId: 'shared_tree', nodeId: 'content',
        scrollAncestors: [{ node: scrollNode, box: { x: 0, y: 0, width: 300, height: 100 } }]
    }, { deltaY: 75 });
    assert.equal(consumed, true);
    assert.equal(emitted[0].eventName, 'scroll');
    assert.equal(emitted[0].target.nodeId, 'shared_virtual_list');
    assert.equal(emitted[0].delta.offsetY, 75);
    assert.equal(emitted[0].delta.viewportHeight, 100);
    assert.equal(emitted[0].delta.maxY, 400);
});

test('the shared list keeps its historical row unless a panel opts into the doubled density', () => {
    const entries = [{
        value: 'a', label: 'A',
        visualRecord: { atome_id: 'a', type: 'image', properties: { source: '/a.png' } }
    }];
    const standard = hierarchicalSelectableListNode({ id: 'standard', entries, width: 320 });
    const doubled = hierarchicalSelectableListNode({ id: 'doubled', entries, width: 320, rowDensity: 'tall' });

    // La vignette d'aperçu d'une liste qui se glisse par sa miniature est
    // commune aux deux densités : elle est déclarée une fois, pas par gabarit.
    assert.deepEqual(resolveListRowTokens('default'), {
        heightPx: BEVY_PANEL_TOKENS.inputHeightPx,
        thumbnailSizePx: BEVY_PANEL_TOKENS.listRow.thumbnailSizePx,
        thumbnailColumnPx: BEVY_PANEL_TOKENS.listRow.thumbnailColumnPx,
        dragThumbnailSizePx: BEVY_PANEL_TOKENS.listRow.dragThumbnailSizePx,
        dragStackOffsetPx: BEVY_PANEL_TOKENS.listRow.dragStackOffsetPx,
        dragStackMaxPx: BEVY_PANEL_TOKENS.listRow.dragStackMaxPx
    });
    assert.deepEqual(resolveListRowTokens('tall'), {
        ...BEVY_PANEL_TOKENS.listRow.tall,
        dragThumbnailSizePx: BEVY_PANEL_TOKENS.listRow.dragThumbnailSizePx,
        dragStackOffsetPx: BEVY_PANEL_TOKENS.listRow.dragStackOffsetPx,
        dragStackMaxPx: BEVY_PANEL_TOKENS.listRow.dragStackMaxPx
    });
    assert.deepEqual(resolveListRowTokens('unknown'), resolveListRowTokens('default'),
        'an unknown density never invents a second layout');

    const standardRow = findNode(standard.node, 'standard_entry_0');
    const doubledRow = findNode(doubled.node, 'doubled_entry_0');
    assert.equal(standardRow.style.size[1], BEVY_PANEL_TOKENS.inputHeightPx);
    assert.equal(doubledRow.style.size[1], resolveListRowTokens('tall').heightPx);
    assert.equal(doubledRow.style.size[1], standardRow.style.size[1] * 2, 'the doubled density doubles the row');
    assert.deepEqual(findNode(standard.node, 'standard_entry_0_thumbnail').style.size, [
        BEVY_PANEL_TOKENS.listRow.thumbnailSizePx, BEVY_PANEL_TOKENS.listRow.thumbnailSizePx
    ]);
    assert.deepEqual(findNode(doubled.node, 'doubled_entry_0_thumbnail').style.size, [
        resolveListRowTokens('tall').thumbnailSizePx, resolveListRowTokens('tall').thumbnailSizePx
    ]);
});

test('a list whose row is the thing it moves arms the drag on the press instead of the hold', () => {
    const started = [];
    const build = (dragActivation) => hierarchicalSelectableListNode({
        id: `list_${dragActivation}`,
        entries: [{ value: 'a', label: 'A', draggable: true }],
        width: 320,
        dragActivation,
        onDragStart: (value) => started.push(value)
    });
    const held = build('default');
    const pressed = build('press');
    const heldRow = findNode(held.node, 'list_default_entry_0');
    const pressedRow = findNode(pressed.node, 'list_press_entry_0');

    assert.deepEqual(Object.keys(heldRow.on), ['long_press'], 'the historical gesture stays the default');
    assert.deepEqual(Object.keys(pressedRow.on), ['press'], 'a press-activated row drags without a hold');
    assert.deepEqual(Object.keys(findNode(held.node, 'list_default_entry_0_drag').on)[0], 'press',
        'the grip always arms on the press');

    pressedRow.on.press({});
    assert.deepEqual(started, ['a']);
});
