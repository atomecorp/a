import assert from 'node:assert/strict';
import { test } from 'vitest';

// The panels' runtime first, as the app loads it (tools/media.js): the ribbon's recording
// runtime that the import panel's camera uses reaches the panels back through it.
import '../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js';
import { createMediaPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_media_runtime.js';
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

// Three importable media (picture, video, sound) and an `other` that has neither preview
// nor canonical type: the panel never shows it.
const FILES = [
    { id: 'vid_1', name: 'montage', file_name: 'montage.mp4', kind: 'video', mime_type: 'video/mp4', modified: '2026-09-28T10:00:00Z', owner_id: 'u1' },
    { id: 'aud_1', name: 'bande', file_name: 'bande.mp3', kind: 'audio', mime_type: 'audio/mpeg', modified: '2026-09-29T10:00:00Z', owner_id: 'u1' },
    { id: 'img_1', name: 'affiche', file_name: 'affiche.png', kind: 'image', mime_type: 'image/png', modified: '2026-09-27T10:00:00Z', owner_id: 'u1' },
    { id: 'oth_1', name: 'archive', file_name: 'archive.zip', kind: 'other', mime_type: 'application/zip', modified: '2026-09-30T10:00:00Z', owner_id: 'u1' }
];

const MOUNT_CONTEXT = { projectId: 'p1', container_id: 'm1', container_entity: 'molecule' };

// The import panel (AGENTS.md rule 18), its writes and the host's sources stubbed.
const harness = ({ files = FILES, resolveDropPoint = () => null, importResult = null, systemResult = null, picked = null,
    sources = ['camera', 'files'], storeRandomImage = undefined } = {}) => {
    const imported = [];
    const system = [];
    const picks = [];
    const closes = [];
    const panel = createMediaPanelSurface({
        loadFiles: async () => ({ ok: true, files }),
        importFiles: async (batch, placement, context) => {
            imported.push({ files: batch, placement, context });
            return importResult ? importResult() : { ok: true };
        },
        importFromSystem: async (context) => { system.push(context); return systemResult ? systemResult() : { ok: true }; },
        pickFromSystem: async (options) => { picks.push(options); return picked ? picked() : { ok: false, error: 'cancelled' }; },
        storeRandomImage,
        closePanel: () => closes.push(true),
        resolveProjectId: () => 'p1',
        resolveDropPoint,
        sources: () => sources,
        createUrl: file => `blob:${file.name}`,
        revokeUrl: () => {}
    });
    const surface = panel.surface;
    const draw = () => {
        const emitted = [];
        const snapshot = surface.readState();
        const content = surface.buildContent(snapshot, { emit: (intent) => emitted.push(intent), bodyWidth: 400, bodyHeight: 600 });
        const band = surface.buildBandTools(snapshot, { emit: (intent) => emitted.push(intent) });
        return { content, band, emitted, snapshot };
    };
    return { panel, surface, imported, system, picks, closes, draw };
};

const open = async (surface, context = MOUNT_CONTEXT) => {
    surface.onOpen({ context });
    await flush();
};
const bandKeys = band => band.map(item => item.key);

test('opened, the panel shows its label and an empty preview; the sources are band tools, nothing chosen yet', async () => {
    const { surface, draw } = harness();
    await open(surface);
    const { content, band, snapshot } = draw();
    assert.deepEqual(content.map(node => node.id), ['media_label', 'media_preview']);
    assert.equal(visit(content, node => String(node.id).startsWith('media_item_')), null, 'the media never show at once');
    assert.equal(snapshot.title, 'Importer');
    assert.deepEqual(bandKeys(band), ['media_import_medias', 'media_import_system', 'media_import_camera', 'media_import_random']);
});

test('Hasard is a source only where an image is asked; an unreachable service says so and chooses nothing', async () => {
    const { panel, surface, draw } = harness({ storeRandomImage: async () => ({ ok: false, error: 'wallpaper_http_502', random: true }) });
    void panel.requestSelection({ kinds: ['audio'] });
    await open(surface, { mediaPick: true });
    assert.equal(bandKeys(draw().band).includes('media_import_random'), false);
    assert.equal((await surface.handleEvent({ type: 'media.source.random' })).error, 'media_random_unavailable');
    void panel.requestSelection({ kinds: ['image'] });
    await open(surface, { mediaPick: true });
    assert.equal(bandKeys(draw().band).includes('media_import_random'), true);
    const result = await surface.handleEvent({ type: 'media.source.random' });
    assert.equal(result.ok, false);
    const { snapshot } = draw();
    assert.equal(snapshot.noticeError, true);
    assert.equal(snapshot.chosen.length, 0);
});

test('Médias shows its filters at the foot, none lit: nothing listed until a filter is lit', async () => {
    const { surface, draw } = harness();
    await open(surface);
    await surface.handleEvent({ type: 'media.source.library' });
    let { content, band, snapshot } = draw();
    assert.deepEqual(content.map(node => node.id), ['media_label', 'media_preview', 'media_filters_row']);
    assert.deepEqual(snapshot.entries, [], 'no filter lit, nothing listed');
    assert.equal(band.find(item => item.key === 'media_import_medias').lit, true);
    await surface.handleEvent({ type: 'media.filter.toggle', value: 'all' });
    ({ content, snapshot } = draw());
    assert.deepEqual(content.map(node => node.id), ['media_label', 'media_preview', 'media_grid', 'media_filters_row']);
    assert.equal(visit(content, node => node.id === 'media_grid').kind, 'scroll_area', 'the grid scrolls in its own area');
    assert.deepEqual(snapshot.entries.map(entry => entry.key), ['aud_1', 'vid_1', 'img_1'], 'Tout: every kind, newest first, no `other`');
    await surface.handleEvent({ type: 'media.filter.toggle', value: 'all' });
    assert.deepEqual(surface.readState().entries, [], 'Tout again: none');
    await surface.handleEvent({ type: 'media.filter.toggle', value: 'images' });
    assert.deepEqual(surface.readState().entries.map(entry => entry.key), ['img_1']);
    await surface.handleEvent({ type: 'media.view.toggle' });
    ({ content } = draw());
    assert.ok(visit(content, node => node.id === 'media_list'), 'the view chip lays the canonical list');
});

test('a picture touched is chosen and shown; Import writes the chosen ones once, then the panel closes', async () => {
    const { surface, imported, closes, draw } = harness();
    await open(surface);
    await surface.handleEvent({ type: 'media.source.library' });
    await surface.handleEvent({ type: 'media.item.activate', value: 'img_1' });
    await surface.handleEvent({ type: 'media.item.activate', value: 'vid_1' });
    const { band, snapshot } = draw();
    assert.deepEqual(snapshot.chosen.map(item => item.key), ['img_1', 'vid_1'], 'a project takes several');
    assert.equal(snapshot.shown.key, 'vid_1', 'the last one touched shows');
    assert.ok(bandKeys(band).includes('media_import_selection'));
    await surface.handleEvent({ type: 'media.item.activate', value: 'vid_1' });
    assert.deepEqual(surface.readState().chosen.map(item => item.key), ['img_1'], 'touched again, taken back');
    const result = await surface.handleEvent({ type: 'media.choose' });
    assert.equal(result.ok, true);
    assert.equal(imported.length, 1);
    assert.deepEqual(imported[0].files.map(file => file.id), ['img_1']);
    assert.equal(imported[0].placement.autoPlace, true);
    assert.equal(imported[0].context.container_id, 'm1', 'the mount context goes with the write');
    assert.equal(closes.length, 1);
});

test('a picture dragged onto the bare canvas drops there; outside, nothing is imported', async () => {
    const point = { x: 120, y: 80 };
    const inside = harness({ resolveDropPoint: () => point });
    await open(inside.surface);
    await inside.surface.handleEvent({ type: 'media.item.drag_start', value: 'img_1', event: { clientX: 10, clientY: 10 } });
    await inside.surface.handleEvent({ type: 'media.item.drag_move', value: 'img_1', event: { clientX: 200, clientY: 200 } });
    await inside.surface.handleEvent({ type: 'media.item.drag_end', value: 'img_1', event: { clientX: 200, clientY: 200 } });
    assert.equal(inside.imported.length, 1);
    assert.deepEqual(inside.imported[0].placement.dropPoint, point);
    const outside = harness();
    await open(outside.surface);
    await outside.surface.handleEvent({ type: 'media.item.drag_start', value: 'img_1', event: { clientX: 10, clientY: 10 } });
    await outside.surface.handleEvent({ type: 'media.item.drag_move', value: 'img_1', event: { clientX: 200, clientY: 200 } });
    await outside.surface.handleEvent({ type: 'media.item.drag_end', value: 'img_1', event: { clientX: 200, clientY: 200 } });
    assert.equal(outside.imported.length, 0);
});

test('a chosen picture dragged carries every chosen one', async () => {
    const { surface, imported } = harness({ resolveDropPoint: () => ({ x: 1, y: 1 }) });
    await open(surface);
    await surface.handleEvent({ type: 'media.item.activate', value: 'img_1' });
    await surface.handleEvent({ type: 'media.item.activate', value: 'vid_1' });
    await surface.handleEvent({ type: 'media.item.drag_start', value: 'img_1', event: { clientX: 10, clientY: 10 } });
    await surface.handleEvent({ type: 'media.item.drag_move', value: 'img_1', event: { clientX: 200, clientY: 200 } });
    assert.equal(surface.readState().dragPreview.count, 2);
    await surface.handleEvent({ type: 'media.item.drag_end', value: 'img_1', event: { clientX: 200, clientY: 200 } });
    assert.deepEqual(imported[0].files.map(file => file.id), ['img_1', 'vid_1']);
});

test('Ouvrir, in a project, hands over to the system window; done it closes, cancelled it stays', async () => {
    const done = harness();
    await open(done.surface);
    await done.surface.handleEvent({ type: 'media.source.files' });
    assert.equal(done.system[0].source, 'files');
    assert.equal(done.closes.length, 1);
    const cancelled = harness({ systemResult: () => ({ ok: false, error: 'cancelled' }) });
    await open(cancelled.surface);
    await cancelled.surface.handleEvent({ type: 'media.source.files' });
    assert.equal(cancelled.closes.length, 0);
    assert.equal(cancelled.surface.readState().notice, '', 'a window closed is not a failure');
});

test('a choice: one of the person\'s media comes back by Choix, never written in the project', async () => {
    const { panel, surface, imported, closes, draw } = harness();
    const pending = panel.requestSelection({ kinds: ['image'] });
    await open(surface, { mediaPick: true });
    await surface.handleEvent({ type: 'media.source.library' });
    await surface.handleEvent({ type: 'media.filter.toggle', value: 'all' });
    const { band, snapshot } = draw();
    assert.equal(snapshot.title, 'Importer une image');
    assert.deepEqual(snapshot.entries.map(entry => entry.key), ['img_1'], 'only what is asked for');
    assert.deepEqual(snapshot.filters.offered, ['images', 'contacts'], 'a picture asked: its filters only');
    assert.ok(!bandKeys(band).includes('media_import_video'), 'no Vidéo tool at the sources\' level');
    await surface.handleEvent({ type: 'media.item.activate', value: 'img_1' });
    await surface.handleEvent({ type: 'media.choose' });
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(result.items[0].origin, 'library');
    assert.equal(result.items[0].file.id, 'img_1');
    assert.equal(imported.length, 0);
    assert.equal(closes.length, 1);
});

test('a choice from Ouvrir shows the outside file in the preview first; closed without Choix, it is cancelled', async () => {
    const file = { name: 'vacances.png', type: 'image/png' };
    const { panel, surface, picks } = harness({ picked: () => ({ ok: true, files: [file] }) });
    const pending = panel.requestSelection({ kinds: ['image', 'video'] });
    await open(surface, { mediaPick: true });
    await surface.handleEvent({ type: 'media.source.files' });
    assert.equal(picks[0].source, 'files');
    assert.equal(picks[0].accept, 'image/*,video/*');
    const state = surface.readState();
    assert.equal(state.chosen[0].origin, 'external');
    assert.equal(state.shown.record.properties.source, 'blob:vacances.png');
    surface.onClose();
    assert.deepEqual(await pending, { ok: false, cancelled: true, error: 'cancelled', items: [] });
});

test('removable: Suppr. takes off what the caller holds', async () => {
    const { panel, surface, draw, closes } = harness();
    const pending = panel.requestSelection({ kinds: ['image'], removable: true });
    await open(surface, { mediaPick: true });
    assert.ok(bandKeys(draw().band).includes('media_import_remove'));
    await surface.handleEvent({ type: 'media.remove' });
    assert.deepEqual(await pending, { ok: true, removed: true, items: [] });
    assert.equal(closes.length, 1);
});

test('a sound asked: no camera, no album', async () => {
    const { panel, surface, draw } = harness({ sources: ['camera', 'photos', 'files'] });
    void panel.requestSelection({ kinds: ['audio'] });
    await open(surface, { mediaPick: true });
    assert.deepEqual(bandKeys(draw().band), ['media_import_medias', 'media_import_system']);
});

test('owner-scoped filenames keep independent choices for idless library rows', async () => {
    const { surface } = harness({ files: [
        { owner_id: 'owner', file_name: 'photo.png', kind: 'image' },
        { owner_id: 'other', file_name: 'photo.png', kind: 'image' }
    ] });
    await open(surface);
    await surface.handleEvent({ type: 'media.filter.set', values: ['all'] });
    const rows = surface.readState().entries;
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].key, rows[1].key);
});

