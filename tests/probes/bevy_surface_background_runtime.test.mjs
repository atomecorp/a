import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const createWindowHarness = () => {
    const listeners = new Map();
    const surfaces = [];
    let drawImageCalls = 0;

    class TestCustomEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    }

    const documentRef = {
        createElement(tagName) {
            if (tagName === 'img') {
                return {
                    naturalWidth: 2,
                    naturalHeight: 1,
                    width: 2,
                    height: 1,
                    complete: true,
                    addEventListener() {},
                    removeEventListener() {},
                    decode: async () => {}
                };
            }
            if (tagName === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext() {
                        return {
                            clearRect() {},
                            drawImage() {
                                drawImageCalls += 1;
                            },
                            getImageData() {
                                return { data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) };
                            }
                        };
                    }
                };
            }
            throw new Error(`unexpected element:${tagName}`);
        },
        querySelectorAll(selector) {
            return selector === 'canvas' ? surfaces : [];
        }
    };

    globalThis.CustomEvent = TestCustomEvent;
    globalThis.document = documentRef;
    globalThis.window = {
        addEventListener(type, callback) {
            const callbacks = listeners.get(type) || [];
            callbacks.push(callback);
            listeners.set(type, callbacks);
        },
        dispatchEvent(event) {
            (listeners.get(event.type) || []).forEach((callback) => callback(event));
        }
    };

    return {
        documentRef,
        surfaces,
        dispatch(detail) {
            window.dispatchEvent(new CustomEvent('eve:surface-background-changed', { detail }));
        },
        drawImageCalls: () => drawImageCalls
    };
};

test('Bevy surface background runtime applies generated texture payloads', async () => {
    const harness = createWindowHarness();
    const moduleUrl = `${pathToFileUrl(path.join(repoRoot, 'eVe/domains/rendering/bevy_surface_background_runtime.js'))}?generated=${Date.now()}`;
    const { registerBevySurfaceBackgroundRuntime, readLatestBevySurfaceBackground } = await import(moduleUrl);
    const calls = [];
    const surface = { ownerDocument: harness.documentRef };
    harness.surfaces.push(surface);
    registerBevySurfaceBackgroundRuntime(surface, {
        started: true,
        wasmModule: {
            apply_atome_bevy_surface_background: (payload) => calls.push(payload),
            request_atome_bevy_redraw: () => calls.push({ redraw: true })
        }
    });

    harness.dispatch({
        signature: 'generated:test',
        color: [0.2, 0.3, 0.4, 1],
        texture: { width: 1, height: 1, rgba: [8, 9, 10, 255] }
    });
    await tick();

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
        signature: 'generated:test',
        color: [0.2, 0.3, 0.4, 1],
        texture: { width: 1, height: 1, rgba: [8, 9, 10, 255] }
    });
    assert.deepEqual(calls[1], { redraw: true });
    assert.equal(readLatestBevySurfaceBackground().signature, 'generated:test');
});

test('Bevy surface background runtime caches decoded image textures by source URL', async () => {
    const harness = createWindowHarness();
    const moduleUrl = `${pathToFileUrl(path.join(repoRoot, 'eVe/domains/rendering/bevy_surface_background_runtime.js'))}?image=${Date.now()}`;
    const { registerBevySurfaceBackgroundRuntime } = await import(moduleUrl);
    const calls = [];
    const surface = { ownerDocument: harness.documentRef };
    harness.surfaces.push(surface);
    registerBevySurfaceBackgroundRuntime(surface, {
        started: true,
        wasmModule: {
            apply_atome_bevy_surface_background: (payload) => calls.push(payload),
            request_atome_bevy_redraw: () => {}
        }
    });

    const detail = { signature: 'image:test', color: [0, 0, 0, 1], sourceUrl: 'blob:test-image' };
    harness.dispatch(detail);
    await tick();
    harness.dispatch(detail);
    await tick();

    assert.equal(harness.drawImageCalls(), 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].texture, { width: 2, height: 1, rgba: [1, 2, 3, 255, 4, 5, 6, 255] });
});

test('Bevy surface background runtime applies payload emitted before surface registration', async () => {
    const harness = createWindowHarness();
    window.__eveSurfaceBackground = {
        signature: 'generated:pre-register',
        color: [0.1, 0.2, 0.3, 1],
        texture: { width: 1, height: 1, rgba: [11, 12, 13, 255] }
    };
    const moduleUrl = `${pathToFileUrl(path.join(repoRoot, 'eVe/domains/rendering/bevy_surface_background_runtime.js'))}?pre=${Date.now()}`;
    const { registerBevySurfaceBackgroundRuntime } = await import(moduleUrl);
    const calls = [];
    const surface = { ownerDocument: harness.documentRef };
    harness.surfaces.push(surface);

    registerBevySurfaceBackgroundRuntime(surface, {
        started: true,
        wasmModule: {
            apply_atome_bevy_surface_background: (payload) => calls.push(payload),
            request_atome_bevy_redraw: () => calls.push({ redraw: true })
        }
    });
    await tick();

    assert.equal(calls.length, 2);
    assert.equal(calls[0].signature, 'generated:pre-register');
    assert.deepEqual(calls[1], { redraw: true });
});

