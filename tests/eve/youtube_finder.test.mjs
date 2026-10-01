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
