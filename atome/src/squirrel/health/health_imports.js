// Activities a connected service measured (#shared/activity_import_contract.js, Strava first), added to the workouts
// the device's health store measured: one reading of the sessions for every consumer (the Dashboard tile, the
// objectives, the Résultats monitor), like the declared water (#health_declarations.js). The native owner stays the only
// reader of the store; the imported activities are Atomes, one record per person and civil day, written through the
// one mutation pipeline. Sessions are a union of intervals: an activity the store also holds (a watch writing to both)
// counts once. An actor kept from health values (#health_actor_gate.js, the assistant) never reads one.
import { getHealthMonitor } from './health_catalog.js';
import { civilDayRange } from './health_values.js';
import { healthHistoryRanges, normalizeHealthHistoryDay } from './health_history.js';
import { healthAccessAllowedNow } from './health_actor_gate.js';
import { healthDeclarationDay } from '../../shared/health_declaration_contract.js';
import { activityImportId, activityImportKey, activityImportSame, validateActivityImport, validateActivityImportEntry,
    ACTIVITY_IMPORT_MEASURE_SOURCE } from '../../shared/activity_import_contract.js';

// The monitor the imported activities join: the day's workout sessions.
export const HEALTH_IMPORTED_SESSION_MONITOR = 'workout_duration';
const COMBINED = new Set(['value', 'no_data', 'unsupported']);
const ALONE = new Set(['health_host_unsupported']);
const combinable = reading => COMBINED.has(reading?.state) && reading.reasonCode !== 'health_access_sealed' && healthAccessAllowedNow();
const failed = code => Object.assign(new Error(code), { code });

