import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    ensureRenderSurface,
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
