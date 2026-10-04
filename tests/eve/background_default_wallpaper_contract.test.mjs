import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, test, vi } from 'vitest';

// The wallpaper resolution lives in the real user background runtime, so this
// suite boots that runtime against a JSDOM page with its `#view` host instead of
// guessing the behaviour from the source text. profile_api and asset_box are the
// only mocked transports; the workspace mode scoping is covered by
// tests/probes/bevy_surface_background_runtime.probe.mjs.
const profileApi = vi.hoisted(() => ({
    loadUserProfile: vi.fn(),
    upsertUserProfile: vi.fn()
}));
const assetBox = vi.hoisted(() => ({
    sendFileToServer: vi.fn(),
    downloadRemoteWallpaper: vi.fn()
}));

vi.mock('../../eVe/domains/user/profile_api.js', () => profileApi);
vi.mock('../../eVe/domains/media/asset_box.js', () => assetBox);

const videoSource = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('../../eVe/domains/rendering/bevy_video_stream_source_runtime.js', () => ({
    registerBevyVideoStreamSource: videoSource.register
}));

const DEFAULT_BACKGROUND_URL = '/assets/images/Background/eVe.PNG';
const STORED_BACKGROUND_URL = '/api/uploads/ada.png';

const createCanvasContext = () => ({
    clearRect() {},
    fillRect() {},
    createLinearGradient() {
        return { addColorStop() {} };
    },
    createPattern() {
        return null;
    },
    getImageData() {
        return { data: new Uint8ClampedArray(4) };
    }
});

let restoreGlobals = null;
let fetchMock = null;

const bootBackgroundRuntime = async ({ currentUser = null, embedded = false } = {}) => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', {
        url: 'http://127.0.0.1:3001/'
    });
    const { window } = dom;
    if (embedded) window.__HOST_ENV = 'app';
    window.HTMLCanvasElement.prototype.getContext = () => createCanvasContext();
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0);
    window.cancelAnimationFrame = () => {};
    if (currentUser) window.__currentUser = currentUser;

    const previous = {
        window: globalThis.window,
        document: globalThis.document,
        CustomEvent: globalThis.CustomEvent,
        localStorage: globalThis.localStorage,
        fetch: globalThis.fetch,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        cancelAnimationFrame: globalThis.cancelAnimationFrame
    };
    restoreGlobals = () => {
        const targets = ['window', 'document', 'CustomEvent', 'localStorage', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame'];
        targets.forEach((key) => {
            if (previous[key] === undefined) delete globalThis[key];
            else globalThis[key] = previous[key];
        });
        restoreGlobals = null;
    };

    fetchMock = vi.fn(async () => ({ ok: false, status: 401 }));
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.CustomEvent = window.CustomEvent;
    globalThis.localStorage = window.localStorage;
    globalThis.fetch = fetchMock;
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

    vi.resetModules();
    const background = await import('../../eVe/user/background.js');
    background.startUserBackgroundRuntime();
    return { window, background };
};

beforeEach(() => {
    profileApi.loadUserProfile.mockReset();
    profileApi.upsertUserProfile.mockReset();
    assetBox.sendFileToServer.mockReset();
    assetBox.downloadRemoteWallpaper.mockReset();
});

afterEach(() => {
    if (restoreGlobals) restoreGlobals();
    vi.useRealTimers();
});

test('a session without a stored background paints the bundled eVe.PNG without touching the profile', async () => {
    const { window, background } = await bootBackgroundRuntime();
    const api = window.eveBackground;
    const params = api.getParams();

    assert.equal(typeof background.defaultUserBackgroundParams, 'function');
    assert.equal(params.backgroundSource, 'image');
    assert.equal(params.backgroundImageUrl, DEFAULT_BACKGROUND_URL);
    assert.equal(params.backgroundImageFileName, 'eVe.PNG');
    assert.equal(api.defaults.backgroundSource, 'image');
    assert.equal(api.defaults.backgroundImageUrl, DEFAULT_BACKGROUND_URL);
    assert.equal(api.defaults.backgroundImageFileName, 'eVe.PNG');

    const published = window.__eveSurfaceBackground;
    assert.equal(published.signature, `image:cover:${DEFAULT_BACKGROUND_URL}`);
    assert.equal(published.mode, 'image');
    assert.equal(published.sourceUrl, DEFAULT_BACKGROUND_URL);

    // The bundled asset is a public document path, not protected media, so the
    // runtime must publish it as-is instead of fetching a blob for it.
    assert.equal(fetchMock.mock.calls.length, 0);
    assert.equal(profileApi.loadUserProfile.mock.calls.length, 0, 'a guest session has no profile to read');
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0, 'the resolution default is never persisted');
});


