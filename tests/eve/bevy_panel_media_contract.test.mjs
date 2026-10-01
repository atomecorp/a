import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createMediaPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_media_runtime.js';
import { BEVY_PANEL_TOKENS, resolveListRowTokens } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import {
    applyCreatorDropExternalMediaSizing,
    resolveCreatorMediaIntrinsicSize
} from '../../eVe/intuition/tools/core/tool_runtime_creator_media.js';
import { createProjectDropExternalRuntime } from '../../eVe/intuition/tools/project_drop_external_runtime.js';
import { createAudioMedia } from '../../eVe/domains/media/api/audio_core_media.js';

const visit = (root, predicate) => {
    if (Array.isArray(root)) return root.map((child) => visit(child, predicate)).find(Boolean) || null;
    if (!root) return null;
    if (predicate(root)) return root;
    return (root.children || []).map((child) => visit(child, predicate)).find(Boolean) || null;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// Trois medias importables (image, video, son) et un `other` qui n'a ni apercu
// ni type canonique : la liste ne doit jamais le montrer.
const FILES = [
    { id: 'vid_1', name: 'montage', file_name: 'montage.mp4', kind: 'video', mime_type: 'video/mp4', modified: '2026-09-28T10:00:00Z', owner_id: 'u1' },
    { id: 'aud_1', name: 'bande', file_name: 'bande.mp3', kind: 'audio', mime_type: 'audio/mpeg', modified: '2026-09-29T10:00:00Z', owner_id: 'u1' },
    { id: 'img_1', name: 'affiche', file_name: 'affiche.png', kind: 'image', mime_type: 'image/png', modified: '2026-09-27T10:00:00Z', owner_id: 'u1' },
    { id: 'oth_1', name: 'archive', file_name: 'archive.zip', kind: 'other', mime_type: 'application/zip', modified: '2026-09-30T10:00:00Z', owner_id: 'u1' }
];

const MOUNT_CONTEXT = { projectId: 'p1', container_id: 'm1', container_entity: 'molecule' };

const harness = ({
    files = FILES, resolveDropPoint = () => null, importResult = null, systemResult = null
} = {}) => {
    const imported = [];
    const system = [];
    const closes = [];
    const panel = createMediaPanelSurface({
        loadFiles: async () => ({ ok: true, files }),
        // Le panneau n'envoie jamais une ligne seule : c'est toujours un lot,
        // la ligne cliquée ou la série cochée déposée.
        importFiles: async (batch, placement, context) => {
            imported.push({ files: batch, placement, context });
            return importResult ? importResult() : { ok: true };
        },
        importFromSystem: async (context) => {
            system.push(context);
            return systemResult ? systemResult() : { ok: true };
        },
        closePanel: () => closes.push(true),
        resolveProjectId: () => 'p1',
        resolveDropPoint
    });
    const surface = panel.surface;
    const draw = () => {
        const emitted = [];
        const snapshot = surface.readState();
        const content = surface.buildContent(snapshot, { emit: (intent) => emitted.push(intent), bodyWidth: 388 });
        const fixed = surface.buildFixedContent(surface.readState(), { emit: (intent) => emitted.push(intent), bodyWidth: 388 });
        return { content, fixed, emitted, snapshot: surface.readState() };
    };
    return { panel, surface, imported, system, closes, draw };
};

const open = async (surface, context = MOUNT_CONTEXT) => {
    surface.onOpen({ context });
    await flush();
};

test('a listed media is a standard tall row: name at the left, thumbnail at the trailing end', async () => {
    const { panel, surface, draw } = harness();
    await open(surface);
    const { content, snapshot } = draw();

    assert.deepEqual(snapshot.entries.map((entry) => entry.label), ['bande', 'montage', 'affiche'],
        'the newest upload comes first by default');
    assert.deepEqual(snapshot.entries.map((entry) => entry.meta.type), ['Son', 'Vidéo', 'Image']);
    assert.equal(snapshot.entries.some((entry) => entry.label === 'archive'), false,
        'a media the panel cannot preview nor type stays out of the list');

    // Le gabarit des listes standard (Contact, Coller) : la hauteur et la
    // vignette se lisent sur les jetons, jamais sur un nombre local.
    const rowTokens = resolveListRowTokens('tall');
    const row = visit(content, (node) => node.id === 'media_list_entry_0');
    assert.equal(row.style.size[1], rowTokens.heightPx, 'the row keeps the standard tall list height');
    assert.equal(row.style.size[0], 388);

    const thumbnail = visit(content, (node) => node.id === 'media_list_entry_0_thumbnail');
    assert.deepEqual(thumbnail.style.size, [rowTokens.thumbnailSizePx, rowTokens.thumbnailSizePx]);
    const holder = visit(content, (node) => node.id === 'media_list_entry_0_preview');
    assert.equal(holder.style.position[0], row.style.size[0] - rowTokens.thumbnailSizePx,
        'the miniature closes the row');
    assert.equal(visit(content, (node) => node.id === 'media_list_entry_0_label').text, 'bande',
        'the name owns the left side of the row');

    // La ligne ne porte aucun geste de glissement : la vignette est la poignée.
    assert.equal(row.on?.press, undefined, 'la ligne ne s’arme pas au glissement');
    assert.equal(row.on?.drag, undefined);
    assert.equal(row.on?.release, undefined);
    assert.deepEqual(Object.keys(holder.on).sort(), ['activate', 'cancel', 'drag', 'press', 'release'],
        'la vignette porte le clic et les quatre gestes du glissement');

    // La case de sélection appartient au rail standard partagé.
    const checkbox = visit(content, (node) => node.id === 'media_list_entry_0_checkbox');
    assert.equal(checkbox.kind, 'checkbox');
    assert.equal(panel.state.railRanges.length, 3, 'chaque ligne offre sa plage de sélection');

    assert.equal(snapshot.entries[0].visualRecord.type, 'audio');
    assert.equal(snapshot.entries[0].visualRecord.properties.media_kind, 'sound',
        'the engine vocabulary is normalised for the shared preview');
    assert.equal(snapshot.entries[2].visualRecord.properties.media_kind, 'image');
});

test('the type chips and the sortable header drive the same list without a second model', async () => {
    const { surface, draw } = harness();
    await open(surface);
    let { content, snapshot, emitted } = draw();

    assert.equal(snapshot.sortKey, 'date');
    assert.equal(snapshot.sortDirection, 'desc');
    const header = visit(content, (node) => node.id === 'media_header');
    assert.deepEqual(header.children.map((child) => child.id), [
        'media_header_cell_name', 'media_header_cell_date', 'media_header_cell_type'
    ]);
    assert.equal(visit(content, (node) => node.id === 'media_header_cell_name_label').text, 'Nom');
    assert.equal(visit(content, (node) => node.id === 'media_header_cell_date_label').text, 'Date');
    assert.equal(visit(content, (node) => node.id === 'media_header_cell_type_label').text, 'Type');

    // Une premiere presse sur Nom trie par nom ascendant ; la seconde inverse.
    await surface.handleEvent({ type: 'media.header.sort', columnId: 'name' });
    assert.deepEqual(surface.readState().entries.map((entry) => entry.label), ['affiche', 'bande', 'montage']);
    await surface.handleEvent({ type: 'media.header.sort', columnId: 'name' });
    assert.deepEqual(surface.readState().entries.map((entry) => entry.label), ['montage', 'bande', 'affiche']);

    // Le tri par type n'est pas un tri de texte : image, video, son.
    await surface.handleEvent({ type: 'media.header.sort', columnId: 'type' });
    assert.deepEqual(surface.readState().entries.map((entry) => entry.label), ['affiche', 'montage', 'bande']);

    const scopes = visit(content, (node) => node.id === 'media_scopes');
    assert.deepEqual(scopes.children.map((child) => child.id), [
        'media_scopes_chip_0', 'media_scopes_chip_1', 'media_scopes_chip_2', 'media_scopes_chip_3'
    ]);
    await surface.handleEvent({ type: 'media.scope.activate', value: 'images' });
    ({ content, snapshot, emitted } = draw());
    assert.equal(snapshot.scope, 'images');
    assert.deepEqual(snapshot.entries.map((entry) => entry.label), ['affiche']);
    await surface.handleEvent({ type: 'media.scope.activate', value: 'all' });
    assert.equal(surface.readState().entries.length, 3);
});

test('a click imports the media at the current level, with no system window', async () => {
    const { surface, imported, closes, draw } = harness();
    await open(surface);
    draw();

    const result = await surface.handleEvent({ type: 'media.row.activate', value: 'img_1' });

    assert.deepEqual(result, { ok: true });
    assert.equal(imported.length, 1);
    assert.deepEqual(imported[0].files.map((file) => file.id), ['img_1']);
    assert.deepEqual(imported[0].placement, { autoPlace: true });
    assert.equal(imported[0].context.projectId, 'p1');
    assert.equal(imported[0].context.container_id, 'm1', 'the mounting context reaches the import');
    assert.equal(closes.length, 1, 'un import abouti referme le panneau');

    await surface.handleEvent({ type: 'media.row.activate', value: 'missing' });
    assert.equal(imported.length, 1, 'an unknown row imports nothing');
    assert.equal(closes.length, 1, 'rien à importer, rien à fermer');
});

test('dragging a media onto the bare canvas drops it on the resolved point', async () => {
    const point = { left: 320, top: 180 };
    const { surface, imported, closes } = harness({ resolveDropPoint: () => point });
    await open(surface);
    surface.buildContent(surface.readState(), { emit: () => {}, bodyWidth: 388 });

    await surface.handleEvent({
        type: 'media.row.drag_start', value: 'vid_1',
        event: { client_x: 500, client_y: 400, node_id: 'media_list_entry_1' }
    });
    await surface.handleEvent({ type: 'media.row.drag_move', event: { client_x: 512, client_y: 412 } });
    assert.equal(surface.readState().dragPreview.label, 'montage');
    assert.equal(surface.readState().dragPreview.count, 1);
    const solo = surface.buildOverlayContent(surface.readState());
    assert.equal(visit(solo, (node) => node.id === 'media_drag_preview').style.size[0],
        resolveListRowTokens('tall').dragThumbnailSizePx, 'la ligne seule montre la vignette agrandie');
    assert.equal(visit(solo, (node) => node.id === 'media_drag_preview_count_label'), null,
        'une ligne seule ne porte pas de badge de compte');

    const dropped = await surface.handleEvent({ type: 'media.row.drag_end', event: { client_x: 520, client_y: 420 } });

    assert.equal(dropped.ok, true);
    assert.equal(imported.length, 1);
    assert.deepEqual(imported[0].files.map((file) => file.id), ['vid_1']);
    assert.equal(imported[0].placement.autoPlace, false);
    assert.deepEqual(imported[0].placement.dropPoint, point);
    assert.equal(surface.readState().dragPreview, null, 'the preview is gone once dropped');
    assert.equal(closes.length, 1, 'le dépôt referme le panneau');
});

// La sélection est celle de toutes les listes : presser la case, glisser sur le
// rail, relâcher. Une vignette cochée emporte alors le lot en un seul dépôt.
test('a checked batch drags as one enlarged thumbnail and lands in a single import', async () => {
    const point = { left: 320, top: 180 };
    const { panel, surface, imported, closes } = harness({ resolveDropPoint: () => point });
    await open(surface);
    surface.buildContent(surface.readState(), { emit: () => {}, bodyWidth: 388 });

    const rowStep = panel.state.railRanges[1].top - panel.state.railRanges[0].top;
    await surface.handleEvent({
        type: 'media.selection.press', value: 'aud_1',
        event: { y: 0, node_id: 'media_list_entry_0_checkbox' }
    });
    await surface.handleEvent({
        type: 'media.selection.drag', event: { y: rowStep, node_id: 'media_list_entry_1_checkbox' }
    });
    await surface.handleEvent({ type: 'media.selection.release' });
    assert.deepEqual(panel.selection.ids(), ['aud_1', 'vid_1'], 'la série cochée suit le rail');

    await surface.handleEvent({
        type: 'media.row.drag_start', value: 'aud_1',
        event: { client_x: 500, client_y: 400, node_id: 'media_list_entry_0_preview' }
    });
    await surface.handleEvent({ type: 'media.row.drag_move', event: { client_x: 520, client_y: 420 } });

    const preview = surface.readState().dragPreview;
    assert.equal(preview.count, 2);
    assert.equal(preview.thumbnailPx, resolveListRowTokens('tall').dragThumbnailSizePx,
        'l’aperçu est la vignette agrandie, jamais la ligne');

    const overlay = surface.buildOverlayContent(surface.readState());
    const ghost = visit(overlay, (node) => node.id === 'media_drag_preview');
    // Deux cartes glissées forment un paquet : la boîte grandit d'un cran pour
    // que la pile ne soit pas rognée, et chaque carte porte son décalage.
    const stack = resolveListRowTokens('tall');
    assert.deepEqual(ghost.style.size, [
        preview.thumbnailPx + stack.dragStackOffsetPx,
        preview.thumbnailPx + stack.dragStackOffsetPx
    ], 'la boîte du paquet grandit d’un cran par carte supplémentaire');
    assert.deepEqual(visit(overlay, (node) => node.id === 'media_drag_preview_thumbnail_0').style.position, [0, 0]);
    assert.deepEqual(visit(overlay, (node) => node.id === 'media_drag_preview_thumbnail_1').style.position,
        [stack.dragStackOffsetPx, stack.dragStackOffsetPx], 'la carte du fond est décalée d’un cran');
    assert.equal(visit(overlay, (node) => node.id === 'media_drag_preview_count_label').text, '2',
        'le badge de compte dit combien partent');
    assert.equal(visit(overlay, (node) => node.id === 'media_drag_preview_label'), null,
        'aucune ligne entière n’est dessinée');

    const dropped = await surface.handleEvent({ type: 'media.row.drag_end', event: { client_x: 540, client_y: 440 } });
    assert.equal(dropped.ok, true);
    assert.equal(imported.length, 1, 'un lot est un seul import, pas N dépôts');
    assert.deepEqual(imported[0].files.map((file) => file.id), ['aud_1', 'vid_1']);
    assert.equal(imported[0].placement.autoPlace, false);
    assert.deepEqual(imported[0].placement.dropPoint, point);
    assert.equal(closes.length, 1, 'le dépôt du lot referme le panneau');
});

test('a click on a checked row still imports that row alone, never the batch', async () => {
    const { panel, surface, imported } = harness();
    await open(surface);
    surface.buildContent(surface.readState(), { emit: () => {}, bodyWidth: 388 });

    await surface.handleEvent({
        type: 'media.selection.press', value: 'aud_1',
        event: { y: 0, node_id: 'media_list_entry_0_checkbox' }
    });
    await surface.handleEvent({
        type: 'media.selection.drag',
        event: { y: panel.state.railRanges[1].top - panel.state.railRanges[0].top, node_id: 'media_list_entry_1_checkbox' }
    });
    await surface.handleEvent({ type: 'media.selection.release' });
    assert.equal(panel.selection.ids().length, 2);

    await surface.handleEvent({ type: 'media.row.activate', value: 'aud_1' });
    assert.deepEqual(imported[0].files.map((file) => file.id), ['aud_1'],
        'le clic n’emporte jamais la sélection');
});

test('a drop outside the bare canvas cancels the import', async () => {
    const { surface, imported, closes, draw } = harness({ resolveDropPoint: () => null });
    await open(surface);
    draw();

    await surface.handleEvent({ type: 'media.row.drag_start', value: 'aud_1', event: { client_x: 500, client_y: 400 } });
    await surface.handleEvent({ type: 'media.row.drag_move', event: { client_x: 520, client_y: 420 } });
    const refused = await surface.handleEvent({ type: 'media.row.drag_end', event: { client_x: 520, client_y: 420 } });

    assert.deepEqual(refused, { ok: true, ignored: true }, 'releasing over a panel imports nothing');
    assert.deepEqual(imported, []);
    assert.equal(surface.readState().dragPreview, null);
    assert.deepEqual(closes, [], 'un lâcher refusé ne referme rien');

    await surface.handleEvent({ type: 'media.row.drag_start', value: 'aud_1', event: { client_x: 100, client_y: 100 } });
    const immobile = await surface.handleEvent({ type: 'media.row.drag_end', event: { client_x: 103, client_y: 102 } });
    assert.equal(immobile.ignored, true, 'a press that never moved is not a drop');
    assert.deepEqual(imported, []);
    assert.deepEqual(closes, []);
});

test('the fixed button at the bottom hands over to the system import window', async () => {
    const { surface, system, closes, draw } = harness();
    await open(surface);
    const { fixed, emitted } = draw();

    const button = visit(fixed, (node) => node.id === 'media_import_system');
    assert.equal(button.kind, 'button');
    assert.equal(visit(fixed, (node) => node.id === 'media_import_system_label').text,
        'Ajouter des fichiers externes', 'le bouton systeme dit ce qu’il ouvre, pas « importer » tout court');

    button.on.activate();
    assert.deepEqual(emitted, [{ type: 'media.import.system' }]);

    const result = await surface.handleEvent({ type: 'media.import.system' });

    assert.deepEqual(result, { ok: true });
    assert.equal(system.length, 1);
    assert.equal(system[0].projectId, 'p1');
    assert.equal(system[0].container_id, 'm1');
    assert.equal(closes.length, 1, 'la fenêtre système a importé : le panneau se referme');
});

// Annuler la fenêtre système n'importe rien : le panneau reste ouvert pour
// laisser réessayer.
test('a cancelled system window or a failed import leaves the panel open', async () => {
    const cancelled = harness({ systemResult: () => ({ ok: false, error: 'cancelled' }) });
    await open(cancelled.surface);
    const refused = await cancelled.surface.handleEvent({ type: 'media.import.system' });
    assert.equal(refused.ok, false);
    assert.deepEqual(cancelled.closes, [], 'une annulation ne referme pas le panneau');

    const broken = harness({ importResult: () => ({ ok: false, error: 'media_import_failed' }) });
    await open(broken.surface);
    const failed = await broken.surface.handleEvent({ type: 'media.row.activate', value: 'img_1' });
    assert.equal(failed.ok, false);
    assert.deepEqual(broken.closes, [], 'un import en échec ne referme pas le panneau');
    const { content } = broken.draw();
    assert.equal(broken.surface.readState().statusKind, null, 'la liste ne cède pas la place à un état d’erreur');
    assert.equal(visit(content, (node) => node.id === 'media_list') !== null, true, 'la liste reste utilisable');
    assert.match(visit(content, (node) => node.id === 'media_notice').text, /media_import_failed/,
        'l’échec se dit sous la liste');
});

test('an empty library shows the shared panel state instead of a row list', async () => {
    const { surface, draw } = harness({ files: [] });
    await open(surface);
    const { content, snapshot } = draw();

    assert.equal(snapshot.statusKind, 'empty');
    assert.equal(snapshot.status, '', 'le code d’état ne fuit pas dans le pied de panneau partagé');
    assert.equal(visit(content, (node) => node.id === 'media_list'), null);
    assert.equal(visit(content, (node) => node.id === 'media_state').kind, 'empty_state');
    assert.equal(visit(content, (node) => node.id === 'media_state_title').text, 'Aucun média');
});

test('the body follows the visual preference: the filter bar sits on the open side', async () => {
    const { surface, draw } = harness();
    await open(surface);
    const blockIds = () => draw().content.map((child) => child.id);

    // Bas → haut en 'up' : filtre, en-tête, résultats, compteur.
    assert.deepEqual(blockIds(), ['media_count', 'media_list', 'media_header', 'media_scopes_row'],
        'en up (le défaut) le filtre reste contre le bas et les résultats s’empilent au-dessus');

    globalThis.window = { __eveProfilePreferences: { visual: { accordionDirection: 'down' } } };
    try {
        assert.deepEqual(blockIds(), ['media_scopes_row', 'media_header', 'media_list', 'media_count'],
            'en down le filtre reprend le haut du panneau');
    } finally {
        delete globalThis.window;
    }
});

// Le dossier utilisateur n'est pas au même niveau en natif : la liste vient du
// serveur local, pas de Fastify, et l'identité y est locale (pas de jeton cloud).
test('a native runtime lists the user folder through the local server, without a cloud token', async () => {
    const calls = [];
    const files = [{ name: 'clip.mp4', size: 12, modified: 1759000000 }];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ success: true, files }) };
    };
    const media = createAudioMedia({
        isLocalNativeBackendRuntime: () => true,
        getTauriHttpBaseUrl: () => 'http://127.0.0.1:4555',
        getFastifyBaseUrl: () => '',
        buildLocalAuthHeaders: () => ({ Authorization: 'Bearer local', 'X-User-Id': 'u1' }),
        getCloudAuthToken: () => '',
        getAuthToken: () => 'local'
    });
    try {
        const result = await media.list_user_media_files({ types: ['video'] });

        assert.equal(result.ok, true);
        assert.equal(calls.length, 1, 'la liste native interroge le serveur local');
        assert.equal(calls[0].url, 'http://127.0.0.1:4555/api/uploads');
        assert.equal(calls[0].options.headers['X-User-Id'], 'u1');
        assert.equal(result.files[0].file_name, 'clip.mp4');
        assert.equal(result.files[0].kind, 'video');
        assert.equal(result.files[0].owner_id, 'u1', 'la vignette porte l’utilisateur du poste');
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test('a native runtime without local identity refuses instead of listing nothing silently', async () => {
    const previousFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = async () => { fetched += 1; return { ok: true, json: async () => ({ success: true, files: [] }) }; };
    const media = createAudioMedia({
        isLocalNativeBackendRuntime: () => true,
        getTauriHttpBaseUrl: () => 'http://127.0.0.1:4555',
        getFastifyBaseUrl: () => '',
        buildLocalAuthHeaders: () => ({}),
        getCloudAuthToken: () => '',
        getAuthToken: () => ''
    });
    try {
        const result = await media.list_user_media_files();
        assert.deepEqual(result, { ok: false, error: 'auth_required', files: [] });
        assert.equal(fetched, 0, 'aucune requête sans identité locale');
    } finally {
        globalThis.fetch = previousFetch;
    }
});

// Le pied fixe porte deux gestes distincts. Les confondre faisait croire que la
// fenêtre système allait importer la sélection : le bouton de droite la valide,
// comme le ferait un clic de ligne, et reste grisé tant qu'il n'y a rien à
// valider.
test('the fixed foot validates the checked batch and stays greyed without one', async () => {
    const { panel, surface, imported, closes, draw } = harness();
    await open(surface);
    surface.buildContent(surface.readState(), { emit: () => {}, bodyWidth: 388 });

    const idle = visit(draw().fixed, (node) => node.id === 'media_import_selection');
    assert.equal(idle.kind, 'button');
    assert.equal(visit(draw().fixed, (node) => node.id === 'media_import_selection_label').text, 'Importer');
    assert.equal(idle.style.opacity, BEVY_PANEL_TOKENS.actionButton.disabledOpacity,
        'sans sélection, le bouton est grisé');
    assert.equal(idle.on, undefined, 'un bouton grisé n’arme aucun geste');

    assert.deepEqual(await surface.handleEvent({ type: 'media.import.selection' }),
        { ok: false, error: 'media_selection_empty' }, 'rien de coché : rien à valider');
    assert.deepEqual(imported, []);
    assert.deepEqual(closes, []);

    const rowStep = panel.state.railRanges[1].top - panel.state.railRanges[0].top;
    await surface.handleEvent({
        type: 'media.selection.press', value: 'aud_1',
        event: { y: 0, node_id: 'media_list_entry_0_checkbox' }
    });
    await surface.handleEvent({
        type: 'media.selection.drag', event: { y: rowStep, node_id: 'media_list_entry_1_checkbox' }
    });
    await surface.handleEvent({ type: 'media.selection.release' });
    surface.buildContent(surface.readState(), { emit: () => {}, bodyWidth: 388 });

    const armed = visit(draw().fixed, (node) => node.id === 'media_import_selection');
    assert.equal(visit(draw().fixed, (node) => node.id === 'media_import_selection_label').text, 'Importer (2)',
        'le bouton dit combien d’éléments il valide');
    assert.equal(armed.style.opacity, 1, 'avec une sélection, le bouton est actif');

    const emitted = [];
    const armedFoot = surface.buildFixedContent(surface.readState(), {
        emit: (intent) => emitted.push(intent), bodyWidth: 388
    });
    visit(armedFoot, (node) => node.id === 'media_import_selection').on.activate();
    assert.deepEqual(emitted, [{ type: 'media.import.selection' }],
        'le bouton du bas demande la validation de la sélection cochée');

    const result = await surface.handleEvent({ type: 'media.import.selection' });

    assert.deepEqual(result, { ok: true });
    assert.equal(imported.length, 1, 'la sélection est un seul import, pas N dépôts');
    assert.deepEqual(imported[0].files.map((file) => file.id), ['aud_1', 'vid_1']);
    assert.deepEqual(imported[0].placement, { autoPlace: true },
        'le bouton se comporte exactement comme un clic de ligne');
    assert.equal(closes.length, 1, 'un import abouti referme le panneau');
});

// Un lot glissé est un paquet : jusqu'à trois cartes en escalier, et le badge
// dit combien partent réellement, même au-delà de la pile visible.
test('a batch drag shows up to three staggered cards under the pointer', async () => {
    const point = { left: 320, top: 180 };
    const { panel, surface, imported } = harness({ resolveDropPoint: () => point });
    await open(surface);
    surface.buildContent(surface.readState(), { emit: () => {}, bodyWidth: 388 });

    const ranges = panel.state.railRanges;
    await surface.handleEvent({
        type: 'media.selection.press', value: 'aud_1',
        event: { y: 0, node_id: 'media_list_entry_0_checkbox' }
    });
    await surface.handleEvent({
        type: 'media.selection.drag',
        event: { y: ranges[2].top - ranges[0].top, node_id: 'media_list_entry_2_checkbox' }
    });
    await surface.handleEvent({ type: 'media.selection.release' });
    assert.equal(panel.selection.ids().length, 3);

    await surface.handleEvent({
        type: 'media.row.drag_start', value: 'aud_1',
        event: { client_x: 500, client_y: 400, node_id: 'media_list_entry_0_preview' }
    });
    await surface.handleEvent({ type: 'media.row.drag_move', event: { client_x: 520, client_y: 420 } });

    const preview = surface.readState().dragPreview;
    const stack = resolveListRowTokens('tall');
    assert.equal(preview.count, 3);
    assert.equal(preview.stackMaxPx, stack.dragStackMaxPx, 'le plafond de la pile vient de l’habillage');
    assert.equal(preview.stackOffsetPx, stack.dragStackOffsetPx);

    const overlay = surface.buildOverlayContent(surface.readState());
    const ghost = visit(overlay, (node) => node.id === 'media_drag_preview');
    const expectedBox = preview.thumbnailPx + (2 * stack.dragStackOffsetPx);
    assert.deepEqual(ghost.style.size, [expectedBox, expectedBox],
        'la boîte contient la pile entière, sinon son propre overflow la rognerait');
    [0, 1, 2].forEach((index) => {
        assert.deepEqual(
            visit(overlay, (node) => node.id === `media_drag_preview_thumbnail_${index}`).style.position,
            [index * stack.dragStackOffsetPx, index * stack.dragStackOffsetPx],
            `la carte ${index} est décalée d’un cran de plus`
        );
    });
    assert.equal(visit(overlay, (node) => node.id === 'media_drag_preview_thumbnail_3'), null,
        'la pile ne dessine jamais une carte de plus que son plafond');
    assert.equal(visit(overlay, (node) => node.id === 'media_drag_preview_count_label').text, '3');

    // Un paquet montre le paquet : chaque carte est le media qu'elle emporte.
    // Les repeter toutes a l'identique faisait croire a trois fois le meme
    // fichier glisse.
    const cardMedia = (index) => {
        const card = visit(overlay, (node) => node.id === `media_drag_preview_thumbnail_${index}`);
        return card?.children?.[0]?.overlayRecord?.properties?.name || '';
    };
    assert.deepEqual([cardMedia(0), cardMedia(1), cardMedia(2)], ['bande', 'montage', 'affiche'],
        'les trois vignettes de la pile sont trois medias distincts');

    await surface.handleEvent({ type: 'media.row.drag_end', event: { client_x: 540, client_y: 440 } });
    assert.equal(imported.length, 1);
    assert.deepEqual(imported[0].files.map((file) => file.id), ['aud_1', 'vid_1', 'img_1']);
});

// La sonde de dimensions est le seul coût média du premier dépôt : elle ne doit
// pas être repayée pour la même source, ni deux fois pour un même lot.
test('a media size probe is paid once per source, never once per drop', async () => {
    const previousImage = globalThis.Image;
    const probes = [];
    globalThis.Image = class {
        constructor() { probes.push(this); this._src = ''; }
        set src(value) {
            this._src = value;
            queueMicrotask(() => {
                this.naturalWidth = 800;
                this.naturalHeight = 600;
                this.onload?.();
            });
        }
        get src() { return this._src; }
    };
    try {
        // Une source routée par l'API média porte l'utilisateur dans son URL :
        // elle est volontairement hors de ce test, qui mesure la mémoïsation.
        const source = `/media/probe_${Date.now()}_${Math.random().toString(16).slice(2)}.png`;
        const first = await applyCreatorDropExternalMediaSizing({ kind: 'image', src: source }, {});
        const second = await applyCreatorDropExternalMediaSizing({ kind: 'image', src: source }, {});

        assert.equal(probes.length, 1, 'la même source ne se sonde qu’une fois');
        // La taille intrinsèque est ramenée au grand axe de création : 800×600
        // devient le 333×250 que porte l'atome.
        assert.equal(first.width, 333);
        assert.equal(first.height, 250);
        assert.deepEqual(second, first, 'la seconde mesure rend la même taille, sans nouvelle sonde');
    } finally {
        globalThis.Image = previousImage;
    }
});

// Une entrée qui connaît déjà sa taille ne la fait pas re-sonder au créateur :
// c'est ce que le lot du panneau Média transmet, pour ne pas attendre N fois.
test('an entry that carries its size reaches the creator without a second probe', async () => {
    const invocations = [];
    const runtime = createProjectDropExternalRuntime({
        invokeGateway: async (request) => {
            invocations.push(request);
            return { ok: true, atome_id: 'atome_1' };
        },
        ensureABoxApi: async () => { throw new Error('preuploaded_media_must_not_load_upload_api'); },
        computeDropBase: () => ({ left: 10, top: 20 }),
        resolveDropType: () => 'image',
        readDroppedTextContent: async () => null,
        buildDropOffset: (index) => ({ dx: index * 24, dy: index * 24 }),
        buildExtraProperties: () => ({}),
        resolveCreatorResultAtomeId: (result) => result?.atome_id || null
    });

    const result = await runtime.importFilesToProjectViaCreator({
        entries: [{
            name: 'affiche.png', type: 'image/png', width: 640, height: 480, mediaSizeProbed: true,
            preuploaded: { type: 'image', fileName: 'affiche.png', mediaUrl: '/media/affiche.png' }
        }],
        projectId: 'p1',
        projectEl: null,
        autoPlace: false
    });

    assert.equal(result.ok, true);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].input.width, 640, 'la taille connue du lot court-circuite la sonde');
    assert.equal(invocations[0].input.height, 480);
    assert.equal(invocations[0].input.media_size_probed, true);
});

