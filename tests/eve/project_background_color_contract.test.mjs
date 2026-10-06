import {test} from 'vitest';
import assert from 'node:assert/strict';
import {CONTEXT_MENUS} from '../../eVe/intuition/menu/context_menus_loader.js';
import {resolveContextMenu} from '../../eVe/intuition/menu/context_menu_resolver.js';
import {
    readDefaultSurfaceBackgroundRgba,
    readSurfaceBackgroundRgba
} from '../../eVe/domains/rendering/surface_background_defaults.js';
import {createUserSurfaceBackgroundTextureRuntime} from '../../eVe/domains/rendering/user_surface_background_texture_runtime.js';
import eventBus from '../../eVe/core/event_bus.js';
import {installDom} from './unified_rendering_test_helpers.mjs';
import {PROJECT_SCENES, sceneState} from '../../eVe/domains/rendering/project_scene_state.js';

const PROJECT_ID = 'project_surface_color';
const PROJECT_RED = 'rgba(244, 67, 54, 1.00)';
const RED_RGBA = [244 / 255, 67 / 255, 54 / 255, 1];

const projectRailKeys = (level) => resolveContextMenu({
    menu: 'sidebar',
    context: {type: 'project', level, mode: 'edit', permissions: {}}
}).map((item) => item.key);

// The colour of the project is a canonical property, so the surface runtime is
// proven on the real text the colour tool commits. The canvas stub only exists
// because jsdom has no 2D context, and the project surface paints no texture.
const createCanvasStub = () => {
    const context = new Proxy({
        createImageData: (width, height) => ({width, height, data: new Uint8ClampedArray(Math.max(1, width * height) * 4)}),
        getImageData: (x, y, width, height) => ({width, height, data: new Uint8ClampedArray(Math.max(1, width * height) * 4)}),
        createLinearGradient: () => ({addColorStop() {}}),
        createPattern: () => null
    }, {
        get: (target, key, receiver) => (
            typeof key === 'string' && !(key in target) ? () => {} : Reflect.get(target, key, receiver)
        )
    });
    return {width: 0, height: 0, getContext: () => context};
};

const createProjectSurfaceHarness = ({mode = 'project', projectState = null, params = {}, backgroundOptions = {}} = {}) => {
    const previous = {window: globalThis.window, document: globalThis.document};
    const dom = installDom('<!doctype html><html><body><div id="eve_view"></div></body></html>');
    const windowRef = dom.window;
    const createElement = windowRef.document.createElement.bind(windowRef.document);
    windowRef.document.createElement = (tagName) => (
        String(tagName || '').toLowerCase() === 'canvas' ? createCanvasStub() : createElement(tagName)
    );
    windowRef.__eveWorkspaceMode = {mode, projectId: PROJECT_ID};
    windowRef.__currentProject = {id: PROJECT_ID};
    let state = projectState;
    windowRef.Atome = {
        getStateCurrent: async (id) => (String(id) === PROJECT_ID && state ? {state} : null)
    };
    const published = [];
    windowRef.addEventListener('eve:surface-background-changed', (event) => published.push(event.detail));
    const runtime = createUserSurfaceBackgroundTextureRuntime({
        view: windowRef.document.getElementById('eve_view'),
        params,
        resolveBackgroundMediaUrl: (url) => url,
        isProtectedMediaUrl: () => false,
        resolveProtectedBackgroundObjectUrl: async () => '',
        clearBackgroundObjectUrl: () => {},
        ...backgroundOptions
    });
    return {
        runtime,
        windowRef,
        published,
        latest: () => windowRef.__eveSurfaceBackground || null,
        commit: (properties) => {
            state = {properties};
            eventBus.emit('atome:changed', {event: {atome_id: PROJECT_ID, kind: 'set'}, state});
        },
        restore: () => {
            globalThis.window = previous.window;
            globalThis.document = previous.document;
        }
    };
};

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('navigation retains a protected wallpaper URL, including a fetch completing inside a project', async () => {
    let resolveMedia;
    let fetches = 0;
    let clears = 0;
    const harness = createProjectSurfaceHarness({mode: 'dashboard', params: {
        backgroundSource: 'image', backgroundImageUrl: '/protected.mp4', backgroundMediaKind: 'video'
    }, backgroundOptions: {
        isProtectedMediaUrl: () => true,
        resolveProtectedBackgroundObjectUrl: () => { fetches++; return new Promise(resolve => { resolveMedia = resolve; }); },
        clearBackgroundObjectUrl: () => { clears++; }
    }});
    const navigate = mode => {
        harness.windowRef.__eveWorkspaceMode = {mode, projectId: PROJECT_ID};
        harness.windowRef.dispatchEvent(new harness.windowRef.CustomEvent('eve:workspace-mode-changed'));
    };
    try {
        harness.runtime.start();
        navigate('project');
        resolveMedia('blob:retained-wallpaper');
        await nextTick();
        assert.equal(harness.latest().sourceUrl, 'blob:retained-wallpaper');
        assert.deepEqual(harness.latest().cover, readDefaultSurfaceBackgroundRgba());
        const signature = harness.latest().signature;
        for (const mode of ['dashboard', 'project', 'dashboard', 'project', 'dashboard']) {
            navigate(mode);
            assert.equal(harness.latest().sourceUrl, 'blob:retained-wallpaper');
            assert.equal(harness.latest().signature, signature);
            assert.deepEqual(harness.latest().cover, mode === 'project' ? readDefaultSurfaceBackgroundRgba() : [0, 0, 0, 0]);
        }
        assert.equal(fetches, 1);
        assert.equal(clears, 0, 'navigation cannot revoke the decoder source');
    } finally {
        harness.runtime.stop(); harness.restore();
    }
});

