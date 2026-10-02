// The single owner of health reads and subscriptions.
//
// Consumers (Dashboard monitors, the Conditions `health` source) subscribe per
// monitor id; the owner shares one read and one native observation per
// monitor, and releasing one consumer never stops another. Every request is
// tagged with an immutable context (generation + account id) captured when it
// starts; a reply whose context is no longer current is dropped before it can
// be stored, published or used to re-arm an observer.
//
// Values stay in memory only. Nothing here persists, syncs or logs a value.

import { getHealthMonitor, healthMonitorsForHost } from './health_catalog.js';
import { normalizeHealthResult, requestRangeFor } from './health_values.js';

const DEFAULT_POLL_MS = 60000;
const INVALIDATION_EVENT = 'atome:native-health-invalidated';
const MAX_BACKOFF_MS = 15 * 60000;
const READ_BATCH_LIMIT = 16;

const hostFamily = (host) => (host === 'ios' ? 'ios' : host === 'android' ? 'android' : null);
// Access states a host reports per monitor. `not_determined`: never asked, the
// system sheet can be shown. `not_granted`: not granted, whether it was asked
// is unknown (Health Connect). `denied` / `restricted`: the system no longer
// shows a sheet; only its settings can change it. `unknowable`: asked, but the
// platform hides read grants (HealthKit).
const SETTINGS_ONLY_ACCESS = new Set(['denied', 'restricted']);

const readingOf = (monitorId, state, reasonCode = state) => Object.freeze({
    monitorId, state, value: null, reasonCode, fetchedAt: null, measuredTo: null
});