test('a fresh iOS installation publishes the exact bundled wallpaper path with a cover crop', async () => {
    const { window, background } = await bootBackgroundRuntime({ embedded: true });
    const { DEFAULT_BACKGROUND_IMAGE_ASSET } = await import('../../eVe/domains/rendering/user_background_image_fit.js');
    const fileName = DEFAULT_BACKGROUND_IMAGE_ASSET.split('/').pop();
    // existsSync alone cannot catch the wrong case on a macOS filesystem.
    const bundledFiles = readdirSync(new URL('../../atome/src/assets/images/Background/', import.meta.url));
    assert.ok(bundledFiles.includes(fileName), 'the URL must match the bundled filename case exactly');
    const params = background.defaultUserBackgroundParams();
    assert.equal(params.backgroundImageUrl, './assets/images/Background/eVe.PNG');
    assert.equal(window.__eveSurfaceBackground.sourceUrl, params.backgroundImageUrl);
    assert.equal(window.__eveSurfaceBackground.mode, 'image');
    assert.equal(window.__eveSurfaceBackground.fit, 'cover');
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0);
});

test('a stored profile background wins over the bundled default and is left untouched', async () => {
    profileApi.loadUserProfile.mockResolvedValue({
        ok: true,
        profile: {
            name: 'Ada',
            preferences: {
                background: {
                    backgroundSource: 'image',
                    backgroundImageUrl: STORED_BACKGROUND_URL,
                    backgroundImageFileName: 'ada.png'
                }
            }
        }
    });

    const { window, background } = await bootBackgroundRuntime({ currentUser: { id: 'user-ada' } });

    await vi.waitFor(() => assert.equal(window.eveBackground.getParams().backgroundImageUrl, STORED_BACKGROUND_URL));
    assert.equal(window.eveBackground.getParams().backgroundImageFileName, 'ada.png');
    assert.equal(background.resolveBackgroundMediaUrl(STORED_BACKGROUND_URL), `http://127.0.0.1:3001${STORED_BACKGROUND_URL}`);
    assert.equal(fetchMock.mock.calls[0][0], `http://127.0.0.1:3001${STORED_BACKGROUND_URL}`);
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0);
});

test('another owner without a stored background resolves back to the bundled default', async () => {
    vi.useFakeTimers();
    profileApi.loadUserProfile.mockResolvedValue({
        ok: true,
        profile: {
            preferences: {
                background: { backgroundSource: 'image', backgroundImageUrl: STORED_BACKGROUND_URL }
            }
        }
    });

    const { window } = await bootBackgroundRuntime({ currentUser: { id: 'user-ada' } });
    await vi.waitFor(() => assert.equal(window.eveBackground.getParams().backgroundImageUrl, STORED_BACKGROUND_URL));

    profileApi.loadUserProfile.mockResolvedValue({ ok: true, profile: { preferences: {} } });
    window.__currentUser = { id: 'user-grace' };
    // The profile watcher polls every 1200 ms, so the owner switch is observed by
    // advancing one real virtual tick instead of waiting a real second.
    await vi.advanceTimersByTimeAsync(1200);
    assert.equal(profileApi.loadUserProfile.mock.calls.at(-1)[0], 'user-grace');
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(window.eveBackground.getParams().backgroundImageUrl, DEFAULT_BACKGROUND_URL);

    assert.equal(window.eveBackground.getParams().backgroundSource, 'image');
    assert.equal(window.eveBackground.getParams().backgroundImageFileName, 'eVe.PNG');
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0, 'switching owner must not write a background');
});

test('a pattern or colour edit takes the render back from the selected image', async () => {
    const { window } = await bootBackgroundRuntime();
    const backgroundState = {
        params: {
            backgroundSource: 'image',
            backgroundImageUrl: DEFAULT_BACKGROUND_URL,
            backgroundImageFileName: 'eVe.PNG',
            backgroundColorR: 245
        },
        saved: [],
        profileUserId: null,
        profile: null,
        lastSavedSignature: null,
        saveTimer: null
    };
    const setParams = vi.fn();
    window.eveBackground.setParams = setParams;
    vi.useFakeTimers();

    const { createBackgroundPrefs } = await import('../../eVe/intuition/tools/background_prefs.js');
    const prefs = createBackgroundPrefs({ backgroundState });

    prefs.applyBackgroundParams({ backgroundColorR: 12 });
    assert.equal(backgroundState.params.backgroundSource, 'generated');
    assert.deepEqual(setParams.mock.calls[0][0], { backgroundColorR: 12, backgroundSource: 'generated' });
    assert.equal(backgroundState.params.backgroundImageUrl, DEFAULT_BACKGROUND_URL, 'the last image stays reusable');

    prefs.applyBackgroundParams({ backgroundSource: 'image', backgroundImageUrl: STORED_BACKGROUND_URL });
    assert.equal(backgroundState.params.backgroundSource, 'image');
    assert.equal(backgroundState.params.backgroundImageUrl, STORED_BACKGROUND_URL);
});


