import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { installDom } from './unified_rendering_test_helpers.mjs';

const profileApi = vi.hoisted(() => ({
    loadUserProfile: vi.fn(),
    upsertUserProfile: vi.fn()
}));
const assetBox = vi.hoisted(() => ({
    sendFileToServer: vi.fn(),
    fetchRemoteWallpaperFile: vi.fn()
}));

vi.mock('../../eVe/domains/user/profile_api.js', () => profileApi);
vi.mock('../../eVe/domains/media/asset_box.js', () => assetBox);
const panel = vi.hoisted(() => ({options: null}));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_background_runtime.js', () => ({
    createBackgroundPanelSurface: options => { panel.options = options; return {surface: {id: 'background'}}; }
}));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({
    registerBevyPanelSurface() {}, refreshBevyPanelSurface() {}, openBevyPanelSurface() {}, closeBevyPanelSurface() {}
}));

const { createBackgroundPrefs } = await import('../../eVe/intuition/tools/background_prefs.js');
const { createBackgroundImage } = await import('../../eVe/intuition/tools/background_image.js');

const createStorage = () => {
    const records = new Map();
    return {
        getItem: (key) => records.get(String(key)) || null,
        setItem: (key, value) => records.set(String(key), String(value)),
        removeItem: (key) => records.delete(String(key))
    };
};

beforeEach(() => {
    profileApi.loadUserProfile.mockReset();
    profileApi.upsertUserProfile.mockReset();
    assetBox.sendFileToServer.mockReset();
    assetBox.fetchRemoteWallpaperFile.mockReset();
});

test('an immediate Background save resolves only after the canonical profile mutation', async () => {
    const previousWindow = globalThis.window;
    const events = [];
    globalThis.window = {
        localStorage: createStorage(),
        __currentUser: { id: 'background-user' },
        __eveProfilePreferences: {},
        dispatchEvent: (event) => events.push(event)
    };
    profileApi.loadUserProfile.mockResolvedValue({ ok: true, profile: { name: 'Ada', preferences: {} } });
    let releaseSave = null;
    profileApi.upsertUserProfile.mockImplementation(() => new Promise((resolve) => { releaseSave = resolve; }));
    const state = {
        params: { backgroundSource: 'image', backgroundImageUrl: '/media/new.png' },
        saved: [],
        profileUserId: null,
        profile: null,
        saveTimer: null
    };
    try {
        const prefs = createBackgroundPrefs({ backgroundState: state });
        let settled = false;
        const pending = prefs.schedulePreferenceSave({ immediate: true }).then((result) => {
            settled = true;
            return result;
        });
        await vi.waitFor(() => assert.equal(typeof releaseSave, 'function'));
        assert.equal(settled, false);
        releaseSave({ ok: true });
        const result = await pending;
        assert.equal(result.ok, true);
        assert.equal(profileApi.upsertUserProfile.mock.calls[0][0].preferences.background.backgroundImageUrl, '/media/new.png');
        assert.equal(state.profile.preferences.background.backgroundImageUrl, '/media/new.png');
    } finally {
        globalThis.window = previousWindow;
    }
});

test('import and random download apply the media before awaiting canonical persistence', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {};
    const order = [];
    assetBox.sendFileToServer.mockImplementation(async file => ({ ok: true, mediaUrl: `/media/${file.name}`, fileName: file.name }));
    assetBox.fetchRemoteWallpaperFile.mockResolvedValue({ ok: true, file: { name: 'random.png', type: 'image/png' } });
    const image = createBackgroundImage({
        applyBackgroundParams: (params) => order.push(`apply:${params.backgroundImageUrl}`),
        schedulePreferenceSave: async ({ immediate }) => {
            order.push(`persist:${immediate}`);
            return { ok: true };
        }
    });
    try {
        const imported = await image.importBackgroundImageFile({ name: 'imported.png', type: 'image/png' });
        const downloaded = await image.downloadRandomBackgroundImage();
        assert.deepEqual(order, [
            'apply:/media/imported.png',
            'persist:true',
            'apply:/media/random.png',
            'persist:true'
        ]);
        assert.deepEqual(imported, { ok: true, persisted: true, mediaUrl: '/media/imported.png' });
        assert.equal(downloaded.mediaUrl, '/media/random.png');
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Background persistence failures remain explicit alongside the applied image', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {};
    assetBox.sendFileToServer.mockImplementation(async file => ({ ok: true, mediaUrl: `/media/${file.name}`, fileName: file.name }));
    assetBox.fetchRemoteWallpaperFile.mockResolvedValue({ ok: true, file: { name: 'random.png', type: 'image/png' } });
    const image = createBackgroundImage({
        applyBackgroundParams: () => {},
        schedulePreferenceSave: async () => ({ ok: false, error: 'background_profile_save_failed' })
    });
    try {
        assert.deepEqual(
            await image.importBackgroundImageFile({ name: 'imported.png', type: 'image/png' }),
            { ok: true, persisted: false, persistError: 'background_profile_save_failed', mediaUrl: '/media/imported.png' }
        );
        assert.deepEqual(await image.downloadRandomBackgroundImage(), {
            ok: true, persisted: false, persistError: 'background_profile_save_failed',
            mediaUrl: '/media/random.png', stored: true
        });
    } finally {
        globalThis.window = previousWindow;
    }
});

