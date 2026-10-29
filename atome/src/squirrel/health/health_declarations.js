// What the person declares for a monitor (a glass of water, health_catalog.js `declaration`), added to what the
// device's health store measured: one reading for every consumer (the Dashboard tile, the detail, the objectives).
// The native owner (#health_owner.js) stays the only reader of the store; the declared values are Atomes, one record
// per monitor and civil day (#shared/health_declaration_contract.js), written through the one mutation pipeline.
import { getHealthMonitor } from './health_catalog.js';
import { civilDayRange, normalizeHealthResult } from './health_values.js';
import { healthHistoryRanges, normalizeHealthHistoryDay } from './health_history.js';
import { healthAccessAllowedNow } from './health_actor_gate.js';
import { healthDeclarationDay, healthDeclarationEntries, healthDeclarationId, validateHealthDeclaration } from '../../shared/health_declaration_contract.js';

// Native states a declared value completes; any other (a link, a permission to give) keeps its own reading, and a
// sealed realm or an actor kept from health values (#health_actor_gate.js) never sees one.
const COMBINED = new Set(['value', 'no_data', 'unsupported']);
const combinable = reading => COMBINED.has(reading.state) && reading.reasonCode !== 'health_access_sealed' && healthAccessAllowedNow();
const ALONE = new Set(['health_host_unsupported']);
const failed = code => Object.assign(new Error(code), { code });

