// The shared base of public events (database/adole_public_events_schema.js): its SQL, nothing else.
// server/public_events.js decides what goes in; this module only reads and writes the rows.

const sqlTime = ms => new Date(ms).toISOString();

export function createPublicEventsStore({ query }) {
    const series = eventId => query('get', 'SELECT * FROM public_event_series WHERE event_id = ?', [eventId]);

    // A series and its occurrences, replaced together (`published_at` and the reports kept).
    const put = async ({ eventId, authorId, authorName, payload, occurrences, projectedUntil }) => {
        await query('run', `INSERT INTO public_event_series (event_id, author_id, author_name, payload_json, projected_until)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(event_id) DO UPDATE SET author_name = excluded.author_name, payload_json = excluded.payload_json,
            projected_until = excluded.projected_until, updated_at = datetime('now')`,
        [eventId, authorId, authorName, JSON.stringify(payload), projectedUntil]);
        await query('run', 'DELETE FROM public_events WHERE event_id = ?', [eventId]);
        for (const occurrence of occurrences) {
            await query('run', `INSERT INTO public_events (occurrence_id, event_id, start_at, end_at, cell, lat, lon, categories, free)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [occurrence.id, eventId, occurrence.start, occurrence.end, occurrence.cell, occurrence.lat, occurrence.lon,
                `,${payload.categories.join(',')},`, payload.price?.free ? 1 : 0]);
        }
    };

    // The series leaves the base; its reports stay with nobody to read them.
    const remove = async (eventId) => {
        await query('run', 'DELETE FROM public_events WHERE event_id = ?', [eventId]);
        await query('run', 'DELETE FROM public_event_series WHERE event_id = ?', [eventId]);
    };

    // The occurrences in `cells` still to end, with their series, soonest first.
    const around = (cells, nowMs, limit = 500) => (cells.length ? query('all', `SELECT e.occurrence_id, e.event_id, e.start_at, e.end_at, e.lat, e.lon,
            e.categories, e.free, s.author_id, s.author_name, s.payload_json
        FROM public_events e JOIN public_event_series s ON s.event_id = e.event_id
        WHERE e.cell IN (${cells.map(() => '?').join(',')}) AND e.end_at >= ? AND s.hidden_at IS NULL
        ORDER BY e.start_at, e.occurrence_id LIMIT ?`, [...cells, sqlTime(nowMs), limit]) : Promise.resolve([]));

    // The next occurrence of one series still to end (an announcement's link), with its series.
    const upcoming = (eventId, nowMs) => query('get', `SELECT e.occurrence_id, e.event_id, e.start_at, e.end_at, e.lat, e.lon,
            e.categories, e.free, s.author_id, s.author_name, s.payload_json
        FROM public_events e JOIN public_event_series s ON s.event_id = e.event_id
        WHERE e.event_id = ? AND e.end_at >= ? AND s.hidden_at IS NULL
        ORDER BY e.start_at, e.occurrence_id LIMIT 1`, [eventId, sqlTime(nowMs)]);

    const report = async (eventId, reporterId, reason) => {
        await query('run', `INSERT INTO public_event_reports (event_id, reporter_id, reason) VALUES (?, ?, ?)
            ON CONFLICT(event_id, reporter_id) DO NOTHING`, [eventId, reporterId, reason]);
        const total = Number((await query('get', 'SELECT COUNT(*) AS total FROM public_event_reports WHERE event_id = ?', [eventId]))?.total || 0);
        await query('run', 'UPDATE public_event_series SET reports = ? WHERE event_id = ?', [total, eventId]);
        return total;
    };
    const hide = eventId => query('run', "UPDATE public_event_series SET hidden_at = datetime('now') WHERE event_id = ? AND hidden_at IS NULL", [eventId]);
    const restore = eventId => query('run', 'UPDATE public_event_series SET hidden_at = NULL, reports = 0 WHERE event_id = ?', [eventId])
        .then(() => query('run', 'DELETE FROM public_event_reports WHERE event_id = ?', [eventId]));

    // What the guard counts of an author: publications since `sinceMs`, series still to come, hidden ones since `hiddenSinceMs`.
    const authorCounts = async (authorId, { sinceMs, nowMs, hiddenSinceMs }) => {
        const count = async (sql, params) => Number((await query('get', sql, params))?.total || 0);
        return {
            published: await count(`SELECT COUNT(*) AS total FROM public_event_series WHERE author_id = ? AND published_at >= ?`,
                [authorId, sqlTime(sinceMs).replace('T', ' ').slice(0, 19)]),
            active: await count(`SELECT COUNT(DISTINCT s.event_id) AS total FROM public_event_series s JOIN public_events e ON e.event_id = s.event_id
                WHERE s.author_id = ? AND e.end_at >= ?`, [authorId, sqlTime(nowMs)]),
            hidden: (await query('all', `SELECT hidden_at FROM public_event_series WHERE author_id = ? AND hidden_at >= ? ORDER BY hidden_at`,
                [authorId, sqlTime(hiddenSinceMs).replace('T', ' ').slice(0, 19)]) || []).map(row => row.hidden_at)
        };
    };

    // Repeated series whose projection ends before `untilMs` (their next dates to publish).
    const stale = (untilMs, limit = 10) => query('all', `SELECT event_id, author_id FROM public_event_series
        WHERE hidden_at IS NULL AND projected_until IS NOT NULL AND projected_until < ? LIMIT ?`, [sqlTime(untilMs), limit]);
    const purge = nowMs => query('run', 'DELETE FROM public_events WHERE end_at < ?', [sqlTime(nowMs - 24 * 3600 * 1000)]);

    const reported = () => query('all', `SELECT event_id, author_id, author_name, reports, hidden_at, payload_json FROM public_event_series
        WHERE reports > 0 ORDER BY reports DESC, updated_at DESC LIMIT 200`);

    return { series, put, remove, around, upcoming, report, hide, restore, authorCounts, stale, purge, reported };
}
