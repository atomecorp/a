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

const createProjectSurfaceHarness = ({mode = 'project', projectState = null} = {}) => {
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
        params: {},
        resolveBackgroundMediaUrl: (url) => url,
        isProtectedMediaUrl: () => false,
        resolveProtectedBackgroundObjectUrl: async () => '',
        clearBackgroundObjectUrl: () => {}
    });
    return {
        runtime,
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
        assert.equal(harness.latest().signature, 'project-default-surface-background',
            'the project is painted before the canonical colour is read');
        await nextTick();
        assert.equal(harness.latest().signature, `project-color-surface-background:${PROJECT_ID}:${RED_RGBA.join(':')}`);
        assert.deepEqual(harness.latest().color, RED_RGBA);
        assert.equal(harness.latest().mode, 'color');
        // A colour applied while the work surface is visible repaints at the gesture.
        harness.commit({background: 'rgba(0, 188, 212, 1.00)'});
        assert.equal(harness.latest().signature, `project-color-surface-background:${PROJECT_ID}:${[0, 188 / 255, 212 / 255, 1].join(':')}`);
        assert.deepEqual(harness.latest().color, [0, 188 / 255, 212 / 255, 1]);
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
        assert.equal(plain.latest().signature, 'project-default-surface-background');
        assert.deepEqual(plain.latest().color, readDefaultSurfaceBackgroundRgba());
    } finally {
        plain.runtime.stop();
        plain.restore();
    }
    for (const [key, value] of [['backgroundColor', '#4caf50'], ['bg', 'rgb(33, 150, 243)']]) {
        const harness = createProjectSurfaceHarness({projectState: {properties: {[key]: value}}});
        try {
            harness.runtime.start();
            await nextTick();
            assert.ok(String(harness.latest().signature).startsWith('project-color-surface-background:'),
                `${key} is read as the project surface colour`);
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
