// Pure historical projections. Native stores remain the only value authority.
import { civilDayRange, groupSleepIntervals, normalizeHealthResult, summarizeSleepSession } from './health_values.js';

const HOUR = 3600000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const interval = sample => finite(sample?.start) && finite(sample?.end) && sample.end >= sample.start;

export function healthHistoryRanges(from, to, { hourly = false } = {}) {
    if (!finite(from) || !finite(to) || to <= from || to - from > 32 * 86400000) throw new Error('health_history_range_invalid');
    const ranges = [];
    let cursor = from;
    while (cursor < to) {
        const end = Math.min(to, hourly ? cursor + HOUR : civilDayRange(cursor).to);
        ranges.push({ from: cursor, to: end });
        cursor = end;
    }
    return ranges;
}

export function healthHistoryWindow(now, days = 30) {
    const end = civilDayRange(now);
    const start = new Date(end.from);
    start.setDate(start.getDate() - days + 1);
    return { from: start.getTime(), to: now };
}

const stats = values => values.length ? {
    count: values.length, min: Math.min(...values), max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length
} : null;

export function normalizeHealthHistoryDay(entry, raw, range, fetchedAt, { partialPeriod = range.from > civilDayRange(range.from).from || range.to < civilDayRange(range.from).to } = {}) {
    if (['latest', 'latest_pair'].includes(entry?.strategy) && Array.isArray(raw?.samples)) {
        raw = { ...raw, samples: raw.samples.filter(sample => interval(sample) && sample.end >= range.from && sample.end < range.to) };
    }
    const reading = normalizeHealthResult(entry, raw, { range, fetchedAt, nowMs: fetchedAt });
    if (reading.coverage && partialPeriod && entry.strategy !== 'last_sleep') {
        reading.coverage = { ...reading.coverage, partial: true, reason: reading.coverage.reason
            || (civilDayRange(range.from).from === civilDayRange(fetchedAt).from ? 'day_in_progress' : 'civil_day_partial') };
    }
    const result = { range, reading, points: [], bands: [], statistics: null };
    if (reading.state !== 'value') return result;
    if (entry.strategy === 'latest' || entry.strategy === 'latest_pair') {
        const seen = new Set();
        result.points = (raw.samples || []).filter(sample => interval(sample) && sample.end >= range.from && sample.end < range.to)
            .filter(sample => entry.strategy === 'latest_pair' ? finite(sample.systolic) && finite(sample.diastolic) : finite(sample.value))
            .filter(sample => {
                const key = JSON.stringify([sample.start, sample.end, sample.value, sample.systolic, sample.diastolic, sample.source]);
                if (seen.has(key)) return false;
                seen.add(key); return true;
            }).map(sample => ({ ...sample, value: entry.strategy === 'latest_pair' ? sample.systolic
                : sample.value * (entry.unit === '%' && raw.scale === 'fraction' ? 100 : 1) }))
            .sort((a, b) => a.end - b.end);
        result.statistics = stats(result.points.map(point => point.value));
        if (entry.strategy === 'latest_pair') result.diastolicStatistics = stats(result.points.map(point => point.diastolic));
    } else if (entry.strategy === 'last_sleep') {
        const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter(interval) : groupSleepIntervals(raw.intervals || []);
        const matching = sessions.filter(session => session.end >= range.from && session.end < range.to).sort((a, b) => a.end - b.end);
        if (!matching.length) return { ...result, reading: { ...reading, state: 'no_data', value: null } };
        const session = matching[matching.length - 1];
        result.reading = { ...reading, value: summarizeSleepSession(session), measuredFrom: session.start, measuredTo: session.end };
        result.bands = (session.stages || []).filter(interval).map(stage => ({ ...stage }));
    } else if (entry.strategy === 'daily_sessions') {
        result.bands = (raw.sessions || []).filter(interval).map(session => ({ ...session, stage: 'session' }));
    }
    return result;
}

export function healthHistoryAverage(entry, days) {
    const complete = days.filter(day => day.reading?.state === 'value' && !day.reading.coverage?.partial);
    const valueOf = day => entry.strategy === 'last_sleep' ? (day.reading.value.semantics === 'asleep' ? day.reading.value.minutes : null)
        : entry.strategy === 'latest_pair' ? day.statistics?.mean : day.statistics?.mean ?? day.reading.value;
    const values = complete.map(valueOf).filter(finite);
    const result = stats(values);
    if (result && entry.strategy === 'latest_pair') result.diastolic = stats(complete.map(day => day.diastolicStatistics?.mean).filter(finite));
    return result;
}

// Each recovery belongs to an identified effort and to one source. Actual
// delays are returned; sparse data never masquerades as an exact 1/2 min test.
export function cardiacRecovery(points, sessions) {
    const ordered = points.filter(point => interval(point) && finite(point.value)).slice().sort((a, b) => a.end - b.end);
    return sessions.filter(interval).flatMap(session => {
        const before = ordered.filter(point => point.end <= session.end && point.end >= Math.max(session.start, session.end - 60000)).at(-1);
        if (!before) return [];
        const source = JSON.stringify(before.source || null);
        const after = ordered.filter(point => point.end > session.end && point.end <= session.end + 180000
            && JSON.stringify(point.source || null) === source && !sessions.some(other => other !== session && other.start <= point.end && other.end > point.end));
        const checkpoints = [60000, 120000].map(delay => after.find(point => point.end >= session.end + delay && point.end <= session.end + delay + 30000)).filter(Boolean);
        return checkpoints.map(point => {
            const elapsedSeconds = (point.end - before.end) / 1000;
            return { effortEnd: session.end, from: before.value, to: point.value, elapsedSeconds,
                afterEffortSeconds: (point.end - session.end) / 1000,
                drop: before.value - point.value, bpmPerMinute: (before.value - point.value) * 60 / elapsedSeconds };
        });
    });
}
