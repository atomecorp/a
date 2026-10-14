// External map data boundary. Only operator-configured URLs are reachable.
import { validGpsPoint, validateNavigationRoute } from '../atome/src/squirrel/gps/navigation_engine.js';
import { decodeGpsShape as decodeValhallaShape, encodeGpsShape } from '../atome/src/squirrel/gps/route_geometry.js';
export { decodeGpsShape as decodeValhallaShape } from '../atome/src/squirrel/gps/route_geometry.js';

const configuredUrl = value => {
    if (!value) throw new Error('NOT_CONFIGURED');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('NOT_CONFIGURED');
    return url;
};
const inFrance = p => validGpsPoint(p) && p.lat >= 41.3 && p.lat <= 51.2 && p.lon >= -5.2 && p.lon <= 9.7;
export function normalizeValhallaRoute(payload, calculatedAt) {
    if (payload?.trip?.status !== 0 || !Array.isArray(payload.trip.legs) || !payload.trip.legs.length)
        throw new Error(payload?.error_code === 442 ? 'NO_ROUTE' : 'INVALID_PROVIDER_RESPONSE');
    const route = { points: [], maneuvers: [], via_indices: [], distance_m: 0, duration_s: 0,
        provider: 'valhalla', calculated_at: calculatedAt };
    for (const leg of payload.trip.legs) {
        const points = decodeValhallaShape(leg.shape);
        const offset = route.points.length;
        route.points.push(...points);
        if (!Array.isArray(leg.maneuvers)) throw new Error('INVALID_PROVIDER_RESPONSE');
        route.maneuvers.push(...leg.maneuvers.map(step => ({ instruction: step.verbal_pre_transition_instruction || step.instruction || '',
            begin: offset + step.begin_shape_index, end: offset + step.end_shape_index,
            distance_m: step.length * 1000, duration_s: step.time })));
        route.distance_m += leg.summary?.length * 1000; route.duration_s += leg.summary?.time;
        if (leg !== payload.trip.legs.at(-1)) route.via_indices.push(route.points.length - 1);
    }
    const shape = encodeGpsShape(route.points);
    const { points: _points, ...properties } = route;
    const compact = { ...properties, shape };
    // Leave room for both the new value and immutable preimage in the vault IPC envelope.
    if (Buffer.byteLength(JSON.stringify(compact)) > 600000) throw new Error('INVALID_PROVIDER_RESPONSE');
    return validateNavigationRoute(compact);
}
async function readBounded(response, maxBytes) {
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('INVALID_PROVIDER_RESPONSE');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new Error('INVALID_PROVIDER_RESPONSE');
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
export function createGpsProvider({ env = process.env, fetchResource = fetch, now = () => new Date().toISOString() } = {}) {
    const get = async (url, options = {}, maxBytes = 5000000, allowRouteError = false) => {
        const response = await fetchResource(url, { ...options, signal: AbortSignal.timeout(12000),
            headers: { 'User-Agent': 'atome-gps/1.0', Accept: 'application/json', ...options.headers } });
        if (!response.ok && !(allowRouteError && response.status === 400)) throw new Error(response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE');
        return { bytes: await readBounded(response, maxBytes), response };
    };
    return {
        describe: () => ({ provider: 'valhalla', coverage: 'FR',
            configured: ['ATOME_GPS_VALHALLA_URL', 'ATOME_GPS_GEOCODER_URL', 'ATOME_GPS_TILE_URL'].every(key => !!env[key]),
            attribution: '© OpenStreetMap contributors' }),
        async route({ origin, destination, waypoints = [] }) {
            const locations = [origin, ...waypoints, destination];
            if (waypoints.length > 16 || !locations.every(validGpsPoint)) throw new Error('INVALID_ARGUMENT');
            if (!locations.every(inFrance)) throw new Error('OUT_OF_COVERAGE');
            const url = configuredUrl(env.ATOME_GPS_VALHALLA_URL); url.pathname = `${url.pathname.replace(/\/$/, '')}/route`;
            const { bytes } = await get(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locations: locations.map(({ lat, lon }) => ({ lat, lon })), costing: 'auto',
                    units: 'kilometers', language: 'fr-FR' }) }, 5000000, true);
            const payload = JSON.parse(bytes.toString());
            if (payload.error_code === 442) throw new Error('NO_ROUTE');
            return normalizeValhallaRoute(payload, now());
        },
        async search(query) {
            if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('INVALID_ARGUMENT');
            const url = configuredUrl(env.ATOME_GPS_GEOCODER_URL); url.pathname = `${url.pathname.replace(/\/$/, '')}/search`;
            url.search = new URLSearchParams({ q: query.trim(), format: 'jsonv2', countrycodes: 'fr', limit: '8' }).toString();
            const payload = JSON.parse((await get(url, {}, 100000)).bytes.toString());
            if (!Array.isArray(payload)) throw new Error('INVALID_PROVIDER_RESPONSE');
            return payload.slice(0, 8).map(entry => ({ lat: Number(entry.lat), lon: Number(entry.lon),
                label: String(entry.display_name || '').slice(0, 512) })).filter(inFrance);
        },
        async tile({ x, y, z }) {
            if (![x, y, z].every(Number.isInteger) || z < 0 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z)
                throw new Error('INVALID_ARGUMENT');
            const template = env.ATOME_GPS_TILE_URL;
            if (!template || !['{z}', '{x}', '{y}'].every(key => template.includes(key))) throw new Error('NOT_CONFIGURED');
            const url = configuredUrl(template.replace('{z}', z).replace('{x}', x).replace('{y}', y));
            const { bytes, response } = await get(url, { headers: { Accept: 'image/png' } }, 1000000);
            if (!response.headers.get('content-type')?.startsWith('image/png') || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
                throw new Error('INVALID_PROVIDER_RESPONSE');
            return `data:image/png;base64,${bytes.toString('base64')}`;
        }
    };
}
