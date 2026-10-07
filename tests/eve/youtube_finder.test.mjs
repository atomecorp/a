import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinderPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js';
import { buildBevyPanelTree } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { normalizeRenderAtom } from '../../eVe/domains/rendering/render_atom.js';

const findNode = (node, id) => {
    if (node?.id === id) return node;
    for (const child of node?.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};

test('YouTube Finder searches only after explicit submission and keeps the target object', async () => {
    const requests = [];
    const runtime = createFinderPanelSurface({
        searchVideos: async (request) => {
            requests.push(request);
            return { records: [{ id: 'abcDEFghi12', name: 'Video', type: 'image' }], nextPageToken: 'next' };
        },
        events: { on: () => () => {} }
    });
    await runtime.applyToolContext({ scope: 'youtube', query: '', targetAtomeId: 'video_a' });
    await runtime.applyToolContext({ query: 'one' });
    await runtime.applyToolContext({ query: 'one two' });
    assert.equal(requests.length, 0);
    assert.equal(runtime.state.targetAtomeId, 'video_a');
    assert.equal(runtime.readState().statusKind, 'empty');

    await runtime.applyToolContext({ query: 'one two', submitted: true });
    assert.deepEqual(requests, [{ query: 'one two', pageToken: '' }]);
    assert.equal(runtime.readState().records[0].id, 'abcDEFghi12');
    await runtime.handleEvent({ type: 'finder.youtube.more' });
    assert.deepEqual(requests[1], { query: 'one two', pageToken: 'next' });
});

test('YouTube Finder exposes the missing service key as a configuration error', async () => {
    const runtime = createFinderPanelSurface({
        searchVideos: async () => { throw new Error('youtube_search_not_configured'); },
        events: { on: () => () => {} }
    });
    const result = await runtime.applyToolContext({ scope: 'youtube', query: 'music', submitted: true });
    assert.equal(result.ok, false);
    assert.equal(runtime.state.errorCode, 'youtube_search_not_configured');
    assert.equal(runtime.readState().statusKind, 'error');
});

test('YouTube panel footer has title and Close in standard view and disappears in fullscreen', () => {
    const base = { id: 'youtube_test', title: 'Saved title',
        geometry: { x: 20, y: 30, width: 560, height: 360 },
        surfaceSize: { width: 800, height: 600 }, bodyChildren: [], fixedChildren: [],
        minimalFooter: true, closeLabel: 'Fermer' };
    const standard = buildBevyPanelTree(base);
    assert.ok(findNode(standard.root, 'youtube_test_footer'));
    assert.equal(findNode(standard.root, 'youtube_test_footer_close_label')?.text, 'Fermer');
    assert.equal(findNode(standard.root, 'youtube_test_footer_status')?.text, 'Saved title');
    const fullscreen = buildBevyPanelTree({ ...base, hideFooter: true });
    assert.equal(findNode(fullscreen.root, 'youtube_test_footer'), null);
    const restored = buildBevyPanelTree(base);
    assert.equal(findNode(restored.root, 'youtube_test_footer_status')?.text, 'Saved title');
});

test('Saved YouTube video projects its poster through the image renderer', () => {
    const atom = normalizeRenderAtom({ id: 'video_a', type: 'video',
        properties: { media_source: 'youtube', youtube_video_id: 'abcDEFghi12',
            media_url: 'https://www.youtube.com/watch?v=abcDEFghi12',
            poster_source: 'https://i.ytimg.com/vi/abcDEFghi12/mqdefault.jpg' } });
    assert.equal(atom.type, 'image');
    assert.equal(atom.content.source, 'https://i.ytimg.com/vi/abcDEFghi12/mqdefault.jpg');
    assert.equal(atom.content.source.includes('watch?v='), false);
});

test('YouTube Finder shows the viewing history until a search is submitted and again once the field is emptied', async () => {
    const history = [{ id: 'histVIDEO01', name: 'Watched', type: 'image' }];
    const runtime = createFinderPanelSurface({
        searchVideos: async () => ({ records: [{ id: 'abcDEFghi12', name: 'Found', type: 'image' }], nextPageToken: '' }),
        readVideoHistory: () => history,
        events: { on: () => () => {} }
    });
    await runtime.applyToolContext({ scope: 'youtube', query: '' });
    let snapshot = runtime.readState();
    assert.equal(snapshot.statusKind, null);
    assert.equal(snapshot.youtubeHistory, true);
    assert.deepEqual(snapshot.records.map((record) => record.id), ['histVIDEO01']);

    await runtime.applyToolContext({ query: 'music', submitted: true });
    snapshot = runtime.readState();
    assert.equal(snapshot.youtubeHistory, false);
    assert.deepEqual(snapshot.records.map((record) => record.id), ['abcDEFghi12']);

    await runtime.applyToolContext({ query: '' });
    snapshot = runtime.readState();
    assert.equal(snapshot.youtubeHistory, true);
    assert.deepEqual(snapshot.records.map((record) => record.id), ['histVIDEO01']);
});

test('YouTube history keeps the last twenty distinct videos, newest first, and publishes them at once', async () => {
    const { normalizeYoutubeHistory, readYoutubeHistory, recordYoutubeHistory, YOUTUBE_HISTORY_LIMIT } =
        await import('../../eVe/intuition/tools/youtube_history_preference.js');
    const id = (n) => `video${String(n).padStart(6, '0')}`;
    const many = Array.from({ length: 30 }, (_, n) => ({ videoId: id(n), title: `T${n}` }));
    const normalized = normalizeYoutubeHistory([...many, { videoId: id(0) }, { videoId: 'bad id' }]);
    assert.equal(normalized.length, YOUTUBE_HISTORY_LIMIT);
    assert.equal(new Set(normalized.map((entry) => entry.videoId)).size, YOUTUBE_HISTORY_LIMIT);

    const events = [];
    globalThis.window = { __eveProfilePreferences: { youtube: { history: [{ videoId: id(1) }, { videoId: id(2) }] } },
        dispatchEvent: (event) => events.push(event.type), CustomEvent: class { constructor(type) { this.type = type; } } };
    try {
        void recordYoutubeHistory({ videoId: id(2), title: 'Again', channel: 'C', thumbnail: 'https://i.ytimg.com/x.jpg' });
        assert.deepEqual(readYoutubeHistory().map((entry) => entry.videoId), [id(2), id(1)]);
        assert.equal(readYoutubeHistory()[0].title, 'Again');
        assert.deepEqual(events, ['eve:profile-preferences-updated']);
    } finally {
        delete globalThis.window;
    }
});
