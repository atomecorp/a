import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { registerPressGesture } from '../../eVe/intuition/runtime/input_event_runtime.js';

const pointerEvent = (windowRef, type, options = {}) => {
    const event = new windowRef.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        pointerId: { value: options.pointerId ?? 1 },
        pointerType: { value: options.pointerType || 'touch' },
        isPrimary: { value: options.isPrimary !== false },
        button: { value: options.button ?? 0 },
        clientX: { value: options.clientX ?? 20 },
        clientY: { value: options.clientY ?? 20 },
        timeStamp: { value: options.timeStamp ?? 1000 }
    });
    return event;
};

test('the shared press runtime owns one Pointer Event lifecycle per physical gesture', () => {
    const dom = new JSDOM('<!doctype html><button id="target">Target</button>');
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousElement = globalThis.Element;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Element = dom.window.Element;
    const target = dom.window.document.getElementById('target');
    const phases = [];
    const cleanup = registerPressGesture({
        element: target,
        longPressMs: 10000,
        onPressStart: (detail) => phases.push([detail.phase, detail.pointer_type]),
        onPressEnd: (detail) => phases.push([detail.phase, detail.pointer_type]),
        onCancel: (detail) => phases.push([detail.phase, detail.pointer_type])
    });

    try {
        target.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
            pointerId: 10,
            pointerType: 'touch',
            timeStamp: 1000
        }));
        target.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
            pointerId: 10,
            pointerType: 'touch',
            timeStamp: 1010
        }));

        for (const delayMs of [0, 48, 100, 300, 700]) {
            target.dispatchEvent(new dom.window.MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: 20,
                clientY: 20
            }));
            target.dispatchEvent(new dom.window.MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                clientX: 20,
                clientY: 20
            }));
            const touchStart = new dom.window.Event('touchstart', { bubbles: true, cancelable: true });
            Object.defineProperty(touchStart, 'timeStamp', { value: 1000 + delayMs });
            target.dispatchEvent(touchStart);
        }

        assert.deepEqual(phases, [
            ['press.start', 'touch'],
            ['press.end', 'touch']
        ]);

        target.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
            pointerId: 11,
            pointerType: 'mouse',
            timeStamp: 2000
        }));
        target.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
            pointerId: 11,
            pointerType: 'mouse',
            timeStamp: 2010
        }));
        target.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
            pointerId: 12,
            pointerType: 'pen',
            timeStamp: 3000
        }));
        target.dispatchEvent(pointerEvent(dom.window, 'pointercancel', {
            pointerId: 12,
            pointerType: 'pen',
            timeStamp: 3010
        }));

        assert.deepEqual(phases, [
            ['press.start', 'touch'],
            ['press.end', 'touch'],
            ['press.start', 'mouse'],
            ['press.end', 'mouse'],
            ['press.start', 'pen'],
            ['press.cancel', 'pen']
        ]);

        cleanup();
        target.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
            pointerId: 13,
            pointerType: 'touch',
            timeStamp: 4000
        }));
        assert.equal(phases.length, 6, 'removing the last registration detaches the shared listeners');

        const reboundPhases = [];
        const cleanupRebound = registerPressGesture({
            element: target,
            longPressMs: 10000,
            onPressStart: (detail) => reboundPhases.push(detail.phase),
            onPressEnd: (detail) => reboundPhases.push(detail.phase)
        });
        target.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
            pointerId: 14,
            pointerType: 'touch',
            timeStamp: 5000
        }));
        target.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
            pointerId: 14,
            pointerType: 'touch',
            timeStamp: 5010
        }));
        cleanupRebound();
        assert.deepEqual(reboundPhases, ['press.start', 'press.end']);
    } finally {
        cleanup();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        globalThis.Element = previousElement;
        dom.window.close();
    }
});
