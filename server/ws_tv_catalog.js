import { logStructured } from './server_logger.js';
import { normalizeTvQuery } from '../atome/src/squirrel/tv/contracts.js';

// Public television catalogue: the union of two open, community-maintained
// lists of free channels, grouped by country.
//   - Free-TV/IPTV (curated free-to-air M3U playlist);
//   - IPTV-org (CC0 JSON API: channels, streams, blocklist, countries, logos).
// Channels on the IPTV-org blocklist (DMCA, NSFW), flagged NSFW or closed are
// dropped, and only streams a browser can open are kept: HLS/MP4 without a
// required user agent or referrer, or a YouTube video id (played by the
// YouTube tool). The catalogue is built on the server, cached and refreshed;
// clients only receive one country (or a few channel ids) at a time.

const IPTV_ORG_API = 'https://iptv-org.github.io/api';
const FREE_TV_PLAYLIST = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';
const REFRESH_MS = 12 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 45_000;
const MAX_CHANNELS = 800;
const MAX_IDS = 200;
const MAX_MATCHES = 25;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const YOUTUBE_WATCH = /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/;
// A channel's "/live" address follows whatever it is streaming now; the
// current video is resolved on demand (`tv-resolve`), never stored.
const YOUTUBE_LIVE = /^https:\/\/(?:www\.)?youtube\.com\/(?:c\/|channel\/|user\/|@)[A-Za-z0-9_.-]+\/live\/?$/;
const MAX_STREAMS = 8;
const LIVE_CACHE_MS = 20 * 60 * 1000;
const LIVE_PAGE_HEADERS = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'accept-language': 'en' };
// Free-TV marks channels with circled letters (Ⓖ geo-blocked, Ⓨ YouTube…).
const MARKERS = /[Ⓐ-ⓩ]/g;
const FRANCE_TV_OWNER = /france t[ée]l[ée]visions?/i;

const reply = (requestId, fields) => ({
  type: 'tv-catalog-response', requestId, request_id: requestId,
  success: fields.ok === true, ...fields
});
const clean = (value) => String(value || '').replace(MARKERS, '').replace(/\s+/g, ' ').trim();

const streamOf = (url, quality = '') => {
  const value = String(url || '').trim();
  const youtube = YOUTUBE_WATCH.exec(value);
  if (youtube) return { url: value, kind: 'youtube', videoId: youtube[1], quality, secure: true };
  if (YOUTUBE_LIVE.test(value)) return { url: value, kind: 'youtube_live', quality, secure: true };
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  const path = parsed.pathname.toLowerCase();
  const kind = path.endsWith('.mp4') ? 'video' : /\.m3u8?$/.test(path) || /m3u8/.test(parsed.search) ? 'hls' : '';
  return kind ? { url: value, kind, quality: String(quality || ''), secure: parsed.protocol === 'https:' } : null;
};

const parseM3u = (text) => {
  const entries = [];
  let pending = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF')) {
      const attrs = Object.fromEntries([...line.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
      pending = { attrs, name: clean(line.slice(line.lastIndexOf(',') + 1)) };
    } else if (line && !line.startsWith('#') && pending) {
      entries.push({ ...pending, url: line });
      pending = null;
    }
  }
  return entries;
};

