// The Médiathèque's online sources: free images, videos and sounds, public domain
// or CC0 only (no attribution owed, so the results show alone). `media-library-search`
// answers the results of every source of a kind at once (the sources are never named
// to the user); `media-library-fetch` reads one byte range of a result's picture
// (`thumb`) or of its file. The client names a result id, never a URL: each address
// comes from the provider's own record and goes through the checked public source
// access (public_source_fetch.js), so this is not an open proxy.
//   - Openverse (WordPress): images and sounds, `license=cc0,pdm`, from the hosts below;
//   - NASA Image and Video Library: images, videos and sounds (public domain media);
//   - Internet Archive: videos marked public domain or CC0.
import { lookup } from 'node:dns/promises';
import { createAddressRateLimit, createPublicSourceAccess } from './public_source_fetch.js';

// Freesound's CDN serves about 75 KB/s: a range must arrive within the 20 s of one request.
const CHUNK_BYTES = 512 * 1024;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_RECORD_BYTES = 4 * 1024 * 1024;
const PER_SOURCE = 12;
const RESULT_TTL_MS = 60 * 60_000;
const MAX_RESULTS_KEPT = 5000;
const HOSTS = Object.freeze({
    openverse: { hosts: ['api.openverse.org', 'upload.wikimedia.org', 'cdn.freesound.org'], suffixes: ['.staticflickr.com'] },
    nasa: { hosts: ['images-api.nasa.gov', 'images-assets.nasa.gov'], suffixes: [] },
    archive: { hosts: ['archive.org'], suffixes: ['.archive.org'] }
});
const ID = /^(openverse_image|openverse_audio|nasa|archive):[A-Za-z0-9 ._\-()',]{1,160}$/;
const KINDS = new Set(['image', 'video', 'audio']);

const allowedHost = (provider, host) => HOSTS[provider].hosts.includes(host) || HOSTS[provider].suffixes.some(suffix => host.endsWith(suffix));
const access = createPublicSourceAccess({ allowedHost, sourceCode: 'media_library_source', fetchCode: 'media_library_fetch',
    chunkBytes: CHUNK_BYTES, maxFileBytes: MAX_FILE_BYTES });
const { fail } = access;
const limited = createAddressRateLimit({ windowMs: 60_000, max: 240 });
// A result found is kept for a while: its picture and file are read without asking the provider again.
const results = new Map();
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
            duration: item.duration ? item.duration / 1000 : null }));
};
// NASA lists an item's renditions in its collection: the first present of these, in order.
const NASA_RENDITIONS = { image: [/~large\.jpg$/i, /~medium\.jpg$/i, /~orig\.(jpe?g|png)$/i], video: [/~medium\.mp4$/i, /~mobile\.mp4$/i, /~orig\.mp4$/i],
    audio: [/~128k\.mp3$/i, /~orig\.(mp3|m4a|wav)$/i] };
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
// The Internet Archive: its smallest MP4 rendition of the item.
const archiveVideos = async (query, context) => {
    const search = `(${query}) AND mediatype:(movies) AND licenseurl:(*publicdomain* OR *zero*)`;
    const page = await readJson('archive', `https://archive.org/advancedsearch.php?q=${encodeURIComponent(search)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=${PER_SOURCE}&output=json`, context);
    return (page?.response?.docs || []).map(doc => ({ id: `archive:${doc.identifier}`, provider: 'archive', kind: 'video', title: String(doc.title || '').trim(),
        thumb: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`, license: /zero/.test(doc.licenseurl) ? 'cc0' : 'pdm',
        author: [doc.creator].flat().filter(Boolean).join(', '), source_url: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
        resolve: async (ctx) => {
            const meta = await readJson('archive', `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, ctx);
            const mp4 = (meta?.files || []).filter(file => /\.mp4$/i.test(file.name) && Number(file.size) > 0).sort((a, b) => Number(a.size) - Number(b.size))[0];
            return mp4 ? `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${mp4.name.split('/').map(encodeURIComponent).join('/')}` : '';
        } })).filter(item => ID.test(item.id));
};
const SOURCES = Object.freeze({ image: [openverse('image'), nasa('image')], video: [nasa('video'), archiveVideos], audio: [openverse('audio'), nasa('audio')] });

// The sources' answers interleaved (one of each in turn), what one source cannot give left out.
const search = async (kind, query, context) => {
    const answers = await Promise.allSettled(SOURCES[kind].map(source => source(query, context)));
    const lists = answers.filter(answer => answer.status === 'fulfilled').map(answer => answer.value);
    if (!lists.length) throw fail('media_library_source_unavailable');
    const found = [];
    for (let index = 0; lists.some(list => index < list.length); index += 1) for (const list of lists) if (list[index]) found.push(list[index]);
    const now = context.now();
    // Kept in arrival order: the oldest go first, until the rest is fresh and few enough.
    for (const [id, entry] of results) { if (now - entry.at < RESULT_TTL_MS && results.size <= MAX_RESULTS_KEPT) break; results.delete(id); }
    found.forEach(item => results.set(item.id, { at: now, item }));
    return found.map(({ resolve: _resolve, file: _file, thumb, ...item }) => ({ ...item, has_thumb: !!thumb }));
};

const fileOf = async (item, variant, context) => {
    if (variant === 'thumb') {
        if (!item.thumb) throw fail('media_library_fetch_range_invalid');
        return { url: item.thumb, mime: 'image/jpeg', name: nameOf(item.title, item.thumb, 'jpg') };
    }
    item.file ||= item.resolve ? await item.resolve(context) : '';
    if (!item.file) throw fail('media_library_source_format_missing');
    const name = nameOf(item.title, item.file, item.kind === 'image' ? 'jpg' : item.kind === 'video' ? 'mp4' : 'mp3');
    return { url: item.file, mime: mimeOf(name), name };
};

export async function handleWsMediaLibrary(message, address, { fetchResource = fetch, resolve = lookup, now = Date.now } = {}) {
    if (message?.type !== 'media-library-search' && message?.type !== 'media-library-fetch') return null;
    const type = `${message.type}-response`;
    if (limited(address, now())) return reply(message, type, { ok: false, error: 'media_library_rate_limited' });
    const context = { fetchResource, resolve, now };
    try {
        if (message.type === 'media-library-search') {
            const kind = String(message.kind || ''), query = String(message.query || '').trim();
            if (!KINDS.has(kind) || !query || query.length > 120) return reply(message, type, { ok: false, error: 'media_library_search_invalid' });
            return reply(message, type, { ok: true, kind, results: await search(kind, query, context) });
        }
        const id = String(message.id || ''), variant = message.variant === 'thumb' ? 'thumb' : 'file';
        const kept = ID.test(id) ? results.get(id) : null;
        if (!kept) return reply(message, type, { ok: false, error: 'media_library_result_unknown' });
        const file = await fileOf(kept.item, variant, context);
        return reply(message, type, { ok: true, name: file.name, ...(await access.readChunk(kept.item.provider, file, Number(message.offset), context)) });
    } catch (error) {
        const code = String(error?.code || '');
        return reply(message, type, { ok: false, error: code.startsWith('media_library_') ? code : 'media_library_source_unavailable' });
    }
}
