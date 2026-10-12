import { expect, test } from 'vitest';
import { getHealthMonitor } from '../../atome/src/squirrel/health/health_catalog.js';
import { createHealthOwner } from '../../atome/src/squirrel/health/health_owner.js';
import { runWithoutHealthAccess } from '../../atome/src/squirrel/health/health_actor_gate.js';
import { cardiacRecovery, healthHistoryAverage, healthHistoryRanges, healthHistoryWindow, normalizeHealthHistoryDay } from '../../atome/src/squirrel/health/health_history.js';

const range = { from: 1000, to: 10000000 };
const normalize = (id, raw) => normalizeHealthHistoryDay(getHealthMonitor(id), raw, range, range.to);

test('historical quantities preserve timestamps, declared percent scale and meaningful statistics', () => {
    const day = normalize('oxygen_saturation', { status: 'ok', scale: 'fraction', samples: [
        { start: 2000, end: 2000, value: .98 }, { start: 3000, end: 3000, value: .96 },
        { start: 3000, end: 3000, value: .96 }
    ] });
    expect(day.points.map(point => point.value)).toEqual([98, 96]);
    expect(day.statistics).toEqual({ count: 2, min: 96, max: 98, mean: 97 });
    expect(day.reading.value).toBe(96);
    expect(normalize('weight', { status: 'no_data' }).statistics).toBeNull();
    expect(normalize('weight', { status: 'ok', samples: [{ start: 2000, end: 2000, value: NaN }] }).reading.state).toBe('error');
});

test('means exclude unavailable and partial days, keep daily weighting and sleep semantics', () => {
    const entry = getHealthMonitor('hrv_sdnn');
    const day = mean => ({ statistics: { mean }, reading: { state: 'value' } });
    expect(healthHistoryAverage(entry, [day(30), day(50), { ...day(500), reading: { state: 'value', coverage: { partial: true } } },
        { reading: { state: 'no_data' } }])).toEqual({ count: 2, min: 30, max: 50, mean: 40 });
    expect(healthHistoryAverage(getHealthMonitor('sleep'), [{ reading: { state: 'value', value: { minutes: 500, semantics: 'in_bed' } } }])).toBeNull();
});

test('sleep keeps measured bands and belongs to the wake day without inventing stages', () => {
    const day = normalize('sleep', { status: 'ok', sessions: [{ start: -2000000, end: 3000000, stages: [
        { start: -2000000, end: 1000000, stage: 'asleep_deep' }, { start: 1000000, end: 3000000, stage: 'asleep_rem' }
    ] }] });
    expect(day.bands).toHaveLength(2);
    expect(day.reading.value.stages.asleep_deep).toBe(50);
    expect(day.reading.value.minutes).toBeCloseTo(5000000 / 60000);
    const previous = normalize('sleep', { status: 'ok', sessions: [{ start: -2000000, end: 0, stages: [] }] });
    expect(previous.reading.state).toBe('no_data');
});

test('recovery uses an identified effort, a consistent source and the measured delay', () => {
    const source = { name: 'watch' };
    const samples = [[100000, 150], [180000, 120], [240000, 110]].map(([end, value]) => ({ start: end, end, value, source }));
    const recovery = cardiacRecovery(samples, [{ start: 1000, end: 110000 }]);
    expect(recovery).toHaveLength(2);
    expect(recovery[0]).toMatchObject({ drop: 30, elapsedSeconds: 80, afterEffortSeconds: 70, bpmPerMinute: 22.5 });
    expect(cardiacRecovery(samples.slice(1), [{ start: 1000, end: 110000 }])).toEqual([]);
    expect(cardiacRecovery(samples.map((sample, index) => ({ ...sample, source: { name: String(index) } })), [{ start: 1000, end: 110000 }])).toEqual([]);
});

test('historical windows use civil days and bounded hourly ranges', () => {
    const now = new Date(2026, 9, 26, 12).getTime();
    const window = healthHistoryWindow(now);
    const days = healthHistoryRanges(window.from, window.to);
    expect(days).toHaveLength(30);
    expect(days.at(-1).to).toBe(now);
    expect(new Date(days[0].from).getHours()).toBe(0);
    expect(() => healthHistoryRanges(0, 33 * 86400000)).toThrow('health_history_range_invalid');
    const hours = healthHistoryRanges(days.at(-1).from, now, { hourly: true });
    expect(hours.every((hour, index) => !index || hours[index - 1].to === hour.from)).toBe(true);
});

