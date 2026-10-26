import { logStructured } from './server_logger.js';
import { readTmdb, tmdbImage, tmdbKey } from './tmdb_client.js';
import { STREAMING_SERVICES, streamingService, streamingServiceOfProvider } from '../atome/src/squirrel/shared/streaming_services.js';

// Public `video-catalog` operation of /ws/api: the films and series of Divertissement ›
// Vidéo › Films & séries (eVe/domains/media/video_catalog_client.js), read from TMDB
// (tmdb_client.js). A title is kept only when it can be watched without buying nor
// renting it (user, 26 Oct. 2026): included in a service the user declared (`services`,
// STREAMING_SERVICES keys) or free, with or without ads, on any channel. Each title
// carries those offers (its row names them at its top) and its trailer (a YouTube
// video, played in place).
//
// - `discover`: the newest such titles, films and series together, newest first;
// - `search`: the titles matching `query`;
// - `similar`: what TMDB recommends after `ref` (`movie:<id>`, `tv:<id>`).
// `free: false` (one service looked at alone, the Plateformes tile) leaves the free channels out.
// A page at a time (`pageToken`: TMDB's own page). TMDB's availability comes from JustWatch.

const PAGE_LIMIT = 500;
const SEARCH_PAGES = 3;
const FREE_YEARS = 2;
const DETAILS_IN_FLIGHT = 20;
const DETAIL_TTL_MS = 12 * 60 * 60 * 1000;
const LIST_TTL_MS = 60 * 60 * 1000;
const MAX_KEPT = 5000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const OPS = new Set(['discover', 'search', 'similar']);
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{11}$/;
const requestsByAddress = new Map();
const details = new Map();
const lists = new Map();

const text = value => String(value == null ? '' : value).trim();
const reply = (requestId, fields) => ({ type: 'video-catalog-response', requestId, request_id: requestId, success: fields.ok === true, ...fields });

const rateLimited = (address, now) => {
    const key = String(address || 'unknown');
    const recent = (requestsByAddress.get(key) || []).filter(at => now - at < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) return true;
    recent.push(now);
    requestsByAddress.set(key, recent);
    if (requestsByAddress.size > 10000) {
        for (const [entry, times] of requestsByAddress) if (times.every(at => now - at >= WINDOW_MS)) requestsByAddress.delete(entry);
    }
    return false;
};

// A TMDB answer kept `ttl` (the oldest leave first once MAX_KEPT are kept).
const kept = async (cache, key, ttl, now, read) => {
    const hit = cache.get(key);
    if (hit && now - hit.at < ttl) return hit.value;
    const value = await read();
    cache.delete(key);
    cache.set(key, { value, at: now });
    for (const entry of cache.keys()) { if (cache.size <= MAX_KEPT) break; cache.delete(entry); }
    return value;
};

// A title's whole record: its providers in every country and its videos.
const readDetail = (media, id, spec, deps) => kept(details, `${media}:${id}:${spec.language}`, DETAIL_TTL_MS, deps.now,
    () => readTmdb(deps, `${media}/${id}`, { language: `${spec.language}-${spec.region}`, append_to_response: 'watch/providers,videos',
        include_video_language: `${spec.language},en` }));

