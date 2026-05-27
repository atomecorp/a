import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="workspace"></div></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CSS = {
    escape(value) {
        return String(value).replace(/["\\]/g, '\\$&');
    }
};

const { createPreviewHostResolutionRuntime } = await import('../../eVe/domains/mtrax/preview/preview_host_resolution_runtime.js');

const installVisibleRects = (node) => {
    node.getClientRects = () => [{ left: 0, top: 0, width: 120, height: 80 }];
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 80, right: 120, bottom: 80 });
};

const panel = document.createElement('div');
panel.id = 'eve_mtrack_dialog';
panel.dataset.eveMtrackDocked = 'true';
document.body.appendChild(panel);
installVisibleRects(panel);

const previewHost = document.createElement('div');
previewHost.id = 'eve_mtrack_dialog__preview_host';
panel.appendChild(previewHost);
installVisibleRects(previewHost);

const groupHost = document.createElement('div');
groupHost.id = 'atome_group_a';
groupHost.dataset.atomeId = 'group_a';
groupHost.dataset.atomeKind = 'group';
document.body.appendChild(groupHost);
installVisibleRects(groupHost);

const state = {
    activeGroupId: 'group_a',
    ui: {
        root: panel,
        previewHost
    }
};

const runtime = createPreviewHostResolutionRuntime({
    getState: () => state,
    toKey: (value) => String(value || '').trim(),
    ensureMtrackDialogRoot: () => panel
});

assert.equal(
    runtime.resolveActiveGroupPreviewHost(),
    previewHost,
    'docked panel must keep the internal preview host by default'
);

panel.dataset.eveMtrackEmbeddedInFooter = 'true';
delete panel.dataset.eveMtrackDocked;
assert.equal(
    runtime.resolveActiveGroupPreviewHost(),
    previewHost,
    'footer-embedded panel must keep the internal preview host by default'
);

panel.dataset.eveMtrackPreviewExternalized = 'true';
assert.equal(
    runtime.resolveActiveGroupPreviewHost(),
    groupHost,
    'explicit preview externalization must resolve the visible group host'
);

delete panel.dataset.eveMtrackPreviewExternalized;
panel.dataset.eveMtrackPreviewPlacement = 'external';
assert.equal(
    runtime.resolveActiveGroupPreviewHost(),
    groupHost,
    'explicit external preview placement must resolve the visible group host'
);

panel.dataset.eveMtrackPreviewPlacement = 'internal';
assert.equal(
    runtime.resolveActiveGroupPreviewHost(),
    previewHost,
    'explicit internal preview placement must resolve the panel preview host'
);
