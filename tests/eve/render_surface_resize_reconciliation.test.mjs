import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    ensureRenderSurface,
    reconcileRenderSurfaceSize,
    syncRenderSurfaceSize,
    subscribeRenderSurfaceSize
} from '../../eVe/domains/rendering/surface_runtime.js';
import { BEVY_MAIN_MENU_ATOME_ID } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createBevyUiMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js';

const setViewport = (target, width, height) => {
    Object.defineProperty(target, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(target, 'clientHeight', { configurable: true, value: height });
    target.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height
    });
};
const treeContains = (node, id) => Boolean(node && (
    node.id === id || (node.children || []).some((child) => treeContains(child, id))
));

test('settled project surface rejects a late stale native viewport resize', async () => {
    const dom = new JSDOM(
        '<!doctype html><html><body><div id="view"><div id="project_view_alpha"></div></div></body></html>',
        { url: 'http://localhost/' }
    );
    const previous = {
        document: globalThis.document,
        window: globalThis.window,
        HTMLElement: globalThis.HTMLElement,
        Node: globalThis.Node
    };
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    let menuRuntime = null;
    try {
        Object.defineProperty(dom.window, 'devicePixelRatio', { configurable: true, value: 1 });
        Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 800 });
        Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 600 });
        const visualViewport = new dom.window.EventTarget();
        Object.defineProperty(visualViewport, 'width', { configurable: true, value: 800 });
        Object.defineProperty(visualViewport, 'height', { configurable: true, value: 600 });
        Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: visualViewport });
        dom.window.__EVE_NATIVE_VIEWPORT__ = { width: 800, height: 600 };
        dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
        dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);

        const view = dom.window.document.getElementById('view');
        const host = dom.window.document.getElementById('project_view_alpha');
        setViewport(view, 800, 600);
        setViewport(host, 800, 600);
        const surface = ensureRenderSurface({ zone: 'project', host });
        const publications = [];
        const release = subscribeRenderSurfaceSize(surface, ({ size }) => publications.push(size));
        const menuUpdates = [];
        dom.window.eveBevyUiRuntime = {
            mountTree: async (payload) => { menuUpdates.push(payload.tree); return payload.tree; },
            updateTree: async (payload) => { menuUpdates.push(payload.tree); return payload.tree; },
            unmountTree: async () => null
        };
        menuRuntime = createBevyUiMainMenuRuntime({
            content: {
                toolbox: { children: ['home'] },
                home: { atome_tool: true, label: 'home', icon: 'home', tool_id: 'tool.main.home', action: 'toggle' }
            },
            surfaceResolver: () => surface,
            runtimeResolver: () => dom.window.eveBevyUiRuntime
        });
        await menuRuntime.showFully();

        for (const [width, height] of [[900, 620], [1050, 660], [1200, 700]]) {
            Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: width });
            Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: height });
            Object.defineProperty(visualViewport, 'width', { configurable: true, value: width });
            Object.defineProperty(visualViewport, 'height', { configurable: true, value: height });
            setViewport(view, width, height);
            setViewport(host, width, height);
            dom.window.dispatchEvent(new dom.window.Event('resize'));
            await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
        }
        assert.equal(surface.style.width, '1200px');
        assert.equal(surface.style.height, '700px');
        assert.equal(publications.length, 0, 'live resize must not rebuild UI trees at intermediate sizes');

        dom.window.dispatchEvent(new dom.window.CustomEvent('eve:native-viewport-resize'));
        await new Promise((resolve) => dom.window.setTimeout(resolve, 220));
        assert.equal(surface.style.width, '1200px');
        assert.equal(surface.style.height, '700px');
        assert.deepEqual(publications, [{
            width: 1200,
            height: 700,
            devicePixelRatio: 1,
            pixelWidth: 1200,
            pixelHeight: 700,
            rawPixelWidth: 1200,
            rawPixelHeight: 700,
            maxTextureDimension2D: null,
            clamped: false
        }]);
        const menuState = menuRuntime.measure();
        const finalMenuTree = menuUpdates.at(-1);
        assert.equal(menuState.active, true, 'main toolbar must remain active after resize settlement');
        assert.equal(menuState.treeMounted, true, 'main toolbar must remain mounted after resize settlement');
        assert.ok(treeContains(finalMenuTree.root, BEVY_MAIN_MENU_ATOME_ID), 'main toolbar handle must remain present');
        assert.deepEqual(finalMenuTree.root.style.size, [1200, 700]);
        assert.ok(finalMenuTree.layout.y >= 0);
        assert.ok(finalMenuTree.layout.y + finalMenuTree.layout.itemSize <= 700, 'main toolbar must remain inside the viewport');
        release();
    } finally {
        menuRuntime?.destroy?.();
        globalThis.document = previous.document;
        globalThis.window = previous.window;
        globalThis.HTMLElement = previous.HTMLElement;
        globalThis.Node = previous.Node;
    }
});

