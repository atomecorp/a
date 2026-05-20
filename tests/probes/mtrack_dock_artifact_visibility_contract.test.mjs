import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;

const { createMoleculeDockController } = await import('../../eve/application/intuition/runtime/mtrack_dock_controller.js');

const panel = document.createElement('div');
panel.id = 'eve_mtrack_dialog';
panel.dataset.eveMtrackDocked = 'true';
panel.style.display = 'none';
document.body.appendChild(panel);

const controller = createMoleculeDockController({
    panelId: 'eve_mtrack_dialog',
    ensureIntuitionPanelLayer: () => document.body,
    ensurePanelAttachedToIntuitionLayer: () => true
});

assert.equal(
    controller.hasDockArtifactsNow(),
    false,
    'A hidden panel with stale docked dataset must not be treated as an open Molecule dock'
);

panel.style.display = 'flex';
panel.style.width = '320px';
panel.style.height = '426px';
panel.getBoundingClientRect = () => ({
    width: 320,
    height: 426,
    left: 0,
    top: 0,
    right: 320,
    bottom: 426
});

assert.equal(
    controller.hasDockArtifactsNow(),
    true,
    'A visible docked panel must still count as an open Molecule dock'
);
