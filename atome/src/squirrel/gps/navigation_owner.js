import { createGpsNavigationEngine } from './navigation_engine.js';
import { gpsError } from './contracts.js';

// The native host owns the same engine when the WebView can be suspended.
// Preview clients subscribe to this owner, never to a second guidance session.
export function createGpsNavigationOwner({ store, host, provider, readActor, deviceId, now = () => new Date().toISOString() }) {
    let trip = null, engine = null, release = null, generation = 0, processing = Promise.resolve(), failure = '', starting = false, position = null;
    const listeners = new Set();
    const publish = () => { for (const listener of listeners) listener(); };
    const fixFailed = async (error, token) => {
        if (token !== generation) return;
        try { await stop('interrupted'); }
        catch (failureToStop) { failure = gpsError(failureToStop); publish(); return; }
        failure = gpsError(error); publish();
    };
    const state = () => ({ active: !!trip, trip_id: trip?.id || '', error: failure, background: host.background === true,
        position, ...(engine ? engine.state() : {}) });
    const receive = async (fix, token, owner) => {
        if (token !== generation || readActor() !== owner || !trip) return;
        position = { ...fix };
        const update = engine.update(fix);
        for (const intent of update.intents) {
            if (token !== generation || readActor() !== owner) return;
            if (intent.type === 'speak') await host.speak(intent.text);
            if (intent.type === 'recalculate') {
                try {
                    const waypoint_offset = (trip.properties.waypoint_offset || 0) + intent.passed_waypoints;
                    const route = await provider.route({ origin: intent.origin, destination: trip.properties.destination,
                        waypoints: (trip.properties.waypoints || []).slice(waypoint_offset) });
                    if (token !== generation || readActor() !== owner) return;
                    trip = await store.update(trip, { route, waypoint_offset }); engine.replaceRoute(route); failure = '';
                } catch (error) { failure = gpsError(error); }
            }
            if (intent.type === 'arrived') { await stop('arrived'); return; }
        }
        publish();
    };
    const stop = async (status = 'stopped') => {
        if (host.native) { const result = await host.stop(); publish(); return result; }
        const ending = trip;
        generation++; release?.(); release = null; await host.stopSpeech();
        trip = null; engine = null; position = null; failure = '';
        try { if (ending) await store.update(ending, { status, ended_at: now() }); }
        catch (error) { failure = gpsError(error); throw error; }
        finally { publish(); }
        return { ok: true };
    };
    return {
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async state() { return host.native ? host.state() : state(); },
        async start(id) {
            if (starting) throw new Error('NAVIGATION_ALREADY_ACTIVE');
            starting = true;
            try {
            if (host.native) {
                const record = await store.read(id);
                if (!record.properties.route) throw new Error('NO_ROUTE');
                const result = await host.start(record); publish(); return result;
            }
            if (trip) {
                if (trip.id === id) return { ok: true, state: state() };
                throw new Error('NAVIGATION_ALREADY_ACTIVE');
            }
            const token = ++generation, owner = readActor(), record = await store.read(id);
            if (!record.properties.route) throw new Error('NO_ROUTE');
            const nextEngine = createGpsNavigationEngine(record.properties.route);
            let initialFix = null;
            const unwatch = await host.observe(fix => {
                if (!trip && token === generation) { initialFix = fix; return; }
                processing = processing.then(() => receive(fix, token, owner)).catch(error => fixFailed(error, token));
            }, error => {
                if (token !== generation || readActor() !== owner) return;
                failure = gpsError(error); publish();
                processing = processing.then(() => stop('interrupted')).catch(error => { failure = gpsError(error); publish(); });
            });
            if (token !== generation || readActor() !== owner) { unwatch(); throw new Error('CONTEXT_CHANGED'); }
            try {
                trip = await store.update(record, { status: 'navigating', navigation_device: deviceId,
                    started_at: now(), ended_at: '' }); engine = nextEngine; release = unwatch;
            } catch (error) { unwatch(); throw error; }
            if (initialFix) processing = processing.then(() => receive(initialFix, token, owner)).catch(error => fixFailed(error, token));
            publish(); return { ok: true, state: state() };
            } finally { starting = false; }
        },
        stop,
        async release() {
            generation++; release?.(); release = null; trip = null; engine = null; position = null;
            await host.release(); publish();
        }
    };
}
