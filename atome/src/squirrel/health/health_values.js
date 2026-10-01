// Pure data contract for health readings: request ranges, native result
// validation and compact formatting. No I/O here, so every rule the monitors
// depend on (civil day, units, sleep merging, pairs, absence vs zero) is
// testable in isolation.

const MINUTE = 60 * 1000;
const SLEEP_SESSION_GAP_MS = 2 * 60 * MINUTE;
const SLEEP_IN_PROGRESS_MS = 30 * MINUTE;

// Reading states shown to the user. `no_data` (nothing readable in the range)
// is never a refusal: HealthKit hides read denials behind empty results.
export const HEALTH_READING_STATES = Object.freeze([
    'loading', 'value', 'no_data', 'needs_link', 'needs_permission', 'denied',
    'unavailable', 'temporarily_unavailable', 'unsupported', 'error'
]);

const NATIVE_STATUS_TO_STATE = Object.freeze({
    ok: 'value',
    no_data: 'no_data',
    permission_required: 'needs_permission',
    permission_denied: 'denied',
    store_locked: 'temporarily_unavailable',
    temporarily_unavailable: 'temporarily_unavailable',
    unavailable: 'unavailable',
    feature_unavailable: 'unavailable',
    host_unsupported: 'unsupported',
    unsupported: 'unsupported',
    link_required: 'needs_link'
});

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const toMs = (value) => {
    const number = typeof value === 'string' ? Date.parse(value) : Number(value);
    return Number.isFinite(number) ? number : null;
};

// Civil day of the current device calendar. Built from calendar fields, so a
// DST day lasts 23 h or 25 h instead of a fixed 24 h window.
export function civilDayRange(nowMs) {
    const now = new Date(nowMs);
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    return { from, to };
}

export function requestRangeFor(entry, nowMs) {
    if (!entry) return null;
    if (entry.strategy === 'daily_sum' || entry.strategy === 'daily_sessions' || entry.strategy === 'device_steps') {
        const day = civilDayRange(nowMs);
        return { from: day.from, to: Math.min(day.to, nowMs) };
    }
    const lookback = Math.max(MINUTE, Number(entry.lookbackMs) || 7 * 24 * 60 * MINUTE);
    return { from: nowMs - lookback, to: nowMs };
}

const unionMinutes = (intervals, clip = null) => {
    const sorted = intervals
        .map(({ start, end }) => ({
            start: clip ? Math.max(start, clip.from) : start,
            end: clip ? Math.min(end, clip.to) : end
        }))
        .filter(({ start, end }) => end > start)
        .sort((left, right) => left.start - right.start);
    let total = 0;
    let current = null;
    sorted.forEach((interval) => {
        if (!current || interval.start > current.end) {
            if (current) total += current.end - current.start;
            current = { ...interval };
        } else {
            current.end = Math.max(current.end, interval.end);
        }
    });
    if (current) total += current.end - current.start;
    return total / MINUTE;
};

const validInterval = (entry) => {
    const start = toMs(entry?.start);
    const end = toMs(entry?.end);
    return start !== null && end !== null && end >= start ? { ...entry, start, end } : null;
};

const ASLEEP_STAGES = new Set(['asleep_unspecified', 'asleep_core', 'asleep_light', 'asleep_deep', 'asleep_rem']);

// HealthKit has no sleep session object: group samples separated by less than
// two hours. "In bed" overlaps the stages, so asleep time is the UNION of
// asleep stages only; awake / in bed / unknown never count as sleep.
export function groupSleepIntervals(intervals) {
    const sorted = intervals.map(validInterval).filter(Boolean).sort((left, right) => left.start - right.start);
    const sessions = [];
    sorted.forEach((interval) => {
        const last = sessions[sessions.length - 1];
        if (!last || interval.start - last.end > SLEEP_SESSION_GAP_MS) {
            sessions.push({ start: interval.start, end: interval.end, stages: [interval] });
        } else {
            last.end = Math.max(last.end, interval.end);
            last.stages.push(interval);
        }
    });
    return sessions;
}

export function summarizeSleepSession(session) {
    const stages = Array.isArray(session?.stages) ? session.stages.map(validInterval).filter(Boolean) : [];
    const asleep = stages.filter((stage) => ASLEEP_STAGES.has(stage.stage));
    const byStage = (name) => unionMinutes(stages.filter((stage) => stage.stage === name));
    if (asleep.length) {
        const detail = {};
        ['asleep_core', 'asleep_light', 'asleep_deep', 'asleep_rem'].forEach((name) => {
            if (stages.some((stage) => stage.stage === name)) detail[name] = byStage(name);
        });
        return {
            semantics: 'asleep',
            minutes: unionMinutes(asleep),
            awakeMinutes: unionMinutes(stages.filter((stage) => stage.stage === 'awake')),
            stages: detail
        };
    }
    const inBed = stages.filter((stage) => stage.stage === 'in_bed');
    if (inBed.length) return { semantics: 'in_bed', minutes: unionMinutes(inBed), stages: {} };
    // A provider session without any stage: its duration is a session
    // duration, not a quantity of sleep, and no stage is invented.
    return { semantics: 'session', minutes: (session.end - session.start) / MINUTE, stages: {} };
}

