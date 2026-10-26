// The Médiathèque's online sources: free images, videos and sounds, public domain
// or CC0 only (no attribution owed, so the results show alone). `media-library-search`
// answers the results of every source of a kind at once (the sources are never named
// to the user); `discover: true` instead of a query draws a theme at random (what a
// type shows before anything is searched). A source slower than SOURCE_BUDGET_MS is
// left out of that answer: one provider never holds the others' results back.
// `media-library-fetch` reads one byte range of a result's picture (`thumb`) or of its
// file, or a sound's waveform (`waveform`: its peaks, `points`); `stream` answers the
// checked address a page player streams the file from (`{ url, total, mime }`: a video
// plays at once, never read whole first — the PeerTube streams' way, ws_peertube.js).
// The client names a result id, never a URL: each address comes from the provider's own
// record and goes through the checked public source access (public_source_fetch.js), so
// this is not an open proxy.
//   - Openverse (WordPress): images and sounds (with their waveform), `license=cc0,pdm`;
//   - NASA Image and Video Library: images and videos (public domain media; its sounds
//     are hour-long podcasts, without duration nor waveform: left out);
//   - Internet Archive: videos marked public domain or CC0 with an MP4 file, never one behind
//     a login (`access-restricted-item`: its file answers 401); its feature films (kind `film`,
//     Divertissement › Vidéo › Films & séries) too, whole films only ever streamed, never imported.
import { lookup } from 'node:dns/promises';
import { createAddressRateLimit, createPublicSourceAccess } from './public_source_fetch.js';

