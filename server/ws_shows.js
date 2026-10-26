import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logStructured } from './server_logger.js';
import { loadLocalShowsConfig, loadLocalTourismConfig } from './auth_secret_config.js';
import { TOURISM_KINDS, readTourism } from './shows_tourism.js';
import { SHOWS_SORTS } from '../atome/src/squirrel/shows/contracts.js';
import { activityAgendaWords } from '../atome/src/shared/activity_categories.js';
import { distanceKm } from '../atome/src/shared/public_event_contract.js';

// Public `shows-nearby` operation of /ws/api: what is on around a position, for the
// Spectacles rubric of the Dashboard (eVe/domains/shows/shows_client.js). Every
// answer is one list of `show` entries, a page at a time (`pageToken`):
//
// - OpenAgenda kinds (`concerts`, `stage`, `expos`, `events`, `family`, `free`,
//   `sport`, `outings`): the public OpenAgenda events dataset (OpenDataSoft, no key), within
//   `radiusKm` of `lat`/`lon`, soonest first.
// - Places (`cinemas`, `heritage`, `restaurants`, `bars`): the places of France from
//   OpenStreetMap (OpenDataSoft, no key, ODbL), nearest first, with their own website
//   (sessions are never invented here).
// - `films`: the films showing in `region` (TMDB `now_playing`, `TMDB_API_KEY`: the
//   server's environment, in development also `Private/tmdb.env`), read once for
//   every user and kept FILM_TTL_MS (TMDB asks for few calls).
// - `matches`: the next match of each French professional league (TheSportsDB free
//   key), kept MATCH_TTL_MS (the free key allows 30 calls a minute).
// - Tourism kinds (`museums`, `nature`, `hiking`, `experiences`, `wellbeing`): the
//   DATAtourisme places around (server/shows_tourism.js, `DATATOURISME_API_KEY`).
// - `declared`: the events users declared around, of the activity `categories` asked
//   (server/public_events.js), soonest first.
// - `sources`: which keyed sources this server holds (`{ tourism }`), so the rubric lays
//   only the plates it can fill.
// `sort` (SHOWS_SORTS, the shared contract): the order a kind can be read in, its first by default: an outing by
// `date` (soonest), `distance` (nearest) or `name` (its place's name), a place by
// `distance` or `name`; the other kinds keep their one order.

const ODS = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets';
const TMDB = 'https://api.themoviedb.org/3';
const TMDB_IMAGES = 'https://image.tmdb.org/t/p/w342';
const SPORTS = 'https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php';
// Ligue 1, Ligue 2, Coupe de France, Top 14, Pro D2, LNB (basketball), LNH (handball), Ligue Magnus.
const FRENCH_LEAGUES = Object.freeze(['4334', '4401', '4484', '4430', '5172', '4423', '4536', '4927']);
const PAGE_SIZE = 25;
const MAX_OFFSET = 9900;
const MAX_FILM_PAGES = 5;
const FILM_TTL_MS = 12 * 60 * 60 * 1000;
const MATCH_TTL_MS = 60 * 60 * 1000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestsByAddress = new Map();
const localConfigRead = new WeakSet();
const films = new Map();
let matches = { entries: null, at: 0 };

// What each OpenAgenda kind looks for, in an event's title or keywords: the words of the activity
// categories feeding it (atome/src/shared/activity_categories.js); `free` reads the conditions.
// Job-centre workshops (France Travail) name every trade and are never a show.
const AGENDA_WORDS = Object.freeze({ ...activityAgendaWords(), free: [] });
// What each place kind reads: its OpenStreetMap dataset, the `type` values it keeps (a heritage
// place worth a visit, not a plaque, a tomb or a wayside cross) and the fields that dataset has.
const PLACES = Object.freeze({
    cinemas: { dataset: 'osm-france-cinema', types: [], fields: 'website,phone' },
    heritage: { dataset: 'osm-france-historic', fields: 'website,wikipedia', types: ['castle', 'manor', 'fort', 'city_gate', 'citywalls', 'tower',
        'ruins', 'archaeological_site', 'monument', 'church', 'chapel', 'monastery', 'place_of_worship'] },
    restaurants: { dataset: 'osm-france-food-service', types: ['restaurant', 'cafe'], fields: 'website,phone' },
    bars: { dataset: 'osm-france-food-service', types: ['bar', 'pub', 'biergarten'], fields: 'website,phone' }
});
const KINDS = new Set([...Object.keys(AGENDA_WORDS), ...Object.keys(PLACES), ...Object.keys(TOURISM_KINDS), 'films', 'matches', 'sources', 'declared']);
const UNPOSITIONED = new Set(['films', 'matches', 'sources']);