// What can be watched in `region` without buying: the declared services' offers, then the free ones.
const offersOf = (detail, { region, providerIds, free }) => {
    const local = detail?.['watch/providers']?.results?.[region] || {}, offers = [];
    for (const monetization of free ? ['flatrate', 'free', 'ads'] : ['flatrate']) {
        for (const provider of Array.isArray(local[monetization]) ? local[monetization] : []) {
            if (monetization === 'flatrate' && !providerIds.has(provider.provider_id)) continue;
            const service = streamingServiceOfProvider(provider.provider_id), key = service?.key || `tmdb_${provider.provider_id}`;
            const name = service?.label || text(provider.provider_name);
            // A channel of a provider already named (« Plex Channel » after « Plex ») is that provider again.
            if (offers.some(offer => offer.key === key || name.startsWith(`${offer.name} `))) continue;
            offers.push({ key, service: service?.key || '', name,
                logo: tmdbImage('w92', service?.logo || provider.logo_path), monetization });
        }
    }
    return offers;
};
// Its trailer: an official YouTube trailer in the user's language first, then in English, then a teaser.
const trailerOf = (detail, language) => {
    const videos = (Array.isArray(detail?.videos?.results) ? detail.videos.results : [])
        .filter(video => video.site === 'YouTube' && YOUTUBE_KEY.test(text(video.key)) && ['Trailer', 'Teaser'].includes(video.type));
    const rank = video => (video.type === 'Trailer' ? 0 : 2) + (video.iso_639_1 === language ? 0 : 1) + (video.official ? 0 : 4);
    return videos.sort((a, b) => rank(a) - rank(b))[0]?.key || '';
};
const entryOf = (media, detail, spec) => {
    const offers = offersOf(detail, spec);
    if (!offers.length) return null;
    const date = text(detail.release_date || detail.first_air_date);
    return { id: `${media}:${detail.id}`, media, title: text(detail.title || detail.name), year: date.slice(0, 4), date,
        image: tmdbImage('w342', detail.poster_path), overview: text(detail.overview).slice(0, 400), offers, trailer: trailerOf(detail, spec.language) };
};
// The kept entries of `found` (`{ media, id }`), in their order, DETAILS_IN_FLIGHT read at once.
const entriesOf = async (found, spec, deps) => {
    const entries = new Array(found.length).fill(null), queue = found.map((item, index) => ({ ...item, index }));
    const next = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
            try { entries[item.index] = entryOf(item.media, await readDetail(item.media, item.id, spec, deps), spec); }
            catch (error) { if (error?.status !== 404) throw error; }
        }
    };
    await Promise.all(Array.from({ length: DETAILS_IN_FLIGHT }, next));
    return entries.filter(Boolean);
};

const today = now => new Date(now).toISOString().slice(0, 10);
// The newest titles of `media` on the declared services; `free`: the most watched of the last
// FREE_YEARS on free channels, any of them (their newest are mostly little-known imports).
const discoverPage = (media, free, spec, deps) => {
    const ids = [...spec.providerIds];
    if ((!free && !ids.length) || (free && !spec.free)) return Promise.resolve({ results: [], total_pages: 0 });
    const date = media === 'movie' ? 'primary_release_date' : 'first_air_date', since = new Date(deps.now);
    since.setFullYear(since.getFullYear() - FREE_YEARS);
    const params = { watch_region: spec.region, language: `${spec.language}-${spec.region}`, page: String(spec.page),
        with_watch_monetization_types: free ? 'free|ads' : 'flatrate', ...(free ? { [`${date}.gte`]: today(since) } : { with_watch_providers: ids.join('|') }),
        sort_by: free ? 'popularity.desc' : `${date}.desc`, [`${date}.lte`]: today(deps.now), 'vote_count.gte': media === 'movie' ? '20' : '10' };
    return kept(lists, `discover:${media}:${free}:${ids.join(',')}:${JSON.stringify(params)}`, LIST_TTL_MS, deps.now, () => readTmdb(deps, `discover/${media}`, params));
};
const discover = async (spec, deps) => {
    const pages = await Promise.all(['movie', 'tv'].flatMap(media => [false, true].map(async free => ({ media, free, payload: await discoverPage(media, free, spec, deps) }))));
    const seen = new Set();
    const titles = free => pages.filter(page => page.free === free).flatMap(({ media, payload }) => (Array.isArray(payload?.results) ? payload.results : [])
        .map(item => ({ media, id: item.id, date: text(item.release_date || item.first_air_date), popularity: Number(item.popularity) || 0 })));
    // The declared services' newest first, then the free ones, the most watched first.
    const found = [...titles(false).sort((a, b) => b.date.localeCompare(a.date)), ...titles(true).sort((a, b) => b.popularity - a.popularity)]
        .filter(item => item.id && !seen.has(`${item.media}:${item.id}`) && seen.add(`${item.media}:${item.id}`));
    const more = pages.some(({ payload }) => spec.page < Math.min(PAGE_LIMIT, Number(payload?.total_pages) || 0));
    return { entries: await entriesOf(found, spec, deps), next: more ? String(spec.page + 1) : '' };
};
// SEARCH_PAGES TMDB pages read at once (most matches are to buy or nowhere: one page keeps few).
const searchPage = (spec, page, deps) => kept(lists, `search:${spec.language}:${spec.query}:${page}`, LIST_TTL_MS, deps.now,
    () => readTmdb(deps, 'search/multi', { query: spec.query, language: `${spec.language}-${spec.region}`, page: String(page), include_adult: 'false' }));
