import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { projectBevyUiTreeOverlay } from '../../eVe/domains/rendering/bevy_ui_project_overlay_runtime.js';
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