test.each(['tile', 'contain'])('a legacy %s preference keeps the media and uses cover without rewriting the profile', async (backgroundImageFit) => {
    const { window } = await bootBackgroundRuntime();
    window.eveBackground.applyPreferences({
        backgroundSource: 'image', backgroundMediaKind: 'video',
        backgroundImageUrl: '/assets/videos/wallpaper.mov', backgroundImageFit
    });
    const published = window.__eveSurfaceBackground;
    assert.equal(published.fit, 'cover');
    assert.equal(published.mediaKind, 'video');
    assert.equal(published.sourceUrl, '/assets/videos/wallpaper.mov');
    assert.equal(Object.hasOwn(window.eveBackground.getParams(), 'backgroundImageFit'), false);
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0);
});


const installCoverCanvasHarness = (window) => {
    const draws = [];
    window.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
    window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect() {}, fillRect() {}, putImageData() {},
        drawImage(...args) { draws.push(args); }
    });
    const surface = window.document.createElement('canvas');
    surface.id = 'eve_surface_project';
    window.document.body.appendChild(surface);
    return { draws, surface };
};

test.each(['image', 'video'])('the login Canvas covers portrait, landscape and square surfaces with a %s', async (kind) => {
    const { window } = await bootBackgroundRuntime();
    const { draws, surface } = installCoverCanvasHarness(window);
    const runtime = await import('../../eVe/domains/rendering/bevy_surface_background_runtime.js');
    const { createLoginCanvasBackground } = await import('../../eVe/intuition/tools/user_login_canvas_background.js');
    const applied = [];
    runtime.registerBevySurfaceBackgroundRuntime(surface, { started: true, wasmModule: {
        apply_atome_bevy_surface_background(patch) { applied.push(patch); }
    } });
    for (const [sw, sh] of [[400, 200], [200, 400], [300, 300]]) {
        const video = { videoWidth: sw, videoHeight: sh, readyState: 2, seeking: false };
        videoSource.register.mockResolvedValue({ ok: true, video, dispose() {} });
        runtime.publishBevySurfaceBackground({
            signature: `${kind}:${sw}:${sh}`, color: [0, 0, 0, 1], mediaKind: kind,
            ...(kind === 'video' ? { sourceUrl: `/video/${sw}/${sh}` } : {
                texture: { width: sw, height: sh, rgba: new Uint8Array(sw * sh * 4) }
            })
        }, window);
        const painter = createLoginCanvasBackground(window.document);
        for (const [width, height] of [[400, 800], [1000, 500], [600, 600]]) {
            draws.length = 0;
            const context = surface.getContext('2d');
            assert.equal((await painter.paint(context, width, height, 1)).ready, true);
            const [, x, y, w, h] = draws.at(-1);
            assert.ok(w >= width && h >= height);
            assert.ok(Math.abs(w / h - sw / sh) < 0.0001);
            assert.ok(Math.abs(x - (width - w) / 2) < 0.0001);
            assert.ok(Math.abs(y - (height - h) / 2) < 0.0001);
            assert.equal(draws.length, kind === 'video' ? 2 : 1);
        }
        painter.destroy();
    }
    assert.ok(applied.length > 0);
    for (const patch of applied) {
        for (const key of ['fit', 'backdrop', 'tile_size']) assert.equal(Object.hasOwn(patch, key), false);
    }
});

test('the video background waits for metadata before applying its natural dimensions', async () => {
    const { window } = await bootBackgroundRuntime();
    const { surface } = installCoverCanvasHarness(window);
    const runtime = await import('../../eVe/domains/rendering/bevy_surface_background_runtime.js');
    const applied = [];
    const video = new window.EventTarget();
    Object.assign(video, { videoWidth: 0, videoHeight: 0 });
    let waiting = false;
    const addEventListener = video.addEventListener.bind(video);
    video.addEventListener = (...args) => { if (args[0] === 'loadedmetadata') waiting = true; addEventListener(...args); };
    videoSource.register.mockResolvedValue({ ok: true, video, dispose() {} });
    runtime.registerBevySurfaceBackgroundRuntime(surface, { started: true, wasmModule: {
        apply_atome_bevy_surface_background(patch) { applied.push(patch); }
    } });
    runtime.publishBevySurfaceBackground({ signature: 'waiting-video', mediaKind: 'video', sourceUrl: '/waiting.mov', color: [0, 0, 0, 1] }, window);
    await vi.waitFor(() => assert.equal(waiting, true));
    assert.equal(applied.some(patch => patch.video), false);
    Object.assign(video, { videoWidth: 1920, videoHeight: 1080 });
    video.dispatchEvent(new window.Event('loadedmetadata'));
    await vi.waitFor(() => assert.ok(applied.some(patch => patch.video?.width === 1920 && patch.video?.height === 1080)));
});