test('a failed parallel size probe is not repeated during creation', async () => {
    const previousDocument = globalThis.document;
    let probes = 0;
    globalThis.document = { createElement: () => {
        probes += 1;
        throw new Error('second_probe_forbidden');
    } };
    try {
        const spec = { kind: 'video', src: '/media/failed_probe.mp4' };
        const result = await applyCreatorDropExternalMediaSizing(spec, { media_size_probed: true });
        assert.deepEqual(result, spec);
        assert.equal(probes, 0);
    } finally {
        globalThis.document = previousDocument;
    }
});

test('library references to the same file collapse, while homonyms from another owner remain', async () => {
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    globalThis.window = { Atome: { listStateCurrent: async () => [
        { id: 'recording', type: 'audio_recording', owner_id: 'owner', properties: { file_name: 'audio_123456.wav' } },
        { id: 'shared_copy', type: 'audio_recording', owner_id: 'owner', properties: {
            file_name: 'audio_123456.wav', media_user_id: 'other'
        } }
    ] } };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true, files: [
        { id: 'file', owner_id: 'owner', file_name: 'audio_123456.wav' },
        { id: 'project_copy', owner_id: 'owner', file_name: 'audio_123456.wav' },
        { id: 'other_file', owner_id: 'other', file_name: 'audio_123456.wav' }
    ] }) });
    const media = createAudioMedia({
        isLocalNativeBackendRuntime: () => false, getFastifyBaseUrl: () => 'http://localhost',
        getCloudAuthToken: () => 'token', getAuthToken: () => 'token'
    });
    try {
        const waves = [];
        const result = await media.list_user_media_files({ onProgress: wave => waves.push(wave) });
        assert.deepEqual(result.files.map(file => file.id), ['file', 'other_file']);
        assert.equal(waves[0].files.length, 2, 'duplicates must also be absent from partial waves');
    } finally {
        globalThis.window = previousWindow;
        globalThis.fetch = previousFetch;
    }
});

