import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const installDomGlobals = (window) => {
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.HTMLImageElement = window.HTMLImageElement;
    globalThis.Element = window.Element;
    globalThis.SVGElement = window.SVGElement;
    globalThis.CustomEvent = window.CustomEvent;
    globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
};

const buildContent = () => ({
    toolbox: { children: ['home', 'ai', 'mode', 'find'] },
    home: { id: 'tool.main.home', icon: 'home' },
    ai: { id: 'tool.main.ai', icon: 'ai' },
    mode: { id: 'tool.main.mode', icon: 'settings', kind: 'palette', children: ['perform', 'edit', 'consume'] },
    perform: { id: 'tool.main.perform', icon: 'play' },
    edit: { id: 'tool.main.edit', icon: 'edit' },
    consume: { id: 'tool.main.consume', icon: 'eye' },
    find: { id: 'tool.main.find', icon: 'search' }
});

const createFixture = async (handedness) => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        pretendToBeVisual: true,
        url: 'http://127.0.0.1/'
    });
    installDomGlobals(dom.window);
    const { setHandedness } = await import('../../eVe/intuition/core/state.js');
    const { createIntuitionXRibbon } = await import('../../eVe/intuition/ribbon/menu.js');
    const { RIBBON_TOKENS } = await import('../../eVe/intuition/ribbon/tokens.js');
    setHandedness(handedness, { source: 'test.main_ribbon_handedness_placement' });
    const api = createIntuitionXRibbon({ content: buildContent() });
    const root = document.querySelector('#eve_intuitionx_main_ribbon');
    assert.ok(root);
    return { api, root, shadowPx: `${RIBBON_TOKENS.uiShadowSizePx}px` };
};

const rootChildRoles = (root) => Array.from(root.children).map((node) => node.dataset.role);

const trackForRoot = (root) => root.querySelector('[data-role="eve_intuitionx-track"]');

const topLevelKeysFromHandle = (root) => {
    const hosts = Array.from(trackForRoot(root).children);
    const keys = hosts.map((host) => (
        Array.from(host.children).find((node) => node.dataset?.role === 'eve_intuitionx-tool')?.dataset.key
    ));
    return root.dataset.handedness === 'right' ? keys.reverse() : keys;
};

const paletteChildrenFromHandle = (root, key) => {
    const host = Array.from(trackForRoot(root).children).find((node) => (
        Array.from(node.children).find((child) => child.dataset?.role === 'eve_intuitionx-tool')?.dataset.key === key
    ));
    assert.ok(host);
    const children = Array.from(host.querySelectorAll('[data-role="eve_intuitionx-palette-children-track"] > [data-role="eve_intuitionx-tool"]'))
        .map((button) => button.dataset.key);
    return root.dataset.handedness === 'right' ? children.reverse() : children;
};

test('main ribbon docks on the right for right-handed mode', async () => {
    const { api, root, shadowPx } = await createFixture('right');
    try {
        assert.equal(root.dataset.handedness, 'right');
        assert.equal(root.style.right, shadowPx);
        assert.equal(root.style.left, 'auto');
        assert.deepEqual(rootChildRoles(root), [
            'eve_intuitionx-cap',
            'eve_intuitionx-viewport',
            'eve_intuitionx-handle'
        ]);
        assert.deepEqual(topLevelKeysFromHandle(root), ['home', 'ai', 'mode', 'find']);
        assert.deepEqual(paletteChildrenFromHandle(root, 'mode'), ['perform', 'edit', 'consume']);
    } finally {
        api.destroy();
    }
});

test('main ribbon docks on the left for left-handed mode', async () => {
    const { api, root, shadowPx } = await createFixture('left');
    try {
        assert.equal(root.dataset.handedness, 'left');
        assert.equal(root.style.left, shadowPx);
        assert.equal(root.style.right, 'auto');
        assert.deepEqual(rootChildRoles(root), [
            'eve_intuitionx-handle',
            'eve_intuitionx-viewport',
            'eve_intuitionx-cap'
        ]);
        assert.deepEqual(topLevelKeysFromHandle(root), ['home', 'ai', 'mode', 'find']);
        assert.deepEqual(paletteChildrenFromHandle(root, 'mode'), ['perform', 'edit', 'consume']);
    } finally {
        api.destroy();
    }
});