test('civil-day bins retain the 23/25 hour changes and ongoing totals are explicitly partial', () => {
    const previous = process.env.TZ; process.env.TZ = 'Europe/Paris';
    try {
        for (const [month, day, count] of [[2, 29, 23], [9, 25, 25]]) {
            const from = new Date(2026, month, day).getTime(), to = new Date(2026, month, day + 1).getTime();
            expect(healthHistoryRanges(from, to, { hourly: true })).toHaveLength(count);
        }
        const from = new Date(2026, 9, 11).getTime(), to = from + 3600000;
        const day = normalizeHealthHistoryDay(getHealthMonitor('steps'), { status: 'ok', value: 120, hasData: true }, { from, to }, to);
        expect(day.reading.coverage).toMatchObject({ partial: true, reason: 'day_in_progress' });
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('blood pressure keeps correlated pairs and both means separate', () => {
    const entry = getHealthMonitor('blood_pressure');
    const day = normalize('blood_pressure', { status: 'ok', samples: [
        { start: 2000, end: 2000, systolic: 120, diastolic: 80 },
        { start: 3000, end: 3000, systolic: 130, diastolic: 90 }
    ] });
    expect(day.statistics.mean).toBe(125); expect(day.diastolicStatistics.mean).toBe(85);
    day.reading.coverage.partial = false;
    expect(healthHistoryAverage(entry, [day])).toMatchObject({ mean: 125, diastolic: { mean: 85 } });
});

function ownerWith(call) {
    return createHealthOwner({ channel: { host: 'ios', call, isOpen: () => false }, getAccountId: () => 'A', now: () => range.to });
}

test('historical reads use the checked existing channel with distinct keys and no authorization request', async () => {
    const calls = [];
    const owner = ownerWith(async (command, payload) => {
        calls.push(command);
        if (command === 'health_link_status') return { ok: true, result: { linked: true } };
        return { ok: true, result: { results: Object.fromEntries(payload.requests.map(request => [request.key,
            { status: 'ok', samples: [{ start: 2000, end: 2000, value: 70 }] }])) } };
    });
    const result = await owner.readHistory('heart_rate', { ...range, detail: true });
    expect(result.ok).toBe(true);
    expect(result.days[0].statistics.mean).toBe(70);
    expect(calls).toEqual(['health_link_status', 'health_read']);
});

test.each(['account', 'abort', 'seal'])('late historical replies are discarded on %s', async cause => {
    let resolve, started;
    const reading = new Promise(r => { started = r; });
    const owner = ownerWith(async command => command === 'health_link_status' ? { ok: true, result: { linked: true } }
        : new Promise(r => { resolve = r; started(); }));
    const controller = new AbortController();
    const pending = owner.readHistory('heart_rate', { ...range, signal: controller.signal });
    await reading;
    if (cause === 'account') owner.resetContext('B');
    else if (cause === 'abort') controller.abort();
    else owner.seal();
    resolve({ ok: true, result: { results: {} } });
    expect(await pending).toEqual({ ok: false, error: 'health_context_changed' });
    expect(owner.reading('heart_rate')).toBeNull();
});

test('the historical entry point respects the existing MCP/AI denial gate', async () => {
    let calls = 0;
    const owner = ownerWith(async () => { calls++; return { ok: true }; });
    expect(await runWithoutHealthAccess(() => owner.readHistory('heart_rate', range)))
        .toEqual({ ok: false, error: 'health_access_denied_for_actor' });
    expect(calls).toBe(0);
});

test('hourly native aggregates for a complete past day do not falsely become partial days', async () => {
    const from = new Date(2026, 9, 10).getTime(), to = new Date(2026, 9, 11).getTime();
    const owner = createHealthOwner({ channel: { host: 'ios', isOpen: () => false, call: async (command, payload) =>
        command === 'health_link_status' ? { ok: true, result: { linked: true } } : { ok: true, result: {
            results: Object.fromEntries(payload.requests.map(request => [request.key, { status: 'ok', value: 100, hasData: true }])) } } },
        getAccountId: () => 'A', now: () => to + 12 * 3600000 });
    const history = await owner.readHistory('steps', { from, to, detail: true });
    expect(history.ok).toBe(true); expect(history.days).toHaveLength(24);
    expect(history.days.every(day => day.reading.coverage.partial === false)).toBe(true);
    owner.seal();
});