const text = value => String(value == null ? '' : value).trim();
// A word typed in the bottom field, safe inside an ODSQL string.
const literal = value => text(value).replace(/["\\]/g, ' ').slice(0, 80);
const httpsUrl = (value) => {
    try { const url = new URL(text(value)); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
};
const reply = (requestId, fields) => ({ type: 'shows-nearby-response', requestId, request_id: requestId, success: fields.ok === true, ...fields });

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

const readJson = async (fetchResource, url) => {
    const response = await fetchResource(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) throw Object.assign(new Error(`status_${response.status}`), { status: response.status });
    return response.json();
};

const point = ({ lat, lon }) => `geom'POINT(${lon} ${lat})'`;
const geo = value => (value && typeof value === 'object' ? { lat: Number(value.lat), lon: Number(value.lon) } : { lat: NaN, lon: NaN });

// The next session of an event still to come (its `timings`), else its first.
const nextTiming = (record, now) => {
    let timings = [];
    try { timings = JSON.parse(record.timings || '[]'); } catch { timings = []; }
    const next = timings.map(timing => ({ begin: Date.parse(timing.begin), end: Date.parse(timing.end) }))
        .filter(timing => Number.isFinite(timing.begin) && timing.end >= now).sort((a, b) => a.begin - b.begin)[0];
    return next ? { start: new Date(next.begin).toISOString(), end: new Date(next.end).toISOString() }
        : { start: text(record.firstdate_begin), end: text(record.firstdate_end) };
};

const agendaWhere = (kind, { lat, lon, radiusKm, query }) => {
    const words = list => `(${list.map(word => `title_fr like "${word}" or keywords_fr like "${word}"`).join(' or ')})`;
    return [`within_distance(location_coordinates, ${point({ lat, lon })}, ${radiusKm}km)`,
        // An exhibition is shown while it lasts; anything else from its first session on.
        kind === 'expos' ? 'lastdate_end >= now()' : 'firstdate_begin >= now(hours=-3)',
        'onlineaccesslink is null', 'not originagenda_title like "France Travail"',
        ...(kind === 'free' ? ['(conditions_fr like "gratuit" or conditions_fr like "entrée libre")'] : []),
        ...(kind === 'family' ? [`(age_max <= 12 or ${words(AGENDA_WORDS.family)})`] : AGENDA_WORDS[kind].length ? [words(AGENDA_WORDS[kind])] : []),
        ...(query ? [`(title_fr like "${query}" or keywords_fr like "${query}" or location_name like "${query}" or location_city like "${query}")`] : [])
    ].join(' and ');
};
// The organiser's booking (OpenAgenda `registration`: links, e-mails, phones): its first https link,
// the ticketing or booking page the « Billets » tool opens; none when the organiser gave none.
const ticketUrl = (value) => {
    let entries = value;
    try { entries = typeof value === 'string' ? JSON.parse(value) : value; } catch { return ''; }
    return (Array.isArray(entries) ? entries : []).filter(entry => entry?.type === 'link').map(entry => httpsUrl(entry.value)).find(Boolean) || '';
};
const AGENDA_ORDER = Object.freeze({ date: () => 'firstdate_begin', distance: spec => `distance(location_coordinates, ${point(spec)}), firstdate_begin`,
    name: () => 'location_name, firstdate_begin' });
const readAgenda = async (kind, spec, { fetchResource, now }) => {
    const params = new URLSearchParams({ where: agendaWhere(kind, spec), order_by: AGENDA_ORDER[spec.sort](spec), limit: String(PAGE_SIZE), offset: String(spec.offset),
        select: 'uid,title_fr,description_fr,daterange_fr,firstdate_begin,firstdate_end,timings,conditions_fr,registration,thumbnail,image,canonicalurl,location_name,location_address,location_city,location_coordinates' });
    const payload = await readJson(fetchResource, `${ODS}/evenements-publics-openagenda/records?${params}`);
    const records = Array.isArray(payload?.results) ? payload.results : [];
    return { total: Number(payload?.total_count) || 0, entries: records.map((record) => {
        const at = geo(record.location_coordinates), when = nextTiming(record, now);
        return { id: `agenda_${text(record.uid)}`, kind: 'event', title: text(record.title_fr), summary: text(record.description_fr), dateLabel: text(record.daterange_fr),
            start: when.start, end: when.end, place: text(record.location_name), address: text(record.location_address), city: text(record.location_city),
            lat: at.lat, lon: at.lon, distanceKm: distanceKm(spec, at.lat, at.lon), price: text(record.conditions_fr),
            image: httpsUrl(record.thumbnail || record.image), url: httpsUrl(record.canonicalurl), ticketUrl: ticketUrl(record.registration) };
    }) };
};

// A Wikipedia reference of OpenStreetMap (`fr:Château de Versailles`) → its page.
const wikipediaUrl = (value) => {
    const [, language, title] = /^([a-z]{2,3}):(.+)$/.exec(text(value)) || [];
    return language ? httpsUrl(`https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`) : '';
};
const readPlaces = async (kind, spec, { fetchResource }) => {
    const { dataset, types, fields } = PLACES[kind];
    const where = [`within_distance(meta_geo_point, ${point(spec)}, ${spec.radiusKm}km)`, 'name is not null',
        ...(types.length ? [`(${types.map(type => `type = "${type}"`).join(' or ')})`] : []),
        ...(spec.query ? [`(name like "${spec.query}" or meta_name_com like "${spec.query}")`] : [])].join(' and ');
    const params = new URLSearchParams({ where, order_by: spec.sort === 'name' ? 'name' : `distance(meta_geo_point, ${point(spec)})`, limit: String(PAGE_SIZE), offset: String(spec.offset),
        select: `meta_osm_id,name,meta_name_com,meta_geo_point,${fields}` });
    const payload = await readJson(fetchResource, `${ODS}/${dataset}/records?${params}`);
    const records = (Array.isArray(payload?.results) ? payload.results : []).filter(record => text(record.name));
    return { total: Number(payload?.total_count) || 0, entries: records.map((record) => {
        const at = geo(record.meta_geo_point);
        return { id: `${kind}_${text(record.meta_osm_id)}`, kind: kind === 'cinemas' ? 'cinema' : 'place', title: text(record.name), place: text(record.name),
            city: text(record.meta_name_com), lat: at.lat, lon: at.lon, distanceKm: distanceKm(spec, at.lat, at.lon), phone: text(record.phone),
            url: httpsUrl(record.website) || wikipediaUrl(record.wikipedia), image: '' };
    }) };
};

const readFilms = async ({ region, language }, { fetchResource, now, key }) => {
    const cacheKey = `${region}:${language}`, hit = films.get(cacheKey);
    if (hit && now - hit.at < FILM_TTL_MS) return hit.entries;
    const page = number => readJson(fetchResource, `${TMDB}/movie/now_playing?${new URLSearchParams({ api_key: key, region, language: `${language}-${region}`, page: String(number) })}`);
    const first = await page(1);
    const rest = await Promise.all(Array.from({ length: Math.min(MAX_FILM_PAGES, Number(first?.total_pages) || 1) - 1 }, (_unused, index) => page(index + 2)));
    const seen = new Set();
    const entries = [first, ...rest].flatMap(payload => (Array.isArray(payload?.results) ? payload.results : []))
        .filter(film => film?.id && !seen.has(film.id) && seen.add(film.id))
        .sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0))
        .map(film => ({ id: `film_${film.id}`, kind: 'film', title: text(film.title), summary: text(film.overview), start: text(film.release_date),
            image: film.poster_path ? `${TMDB_IMAGES}${film.poster_path}` : '', url: `https://www.themoviedb.org/movie/${film.id}` }));
    films.set(cacheKey, { entries, at: now });
    return entries;
};

const readMatches = async ({ fetchResource, now }) => {
    if (matches.entries && now - matches.at < MATCH_TTL_MS) return matches.entries;
    const leagues = await Promise.all(FRENCH_LEAGUES.map(id => readJson(fetchResource, `${SPORTS}?id=${id}`).then(payload => payload?.events || [])));
    const entries = leagues.flat().filter(event => event?.idEvent && Date.parse(`${event.strTimestamp}Z`) >= now - 3 * 3600_000)
        .map(event => ({ id: `match_${event.idEvent}`, kind: 'match', title: text(event.strEvent).replace(/ vs /, ' – '), league: text(event.strLeague),
            sport: text(event.strSport), start: new Date(Date.parse(`${event.strTimestamp}Z`)).toISOString(), place: text(event.strVenue),
            // TheSportsDB's pictures carry no CORS header: a page cannot draw them, the row keeps its glyph.
            city: text(event.strCity), image: '' }))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    matches = { entries, at: now };
    return entries;
};

// A whole list read once (films, matches), filtered by the field and cut in pages.
const pageOf = (entries, { query, offset }) => {
    const needle = query.toLowerCase();
    const found = needle ? entries.filter(entry => `${entry.title} ${entry.league || ''} ${entry.sport || ''}`.toLowerCase().includes(needle)) : entries;
    return { total: found.length, entries: found.slice(offset, offset + PAGE_SIZE) };
};

const readSpec = (message) => {
    const kind = text(message.kind), lat = Number(message.lat), lon = Number(message.lon);
    const radiusKm = Math.round(Number(message.radiusKm)), offset = message.pageToken ? Number(message.pageToken) : 0;
    const region = text(message.region).toUpperCase(), language = text(message.language).toLowerCase();
    if (!KINDS.has(kind) || !Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) return null;
    if (!UNPOSITIONED.has(kind) && (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180) || !(radiusKm >= 1 && radiusKm <= 100))) return null;
    if (kind === 'films' && (!/^[A-Z]{2}$/.test(region) || !/^[a-z]{2}$/.test(language))) return null;
    const sorts = SHOWS_SORTS[kind] || [], sort = text(message.sort) || sorts[0] || '';
    if (sort && !sorts.includes(sort)) return null;
    const categories = (Array.isArray(message.categories) ? message.categories : []).map(text).filter(Boolean).slice(0, 13);
    if (kind === 'declared' && !categories.length) return null;
    return { kind, lat, lon, radiusKm, offset, region, language, sort, categories, query: literal(message.query) };
};