// `store`: { read(id) → record | null, commit(event) → { ok } }; `actor()`: the device's principal, null without one.
export function createHealthDeclarations({ owner, store, actor, now = () => Date.now(), createId = () => globalThis.crypto.randomUUID() }) {
    const listeners = new Map(); // monitorId -> Set<() => void>
    let queue = Promise.resolve();
    const declarable = id => Boolean(getHealthMonitor(id)?.declaration);
    const monitorOf = id => { const entry = getHealthMonitor(id); if (!entry?.declaration) throw failed('HEALTH_DECLARATION_MONITOR_UNKNOWN'); return entry; };
    const principal = () => { const id = actor(); if (!id) throw failed('AUTH_REQUIRED'); return id; };

    const readDay = async (entry, day) => {
        const id = healthDeclarationId(principal(), entry.id, day), record = await store.read(id);
        const props = record?.properties || record?.props;
        return props?.health_declaration ? { id, value: validateHealthDeclaration(props.health_declaration, entry) } : { id, value: null };
    };
    // The declared total of [from, to), read day by day; null when nothing declared is counted there.
    // Without a principal nothing can have been declared on this device (every write needs one).
    const declaredIn = async (entry, ranges) => {
        if (!actor()) return ranges.map(() => null);
        const days = new Map();
        for (const range of ranges) {
            const day = healthDeclarationDay(range.from);
            if (!days.has(day)) days.set(day, healthDeclarationEntries((await readDay(entry, day)).value));
        }
        return ranges.map(range => {
            // A range reaching the present ends with its day: nothing is declared after now.
            const to = range.to >= now() ? civilDayRange(range.from).to : range.to;
            const counted = days.get(healthDeclarationDay(range.from)).filter(item => Date.parse(item.at) >= range.from && Date.parse(item.at) < to);
            return counted.length ? counted.reduce((sum, item) => sum + item.value, 0) : null;
        });
    };
    const withDeclared = (entry, reading, declared, range) => {
        if (!combinable(reading)) return reading;
        if (declared === null) return reading.state === 'unsupported' ? normalizeHealthResult(entry, { status: 'ok', hasData: false }, { fetchedAt: now(), range }) : reading;
        if (reading.state === 'value') return { ...reading, value: reading.value + declared };
        return normalizeHealthResult(entry, { status: 'ok', value: declared, from: range.from, to: range.to }, { fetchedAt: now(), range });
    };

    const subscribe = (monitorId, listener) => {
        if (!declarable(monitorId)) return owner.subscribe(monitorId, listener);
        const entry = getHealthMonitor(monitorId);
        let native = null, active = true, ticket = 0;
        const emit = async () => {
            const mine = ++ticket, range = { from: civilDayRange(now()).from, to: now() };
            let reading = native;
            if (combinable(native)) {
                try { reading = withDeclared(entry, native, (await declaredIn(entry, [range]))[0], range); }
                catch (error) { reading = { ...native, state: 'error', value: null, reasonCode: error.code || error.message }; }
            }
            if (active && mine === ticket) listener(Object.freeze(reading));
        };
        const changed = () => { if (native) void emit(); };
        if (!listeners.has(monitorId)) listeners.set(monitorId, new Set());
        listeners.get(monitorId).add(changed);
        const release = owner.subscribe(monitorId, reading => { native = reading; void emit(); });
        return () => { active = false; listeners.get(monitorId)?.delete(changed); return release(); };
    };

    const readHistory = async (monitorId, options = {}) => {
        if (!declarable(monitorId)) return owner.readHistory(monitorId, options);
        if (!healthAccessAllowedNow()) return { ok: false, error: 'health_access_denied_for_actor' };
        const entry = getHealthMonitor(monitorId), native = await owner.readHistory(monitorId, options);
        if (!native.ok && !ALONE.has(native.error)) return native;
        if (options.signal?.aborted) return { ok: false, error: 'health_context_changed' };
        const hourly = options.detail === true, cutoff = Math.min(options.to, now());
        const days = native.ok ? native.days : healthHistoryRanges(options.from, cutoff, { hourly })
            .map(range => normalizeHealthHistoryDay(entry, { status: 'ok', hasData: false }, range, now()));
        let declared;
        try { declared = await declaredIn(entry, days.map(day => day.range)); }
        catch (error) { return { ok: false, error: error.code || error.message }; }
        return { ok: true, monitorId, days: days.map((day, index) => declared[index] === null ? day
            : normalizeHealthHistoryDay(entry, { status: 'ok', value: (day.reading.state === 'value' ? day.reading.value : 0) + declared[index],
                from: day.range.from, to: day.range.to }, day.range, now())) };
    };

    // Writes, one after the other: each reads the day's record as the last write left it.
    const write = (monitorId, day, change) => {
        const run = queue.then(async () => {
            const entry = monitorOf(monitorId), { id, value } = await readDay(entry, day);
            const next = validateHealthDeclaration(change(value || { version: 1, monitor_id: entry.id, day, entries: [] }), entry);
            // Each change is its own event (its id), on the day's one Atome.
            const at = new Date(now()).toISOString(), changeId = `${id}:${createId()}`;
            const result = await store.commit({ kind: 'set', id: changeId, tx_id: changeId, actor: principal(),
                atome_id: id, type: 'record', scope: 'global',
                props: { source_domain: 'health_declaration', health_declaration: next, ...(value ? {} : { created_iso: at }), updated_iso: at } });
            if (result?.ok === false) throw failed('HEALTH_DECLARATION_WRITE_FAILED');
            listeners.get(monitorId)?.forEach(listener => listener());
            return next;
        });
        // The caller gets the failure; the queue only waits for it.
        queue = run.catch(() => null);
        return run;
    };
    // A declared value, now, in the monitor's unit (its glass when none is given).
    const add = async ({ monitor_id: monitorId, value, unit } = {}) => {
        const entry = monitorOf(monitorId), at = now(), typed = { value: value ?? entry.declaration.value, unit: unit ?? entry.unit };
        if (typed.unit !== entry.unit || !(typed.value > 0) || typed.value > entry.declaration.max) throw failed('INVALID_ARGUMENT');
        const item = { id: createId(), ...typed, method: 'declared', at: new Date(at).toISOString() };
        await write(monitorId, healthDeclarationDay(at), record => ({ ...record, entries: [...record.entries, item] }));
        return { ok: true, monitor_id: monitorId, entry: item };
    };
    // The day's last value still counted is withdrawn (kept, dated).
    const withdraw = async ({ monitor_id: monitorId, day = healthDeclarationDay(now()) } = {}) => {
        let withdrawn = null;
        await write(monitorId, day, record => {
            const last = healthDeclarationEntries(record).at(-1);
            if (!last) throw failed('HEALTH_DECLARATION_NONE');
            withdrawn = { ...last, withdrawn_at: new Date(now()).toISOString() };
            return { ...record, entries: record.entries.map(item => item.id === last.id ? withdrawn : item) };
        });
        return { ok: true, monitor_id: monitorId, entry: withdrawn };
    };

    return Object.freeze({ ...owner, subscribe, readHistory, declarations: Object.freeze({ declarable, add, withdraw }) });
}
