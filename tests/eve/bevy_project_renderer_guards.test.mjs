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
import {
    createVideoFrameDispatcher
} from '../../eVe/domains/rendering/bevy_web_presentation_runtime.js';
import {
    ensureBevyPerfDiagnostics,
    recordBevyPerfEvent,
    shouldRecordBevyPerfEvent
} from '../../eVe/domains/rendering/bevy_perf_diagnostics_runtime.js';
import { createBrowserBevyMediaTextureResolver } from '../../eVe/domains/rendering/bevy_media_texture_resolver.js';
import { clearBevyMediaTextureCache } from '../../eVe/domains/rendering/bevy_media_texture_cache.js';
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

    // The legacy web-component MTrax renderer (tools/core/mtrax_renderer_*) was
    // deleted; the montage editor preview will be rewritten on the single Bevy
    // canvas. Guard against reintroduction.
    const coreToolFiles = readdirSync(join(repoRoot, 'eVe/intuition/tools/core'));
    assert.ok(
        !coreToolFiles.some((name) => /^mtrax_renderer_/.test(name)),
        'legacy mtrax_renderer_* files must stay deleted (rewrite the editor on Bevy instead)'
    );

    const selectedPlayback = readSource('eVe/domains/media/selected_project_media_playback_runtime.js');
    const mediaReaderRuntime = readSource('eVe/intuition/runtime/eve_intuition/media_reader_tool_runtime.js');
    assert.doesNotMatch(selectedPlayback, /setBevyVideoDecodePlayback/);
    assert.doesNotMatch(selectedPlayback, /updateProjectSceneRecordByAtomeId/);
    assert.doesNotMatch(selectedPlayback, /media_playback_active|mediaPlaybackActive/);
    assert.match(selectedPlayback, /selected_project_video_timeline_required/);
    assert.match(selectedPlayback, /videoPlaybackCompleted/);
    assert.match(selectedPlayback, /projectMediaVoiceId/);
    const playHandlerStart = mediaReaderRuntime.indexOf("tool_id: 'ui.play'");
    assert.notEqual(playHandlerStart, -1);
    const playHandler = mediaReaderRuntime.slice(playHandlerStart);
    assert.match(playHandler, /const mediaResult = await runMediaReaderAction\('toggle'/);
    assert.match(playHandler, /const animationResult = mediaResult\?\.handled === true/);
    assert.ok(
        playHandler.indexOf("const mediaResult = await runMediaReaderAction('toggle'")
        < playHandler.indexOf('const animationResult = mediaResult?.handled === true'),
        'ui.play must let the media reader own video transport before any animation fallback'
    );

    const decodeRuntime = readSource('eVe/domains/rendering/bevy_video_decode_source_runtime.js');
    const streamSourceRuntime = readSource('eVe/domains/rendering/bevy_video_stream_source_runtime.js');
    const syncBody = sourceSlice(
        decodeRuntime,
        /export const syncBevyVideoDecodeSources/,
        /export const setBevyVideoDecodePlayback/
    );
    assert.match(streamSourceRuntime, /__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__[\s\S]*requestVideoFrameCallback/);
    assert.match(decodeRuntime, /frameVersion/);
    assert.match(decodeRuntime, /typeof entry\.video(?:\?)?\.requestVideoFrameCallback === 'function'\s*\?\s*scheduleVideoFrameCallback\(state, entry\)\s*:\s*scheduleFramePump\(state, entry\)/);
    assert.doesNotMatch(syncBody, /video\.play\s*\(/);
    assert.doesNotMatch(syncBody, /setSourcePlayback\s*\(/);
    // The MTrax domain (and its timeline playback driver) was deleted. The project
    // transport now drives Bevy video decode directly from the eVeIntuition media
    // reader tool runtime so video does not freeze while Kira audio plays; guard
    // that no other stray caller reappears outside the decode runtime that defines it.
    const setBevyCallers = jsFilesUnder('eVe')
        .filter((file) => /setBevyVideoDecodePlayback/.test(readFileSync(file, 'utf8')))
        .map((file) => file.slice(repoRoot.length + 1).replaceAll('\\', '/'))
        .filter((file) => file !== 'eVe/domains/rendering/bevy_video_decode_source_runtime.js');
    assert.deepEqual(setBevyCallers, ['eVe/intuition/runtime/eve_intuition/media_reader_tool_runtime.js']);

    const webRenderer = readSource('eVe/domains/rendering/bevy_web_renderer_runtime.js');
    const webRendererModuleLoader = readSource('eVe/domains/rendering/bevy_web_renderer_module_loader.js');
    const mediaResourceRuntime = readSource('eVe/domains/rendering/bevy_media_resource_runtime.js');
    const presentationRuntime = readSource('eVe/domains/rendering/bevy_web_presentation_runtime.js');
    const wasmDiagnosticsRuntime = readSource('eVe/domains/rendering/bevy_wasm_diagnostics_runtime.js');
    assert.match(webRenderer, /opsAreTransformOnly/);
    assert.match(webRenderer, /opsNeedMediaSourceSync/);
    assert.match(webRenderer, /opsNeedPresentationRedrawPrime/);
    assert.match(webRenderer, /createBevyMediaResourceRuntime/);
    assert.match(webRenderer, /attachBevyWasmDiagnosticsReaders/);
    assert.match(webRendererModuleLoader, /BEVY_WASM_MODULE_PATH = '\/wasm\/squirrel_bevy_renderer\.js'/);
    assert.match(webRendererModuleLoader, /BEVY_WASM_BINARY_PATH = '\/wasm\/squirrel_bevy_renderer_bg\.wasm'/);
    assert.match(webRendererModuleLoader, /BEVY_WASM_VERSION_PATH = '\/wasm\/renderer_version\.mjs'/);
    assert.match(webRendererModuleLoader, /versionedRendererAssetUrl/);
    assert.match(webRendererModuleLoader, /rendererVersionManifestUrl/);
    assert.match(webRendererModuleLoader, /performance\?\.timeOrigin/);
    assert.match(webRendererModuleLoader, /bevy_renderer_version_required/);
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
    assert.match(applyDiffsBody, /needsPresentationPrime = effectsChanged \|\| opsNeedPresentationRedrawPrime\(ops\)/);
    assert.match(applyDiffsBody, /if\s*\(\s*!needsPresentationPrime\s*\)/);
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

    const rustExternalTexture = readSource('atome/renderers/bevy-core/src/video_external_texture.rs');
    const rustExternalWeb = readSource('atome/renderers/bevy-core/src/video_external_web.rs');
    const rustExternalShader = readSource('atome/renderers/bevy-core/assets/shaders/video_external.wgsl');
    const rustLib = readSource('atome/renderers/bevy-core/src/lib.rs');
    assert.match(rustExternalTexture, /AtomeVideoExternalTexture/);
    assert.match(rustExternalTexture, /video_quad_mesh_handle_from_size/);
    assert.match(rustExternalWeb, /create_external_texture/);
    assert.match(rustExternalWeb, /BindingResource::ExternalTexture/);
    assert.match(rustExternalShader, /texture_external/);
    assert.match(rustExternalShader, /textureSampleBaseClampToEdge/);
    assert.match(rustExternalWeb, /bevy\.video\.external\.import/);
    assert.match(rustExternalWeb, /bevy\.video\.external\.draw/);
    assert.doesNotMatch(rustLib, /pub mod video_texture/);
    assert.doesNotMatch(rustExternalTexture, /copy_external_image_to_texture/);
    assert.doesNotMatch(rustExternalWeb, /copy_external_image_to_texture/);

    const webRendererCargo = readSource('platforms/web/bevy-renderer/Cargo.toml');
    const coreCargo = readSource('atome/renderers/bevy-core/Cargo.toml');
    const webRendererExports = readSource('platforms/web/bevy-renderer/src/exports.rs');
    const webRendererLock = readSource('platforms/web/bevy-renderer/Cargo.lock');
    const webRendererLib = readSource('platforms/web/bevy-renderer/src/lib.rs');
    const videoDiagnostics = readSource('atome/renderers/bevy-core/src/video_diagnostics.rs');
    const maintainedWgpuBackend = readSource('atome/renderers/wgpu-web-external-texture/wgpu-29.0.4/src/backend/webgpu.rs');
    const maintainedWgpuTypes = readSource('atome/renderers/wgpu-web-external-texture/wgpu-types-29.0.4/src/texture/external_texture.rs');
    const generatedBevyWasm = readSource('atome/src/wasm/squirrel_bevy_renderer.js');
    const generatedBevyTypes = readSource('atome/src/wasm/squirrel_bevy_renderer.d.ts');
    const generatedBevyWasmTypes = readSource('atome/src/wasm/squirrel_bevy_renderer_bg.wasm.d.ts');
    const bevyTypes = readSource('atome/renderers/bevy-core/src/types.rs');
    assert.match(webRendererCargo, /wgpu-web-external-texture\/wgpu-29\.0\.4/);
    assert.match(webRendererCargo, /wgpu-web-external-texture\/wgpu-types-29\.0\.4/);
    assert.match(coreCargo, /wgpu-web-external-texture\/wgpu-29\.0\.4/);
    assert.match(coreCargo, /wgpu-web-external-texture\/wgpu-types-29\.0\.4/);
    assert.match(webRendererLock, /name = "wgpu"\nversion = "29\.0\.4"/);
    assert.match(maintainedWgpuBackend, /import_external_texture\(&mapped_desc\)/);
    assert.match(maintainedWgpuBackend, /BindingResource::ExternalTexture\(external_texture\)/);
    assert.match(maintainedWgpuTypes, /source: Option<ExternalImageSource>/);
    assert.match(maintainedWgpuTypes, /serde\(skip\)/);
    assert.match(webRendererExports, /read_atome_bevy_video_backend_capabilities/);
    assert.match(webRendererExports, /read_atome_bevy_video_copy_diagnostics/);
    assert.match(webRendererExports, /reset_atome_bevy_video_copy_diagnostics/);
    assert.match(videoDiagnostics, /skip_frame_already_copied/);
    assert.match(videoDiagnostics, /record_video_copy_success/);
    assert.match(webRendererLib, /schema:\s*"atome\.bevy\.web\.video_backend\.v7"/);
    assert.match(webRendererLib, /target_live_video_backend:\s*"gpu_external_texture_texture_external"/);
    assert.match(webRendererLib, /live_video_backend:\s*"gpu_external_texture_texture_external"/);
    assert.match(webRendererLib, /current_backend_final:\s*true/);
    assert.doesNotMatch(webRendererLib, /video_track_api_exposed/);
    assert.match(webRendererLib, /backend_blocker:\s*"none"/);
    assert.match(webRendererLib, /browser_gpu_device_import_external_texture_available:\s*true/);
    assert.match(webRendererLib, /wgpu_web_external_texture_create:\s*true/);
    assert.match(webRendererLib, /wgpu_external_texture_source_descriptor:\s*true/);
    assert.match(webRendererLib, /wgpu_external_texture_bind_group_layout:\s*true/);
    assert.match(webRendererLib, /wgpu_external_texture_bind_group_resource:\s*true/);
    assert.match(webRendererLib, /html_video_element_copy:\s*false/);
    assert.match(webRendererLib, /gpu_external_texture_import:\s*true/);
    assert.match(webRendererLib, /texture_external_sampling:\s*true/);
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
    // The dead `video_track` Rust API was removed during the renderer
    // unification; guard against its reintroduction (and against DOM-video /
    // frame-version coupling leaking into the shared types).
    assert.doesNotMatch(bevyTypes, /pub struct AtomeVideoTrack/);
    assert.doesNotMatch(bevyTypes, /HtmlVideoElement|frame_version|FrameVersion/);
    assert.doesNotMatch(webRendererExports, /apply_atome_bevy_video_track/);
    assert.doesNotMatch(webRendererExports, /AtomeRenderOp::VideoTrackApply/);
    assert.doesNotMatch(webRendererExports, /remove_atome_bevy_video_track/);
    assert.doesNotMatch(webRendererExports, /update_atome_bevy_video_transform/);
    assert.doesNotMatch(webRendererExports, /AtomeRenderOp::VideoTrack(Remove|Transform)/);
    assert.doesNotMatch(generatedBevyWasm, /export function (?:apply|remove)_atome_bevy_video_track/);
    assert.doesNotMatch(generatedBevyWasm, /export function update_atome_bevy_video_transform/);
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

test('Bevy perf diagnostics keep high-frequency video events opt-in', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    delete dom.window.__EVE_BEVY_PERF__;
    delete dom.window.__EVE_BEVY_PERF_RECORD__;

    const diagnostics = ensureBevyPerfDiagnostics();
    assert.equal(diagnostics.summary().external_render_events, false);
    assert.equal(diagnostics.summary().video_frame_events, false);
    assert.equal(diagnostics.summary().video_decode_frame_events, false);
    assert.equal(typeof dom.window.__EVE_BEVY_PERF_RECORD__, 'undefined');
    assert.equal(shouldRecordBevyPerfEvent('video.decode.frame'), false);
    assert.equal(shouldRecordBevyPerfEvent('bevy.video.frame_notify.request'), false);
    assert.equal(recordBevyPerfEvent('video.decode.frame', { id: 'video_1' }), null);
    assert.equal(diagnostics.summary().counters['video.decode.frame'], undefined);

    diagnostics.reset({ externalRenderEvents: true });
    assert.equal(diagnostics.summary().external_render_events, true);
    assert.equal(diagnostics.summary().enabled, false);
    assert.equal(typeof dom.window.__EVE_BEVY_PERF_RECORD__, 'undefined');
    assert.equal(recordBevyPerfEvent('bevy.video.external.draw', { id: 'video_1' }), null);
    assert.equal(diagnostics.summary().counters['bevy.video.external.draw'], undefined);

    diagnostics.reset({ enabled: true, externalRenderEvents: true });
    assert.equal(diagnostics.summary().enabled, true);
    assert.equal(diagnostics.summary().external_render_events, true);
    assert.equal(typeof dom.window.__EVE_BEVY_PERF_RECORD__, 'function');
    dom.window.__EVE_BEVY_PERF_RECORD__('bevy.video.external.draw', { id: 'video_1' });
    assert.equal(diagnostics.summary().counters['bevy.video.external.draw'], 1);

    diagnostics.setExternalRenderEvents(false);
    assert.equal(diagnostics.summary().external_render_events, false);
    assert.equal(typeof dom.window.__EVE_BEVY_PERF_RECORD__, 'undefined');

    diagnostics.reset({ enabled: true, videoFrameEvents: true });
    assert.equal(diagnostics.summary().video_frame_events, true);
    assert.equal(diagnostics.summary().video_decode_frame_events, true);
    assert.equal(shouldRecordBevyPerfEvent('video.decode.frame'), true);
    assert.equal(shouldRecordBevyPerfEvent('bevy.video.frame_notify.request'), true);
    recordBevyPerfEvent('video.decode.frame', { id: 'video_1' });
    recordBevyPerfEvent('bevy.video.frame_notify.request', { id: 'video_1' });
    assert.equal(diagnostics.summary().counters['video.decode.frame'], 1);
    assert.equal(diagnostics.summary().counters['bevy.video.frame_notify.request'], 1);

    diagnostics.setVideoFrameEvents(false);
    assert.equal(diagnostics.summary().video_frame_events, false);
    assert.equal(diagnostics.summary().video_decode_frame_events, false);
    assert.equal(shouldRecordBevyPerfEvent('video.decode.frame'), false);
    assert.equal(shouldRecordBevyPerfEvent('bevy.video.frame_notify.request'), false);

    const optInDom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/?perf=1' });
    globalThis.window = optInDom.window;
    globalThis.document = optInDom.window.document;
    delete optInDom.window.__EVE_BEVY_PERF__;
    const optInDiagnostics = ensureBevyPerfDiagnostics();
    assert.equal(optInDiagnostics.summary().enabled, true);
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
        apply_atome_bevy_ops: (ops) => calls.push({ type: 'ops', ops }),
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
    let startTimerFired = false;
    dom.window.setTimeout = (callback) => {
        if (!startTimerFired && typeof callback === 'function') {
            startTimerFired = true;
            callback();
        }
        return 1;
    };
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
    const ops = calls.filter((call) => call.type === 'ops').flatMap((call) => call.ops);
    assert.equal(ops.filter((op) => op.type === 'transform').length, 1);
    assert.equal(ops.filter((op) => op.type === 'text').length, 0);
    assert.equal(calls.filter((call) => call.type === 'redraw').length, 1);
});

test('text transform diffs rasterize texture only when text bounds change', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const canvas = dom.window.document.getElementById('eve_surface_project');
    const calls = [];
    const node = {
        id: 'text_transform_atom',
        kind: 'text',
        parentId: null,
        localTransform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, originX: 0, originY: 0 },
        bounds: { x: 10, y: 20, width: 90, height: 24 },
        visible: true,
        material: { fill: [255, 255, 255, 255] },
        text: { text: 'Move me', style: { fontSize: 16 } },
        content: { text: 'Move me' },
        renderLayer: 0,
        zIndex: 0,
        selected: false,
        children: []
    };
    const wasmModule = {
        default: async () => {},
        run_atome_bevy_renderer: () => calls.push({ type: 'run' }),
        apply_atome_bevy_ops: (ops) => calls.push({ type: 'ops', ops }),
        request_atome_bevy_redraw: () => calls.push({ type: 'redraw' })
    };
    await startBevyWebRenderer({
        surface: canvas,
        width: 200,
        height: 120,
        virtualScene: {
            id: 'text_transform_scene',
            revision: 1,
            roots: [node.id],
            nodes: [node],
            byId: new Map([[node.id, node]])
        },
        wasmModule,
        mediaTextureResolver: async () => ({ width: 1, height: 1, rgba: [255, 255, 255, 255] })
    });
    calls.length = 0;
    await applyBevyWebRendererDiffs({
        surface: canvas,
        ops: [{
            type: VIRTUAL_SCENE_DIFF_TYPES.updateTransform,
            id: node.id,
            localTransform: { ...node.localTransform, x: 30 },
            bounds: { x: 30, y: 20, width: 90, height: 24 },
            sizeChanged: false,
            node: {
                ...node,
                localTransform: { ...node.localTransform, x: 30 },
                bounds: { x: 30, y: 20, width: 90, height: 24 }
            }
        }],
        virtualScene: null
    });
    assert.equal(calls.flatMap((call) => call.ops || []).filter((op) => op.type === 'text').length, 0);
    await applyBevyWebRendererDiffs({
        surface: canvas,
        ops: [{
            type: VIRTUAL_SCENE_DIFF_TYPES.updateTransform,
            id: node.id,
            localTransform: { ...node.localTransform, x: 30 },
            bounds: { x: 30, y: 20, width: 110, height: 24 },
            sizeChanged: true,
            node: {
                ...node,
                localTransform: { ...node.localTransform, x: 30 },
                bounds: { x: 30, y: 20, width: 110, height: 24 }
            }
        }],
        virtualScene: null
    });
    assert.equal(calls.flatMap((call) => call.ops || []).filter((op) => op.type === 'text').length, 1);
});