// `store`: { read(id) → record | null, commit(event) → { ok } }; `actor()`: the device's principal, null without one.
export function createHealthImports({ owner, store, actor, now = () => Date.now(), createId = () => globalThis.crypto.randomUUID() }) {
    const listeners = new Set(); // (days: ['YYYY-MM-DD']) => void
    let queue = Promise.resolve();
    const principal = () => { const id = actor(); if (!id) throw failed('AUTH_REQUIRED'); return id; };
    const readDay = async (id) => {
        const record = await store.read(id), props = record?.properties || record?.props;
        return props?.activity_import ? validateActivityImport(props.activity_import, healthDeclarationDay) : null;
    };
    // The intervals imported for the civil days [from, to) touches; none without a principal (every write needs one).
    const intervalsIn = async (from, to) => {
        const id = actor(), found = [];
        if (!id) return found;
        for (let day = civilDayRange(from).from; day < to; day = civilDayRange(day).to) {
            const record = await readDay(activityImportId(id, healthDeclarationDay(day)));
            record?.entries.forEach(entry => found.push({ start: Date.parse(entry.start), end: Date.parse(entry.end) }));
        }
        return found;
    };

    const readHistory = async (monitorId, options = {}) => {
        if (monitorId !== HEALTH_IMPORTED_SESSION_MONITOR) return owner.readHistory(monitorId, options);
        if (!healthAccessAllowedNow()) return { ok: false, error: 'health_access_denied_for_actor' };
        const entry = getHealthMonitor(monitorId), native = await owner.readHistory(monitorId, options);
        if (!native.ok && !ALONE.has(native.error)) return native;
        if (options.signal?.aborted) return { ok: false, error: 'health_context_changed' };
        const cutoff = Math.min(options.to, now());
        let imported;
        try { imported = await intervalsIn(options.from, cutoff); }
        catch (error) { return { ok: false, error: error.code || error.message }; }
        // Nothing imported: the store's answer, unchanged.
        if (!imported.length) return native;
        const days = native.ok ? native.days : healthHistoryRanges(options.from, cutoff, { hourly: options.detail === true })
            .map(range => normalizeHealthHistoryDay(entry, { status: 'ok', hasData: false }, range, now()));
        // An activity belongs to the range it starts in, whole.
        return { ok: true, monitorId, days: days.map(day => {
            const mine = imported.filter(item => item.start >= day.range.from && item.start < day.range.to);
            if (!mine.length || !combinable(day.reading)) return day;
            const sessions = [...day.bands.map(({ stage, ...band }) => band), ...mine];
            return normalizeHealthHistoryDay(entry, { status: 'ok', sessions }, day.range, now());
        }) };
    };

    // The live reading of today: the store's, joined by today's imported activities when there are some.
    const subscribe = (monitorId, listener) => {
        if (monitorId !== HEALTH_IMPORTED_SESSION_MONITOR) return owner.subscribe(monitorId, listener);
        let native = null, active = true, ticket = 0;
        const emit = async () => {
            const mine = ++ticket, range = { from: civilDayRange(now()).from, to: now() };
            let reading = native;
            if (combinable(native) && range.to > range.from) {
                try {
                    if ((await intervalsIn(range.from, range.to)).length) {
                        const read = await readHistory(monitorId, range);
                        reading = read.ok ? read.days.at(-1).reading : { ...native, state: 'error', value: null, reasonCode: read.error };
                    }
                } catch (error) { reading = { ...native, state: 'error', value: null, reasonCode: error.code || error.message }; }
            }
            if (active && mine === ticket) listener(Object.freeze(reading));
        };
        const changed = () => { if (native) void emit(); };
        listeners.add(changed);
        const release = owner.subscribe(monitorId, reading => { native = reading; void emit(); });
        return () => { active = false; listeners.delete(changed); return release(); };
    };

    // One service's activities as it gave them (each { source_id, sport, start, end, measures… }), written day by day,
    // one after the other: a new one is added, a changed one replaced, an unchanged one leaves its day untouched (no event).
    const apply = ({ source, activities } = {}) => {
        const at = new Date(now()).toISOString();
        let entries;
        try {
            if (!Array.isArray(activities)) throw failed('INVALID_ARGUMENT');
            entries = activities.map(item => validateActivityImportEntry({ ...item, source, measure_source: ACTIVITY_IMPORT_MEASURE_SOURCE, imported_at: at }));
        } catch { return Promise.reject(failed('INVALID_ARGUMENT')); }
        const run = queue.then(async () => {
            const person = principal(), byDay = new Map(), counts = { added: 0, updated: 0, unchanged: 0 }, written = [];
            entries.forEach(item => {
                const day = healthDeclarationDay(Date.parse(item.start));
                byDay.set(day, [...(byDay.get(day) || []), item]);
            });
            for (const [day, items] of [...byDay].sort(([left], [right]) => left.localeCompare(right))) {
                const id = activityImportId(person, day), current = await readDay(id), next = [...(current?.entries || [])];
                let changed = false;
                items.forEach(item => {
                    const index = next.findIndex(kept => activityImportKey(kept) === activityImportKey(item));
                    if (index < 0) { next.push(item); counts.added += 1; changed = true; }
                    else if (activityImportSame(next[index], item)) counts.unchanged += 1;
                    else { next[index] = item; counts.updated += 1; changed = true; }
                });
                if (!changed) continue;
                const value = validateActivityImport({ version: 1, day, entries: next.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)) }, healthDeclarationDay);
                const changeId = `${id}:${createId()}`;
                const result = await store.commit({ kind: 'set', id: changeId, tx_id: changeId, actor: person, atome_id: id, type: 'record', scope: 'global',
                    props: { source_domain: 'activity_import', activity_import: value, ...(current ? {} : { created_iso: at }), updated_iso: at } });
                if (result?.ok === false) throw failed('IMPORT_WRITE_FAILED');
                written.push(day);
            }
            if (written.length) listeners.forEach(listener => listener(written));
            return { ok: true, ...counts, days: written };
        });
        // The caller gets the failure; the queue only waits for it.
        queue = run.catch(() => null);
        return run;
    };
    // `listener(days)`: the civil days whose imported activities changed.
    const onChange = listener => { listeners.add(listener); return () => listeners.delete(listener); };

    return Object.freeze({ ...owner, subscribe, readHistory, imports: Object.freeze({ apply, subscribe: onChange }) });
}