// Freesound's CDN serves about 75 KB/s: a range must arrive within the 20 s of one request.
const CHUNK_BYTES = 512 * 1024;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
// A whole film streams (its player reads ranges as it plays), it is never read whole here.
const MAX_FILM_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_RECORD_BYTES = 4 * 1024 * 1024;
const PER_SOURCE = 12;
const SOURCE_BUDGET_MS = 8000;
// The themes a type draws from before anything is searched (never shown: the query of a discovery).
const THEMES = Object.freeze({
    image: ['nature', 'ocean', 'mountain', 'flower', 'forest', 'city', 'animal', 'bird', 'sky', 'river', 'galaxy', 'winter'],
    video: ['ocean', 'earth', 'launch', 'aurora', 'nature', 'city', 'storm', 'animals', 'space station', 'clouds', 'volcano', 'travel'],
    audio: ['rain', 'birds', 'piano', 'wind', 'waves', 'forest', 'guitar', 'thunder', 'city', 'drum', 'river', 'bells'],
    film: ['comedy', 'western', 'noir', 'mystery', 'adventure', 'drama', 'romance', 'science fiction', 'horror', 'chaplin', 'hitchcock', 'musical']
});
const RESULT_TTL_MS = 60 * 60_000;
const MAX_RESULTS_KEPT = 5000;
const MAX_ANSWERS_KEPT = 500;
const ARCHIVE_MAX_ITEM_BYTES = 80 * 1024 * 1024;
const HOSTS = Object.freeze({
    openverse: { hosts: ['api.openverse.org', 'upload.wikimedia.org', 'cdn.freesound.org'], suffixes: ['.staticflickr.com'] },
    nasa: { hosts: ['images-api.nasa.gov', 'images-assets.nasa.gov'], suffixes: [] },
    archive: { hosts: ['archive.org'], suffixes: ['.archive.org'] }
});
const ID = /^(openverse_image|openverse_audio|nasa|archive):[A-Za-z0-9 ._\-()',]{1,160}$/;
const KINDS = new Set(['image', 'video', 'audio', 'film']);

const allowedHost = (provider, host) => HOSTS[provider].hosts.includes(host) || HOSTS[provider].suffixes.some(suffix => host.endsWith(suffix));
const access = createPublicSourceAccess({ allowedHost, sourceCode: 'media_library_source', fetchCode: 'media_library_fetch',
    chunkBytes: CHUNK_BYTES, maxFileBytes: MAX_FILE_BYTES });
const filmAccess = createPublicSourceAccess({ allowedHost, sourceCode: 'media_library_source', fetchCode: 'media_library_fetch',
    chunkBytes: CHUNK_BYTES, maxFileBytes: MAX_FILM_BYTES });
const { fail } = access;
// Per client (its account, else its address): what reaches a provider anew (a search, a picture,
// a waveform, a stream address, a file's first range), and the following ranges of the files it
// reads (bandwidth only: 1200 ranges are 600 MB a minute).
const limited = createAddressRateLimit({ windowMs: 60_000, max: 240 });
const rangesLimited = createAddressRateLimit({ windowMs: 60_000, max: 1200 });
// A result found is kept for a while: its picture, file and waveform are read without asking the provider
// again; a search answered is kept as long (Openverse grants an address 200 anonymous requests a day).
const results = new Map();
const answered = new Map();
const reply = (message, type, fields) => ({ type, requestId: message.requestId || message.request_id || null,
    request_id: message.requestId || message.request_id || null, success: fields.ok === true, ...fields });

const readJson = async (provider, url, context) => {
    const response = await access.request(provider, url, { accept: 'application/json' }, context);
    if (!response.ok) throw fail('media_library_source_unavailable');
    return JSON.parse((await access.readBounded(response, MAX_RECORD_BYTES)).toString('utf8'));
};
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
const https = url => String(url || '').replace(/^http:\/\//, 'https://');
const nameOf = (title, url, fallback) => {
    const extension = (/\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(String(url || ''))?.[1] || fallback).toLowerCase();
    return `${String(title || 'media').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^\p{L}\p{N} _-]+/gu, ' ').trim().slice(0, 60) || 'media'}.${extension}`;
};
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp3: 'audio/mpeg', m4a: 'audio/mp4',
    wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', mp4: 'video/mp4' };
const mimeOf = name => MIME[name.split('.').pop()] || 'application/octet-stream';

// Each source answers `{ id, provider, kind, title, thumb, file?, resolve?, … }`.
const openverse = (kind) => async (query, context) => {
    const path = kind === 'image' ? 'images' : 'audio';
    const page = await readJson('openverse', `https://api.openverse.org/v1/${path}/?q=${encodeURIComponent(query)}&license=cc0,pdm&mature=false&page_size=20`, context);
    return (page?.results || []).filter(item => allowedHost('openverse', hostOf(item.url))
        && (kind === 'image' || ['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(String(item.filetype || '').toLowerCase())))
        .slice(0, PER_SOURCE).map(item => ({ id: `openverse_${kind}:${item.id}`, provider: 'openverse', kind, title: String(item.title || '').trim(),
            thumb: kind === 'image' ? item.thumbnail : '', file: item.url, license: item.license, author: String(item.creator || ''),
            source_url: String(item.foreign_landing_url || ''), width: item.width || null, height: item.height || null,
            duration: item.duration ? item.duration / 1000 : null,
            waveform: kind === 'audio' && allowedHost('openverse', hostOf(item.waveform)) ? item.waveform : '' }));
};
// NASA lists an item's renditions in its collection: the first present of these, in order (a video's
// lightest first: a `medium` weighs up to 70 MB where its `mobile` weighs 10, and it is read whole).
const NASA_RENDITIONS = { image: [/~large\.jpg$/i, /~medium\.jpg$/i, /~orig\.(jpe?g|png)$/i], video: [/~mobile\.mp4$/i, /~preview\.mp4$/i, /~small\.mp4$/i, /~medium\.mp4$/i, /~orig\.mp4$/i] };
const nasaRendition = (kind, urls) => NASA_RENDITIONS[kind].map(pattern => urls.find(url => pattern.test(url))).find(Boolean) || '';
const nasa = (kind) => async (query, context) => {
    const page = await readJson('nasa', `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=${kind}&page_size=${PER_SOURCE}`, context);
    return (page?.collection?.items || []).slice(0, PER_SOURCE).map((item) => {
        const data = item.data?.[0] || {};
        const preview = (item.links || []).find(link => link.render === 'image' && /~(thumb|medium)\.jpg$/i.test(link.href)) || item.links?.[0];
        return { id: `nasa:${data.nasa_id}`, provider: 'nasa', kind, title: String(data.title || '').trim(), thumb: https(preview?.href || ''),
            license: 'nasa_public_domain', author: String(data.center || 'NASA'), source_url: `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`,
            resolve: async (ctx) => https(nasaRendition(kind, await readJson('nasa', https(item.href), ctx))) };
    }).filter(item => ID.test(item.id));
};
// The Internet Archive: its smallest MP4 rendition of an item light enough to be imported quickly
// (most weigh 100 to 250 MB; a result streams when it plays, it is read whole only when kept).
const archiveVideos = async (query, context) => {
    const search = `(${query}) AND mediatype:(movies) AND licenseurl:(*publicdomain* OR *zero*) AND item_size:[1 TO ${ARCHIVE_MAX_ITEM_BYTES}] AND NOT access-restricted-item:true AND format:(MPEG4 OR "h.264" OR "h.264 IA")`;
    const page = await readJson('archive', `https://archive.org/advancedsearch.php?q=${encodeURIComponent(search)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=${PER_SOURCE}&output=json`, context);
    return archiveItems(page, 'video');
};
// The results of an Internet Archive search as `kind` items, each resolving to its smallest MP4.
const archiveItems = (page, kind) => {
    const docs = page?.response?.docs || [];
    return docs.map(doc => ({ id: `archive:${doc.identifier}`, provider: 'archive', kind, title: String(doc.title || '').trim(),
        thumb: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`, license: /zero/.test(doc.licenseurl) ? 'cc0' : 'pdm',
        author: [doc.creator].flat().filter(Boolean).join(', '), source_url: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
        year: String(doc.year || '').slice(0, 4),
        resolve: async (ctx) => {
            const meta = await readJson('archive', `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, ctx);
            const mp4 = (meta?.files || []).filter(file => /\.mp4$/i.test(file.name) && Number(file.size) > 0).sort((a, b) => Number(a.size) - Number(b.size))[0];
            return mp4 ? `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${mp4.name.split('/').map(encodeURIComponent).join('/')}` : '';
        } })).filter(item => ID.test(item.id));
};
// Its feature films marked public domain or CC0, the most watched first: the smallest MP4 of each streams.
const archiveFilms = async (query, context) => {
    const search = `(${query}) AND collection:(feature_films) AND licenseurl:(*publicdomain* OR *zero*) AND NOT access-restricted-item:true AND format:(MPEG4 OR "h.264" OR "h.264 IA")`;
    const page = await readJson('archive', `https://archive.org/advancedsearch.php?q=${encodeURIComponent(search)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&fl[]=year&sort[]=downloads+desc&rows=${PER_SOURCE * 2}&output=json`, context);
    return archiveItems(page, 'film');
};
const SOURCES = Object.freeze({ image: [openverse('image'), nasa('image')], video: [nasa('video'), archiveVideos], audio: [openverse('audio')], film: [archiveFilms] });

// What the client receives of a result: never an address.
const publicItem = ({ resolve: _resolve, file: _file, thumb, waveform, points: _points, ...item }) => ({ ...item, has_thumb: !!thumb, has_waveform: !!waveform });
// Every source's answer, or once SOURCE_BUDGET_MS has passed, those already in (as soon as one is):
// a slow provider never holds the others' results back, and a lone one is always awaited.
const answersInBudget = (pending) => new Promise((resolve) => {
    const lists = [];
    let left = pending.length, late = false;
    const settle = () => resolve(lists);
    const budget = setTimeout(() => { late = true; if (lists.length) settle(); }, SOURCE_BUDGET_MS);
    pending.forEach(promise => promise.then(list => lists.push(list), () => {}).finally(() => {
        left -= 1;
        if (!left || (late && lists.length)) { clearTimeout(budget); settle(); }
    }));
});
// The sources' answers interleaved (one of each in turn), what one source cannot give in time left out.
const search = async (kind, query, context) => {
    const key = `${kind}:${query.toLowerCase()}`, known = answered.get(key);
    if (known && context.now() - known.at < RESULT_TTL_MS && known.ids.every(id => results.has(id))) return known.ids.map(id => publicItem(results.get(id).item));
    const lists = await answersInBudget(SOURCES[kind].map(source => source(query, context)));
    if (!lists.length) throw fail('media_library_source_unavailable');
    const found = [];
    for (let index = 0; lists.some(list => index < list.length); index += 1) for (const list of lists) if (list[index]) found.push(list[index]);
    const now = context.now();
    // Kept in arrival order: the oldest go first, until the rest is fresh and few enough.
    for (const [id, entry] of results) { if (now - entry.at < RESULT_TTL_MS && results.size <= MAX_RESULTS_KEPT) break; results.delete(id); }
    found.forEach(item => results.set(item.id, { at: now, item }));
    for (const [entry, value] of answered) if (now - value.at >= RESULT_TTL_MS || answered.size > MAX_ANSWERS_KEPT) answered.delete(entry); else break;
    if (lists.length === SOURCES[kind].length) answered.set(key, { at: now, ids: found.map(item => item.id) });
    return found.map(publicItem);
};

// A theme drawn at random, its first page: the one a provider keeps ready (Openverse takes over
// 20 s to answer a page it has not served lately).
const discover = (kind, context) => search(kind, THEMES[kind][Math.floor(Math.random() * THEMES[kind].length)], context);
// A sound's peaks, as its provider draws them (0…1).
const waveformOf = async (item, context) => {
    if (!item.waveform) throw fail('media_library_source_format_missing');
    if (item.points) return item.points;
    const points = (await readJson(item.provider, item.waveform, context))?.points;
    if (!Array.isArray(points) || !points.length) throw fail('media_library_source_format_missing');
    item.points = points.map(point => Math.max(0, Math.min(1, Number(point) || 0)));
    return item.points;
};
const fileOf = async (item, variant, context) => {
    if (variant === 'thumb') {
        if (!item.thumb) throw fail('media_library_fetch_range_invalid');
        return { url: item.thumb, mime: 'image/jpeg', name: nameOf(item.title, item.thumb, 'jpg') };
    }
    item.file ||= item.resolve ? await item.resolve(context) : '';
    if (!item.file) throw fail('media_library_source_format_missing');
    const name = nameOf(item.title, item.file, item.kind === 'image' ? 'jpg' : ['video', 'film'].includes(item.kind) ? 'mp4' : 'mp3');
    return { url: item.file, mime: mimeOf(name), name };
};

// `client`: who asks (`user:<id>` for an account, else its address).
export async function handleWsMediaLibrary(message, client, { fetchResource = fetch, resolve = lookup, now = Date.now } = {}) {
    if (message?.type !== 'media-library-search' && message?.type !== 'media-library-fetch') return null;
    const type = `${message.type}-response`;
    const following = message.type === 'media-library-fetch' && !['thumb', 'waveform', 'stream'].includes(message.variant) && Number(message.offset) > 0;
    if ((following ? rangesLimited : limited)(client, now())) return reply(message, type, { ok: false, error: 'media_library_rate_limited' });
    const context = { fetchResource, resolve, now };
    try {
        if (message.type === 'media-library-search') {
            const kind = String(message.kind || '');
            if (!KINDS.has(kind)) return reply(message, type, { ok: false, error: 'media_library_search_invalid' });
            if (message.discover === true) return reply(message, type, { ok: true, kind, results: await discover(kind, context) });
            const query = String(message.query || '').trim();
            if (!query || query.length > 120) return reply(message, type, { ok: false, error: 'media_library_search_invalid' });
            return reply(message, type, { ok: true, kind, results: await search(kind, query, context) });
        }
        const id = String(message.id || ''), variant = ['thumb', 'waveform', 'stream'].includes(message.variant) ? message.variant : 'file';
        const kept = ID.test(id) ? results.get(id) : null;
        if (!kept) return reply(message, type, { ok: false, error: 'media_library_result_unknown' });
        if (variant === 'waveform') return reply(message, type, { ok: true, points: await waveformOf(kept.item, context) });
        // A film only ever streams: its file is never read here, whole or in ranges.
        if (kept.item.kind === 'film' && variant === 'file') return reply(message, type, { ok: false, error: 'media_library_fetch_range_invalid' });
        const file = await fileOf(kept.item, variant === 'stream' ? 'file' : variant, context);
        if (variant === 'stream') return reply(message, type, { ok: true, name: file.name,
            ...(await (kept.item.kind === 'film' ? filmAccess : access).readableAddress(kept.item.provider, file, context)) });
        return reply(message, type, { ok: true, name: file.name, ...(await access.readChunk(kept.item.provider, file, Number(message.offset), context)) });
    } catch (error) {
        const code = String(error?.code || '');
        return reply(message, type, { ok: false, error: code.startsWith('media_library_') ? code : 'media_library_source_unavailable' });
    }
}
