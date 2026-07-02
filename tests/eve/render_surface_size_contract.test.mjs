import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    clearAllProjectScenes,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { ensureRenderSurface } from '../../eVe/domains/rendering/surface_runtime.js';
import { resolveRenderSurfaceSize } from '../../eVe/domains/rendering/surface_size_runtime.js';

const setBox = (element, width, height) => {
    Object.defineProperty(element, 'clientWidth', {
        configurable: true,
        value: width
    });
    Object.defineProperty(element, 'clientHeight', {
        configurable: true,
        value: height
    });
    element.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height
    });
};

const makeImageRecord = (id) => ({
    id,
    type: 'group',
    kind: 'group',
    properties: {
        media_kind: 'image',
        media_url: `/media/${id}.png`,
        left: 12,
        top: 24,
        width: 320,
        height: 180
    }
});

const createTestCompositor = (calls = []) => ({
    default: async () => {},
    resolve_bevy_media_texture: async () => ({
        width: 1,
        height: 1,
        rgba: [255, 0, 0, 255]
    }),
    run_atome_bevy_renderer: (canvasSelector, width, height, surfaceMetrics, initialNodes) => {
        const surface = globalThis.document?.querySelector?.(canvasSelector) || null;
        const dpr = globalThis.window?.devicePixelRatio || 1;
        if (surface) {
            surface.width = surfaceMetrics.pixel_width;
            surface.height = surfaceMetrics.pixel_height;
        }
        calls.push({
            type: 'run',
            canvasSelector,
            width,
            height,
            surfaceMetrics,
            initialNodes,
            target: {
                width,
                height,
                devicePixelRatio: globalThis.window?.devicePixelRatio || 1,
                surface
            },
            scene: { atoms: initialNodes.nodes.map((node) => ({
                id: node.id,
                bounds: {
                    x: node.logical_position[0],
                    y: node.logical_position[1],
                    width: node.logical_size[0],
                    height: node.logical_size[1]
                }
            })) }
        });
    },
    apply_atome_bevy_ops: (ops) => calls.push({ type: 'ops', ops }),
    apply_atome_bevy_spawn: (payload) => calls.push({ type: 'spawn', payload }),
    apply_atome_bevy_despawn: (id) => calls.push({ type: 'despawn', id }),
    apply_atome_bevy_transform: (payload) => calls.push({ type: 'transform', payload }),
    apply_atome_bevy_style: (payload) => calls.push({ type: 'style', payload }),
    apply_atome_bevy_reparent: (payload) => calls.push({ type: 'reparent', payload }),
    apply_atome_bevy_layer: (payload) => calls.push({ type: 'layer', payload }),
    apply_atome_bevy_visibility: (payload) => calls.push({ type: 'visibility', payload }),
    apply_atome_bevy_resource: (payload) => calls.push({ type: 'resource', payload }),
    apply_atome_bevy_text_metadata: (payload) => calls.push({ type: 'text', payload }),
    apply_atome_bevy_surface: (payload) => {
        const surface = globalThis.document?.querySelector?.('#eve_surface_project') || null;
        const dpr = globalThis.window?.devicePixelRatio || 1;
        if (surface) {
            surface.width = payload.pixel_width || Math.round(payload.width * dpr);
            surface.height = payload.pixel_height || Math.round(payload.height * dpr);
        }
        calls.push({ type: 'surface', payload });
    }
});

const flushBevyRun = () => new Promise((resolve) => setTimeout(resolve, 0));

test('Project scene render target uses host-sized surface dimensions', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    Object.defineProperty(dom.window, 'devicePixelRatio', {
        configurable: true,
        value: 1.5
    });
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const host = dom.window.document.getElementById('project');
    setBox(host, 960, 540);
    const calls = [];

    const projection = await renderProjectScene({
        projectId: 'surface_size_project',
        records: [makeImageRecord('imported_image')],
        host,
        compositor: createTestCompositor(calls)
    });
    await flushBevyRun();

    assert.equal(projection.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].target.width, 960);
    assert.equal(calls[0].target.height, 540);
    assert.equal(calls[0].target.devicePixelRatio, 1.5);
    assert.equal(calls[0].target.surface.width, 1440);
    assert.equal(calls[0].target.surface.height, 810);
    assert.equal(calls[0].target.surface.style.width, '960px');
    assert.equal(calls[0].target.surface.style.height, '540px');
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,video,audio,svg').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
});

