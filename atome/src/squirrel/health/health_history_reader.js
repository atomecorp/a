import { getHealthMonitor } from './health_catalog.js';
import { healthHistoryRanges, normalizeHealthHistoryDay } from './health_history.js';
import { civilDayRange } from './health_values.js';
import { healthAccessAllowedNow } from './health_actor_gate.js';

// Called only by the boot owner's checked channel. No cache or independent
// access owner: cancellation and account epochs are checked at each boundary.
export function createHealthHistoryReader({ call, context, isCurrent, loadLinkStatus, accessEpoch, now, describe }) {
    return async function readHistory(monitorId, { from, to, detail = false, signal } = {}) {
        const entry = getHealthMonitor(monitorId);
        if (!entry) return { ok: false, error: 'health_monitor_unknown' };
        if (!healthAccessAllowedNow()) return { ok: false, error: 'health_access_denied_for_actor' };
        if (!describe().supported) return { ok: false, error: describe().reason };
        if (entry.id === 'device_steps_session') return { ok: false, error: 'health_history_unavailable' };
        const hourly = detail && ['daily_sum', 'device_steps'].includes(entry.strategy), cutoff = Math.min(to, now());
        let ranges;
        try { ranges = healthHistoryRanges(from, cutoff, { hourly }); }
        catch (error) { return { ok: false, error: error.message }; }
        if (detail && civilDayRange(from).to < to) return { ok: false, error: 'health_history_detail_day_required' };
        const ctx = context();
        const epoch = accessEpoch();
        const valid = () => isCurrent(ctx) && epoch === accessEpoch() && signal?.aborted !== true && healthAccessAllowedNow();
        if (!valid()) return { ok: false, error: 'health_context_changed' };
        const link = await loadLinkStatus();
        if (!valid()) return { ok: false, error: 'health_context_changed' };
        if (!link.linked) return { ok: false, error: link.reason || 'health_link_required' };
        const days = [];
        for (let offset = 0; offset < ranges.length; offset += 8) {
            if (!valid()) return { ok: false, error: 'health_context_changed' };
            const batch = ranges.slice(offset, offset + 8);
            const requests = batch.map((range, index) => ({ id: monitorId, key: `${monitorId}_${offset + index}`,
                from: entry.strategy === 'last_sleep' ? range.from - 36 * 3600000 : range.from,
                to: range.to, history: true }));
            const reply = await call('health_read', { requests }, ctx);
            if (!valid() || reply.stale) return { ok: false, error: 'health_context_changed' };
            if (!reply.ok) return { ok: false, error: reply.error };
            requests.forEach((request, index) => {
                const options = hourly ? { partialPeriod: from > civilDayRange(from).from || cutoff < civilDayRange(from).to } : {};
                const day = normalizeHealthHistoryDay(entry, reply.result?.results?.[request.key], batch[index], now(), options);
                // Summaries do not retain all raw samples from thirty days.
                days.push(detail ? day : { range: day.range, reading: day.reading, statistics: day.statistics,
                    diastolicStatistics: day.diastolicStatistics });
            });
        }
        return { ok: true, monitorId, days };
    };
}
