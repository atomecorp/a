import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';

const tree = (label) => ({
    id: 'menu_tree',
    root: {
        id: 'menu_root',
        kind: 'root',
        style: { size: [200, 100] },
        children: [{
            id: 'menu_label',
            kind: 'text',
            text: { text: label },
            style: { position: [0, 0], size: [100, 40] }
        }]
    }
});

test('a suspended BevyUI tree stays invisible when a late owner update rerenders it', async () => {
    const dom = new JSDOM('<!doctype html><canvas id="surface"></canvas>');
    const surface = dom.window.document.getElementById('surface');
    const projections = [];
    const nativeOps = [];
    const runtime = createEveBevyUiRuntime({
        nativeUiEnabled: true,
        requestFrame: () => 0,
        moduleProvider: async () => ({
            apply_atome_bevy_ui_ops: (ops) => nativeOps.push(...ops),
            drain_atome_bevy_ui_events: () => []
        }),
        overlayProjector: {
            clear: async () => null,
            project: async ({ opacity }) => {
                projections.push(opacity);
                return ['menu_record'];
            }
        }
    });

    await runtime.mountTree({ id: 'menu_tree', surface, tree: tree('initial') });
    await runtime.setTreeSuspended({ id: 'menu_tree', suspended: true });
    await runtime.updateTree({ id: 'menu_tree', surface, tree: tree('late update') });

    const diagnostics = runtime.readOverlayDiagnostics().trees[0];
    assert.equal(diagnostics.suspended, true);
    assert.equal(diagnostics.opacity, 0);
    assert.deepEqual(projections, [1, 0]);
    assert.deepEqual(nativeOps.at(-1), {
        type: 'set_subtree_opacity', id: 'menu_tree', opacity: 0
    });
});
