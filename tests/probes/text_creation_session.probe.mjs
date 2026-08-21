import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { textCreationSession } from '../../eVe/core/atome_events/text_creation_session.js';
import { createTextFitRuntime } from '../../eVe/core/atome_events/text_fit_runtime.js';

const installDom = () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="layer"></div></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
};

afterEach(() => {
    textCreationSession.abort();
    delete global.window;
    delete global.document;
    delete global.HTMLElement;
});

test('text creation keyboard bridge stays hidden while preserving focus', () => {
    installDom();
    const layer = document.getElementById('layer');

    const el = textCreationSession.begin({
        layer,
        clientX: 140,
        clientY: 90,
        localX: 42,
        localY: 24
    });

    assert.equal(el.tagName, 'TEXTAREA');
    assert.equal(el.style.position, 'fixed');
    assert.equal(el.style.left, '-10000px');
    assert.equal(el.style.opacity, '0');
    assert.equal(el.style.width, '1px');
    assert.equal(el.style.padding, '0px');
    assert.equal(document.activeElement, el);
});

test('empty text auto-fit preserves a one pixel origin width', () => {
    const runtime = createTextFitRuntime({
        getAtomeKindFromElement: () => 'text'
    });
    const host = {
        dataset: { atomeKind: 'text' },
        style: { width: '1px', height: '24px' },
        offsetWidth: 1,
        offsetHeight: 24
    };
    const textEl = {
        textContent: '',
        scrollWidth: 1,
        offsetWidth: 1,
        scrollHeight: 24,
        offsetHeight: 24
    };

    const fitted = runtime.fitTextHostToContent(host, textEl);

    assert.deepEqual(fitted, { width: 1, height: 24, changed: false });
    assert.equal(host.style.width, '1px');
});
