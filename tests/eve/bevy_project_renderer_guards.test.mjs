import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import {
    assertExternalRendererHostAllowed,
    assertExternalRendererTargetAllowed
} from '../../eVe/domains/rendering/webgpu_compositor.js';
import {
    applyBevyWebRendererDiffs,
    startBevyWebRenderer
} from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';
import { createBrowserBevyMediaTextureResolver } from '../../eVe/domains/rendering/bevy_media_texture_resolver.js';
import { VIRTUAL_SCENE_DIFF_TYPES } from '../../eVe/domains/rendering/virtual_scene_contract.js';

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const readSource = (relativePath) => readFileSync(join(repoRoot, relativePath), 'utf8');

const jsFilesUnder = (relativePath) => {
    const root = join(repoRoot, relativePath);
    const results = [];
    const visit = (entryPath) => {
        const info = statSync(entryPath);
        if (info.isDirectory()) {
            readdirSync(entryPath).forEach((child) => visit(join(entryPath, child)));
            return;
        }
        if (/\.(?:m?js)$/i.test(entryPath)) results.push(entryPath);
    };
    visit(root);
    return results;
};

const sourceSlice = (source, startPattern, endPattern) => {
    const start = source.search(startPattern);
    assert.notEqual(start, -1);
    const tail = source.slice(start);
    const end = tail.search(endPattern);
    assert.notEqual(end, -1);
    return tail.slice(0, end);
};

