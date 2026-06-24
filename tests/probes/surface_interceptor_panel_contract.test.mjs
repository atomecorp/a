import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
    ensureRenderSurface,
    setRenderSurfaceInteractionInterceptor
} from '../../eVe/domains/rendering/surface_runtime.js';

const createPointerLikeEvent = (win, type, x, y) => new win.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y
});

test('surface interceptor ignores panel events above the canvas', () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main><button id="panel">Panel action</button></body></html>');
    const { document } = dom.window;
    globalThis.window = dom.window;
    globalThis.document = document;

    const host = document.getElementById('project');
    const panelButton = document.getElementById('panel');
    const canvas = ensureRenderSurface({ zone: 'project', host, documentRef: document });
    canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600
    });

    let topElement = panelButton;
    document.elementFromPoint = () => topElement;

    let intercepted = 0;
    let panelPointerUps = 0;
    setRenderSurfaceInteractionInterceptor('project', () => {
        intercepted += 1;
        return { handled: true };
    });
    panelButton.addEventListener('pointerup', () => {
        panelPointerUps += 1;
    });

    panelButton.dispatchEvent(createPointerLikeEvent(dom.window, 'pointerup', 20, 20));
    assert.equal(intercepted, 0);
    assert.equal(panelPointerUps, 1);

    topElement = canvas;
    canvas.dispatchEvent(createPointerLikeEvent(dom.window, 'pointerup', 20, 20));
    assert.equal(intercepted, 1);

    setRenderSurfaceInteractionInterceptor('project', null);
});

test('surface interceptor ignores panel wheel events above the canvas', () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main><button id="panel">Panel action</button></body></html>');
    const { document } = dom.window;
    globalThis.window = dom.window;
    globalThis.document = document;

    const host = document.getElementById('project');
    const panelButton = document.getElementById('panel');
    const canvas = ensureRenderSurface({ zone: 'project', host, documentRef: document });
    canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600
    });
    document.elementFromPoint = () => panelButton;

    let intercepted = 0;
    let panelWheels = 0;
    setRenderSurfaceInteractionInterceptor('project', () => {
        intercepted += 1;
        return { handled: true };
    });
    panelButton.addEventListener('wheel', () => {
        panelWheels += 1;
    });

    panelButton.dispatchEvent(createPointerLikeEvent(dom.window, 'wheel', 20, 20));
    assert.equal(intercepted, 0);
    assert.equal(panelWheels, 1);

    setRenderSurfaceInteractionInterceptor('project', null);
});
