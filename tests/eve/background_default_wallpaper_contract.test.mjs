import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, test, vi } from 'vitest';
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
const mediaAuth = vi.hoisted(() => ({
    buildUserHeaders: vi.fn(), getCloudToken: vi.fn(), getLocalToken: vi.fn()
}));
vi.mock('../../eVe/domains/media/asset_box_auth.js', () => mediaAuth);
const videoSource = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('../../eVe/domains/rendering/bevy_video_stream_source_runtime.js', () => ({
    registerBevyVideoStreamSource: videoSource.register
}));
const DEFAULT_BACKGROUND_URL = '/assets/videos/eVe.mp4';
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
const bootBackgroundRuntime = async ({ currentUser = null, embedded = false, preferences = null } = {}) => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', {
        url: 'http://127.0.0.1:3001/'
    });
    const { window } = dom;
    if (preferences) window.__eveProfilePreferences = preferences;
    const surfaces = [];
    window.addEventListener('eve:surface-background-changed', event => surfaces.push(event.detail));
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
    return { window, background, surfaces };
};
beforeEach(() => {
    mediaAuth.buildUserHeaders.mockReset().mockResolvedValue({ 'X-User-Id': 'wallpaper-owner' });
    mediaAuth.getCloudToken.mockReset().mockReturnValue('cloud-memory-session');
    mediaAuth.getLocalToken.mockReset().mockReturnValue('native-memory-session');
    videoSource.register.mockReset();
    profileApi.loadUserProfile.mockReset();
    profileApi.upsertUserProfile.mockReset();
    assetBox.sendFileToServer.mockReset();
    assetBox.downloadRemoteWallpaper.mockReset();
});
afterEach(async () => {
    if (restoreGlobals && globalThis.document) {
        Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'hidden'});
        document.dispatchEvent(new window.Event('visibilitychange'));
        await Promise.resolve();
        window.close();
    }
    if (restoreGlobals) restoreGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});
