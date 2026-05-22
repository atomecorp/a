import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;

const { ensureMtrackStyles } = await import('../../eVe/domains/mtrax/ui/styles.js');

assert.doesNotThrow(() => ensureMtrackStyles(), 'MTrack styles must render without missing constants');

const style = document.getElementById('eve_mtrack_style');
assert.ok(style, 'MTrack style node must be installed');
assert.equal(style.textContent.includes('undefined'), false, 'MTrack generated CSS must not contain undefined tokens');
assert.equal(style.textContent.includes('NaN'), false, 'MTrack generated CSS must not contain NaN values');
assert.equal(style.textContent.includes('eve-mtrack-loop-cells-panel'), true, 'MTrack generated CSS must include loop cells styles');
assert.equal(style.textContent.includes('eve_mtrack_dialog__preview_section'), true, 'MTrack generated CSS must include preview styles');
