import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { clearAllProjectScenes } from '../../eVe/domains/rendering/project_scene_runtime.js';

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
    assert.deepEqual(runtime.hitTestAtClientPoint({ surface, clientX: 40, clientY: 50 }), {
        treeId: 'touch_tree',
        nodeId: 'scroll_target',
        kind: 'scroll_area',
        box: { x: 0, y: 0, width: 120, height: 80 }
    });
    assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 200, clientY: 200 }), null);
    assert.equal(dom.window.document.querySelectorAll('button, input, [data-bevy-ui]').length, 0);
});
