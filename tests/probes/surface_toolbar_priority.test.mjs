import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRenderScene } from '../../eVe/domains/rendering/scene_graph.js';
import {
    ensureRenderSurface,
    updateRenderSurfaceScene
} from '../../eVe/domains/rendering/surface_runtime.js';

const installDomGlobals = (window) => {
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Element = window.Element;
    globalThis.SVGElement = window.SVGElement;
    globalThis.ResizeObserver = class {
        observe() {}
        disconnect() {}
    };
};

const setFixedRect = (element, rect) => {
    element.getBoundingClientRect = () => ({ ...rect });
    Object.defineProperty(element, 'clientWidth', { value: Math.round(rect.width), configurable: true });
    Object.defineProperty(element, 'clientHeight', { value: Math.round(rect.height), configurable: true });
};

const pointerDownEvent = (window, options = {}) => {
    const event = new window.MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: options.clientX,
        clientY: options.clientY
    });
    Object.defineProperty(event, 'pointerId', { value: options.pointerId || 1 });
    return event;
};

const buildSurfaceFixture = () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        pretendToBeVisual: true,
        url: 'http://127.0.0.1/'
    });
    installDomGlobals(dom.window);

    const projectHost = document.createElement('div');
    projectHost.id = 'project_view_priority_probe';
    setFixedRect(projectHost, {
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600
    });
    document.body.appendChild(projectHost);

    const intents = [];
    const canvas = ensureRenderSurface({
        zone: 'project',
        host: projectHost,
        documentRef: document,
        onIntent: (intent) => intents.push(intent)
    });
    setFixedRect(canvas, {
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600
    });
    updateRenderSurfaceScene(canvas, createRenderScene([
        {
            id: 'atom_under_toolbar',
            bounds: { x: 100, y: 100, width: 220, height: 120 },
            visual: { visible: true, zIndex: 1 },
            capabilities: { selectable: true }
        }
    ]));

    const toolbar = document.createElement('div');
    toolbar.id = 'eve_intuitionx_main_ribbon';
    document.body.appendChild(toolbar);

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.role = 'eve_intuitionx-tool';
    button.id = 'toolbar_button_priority_probe';
    toolbar.appendChild(button);

    return { window: dom.window, canvas, button, intents };
};

test('project surface does not intercept toolbar pointer starts above canvas', () => {
    const { window, button, intents } = buildSurfaceFixture();
    const received = [];
    button.addEventListener('pointerdown', () => received.push('button:capture'), true);
    button.addEventListener('pointerdown', () => received.push('button:bubble'));

    button.dispatchEvent(pointerDownEvent(window, {
        clientX: 150,
        clientY: 140,
        pointerId: 1
    }));

    assert.deepEqual(received, ['button:capture', 'button:bubble']);
    assert.equal(intents.length, 0);
});

test('project surface still handles real canvas pointer starts', () => {
    const { window, canvas, intents } = buildSurfaceFixture();
    document.elementFromPoint = () => canvas;

    canvas.dispatchEvent(pointerDownEvent(window, {
        clientX: 150,
        clientY: 140,
        pointerId: 2
    }));

    assert.equal(intents.some((intent) => intent.kind === 'select' && intent.atome_id === 'atom_under_toolbar'), true);
    assert.equal(intents.some((intent) => intent.kind === 'drag.start' && intent.atome_id === 'atom_under_toolbar'), true);
});
