import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTvCatalog, handleWsTvCatalog, handleWsTvResolve } from '../../server/ws_tv_catalog.js';

const sources = () => ({
    countries: [{ code: 'FR', name: 'France', flag: '' }, { code: 'IT', name: 'Italy', flag: '' }],
    channels: [
        { id: 'TF1.fr', name: 'TF1', country: 'FR', categories: ['general'], owners: [] },
        { id: 'France3.fr', name: 'France 3', country: 'FR', categories: ['general'], owners: ['France Télévisions'] },
        { id: 'Adult.fr', name: 'Adult', country: 'FR', categories: [], is_nsfw: true },
        { id: 'Gone.fr', name: 'Gone', country: 'FR', categories: [], closed: '2020-01-01' },
        { id: 'Blocked.it', name: 'Blocked', country: 'IT', categories: [] },
        { id: 'Many.it', name: 'Many', country: 'IT', categories: [] }
    ],
    blocklist: [{ channel: 'Blocked.it', reason: 'dmca' }],
    logos: [{ channel: 'TF1.fr', feed: null, url: 'https://logo.test/tf1.png' }],
    streams: [
        { channel: 'TF1.fr', url: 'http://145.239.5.177/tf1/index.m3u8' },
        { channel: 'TF1.fr', url: 'https://cdn.test/tf1/master.m3u8', quality: '720p' },
        { channel: 'France3.fr', url: 'https://cdn.test/f3.m3u8', referrer: 'https://site.test' },
        { channel: 'Adult.fr', url: 'https://cdn.test/a.m3u8' },
        { channel: 'Gone.fr', url: 'https://cdn.test/g.m3u8' },
        { channel: 'Blocked.it', url: 'https://cdn.test/b.m3u8' },
        { channel: null, url: 'https://cdn.test/orphan.m3u8' },
        ...Array.from({ length: 12 }, (_, n) => ({ channel: 'Many.it', url: `https://cdn.test/many/${n}.m3u8` }))
    ],
    freeTv: [
        '#EXTM3U',
        '#EXTINF:-1 tvg-name="franceinfo:" tvg-logo="https://logo.test/fi.png" tvg-id="Franceinfo.fr" tvg-country="FR" group-title="France",franceinfo: Ⓨ',
        'https://www.youtube.com/c/franceinfo/live',
        '#EXTINF:-1 tvg-name="France 3" tvg-id="France3.fr" tvg-country="FR" group-title="France",France 3',
        'http://89.187.185.76:8080/france3/index.m3u8',
        '#EXTINF:-1 tvg-name="Clip" tvg-id="Clip.it" tvg-country="IT" group-title="Italy",Clip Ⓨ',
        'https://www.youtube.com/watch?v=ABVQXgr2LW4',
        '#EXTINF:-1 tvg-name="Film" tvg-id="Film.it" tvg-country="IT" group-title="VOD Italy",Film',
        'https://cdn.test/film.mp4'
    ].join('\n')
});

test('the catalogue merges both lists by channel and keeps only channels a browser can open', () => {
    const catalog = buildTvCatalog(sources());
    const fr = catalog.byCountry.get('FR');
    assert.deepEqual(fr.map((channel) => channel.id), ['France3.fr', 'Franceinfo.fr', 'TF1.fr']);
    const tf1 = catalog.byId.get('TF1.fr');
    // https first; the logo comes from the IPTV-org logos.
    assert.deepEqual(tf1.streams.map((stream) => [stream.url.slice(0, 12), stream.kind, stream.secure]),
        [['https://cdn.', 'hls', true], ['http://145.2', 'hls', false]]);
    assert.equal(tf1.logo, 'https://logo.test/tf1.png');
    // A referrer-bound stream is dropped; the Free-TV relay remains; owner tagged.
    const france3 = catalog.byId.get('France3.fr');
    assert.deepEqual(france3.streams.map((stream) => stream.provider), ['free-tv']);
    assert.ok(france3.providers.includes('francetv'));
    assert.equal(catalog.byId.get('Franceinfo.fr').streams[0].kind, 'youtube_live');
    assert.equal(catalog.byId.get('Franceinfo.fr').name, 'franceinfo:');
    assert.deepEqual(catalog.byId.get('Clip.it').streams[0], { url: 'https://www.youtube.com/watch?v=ABVQXgr2LW4',
        kind: 'youtube', videoId: 'ABVQXgr2LW4', quality: '', secure: true, provider: 'free-tv' });
    // NSFW, closed, blocklisted, orphan and VOD entries never appear.
    for (const id of ['Adult.fr', 'Gone.fr', 'Blocked.it', 'Film.it']) assert.equal(catalog.byId.has(id), false, id);
    assert.equal(catalog.byId.get('Many.it').streams.length, 8);
    assert.deepEqual(catalog.countries.map((country) => [country.code, country.count]), [['FR', 3], ['IT', 2]]);
});

