import { test, expect } from 'vitest';
import { startBevyNativeRenderer, refreshBevyNativeRendererProjectTextures } from '../../eVe/domains/rendering/bevy_native_renderer_runtime.js';
import { registerBevySurfaceBackgroundRuntime, ensureBevySurfaceBackgroundApplied } from '../../eVe/domains/rendering/bevy_surface_background_runtime.js';
import { resolveImageRasterSize } from '../../eVe/domains/rendering/bevy_image_texture_source.js';
import { createBrowserBevyMediaTextureResolver } from '../../eVe/domains/rendering/bevy_media_texture_resolver.js';
import { clearBevyMediaTextureCache } from '../../eVe/domains/rendering/bevy_media_texture_cache.js';
import { setActiveProjectViewProject, writeProjectView } from '../../eVe/domains/rendering/project_view_camera.js';
import { SURFACE_RUNTIME } from '../../eVe/domains/rendering/bevy_web_renderer_helpers.js';
import { refreshBevyWebRendererProjectTextures } from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';

const node = () => ({ id: 'photo', kind: 'image', renderLayer: 0, opacity: 1, bounds: { x: 0, y: 0, width: 100, height: 50 },
    content: { source: '/original-photo.png', naturalWidth: 2000, naturalHeight: 1000,
        sourceRect: { x: 0, y: 0, width: 2000, height: 1000 } } });

test('image density follows zoom and DPR from original source coordinates on Web and iOS', () => {
    const photo = node();
    const raster = (zoom, ios = false) => resolveImageRasterSize({ node: photo, size: photo.bounds, ratio: 2, view: { zoom }, ios });
    expect([raster(1).width, raster(1).height]).toEqual([200, 100]);
    expect([raster(4).width, raster(4).height]).toEqual([800, 400]);
    expect([raster(4, true).width, raster(4, true).height]).toEqual([800, 400]);
    expect([raster(20).width, raster(20).height]).toEqual([2000, 1000]);
    photo.localTransform = { scaleX: 2, scaleY: 1 };
    expect(raster(4).width).toBe(1600);
    delete photo.localTransform;
    photo.content.sourceRect = { x: 500, y: 0, width: 1000, height: 500 };
    expect(raster(4).width).toBe(1600);
    const ui = { ...photo, id: '__eve_dashboard_photo' };
    expect(resolveImageRasterSize({ node: ui, size: { width: 2000, height: 1000 }, view: { zoom: 8 }, ios: true }).width).toBe(512);
});

test('zoom and resize decode the same original, reuse matching rasters and release scratch resources', async () => {
    clearBevyMediaTextureCache();
    setActiveProjectViewProject('qa-resolution');
    writeProjectView('qa-resolution', { zoom: 1 });
    const images = [], canvases = [], draws = [];
    const documentRef = { defaultView: { devicePixelRatio: 2 }, createElement(tag) {
        if (tag === 'img') {
            const image = { naturalWidth: 2000, naturalHeight: 1000, decode: async () => {},
                removeAttribute: () => { image.released = true; } };
            images.push(image); return image;
        }
        const canvas = { width: 0, height: 0, getContext: () => ({ clearRect() {}, scale() {},
            drawImage: image => draws.push(image),
            getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }) }) };
        canvases.push(canvas); return canvas;
    } };
    const resolver = createBrowserBevyMediaTextureResolver({ documentRef, fetchResource: async () => new Response(new Uint8Array([0])) });
    const photo = node();
    try {
        const small = await resolver(photo);
        expect([small.width, small.height]).toEqual([200, 100]);
        writeProjectView('qa-resolution', { zoom: 4 });
        const large = await resolver(photo);
        expect([large.width, large.height]).toEqual([800, 400]);
        expect(await resolver(photo)).toBe(large);
        const resized = await resolver({ ...photo, bounds: { ...photo.bounds, width: 200, height: 100 } });
        expect([resized.width, resized.height]).toEqual([1600, 800]);
        expect(images.map(image => image.src)).toEqual(Array(3).fill(photo.content.source));
        expect(draws).toEqual(images);
        expect(images.every(image => image.released)).toBe(true);
        expect(canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
        expect(photo.bounds.width).toBe(100);
        expect(photo.content.naturalWidth).toBe(2000);
    } finally { setActiveProjectViewProject(''); clearBevyMediaTextureCache(); }
});

test('a delayed original keeps the resident image until ready and cannot overwrite a newer zoom', async () => {
    const photo = node();
    const applied = [];
    let release;
    const surface = { tagName: 'CANVAS' };
    const module = { apply_atome_bevy_resource: patch => applied.push(patch), request_atome_bevy_redraw() {} };
    const scene = { nodes: [photo] };
    const state = { started: true, wasmModule: module, virtual_scene: scene,
        mediaTextureResolver: () => new Promise(resolve => { release = resolve; }) };
    SURFACE_RUNTIME.set(surface, state);
    let current = true;
    const pending = refreshBevyWebRendererProjectTextures({ surface, isCurrent: () => current });
    expect(applied).toHaveLength(0);
    current = false;
    release({ width: 800, height: 400, rgba: new Uint8Array(800 * 400 * 4) });
    expect((await pending).refreshed).toBe(0);
    expect(applied).toHaveLength(0);
    state.mediaTextureResolver = async () => ({ width: 800, height: 400, rgba: new Uint8Array(800 * 400 * 4) });
    expect((await refreshBevyWebRendererProjectTextures({ surface })).refreshed).toBe(1);
    expect(applied[0].texture.width).toBe(800);
    expect(applied[0].uv_rect).toEqual([0, 0, 1, 1]);
    SURFACE_RUNTIME.delete(surface);
});