test('owner-scoped filenames keep independent selection for idless library rows', async () => {
    const { surface } = harness({ files: [
        { owner_id: 'owner', file_name: 'photo.png', kind: 'image' },
        { owner_id: 'other', file_name: 'photo.png', kind: 'image' }
    ] });
    await open(surface);
    const rows = surface.readState().entries;
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].id, rows[1].id);
});

// Le listage se fait en deux vagues (fichiers uploades, puis atomes de prise).
// Les lignes deja lues doivent s'afficher tout de suite : recevoir le lot d'un
// bloc a la fin faisait attendre le panneau plusieurs secondes, et une
// reouverture repartait d'un panneau vide.
test('the listing paints each wave and keeps the previous rows while it refreshes', async () => {
    let release = () => {};
    const gate = new Promise((resolve) => { release = resolve; });
    const closes = [];
    const panel = createMediaPanelSurface({
        loadFiles: async ({ onProgress } = {}) => {
            onProgress?.({ ok: true, partial: true, files: [FILES[2]] });
            await gate;
            return { ok: true, files: [FILES[0], FILES[2]] };
        },
        importFiles: async () => ({ ok: true }),
        closePanel: () => closes.push(true),
        resolveDropPoint: () => null
    });

    panel.surface.onOpen({ context: MOUNT_CONTEXT });
    await flush();

    const partial = panel.surface.readState();
    assert.deepEqual(partial.entries.map((entry) => entry.label), ['affiche'],
        'la premiere vague est deja une liste, pas un etat de chargement');
    assert.equal(partial.statusKind, null, 'les lignes lues restent a l ecran pendant la suite du listage');

    release();
    await flush();
    assert.deepEqual(panel.surface.readState().entries.map((entry) => entry.label), ['montage', 'affiche'],
        'la vague suivante remplace la precedente');
});