const search = async (spec, deps) => {
    const first = await searchPage(spec, spec.page, deps), total = Math.min(PAGE_LIMIT, Number(first?.total_pages) || 0);
    const last = Math.min(total, spec.page + SEARCH_PAGES - 1);
    const pages = [first, ...await Promise.all(Array.from({ length: Math.max(0, last - spec.page) }, (_unused, index) => searchPage(spec, spec.page + index + 1, deps)))];
    // TMDB's pages overlap: a title met on a previous page is not listed twice.
    const seen = new Set();
    const found = pages.flatMap(payload => (Array.isArray(payload?.results) ? payload.results : []))
        .filter(item => ['movie', 'tv'].includes(item.media_type) && item.id && !seen.has(`${item.media_type}:${item.id}`) && seen.add(`${item.media_type}:${item.id}`))
        .map(item => ({ media: item.media_type, id: item.id }));
    return { entries: await entriesOf(found, spec, deps), next: last < total ? String(last + 1) : '' };
};
const similar = async (spec, deps) => {
    const [media, id] = spec.ref.split(':');
    const payload = await readTmdb(deps, `${media}/${id}/recommendations`, { language: `${spec.language}-${spec.region}`, page: '1' });
    const found = (Array.isArray(payload?.results) ? payload.results : []).filter(item => item.id).map(item => ({ media, id: item.id }));
    return { entries: await entriesOf(found, spec, deps), next: '' };
};

const readSpec = (message) => {
    const op = text(message.op), region = text(message.region).toUpperCase(), language = text(message.language).toLowerCase();
    const page = message.pageToken ? Number(message.pageToken) : 1, query = text(message.query).slice(0, 120), ref = text(message.ref);
    const services = Array.isArray(message.services) ? message.services.map(text) : [];
    if (!OPS.has(op) || !/^[A-Z]{2}$/.test(region) || !/^[a-z]{2}$/.test(language) || !Number.isInteger(page) || page < 1 || page > PAGE_LIMIT) return null;
    if (services.length > STREAMING_SERVICES.length || services.some(key => !streamingService(key))) return null;
    if ((op === 'search' && !query) || (op === 'similar' && !/^(movie|tv):\d{1,9}$/.test(ref))) return null;
    return { op, region, language, page, query, ref, free: message.free !== false, providerIds: new Set(services.flatMap(key => streamingService(key).tmdb)) };
};

export const handleWsVideoCatalog = async (message, address, { fetchResource = fetch, now = Date.now(), log = logStructured, env = process.env } = {}) => {
    if (message?.type !== 'video-catalog') return null;
    const requestId = message.requestId || message.request_id || null;
    const spec = readSpec(message);
    if (!spec) return reply(requestId, { ok: false, error: 'video_catalog_request_invalid' });
    if (rateLimited(address, now)) return reply(requestId, { ok: false, error: 'video_catalog_rate_limited' });
    const key = tmdbKey(env);
    if (!key) return reply(requestId, { ok: false, error: 'video_catalog_not_configured' });
    try {
        const deps = { fetchResource, now, key };
        const { entries, next } = await (spec.op === 'discover' ? discover : spec.op === 'search' ? search : similar)(spec, deps);
        return reply(requestId, { ok: true, entries, nextPageToken: next });
    } catch (error) {
        log('warn', { component: 'video_catalog', request_id: requestId, message: 'video_catalog_unavailable',
            data: { op: spec.op, status: error?.status || 0, cause: String(error?.message || error).slice(0, 300) } });
        return reply(requestId, { ok: false, error: 'video_catalog_unavailable' });
    }
};