test('Bevy project renderer guards lock canvas ownership, drag, and video playback routes', () => {
    const projectionRuntime = readSource('eVe/domains/rendering/project_scene_bevy_projection_runtime.js');
    assert.doesNotMatch(projectionRuntime, /renderProjectSceneExternalVideo/);
    assert.doesNotMatch(projectionRuntime, /webgpu_external_video_renderer/);

    const externalCompositor = readSource('eVe/domains/rendering/webgpu_compositor.js');
    assert.match(externalCompositor, /external_renderer_project_canvas_forbidden/);
    assert.match(externalCompositor, /external_renderer_project_host_forbidden/);
    assert.match(externalCompositor, /eve_surface_project/);

    const mtraxRendererRuntime = readSource('eVe/intuition/tools/core/mtrax_renderer_runtime.js');
    assert.match(mtraxRendererRuntime, /assertExternalRendererHostAllowed/);

    const selectedPlayback = readSource('eVe/domains/media/selected_project_media_playback_runtime.js');
    assert.doesNotMatch(selectedPlayback, /setBevyVideoDecodePlayback/);
    assert.doesNotMatch(selectedPlayback, /updateProjectSceneRecordByAtomeId/);
    assert.doesNotMatch(selectedPlayback, /media_playback_active|mediaPlaybackActive/);
    assert.match(selectedPlayback, /selected_project_video_timeline_required/);

    const decodeRuntime = readSource('eVe/domains/rendering/bevy_video_decode_source_runtime.js');
    const syncBody = sourceSlice(
        decodeRuntime,
        /export const syncBevyVideoDecodeSources/,
        /export const setBevyVideoDecodePlayback/
    );
    assert.match(decodeRuntime, /__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__/);
    assert.match(decodeRuntime, /frameVersion/);
    assert.doesNotMatch(syncBody, /video\.play\s*\(/);
    assert.doesNotMatch(syncBody, /setSourcePlayback\s*\(/);

    const timelineRuntime = readSource('eVe/domains/mtrax/project/project_playback_timeline_runtime.js');
    assert.match(timelineRuntime, /setVideoDecodePlayback/);
    assert.match(timelineRuntime, /syncVideoDecodePlayback/);

    const setBevyCallers = jsFilesUnder('eVe')
        .filter((file) => /setBevyVideoDecodePlayback/.test(readFileSync(file, 'utf8')))
        .map((file) => file.slice(repoRoot.length + 1).replaceAll('\\', '/'))
        .filter((file) => file !== 'eVe/domains/rendering/bevy_video_decode_source_runtime.js');
    assert.deepEqual(setBevyCallers, ['eVe/domains/mtrax/project/project_playback_automation_bundle_runtime.js']);

    const webRenderer = readSource('eVe/domains/rendering/bevy_web_renderer_runtime.js');
    const mediaResourceRuntime = readSource('eVe/domains/rendering/bevy_media_resource_runtime.js');
    const presentationRuntime = readSource('eVe/domains/rendering/bevy_web_presentation_runtime.js');
    const wasmDiagnosticsRuntime = readSource('eVe/domains/rendering/bevy_wasm_diagnostics_runtime.js');
    assert.match(webRenderer, /opsAreTransformOnly/);
    assert.match(webRenderer, /opsNeedMediaSourceSync/);
    assert.match(webRenderer, /opsNeedPresentationRedrawPrime/);
    assert.match(webRenderer, /createBevyMediaResourceRuntime/);
    assert.match(webRenderer, /attachBevyWasmDiagnosticsReaders/);
    assert.match(mediaResourceRuntime, /createBrowserBevyMediaTextureResolver/);
    assert.match(mediaResourceRuntime, /resumeDeferredTextureQueue/);
    assert.match(presentationRuntime, /requestBevyPresentationRedraw/);
    assert.match(presentationRuntime, /notify_atome_bevy_video_frame/);
    assert.match(presentationRuntime, /installBevyWebGpuContextDiagnostics/);
    assert.match(presentationRuntime, /bevy\.webgpu\.context\./);
    assert.match(wasmDiagnosticsRuntime, /readVideoBackendCapabilities/);
    assert.match(wasmDiagnosticsRuntime, /readVideoCopyDiagnostics/);
    assert.match(wasmDiagnosticsRuntime, /resetVideoCopyDiagnostics/);
    assert.match(webRenderer, /VIRTUAL_SCENE_DIFF_TYPES\.updateTransform/);
    assert.match(webRenderer, /VIRTUAL_SCENE_DIFF_TYPES\.updateResource/);
    const applyDiffsBody = sourceSlice(
        webRenderer,
        /export const applyBevyWebRendererDiffs/,
        /;\s*$/
    );
    assert.match(applyDiffsBody, /opsNeedMediaSourceSync\(ops\)/);
    assert.match(applyDiffsBody, /!opsNeedPresentationRedrawPrime\(ops\)/);
    assert.doesNotMatch(applyDiffsBody, /if\s*\(\s*virtualScene\s*\)\s*\{\s*syncBevyVideoDecodeSources/);
    const videoResourceBody = sourceSlice(
        mediaResourceRuntime,
        /const mapVideoResourceOp/,
        /export const createBevyMediaResourceRuntime/
    );
    assert.doesNotMatch(videoResourceBody, /withResolvedMediaTexture|resolver/);
    const resourceBody = sourceSlice(
        mediaResourceRuntime,
        /const mapResourceOp/,
        /const mapTextTexturePatch/
    );
    assert.match(resourceBody, /if\s*\(\s*isVideoNode\(op\.node\)\s*\)\s*return\s+mapVideoResourceOp\(op\)/);

    const rustFrameCopy = readSource('atome/renderers/bevy-core/src/video_texture.rs');
    assert.match(rustFrameCopy, /AtomeVideoFrameCopies/);
    assert.match(rustFrameCopy, /hidden_video_frame_version_for_id/);
    assert.match(rustFrameCopy, /copy_external_image_to_texture/);

    const webRendererExports = readSource('platforms/web/bevy-renderer/src/exports.rs');
    const webRendererLock = readSource('platforms/web/bevy-renderer/Cargo.lock');
    const webRendererLib = readSource('platforms/web/bevy-renderer/src/lib.rs');
    const videoDiagnostics = readSource('atome/renderers/bevy-core/src/video_diagnostics.rs');
    const generatedBevyWasm = readSource('atome/src/wasm/squirrel_bevy_renderer.js');
    const generatedBevyTypes = readSource('atome/src/wasm/squirrel_bevy_renderer.d.ts');
    const generatedBevyWasmTypes = readSource('atome/src/wasm/squirrel_bevy_renderer_bg.wasm.d.ts');
    const bevyTypes = readSource('atome/renderers/bevy-core/src/types.rs');
    assert.match(webRendererLock, /name = "wgpu"\nversion = "27\.0\.1"/);
    assert.match(webRendererExports, /read_atome_bevy_video_backend_capabilities/);
    assert.match(webRendererExports, /read_atome_bevy_video_copy_diagnostics/);
    assert.match(webRendererExports, /reset_atome_bevy_video_copy_diagnostics/);
    assert.match(videoDiagnostics, /skip_frame_already_copied/);
    assert.match(videoDiagnostics, /record_video_copy_success/);
    assert.match(webRendererLib, /schema:\s*"atome\.bevy\.web\.video_backend\.v4"/);
    assert.match(webRendererLib, /target_live_video_backend:\s*"gpu_external_texture_texture_external"/);
    assert.match(webRendererLib, /live_video_backend:\s*"copy_external_image_to_texture"/);
    assert.match(webRendererLib, /current_backend_final:\s*false/);
    assert.match(webRendererLib, /video_track_api_exposed:\s*false/);
    assert.match(webRendererLib, /backend_blocker:\s*"wgpu_web_external_texture_source_and_resource_binding_unimplemented"/);
    assert.match(webRendererLib, /browser_gpu_device_import_external_texture_available:\s*true/);
    assert.match(webRendererLib, /wgpu_web_external_texture_create:\s*false/);
    assert.match(webRendererLib, /wgpu_external_texture_source_descriptor:\s*false/);
    assert.match(webRendererLib, /wgpu_external_texture_bind_group_layout:\s*true/);
    assert.match(webRendererLib, /wgpu_external_texture_bind_group_resource:\s*false/);
    assert.match(webRendererLib, /gpu_external_texture_import:\s*false/);
    assert.match(webRendererLib, /texture_external_sampling:\s*false/);
    assert.match(webRendererLib, /rgba_live_payload:\s*false/);
    assert.match(webRendererLib, /visible_dom_video_overlay:\s*false/);
    assert.match(generatedBevyWasm, /export function read_atome_bevy_video_backend_capabilities/);
    assert.match(generatedBevyWasm, /export function read_atome_bevy_video_copy_diagnostics/);
    assert.match(generatedBevyWasm, /export function reset_atome_bevy_video_copy_diagnostics/);
    assert.match(generatedBevyTypes, /read_atome_bevy_video_backend_capabilities\(\): any/);
    assert.match(generatedBevyTypes, /read_atome_bevy_video_copy_diagnostics\(\): any/);
    assert.match(generatedBevyTypes, /reset_atome_bevy_video_copy_diagnostics\(\): any/);
    assert.match(generatedBevyWasmTypes, /read_atome_bevy_video_backend_capabilities/);
    assert.match(generatedBevyWasmTypes, /read_atome_bevy_video_copy_diagnostics/);
    assert.match(generatedBevyWasmTypes, /reset_atome_bevy_video_copy_diagnostics/);
    assert.doesNotMatch(generatedBevyWasm, /apply_atome_bevy_video_track/);
    assert.doesNotMatch(generatedBevyTypes, /AtomeVideoTrack|apply_atome_bevy_video_track/);
    assert.doesNotMatch(webRendererExports, /apply_atome_bevy_video_track/);
    assert.doesNotMatch(webRendererExports, /remove_atome_bevy_video_track/);
    assert.doesNotMatch(webRendererExports, /update_atome_bevy_video_transform/);
    assert.doesNotMatch(bevyTypes, /AtomeVideoTrack/);
});

test('external renderers are forbidden from targeting the Bevy project canvas or host', () => {
    const projectCanvas = {
        tagName: 'canvas',
        id: 'eve_surface_project'
    };
    assert.throws(
        () => assertExternalRendererTargetAllowed(projectCanvas),
        /external_renderer_project_canvas_forbidden/
    );
    assert.throws(
        () => assertExternalRendererHostAllowed(projectCanvas),
        /external_renderer_project_canvas_forbidden/
    );
    assert.throws(
        () => assertExternalRendererHostAllowed({
            querySelector: (selector) => (selector === 'canvas#eve_surface_project' ? projectCanvas : null)
        }),
        /external_renderer_project_host_forbidden/
    );
    assert.doesNotThrow(() => assertExternalRendererHostAllowed({
        tagName: 'section',
        id: 'molecule_preview',
        querySelector: () => null
    }));
});

test('transform-only Bevy diffs request one redraw without delayed redraw primes', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const canvas = dom.window.document.getElementById('eve_surface_project');
    const calls = [];
    const wasmModule = {
        default: async () => {},
        run_atome_bevy_renderer: () => calls.push({ type: 'run' }),
        apply_atome_bevy_transform: (payload) => calls.push({ type: 'transform', payload }),
        request_atome_bevy_redraw: () => calls.push({ type: 'redraw' })
    };
    const node = {
        id: 'transform_atom',
        kind: 'shape',
        parentId: null,
        bounds: { x: 10, y: 20, width: 40, height: 30 },
        localTransform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, originX: 0, originY: 0 },
        material: { fill: '#ff0000' },
        renderLayer: 0,
        zIndex: 0,
        selected: false,
        content: {},
        text: null,
        visible: true,
        children: []
    };
    const originalSetTimeout = dom.window.setTimeout;
    dom.window.setTimeout = () => 1;
    await startBevyWebRenderer({
        surface: canvas,
        width: 100,
        height: 80,
        virtualScene: {
            id: 'transform_only_scene',
            revision: 1,
            roots: [node.id],
            nodes: [node],
            byId: new Map([[node.id, node]])
        },
        wasmModule
    });
    let delayedPrimeCount = 0;
    dom.window.setTimeout = () => {
        delayedPrimeCount += 1;
        return delayedPrimeCount;
    };
    try {
        await applyBevyWebRendererDiffs({
            surface: canvas,
            ops: [{
                type: VIRTUAL_SCENE_DIFF_TYPES.updateTransform,
                id: node.id,
                localTransform: { ...node.localTransform, x: 30, y: 40 },
                bounds: { x: 30, y: 40, width: 40, height: 30 },
                sizeChanged: false,
                node: {
                    ...node,
                    bounds: { x: 30, y: 40, width: 40, height: 30 },
                    localTransform: { ...node.localTransform, x: 30, y: 40 }
                }
            }],
            virtualScene: null
        });
    } finally {
        dom.window.setTimeout = originalSetTimeout;
    }
    assert.equal(delayedPrimeCount, 0);
    assert.equal(calls.filter((call) => call.type === 'transform').length, 1);
    assert.equal(calls.filter((call) => call.type === 'redraw').length, 1);
});

test('live project video without poster cannot enter the RGBA media resolver path', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    let canvasReadbacks = 0;
    dom.window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect: () => null,
        drawImage: () => {
            canvasReadbacks += 1;
        },
        getImageData: () => {
            canvasReadbacks += 1;
            return { data: new Uint8ClampedArray(4) };
        }
    });
    const resolver = createBrowserBevyMediaTextureResolver({ documentRef: dom.window.document });
    await assert.rejects(
        () => resolver({
            id: 'live_video_rgba_forbidden',
            kind: 'video',
            bounds: { x: 0, y: 0, width: 320, height: 180 },
            content: { source: '/api/recordings/live.webm' }
        }),
        /bevy_media_texture_video_gpu_source_only:live_video_rgba_forbidden/
    );
    assert.equal(canvasReadbacks, 0);
});
