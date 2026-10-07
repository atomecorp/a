import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWsYoutubeSearch } from '../../server/ws_youtube_search.js';

test('YouTube search requests videos only and returns bounded Finder data', async () => {
    let requested;
    const response = await handleWsYoutubeSearch({
        type: 'youtube-search', requestId: 'search-1', query: '  music  ', pageToken: 'next-page'
    }, 'finder-test-1', {
        apiKey: 'private-test-key', now: Date.parse('2026-10-01T00:00:00Z'),
        fetchResource: async (url) => {
            requested = new URL(url);
            return { ok: true, json: async () => ({
                items: [{ id: { videoId: 'dQw4w9WgXcQ' }, snippet: {
                    title: 'Video title', channelTitle: 'Channel', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' } }
                } }, { id: { videoId: '../invalid' } }],
                nextPageToken: 'after-this'
            }) };
        }
    });
    assert.equal(requested.searchParams.get('type'), 'video');
    assert.equal(requested.searchParams.get('videoEmbeddable'), 'true');
    assert.equal(requested.searchParams.get('videoSyndicated'), 'true');
    assert.equal(requested.searchParams.get('q'), 'music');
    assert.equal(requested.searchParams.get('pageToken'), 'next-page');
    assert.equal(requested.searchParams.get('maxResults'), '10');
    assert.equal(response.requestId, 'search-1');
    assert.equal(response.results.length, 1);
    assert.deepEqual(response.results[0], {
        videoId: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Video title', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', channel: 'Channel'
    });
    assert.equal(response.nextPageToken, 'after-this');
    assert.equal(JSON.stringify(response).includes('private-test-key'), false);
});

test('YouTube search refuses missing configuration and invalid input before network access', async () => {
    const fetchResource = () => { throw new Error('unexpected network request'); };
    const missing = await handleWsYoutubeSearch({ type: 'youtube-search', query: 'music' }, 'finder-test-2', {
        apiKey: '', fetchResource
    });
    const invalid = await handleWsYoutubeSearch({ type: 'youtube-search', query: ' ' }, 'finder-test-3', {
        apiKey: 'key', fetchResource
    });
    assert.equal(missing.error, 'youtube_search_not_configured');
    assert.equal(invalid.error, 'youtube_search_invalid_query');
});

test('YouTube search limits guest requests per address', async () => {
    const input = { type: 'youtube-search', query: 'music' };
    const options = { apiKey: 'key', now: Date.parse('2026-10-02T00:00:00Z'),
        fetchResource: async () => ({ ok: true, json: async () => ({ items: [] }) }) };
    for (let index = 0; index < 12; index += 1) {
        assert.equal((await handleWsYoutubeSearch(input, 'finder-test-4', options)).ok, true);
    }
    const limited = await handleWsYoutubeSearch(input, 'finder-test-4', options);
    assert.equal(limited.error, 'youtube_search_rate_limited');
});

test('YouTube search returns plain-text titles and logs provider refusals without the key', async () => {
    const logs = [];
    const options = { apiKey: 'private-test-key', now: Date.parse('2026-10-03T00:00:00Z'), log: (level, entry) => logs.push({ level, ...entry }) };
    const ok = await handleWsYoutubeSearch({ type: 'youtube-search', requestId: 'r', query: 'pulse' }, 'finder-test-5', { ...options,
        fetchResource: async () => ({ ok: true, json: async () => ({ items: [{ id: { videoId: 'dQw4w9WgXcQ' },
            snippet: { title: 'Restored &amp; Re-Edited &quot;Live&quot; &#39;94', channelTitle: 'Rock &amp; Co' } }] }) }) });
    assert.equal(ok.results[0].title, 'Restored & Re-Edited "Live" \'94');
    assert.equal(ok.results[0].channel, 'Rock & Co');
    const refused = await handleWsYoutubeSearch({ type: 'youtube-search', requestId: 'r2', query: 'pulse' }, 'finder-test-6', { ...options,
        fetchResource: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'API disabled', errors: [{ reason: 'accessNotConfigured' }] } }) }) });
    assert.equal(refused.error, 'youtube_search_quota_or_permission');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].data.reason, 'accessNotConfigured');
    assert.equal(JSON.stringify(logs).includes('private-test-key'), false);
});