test('Bevy web renderer registers the surface background after renderer start', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/domains/rendering/bevy_web_renderer_runtime.js'), 'utf8');
    assert.equal(
        source.includes('registerBevySurfaceBackgroundRuntime(canvas, state);\n        scheduleDeferredInitialNodes'),
        false,
        'surface background registration must not happen while the renderer state is still marked as not started'
    );
    const startedStateIndex = source.indexOf('started: true,\n            startPromise: null');
    const registerIndex = source.indexOf('registerBevySurfaceBackgroundRuntime(canvas, SURFACE_RUNTIME.get(canvas))');
    assert.ok(startedStateIndex > 0, 'renderer start state update must remain explicit');
    assert.ok(registerIndex > startedStateIndex, 'surface background registration must run after the started state is stored');
});

test('user background source no longer creates the legacy DOM background layer', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/user/background.js'), 'utf8');
    assert.equal(source.includes('eve_background_visual_layer'), false);
    assert.equal(source.includes('backgroundLayer'), false);
    assert.equal(source.includes('createUserSurfaceBackgroundTextureRuntime'), true);
});

test('user background module import has no view-owned side effect', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    delete globalThis.window;
    delete globalThis.document;
    try {
        const moduleUrl = `${pathToFileUrl(path.join(repoRoot, 'eVe/user/background.js'))}?no_view=${Date.now()}`;
        const { startUserBackgroundRuntime } = await import(moduleUrl);
        assert.equal(typeof startUserBackgroundRuntime, 'function');
        assert.throws(
            () => startUserBackgroundRuntime(),
            /user_background_view_required/
        );
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
        if (previousDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = previousDocument;
        }
    }
});

test('user background restore waits for async auth identity after refresh', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/user/background.js'), 'utf8');
    assert.match(source, /const currentUserId = await resolveCurrentUserId\(\);/);
    assert.match(source, /window\.__currentUser\?\.user_id/);
    assert.match(source, /info\?\.user_id/);
});

test('saved background selection persists as the current wallpaper', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/intuition/tools/background.js'), 'utf8');
    const applySavedStart = source.indexOf('const applySavedBackground =');
    const deleteStart = source.indexOf('const deleteSavedBackground =');
    assert.ok(applySavedStart > 0);
    assert.ok(deleteStart > applySavedStart);
    const applySavedSource = source.slice(applySavedStart, deleteStart);
    assert.match(applySavedSource, /schedulePreferenceSave\(\{ immediate: true \}\);/);
});

test('image background choices persist immediately instead of depending on debounce', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/intuition/tools/background.js'), 'utf8');
    assert.match(source, /schedulePreferenceSave\(\{ immediate: true \}\);/);
    assert.match(source, /const schedulePreferenceSave = \(\{ immediate = false \} = \{\}\)/);
});

test('local wallpaper choice is not overwritten by stale profile polling', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/user/background.js'), 'utf8');
    assert.match(source, /pendingLocalBackgroundSignature/);
    assert.match(source, /source === 'background_panel'/);
    assert.match(source, /signature !== pendingLocalBackgroundSignature/);
    assert.match(source, /pendingLocalBackgroundSignature = ''/);
});

test('image source changes render without waiting for generated-background raf', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/user/background.js'), 'utf8');
    assert.match(source, /imageSourceChanged/);
    assert.match(source, /key === 'backgroundSource' \|\| key === 'backgroundImageUrl'/);
    assert.match(source, /runtime\.resize\(\)/);
});

test('protected wallpaper fetch starts from the media URL without token refresh gating', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/user/background.js'), 'utf8');
    const resolverStart = source.indexOf('const resolveProtectedBackgroundObjectUrl =');
    const signatureStart = source.indexOf('const buildBackgroundPreferencesSignature =');
    assert.ok(resolverStart > 0);
    assert.ok(signatureStart > resolverStart);
    const resolverSource = source.slice(resolverStart, signatureStart);
    assert.match(resolverSource, /fetch\(primaryCandidate/);
    assert.doesNotMatch(resolverSource, /ensureFastifyToken/);
});

test('surface background resize path coalesces and avoids repeated image emission', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/domains/rendering/user_surface_background_texture_runtime.js'), 'utf8');
    assert.match(source, /RESIZE_RENDER_DELAY_MS/);
    assert.match(source, /new ResizeObserver\(scheduleResize\)/);
    assert.match(source, /window\.addEventListener\('resize', scheduleResize\)/);
    assert.match(source, /lastImageSignature === signature/);
    assert.match(source, /pendingImageSignature === signature/);
});

test('Bevy background runtime skips duplicate surface signatures', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'eVe/domains/rendering/bevy_surface_background_runtime.js'), 'utf8');
    assert.match(source, /SURFACE_SIGNATURES = new WeakMap/);
    assert.match(source, /SURFACE_SIGNATURES\.get\(surface\) === signature/);
    assert.match(source, /IMAGE_TEXTURE_CACHE\.set\(sourceUrl, pending\)/);
});

function pathToFileUrl(filePath) {
    return new URL(`file://${filePath}`).href;
}