test.each([
    ['iPhone', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }],
    ['iPad desktop mode', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }]
])('%s keyboard contraction survives text scene remount and stale host/window resize signals', async (_name, navigatorValues) => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"><div id="project_view_keyboard"></div></div></body></html>');
    const win = dom.window;
    Object.entries(navigatorValues).forEach(([key, value]) => Object.defineProperty(win.navigator, key, { configurable: true, value }));
    Object.defineProperty(win, 'devicePixelRatio', { configurable: true, value: 3 });
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 844 });
    const viewport = new win.EventTarget();
    Object.defineProperty(viewport, 'width', { configurable: true, value: 390 });
    Object.defineProperty(viewport, 'height', { configurable: true, value: 844 });
    Object.defineProperty(win, 'visualViewport', { configurable: true, value: viewport });
    win.__EVE_NATIVE_VIEWPORT__ = { width: 390, height: 844 };
    win.requestAnimationFrame = callback => win.setTimeout(() => callback(Date.now()), 0);
    win.cancelAnimationFrame = id => win.clearTimeout(id);
    const host = win.document.getElementById('project_view_keyboard');
    const view = win.document.getElementById('view');
    setViewport(host, 390, 844);
    setViewport(view, 390, 844);
    const intents = [];
    const surface = ensureRenderSurface({ host, documentRef: win.document, onIntent: intent => intents.push(intent) });
    try {
        Object.defineProperty(viewport, 'height', { configurable: true, value: 463 });
        assert.equal(reconcileRenderSurfaceSize(surface, { host, viewportSource: 'visual' }), true);
        assert.equal(surface.height, 695);
        assert.equal(surface.style.height, '463px');
        const mutations = [];
        const observer = new win.MutationObserver(records => mutations.push(...records));
        observer.observe(surface, { attributes: true, attributeFilter: ['width', 'height', 'style'] });

        // Text creation and UI projection ensure the existing surface again while
        // WKWebView's fullscreen host still has its pre-keyboard rectangle.
        assert.equal(ensureRenderSurface({ host, documentRef: win.document }), surface);
        assert.equal(surface.style.height, '463px', 'remount must never expand the canvas behind the keyboard');
        syncRenderSurfaceSize(surface, host);
        assert.equal(surface.height, 695, 'silent measurement must preserve the contracted physical backing');
        reconcileRenderSurfaceSize(surface, { host, viewportSource: 'window' });
        reconcileRenderSurfaceSize(surface, { host, viewportSource: 'native' });
        win.dispatchEvent(new win.Event('resize'));
        win.dispatchEvent(new win.CustomEvent('eve:native-viewport-resize'));
        await new Promise(resolve => win.setTimeout(resolve, 220));
        assert.equal(surface.style.height, '463px');
        assert.equal(surface.height, 695);
        assert.equal(mutations.length, 0, 'unchanged keyboard geometry must not clear or stretch the canvas for one frame');
        assert.equal(intents.length, 1, 'the keyboard opening must reach the renderer only once');
        observer.disconnect();

        Object.defineProperty(viewport, 'height', { configurable: true, value: 844 });
        viewport.dispatchEvent(new win.Event('resize'));
        await new Promise(resolve => win.setTimeout(resolve, 220));
        assert.equal(surface.style.height, '844px');
        assert.equal(surface.height, 1266);
        assert.equal(intents.length, 2, 'closing the keyboard restores the full canvas once');
    } finally {
        win.close();
    }
});

test('desktop height resize retains its fresh window source when visual viewport is stale', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="project_view_desktop"></div></body></html>');
    const win = dom.window;
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 600 });
    Object.defineProperty(win, 'visualViewport', { configurable: true, value: { width: 800, height: 600 } });
    win.requestAnimationFrame = callback => win.setTimeout(() => callback(Date.now()), 0);
    const host = win.document.getElementById('project_view_desktop');
    setViewport(host, 800, 600);
    const surface = ensureRenderSurface({ host, documentRef: win.document });
    try {
        Object.defineProperty(win, 'innerHeight', { configurable: true, value: 800 });
        setViewport(host, 800, 800);
        reconcileRenderSurfaceSize(surface, { host, viewportSource: 'window' });
        assert.equal(surface.style.height, '800px');
        ensureRenderSurface({ host, documentRef: win.document });
        assert.equal(surface.style.height, '800px');
    } finally {
        win.close();
    }
});