test('the project rail resolves the colour tool and keeps the sibling project actions', () => {
    assert.equal(CONTEXT_MENUS.menus.sidebar.objects.project.couleur, 'beginner',
        'the project composition of the rail declares the colour tool');
    for (const level of ['beginner', 'advanced']) {
        const keys = projectRailKeys(level);
        assert.ok(keys.includes('couleur'), `the ${level} project rail exposes the colour tool`);
        assert.ok(keys.includes('select_all'), `the ${level} project rail keeps its previous rail-only tool`);
        assert.ok(keys.includes('paste') && keys.includes('import'), `the ${level} project rail keeps its earlier actions`);
    }
});

test('full-surface Dashboard Matrix shares the current wallpaper across project loads and colour commits', async () => {
    const previousForeground = sceneState.foregroundProjectId;
    const previousScene = PROJECT_SCENES.get(PROJECT_ID);
    const params = {backgroundSource: 'image', backgroundImageUrl: '/wallpaper.mp4', backgroundMediaKind: 'video'};
    const harness = createProjectSurfaceHarness({projectState: {properties: {background: PROJECT_RED}}, params});
    try {
        sceneState.foregroundProjectId = PROJECT_ID;
        PROJECT_SCENES.set(PROJECT_ID, {records: new Map()});
        harness.runtime.start();
        await nextTick();
        assert.equal(harness.latest().sourceUrl, '/wallpaper.mp4');
        assert.deepEqual(harness.latest().cover, RED_RGBA);
        const records = PROJECT_SCENES.get(PROJECT_ID).records;
        records.set('matrix', {id: 'matrix', properties: {module: 'matrix', layout_fill: 'surface', matrix_background: false}});
        const rendered = () => harness.windowRef.dispatchEvent(new harness.windowRef.CustomEvent('eve:project-render-done', {detail: {projectId: PROJECT_ID}}));
        rendered();
        assert.equal(harness.latest().sourceUrl, '/wallpaper.mp4');
        assert.equal(harness.latest().mediaKind, 'video');
        assert.equal(harness.latest().fit, 'cover');
        assert.deepEqual(harness.latest().cover, [0, 0, 0, 0]);
        const wallpaper = harness.latest();
        harness.commit({background: '#000'});
        assert.deepEqual(harness.latest(), wallpaper, 'a project colour cannot cover the active Dashboard wallpaper');
        params.backgroundImageUrl = '/current.png';
        params.backgroundMediaKind = 'image';
        harness.runtime.resize();
        assert.equal(harness.latest().sourceUrl, '/current.png', 'the current wallpaper is read live');
        records.get('matrix').properties.layout_fill = 'none';
        rendered();
        assert.deepEqual(harness.latest().cover, [0, 0, 0, 1], 'ordinary Matrix covers the retained wallpaper');
        records.get('matrix').properties.layout_fill = 'surface';
        records.get('matrix').properties.deleted = true;
        rendered();
        assert.deepEqual(harness.latest().cover, [0, 0, 0, 1], 'deleted Dashboard does not reveal the wallpaper');
    } finally {
        harness.runtime.stop();
        harness.restore();
        sceneState.foregroundProjectId = previousForeground;
        if (previousScene) PROJECT_SCENES.set(PROJECT_ID, previousScene);
        else PROJECT_SCENES.delete(PROJECT_ID);
    }
});