// Partial transfers retain failures for review without replaying successful entries.
test('a partial batch restores the panel and reports its failure', async () => {
    const partial = harness({ importResult: () => ({ ok: false, created: 1, error: 'media_create_failed' }) });
    await open(partial.surface);
    const result = await partial.surface.handleEvent({ type: 'media.row.activate', value: 'img_1' });

    assert.equal(result.ok, false);
    assert.deepEqual(partial.closes, []);
    assert.match(partial.surface.readState().notice, /media_create_failed/);

    const nothing = harness({ importResult: () => ({ ok: false, created: 0, error: 'media_create_failed' }) });
    await open(nothing.surface);
    await nothing.surface.handleEvent({ type: 'media.row.activate', value: 'img_1' });
    assert.deepEqual(nothing.closes, [], 'aucun atome cree : le panneau reste ouvert');
});

// La sonde de dimensions d une video ne doit JAMAIS rester en attente : un
// demontage qui echoue la laissait pendante, et tout le lot du panneau Media
// attendait cette promesse pour toujours — le depot ne faisait plus rien.
test('a video element that fails to tear down still settles its size probe', async () => {
    const previousDocument = globalThis.document;
    let loadCalls = 0;
    globalThis.document = {
        createElement: () => ({
            videoWidth: 0,
            videoHeight: 0,
            addEventListener: (name, handler) => {
                if (name === 'error') setTimeout(() => handler(), 0);
            },
            removeEventListener: () => {},
            pause: () => {},
            removeAttribute: () => {},
            // Premier appel : la mise en source. Second appel : le demontage, qui
            // echoue (moteur qui refuse `load()` sur un element detache).
            load: () => {
                loadCalls += 1;
                if (loadCalls > 1) throw new Error('media_cleanup_load_failed');
            },
            set src(value) { this._src = value; },
            get src() { return this._src || ''; }
        })
    };
    try {
        const size = await resolveCreatorMediaIntrinsicSize('video', `probe_${Date.now()}_${Math.random().toString(16).slice(2)}.mp4`);
        assert.equal(size, null, 'la sonde se regle quand meme, meme sans metadonnees');
        assert.equal(loadCalls, 2, 'la mise en source puis le demontage ont bien eu lieu');
    } finally {
        globalThis.document = previousDocument;
    }
});

