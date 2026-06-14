import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    buildTextCacheKey,
    buildTextureCacheKey,
    buildWaveformCacheKey,
    normalizeRenderAtom,
    normalizeRenderAtoms
} from '../../eVe/domains/rendering/render_atom.js';
import {
    createCanonicalIntentDispatcher, createRenderScene, createSurfaceEventRouter, hitTestRenderScene
} from '../../eVe/domains/rendering/scene_graph.js';
import {
    ensureRenderSurface,
    getRenderSurfaceState,
    updateRenderSurfaceScene
} from '../../eVe/domains/rendering/surface_runtime.js';
import {
    ensureHiddenTextServiceRoot,
    getTextServiceState,
    mountActiveTextEditor,
    unmountActiveTextEditor
} from '../../eVe/domains/rendering/hidden_text_service_runtime.js';
import { createTextLayoutBridge } from '../../eVe/domains/rendering/text_bridge.js';
import { createRenderTarget, createUnifiedWebGPUCompositor } from '../../eVe/domains/rendering/webgpu_compositor.js';
import {
    makeMixedRecords,
    makeRecord
} from './unified_rendering_test_helpers.mjs';

test('RenderAtom normalization keeps render data disposable and cacheable', () => {
    const text = normalizeRenderAtom(makeRecord('text_a', 'text', 1));
    const image = normalizeRenderAtom(makeRecord('image_a', 'image', 2));
    const video = normalizeRenderAtom(makeRecord('video_a', 'video', 3));
    const audio = normalizeRenderAtom(makeRecord('audio_a', 'audio_recording', 4));
    const svg = normalizeRenderAtom({
        ...makeRecord('svg_a', 'shape', 5),
        properties: {
            ...makeRecord('svg_a', 'shape', 5).properties,
            media_url: '/media/atome.svg',
            mime_type: 'image/svg+xml'
        }
    });

    assert.equal(text.type, 'text');
    assert.equal(image.type, 'image');
    assert.equal(video.type, 'video');
    assert.equal(audio.type, 'audio_waveform');
    assert.equal(svg.type, 'image');
    assert.equal(text.capabilities.editable, true);
    assert.equal(video.capabilities.playable, true);
    const croppedVideo = normalizeRenderAtom({
        ...makeRecord('video_crop', 'video', 6),
        properties: {
            ...makeRecord('video_crop', 'video', 6).properties,
            uvRect: { x: 0.25, y: 0.125, width: 0.5, height: 0.75 },
            cropRect: { x: 160, y: 90, width: 320, height: 180 }
        }
    });
    assert.deepEqual(croppedVideo.content.uvRect, { x: 0.25, y: 0.125, width: 0.5, height: 0.75 });
    assert.deepEqual(croppedVideo.content.sourceRect, { x: 160, y: 90, width: 320, height: 180 });
    assert.match(buildTextCacheKey(text), /^text:eve\.renderatom\.v1:text_a:/);
    assert.match(buildTextureCacheKey(image), /^texture:eve\.renderatom\.v1:image:/);
    assert.match(buildTextureCacheKey(video), /^texture:eve\.renderatom\.v1:video:/);
    assert.match(buildWaveformCacheKey(audio), /^waveform:eve\.renderatom\.v1:/);
});

test('Scene graph hit testing replaces per-Atome DOM routing', () => {
    const atoms = normalizeRenderAtoms([
        makeRecord('low', 'image', 1),
        makeRecord('top', 'video', 20)
    ]);
    atoms[0].bounds = { x: 0, y: 0, width: 100, height: 100 };
    atoms[0].visual.zIndex = 1;
    atoms[1].bounds = { x: 10, y: 10, width: 100, height: 100 };
    atoms[1].visual.zIndex = 2;
    const scene = createRenderScene(atoms);

    assert.equal(hitTestRenderScene(scene, { x: 20, y: 20 })?.id, 'top');
    assert.equal(hitTestRenderScene(scene, { x: 4, y: 4 })?.id, 'low');

    let intent = null;
    const router = createSurfaceEventRouter({
        sceneProvider: () => scene,
        onIntent: (nextIntent) => { intent = nextIntent; return nextIntent; }
    });
    router.handlePointer({ offsetX: 20, offsetY: 20 });
    assert.equal(intent.atome_id, 'top');
});

