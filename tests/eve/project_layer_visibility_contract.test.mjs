import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { syncActiveProjectLayerVisibility } from '../../eVe/intuition/runtime/project_layer_visibility_runtime.js';
import { ensureProjectLayerElement } from '../../eVe/intuition/runtime/project_layer_geometry_runtime.js';

test('Active project load leaves only the current project layer interactive', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="project_view_alpha"></div><div id="project_view_beta"></div><div id="project_view_gamma"></div></body></html>');
    const result = syncActiveProjectLayerVisibility('beta', null, dom.window.document);
    const alpha = dom.window.document.getElementById('project_view_alpha');
    const beta = dom.window.document.getElementById('project_view_beta');
    const gamma = dom.window.document.getElementById('project_view_gamma');

    assert.deepEqual(result, { ok: true, activeId: 'project_view_beta', hidden: 2 });
    assert.equal(beta.style.display, 'block');
    assert.equal(beta.style.pointerEvents, 'auto');
    assert.equal(beta.dataset.activeProjectView, undefined);
    assert.equal(alpha.style.display, 'none');
    assert.equal(alpha.style.pointerEvents, 'none');
    assert.equal(gamma.style.display, 'none');
    assert.equal(gamma.style.pointerEvents, 'none');
});

test('Project layer geometry is centralized and viewport sized', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>');
    const layer = ensureProjectLayerElement({ projectId: 'alpha', documentRef: dom.window.document });

    assert.equal(layer.id, 'project_view_alpha');
    assert.equal(layer.parentElement.id, 'view');
    assert.equal(layer.style.position, 'fixed');
    assert.equal(layer.style.inset, '0px');
    assert.equal(layer.style.width, '100vw');
    assert.equal(layer.style.height, '100vh');
    assert.equal(layer.style.overflow, 'hidden');
});