// Les deux types de prise se lisaient en deux listages d etat complets (2000
// atomes chacun) : le panneau payait deux fois le meme aller-retour avant sa
// premiere ligne. Un seul listage suffit, et chaque vague se publie des qu elle
// est resolue.
test('both recording types come from one state listing, published wave by wave', async () => {
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    const listings = [];
    const waves = [];
    globalThis.window = {
        Atome: {
            listStateCurrent: async (filter, options) => {
                listings.push(options || {});
                return [
                    { atome_id: 'r1', type: 'audio_recording', properties: { file_name: 'prise.wav', mime_type: 'audio/wav' } },
                    { atome_id: 'r2', type: 'video_recording', properties: { file_name: 'ecran.mp4', mime_type: 'video/mp4' } }
                ];
            }
        }
    };
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ success: true, files: [{ id: 'u1', file_name: 'photo.png', mime_type: 'image/png' }] })
    });
    const media = createAudioMedia({
        isLocalNativeBackendRuntime: () => false,
        getTauriHttpBaseUrl: () => '',
        getFastifyBaseUrl: () => 'http://127.0.0.1:3000',
        buildLocalAuthHeaders: () => ({}),
        getCloudAuthToken: () => 'cloud-token',
        getAuthToken: () => 'cloud-token'
    });
    try {
        const result = await media.list_user_media_files({ onProgress: (wave) => waves.push(wave) });

        assert.equal(listings.length, 1, 'audio et video se lisent en un seul listage d etat');
        assert.deepEqual(result.files.map((file) => file.file_name).sort(),
            ['ecran.mp4', 'photo.png', 'prise.wav'], 'les deux sources sont bien fusionnees');
        assert.equal(waves.length, 1, 'la vague des fichiers uploades part avant la lecture des prises');
        assert.deepEqual(waves[0].files.map((file) => file.file_name), ['photo.png'],
            'la premiere vague ne contient que ce qui est deja resolu');
    } finally {
        globalThis.window = previousWindow;
        globalThis.fetch = previousFetch;
    }
});
