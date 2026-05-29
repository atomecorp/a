import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const previewSource = await readFile(new URL('../../eVe/intuition/matrix/core/preview.js', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../../eVe/intuition/matrix/ui/view.js', import.meta.url), 'utf8');
const interactionSource = await readFile(new URL('../../eVe/intuition/matrix/ui/matrix_interaction_runtime.js', import.meta.url), 'utf8');

test('matrix preview active path does not use DOM capture mechanisms', () => {
    [
        'html2canvas',
        'foreignObject',
        'cloneNode',
        'queryAtomeElements',
        'captureSymbolicPreview',
        'captureHtml2CanvasPreview',
        'captureForeignObjectPreview'
    ].forEach((forbidden) => {
        assert.equal(previewSource.includes(forbidden), false, `${forbidden} must stay out of matrix preview`);
    });
    assert.equal(previewSource.includes('createMatrixPreviewRenderer'), true);
    assert.equal(previewSource.includes('getProjectSceneState'), true);
    assert.equal(previewSource.includes('window.eveMatrixPreview'), true);
});

test('matrix tile view does not attach per-tile interaction listeners', () => {
    assert.equal(viewSource.includes('registerPressGesture'), false);
    assert.equal(viewSource.includes('.addEventListener('), false);
    assert.equal(viewSource.includes('bindMatrixTileInteractions(scroll'), true);
});

test('matrix interactions route through one scene hit-test runtime', () => {
    assert.equal(interactionSource.includes('hitTestRenderScene'), true);
    assert.equal(interactionSource.includes('createRenderScene'), true);
    assert.equal(interactionSource.match(/registerPressGesture/g)?.length, 2);
    assert.equal(interactionSource.includes('activeLabelEditor'), true);
});