export function createHealthOwner({
    channel,
    getAccountId = () => null,
    eventTarget = null,
    documentRef = null,
    now = () => Date.now(),
    pollMs = DEFAULT_POLL_MS,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id)
} = {}) {
    const family = hostFamily(channel?.host);
    let generation = 0;
    let sealed = false;
    let accountId = getAccountId() || null;
    let capabilities = null;
    let capabilitiesPromise = null;
    let linkState = null;
    const consumers = new Map(); // monitorId -> Set<listener>
    const readings = new Map(); // monitorId -> reading (memory only)
    const inflight = new Map(); // monitorId -> generation of the pending read
    const observed = new Set();
    let pendingReads = new Set();
    let readTimer = null;
    let pollTimer = null;
    let backoffMs = 0;
    let accessQueue = Promise.resolve();
    let accessPending = null;
    // Monitors still not granted right after a completed request: the host may
    // not show its sheet again (Health Connect after two refusals), so only its
    // settings are offered for them until access is observed granted.
    const refused = new Set();
    const statusListeners = new Set();

    const context = () => Object.freeze({ generation, accountId });
    const isCurrent = (ctx) => !sealed && ctx.generation === generation && ctx.accountId === accountId;
    const hidden = () => documentRef?.visibilityState === 'hidden';

    const publish = (monitorId, reading) => {
        if (reading.state === 'needs_permission' && refused.has(monitorId)) {
            reading = Object.freeze({ ...reading, state: 'denied', reasonCode: 'health_access_refused' });
        }
        readings.set(monitorId, reading);
        (consumers.get(monitorId) || new Set()).forEach((listener) => {
            try { listener(reading); } catch (_) { /* a consumer failure never blocks the others */ }
        });
    };

    const call = async (command, payload, ctx) => {
        if (sealed || !family) return { ok: false, error: sealed ? 'health_access_sealed' : 'health_host_unsupported' };
        const reply = await channel.call(command, payload);
        if (!isCurrent(ctx)) return { ok: false, error: 'health_context_changed', stale: true };
        return reply;
    };

    const describe = () => Object.freeze({
        host: channel?.host || 'web',
        supported: Boolean(family) && !sealed,
        reason: sealed ? 'health_access_sealed' : (family ? null : 'health_host_unsupported')
    });

    // Something that decides access may have changed (sheet answered, return
    // from the system settings, account change): forget the cached state and
    // tell status consumers to look again. Never prompts.
    let accessEpoch = 0;
    const invalidateAccess = () => {
        accessEpoch += 1;
        capabilities = null;
        capabilitiesPromise = null;
        statusListeners.forEach((listener) => {
            try { listener(); } catch (_) { /* a consumer failure never blocks the others */ }
        });
    };

    const withRefusals = (value) => {
        const monitors = {};
        Object.entries(value.monitors || {}).forEach(([id, entry]) => {
            if (entry?.access === 'granted') refused.delete(id);
            monitors[id] = entry?.access === 'not_granted' && refused.has(id) ? { ...entry, access: 'denied' } : entry;
        });
        return Object.freeze({ ...value, monitors: Object.freeze(monitors) });
    };

    // Capabilities never trigger a permission sheet.
    const loadCapabilities = () => {
        if (!family || sealed) {
            return Promise.resolve(Object.freeze({ available: false, reason: describe().reason, monitors: {} }));
        }
        if (capabilities) return Promise.resolve(capabilities);
        if (!capabilitiesPromise) {
            const ctx = context();
            const epoch = accessEpoch;
            capabilitiesPromise = call('health_capabilities', {
                monitors: healthMonitorsForHost(family).map((entry) => entry.id)
            }, ctx).then((reply) => {
                // An answer computed before access changed is not cached.
                if (epoch !== accessEpoch) return loadCapabilities();
                capabilitiesPromise = null;
                if (reply.stale) return loadCapabilities();
                const value = reply.ok
                    ? withRefusals({ available: reply.result?.available === true, reason: reply.result?.reason || null, monitors: reply.result?.monitors || {} })
                    : Object.freeze({ available: false, reason: reply.error, monitors: {} });
                if (reply.ok) capabilities = value;
                return value;
            });
        }
        return capabilitiesPromise;
    };

    const loadLinkStatus = async () => {
        if (!family || sealed) return Object.freeze({ linked: false, reason: describe().reason });
        if (!accountId) return Object.freeze({ linked: false, reason: 'health_account_required' });
        if (linkState && linkState.accountId === accountId) return linkState;
        const ctx = context();
        const reply = await call('health_link_status', {}, ctx);
        if (reply.stale) return loadLinkStatus();
        const status = Object.freeze({
            accountId,
            linked: reply.ok && reply.result?.linked === true,
            reason: reply.ok ? (reply.result?.reason || null) : reply.error
        });
        // Only an answer is remembered: a refused token or a transport error
        // is asked again on the next read instead of freezing "link required".
        if (reply.ok) linkState = status;
        return status;
    };

    // Explicit user gesture only: associates this device's health store with
    // the signed-in account, on this device, without syncing the association.
    const link = async () => {
        const ctx = context();
        const reply = await call('health_link', {}, ctx);
        if (reply.stale) return { ok: false, error: 'health_context_changed' };
        linkState = null;
        if (reply.ok) scheduleRead(Array.from(consumers.keys()));
        invalidateAccess();
        return reply.ok ? { ok: true } : { ok: false, error: reply.error };
    };

    // One native permission request in flight; ids requested meanwhile are
    // merged into the next request. Only ever called from a user gesture.
    // Monitors the system will no longer ask about are not requested again
    // (no silent sheet-less loop): they are answered as `settings`.
    const requestAccess = (monitorIds) => {
        const known = capabilities?.monitors || {};
        const valid = (Array.isArray(monitorIds) ? monitorIds : [monitorIds]).filter((id) => getHealthMonitor(id));
        const settings = valid.filter((id) => refused.has(id) || SETTINGS_ONLY_ACCESS.has(known[id]?.access));
        const ids = valid.filter((id) => !settings.includes(id));
        if (!ids.length) return Promise.resolve({ ok: true, requested: [], settings });
        if (accessPending) {
            ids.forEach((id) => accessPending.ids.add(id));
            return accessPending.promise;
        }
        const pending = { ids: new Set(ids), promise: null };
        accessPending = pending;
        pending.promise = accessQueue = accessQueue.then(async () => {
            accessPending = null;
            const ctx = context();
            const requested = Array.from(pending.ids);
            const reply = await call('health_request_access', { monitors: requested }, ctx);
            if (reply.stale) return { ok: false, error: 'health_context_changed', requested };
            // Hosts that report per-type results (Health Connect) tell which
            // types stayed refused; HealthKit hides it and reports none.
            const notGranted = Array.isArray(reply.result?.notGranted) ? reply.result.notGranted.map(String) : [];
            const granted = Array.isArray(reply.result?.granted) ? reply.result.granted.map(String) : [];
            granted.forEach((id) => refused.delete(id));
            if (reply.ok && reply.result?.completed !== false) notGranted.forEach((id) => refused.add(id));
            invalidateAccess();
            scheduleRead(requested.filter((id) => consumers.has(id)));
            return reply.ok
                ? { ok: true, requested, ...(reply.result || {}) }
                : { ok: false, error: reply.error, requested };
        });
        return pending.promise;
    };

    // Explicit user gesture only: opens the system place where these
    // monitors' access is managed (app settings, Health Connect). The state is
    // checked again when the app returns to the foreground.
    const openSettings = async (monitorIds) => {
        const ids = (Array.isArray(monitorIds) ? monitorIds : [monitorIds]).filter((id) => getHealthMonitor(id));
        const reply = await call('health_open_settings', { monitors: ids }, context());
        if (reply.stale) return { ok: false, error: 'health_context_changed' };
        return reply.ok ? { ok: true, ...(reply.result || {}) } : { ok: false, error: reply.error };
    };

    const flushReads = async () => {
        readTimer = null;
        if (sealed || !family) return;
        const ids = Array.from(pendingReads).filter((id) => consumers.has(id) && !inflight.has(id));
        pendingReads = new Set();
        if (!ids.length) return;
        const link = await loadLinkStatus();
        if (!link.linked) {
            const state = String(link.reason || '').startsWith('health_host') ? 'unsupported' : 'needs_link';
            ids.forEach((id) => publish(id, readingOf(id, state, link.reason || 'health_link_required')));
            return;
        }
        const ctx = context();
        const nowMs = now();
        for (let index = 0; index < ids.length; index += READ_BATCH_LIMIT) {
            const batch = ids.slice(index, index + READ_BATCH_LIMIT);
            const requests = batch.map((id) => ({ id, ...requestRangeFor(getHealthMonitor(id), nowMs) }));
            batch.forEach((id) => inflight.set(id, ctx.generation));
            const reply = await call('health_read', { requests }, ctx);
            batch.forEach((id) => { if (inflight.get(id) === ctx.generation) inflight.delete(id); });
            if (reply.stale) return;
            if (!reply.ok) {
                const transient = reply.error === 'health_store_locked' || reply.error === 'health_rate_limited';
                if (transient) backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs ? backoffMs * 2 : pollMs);
                batch.forEach((id) => consumers.has(id) && publish(id, readingOf(id, transient ? 'temporarily_unavailable' : 'error', reply.error)));
                continue;
            }
            backoffMs = 0;
            const fetchedAt = now();
            const results = reply.result?.results || {};
            requests.forEach((request) => {
                // A monitor released while its read was in flight is not resurrected.
                if (!consumers.has(request.id)) return;
                publish(request.id, Object.freeze(normalizeHealthResult(getHealthMonitor(request.id), results[request.id], {
                    fetchedAt, range: { from: request.from, to: request.to }, nowMs: fetchedAt
                })));
            });
        }
        syncObservers(ctx);
    };

    const scheduleRead = (ids) => {
        (Array.isArray(ids) ? ids : [ids]).forEach((id) => pendingReads.add(id));
        if (readTimer !== null || sealed) return;
        readTimer = setTimer(() => { void flushReads(); }, 0);
    };

    const syncObservers = (ctx) => {
        const wanted = new Set(Array.from(consumers.keys()));
        const start = Array.from(wanted).filter((id) => !observed.has(id));
        const stop = Array.from(observed).filter((id) => !wanted.has(id));
        stop.forEach((id) => observed.delete(id));
        if (stop.length) void call('health_unobserve', { monitors: stop }, ctx);
        if (start.length) {
            start.forEach((id) => observed.add(id));
            void call('health_observe', { monitors: start }, ctx).then((reply) => {
                if (reply.stale || !reply.ok) start.forEach((id) => observed.delete(id));
            });
        }
    };

    const schedulePoll = () => {
        if (pollTimer !== null) clearTimer(pollTimer);
        pollTimer = null;
        if (!consumers.size || sealed || hidden()) return;
        pollTimer = setTimer(() => {
            pollTimer = null;
            scheduleRead(Array.from(consumers.keys()));
            schedulePoll();
        }, pollMs + backoffMs);
    };

    const subscribe = (monitorId, listener) => {
        const entry = getHealthMonitor(monitorId);
        if (!entry || typeof listener !== 'function') return () => false;
        let set = consumers.get(monitorId);
        if (!set) consumers.set(monitorId, set = new Set());
        set.add(listener);
        const known = readings.get(monitorId);
        listener(known || readingOf(monitorId, sealed ? 'unsupported' : (family ? 'loading' : 'unsupported'), describe().reason || 'loading'));
        if (family && !sealed && !known) scheduleRead(monitorId);
        if (pollTimer === null) schedulePoll();
        let active = true;
        return () => {
            if (!active) return false;
            active = false;
            set.delete(listener);
            if (!set.size) {
                consumers.delete(monitorId);
                readings.delete(monitorId);
                pendingReads.delete(monitorId);
                syncObservers(context());
                if (!consumers.size) schedulePoll();
            }
            return true;
        };
    };

    // Account change / logout: invalidate first, then purge and stop.
    const resetContext = (nextAccountId) => {
        generation += 1;
        accountId = nextAccountId || null;
        capabilities = null;
        capabilitiesPromise = null;
        linkState = null;
        refused.clear();
        inflight.clear();
        pendingReads = new Set();
        readings.clear();
        const ctx = context();
        if (observed.size && family && !sealed) void channel.call('health_context_reset', {});
        observed.clear();
        consumers.forEach((set, id) => {
            const reading = readingOf(id, accountId ? 'loading' : 'needs_link', accountId ? 'loading' : 'health_account_required');
            set.forEach((listener) => { try { listener(reading); } catch (_) { /* isolated */ } });
        });
        if (accountId && consumers.size) scheduleRead(Array.from(consumers.keys()));
        schedulePoll();
        invalidateAccess();
        return ctx;
    };

    // One-way: once untrusted code runs in this realm, health access is closed
    // natively and in JS until the page reloads.
    const seal = () => {
        if (sealed) return;
        sealed = true;
        generation += 1;
        if (family && channel.isOpen()) void channel.call('health_channel_close', {});
        readings.clear();
        pendingReads = new Set();
        if (pollTimer !== null) clearTimer(pollTimer);
        pollTimer = null;
        consumers.forEach((set, id) => {
            const reading = readingOf(id, 'unsupported', 'health_access_sealed');
            set.forEach((listener) => { try { listener(reading); } catch (_) { /* isolated */ } });
        });
    };

    const onInvalidated = (event) => {
        // A host "access may have changed" signal (return to the foreground,
        // where the system settings may have been changed): re-check access and
        // re-read every monitor still consumed. Carries no value either.
        if (event?.detail?.access === true) {
            if (hidden()) return;
            invalidateAccess();
            if (consumers.size) scheduleRead(Array.from(consumers.keys()));
            return;
        }
        const ids = Array.isArray(event?.detail?.monitors) ? event.detail.monitors : [];
        // The signal carries no value; it only schedules a re-read of monitors
        // that still have consumers. Forged signals cost one deduped read.
        const relevant = ids.filter((id) => consumers.has(String(id)));
        if (relevant.length && !hidden()) scheduleRead(relevant);
    };
    const onVisibility = () => {
        if (hidden()) {
            if (pollTimer !== null) clearTimer(pollTimer);
            pollTimer = null;
            return;
        }
        invalidateAccess();
        if (consumers.size) scheduleRead(Array.from(consumers.keys()));
        schedulePoll();
    };
    const onLoggedOut = () => resetContext(null);
    const onLoggedIn = (event) => {
        const next = event?.detail?.anonymous ? null : (event?.detail?.userId || getAccountId() || null);
        if (next !== accountId) resetContext(next);
    };

    eventTarget?.addEventListener?.(INVALIDATION_EVENT, onInvalidated);
    eventTarget?.addEventListener?.('squirrel:user-logged-out', onLoggedOut);
    eventTarget?.addEventListener?.('squirrel:user-logged-in', onLoggedIn);
    documentRef?.addEventListener?.('visibilitychange', onVisibility);

    return Object.freeze({
        describe,
        capabilities: loadCapabilities,
        linkStatus: loadLinkStatus,
        link,
        requestAccess,
        openSettings,
        // Called (no argument) whenever access may have changed; returns release().
        onAccessChange: (listener) => {
            if (typeof listener !== 'function') return () => false;
            statusListeners.add(listener);
            return () => statusListeners.delete(listener);
        },
        subscribe,
        refresh: (ids) => scheduleRead(ids || Array.from(consumers.keys())),
        reading: (monitorId) => readings.get(monitorId) || null,
        resetContext,
        seal,
        stats: () => Object.freeze({ generation, consumers: consumers.size, observed: observed.size, polling: pollTimer !== null })
    });
}

export { INVALIDATION_EVENT };
