// One deterministic navigation engine for browsers and native JavaScriptCore.
// Inputs are validated route data and timestamped fixes; outputs are intentions.
import { decodeGpsShape } from './route_geometry.js';
const RAD = Math.PI / 180;
const EARTH = 6371008.8;
export const gpsDistance = (a, b) => {
    const lat = (b.lat - a.lat) * RAD, lon = (b.lon - a.lon) * RAD;
    const h = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(lon / 2) ** 2;
    return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
};
export const validGpsPoint = point => point && typeof point.lat === 'number' && typeof point.lon === 'number'
    && Number.isFinite(point.lat) && Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
export function validateNavigationRoute(route) {
    const points = decodeGpsShape(route?.shape);
    if (!route || points.length < 2 || !points.every(validGpsPoint) || !Array.isArray(route.maneuvers)
        || !Number.isFinite(route.distance_m) || route.distance_m < 0 || !Number.isFinite(route.duration_s) || route.duration_s < 0
        || (route.via_indices || []).some((index, i, indices) => !Number.isInteger(index) || index < 0
            || index >= points.length || (i > 0 && index <= indices[i - 1]))
        || route.maneuvers.some(step => !Number.isInteger(step.begin) || !Number.isInteger(step.end)
            || step.begin < 0 || step.end < step.begin || step.end >= points.length
            || typeof step.instruction !== 'string' || !Number.isFinite(step.distance_m) || step.distance_m < 0
            || !Number.isFinite(step.duration_s) || step.duration_s < 0)) throw new Error('INVALID_PROVIDER_RESPONSE');
    return route;
}
function segmentPosition(fix, a, b) {
    const kx = EARTH * RAD * Math.cos(fix.lat * RAD), ky = EARTH * RAD;
    const ax = (a.lon - fix.lon) * kx, ay = (a.lat - fix.lat) * ky;
    const dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * ky;
    const length2 = dx * dx + dy * dy;
    const ratio = length2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    return { ratio, distance: Math.hypot(ax + ratio * dx, ay + ratio * dy) };
}
export function createGpsNavigationEngine(route, { offRouteSamples = 3, replanCooldownMs = 15000 } = {}) {
    validateNavigationRoute(route);
    let currentRoute = route, points = decodeGpsShape(route.shape), cumulative = [], progress = 0, offCount = 0, arrivalCount = 0;
    let lastTimestamp = -1, lastReplan = -Infinity, lastAnnouncement = '', arrived = false;
    const prepare = () => { cumulative = [0]; for (let i = 1; i < points.length; i++)
        cumulative.push(cumulative[i - 1] + gpsDistance(points[i - 1], points[i])); };
    prepare();
    const state = () => {
        const total = cumulative[cumulative.length - 1];
        const remaining = Math.max(0, total - progress);
        let maneuver = currentRoute.maneuvers.findIndex(step => cumulative[step.end] >= progress + 1);
        const next = currentRoute.maneuvers[maneuver + 1];
        const lead = Math.max(35, Math.min(250, currentRoute.duration_s ? currentRoute.distance_m / currentRoute.duration_s * 8 : 50));
        if (maneuver >= 0 && next && cumulative[next.begin] >= progress && cumulative[next.begin] - progress <= lead) maneuver++;
        return { progress_m: progress, remaining_m: remaining,
            remaining_s: total ? Math.round(currentRoute.duration_s * remaining / total) : 0,
            maneuver_remaining_m: maneuver < 0 ? 0 : Math.max(0, cumulative[currentRoute.maneuvers[maneuver].begin] - progress),
            maneuver_index: maneuver, instruction: currentRoute.maneuvers[maneuver]?.instruction || '', arrived, off_route: offCount > 0 };
    };
    return {
        state,
        replaceRoute(next) { validateNavigationRoute(next); currentRoute = next; points = decodeGpsShape(next.shape); progress = 0; offCount = 0;
            arrivalCount = 0; arrived = false; lastAnnouncement = ''; prepare(); },
        update(fix) {
            if (!validGpsPoint(fix) || !Number.isFinite(fix.timestamp) || !Number.isFinite(fix.accuracy)
                || fix.accuracy < 0) throw new Error('INVALID_ARGUMENT');
            if (fix.timestamp <= lastTimestamp || arrived) return { ...state(), intents: [], ignored: true };
            const elapsed = lastTimestamp < 0 ? Infinity : Math.max(1, (fix.timestamp - lastTimestamp) / 1000);
            lastTimestamp = fix.timestamp;
            if (fix.accuracy > 100) return { ...state(), intents: [], inaccurate: true };
            let best = null;
            for (let i = 0; i < points.length - 1; i++) {
                const match = segmentPosition(fix, points[i], points[i + 1]);
                const along = cumulative[i] + match.ratio * (cumulative[i + 1] - cumulative[i]);
                if (along < progress - 50 || along > progress + elapsed * 60 + fix.accuracy * 2 + 100) continue;
                if (!best || match.distance < best.distance) best = { ...match, along };
            }
            const intents = [], threshold = Math.max(35, fix.accuracy * 2);
            if (!best || best.distance > threshold) {
                offCount++;
                if (offCount >= offRouteSamples && fix.timestamp - lastReplan >= replanCooldownMs) {
                    lastReplan = fix.timestamp; intents.push({ type: 'recalculate', origin: { lat: fix.lat, lon: fix.lon },
                        passed_waypoints: (currentRoute.via_indices || []).filter(index => cumulative[index] <= progress).length });
                }
            } else { offCount = 0; progress = Math.max(progress, best.along); }
            const end = points[points.length - 1];
            arrivalCount = fix.accuracy <= 50 && gpsDistance(fix, end) <= Math.max(20, fix.accuracy) ? arrivalCount + 1 : 0;
            if (arrivalCount >= 2) {
                arrived = true; progress = cumulative[cumulative.length - 1];
                // The destination maneuver is announced before guidance ends.
                const index = currentRoute.maneuvers.length - 1, last = currentRoute.maneuvers[index]?.instruction;
                if (last && `${index}:${last}` !== lastAnnouncement) { lastAnnouncement = `${index}:${last}`; intents.push({ type: 'speak', text: last }); }
                intents.push({ type: 'arrived' });
            }
            const view = state();
            const announcement = `${view.maneuver_index}:${view.instruction}`;
            if (!offCount && !arrived && view.instruction && announcement !== lastAnnouncement) {
                lastAnnouncement = announcement; intents.push({ type: 'speak', text: view.instruction });
            }
            return { ...view, intents, off_route: offCount > 0 };
        }
    };
}
