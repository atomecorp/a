// Public events: a calendar event its author made public (todo/evenements_publics_2026-10-26.md).
// The event stays its author's `calendar_event` Atome; `publication` (written by the author's
// devices) says what the public reads of it, `publication_status` (written by the server only)
// says whether it is live. The server projects every live event into the shared base read by the
// Activité rubrics (server/public_events.js). One owner for the publication's shape and checks,
// client and server.
import { ACTIVITY_CATEGORY_SLUGS } from './activity_categories.js';

export const PUBLIC_EVENT_MAX_CATEGORIES = 3;
// A repeated event is published for the occurrences of the next days.
export const PUBLIC_EVENT_HORIZON_DAYS = 60;
// The poster is a small picture carried by the publication itself (a JPEG data URL).
export const PUBLIC_EVENT_POSTER_MAX_PX = 360;
export const PUBLIC_EVENT_POSTER_MAX_CHARS = 120_000;
export const PUBLIC_EVENT_STATUSES = Object.freeze(['pending', 'live', 'refused', 'hidden']);
export const PUBLIC_EVENT_REASONS = Object.freeze(['quota', 'suspended', 'invalid', 'reported', 'past']);
export const PUBLIC_EVENT_REPORT_REASONS = Object.freeze(['spam', 'false', 'offensive', 'other']);

const text = (value, max = 200) => String(value == null ? '' : value).trim().slice(0, max);
const coordinate = (value, limit) => {
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= limit ? Math.round(number * 1e6) / 1e6 : null;
};
const httpsUrl = (value) => {
    try {
        const url = new URL(text(value, 500));
        return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
};
const parse = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};

const normalizePrice = (value) => {
    const price = value && typeof value === 'object' ? value : {};
    if (price.free === true) return { free: true };
    const amount = Math.round(Number(price.amount) * 100) / 100;
    return Number.isFinite(amount) && amount > 0 ? { amount, currency: /^[A-Z]{3}$/.test(text(price.currency)) ? text(price.currency) : 'EUR' } : { free: true };
};
const normalizePlace = (value) => {
    const place = value && typeof value === 'object' ? value : {};
    return { label: text(place.label), address: text(place.address, 300), city: text(place.city, 120),
        lat: coordinate(place.lat, 90), lon: coordinate(place.lon, 180) };
};
const normalizePoster = value => (typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    && value.length <= PUBLIC_EVENT_POSTER_MAX_CHARS ? value : '');

// The publication as stored (`publication` property, JSON): what the author chose, never a status.
export const normalizePublication = (value) => {
    const source = parse(value);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const categories = [...new Set((Array.isArray(source.categories) ? source.categories : []).map(slug => text(slug, 40))
        .filter(slug => ACTIVITY_CATEGORY_SLUGS.includes(slug)))].slice(0, PUBLIC_EVENT_MAX_CATEGORIES);
    return { visibility: source.visibility === 'public' ? 'public' : 'private', categories, place: normalizePlace(source.place),
        poster: normalizePoster(source.poster), price: normalizePrice(source.price), ticket_url: httpsUrl(source.ticket_url),
        url: httpsUrl(source.url) };
};

// The server's word on a publication (`publication_status` property, JSON).
export const normalizePublicationStatus = (value) => {
    const source = parse(value);
    if (!source || typeof source !== 'object') return null;
    const status = PUBLIC_EVENT_STATUSES.includes(source.status) ? source.status : null;
    if (!status) return null;
    return { status, reason: PUBLIC_EVENT_REASONS.includes(source.reason) ? source.reason : null, at: text(source.at, 40) };
};

// What keeps a public publication from going live, the first one found: its error code.
export const publicationError = (publication, { title, start } = {}) => {
    if (!publication || publication.visibility !== 'public') return null;
    if (!text(title)) return 'events_title_required';
    if (!start || !Number.isFinite(new Date(start).getTime())) return 'events_start_required';
    if (!publication.categories.length) return 'events_category_required';
    if (publication.place.lat == null || publication.place.lon == null) return 'events_place_required';
    return null;
};

// The grid cell of a position (~11 km): the shared base is read by the cells around a reader.
export const PUBLIC_EVENT_CELL_DEGREES = 0.1;
export const publicEventCell = (lat, lon) => (Math.floor((Number(lat) + 90) / PUBLIC_EVENT_CELL_DEGREES) * 10000)
    + Math.floor((Number(lon) + 180) / PUBLIC_EVENT_CELL_DEGREES);
// The cells covering a radius around a position.
export const publicEventCellsAround = (lat, lon, radiusKm) => {
    const latSpan = radiusKm / 111, lonSpan = radiusKm / (111 * Math.max(0.05, Math.cos(Number(lat) * Math.PI / 180)));
    const cells = [];
    for (let row = Math.floor((lat - latSpan + 90) / PUBLIC_EVENT_CELL_DEGREES); row <= Math.floor((lat + latSpan + 90) / PUBLIC_EVENT_CELL_DEGREES); row += 1) {
        for (let column = Math.floor((lon - lonSpan + 180) / PUBLIC_EVENT_CELL_DEGREES); column <= Math.floor((lon + lonSpan + 180) / PUBLIC_EVENT_CELL_DEGREES); column += 1) {
            cells.push(row * 10000 + column);
        }
    }
    return cells;
};

// The distance between two positions, in km with one decimal (haversine).
export const distanceKm = (from, lat, lon) => {
    if (!from || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(from.lat) || !Number.isFinite(from.lon)) return null;
    const rad = Math.PI / 180, dLat = (lat - from.lat) * rad, dLon = (lon - from.lon) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(lat * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(12742 * Math.asin(Math.sqrt(a)) * 10) / 10;
};
