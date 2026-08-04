import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { layoutForNodeCached, nodeBox } from '../../eVe/domains/rendering/bevy_ui_layout_runtime.js';
import { projectBevyUiTreeOverlay } from '../../eVe/domains/rendering/bevy_ui_project_overlay_runtime.js';
import { buildBevyPanelTree } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import {
    calendarRuntimeState,
    calendarSurface
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js';
import {
    clearAllProjectScenes,
    getProjectSceneState,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { createTestCompositor, installDom } from './unified_rendering_test_helpers.mjs';

const createSurface = () => {
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    return dom.window.document.getElementById('eve_surface_project');
};

const waitFor = async (predicate) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error('overlay_reconciliation_probe_timeout');
};

test('BevyUI overlay remount reconciles from an exact empty baseline after a projection failure', async () => {
    const surface = createSurface();
    let rect = { width: 240, height: 240 };
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: rect.width, bottom: rect.height, ...rect });
    const frames = [];
    const projectionCalls = [];
    let failProjection = false;
    const idsForWidth = (width) => [
        `menu_rect_${width}`,
        `menu_icon_image_${width}`,
        `menu_label_text_${width}`
    ];
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => ({ width: 1, height: 1, rgba: [255, 255, 255, 255] }),
        requestFrame: (callback) => {
            frames.push(callback);
            return frames.length;
        },
        overlayProjector: {
            clear: async (ids) => {
                projectionCalls.push({ type: 'clear', ids: [...ids] });
            },
            project: async ({ tree, previousIds }) => {
                projectionCalls.push({ type: 'project', previousIds: [...previousIds], width: tree.root.style.size[0] });
                if (failProjection) {
                    failProjection = false;
                    throw new Error('probe_overlay_batch_failed:menu_icon_image');
                }
                return idsForWidth(tree.root.style.size[0]);
            }
        }
    });
    const tree = () => ({
        id: 'overlay_root',
        root: {
            id: 'overlay_root_node',
            kind: 'root',
            style: { size: [rect.width, rect.height] },
            children: [{
                id: 'home_icon',
                kind: 'image',
                image: { source: './assets/images/icons/home.svg' },
                style: { position: [10, 10], size: [24, 24] }
            }]
        }
    });

    await runtime.mountTree({ id: 'ui_tree', surface, tree: tree() });
    frames.length = 0;
    assert.deepEqual(runtime.state.overlayRecordIds.get('ui_tree'), idsForWidth(240));

    rect = { width: 320, height: 240 };
    failProjection = true;
    await runtime.updateTree({ id: 'ui_tree', surface, tree: tree() });
    assert.deepEqual(runtime.state.overlayRecordIds.get('ui_tree'), []);
    assert.equal(runtime.state.overlaySignatures.has('ui_tree'), false);
    assert.equal(runtime.state.lastOverlayError, 'probe_overlay_batch_failed:menu_icon_image');
    assert.equal(frames.length, 1);

    frames.shift()();
    await waitFor(() => runtime.state.overlayRecordIds.get('ui_tree')?.[0] === 'menu_rect_320');
    const retry = projectionCalls.filter((call) => call.type === 'project').at(-1);
    assert.deepEqual(retry.previousIds, []);
    assert.deepEqual(runtime.state.overlayRecordIds.get('ui_tree'), idsForWidth(320));
    assert.equal(runtime.state.lastOverlayError, null);
});

test('Bevy panel overlay reconciliation removes stale Contact records without relying on a prior id list', async () => {
    clearAllProjectScenes();
    const dom = installDom('<!doctype html><html><body><main id="project"></main></body></html>');
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [],
        host,
        compositor: createTestCompositor()
    });
    const loadingTree = {
        id: 'eve_bevy_panel_contact',
        root: {
            id: 'contact_root', kind: 'root', style: { size: [420, 620] },
            children: [{
                id: 'contact_loading', kind: 'text', text: 'Loading contacts',
                style: { position: [10, 10], size: [300, 28] }
            }]
        }
    };
    const loadedTree = {
        id: 'eve_bevy_panel_contact',
        root: {
            id: 'contact_root', kind: 'root', style: { size: [420, 620] },
            children: [{
                id: 'contact_list', kind: 'text', text: 'Anonymous',
                style: { position: [10, 10], size: [300, 28] }
            }]
        }
    };

    await projectBevyUiTreeOverlay({ tree: loadingTree, documentRef: dom.window.document, previousIds: [] });
    await projectBevyUiTreeOverlay({ tree: loadedTree, documentRef: dom.window.document, previousIds: [] });

    const records = getProjectSceneState('__eve_dashboard_workspace__').records;
    assert.equal(records.some((record) => record.id.endsWith('_contact_loading_text')), false);
    assert.equal(records.some((record) => record.id.endsWith('_contact_list_text')), true);
});