test('video frame dispatcher coalesces same-tick video frames into one WASM wake', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const canvas = dom.window.document.getElementById('eve_surface_project');
    const calls = [];
    const wasmModule = {
        notify_atome_bevy_video_frame: (id, frameVersion) => calls.push({ type: 'notify', id, frameVersion }),
        request_atome_bevy_redraw: () => calls.push({ type: 'redraw' })
    };
    const dispatchVideoFrame = createVideoFrameDispatcher(canvas, wasmModule);

    dispatchVideoFrame({ id: 'video_a', frameVersion: 10, active: true });
    dispatchVideoFrame({ id: 'video_b', frameVersion: 20, active: true });
    dispatchVideoFrame({ id: 'video_c', frameVersion: 30, active: true });
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    assert.deepEqual(calls, [{ type: 'notify', id: 'video_c', frameVersion: 30 }]);
});

test('Bevy style diffs forward opacity to the WASM style export', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const canvas = dom.window.document.getElementById('eve_surface_project');
    const calls = [];
    const wasmModule = {
        default: async () => {},
        run_atome_bevy_renderer: () => calls.push({ type: 'run' }),
        apply_atome_bevy_ops: (ops) => calls.push({ type: 'ops', ops }),
        request_atome_bevy_redraw: () => calls.push({ type: 'redraw' })
    };
    const node = {
        id: 'opacity_atom',
        kind: 'shape',
        parentId: null,
        bounds: { x: 10, y: 20, width: 40, height: 30 },
        localTransform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, originX: 0, originY: 0 },
        material: { fill: '#ff0000' },
        opacity: 1,
        renderLayer: 0,
        zIndex: 0,
        selected: false,
        content: {},
        text: null,
        visible: true,
        children: []
    };
    await startBevyWebRenderer({
        surface: canvas,
        width: 100,
        height: 80,
        virtualScene: {
            id: 'opacity_scene',
            revision: 1,
            roots: [node.id],
            nodes: [node],
            byId: new Map([[node.id, node]])
        },
        wasmModule
    });
    await applyBevyWebRendererDiffs({
        surface: canvas,
        ops: [{
            type: VIRTUAL_SCENE_DIFF_TYPES.updateStyle,
            id: node.id,
            patch: { opacity: 0.38 }
        }],
        virtualScene: null
    });

    assert.deepEqual(calls.flatMap((call) => call.ops || []).find((op) => op.type === 'style')?.patch, {
        id: 'opacity_atom',
        color: null,
        selected: undefined,
        opacity: 0.38
    });
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

