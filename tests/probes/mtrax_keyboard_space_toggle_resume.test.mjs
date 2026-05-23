import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createKeyboardShortcutsRuntime } from '../../eVe/domains/mtrax/ui/keyboard_shortcuts_runtime.js';

test('Molecule space key toggles play and pause without stop reset', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="mtrack"><button id="play_button" data-tool-id="ui.play" data-name-key="play">Play</button></div></body></html>');
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalElement = globalThis.Element;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Element = dom.window.Element;

    try {
        const root = document.getElementById('mtrack');
        const calls = [];
        const state = {
            keyboardBound: false,
            isPlaying: false,
            playhead: 10
        };
        const runtime = createKeyboardShortcutsRuntime({
            getState: () => state,
            ensureMtrackDialogRoot: () => root,
            isMtrackEditableTarget: () => false,
            deleteMtrackSelection: () => {},
            playTimeline: () => {
                calls.push({ action: 'play', playhead: state.playhead });
                state.isPlaying = true;
                state.playbackStartHead = state.playhead;
                return { ok: true, state: 'playing' };
            },
            pauseTimeline: () => {
                calls.push({ action: 'pause', playhead: state.playhead });
                state.isPlaying = false;
                return { ok: true, state: 'paused' };
            }
        });
        runtime.bindKeyboardShortcuts();

        root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
        state.playhead = 12.5;
        root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
        root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));

        assert.deepEqual(calls.map((call) => call.action), ['play', 'pause', 'play']);
        assert.equal(calls[0].playhead, 10);
        assert.equal(calls[1].playhead, 12.5);
        assert.equal(calls[2].playhead, 12.5);
        assert.equal(state.playbackStartHead, 12.5);

        let buttonClickCount = 0;
        document.getElementById('play_button').addEventListener('click', () => {
            buttonClickCount += 1;
        });
        state.playhead = 13;
        document.getElementById('play_button').dispatchEvent(new dom.window.KeyboardEvent('keydown', {
            key: ' ',
            code: 'Space',
            bubbles: true,
            cancelable: true
        }));

        assert.equal(buttonClickCount, 0);
        assert.deepEqual(calls.map((call) => call.action), ['play', 'pause', 'play', 'pause']);
        assert.equal(calls[3].playhead, 13);

        document.getElementById('play_button').click();
        assert.deepEqual(calls.map((call) => call.action), ['play', 'pause', 'play', 'pause', 'play']);
        assert.equal(calls[4].playhead, 13);
    } finally {
        if (originalWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = originalWindow;
        }
        if (originalDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = originalDocument;
        }
        if (originalElement === undefined) {
            delete globalThis.Element;
        } else {
            globalThis.Element = originalElement;
        }
    }
});
