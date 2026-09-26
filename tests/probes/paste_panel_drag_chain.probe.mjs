// Probe autonome — chaîne complète du glisser-déposer d'une copie.
//
// Le panneau Copie promet : presser la ligne, glisser sur le canevas, lâcher, et
// le clone apparaît au point du lâcher. Ce probe parcourt la chaîne maillon par
// maillon, sans navigateur : nœud de liste → intention → session armée →
// seuil 8 px → point de dépôt → `pasteGroups`. Il échoue si un maillon
// n'appelle pas le suivant, et nomme le maillon fautif.
//
// Usage : node tests/probes/paste_panel_drag_chain.probe.mjs

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const SURFACE_RECT = { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
const DROP_X = 640;
const DROP_Y = 420;

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const surfaceEl = dom.window.document.createElement('canvas');
surfaceEl.id = 'eve_surface_project';
surfaceEl.getBoundingClientRect = () => ({ ...SURFACE_RECT });
dom.window.document.body.appendChild(surfaceEl);
// Aucun nœud d'interface sous le pointeur : le lâcher est sur le canevas nu.
dom.window.eveBevyUiRuntime = { hitTestAtClientPoint: () => null };
dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'project_1' };
dom.window.__currentProject = { id: 'project_1' };

const { createPastePanelSurface } = await import(
    '../../eVe/intuition/runtime/bevy_panel/bevy_panel_paste_runtime.js'
);

const group = {
    key: 'paste:g1',
    count: 2,
    root_ids: ['atome_root'],
    items: [
        { key: 'a1', id: 'atome_root', label: 'Cercle', kind: 'atome', record: { id: 'atome_root', type: 'shape', properties: { left: 10, top: 20 } } },
        { key: 'a2', id: 'atome_child', label: 'Enfant', kind: 'atome', record: { id: 'atome_child', type: 'text', properties: { left: 30, top: 60, parent_id: 'atome_root' } } }
    ]
};

const selections = [];
const pastes = [];
const runtime = createPastePanelSurface({
    readGroups: () => [group],
    loadGroups: async () => {},
    readSelection: () => selections,
    writeSelection: (keys) => { selections.splice(0, selections.length, ...keys); },
    pasteGroups: async (keys, point) => { pastes.push({ keys, point }); return { ok: true }; }
});
const surface = runtime.surface;

const emitted = [];
const emit = (intent) => emitted.push(intent);
const content = surface.buildContent(surface.readState(), { emit, bodyWidth: 388 });

const findNode = (root, id) => {
    if (Array.isArray(root)) return root.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!root) return null;
    if (root.id === id) return root;
    return (root.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

const rowCheckbox = findNode(content, 'paste_list_entry_0_checkbox');
const dragHandle = findNode(content, 'paste_list_entry_0_drag');
assert.ok(rowCheckbox, 'maillon 1 : la ligne doit porter une case de sélection');
assert.ok(dragHandle, 'maillon 1 : la ligne doit porter une poignée de glisser');
assert.equal(typeof dragHandle.on?.press, 'function', 'maillon 1 : la poignée doit répondre au press');

const deliver = async (intent) => {
    emitted.length = 0;
    return surface.handleEvent(intent, { refresh: () => {}, patchText: () => {} });
};

// maillon 2 : press → intention de départ
dragHandle.on.press({ client_x: 220, client_y: 300, node_id: dragHandle.id });
assert.equal(emitted.at(-1)?.type, 'paste.row.drag_start', 'maillon 2 : presser la poignée doit émettre paste.row.drag_start');
await deliver(emitted.at(-1));

// maillon 3 : un déplacement sous le seuil n'arme pas encore la session
await deliver({ type: 'paste.row.drag_move', value: 'paste:g1', event: { client_x: 224, client_y: 302 } });
assert.equal(runtime.state.dragPreview, null, 'maillon 3 : sous 8 px, la session ne doit pas encore peindre');

// maillon 4 : au-delà du seuil, la session s'arme et peint l'aperçu
await deliver({ type: 'paste.row.drag_move', value: 'paste:g1', event: { client_x: DROP_X, client_y: DROP_Y } });
assert.ok(runtime.state.dragSession, 'maillon 4 : la session doit rester armée pendant le glissement');
assert.ok(runtime.state.dragPreview, 'maillon 4 : l’aperçu de glissement doit être peint');

// maillon 5-7 : lâcher sur le canevas → point de dépôt → pasteGroups
await deliver({ type: 'paste.row.drag_end', value: 'paste:g1', event: { client_x: DROP_X, client_y: DROP_Y } });
assert.equal(pastes.length, 1, 'maillon 7 : le lâcher sur le canevas doit coller la copie');
assert.deepEqual(pastes[0].keys, ['paste:g1']);
assert.ok(pastes[0].point, 'maillon 6 : le point de dépôt ne doit pas être nul');
assert.equal(pastes[0].point.left, DROP_X, 'maillon 6 : la copie doit atterrir sous le pointeur (x)');
assert.equal(pastes[0].point.top, DROP_Y, 'maillon 6 : la copie doit atterrir sous le pointeur (y)');

// La ligne entière se glisse aussi : on prend la copie là où on la voit, sans
// viser la poignée. C'est le geste qu'un utilisateur fait naturellement.
const row = findNode(content, 'paste_list_entry_0');
assert.ok(row, 'la ligne doit exister');
assert.equal(typeof row.on?.press, 'function', 'la ligne doit armer le glisser dès le press');
emitted.length = 0;
row.on.press({ client_x: 220, client_y: 300, node_id: row.id });
assert.equal(emitted.at(-1)?.type, 'paste.row.drag_start', 'la ligne doit emettre paste.row.drag_start des le press');
await deliver(emitted.at(-1));
assert.ok(runtime.state.dragSession, 'la session doit etre armee des le press de la ligne');
await deliver({ type: 'paste.row.drag_move', value: 'paste:g1', event: { client_x: DROP_X, client_y: DROP_Y } });
await deliver({ type: 'paste.row.drag_end', value: 'paste:g1', event: { client_x: DROP_X, client_y: DROP_Y } });
assert.equal(pastes.length, 2, 'lacher apres un glisser de ligne doit coller la copie');
assert.equal(pastes[1].point.left, DROP_X, 'la ligne se colle sous le pointeur (x)');
assert.equal(pastes[1].point.top, DROP_Y, 'la ligne se colle sous le pointeur (y)');

// Un clic sans deplacement reste un clic : la copie se coche, rien ne se colle.
emitted.length = 0;
row.on.press({ client_x: 220, client_y: 300, node_id: row.id });
await deliver(emitted.at(-1));
const beforeClick = pastes.length;
await deliver({ type: 'paste.row.drag_end', value: 'paste:g1', event: { client_x: 221, client_y: 301 } });
assert.equal(pastes.length, beforeClick, 'un clic immobile ne doit rien coller');

console.log('OK — chaîne du glisser-déposer d’une copie : press → intention → session → seuil → point → pasteGroups');
console.log('OK — la ligne entière se glisse (press) et le clic immobile ne colle pas');