test('Project scene surface follows host resize without changing Atome logical bounds', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    Object.defineProperty(dom.window, 'devicePixelRatio', {
        configurable: true,
        value: 2
    });
    const resizeObservers = [];
    const frames = [];
    dom.window.ResizeObserver = class ResizeObserver {
        constructor(callback) {
            this.callback = callback;
            resizeObservers.push(this);
        }

        observe() {}

        disconnect() {}
    };
    dom.window.requestAnimationFrame = (callback) => {
        frames.push(callback);
        return frames.length;
    };
    const flushFrames = async () => {
        while (frames.length) {
            frames.shift()(Date.now());
            await Promise.resolve();
        }
        await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    };
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const host = dom.window.document.getElementById('project');
    setBox(host, 640, 360);
    const calls = [];

    const projection = await renderProjectScene({
        projectId: 'surface_resize_project',
        records: [makeImageRecord('resized_image')],
        host,
        compositor: createTestCompositor(calls)
    });
    await flushBevyRun();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].target.width, 640);
    assert.equal(calls[0].target.height, 360);
    assert.equal(projection.scene.atoms[0].bounds.width, 320);
    assert.equal(projection.scene.atoms[0].bounds.height, 180);

    const canvas = calls[0].target.surface;
    let widthWrites = 0;
    let heightWrites = 0;
    let canvasWidth = canvas.width;
    let canvasHeight = canvas.height;
    Object.defineProperty(canvas, 'width', {
        configurable: true,
        get: () => canvasWidth,
        set: (value) => {
            widthWrites += 1;
            canvasWidth = value;
        }
    });
    Object.defineProperty(canvas, 'height', {
        configurable: true,
        get: () => canvasHeight,
        set: (value) => {
            heightWrites += 1;
            canvasHeight = value;
        }
    });

    resizeObservers.forEach((observer) => observer.callback([{ target: host }]));
    await flushFrames();

    assert.equal(calls.length, 1);
    assert.equal(widthWrites, 0);
    assert.equal(heightWrites, 0);
    assert.equal(canvasWidth, 1280);
    assert.equal(canvasHeight, 720);

    setBox(host, 1280, 720);
    resizeObservers.forEach((observer) => observer.callback([{ target: host }]));
    assert.equal(calls.length, 1);
    assert.equal(widthWrites, 0);
    assert.equal(heightWrites, 0);
    assert.equal(canvasWidth, 1280);
    assert.equal(canvasHeight, 720);
    assert.equal(canvas.style.width, '640px');
    assert.equal(canvas.style.height, '360px');
    await flushFrames();

    assert.equal(widthWrites, 2);
    assert.equal(heightWrites, 2);
    assert.equal(canvasWidth, 2560);
    assert.equal(canvasHeight, 1440);
    assert.equal(canvas.style.width, '1280px');
    assert.equal(canvas.style.height, '720px');

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.at(-1), {
        type: 'surface',
        payload: {
            width: 1280,
            height: 720,
            pixel_width: 2560,
            pixel_height: 1440,
            device_pixel_ratio: 2
        }
    });
    assert.equal(canvas.width, 2560);
    assert.equal(canvas.height, 1440);
    assert.equal(canvas.style.width, '1280px');
    assert.equal(canvas.style.height, '720px');
    assert.equal(projection.scene.atoms[0].bounds.width, 320);
    assert.equal(projection.scene.atoms[0].bounds.height, 180);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,video,audio,svg').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
});

test('Project scene resize rendering is serialized and the latest surface size wins', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    Object.defineProperty(dom.window, 'devicePixelRatio', {
        configurable: true,
        value: 1
    });
    const resizeObservers = [];
    const frames = [];
    dom.window.ResizeObserver = class ResizeObserver {
        constructor(callback) {
            this.callback = callback;
            resizeObservers.push(this);
        }

        observe() {}

        disconnect() {}
    };
    dom.window.requestAnimationFrame = (callback) => {
        frames.push(callback);
        return frames.length;
    };
    const flushOneFrame = async () => {
        const next = frames.shift();
        if (next) next(Date.now());
        await Promise.resolve();
    };
    const flushFrames = async () => {
        while (frames.length) {
            await flushOneFrame();
        }
        await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    };
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const host = dom.window.document.getElementById('project');
    setBox(host, 640, 360);
    const calls = [];
    const projectionPromise = renderProjectScene({
        projectId: 'surface_resize_serial_project',
        records: [makeImageRecord('serial_image')],
        host,
        compositor: createTestCompositor(calls)
    });

    const projection = await projectionPromise;
    await flushBevyRun();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].target.width, 640);
    assert.equal(calls[0].target.height, 360);

    setBox(host, 1280, 720);
    resizeObservers.forEach((observer) => observer.callback([{ target: host }]));
    setBox(host, 1440, 810);
    resizeObservers.forEach((observer) => observer.callback([{ target: host }]));
    await flushOneFrame();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].target.surface.width, 1440);
    assert.equal(calls[0].target.surface.height, 810);
    assert.equal(calls[0].target.surface.style.width, '1440px');
    assert.equal(calls[0].target.surface.style.height, '810px');
    await flushFrames();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.at(-1), {
        type: 'surface',
        payload: {
            width: 1440,
            height: 810,
            pixel_width: 1440,
            pixel_height: 810,
            device_pixel_ratio: 1
        }
    });
    assert.equal(calls[0].target.surface.width, 1440);
    assert.equal(calls[0].target.surface.height, 810);

    assert.equal(projection.ok, true);
    assert.equal(calls[0].scene.atoms[0].bounds.width, 320);
    assert.equal(calls[0].scene.atoms[0].bounds.height, 180);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,video,audio,svg').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
});