test('a delayed decode cannot restore an old source or geometry after scene replacement', async () => {
    const photo = node();
    let release;
    const applied = [];
    const surface = { tagName: 'CANVAS' };
    const state = { started: true, wasmModule: { apply_atome_bevy_resource: patch => applied.push(patch) },
        virtual_scene: { nodes: [photo] }, mediaTextureResolver: () => new Promise(resolve => { release = resolve; }) };
    SURFACE_RUNTIME.set(surface, state);
    const pending = refreshBevyWebRendererProjectTextures({ surface });
    state.virtual_scene = { nodes: [{ ...photo, content: { ...photo.content, source: '/new-original.png' } }] };
    release({ width: 10, height: 10, rgba: new Uint8Array(400) });
    expect((await pending).refreshed).toBe(0);
    expect(applied).toHaveLength(0);
    SURFACE_RUNTIME.delete(surface);
});


test('native bridges refresh the original image through resource ops and reject superseded zooms', async () => {
    const calls = [];
    const surface = { id: 'native_zoom_qa', tagName: 'CANVAS', ownerDocument: { defaultView: {
        __ATOME_IOS_NATIVE_INVOKE: async (command, payload) => { calls.push({ command, payload }); return { success: true }; }
    } } };
    let width = 2;
    await startBevyNativeRenderer({ surface, width: 400, height: 300, virtualScene: { nodes: [node()] },
        mediaTextureResolver: async () => ({ width, height: width / 2, rgba: new Uint8Array(width * width * 2) }) });
    width = 8;
    expect((await refreshBevyNativeRendererProjectTextures({ surface })).refreshed).toBe(1);
    const op = calls.at(-1).payload.ops[0];
    expect(op.type).toBe('resource');
    expect(op.patch.texture.width).toBe(8);
    expect(op.patch.uv_rect).toEqual([0, 0, 1, 1]);
    expect(Array.isArray(op.patch.texture.rgba)).toBe(true);
    expect((await refreshBevyNativeRendererProjectTextures({ surface, isCurrent: () => false })).refreshed).toBe(0);
    expect(calls).toHaveLength(2);
});

test('Dashboard wallpaper re-decodes its original when the surface gains pixels', async () => {
    const calls = [], sources = [], canvases = [];
    const documentRef = { defaultView: { devicePixelRatio: 1, innerWidth: 400, innerHeight: 300 }, createElement(tag) {
        if (tag === 'img') return { naturalWidth: 4000, naturalHeight: 2000, complete: true,
            addEventListener() {}, removeEventListener() {}, removeAttribute() {}, decode: async () => {},
            set src(value) { sources.push(value); } };
        const canvas = { width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage() {},
            getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }) }) };
        canvases.push(canvas); return canvas;
    } };
    const surface = { ownerDocument: documentRef, width: 400, height: 300 };
    const state = { started: true, wasmModule: { apply_atome_bevy_surface_background: payload => calls.push(payload), request_atome_bevy_redraw() {} } };
    registerBevySurfaceBackgroundRuntime(surface, state);
    const background = { signature: 'qa-original-wallpaper', sourceUrl: '/qa-original-wallpaper.png', mediaKind: 'image' };
    await ensureBevySurfaceBackgroundApplied(surface, background);
    expect(calls.at(-1).texture.width).toBe(1024);
    await ensureBevySurfaceBackgroundApplied(surface, background);
    expect(calls).toHaveLength(1);
    surface.width = 2400;
    await ensureBevySurfaceBackgroundApplied(surface, background);
    expect(calls.at(-1).texture.width).toBe(2400);
    expect(sources).toEqual([background.sourceUrl, background.sourceUrl]);
    expect(canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
});

test('a slow wallpaper decode for an old screen size cannot replace the sharper background', async () => {
    const calls = [], decodes = [];
    const documentRef = { defaultView: { devicePixelRatio: 1, innerWidth: 400, innerHeight: 300 }, createElement(tag) {
        if (tag === 'img') return { naturalWidth: 4000, naturalHeight: 2000, complete: true,
            addEventListener() {}, removeEventListener() {}, removeAttribute() {},
            decode: () => new Promise(resolve => decodes.push(resolve)) };
        return { width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage() {},
            getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }) }) };
    } };
    const surface = { ownerDocument: documentRef, width: 400, height: 300 };
    registerBevySurfaceBackgroundRuntime(surface, { started: true, wasmModule: {
        apply_atome_bevy_surface_background: payload => calls.push(payload), request_atome_bevy_redraw() {} } });
    const background = { signature: 'qa-wallpaper-race', sourceUrl: '/qa-wallpaper-race.png', mediaKind: 'image' };
    const small = ensureBevySurfaceBackgroundApplied(surface, background);
    surface.width = 2400;
    const large = ensureBevySurfaceBackgroundApplied(surface, background);
    decodes[1](); await large;
    decodes[0](); await small;
    expect(calls.map(call => call.texture.width)).toEqual([2400]);
});
