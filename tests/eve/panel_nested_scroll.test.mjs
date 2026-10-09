import { expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyTreeScrollLayout } from '../../eVe/domains/rendering/bevy_ui_scroll_layout.js';
import { createBevyUiScrollRuntime, locateBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_scroll_runtime.js';
import { node } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree_primitives.js';
import { accordionNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_accordion.js';
import { bevyPanelRuntimeState, closeBevyPanelSurface, openBevyPanelSurface, registerBevyPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { panelHierarchyNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_hierarchy.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { BEVY_PANEL_TOKENS as T } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { fixedHierarchyListRowNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list_fixed_row.js';

const nestedTree = (overflow = 'scroll_y') => ({ root: node('outer', 'scroll_area', {
    size: [300, 220], overflow: 'scroll_y'
}, [node('inner', 'scroll_area', { size: [300, 180], overflow }, [
    node('rows', 'column', { size: [300, 900] }, [
        node('header', 'accordion', { position: [0, 800], size: [300, 40] })
    ])]), node('actions', 'panel', { size: [300, 40] })]) });

test.each(['scroll_y', 'hidden', 'clip'])('outer scrolling measures the visible %s viewport, not its hidden contents', overflow => {
    const entries = new Map();
    applyTreeScrollLayout({ tree: nestedTree(overflow), treeId: 'nested', entries });
    expect(entries.get('nested:outer').contentHeight).toBe(220);
    expect(entries.get('nested:outer').maxY).toBe(0);
    expect(entries.get('nested:inner').maxY).toBe(720);
});

test('unclipped descendants still contribute their actual extent', () => {
    const entries = new Map();
    applyTreeScrollLayout({ tree: nestedTree('visible'), treeId: 'nested', entries });
    expect(entries.get('nested:outer').maxY).toBe(680);
});

test.each(['start', 'end'])('revealing a nested header aligns every scroll ancestor to %s without blank overscroll', align => {
    const tree = { root: node('outer', 'scroll_area', { size: [300, 220], overflow: 'scroll_y' }, [
        node('before', 'panel', { size: [300, 200] }),
        nestedTree().root.children[0],
        node('after', 'panel', { size: [300, 200] })
    ]) };
    const events = [];
    const runtime = createBevyUiScrollRuntime({ refreshTree: () => {}, emitTargetEvent: (...args) => events.push(args), requestFrame: () => 1 });
    runtime.applyTree({ tree, treeId: 'reveal' });
    expect(runtime.revealNode({ tree, treeId: 'reveal', nodeId: 'header', align })).toBe(true);
    const painted = runtime.applyTree({ tree, treeId: 'reveal' });
    const header = locateBevyUiNode({ node: painted.root, nodeId: 'header' }).box;
    expect(align === 'end' ? header.y + header.height : header.y).toBe(align === 'end' ? 220 : 0);
    expect(events.some(([target]) => target.nodeId === 'inner')).toBe(true);
    expect(events.some(([target]) => target.nodeId === 'outer')).toBe(true);
    runtime.clearTree('reveal');
});

test.each([['up', false], ['down', false], ['up', true], ['down', true]])('opening a nested %s accordion preserves its anchor with a delayed handler=%s', async (direction, delayed) => {
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>', { url: 'http://localhost' });
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'nested_anchor_project' };
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ width: 900, height: 800, left: 0, top: 0 });
    const projected = [], reveals = [];
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => { projected.push(tree); return tree; },
        updateTree: async ({ tree }) => { projected.push(tree); return tree; },
        unmountTree: async () => {}, revealTreeNode: async options => { reveals.push(options); }
    };
    setMainMenuRuntime({ showFully: async () => true, getReservedHeight: () => 74 }, dom.window);
    bevyPanelRuntimeState.runtime = null;
    let expanded = false, outerExpanded = false, bodyHeight = 200;
    registerBevyPanelSurface({ surfaceKey: 'nested_anchor', title: 'Fixture',
        handleEvent: async intent => {
            if (intent.type === 'outer') { outerExpanded = !outerExpanded; return { ok: true }; }
            if (delayed) { const later = Date.now() + 5000; vi.spyOn(Date, 'now').mockReturnValue(later); }
            expanded = !expanded; return { ok: true };
        },
        buildContent: (_, { bodyWidth, emit }) => {
            const child = accordionNode({ id: 'nested_section', width: bodyWidth, direction, expanded,
            bodyHeight, bodyChildren: [node('content', 'panel', { size: [bodyWidth, bodyHeight] })],
            onActivate: () => emit({ type: 'toggle' }) });
            return [node('inner', 'scroll_area', { size: [bodyWidth, 180], overflow: 'scroll_y' }, [
                accordionNode({ id: 'outer_section', width: bodyWidth, direction, expanded: outerExpanded,
                    bodyHeight: child.style.size[1], bodyChildren: [child], onActivate: () => emit({ type: 'outer' }) })
            ])];
        }
    });
    try {
        await openBevyPanelSurface('nested_anchor');
        locateBevyUiNode({ node: projected.at(-1).root, nodeId: 'outer_section_header' }).node.on.activate();
        await vi.waitFor(() => expect(reveals.at(-1)?.nodeId).toBe('outer_section_header'));
        const before = locateBevyUiNode({ node: projected.at(-1).root, nodeId: 'eve_bevy_panel_nested_anchor_panel' }).box;
        locateBevyUiNode({ node: projected.at(-1).root, nodeId: 'nested_section_header' }).node.on.activate();
        await vi.waitFor(() => expect(reveals.at(-1)?.nodeId).toBe('nested_section_header'));
        const after = locateBevyUiNode({ node: projected.at(-1).root, nodeId: 'eve_bevy_panel_nested_anchor_panel' }).box;
        expect(after.y + after.height).toBe(before.y + before.height);
        expect(after.y + after.height).toBe(726);
        await bevyPanelRuntimeState.mounted.get('nested_anchor').refreshPromise;
        expect(reveals.at(-1)).toMatchObject({ nodeId: 'nested_section_header', align: direction === 'up' ? 'end' : 'start' });
        reveals.length = 0;
        const later = Date.now() + 5000;
        vi.spyOn(Date, 'now').mockReturnValue(later);
        bodyHeight = 450;
        await bevyPanelRuntimeState.mounted.get('nested_anchor').refresh();
        expect(reveals.at(-1)).toMatchObject({ nodeId: 'nested_section_header', align: direction === 'up' ? 'end' : 'start' });
        reveals.length = 0;
        await bevyPanelRuntimeState.mounted.get('nested_anchor').refresh();
        expect(reveals).toEqual([]); // A repaint alone must not undo deliberate user scrolling.
        locateBevyUiNode({ node: projected.at(-1).root, nodeId: 'nested_section_header' }).node.on.activate();
        await vi.waitFor(() => expect(reveals.at(-1)?.nodeId).toBe('outer_section_header'));
        expect(bevyPanelRuntimeState.mounted.get('nested_anchor').pinWindow.nodeId).toBe('outer_section_header');
        locateBevyUiNode({ node: projected.at(-1).root, nodeId: 'outer_section_header' }).node.on.activate();
        await vi.waitFor(() => expect(bevyPanelRuntimeState.mounted.get('nested_anchor').pinWindow).toBeNull());
    } finally {
        await closeBevyPanelSurface('nested_anchor');
        bevyPanelRuntimeState.definitions.delete('nested_anchor');
        setMainMenuRuntime(null, dom.window); bevyPanelRuntimeState.runtime = null;
        dom.window.close(); vi.unstubAllGlobals(); vi.restoreAllMocks();
    }
});

test.each([['left', 'up'], ['right', 'up'], ['left', 'down'], ['right', 'down']])('nested %s hierarchy follows %s scrolling and removes its closed segments', (handedness, direction) => {
    const treeFor = expanded => {
        const accordion = accordionNode({ id: 'nested_card', width: 340, direction, expanded,
            bodyHeight: 500, bodyChildren: [node('card_fields', 'panel', { size: [340, 500] })] });
        return { root: panelHierarchyNode({ id: 'rails', width: 340, handedness, children: [
        node('inner', 'scroll_area', { size: [340, 180], overflow: 'scroll_y', scroll: [0, direction === 'up' ? 500 : 0] }, [
            node('rows', 'column', { size: accordion.style.size }, [accordion])
        ])
    ] }) }; };
    const tree = treeFor(true);
    const runtime = createBevyUiScrollRuntime({ refreshTree: () => {}, emitTargetEvent: () => {}, requestFrame: () => 1 });
    const check = painted => {
        const header = locateBevyUiNode({ node: painted.root, nodeId: 'nested_card_header' });
        const cap = locateBevyUiNode({ node: painted.root, nodeId: `nested_card_return_${direction === 'up' ? 'end' : 'start'}` });
        expect(cap.box.y + cap.box.height / 2).toBe(header.box.y + header.box.height / 2);
        expect(cap.scrollAncestors.map(({ node }) => node.id)).toContain('inner');
        const record = projectBevyUiTreeRecords({ tree: painted, treeId: 'rails', workspaceLayer: 'panel' }).find(record => record.id.endsWith(cap.node.id));
        if (cap.box.y + cap.box.height <= 0 || cap.box.y >= 180) expect(record).toBeUndefined();
        else {
            expect(record.properties.clip.y).toBe(0);
            expect(record.properties.clip.height).toBe(180);
        }
    };
    let painted = runtime.applyTree({ tree, treeId: 'rails' });
    check(painted);
    const decorated = panelHierarchyNode({ id: 'enclosing', width: 340, handedness, children: [tree.root] });
    const ids = []; const visit = current => { ids.push(current.id); (current.children || []).forEach(visit); };
    visit(decorated);
    expect(new Set(ids).size).toBe(ids.length);
    for (let cycle = 0; cycle < 3; cycle++) {
        const closed = runtime.applyTree({ tree: treeFor(false), treeId: 'rails' });
        expect(locateBevyUiNode({ node: closed.root, nodeId: 'nested_card_return_start' })).toBeNull();
        expect(locateBevyUiNode({ node: closed.root, nodeId: 'nested_card_return_end' })).toBeNull();
        runtime.applyTree({ tree: treeFor(true), treeId: 'rails' });
    }
    const inner = locateBevyUiNode({ node: painted.root, nodeId: 'inner' });
    runtime.wheel({ treeId: 'rails', scrollAncestors: [{ node: inner.node, box: inner.box }] }, { delta_y: direction === 'up' ? -50 : 50 });
    painted = runtime.applyTree({ tree, treeId: 'rails' });
    check(painted);
    runtime.clearTree('rails');
});

test.each([['left', 'up'], ['right', 'up'], ['left', 'down'], ['right', 'down']])('%s %s hierarchy caps lie at the centre of the actual inter-row gap', (handedness, direction) => {
    const row = node('parent_row', 'panel', { size: [340, 60] }, [], { listHierarchy: {
        expanded: true, levelOffset: 1, direction, startOffset: -128, endOffset: 188, edgeGapPx: 8
    } });
    const painted = panelHierarchyNode({ id: 'seams', width: 340, handedness, children: [row] });
    const cap = locateBevyUiNode({ node: painted, nodeId: `parent_row_return_${direction === 'up' ? 'start' : 'end'}` });
    expect(cap.box.y + cap.box.height / 2).toBe(direction === 'up' ? -132 : 192);
    const accordion = accordionNode({ id: 'body_seam', width: 340, expanded: true, direction,
        bodyHeight: 124, bodyChildren: [node('body_cells', 'column', { size: [340, 124], gap: 4 }, [
            node('first_cell', 'panel', { size: [340, 60], radius: 3 }), node('last_cell', 'panel', { size: [340, 60], radius: 3 })
        ])] });
    const tree = panelHierarchyNode({ id: 'accordion_seams', width: 340, handedness, children: [accordion] });
    const limit = locateBevyUiNode({ node: tree, nodeId: `body_seam_return_${direction === 'up' ? 'start' : 'end'}` });
    const cell = locateBevyUiNode({ node: tree, nodeId: direction === 'up' ? 'first_cell' : 'last_cell' });
    expect(limit.box.y + limit.box.height / 2).toBe(direction === 'up' ? cell.box.y - 2 : cell.box.y + cell.box.height + 2);
});

test.each([T.inputHeightPx, T.inputHeightPx * 2, T.inputHeightPx * 4])('row tools remain inside the %s px row even with a wider canonical column', rowHeight => {
    for (const presentation of ['thumbnail_name_play', 'timeline']) {
        const row = fixedHierarchyListRowNode({ rowId: 'bounded', width: 720, rowHeight, y: 0,
            entry: { hasChildren: true }, columns: { presentation, unit: T.inputHeightPx * 4, muteWidth: 0 } });
        const control = locateBevyUiNode({ node: row, nodeId: presentation === 'thumbnail_name_play' ? 'bounded_play' : 'bounded_hierarchy_chevron' });
        expect(control.box.y).toBeGreaterThanOrEqual(0);
        expect(control.box.y + control.box.height).toBeLessThanOrEqual(rowHeight);
    }
});