test('the public frame serves one country or given ids, and refuses malformed input', async () => {
    const catalog = buildTvCatalog(sources());
    const readCatalog = async () => catalog;
    const country = await handleWsTvCatalog({ type: 'tv-catalog', requestId: 'a', country: 'fr' }, { readCatalog });
    assert.equal(country.type, 'tv-catalog-response');
    assert.equal(country.requestId, 'a');
    assert.equal(country.channels.length, 3);
    const ids = await handleWsTvCatalog({ type: 'tv-catalog', ids: ['TF1.fr', 'nope'] }, { readCatalog });
    assert.deepEqual(ids.channels.map((channel) => channel.id), ['TF1.fr']);
    const list = await handleWsTvCatalog({ type: 'tv-catalog' }, { readCatalog });
    assert.deepEqual([list.channels.length, list.countries.length], [0, 2]);
    assert.equal((await handleWsTvCatalog({ type: 'tv-catalog', country: 'france' }, { readCatalog })).error, 'INVALID_ARGUMENT');
    assert.equal((await handleWsTvCatalog({ type: 'tv-catalog', country: 'FR' }, { readCatalog: async () => null })).error,
        'PROVIDER_UNAVAILABLE');
    assert.equal(await handleWsTvCatalog({ type: 'other' }, { readCatalog }), null);
});

test('YouTube live resolution accepts only a channel live address', async () => {
    const resolve = async () => 'NG7ZX42nZKc';
    const ok = await handleWsTvResolve({ type: 'tv-resolve', requestId: 'r', url: 'https://www.youtube.com/c/franceinfo/live' }, { resolve });
    assert.deepEqual([ok.ok, ok.videoId], [true, 'NG7ZX42nZKc']);
    for (const url of ['https://evil.test/live', 'https://www.youtube.com/watch?v=NG7ZX42nZKc', 'http://www.youtube.com/c/x/live']) {
        assert.equal((await handleWsTvResolve({ type: 'tv-resolve', url }, { resolve })).error, 'INVALID_ARGUMENT', url);
    }
    assert.equal((await handleWsTvResolve({ type: 'tv-resolve', url: 'https://www.youtube.com/@x/live' }, { resolve: async () => '' })).error,
        'CHANNEL_NOT_FOUND');
});

test('a channel starts with its main feed: other languages never fill the stream cap first', () => {
    const catalog = buildTvCatalog({
        countries: [{ code: 'FR', name: 'France', languages: ['fra'] }],
        channels: [{ id: 'News24.fr', name: 'News 24', country: 'FR', categories: ['news'] }],
        feeds: [{ channel: 'News24.fr', id: 'Arabic', languages: ['ara'], is_main: false },
            { channel: 'News24.fr', id: 'French', languages: ['fra'], is_main: true }],
        streams: [...Array.from({ length: 9 }, (_, n) => ({ channel: 'News24.fr', feed: 'Arabic', url: `https://cdn.test/ar/${n}.m3u8` })),
            { channel: 'News24.fr', feed: 'French', url: 'https://cdn.test/fr/master.m3u8' }]
    });
    const streams = catalog.byId.get('News24.fr').streams;
    assert.equal(streams[0].url, 'https://cdn.test/fr/master.m3u8');
    assert.equal(streams.length, 8);
});

test('name search finds a channel in any country, exact names first, the preferred country breaking ties', async () => {
    const { searchTvCatalog } = await import('../../server/ws_tv_catalog.js');
    const catalog = buildTvCatalog({
        countries: [{ code: 'FR', name: 'France' }, { code: 'US', name: 'USA' }, { code: 'DE', name: 'Germany' }],
        channels: [{ id: 'France24.fr', name: 'France 24', country: 'FR' }, { id: 'CNN.us', name: 'CNN', country: 'US' },
            { id: 'arte.fr', name: 'Arte', country: 'FR' }, { id: 'arte.de', name: 'Arte', country: 'DE' }],
        streams: ['France24.fr', 'CNN.us', 'arte.fr', 'arte.de'].map((channel) => ({ channel, url: `https://cdn.test/${channel}.m3u8` }))
    });
    assert.deepEqual(searchTvCatalog(catalog, 'cnn', 'FR').map((c) => [c.id, c.match]), [['CNN.us', 'exact']]);
    assert.deepEqual(searchTvCatalog(catalog, 'ARTE', 'DE').map((c) => c.id), ['arte.de', 'arte.fr']);
    // "France 2" is not "France 24": only a prefix match, never an exact one.
    assert.deepEqual(searchTvCatalog(catalog, 'France 2', 'FR').map((c) => c.match), ['prefix']);
});