const pickLastSleepSession = (sessions, nowMs) => {
    const ordered = sessions.slice().sort((left, right) => left.end - right.end);
    const complete = ordered.filter((session) => nowMs - session.end >= SLEEP_IN_PROGRESS_MS);
    return complete[complete.length - 1] || ordered[ordered.length - 1] || null;
};

const failure = (entry, state, reasonCode, base) => ({
    ...base, state, value: null, reasonCode: reasonCode || state
});

// Validates one native result for one monitor. Anything malformed is a data
// error, never a value: no 0, NaN or placeholder stands in for missing data.
export function normalizeHealthResult(entry, raw, { fetchedAt, range = null, nowMs = fetchedAt } = {}) {
    const base = {
        monitorId: entry?.id || null,
        unit: entry?.unit || null,
        method: entry?.method || null,
        fetchedAt,
        period: null,
        measuredFrom: null,
        measuredTo: null,
        coverage: null,
        source: null
    };
    if (!entry) return failure(entry, 'error', 'health_monitor_unknown', base);
    const status = String(raw?.status || '');
    if (status !== 'ok') {
        return failure(entry, NATIVE_STATUS_TO_STATE[status] || 'error', raw?.reason || status || 'health_result_invalid', base);
    }
    const coverage = raw.coverage && typeof raw.coverage === 'object'
        ? {
            from: toMs(raw.coverage.from),
            to: toMs(raw.coverage.to),
            partial: raw.coverage.partial === true,
            reason: raw.coverage.reason || null
        }
        : (range ? { from: range.from, to: range.to, partial: false, reason: null } : null);
    const withCoverage = { ...base, coverage };
    // The native side states its scale: HealthKit percent is a fraction (0.98),
    // Health Connect already a percentage (98). Only a declared fraction scales.
    const scaled = (value) => (entry.unit === '%' && raw.scale === 'fraction') ? value * 100 : value;

    switch (entry.strategy) {
    case 'daily_sum':
    case 'device_steps': {
        if (raw.hasData === false || raw.value === null || raw.value === undefined) {
            return failure(entry, 'no_data', 'health_no_data_in_range', { ...withCoverage, period: range });
        }
        if (!isFiniteNumber(raw.value) || raw.value < 0) return failure(entry, 'error', 'health_value_invalid', withCoverage);
        return {
            ...withCoverage,
            state: 'value',
            value: raw.value,
            period: { from: toMs(raw.from) ?? range?.from ?? null, to: toMs(raw.to) ?? range?.to ?? null },
            measuredTo: toMs(raw.to) ?? range?.to ?? null,
            source: raw.source || null
        };
    }
    case 'latest': {
        const samples = (Array.isArray(raw.samples) ? raw.samples : []).map(validInterval).filter(Boolean);
        if (!samples.length) {
            return failure(entry, 'no_data', coverage?.partial ? 'health_no_data_in_readable_range' : 'health_no_data_in_range', withCoverage);
        }
        // Latest by measurement end, never by arrival or page order.
        const latest = samples.reduce((best, sample) => (
            !best || sample.end > best.end || (sample.end === best.end && sample.start > best.start) ? sample : best
        ), null);
        if (!isFiniteNumber(latest.value)) return failure(entry, 'error', 'health_value_invalid', withCoverage);
        return {
            ...withCoverage,
            state: 'value',
            value: scaled(latest.value),
            measuredFrom: latest.start,
            measuredTo: latest.end,
            source: latest.source || null,
            qualifiers: latest.qualifiers || null
        };
    }
    case 'latest_pair': {
        // Each sample is ONE correlated measurement; components of different
        // measurements are never paired.
        const pairs = (Array.isArray(raw.samples) ? raw.samples : []).map(validInterval).filter((pair) => (
            pair && isFiniteNumber(pair.systolic) && isFiniteNumber(pair.diastolic)
        ));
        if (!pairs.length) return failure(entry, 'no_data', 'health_no_data_in_range', withCoverage);
        const latest = pairs.reduce((best, pair) => (!best || pair.end > best.end ? pair : best), null);
        return {
            ...withCoverage,
            state: 'value',
            value: { systolic: latest.systolic, diastolic: latest.diastolic },
            measuredFrom: latest.start,
            measuredTo: latest.end,
            source: latest.source || null
        };
    }
    case 'last_sleep': {
        const sessions = Array.isArray(raw.sessions)
            ? raw.sessions.map(validInterval).filter(Boolean)
            : groupSleepIntervals(Array.isArray(raw.intervals) ? raw.intervals : []);
        const session = pickLastSleepSession(sessions, nowMs);
        if (!session) return failure(entry, 'no_data', 'health_no_data_in_range', withCoverage);
        const summary = summarizeSleepSession(session);
        return {
            ...withCoverage,
            state: 'value',
            value: summary,
            measuredFrom: session.start,
            measuredTo: session.end,
            source: session.source || null
        };
    }
    case 'daily_sessions': {
        const sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).map(validInterval).filter(Boolean);
        if (!sessions.length) return failure(entry, 'no_data', 'health_no_data_in_range', { ...withCoverage, period: range });
        const clip = range ? { from: range.from, to: range.to } : null;
        return {
            ...withCoverage,
            state: 'value',
            value: unionMinutes(sessions, clip),
            period: range,
            measuredTo: Math.max(...sessions.map((session) => session.end))
        };
    }
    default:
        return failure(entry, 'error', 'health_strategy_unknown', withCoverage);
    }
}