test('Calendar deep scroll keeps late-hour grid records mounted through the real BevyUI refresh path', async () => {
    clearAllProjectScenes();
    const dom = installDom('<!doctype html><html><body><main id="project"><canvas id="eve_surface_project"></canvas></main></body></html>');
    const host = dom.window.document.getElementById('project');
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 });
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__', records: [], host, compositor: createTestCompositor()
    });
    Object.assign(calendarRuntimeState, {
        view: 'day', anchor: new Date(2026, 7, 3, 12), events: [], sources: [], sourceId: '',
        editorMode: 'new', quickDraft: true, selectedEventId: '__calendar_quick_draft__',
        draft: {
            id: '', title: '', description: '', location: '',
            start: '2026-08-03T09:00', end: '2026-08-03T10:00', timezone: 'Europe/Paris',
            kind: 'event', status: 'open', allDay: false, alarms: '[]', recurrence: 'null',
            source_id: '', calendarId: 'default', shareTarget: ''
        }
    });
    const bodyWidth = 948;
    const panelTree = buildBevyPanelTree({
        id: 'eve_bevy_panel_calendar',
        title: 'Calendar',
        geometry: { x: 120, y: 70, width: 980, height: 650 },
        surfaceSize: { width: 1200, height: 800 },
        bodyChildren: calendarSurface.buildContent(calendarSurface.readState(), { bodyWidth, emit: () => {} })
    });
    const frames = [];
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => ({ width: 1, height: 1, rgba: [255, 255, 255, 255] }),
        requestFrame: (callback) => { frames.push(callback); return frames.length; },
        cancelFrame: () => {}
    });
    await runtime.mountTree({ id: panelTree.id, surface, tree: panelTree });
    for (let index = 0; index < 10; index += 1) {
        surface.dispatchEvent(new dom.window.WheelEvent('wheel', {
            bubbles: true, cancelable: true, clientX: 500, clientY: 300, deltaY: 180
        }));
    }
    while (frames.length) {
        const callbacks = frames.splice(0);
        callbacks.forEach((callback) => callback(16));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const findSourceNode = (node, id) => {
        if (!node || node.id === id) return node || null;
        for (const child of node.children || []) {
            const found = findSourceNode(child, id);
            if (found) return found;
        }
        return null;
    };
    const sourceBody = findSourceNode(
        runtime.state.sourceTrees.get(panelTree.id)?.tree?.root,
        'eve_bevy_panel_calendar_body'
    );
    const projectedBody = findSourceNode(
        runtime.state.trees.get(panelTree.id)?.tree?.root,
        'eve_bevy_panel_calendar_body'
    );
    const locateBox = (node, nodeId, parentBox = null, forcedBox = null) => {
        if (!node) return null;
        const box = nodeBox(node, parentBox, forcedBox);
        if (node.id === nodeId) return box;
        const layout = layoutForNodeCached(node, box);
        for (let index = 0; index < (node.children || []).length; index += 1) {
            const found = locateBox(node.children[index], nodeId, box, layout.childBoxes[index]);
            if (found) return found;
        }
        return null;
    };
    const projectedRoot = runtime.state.trees.get(panelTree.id)?.tree?.root;
    const hour23Box = locateBox(projectedRoot, 'calendar_hour_23');
    const bodyBox = locateBox(projectedRoot, 'eve_bevy_panel_calendar_body');
    const recordsAtBottom = getProjectSceneState('__eve_dashboard_workspace__').records;
    const bottomCalendarIds = recordsAtBottom
        .map((record) => record.id)
        .filter((id) => id.includes('calendar'));
    assert.equal(
        recordsAtBottom.some((record) => record.id.includes('calendar_hour_23')),
        true,
        `deep Calendar projection lost hour 23 at offset ${projectedBody?.style?.scroll?.[1]}, body ${JSON.stringify(bodyBox)}, hour ${JSON.stringify(hour23Box)}: ${bottomCalendarIds.slice(-24).join(',')}`
    );
    assert.equal(recordsAtBottom.some((record) => record.id.includes('calendar_day_line_1')), true);
    assert.ok(recordsAtBottom.filter((record) => record.id.includes('eve_bevy_panel_calendar')).length > 10);
    assert.equal(sourceBody.style.scroll?.[1] || 0, 0, 'the retained source tree must remain unscrolled canonical input');
    await runtime.setTreeOpacity({ id: panelTree.id, opacity: 0.65 });
    const recordsAfterOpacity = getProjectSceneState('__eve_dashboard_workspace__').records;
    assert.equal(recordsAfterOpacity.some((record) => record.id.includes('calendar_hour_23')), true, 'style refresh keeps the current deep-scroll projection');

    assert.equal(runtime.revealTreeNode({ id: panelTree.id, nodeId: 'calendar_range_navigation', marginPx: 0 }), true);
    while (frames.length) {
        const callbacks = frames.splice(0);
        callbacks.forEach((callback) => callback(32));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const recordsAtTop = getProjectSceneState('__eve_dashboard_workspace__').records;
    assert.equal(recordsAtTop.some((record) => record.id.includes('calendar_today')), true);
    assert.equal(recordsAtTop.some((record) => record.id.includes('calendar_hour_0')), true);
    await runtime.unmountTree(panelTree.id);
});

