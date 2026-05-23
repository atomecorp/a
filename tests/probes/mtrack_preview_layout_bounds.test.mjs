import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createPreviewLayoutBindingsRuntime } from '../../eVe/domains/mtrax/preview/preview_layout_bindings_runtime.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

const scroll = document.createElement('div');
scroll.style.minHeight = '44px';
const ruler = document.createElement('div');
Object.defineProperty(ruler, 'offsetHeight', { configurable: true, value: 62 });
ruler.getBoundingClientRect = () => ({ height: 62 });
const tracks = document.createElement('div');
tracks.innerHTML = '<div class="eve-mtrack-track"></div><div class="eve-mtrack-track"></div><div class="eve-mtrack-track"></div>';

const state = {
    trackHeight: 74,
    tracks: [{ id: '1' }, { id: '2' }, { id: '3' }]
};

const runtime = createPreviewLayoutBindingsRuntime({
    getState: () => state,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    mtrackScrollSectionMinHeight: 44,
    mtrackPreviewSectionDefaultRatio: 0.33,
    resolveBodyInnerHeight: () => 640,
    applyPreviewSectionHeight: () => null
});

assert.equal(
    runtime.resolveTracksViewportMinHeight({ scroll, ruler, tracks }),
    136,
    'preview resize bounds must reserve the ruler plus one rendered track'
);