test('surface background colours convert to the RGBA floats the Bevy patch consumes', () => {
    assert.deepEqual(readSurfaceBackgroundRgba('#f44336'), RED_RGBA);
    assert.deepEqual(readSurfaceBackgroundRgba('rgb(244, 67, 54)'), RED_RGBA);
    assert.deepEqual(readSurfaceBackgroundRgba('rgba(244, 67, 54, 1.00)'), RED_RGBA);
    assert.deepEqual(readSurfaceBackgroundRgba('rgba(244, 67, 54, 0.5)'), [244 / 255, 67 / 255, 54 / 255, 0.5]);
    assert.deepEqual(readSurfaceBackgroundRgba('rgba(244, 67, 54, 4)'), [244 / 255, 67 / 255, 54 / 255, 1]);
    assert.deepEqual(readSurfaceBackgroundRgba('#fff'), [1, 1, 1, 1]);
    for (const invalid of [null, '', 'red', '#12345', 'color(display-p3 1 0 0)']) {
        assert.equal(readSurfaceBackgroundRgba(invalid), null, `${String(invalid)} is not a surface colour`);
    }
    assert.deepEqual(readDefaultSurfaceBackgroundRgba(), [245 / 255, 245 / 255, 247 / 255, 1],
        'the shared default surface colour the project falls back to is unchanged');
});

test('the project surface paints the committed project colour and the default without one', async () => {
    const harness = createProjectSurfaceHarness({projectState: {properties: {background: PROJECT_RED}}});
    try {
        harness.runtime.start();
        assert.deepEqual(harness.latest().cover, readDefaultSurfaceBackgroundRgba(),
            'the cover is painted before the canonical colour is read');
        await nextTick();
        const wallpaperSignature = harness.latest().signature;
        assert.deepEqual(harness.latest().cover, RED_RGBA);
        // A colour applied while the work surface is visible repaints at the gesture.
        harness.commit({background: 'rgba(0, 188, 212, 1.00)'});
        assert.equal(harness.latest().signature, wallpaperSignature);
        assert.deepEqual(harness.latest().cover, [0, 188 / 255, 212 / 255, 1]);
    } finally {
        harness.runtime.stop();
        harness.restore();
    }
});

test('a project without colour keeps the default surface and the colour tool spellings all project', async () => {
    const plain = createProjectSurfaceHarness({projectState: {properties: {name: 'probe'}}});
    try {
        plain.runtime.start();
        await nextTick();
        assert.deepEqual(plain.latest().cover, readDefaultSurfaceBackgroundRgba());
    } finally {
        plain.runtime.stop();
        plain.restore();
    }
    for (const [key, value] of [['backgroundColor', '#4caf50'], ['bg', 'rgb(33, 150, 243)']]) {
        const harness = createProjectSurfaceHarness({projectState: {properties: {[key]: value}}});
        try {
            harness.runtime.start();
            await nextTick();
            assert.deepEqual(harness.latest().cover, readSurfaceBackgroundRgba(value),
                `${key} is read as the project cover colour`);
        } finally {
            harness.runtime.stop();
            harness.restore();
        }
    }
});

test('a colour committed outside the project surface never repaints it', async () => {
    const harness = createProjectSurfaceHarness({mode: 'dashboard', projectState: {properties: {background: PROJECT_RED}}});
    try {
        harness.runtime.start();
        await nextTick();
        const dashboardSignature = harness.latest().signature;
        harness.commit({background: 'rgba(244, 67, 54, 1.00)'});
        assert.equal(harness.latest().signature, dashboardSignature,
            'the Dashboard wallpaper keeps its own signature owner');
        assert.ok(!String(harness.latest().signature).startsWith('project-color-surface-background:'));
    } finally {
        harness.runtime.stop();
        harness.restore();
    }
});