test('a session without a stored background paints the bundled eVe.mp4 without touching the profile', async () => {
    const { window, background } = await bootBackgroundRuntime();
    const api = window.eveBackground;
    const params = api.getParams();
    assert.equal(typeof background.defaultUserBackgroundParams, 'function');
    assert.equal(params.backgroundSource, 'image');
    assert.equal(params.backgroundImageUrl, DEFAULT_BACKGROUND_URL);
    assert.equal(params.backgroundImageFileName, 'eVe.mp4');
    assert.equal(params.backgroundMediaKind, 'video');
    assert.equal(api.defaults.backgroundSource, 'image');
    assert.equal(api.defaults.backgroundImageUrl, DEFAULT_BACKGROUND_URL);
    assert.equal(api.defaults.backgroundImageFileName, 'eVe.mp4');
    const published = window.__eveSurfaceBackground;
    assert.equal(published.signature, `video:cover:${DEFAULT_BACKGROUND_URL}`);
    assert.equal(published.mode, 'image');
    assert.equal(published.mediaKind, 'video');
    assert.equal(published.sourceUrl, DEFAULT_BACKGROUND_URL);
    assert.equal(fetchMock.mock.calls.length, 0);
    assert.equal(profileApi.loadUserProfile.mock.calls.length, 0, 'a guest session has no profile to read');
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0, 'the resolution default is never persisted');
});
test('a fresh iOS installation publishes the exact bundled wallpaper path with a cover crop', async () => {
    const { window, background } = await bootBackgroundRuntime({ embedded: true });
    const { DEFAULT_BACKGROUND_MEDIA_ASSET } = await import('../../eVe/domains/rendering/user_background_image_fit.js');
    const fileName = DEFAULT_BACKGROUND_MEDIA_ASSET.split('/').pop();
    const bundledFiles = readdirSync(new URL('../../atome/src/assets/videos/', import.meta.url));
    assert.ok(bundledFiles.includes(fileName), 'the URL must match the bundled filename case exactly');
    const params = background.defaultUserBackgroundParams();
    assert.equal(params.backgroundImageUrl, './assets/videos/eVe.mp4');
    assert.equal(window.__eveSurfaceBackground.sourceUrl, params.backgroundImageUrl);
    assert.equal(window.__eveSurfaceBackground.mode, 'image');
    assert.equal(window.__eveSurfaceBackground.mediaKind, 'video');
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
    assert.equal(window.eveBackground.getParams().backgroundMediaKind, '', 'legacy saved images keep their kind');
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
    window.dispatchEvent(new window.CustomEvent('squirrel:auth-checked'));
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(profileApi.loadUserProfile.mock.calls.at(-1)[0], 'user-grace');
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(window.eveBackground.getParams().backgroundImageUrl, DEFAULT_BACKGROUND_URL);
    assert.equal(window.eveBackground.getParams().backgroundSource, 'image');
    assert.equal(window.eveBackground.getParams().backgroundImageFileName, 'eVe.mp4');
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0, 'switching owner must not write a background');
});
test('a settled session never re-reads the profile on a timer', async () => {
    vi.useFakeTimers();
    profileApi.loadUserProfile.mockResolvedValue({ ok: true, profile: { preferences: {} } });
    await bootBackgroundRuntime({ currentUser: { id: 'user-ada' } });
    await vi.advanceTimersByTimeAsync(0);
    const reads = profileApi.loadUserProfile.mock.calls.length;
    assert.equal(reads, 1, 'the owner profile is read once at start');
    await vi.advanceTimersByTimeAsync(60000);
    assert.equal(profileApi.loadUserProfile.mock.calls.length, reads);
});
test('a background saved on another device applies from the synchronized profile patch', async () => {
    profileApi.loadUserProfile.mockResolvedValue({ ok: true, profile: { preferences: {} } });
    const { window } = await bootBackgroundRuntime({ currentUser: { id: 'user-ada' } });
    await vi.waitFor(() => assert.equal(profileApi.loadUserProfile.mock.calls.length, 1));
    const remotePreferences = {
        background: { backgroundSource: 'image', backgroundImageUrl: STORED_BACKGROUND_URL, backgroundImageFileName: 'ada.png' }
    };
    const patch = (atomeId) => new window.CustomEvent('squirrel:atome-updated', { detail: {
        atome_id: atomeId, source: 'realtime',
        properties: { eve_profile: JSON.stringify({ name: 'Ada', preferences: remotePreferences }) }
    } });
    window.dispatchEvent(patch('someone-else'));
    assert.equal(window.eveBackground.getParams().backgroundImageUrl, DEFAULT_BACKGROUND_URL, 'another atome is ignored');
    window.dispatchEvent(patch('user-ada'));
    assert.equal(window.eveBackground.getParams().backgroundImageUrl, STORED_BACKGROUND_URL);
    assert.equal(profileApi.loadUserProfile.mock.calls.length, 1, 'the patch is applied without a profile read');
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0);
});
test('a pattern or colour edit takes the render back from the selected image', async () => {
    const { window } = await bootBackgroundRuntime();
    const backgroundState = {
        params: {
            backgroundSource: 'image',
            backgroundImageUrl: DEFAULT_BACKGROUND_URL,
            backgroundImageFileName: 'eVe.mp4',
            backgroundColorR: 245
        },
        saved: [],
        profileUserId: null,
        profile: null,
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
test.each([false, true])('a protected video uses its current session before starting a muted cover loop (native=%s)', async (embedded) => {
    const { window } = await bootBackgroundRuntime({ embedded });
    const { surface } = installCoverCanvasHarness(window);
    const runtime = await import('../../eVe/domains/rendering/bevy_surface_background_runtime.js');
    const patches = [];
    runtime.registerBevySurfaceBackgroundRuntime(surface, { started: true, wasmModule: {
        apply_atome_bevy_surface_background(patch) { patches.push(patch); }
    } });
    const blobUrl = 'blob:authorized-wallpaper-video';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(blobUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    window.localStorage.setItem('local_auth_token', 'obsolete-local');
    window.localStorage.setItem('cloud_auth_token', 'obsolete-cloud');
    if (embedded) {
        mediaAuth.getLocalToken.mockReturnValue('not-yet-refreshed');
        mediaAuth.buildUserHeaders.mockImplementation(async () => {
            mediaAuth.getLocalToken.mockReturnValue('native-memory-session');
            return { 'X-User-Id': 'wallpaper-owner' };
        });
    }
    const expectedBearer = embedded ? 'native-memory-session' : 'cloud-memory-session';
    fetchMock.mockImplementation(async (url, options) => ({
        ok: options.headers.Authorization === `Bearer ${expectedBearer}`,
        status: options.headers.Authorization === `Bearer ${expectedBearer}` ? 200 : 401,
        blob: async () => new Blob(['video'], { type: 'video/webm' })
    }));
    const video = { videoWidth: 1920, videoHeight: 1080, readyState: 2, seeking: false };
    videoSource.register.mockResolvedValue({ ok: true, video, dispose() {} });
    window.dispatchEvent(new window.CustomEvent('eve:profile-preferences-updated', {detail: {
        source: 'background_panel', preferences: {background: {
            backgroundSource: 'image', backgroundMediaKind: 'video',
            backgroundImageUrl: '/api/uploads/wallpaper.webm?media_user_id=wallpaper-owner'
        }}
    }}));
    await vi.waitFor(() => assert.equal(patches.at(-1)?.video?.width, 1920));
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(fetchMock.mock.calls[0][1].headers.Authorization, `Bearer ${expectedBearer}`);
    assert.equal(mediaAuth.buildUserHeaders.mock.calls.length, 1);
    assert.equal(window.__eveSurfaceBackground.fit, 'cover');
    assert.equal(window.__eveSurfaceBackground.sourceUrl, blobUrl);
    const options = videoSource.register.mock.calls.at(-1)[0];
    assert.equal(options.source, blobUrl);
    assert.equal(options.autoplay, true);
    assert.equal(options.loop, true);
    assert.equal(options.muted, true);
});
const { createBackgroundImage } = await import('../../eVe/intuition/tools/background_image.js');
test.each([{ name: 'wallpaper.mov', type: 'video/quicktime' }, { name: 'wallpaper.WEBM', type: '' }])('a video import uses the canonical local upload without forcing cloud ($name)', async (file) => {
    assetBox.sendFileToServer.mockResolvedValue({ ok: true, mediaUrl: '/api/uploads/wallpaper.mov', fileName: file.name });
    const patches = [];
    const image = createBackgroundImage({ applyBackgroundParams: params => patches.push(params), schedulePreferenceSave: async () => ({ ok: true }) });
    const result = await image.importBackgroundImageFile(file);
    assert.equal(result.ok, true);
    assert.deepEqual(assetBox.sendFileToServer.mock.calls[0][1], { typeOverride: 'video', createAtome: false });
    assert.equal(patches[0].backgroundMediaKind, 'video');
    assert.equal(patches[0].backgroundImageUrl, '/api/uploads/wallpaper.mov');
});
test.each(['video', 'image'])('use selection preserves the selected %s kind without uploading it again', async (kind) => {
    const previousWindow = globalThis.window;
    const extension = kind === 'video' ? 'mp4' : 'png';
    const patches = [];
    globalThis.window = { __selectedAtomeId: 'selected-media', Atome: {
        getStateCurrent: async () => ({ type: kind, properties: { media_url: `/api/uploads/media.${extension}`, file_name: `media.${extension}` } })
    } };
    try {
        const image = createBackgroundImage({ applyBackgroundParams: params => patches.push(params), schedulePreferenceSave: async () => ({ ok: true }) });
        const result = await image.applySelectedMediaAsBackground();
        assert.equal(result.ok, true);
        assert.equal(patches[0].backgroundMediaKind, kind);
        assert.equal(patches[0].backgroundImageAtomeId, 'selected-media');
        assert.equal(assetBox.sendFileToServer.mock.calls.length, 0);
    } finally { globalThis.window = previousWindow; }
});
test('authentication paints the bundled default video from the Dashboard playback owner', async () => {
    const { window } = await bootBackgroundRuntime();
    const { surface } = installCoverCanvasHarness(window);
    const video = { videoWidth: 1920, videoHeight: 1080, readyState: 2, seeking: false };
    videoSource.register.mockResolvedValue({ ok: true, video, dispose() {} });
    const runtime = await import('../../eVe/domains/rendering/bevy_surface_background_runtime.js');
    const patches = [];
    runtime.registerBevySurfaceBackgroundRuntime(surface, { started: true, wasmModule: {
        apply_atome_bevy_surface_background(patch) { patches.push(patch); }
    } });
    try {
        const result = await runtime.readResolvedBevySurfaceBackgroundMedia(surface);
        await runtime.ensureBevySurfaceBackgroundApplied(surface, result);
        assert.equal(result.mediaKind, 'video');
        assert.equal(videoSource.register.mock.calls.length, 1, 'login shares one decoder with the Dashboard');
        assert.equal(videoSource.register.mock.calls[0][0].source, DEFAULT_BACKGROUND_URL);
        for (const key of ['autoplay', 'loop', 'muted']) assert.equal(videoSource.register.mock.calls[0][0][key], true);
        assert.equal(patches.at(-1).video.width, 1920);
    } finally { /* The canonical background owner releases its decoder at teardown. */ }
});
test('logout authentication remains paintable while the video decoder is waiting', async () => {
    const { window } = await bootBackgroundRuntime();
    const { surface } = installCoverCanvasHarness(window);
    const runtime = await import('../../eVe/domains/rendering/bevy_surface_background_runtime.js');
    let finishDecode;
    videoSource.register.mockImplementation(() => new Promise(resolve => { finishDecode = resolve; }));
    runtime.registerBevySurfaceBackgroundRuntime(surface, { started: true, wasmModule: {
        apply_atome_bevy_surface_background() {}
    } });
    const resolve = () => runtime.readResolvedBevySurfaceBackgroundMedia(surface, null, { waitForVideo: false });
    try {
        const waiting = await Promise.race([
            resolve(),
            new Promise(resolve => window.setTimeout(() => resolve({ ready: false, blocked: true }), 30))
        ]);
        assert.equal(waiting.mediaKind, 'video', 'video loading must not block the login controls');
        assert.equal(waiting.mediaKind, 'video');
        const video = { videoWidth: 960, videoHeight: 960, readyState: 2, seeking: false };
        finishDecode({ ok: true, video, dispose() {} });
        await vi.waitFor(async () => assert.equal((await resolve()).video, video));
        assert.equal(videoSource.register.mock.calls.length, 1, 'pending frames share the same decoder');
    } finally { /* Decoder release belongs to the background owner. */ }
});
test('logout immediately restores the public bundled video before any profile read', async () => {
    const { window } = await bootBackgroundRuntime();
    window.eveBackground.setParams({ backgroundSource: 'image', backgroundMediaKind: 'image', backgroundImageUrl: '/custom.png' });
    window.dispatchEvent(new window.CustomEvent('squirrel:user-logged-out'));
    assert.equal(window.eveBackground.getParams().backgroundImageUrl, DEFAULT_BACKGROUND_URL);
    assert.equal(window.eveBackground.getParams().backgroundMediaKind, 'video');
    assert.equal(window.__eveSurfaceBackground.sourceUrl, DEFAULT_BACKGROUND_URL);
    assert.equal(window.__eveSurfaceBackground.mediaKind, 'video');
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0);
});

const stored = url => ({ok: true, profile: {preferences: {background: {backgroundSource: 'image', backgroundImageUrl: url}}}});
const publishProfile = (win, url, source = '') => win.dispatchEvent(new win.CustomEvent('eve:profile-preferences-updated', {detail: {source, preferences: stored(url).profile.preferences}}));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
test.each(['unreadable profile', 'unreadable identity'])('%s retains the resolved wallpaper instead of restoring the default', async scenario => {
    profileApi.loadUserProfile.mockResolvedValue(stored('/chosen.png'));
    const {window: win} = await bootBackgroundRuntime({currentUser: {id: 'owner'}});
    await vi.waitFor(() => assert.equal(win.eveBackground.getParams().backgroundImageUrl, '/chosen.png'));
    if (scenario === 'unreadable profile') profileApi.loadUserProfile.mockResolvedValue({ok: false, error: 'offline'});
    else delete win.__currentUser;
    win.dispatchEvent(new win.CustomEvent('squirrel:auth-checked'));
    await flush();
    assert.equal(win.eveBackground.getParams().backgroundImageUrl, '/chosen.png');
});
test.each(['new profile event', 'logout', 'owner change'])('a delayed profile read cannot replace a %s', async scenario => {
    let release;
    profileApi.loadUserProfile.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const {window: win} = await bootBackgroundRuntime({currentUser: {id: 'owner'}});
    await vi.waitFor(() => assert.equal(typeof release, 'function'));
    const visible = [];
    win.addEventListener('eve:surface-background-changed', event => visible.push(event.detail.sourceUrl));
    if (scenario === 'new profile event') publishProfile(win, '/latest.png');
    else if (scenario === 'logout') { delete win.__currentUser; win.dispatchEvent(new win.CustomEvent('squirrel:user-logged-out')); }
    else {
        win.__currentUser = {id: 'other'};
        profileApi.loadUserProfile.mockResolvedValue(stored('/other.png'));
        win.dispatchEvent(new win.CustomEvent('squirrel:auth-checked'));
    }
    release(stored('/old.png')); await flush(); await flush();
    assert.ok(!visible.includes('/old.png'), 'the superseded owner/read must never paint');
    assert.equal(win.eveBackground.getParams().backgroundImageUrl,
        scenario === 'new profile event' ? '/latest.png' : scenario === 'logout' ? DEFAULT_BACKGROUND_URL : '/other.png');
});
test('an unrelated preference event cannot replace a pending local wallpaper selection', async () => {
    profileApi.loadUserProfile.mockResolvedValue(stored('/old.png'));
    const {window: win} = await bootBackgroundRuntime({currentUser: {id: 'owner'}});
    await vi.waitFor(() => assert.equal(win.eveBackground.getParams().backgroundImageUrl, '/old.png'));
    publishProfile(win, '/picked.png', 'background_panel');
    publishProfile(win, '/old.png', 'weather_preferences');
    assert.equal(win.eveBackground.getParams().backgroundImageUrl, '/picked.png');
});
test('an older protected media fetch cannot revoke the current background blob', async () => {
    const {window: win} = await bootBackgroundRuntime();
    const releases = new Map();
    fetchMock.mockImplementation(url => new Promise(resolve => releases.set(url, resolve)));
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    win.eveBackground.setParams({backgroundImageUrl: '/api/uploads/old.png'});
    await vi.waitFor(() => assert.equal(releases.size, 1));
    win.eveBackground.setParams({backgroundImageUrl: '/api/uploads/new.png'});
    await vi.waitFor(() => assert.equal(releases.size, 2));
    releases.get('http://127.0.0.1:3001/api/uploads/new.png')({ok: true, blob: async () => new Blob(['new'])});
    await vi.waitFor(() => assert.ok(win.__eveSurfaceBackground.sourceUrl.startsWith('blob:')));
    const current = win.__eveSurfaceBackground.sourceUrl;
    releases.get('http://127.0.0.1:3001/api/uploads/old.png')({ok: true, blob: async () => new Blob(['old'])});
    await flush();
    assert.ok(!revoke.mock.calls.some(([url]) => url === current));
    assert.equal(win.__eveSurfaceBackground.sourceUrl, current);
});
test('a partial stored background is resolved from defaults without inheriting the previous image', async () => {
    profileApi.loadUserProfile.mockResolvedValue(stored('/old.png'));
    const {window: win} = await bootBackgroundRuntime({currentUser: {id: 'owner'}});
    await vi.waitFor(() => assert.equal(win.eveBackground.getParams().backgroundImageUrl, '/old.png'));
    win.dispatchEvent(new win.CustomEvent('eve:profile-preferences-updated', {detail: {preferences: {
        background: {backgroundSource: 'generated', backgroundColorR: 100, backgroundColorG: 120, backgroundColorB: 140}
    }}}));
    assert.equal(win.eveBackground.getParams().backgroundImageUrl, '');
    assert.equal(win.eveBackground.getParams().backgroundColorR, 100);
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0);
});
test('a stored image URL without a source discriminator still paints the explicit user image', async () => {
    profileApi.loadUserProfile.mockResolvedValue({ok: true, profile: {preferences: {
        background: {backgroundImageUrl: '/legacy-user.png'}
    }}});
    const {window: win} = await bootBackgroundRuntime({currentUser: {id: 'owner'}});
    await vi.waitFor(() => assert.equal(win.__eveSurfaceBackground.sourceUrl, '/legacy-user.png'));
    assert.equal(win.eveBackground.getParams().backgroundSource, 'image');
    assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0);
});
test('startup paints the published user wallpaper before any bundled default frame', async () => {
    const preferences = stored('/published.png').profile.preferences;
    profileApi.loadUserProfile.mockResolvedValue({ok: true, profile: {preferences}});
    const {surfaces} = await bootBackgroundRuntime({currentUser: {id: 'owner'}, preferences});
    assert.equal(surfaces[0].sourceUrl, '/published.png');
});
