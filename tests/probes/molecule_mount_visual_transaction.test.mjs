import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1:3001/'
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
globalThis.HTMLMediaElement = dom.window.HTMLMediaElement;
globalThis.Blob = dom.window.Blob;
globalThis.URL = dom.window.URL;
globalThis.performance = dom.window.performance;
Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true
});

const { createMoleculeEngine } = await import('../../eVe/core/media_engine/molecule.js');
const { createMoleculeApi } = await import('../../eVe/core/media_engine/molecule.api.js');
const { registerAtomeElement } = await import('../../eVe/core/atome_dom_id.js');

const engine = createMoleculeEngine();
const api = createMoleculeApi(engine);
const host = document.createElement('div');
registerAtomeElement(host, {
    atome_id: 'molecule_transaction_probe_video',
    kind: 'video'
});
host.style.width = '320px';
host.style.height = '180px';
document.body.appendChild(host);

await assert.rejects(
    () => api.mountVisual(host, {
        id: 'molecule_transaction_probe_video',
        kind: 'video',
        src: '/api/uploads/Vampire.m4v',
        mediaUrl: '/api/uploads/Vampire.m4v'
    }),
    /WebGPU|adapter|renderer/i
);

assert.equal(engine.sessions.size, 0, 'failed mountVisual must rollback the registered Molecule session');
assert.equal(api.getAssetState('molecule_transaction_probe_video'), null, 'failed mountVisual must not leave an asset binding');