export const buildTvCatalog = ({ channels = [], streams = [], blocklist = [], countries = [], logos = [], feeds = [], freeTv = '' } = {}) => {
  const blocked = new Set(blocklist.map((entry) => entry.channel));
  const countryNames = new Map(countries.map((entry) => [entry.code, { name: entry.name, flag: entry.flag || '' }]));
  const logoOf = new Map();
  for (const logo of logos) if (!logoOf.has(logo.channel) && logo.url && !logo.feed) logoOf.set(logo.channel, logo.url);
  const known = new Map(channels.map((channel) => [channel.id, channel]));
  const index = new Map();
  const entryFor = (id, seed) => {
    if (!index.has(id)) {
      // Owner tags follow the channel, whichever list supplies its streams.
      const owned = (known.get(id)?.owners || []).some((owner) => FRANCE_TV_OWNER.test(owner));
      index.set(id, { id, name: seed.name, country: seed.country, categories: seed.categories || [],
        logo: seed.logo || '', providers: new Set(owned ? ['francetv'] : []), streams: [], urls: new Set() });
    }
    return index.get(id);
  };
  const allowed = (id) => {
    const channel = known.get(id);
    return !blocked.has(id) && !(channel && (channel.is_nsfw || channel.closed));
  };
  const addStream = (entry, provider, stream) => {
    if (!stream || entry.urls.has(stream.url) || entry.streams.length >= MAX_STREAMS) return;
    entry.urls.add(stream.url);
    entry.providers.add(provider);
    entry.streams.push({ ...stream, provider });
  };
  // Free-TV first: its streams are curated, so they lead each channel.
  for (const item of parseM3u(freeTv)) {
    const group = item.attrs['group-title'] || '';
    if (/^vod\b/i.test(group)) continue;
    const id = item.attrs['tvg-id'] || '';
    const country = String(item.attrs['tvg-country'] || id.split('.').pop() || '').toUpperCase();
    if (!COUNTRY_PATTERN.test(country) || (id && !allowed(id))) continue;
    const key = id || `${clean(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '')}.${country.toLowerCase()}`;
    const channel = known.get(id);
    addStream(entryFor(key, { name: clean(item.attrs['tvg-name']) || item.name, country,
      categories: channel?.categories, logo: item.attrs['tvg-logo'] || logoOf.get(id) }), 'free-tv', streamOf(item.url));
  }
  // A channel's main feed first, then feeds in its country's languages: the
  // stream cap must never be filled with another language's copies.
  const languagesOf = new Map(countries.map((entry) => [entry.code, new Set(entry.languages || [])]));
  const feedRank = new Map(feeds.map((feed) => {
    const local = languagesOf.get(known.get(feed.channel)?.country) || new Set();
    return [`${feed.channel}|${feed.id}`, feed.is_main ? 0 : (feed.languages || []).some((lang) => local.has(lang)) ? 1 : 2];
  }));
  const rankOf = (stream) => (stream.feed ? feedRank.get(`${stream.channel}|${stream.feed}`) ?? 2 : 1);
  const ordered = streams.map((stream, index) => ({ stream, index, rank: rankOf(stream) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(({ stream }) => stream);
  for (const stream of ordered) {
    if (!stream.channel || stream.user_agent || stream.referrer || !allowed(stream.channel)) continue;
    const channel = known.get(stream.channel);
    if (!channel || !COUNTRY_PATTERN.test(channel.country || '')) continue;
    const entry = entryFor(channel.id, { name: channel.name, country: channel.country,
      categories: channel.categories, logo: logoOf.get(channel.id) });
    addStream(entry, 'iptv-org', streamOf(stream.url, stream.quality));
  }
  const byCountry = new Map();
  for (const entry of index.values()) {
    if (!entry.streams.length) continue;
    // https first (plain http cannot play inside an https or iOS page);
    // the sort is stable, so the feed order holds within each.
    entry.streams.sort((a, b) => Number(b.secure) - Number(a.secure));
    const channel = { id: entry.id, name: entry.name, country: entry.country, categories: entry.categories,
      logo: entry.logo, providers: [...entry.providers].sort(), streams: entry.streams };
    if (!byCountry.has(entry.country)) byCountry.set(entry.country, []);
    byCountry.get(entry.country).push(channel);
  }
  for (const list of byCountry.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const countryList = [...byCountry.entries()].map(([code, list]) => ({ code,
    name: countryNames.get(code)?.name || code, flag: countryNames.get(code)?.flag || '', count: list.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map([...byCountry.values()].flat().map((channel) => [channel.id, channel]));
  return { countries: countryList, byCountry, byId, builtAt: Date.now() };
};

const fetchSources = async (fetchResource) => {
  const get = async (url, parse) => {
    const response = await fetchResource(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return parse(response);
  };
  const json = (name) => get(`${IPTV_ORG_API}/${name}.json`, (response) => response.json());
  const [channels, streams, blocklist, countries, logos, feeds, freeTv] = await Promise.all([
    json('channels'), json('streams'), json('blocklist'), json('countries'), json('logos'), json('feeds'),
    get(FREE_TV_PLAYLIST, (response) => response.text())
  ]);
  return { channels, streams, blocklist, countries, logos, feeds, freeTv };
};

export const createTvCatalogStore = ({ fetchResource = fetch, log = logStructured, now = Date.now } = {}) => {
  let catalog = null;
  let building = null;
  let nextAttemptAt = 0;
  const read = async () => {
    const stale = !catalog || now() - catalog.builtAt > REFRESH_MS;
    if (stale && !building && now() >= nextAttemptAt) {
      building = fetchSources(fetchResource).then((sources) => { catalog = buildTvCatalog(sources); return catalog; })
        .catch((error) => {
          nextAttemptAt = now() + RETRY_MS;
          log('warn', { component: 'tv_catalog', message: 'tv_catalog_unavailable',
            data: { cause: String(error?.message || error).slice(0, 300), cached: !!catalog } });
          return catalog;
        })
        .finally(() => { building = null; });
    }
    // A stale catalogue keeps serving while its refresh runs.
    return catalog || (building ? building : null);
  };
  return { read };
};

const store = createTvCatalogStore();

// Name search across every country, for commands such as "put on CNN": an
// exact name (or id) first, then a name starting with the query, then one
// containing it; within a rank the requested country, then the channel with
// the most streams a page can always open (https).
const MATCH_RANK = { exact: 3, prefix: 2, partial: 1 };
export const searchTvCatalog = (catalog, query, preferCountry = '') => {
  const wanted = normalizeTvQuery(query);
  if (!wanted) return [];
  const secure = (channel) => channel.streams.filter((stream) => stream.secure).length;
  const matches = [];
  for (const channel of catalog.byId.values()) {
    const names = [normalizeTvQuery(channel.name), normalizeTvQuery(channel.name.replace(/[^\p{L}\p{N} ]+/gu, ' ')),
      normalizeTvQuery(channel.id.split('.')[0])];
    const match = names.includes(wanted) ? 'exact'
      : names.some((name) => name.startsWith(wanted)) ? 'prefix'
        : names[0].includes(wanted) ? 'partial' : '';
    if (match) matches.push({ ...channel, match });
  }
  return matches.sort((a, b) => MATCH_RANK[b.match] - MATCH_RANK[a.match]
    || Number(b.country === preferCountry) - Number(a.country === preferCountry)
    || secure(b) - secure(a) || a.name.localeCompare(b.name)).slice(0, MAX_MATCHES);
};

export const handleWsTvCatalog = async (message, { readCatalog = store.read } = {}) => {
  if (message?.type !== 'tv-catalog') return null;
  const requestId = message.requestId || message.request_id || null;
  const country = String(message.country || '').toUpperCase();
  const ids = Array.isArray(message.ids) ? message.ids.map(String).slice(0, MAX_IDS) : null;
  if (country && !COUNTRY_PATTERN.test(country)) return reply(requestId, { ok: false, error: 'INVALID_ARGUMENT' });
  const catalog = await readCatalog();
  if (!catalog) return reply(requestId, { ok: false, error: 'PROVIDER_UNAVAILABLE' });
  const query = String(message.query || '').slice(0, 120);
  const prefer = String(message.preferCountry || '').toUpperCase();
  const channels = query ? searchTvCatalog(catalog, query, COUNTRY_PATTERN.test(prefer) ? prefer : '')
    : ids ? ids.map((id) => catalog.byId.get(id)).filter(Boolean)
      : country ? (catalog.byCountry.get(country) || []).slice(0, MAX_CHANNELS) : [];
  return reply(requestId, { ok: true, countries: catalog.countries, channels, builtAt: catalog.builtAt });
};

const liveVideos = new Map();
export const resolveYoutubeLive = async (url, { fetchResource = fetch, now = Date.now, log = logStructured } = {}) => {
  const cached = liveVideos.get(url);
  if (cached && now() - cached.at < LIVE_CACHE_MS) return cached.videoId;
  try {
    const response = await fetchResource(url, { headers: LIVE_PAGE_HEADERS, signal: AbortSignal.timeout(10_000) });
    const page = response.ok ? await response.text() : '';
    const videoId = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/.exec(page)?.[1] || '';
    if (liveVideos.size > 2000) liveVideos.clear();
    liveVideos.set(url, { videoId, at: now() });
    return videoId;
  } catch (error) {
    log('warn', { component: 'tv_catalog', message: 'tv_youtube_live_unresolved',
      data: { url, cause: String(error?.message || error).slice(0, 200) } });
    return '';
  }
};

export const handleWsTvResolve = async (message, { resolve = resolveYoutubeLive } = {}) => {
  if (message?.type !== 'tv-resolve') return null;
  const requestId = message.requestId || message.request_id || null;
  const url = String(message.url || '').trim();
  const fail = (error) => ({ type: 'tv-resolve-response', requestId, request_id: requestId, ok: false, success: false, error });
  if (!YOUTUBE_LIVE.test(url)) return fail('INVALID_ARGUMENT');
  const videoId = await resolve(url);
  return videoId ? { type: 'tv-resolve-response', requestId, request_id: requestId, ok: true, success: true, videoId }
    : fail('CHANNEL_NOT_FOUND');
};