test('Project scene render repairs backing-store drift without logical resize', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    Object.defineProperty(dom.window, 'devicePixelRatio', {
        configurable: true,
        value: 1
    });
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const host = dom.window.document.getElementById('project');
    setBox(host, 1000, 760);
    const calls = [];

    await renderProjectScene({
        projectId: 'surface_backing_drift_project',
        records: [makeImageRecord('drift_image')],
        host,
        compositor: createTestCompositor(calls)
    });
    await flushBevyRun();
    const canvas = calls[0].target.surface;
    assert.equal(canvas.width, 1000);
    assert.equal(canvas.height, 760);

    canvas.width = 2000;
    canvas.height = 1520;
    await renderProjectScene({
        projectId: 'surface_backing_drift_project',
        records: [makeImageRecord('drift_image')],
        host,
        compositor: createTestCompositor(calls),
        keepForeground: true
    });
    await flushBevyRun();

    assert.equal(canvas.width, 1000);
    assert.equal(canvas.height, 760);
    assert.equal(canvas.style.width, '1000px');
    assert.equal(canvas.style.height, '760px');
});

test('Project surface size uses viewport root instead of stale canvas dimensions', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"><div id="project_view_alpha"><canvas id="eve_surface_project"></canvas></div></div></body></html>');
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 920 });
    Object.defineProperty(dom.window, 'devicePixelRatio', { configurable: true, value: 1 });
    const view = dom.window.document.getElementById('view');
    const host = dom.window.document.getElementById('project_view_alpha');
    const canvas = dom.window.document.getElementById('eve_surface_project');
    setBox(view, 1440, 920);
    setBox(host, 0, 0);
    canvas.width = 640;
    canvas.height = 360;

    const size = resolveRenderSurfaceSize({
        canvas,
        host,
        resizeEntry: {
            contentBoxSize: [{ inlineSize: 640, blockSize: 360 }],
            devicePixelContentBoxSize: [{ inlineSize: 640, blockSize: 360 }]
        }
    });

    assert.equal(size.width, 1440);
    assert.equal(size.height, 920);
    assert.equal(size.pixelWidth, 1440);
    assert.equal(size.pixelHeight, 920);
});

test('Project render surface reacts to visualViewport resize', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"><div id="project_view_alpha"></div></div></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    Object.defineProperty(dom.window, 'devicePixelRatio', { configurable: true, value: 1 });
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 600 });
    const visualViewport = new dom.window.EventTarget();
    Object.defineProperty(visualViewport, 'width', { configurable: true, value: 800 });
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 600 });
    Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: visualViewport });
    dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
    dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);

    const view = dom.window.document.getElementById('view');
    const host = dom.window.document.getElementById('project_view_alpha');
    setBox(view, 0, 0);
    setBox(host, 0, 0);
    const intents = [];
    const surface = ensureRenderSurface({
        zone: 'project',
        host,
        onIntent: (intent) => {
            intents.push(intent);
            return intent;
        }
    });
    assert.equal(surface.style.width, '800px');
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 700 });
    Object.defineProperty(visualViewport, 'width', { configurable: true, value: 1200 });
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 700 });
    visualViewport.dispatchEvent(new dom.window.Event('resize'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 20));

    assert.equal(surface.style.width, '1200px');
    assert.equal(surface.style.height, '700px');
    assert.equal(intents.some((intent) => intent.kind === 'surface.resize'), true);
});