// The listing comes in two waves (uploaded files, then takes): what is read shows at once.
test('the listing paints each wave and keeps the previous rows while it refreshes', async () => {
    let release = () => {};
    const gate = new Promise((resolve) => { release = resolve; });
    const panel = createMediaPanelSurface({
        loadFiles: async ({ onProgress } = {}) => {
            onProgress?.({ ok: true, partial: true, files: [FILES[2]] });
            await gate;
            return { ok: true, files: [FILES[0], FILES[2]] };
        },
        sources: () => ['files']
    });
    panel.surface.onOpen({ context: MOUNT_CONTEXT });
    await panel.handleEvent({ type: 'media.filter.set', values: ['all'] });
    await flush();
    const partial = panel.surface.readState();
    assert.deepEqual(partial.entries.map((entry) => entry.name), ['affiche'], 'the first wave is already a list');
    assert.equal(partial.statusKind, null);
    release();
    await flush();
    assert.deepEqual(panel.surface.readState().entries.map((entry) => entry.name), ['montage', 'affiche']);
});

// Partial transfers retain failures for review without replaying successful entries.
test('a partial batch keeps the panel open and reports its failure', async () => {
    const partial = harness({ importResult: () => ({ ok: false, created: 1, error: 'media_create_failed' }) });
    await open(partial.surface);
    await partial.surface.handleEvent({ type: 'media.item.activate', value: 'img_1' });
    const result = await partial.surface.handleEvent({ type: 'media.choose' });
    assert.equal(result.ok, false);
    assert.deepEqual(partial.closes, []);
    assert.match(partial.surface.readState().notice, /media_create_failed/);
});

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
        // Chaque source publie sa vague des qu'elle est lue : les prises de l'appareil
        // n'attendent jamais la liste du serveur.
        assert.ok(waves.length >= 1 && waves.every((wave) => wave.partial === true), 'chaque vague est partielle');
        assert.ok(waves.some((wave) => wave.files.map((file) => file.file_name).sort().join() === 'ecran.mp4,prise.wav'),
            'la vague des prises ne contient que ce qui est deja resolu');

        // Un serveur qui ne repond pas ne retient pas les prises.
        waves.length = 0;
        globalThis.fetch = () => new Promise(() => {});
        void media.list_user_media_files({ onProgress: (wave) => waves.push(wave) });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(waves.map((wave) => wave.files.map((file) => file.file_name).sort()), [['ecran.mp4', 'prise.wav']],
            'les prises sont publiees pendant que le serveur se tait');
    } finally {
        globalThis.window = previousWindow;
        globalThis.fetch = previousFetch;
    }
});