// Direct step counter (Android TYPE_STEP_COUNTER counts since reboot). The
// session value is a delta from the first reading; a reboot (counter going
// backwards) re-bases instead of producing a negative or a jump.
export function advanceStepCounter(state, counter) {
    if (!isFiniteNumber(counter) || counter < 0) return state || null;
    if (!state || !isFiniteNumber(state.lastCounter)) return { lastCounter: counter, steps: 0 };
    const delta = counter >= state.lastCounter ? counter - state.lastCounter : counter;
    return { lastCounter: counter, steps: state.steps + delta };
}

const twoDigits = (value) => String(value).padStart(2, '0');

const sameCivilDay = (left, right) => {
    const a = new Date(left);
    const b = new Date(right);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const formatNumber = (value, digits, locale) => {
    try {
        return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
    } catch (_) {
        return String(Math.round(value * 10 ** digits) / 10 ** digits);
    }
};

const formatDuration = (minutes) => {
    const total = Math.round(minutes);
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return hours ? `${hours} h ${twoDigits(rest)}` : `${rest} min`;
};

const DISPLAY = Object.freeze({
    count: { digits: 0, unitKey: null },
    bpm: { digits: 0, unitKey: 'bpm' },
    ms: { digits: 0, unitKey: 'ms' },
    kcal: { digits: 0, unitKey: 'kcal' },
    'kcal/d': { digits: 0, unitKey: 'kcal/j' },
    '%': { digits: 1, unitKey: '%' },
    'breaths/min': { digits: 1, unitKey: '/min' },
    'mg/dL': { digits: 0, unitKey: 'mg/dL' },
    degC: { digits: 1, unitKey: '°C' },
    degC_delta: { digits: 2, unitKey: 'Δ°C', signed: true },
    'mL/(kg*min)': { digits: 1, unitKey: 'mL/kg/min' },
    kg: { digits: 1, unitKey: 'kg' },
    cm: { digits: 0, unitKey: 'cm' },
    'kg/m2': { digits: 1, unitKey: 'kg/m²' },
    'm/s': { digits: 2, unitKey: 'm/s' },
    mL: { digits: 0, unitKey: 'mL' }
});

// Compact cell text. The value keeps its nature: only presentation units
// change (m shown as km), never the measure.
export function formatHealthReading(entry, reading, { locale = undefined, nowMs = Date.now() } = {}) {
    if (!entry || !reading || reading.state !== 'value') {
        return { value: null, unit: null, when: null, stateKey: `eve.health.state.${reading?.state || 'loading'}` };
    }
    let value;
    let unit;
    if (entry.strategy === 'latest_pair') {
        value = `${formatNumber(reading.value.systolic, 0, locale)}/${formatNumber(reading.value.diastolic, 0, locale)}`;
        unit = 'mmHg';
    } else if (entry.strategy === 'last_sleep') {
        value = formatDuration(reading.value.minutes);
        unit = null;
    } else if (entry.unit === 'min') {
        value = formatDuration(reading.value);
        unit = null;
    } else if (entry.unit === 'm') {
        value = reading.value >= 1000 ? formatNumber(reading.value / 1000, 2, locale) : formatNumber(reading.value, 0, locale);
        unit = reading.value >= 1000 ? 'km' : 'm';
    } else {
        const display = DISPLAY[entry.unit] || { digits: 1, unitKey: entry.unit };
        const formatted = formatNumber(reading.value, display.digits, locale);
        value = display.signed && reading.value > 0 ? `+${formatted}` : formatted;
        unit = display.unitKey;
    }
    const at = reading.measuredTo;
    let when = null;
    if (reading.period && (entry.strategy === 'daily_sum' || entry.strategy === 'daily_sessions' || entry.strategy === 'device_steps')) {
        when = { key: 'eve.health.when.today' };
    } else if (Number.isFinite(at)) {
        const date = new Date(at);
        when = sameCivilDay(at, nowMs)
            ? { text: `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}` }
            : { text: date.toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short' }), old: true };
    }
    const semanticsKey = entry.strategy === 'last_sleep' && reading.value.semantics !== 'asleep'
        ? `eve.health.sleep.${reading.value.semantics}`
        : null;
    return { value, unit, when, stateKey: null, semanticsKey, partial: reading.coverage?.partial === true };
}
