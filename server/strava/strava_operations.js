import { StravaFailure, STRAVA_IMPORT_DAYS, stravaError, validateStravaInput } from '../../atome/src/squirrel/strava/contracts.js';
import { readStravaConfig, stravaConfigured, stravaFetch, stravaSession, startStravaConnection, awaitStravaConnection,
    cancelStravaConnection, disconnectStrava, stravaPublicState, STRAVA_RECORD } from './strava_session.js';

// The server side of the strava.* commands (#squirrel/strava/contracts.js) on the person's authenticated provider
// socket. `strava.activities` is the device's own read for strava.import: the activities as atome keeps them
// (#shared/activity_import_contract.js), which the device writes through the one mutation pipeline. Nothing is
// written here but the person's tokens.
const PAGE = 200; // Strava's largest page
const PAGES = 8;  // a year of daily activities and more; a longer history is read by asking fewer days
const ACTIONS = new Set(['get_state', 'connect', 'await_connection', 'cancel_connection', 'disconnect', 'activities']);

// A Strava activity (its summary) as atome keeps it, or null when Strava's answer is not one.
export const stravaActivity = item => {
    const id = String(item?.id ?? ''), start = Date.parse(item?.start_date), elapsed = Number(item?.elapsed_time);
    const sport = String(item?.sport_type || item?.type || '');
    if (!/^[0-9]{1,20}$/.test(id) || !Number.isFinite(start) || !(elapsed >= 0) || !/^[A-Za-z]{1,40}$/.test(sport)) return null;
    const measures = { moving_s: item.moving_time, distance_m: item.distance, elevation_m: item.total_elevation_gain,
        ...(item.has_heartrate === true ? { heart_avg: item.average_heartrate, heart_max: item.max_heartrate } : {}) };
    return { source_id: id, sport, start: new Date(start).toISOString(), end: new Date(start + elapsed * 1000).toISOString(),
        ...Object.fromEntries(Object.entries(measures).filter(([, value]) => Number.isFinite(value) && value >= 0)) };
};

// The person's activities started in the last `days`, page after page.
async function readActivities(ctx, record, days) {
    const after = Math.floor((Date.now() - days * 86400000) / 1000), found = [];
    for (let page = 1; page <= PAGES; page += 1) {
        ctx.check();
        const list = await stravaFetch(ctx.fetchImpl, 'https://www.strava.com/api/v3/athlete/activities?'
            + new URLSearchParams({ after: String(after), page: String(page), per_page: String(PAGE) }),
        { method: 'GET', signal: ctx.signal, headers: { Authorization: `Bearer ${record.access_token}` } });
        if (!Array.isArray(list)) throw new StravaFailure('PROVIDER_REJECTED');
        list.map(stravaActivity).filter(Boolean).forEach(activity => found.push(activity));
        if (list.length < PAGE) break;
    }
    ctx.check();
    return found;
}

export async function handleStravaAction(action, input = {}, options) {
    const name = String(action).replace(/^strava\./, '');
    if (!ACTIONS.has(name) || (name === 'activities' ? validateStravaInput('import', input) : validateStravaInput(name, input))) return { ok: false, error: 'INVALID_ARGUMENT' };
    const ctx = { ...options, input };
    try {
        ctx.check();
        ctx.config ??= readStravaConfig();
        const configured = stravaConfigured(ctx.config);
        if (name === 'get_state') {
            if (!configured) return { ok: true, configured: false, state: 'not_configured' };
            const record = await ctx.vault.readRecord(STRAVA_RECORD); ctx.check();
            return { ok: true, configured: true, ...stravaPublicState(record) };
        }
        if (name === 'connect') return { ok: true, ...startStravaConnection(ctx) };
        if (name === 'await_connection') {
            const result = await awaitStravaConnection(ctx);
            return result.ok ? { ok: true, configured: true, ...result.account } : { ok: false, error: stravaError(result.error) };
        }
        if (name === 'cancel_connection') return { ok: true, cancelled: cancelStravaConnection(ctx) };
        if (name === 'disconnect') return { ok: true, ...await disconnectStrava(ctx) };
        if (!configured) throw new StravaFailure('NOT_CONFIGURED');
        const record = await stravaSession(ctx);
        return { ok: true, activities: await readActivities(ctx, record, input.days ?? STRAVA_IMPORT_DAYS) };
    } catch (error) { ctx.check(); return { ok: false, error: stravaError(error) }; }
}