// The iOS « Ajouter depuis » sheet lists the Contacts source next to Files,
// Camera roll and Music for pictures; choosing it returns no file, only the
// source, so the Media panel can list the contact photos it already owns.
const installNativeSheet = (answer) => {
    const requests = [];
    globalThis.window = {
        __HOST_ENV: 'app',
        AtomeFileSystem: {
            loadFilesWithDocumentPicker(fileTypes, callback, multiple, options) {
                requests.push(options);
                callback(answer);
            }
        }
    };
    return requests;
};


test('a picture import offers the Contacts source and reports it without files', async () => {
    const requests = installNativeSheet({ success: true, data: { source: 'contacts', files: [] } });
    const { requestProjectImportFiles } = await import('../../eVe/intuition/runtime/project_media_import_runtime.js');
    const selection = await requestProjectImportFiles({ kinds: ['image'] });
    assert.deepEqual(requests[0].sources, ['files', 'photos', 'contacts']);
    assert.equal(requests[0].labels.contacts, 'Contacts');
    assert.deepEqual(selection, { ok: true, source: 'contacts', files: [] });
    delete globalThis.window;
});

test('a sound-only import never offers contact photos', async () => {
    const requests = installNativeSheet({ success: false, error: 'User cancelled' });
    const { requestProjectImportFiles } = await import('../../eVe/intuition/runtime/project_media_import_runtime.js');
    await requestProjectImportFiles({ kinds: ['audio'] });
    assert.deepEqual(requests[0].sources, ['files', 'music']);
    delete globalThis.window;
});