test('opening or hydrating the Background panel projects the resolved choice without publishing another selection', async () => {
    const previous = {window: globalThis.window, document: globalThis.document, CustomEvent: globalThis.CustomEvent};
    const dom = installDom();
    const win = dom.window;
    globalThis.CustomEvent = win.CustomEvent;
    const current = {backgroundSource: 'image', backgroundImageUrl: '/latest.png'};
    win.eveBackground = {getParams: () => current, setParams: vi.fn()};
    win.__eveProfilePreferences = {background: {backgroundImageUrl: '/old.png'}, backgrounds: []};
    const events = [];
    win.addEventListener('eve:profile-preferences-updated', e => events.push(e.detail.source));
    vi.useFakeTimers();
    try {
        await import('../../eVe/intuition/tools/background.js');
        panel.options.onOpen();
        assert.deepEqual(panel.options.readParams(), current);
        win.dispatchEvent(new win.CustomEvent('eve:profile-preferences-updated', {detail: {
            preferences: {background: {backgroundImageUrl: '/old.png'}, backgrounds: []}
        }}));
        assert.deepEqual(panel.options.readParams(), current);
        assert.equal(win.eveBackground.setParams.mock.calls.length, 0);
        assert.ok(!events.includes('background_panel'), 'hydration cannot become a user selection');
        const preferences = win.__eveProfilePreferences;
        win.dispatchEvent(new win.CustomEvent('squirrel:user-logged-in'));
        assert.equal(win.__eveProfilePreferences, preferences, 'panel lifecycle cannot clear the shared session preferences');
    } finally {
        vi.clearAllTimers(); vi.useRealTimers(); dom.window.close();
        Object.assign(globalThis, previous);
    }
});

test('rapid background saves commit in selection order and cannot restore an older global preference', async () => {
    const previous = globalThis.window;
    globalThis.window = {__currentUser: {id: 'owner'}, __eveProfilePreferences: {}};
    profileApi.loadUserProfile.mockResolvedValue({ok: true, profile: {preferences: {}}});
    let release;
    profileApi.upsertUserProfile.mockImplementationOnce(() => new Promise(resolve => {release = resolve;})).mockResolvedValue({ok: true});
    const state = {params: {backgroundImageUrl: '/first.png'}, saved: [], profileUserId: null, profile: null};
    try {
        const prefs = createBackgroundPrefs({backgroundState: state});
        const first = prefs.schedulePreferenceSave({immediate: true});
        await vi.waitFor(() => assert.equal(typeof release, 'function'));
        state.params = {backgroundImageUrl: '/latest.png'};
        const latest = prefs.schedulePreferenceSave({immediate: true});
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(profileApi.upsertUserProfile.mock.calls.length, 1);
        release({ok: true}); await Promise.all([first, latest]);
        assert.deepEqual(profileApi.upsertUserProfile.mock.calls.map(([profile]) => profile.preferences.background.backgroundImageUrl), ['/first.png', '/latest.png']);
        assert.equal(window.__eveProfilePreferences.background.backgroundImageUrl, '/latest.png');
    } finally { globalThis.window = previous; }
});

test('reselecting the saved wallpaper while another save is pending remains the last durable choice', async () => {
    const previous = globalThis.window;
    globalThis.window = {__currentUser: {id: 'owner'}, __eveProfilePreferences: {}};
    profileApi.loadUserProfile.mockResolvedValue({ok: true, profile: {preferences: {}}});
    profileApi.upsertUserProfile.mockResolvedValue({ok: true});
    const state = {params: {backgroundImageUrl: '/saved.png'}, saved: []};
    let release;
    try {
        const prefs = createBackgroundPrefs({backgroundState: state});
        await prefs.schedulePreferenceSave({immediate: true});
        profileApi.upsertUserProfile.mockImplementationOnce(() => new Promise(resolve => {release = resolve;}));
        state.params = {backgroundImageUrl: '/intermediate.png'};
        const intermediate = prefs.schedulePreferenceSave({immediate: true});
        await vi.waitFor(() => assert.equal(typeof release, 'function'));
        state.params = {backgroundImageUrl: '/saved.png'};
        const last = prefs.schedulePreferenceSave({immediate: true});
        release({ok: true}); await Promise.all([intermediate, last]);
        assert.equal(profileApi.upsertUserProfile.mock.calls.at(-1)[0].preferences.background.backgroundImageUrl, '/saved.png');
    } finally { globalThis.window = previous; }
});

test('a delayed background save cannot write or project into the next account', async () => {
    const previous = globalThis.window;
    globalThis.window = {__currentUser: {id: 'owner'}, __eveProfilePreferences: {}};
    let release;
    profileApi.loadUserProfile.mockImplementation(() => new Promise(resolve => {release = resolve;}));
    const state = {params: {backgroundImageUrl: '/owner.png'}, saved: []};
    try {
        const prefs = createBackgroundPrefs({backgroundState: state});
        const save = prefs.schedulePreferenceSave({immediate: true});
        await vi.waitFor(() => assert.equal(typeof release, 'function'));
        window.__currentUser = {id: 'other'};
        window.__eveProfilePreferences = {background: {backgroundImageUrl: '/other.png'}};
        release({ok: true, profile: {preferences: {}}});
        assert.equal((await save).error, 'background_owner_changed');
        assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0);
        assert.equal(window.__eveProfilePreferences.background.backgroundImageUrl, '/other.png');
    } finally { globalThis.window = previous; }
});