test('Calendar empty geometry receives real double-clicks in month, week, and day views', async () => {
    clearAllProjectScenes();
    const dom = installDom('<!doctype html><html><body><main id="project"><canvas id="eve_surface_project"></canvas></main></body></html>');
    const host = dom.window.document.getElementById('project');
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 });
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__', records: [], host, compositor: createTestCompositor()
    });
    Object.assign(calendarRuntimeState, {
        anchor: new Date(2026, 7, 3, 12), events: [], sources: [], sourceId: '',
        editorMode: 'none', quickDraft: false, selectedEventId: '', draft: {}
    });
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => ({ width: 1, height: 1, rgba: [255, 255, 255, 255] })
    });
    const pointForNode = (nodeId) => {
        for (let y = 70; y < 720; y += 4) {
            for (let x = 200; x < 1100; x += 4) {
                const hit = runtime.hitTestAtClientPoint({ surface, clientX: x, clientY: y });
                if (hit?.nodeId === nodeId) return { x, y };
            }
        }
        return null;
    };
    let mounted = false;
    for (const view of ['month', 'week', 'day']) {
        calendarRuntimeState.view = view;
        const emitted = [];
        const tree = buildBevyPanelTree({
            id: 'eve_bevy_panel_calendar',
            title: 'Calendar',
            geometry: { x: 120, y: 70, width: 980, height: 650 },
            surfaceSize: { width: 1200, height: 800 },
            bodyChildren: calendarSurface.buildContent(calendarSurface.readState(), {
                bodyWidth: 948,
                emit: (intent) => emitted.push(intent)
            })
        });
        if (mounted) await runtime.updateTree({ id: tree.id, surface, tree });
        else {
            await runtime.mountTree({ id: tree.id, surface, tree });
            mounted = true;
        }
        const targetId = view === 'month' ? 'calendar_month_day_10' : 'calendar_time_grid';
        const point = pointForNode(targetId);
        assert.ok(point, `${view} empty geometry is reachable through the mounted Bevy hit-test`);
        surface.dispatchEvent(new dom.window.MouseEvent('dblclick', {
            bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, detail: 2
        }));
        assert.equal(emitted.at(-1)?.type, 'calendar.quick_create', `${view} real double-click emits quick-create`);
    }
    await runtime.unmountTree('eve_bevy_panel_calendar');
});