// `publicEvents` (server/public_events.js) answers the `declared` kind: the events users declared
// around, for `viewerId` when the connection has an account (the people they blocked left out).
export const handleWsShows = async (message, address, { fetchResource = fetch, now = Date.now(), log = logStructured, env = process.env,
    publicEvents = null, viewerId = null } = {}) => {
    if (message?.type !== 'shows-nearby') return null;
    const requestId = message.requestId || message.request_id || null;
    const spec = readSpec(message);
    if (!spec) return reply(requestId, { ok: false, error: 'shows_request_invalid' });
    if (rateLimited(address, now)) return reply(requestId, { ok: false, error: 'shows_rate_limited' });
    if (!localConfigRead.has(env)) { loadLocalShowsConfig(PROJECT_ROOT, env); loadLocalTourismConfig(PROJECT_ROOT, env); localConfigRead.add(env); }
    const key = text(env.TMDB_API_KEY), tourismKey = text(env.DATATOURISME_API_KEY);
    if (spec.kind === 'sources') return reply(requestId, { ok: true, entries: [], nextPageToken: '', sources: { tourism: !!tourismKey } });
    if (spec.kind === 'films' && !key) return reply(requestId, { ok: false, error: 'shows_films_not_configured' });
    const tourism = Object.hasOwn(TOURISM_KINDS, spec.kind);
    if (tourism && !tourismKey) return reply(requestId, { ok: false, error: 'shows_tourism_not_configured' });
    try {
        if (spec.kind === 'declared') {
            if (!publicEvents) return reply(requestId, { ok: false, error: 'shows_unavailable' });
            const found = await publicEvents.nearby({ ...spec, viewerId, now });
            return reply(requestId, { ok: true, entries: found.entries, nextPageToken: found.next });
        }
        const deps = { fetchResource, now, key, distanceKm };
        const { total, entries } = tourism ? await readTourism(spec.kind, spec, { ...deps, key: tourismKey })
            : Object.hasOwn(PLACES, spec.kind) ? await readPlaces(spec.kind, spec, deps)
            : spec.kind === 'films' ? pageOf(await readFilms(spec, deps), spec)
                : spec.kind === 'matches' ? pageOf(await readMatches(deps), spec) : await readAgenda(spec.kind, spec, deps);
        const next = spec.offset + PAGE_SIZE;
        return reply(requestId, { ok: true, entries, nextPageToken: next < Math.min(total, MAX_OFFSET) ? String(next) : '' });
    } catch (error) {
        if (error?.message === 'shows_tourism_busy') return reply(requestId, { ok: false, error: 'shows_tourism_busy' });
        log('warn', { component: 'shows', request_id: requestId, message: 'shows_unavailable',
            data: { kind: spec.kind, status: error?.status || 0, cause: String(error?.message || error).slice(0, 300) } });
        return reply(requestId, { ok: false, error: 'shows_unavailable' });
    }
};