test('Scene graph dispatcher emits intents and routes real mutations through commit', async () => {
    const commits = [];
    const intents = [];
    const dispatch = createCanonicalIntentDispatcher({
        commit: async (payload) => {
            commits.push(payload);
            return { ok: true };
        },
        onIntent: (intent) => {
            intents.push(intent);
            return intent;
        }
    });

    await dispatch({
        kind: 'set',
        atome_id: 'atom_a',
        commit: true,
        props: { left: 12 }
    });

    assert.equal(intents.length, 1);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].atome_id, 'atom_a');
    assert.deepEqual(commits[0].props, { left: 12 });
});

test('External WebGPU compositor cannot target the active project canvas', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas><canvas id="matrix_surface"></canvas></body></html>');
    const projectCanvas = dom.window.document.getElementById('eve_surface_project');
    const matrixCanvas = dom.window.document.getElementById('matrix_surface');

    assert.throws(
        () => createRenderTarget({ surface: projectCanvas, width: 320, height: 180 }),
        /external_renderer_project_canvas_forbidden/
    );

    const compositor = createUnifiedWebGPUCompositor();
    await assert.rejects(
        () => compositor.renderAtTime({
            target: { surface: projectCanvas, width: 320, height: 180 }
        }),
        /external_renderer_project_canvas_forbidden/
    );

    const matrixTarget = createRenderTarget({ surface: matrixCanvas, width: 320, height: 180 });
    assert.equal(matrixTarget.surface, matrixCanvas);
});

test('Rendering surfaces and text bridge stay bounded', () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main><main id="matrix"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;

    let listenerCount = 0;
    const originalAdd = dom.window.Document.prototype.addEventListener;
    dom.window.Document.prototype.addEventListener = function addEventListener(...args) {
        if (String(args[0] || '').startsWith('pointer')) listenerCount += 1;
        return originalAdd.apply(this, args);
    };

    const projectHost = document.getElementById('project');
    const matrixHost = document.getElementById('matrix');
    const projectSurface = ensureRenderSurface({ zone: 'project', host: projectHost });
    const matrixSurface = ensureRenderSurface({ zone: 'matrix', host: matrixHost });
    const projectSurfaceAgain = ensureRenderSurface({ zone: 'project', host: projectHost });
    const records = makeMixedRecords(100);
    const scene = createRenderScene(normalizeRenderAtoms(records));
    updateRenderSurfaceScene(projectSurface, scene);

    assert.equal(projectSurface, projectSurfaceAgain);
    assert.equal(document.querySelectorAll('canvas.eve-render-surface').length, 2);
    assert.equal(listenerCount, 8);
    assert.equal(getRenderSurfaceState(projectSurface).scene.atoms.length, 100);
    assert.equal(getRenderSurfaceState(projectSurface).listenerCount, 4);

    const rootA = ensureHiddenTextServiceRoot(document);
    const rootB = ensureHiddenTextServiceRoot(document);
    assert.equal(rootA, rootB);
    mountActiveTextEditor({ atomeId: 'text_a', value: 'hello', documentRef: document });
    mountActiveTextEditor({ atomeId: 'text_b', value: 'world', documentRef: document });
    assert.equal(getTextServiceState().hiddenRootCount, 1);
    assert.equal(getTextServiceState().activeEditorCount, 1);
    unmountActiveTextEditor();
    assert.equal(getTextServiceState().activeEditorCount, 0);
});

test('Text bridge keeps one hidden root, commits through canonical mutation, and cancels without mutation', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const commits = [];
    const bridge = createTextLayoutBridge({
        documentRef: dom.window.document,
        commit: async (payload) => {
            commits.push(payload);
            return { ok: true };
        }
    });
    const text = normalizeRenderAtom(makeRecord('text_bridge', 'text', 1));
    text.content.text = 'First line';
    const layout = bridge.measure(text);
    assert.equal(layout.line_count, 1);

    bridge.beginEditing(text);
    const editor = dom.window.document.querySelector('[data-role="active-text-editor"]');
    editor.value = 'Changed text';
    const committed = await bridge.commitEditing();
    assert.equal(committed.committed, true);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].atome_id, 'text_bridge');
    assert.deepEqual(commits[0].props, {
        text: 'Changed text',
        rich_text: { version: 1, spans: [] },
        width: 40,
        height: 30
    });
    assert.equal(bridge.getState().hiddenRootCount, 1);
    assert.equal(bridge.getState().activeEditorCount, 0);

    bridge.beginEditing(text);
    const editorAfterRestart = dom.window.document.querySelector('[data-role="active-text-editor"]');
    editorAfterRestart.value = 'Cancelled text';
    const cancelled = bridge.cancelEditing();
    assert.equal(cancelled.cancelled, true);
    assert.equal(commits.length, 1);
    assert.equal(bridge.getState().activeEditorCount, 0);
});