test('Bevy media texture resolver honors per-node image texture scale', async () => {
    clearBevyMediaTextureCache();
    const canvases = [];
    const documentRef = {
        defaultView: { devicePixelRatio: 1 },
        createElement: (tagName) => {
            if (tagName === 'img') {
                return {
                    complete: true,
                    naturalWidth: 40,
                    naturalHeight: 20,
                    decode: async () => {},
                    addEventListener: () => {},
                    removeEventListener: () => {}
                };
            }
            if (tagName === 'canvas') {
                const canvas = {
                    width: 0,
                    height: 0,
                    getContext: () => ({
                        clearRect: () => null,
                        scale: () => null,
                        drawImage: () => null,
                        getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) })
                    })
                };
                canvases.push(canvas);
                return canvas;
            }
            throw new Error(`unexpected_element:${tagName}`);
        }
    };
    const resolver = createBrowserBevyMediaTextureResolver({
        documentRef,
        imageTextureScale: 1,
        maxTextureSize: 1024
    });
    const node = {
        id: 'scaled_image',
        kind: 'image',
        bounds: { x: 0, y: 0, width: 40, height: 20 },
        content: { source: 'data:image/png;base64,shared', texture_scale: 3 }
    };

    const dense = await resolver(node);
    const cachedDense = await resolver(node);
    const normal = await resolver({
        ...node,
        content: { source: 'data:image/png;base64,shared', texture_scale: 1 }
    });

    assert.equal(dense.width, 120);
    assert.equal(dense.height, 60);
    assert.deepEqual(cachedDense, dense);
    assert.equal(normal.width, 40);
    assert.equal(normal.height, 20);
    assert.equal(canvases.length, 2);
});

test('Bevy external-video shader linearizes the sampled frame before the sRGB target', () => {
    const shader = readSource('atome/renderers/bevy-core/assets/shaders/video_external.wgsl');
    // External textures sample display-encoded sRGB; Bevy's 2d target re-applies the
    // sRGB OETF on store, so the sample MUST be decoded to linear first. A raw
    // `frame.rgb` passthrough double-encodes it (lifted blacks, washed-out contrast).
    assert.match(shader, /fn\s+srgb_to_linear/);
    // M1/M2 route the sample through color filters + transitions, but the final
    // store MUST still linearize (now `srgb_to_linear(filtered)`), never a raw
    // `frame.rgb` passthrough that would double-encode to the sRGB target.
    assert.match(shader, /return\s+vec4<f32>\(\s*srgb_to_linear\(filtered\)\s*,\s*opacity\s*\)/);
    assert.doesNotMatch(shader, /return\s+vec4<f32>\(\s*frame\.rgb\s*,\s*opacity\s*\)/);
});
