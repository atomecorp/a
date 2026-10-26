// The DATAtourisme places of the Temps libre rubric (server/ws_shows.js): museums,
// nature, hikes, experiences and well-being around a position, from the official
// tourism base of France (api.datatourisme.fr/v1, Licence Ouverte Etalab). ONE Atome
// key for every user (`DATATOURISME_API_KEY`: the server's environment, in development
// also `Private/datatourisme.env`), never on a device.
//
// The key's quota (1,000 requests an hour, ~10 a second) is shared by every user: a page
// read is kept PAGE_TTL_MS for the same place (a ~1 km cell), and past HOURLY_BUDGET calls
// in the hour the kinds answer `shows_tourism_busy` until the hour turns.
//
// Each kind reads the DATAtourisme classes (`type`, PointOfInterestClass of /v1/openapi.yml)
// that make it; a photo is shown only with its credits, which go with it.

const API = 'https://api.datatourisme.fr/v1/catalog';
const PAGE_SIZE = 25;
const PAGE_TTL_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HOURLY_BUDGET = 900;
const MAX_PAGES_KEPT = 5000;
const FIELDS = ['uuid', 'label', 'isLocatedAt.geo', 'isLocatedAt.address', 'hasContact.homepage', 'hasDescription.shortDescription',
    'hasMainRepresentation', 'hasBeenCreatedBy.legalName', 'lastUpdateDatatourisme'].join(',');

export const TOURISM_KINDS = Object.freeze({
    museums: ['Museum', 'ArtGalleryOrExhibitionGallery', 'InterpretationCentre'],
    nature: ['NaturalHeritage', 'ParkAndGarden', 'NaturalPark', 'NaturalCuriosity', 'Lake', 'Waterfall', 'CaveSinkholeOrAven', 'Gorge',
        'Canyon', 'PointOfView', 'OutstandingTree', 'Forest', 'Beach'],
    hiking: ['WalkingTour', 'CyclingTour', 'HorseTour', 'EducationalTrail'],
    experiences: ['ThemePark', 'AdventurePark', 'LeisureComplex', 'ZooAnimalPark', 'VivariumAquarium', 'MiniGolf', 'BowlingAlley',
        'IceSkatingRink', 'SummerToboggan', 'TeachingFarm', 'TouristTrain', 'SightseeingBoat'],
    wellbeing: ['Spa', 'SpaResort', 'ThalassotherapyCentre', 'BalneotherapyCentre', 'Hammam', 'SwimmingPool']
});

const pages = new Map();
let budget = { hour: 0, used: 0 };

const text = value => String(value == null ? '' : value).trim();
// A DATAtourisme value: a plain value, a list of them, or a language map (`{ "@fr": … }`,
// as its filters name it: `label.@fr`).
const first = value => (Array.isArray(value) ? first(value[0]) : value);
const french = value => text(first(value && typeof value === 'object' && !Array.isArray(value) ? value['@fr'] : value));
const httpsUrl = (value) => {
    try { const url = new URL(text(value)); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
};

const spend = (now) => {
    const hour = Math.floor(now / HOUR_MS);
    if (budget.hour !== hour) budget = { hour, used: 0 };
    if (budget.used >= HOURLY_BUDGET) return false;
    budget.used += 1;
    return true;
};

// The photo of a place with its credits, else none (a picture without its credits is not shown).
const photo = (poi) => {
    const media = first(poi.hasMainRepresentation);
    const credits = french(first(media?.hasAnnotation)?.credits);
    const image = httpsUrl(first(first(media?.hasRelatedResource)?.locator));
    return image && credits ? { image, credit: credits } : { image: '', credit: '' };
};

const entryOf = (kind, poi, spec, distanceKm) => {
    const place = first(poi.isLocatedAt) || {}, address = first(place.address) || {};
    const lat = Number(place.geo?.latitude), lon = Number(place.geo?.longitude);
    const title = french(poi.label);
    const lastUpdate = text(poi.lastUpdateDatatourisme).slice(0, 10);
    return { id: `${kind}_${text(poi.uuid)}`, kind: 'place', title, place: title, summary: french(first(poi.hasDescription)?.shortDescription),
        address: french(address.streetAddress), city: french(address.addressLocality),
        lat, lon, distanceKm: distanceKm(spec, lat, lon), url: httpsUrl(first(first(poi.hasContact)?.homepage)), ...photo(poi),
        // The licence asks for the producer of each record and its last update.
        source: [french(poi.hasBeenCreatedBy?.legalName), lastUpdate].filter(Boolean).join(', ') };
};

export const readTourism = async (kind, spec, { fetchResource, now, key, distanceKm }) => {
    const page = Math.floor(spec.offset / PAGE_SIZE) + 1;
    const cell = `${kind}|${spec.lat.toFixed(2)}|${spec.lon.toFixed(2)}|${spec.radiusKm}|${spec.query}|${page}`;
    const kept = pages.get(cell);
    if (kept && now - kept.at < PAGE_TTL_MS) return kept.answer;
    if (!spend(now)) throw new Error('shows_tourism_busy');
    const params = new URLSearchParams({ filters: `type[in]=${TOURISM_KINDS[kind].join(',')}`, geo_distance: `${spec.lat},${spec.lon},${spec.radiusKm}km`,
        lang: 'fr', fields: FIELDS, page: String(page), page_size: String(PAGE_SIZE), ...(spec.query ? { search: spec.query } : {}) });
    const response = await fetchResource(`${API}?${params}`, { signal: AbortSignal.timeout(8000), redirect: 'error',
        headers: { accept: 'application/json', 'X-API-Key': key } });
    if (!response.ok) throw Object.assign(new Error(`status_${response.status}`), { status: response.status });
    const payload = await response.json();
    const objects = Array.isArray(payload?.objects) ? payload.objects : [];
    const answer = { total: Number(payload?.meta?.total) || 0,
        entries: objects.map(poi => entryOf(kind, poi, spec, distanceKm)).filter(entry => entry.title && Number.isFinite(entry.lat) && Number.isFinite(entry.lon)) };
    if (pages.size >= MAX_PAGES_KEPT) pages.delete(pages.keys().next().value);
    pages.set(cell, { answer, at: now });
    return answer;
};
