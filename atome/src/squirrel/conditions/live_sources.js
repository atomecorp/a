const normalizeId = (value) => String(value == null ? '' : value).trim();

const subjectIdOf = (context = {}) => normalizeId(
    context.subjectId
    || context.candidate?.id
    || context.candidate?.atome_id
    || context.contact?.id
    || context.atome?.id
    || 'current'
);

const locationPoint = (value) => {
    const latitude = Number(value?.latitude ?? value?.lat);
    const longitude = Number(value?.longitude ?? value?.lng ?? value?.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

const distanceKm = (leftValue, rightValue) => {
    const left = locationPoint(leftValue);
    const right = locationPoint(rightValue);
    if (!left || !right) return null;
    const radians = (degrees) => degrees * (Math.PI / 180);
    const latitudeDelta = radians(right.latitude - left.latitude);
    const longitudeDelta = radians(right.longitude - left.longitude);
    const a = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude))
        * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export function createLiveConditionSource({ source, fields = [], connector = null, now = () => Date.now() } = {}) {
    const sourceId = normalizeId(source).toLowerCase();
    if (!sourceId) throw new Error('condition_live_source_id_required');
    const definitions = new Map(fields.map((entry) => [String(entry.field), Object.freeze({ ...entry, source: sourceId })]));
    const samples = new Map();
    const listeners = new Set();
    let releaseConnector = null;
    let staleTimer = null;

    const dependency = (field) => `${sourceId}.${field}`;
    const notify = (subjectId, field, reason) => {
        const event = Object.freeze({ subjectId, dependencies: Object.freeze([dependency(field)]), reason });
        listeners.forEach((listener) => listener(event));
    };
    const scheduleStale = () => {
        if (staleTimer !== null) clearTimeout(staleTimer);
        let nextExpiry = Infinity;
        const timestamp = now();
        samples.forEach((sample) => {
            if (sample.expiresAt > timestamp) nextExpiry = Math.min(nextExpiry, sample.expiresAt);
        });
        if (!Number.isFinite(nextExpiry) || !listeners.size) return void (staleTimer = null);
        staleTimer = setTimeout(() => {
            staleTimer = null;
            const current = now();
            samples.forEach((sample, key) => {
                if (sample.expiresAt > current) return;
                samples.delete(key);
                notify(sample.subjectId, sample.field, 'stale');
            });
            scheduleStale();
        }, Math.max(0, nextExpiry - timestamp));
    };
    const publish = ({ subjectId = 'current', field, value, unit = null, timestamp = now(), ttlMs = 0 } = {}) => {
        const normalizedSubject = normalizeId(subjectId) || 'current';
        const normalizedField = normalizeId(field);
        if (!definitions.has(normalizedField)) throw new Error('condition_live_field_unknown');
        const observedAt = Number(timestamp);
        const ttl = Math.max(0, Number(ttlMs) || Number(definitions.get(normalizedField)?.ttlMs) || 0);
        samples.set(`${normalizedSubject}:${normalizedField}`, {
            subjectId: normalizedSubject,
            field: normalizedField,
            value,
            unit,
            observedAt,
            expiresAt: ttl ? observedAt + ttl : Infinity
        });
        notify(normalizedSubject, normalizedField, 'changed');
        scheduleStale();
    };
    const revoke = ({ subjectId = 'current', field } = {}) => {
        const normalizedSubject = normalizeId(subjectId) || 'current';
        const normalizedField = normalizeId(field);
        const removed = samples.delete(`${normalizedSubject}:${normalizedField}`);
        if (removed) notify(normalizedSubject, normalizedField, 'revoked');
        scheduleStale();
        return removed;
    };
    const read = (context, field) => {
        const subjectId = subjectIdOf(context);
        const sample = samples.get(`${subjectId}:${field}`) || samples.get(`current:${field}`);
        if (!sample) return { available: false, reasonCode: `${sourceId}_value_unavailable` };
        if (sample.expiresAt <= now()) {
            samples.delete(`${sample.subjectId}:${field}`);
            return { available: false, reasonCode: `${sourceId}_value_stale` };
        }
        return { available: true, value: sample.value, unit: sample.unit, observedAt: sample.observedAt };
    };
    const startConnector = () => {
        if (releaseConnector || typeof connector?.subscribe !== 'function') return;
        const release = connector.subscribe((sample) => publish(sample), (revocation) => revoke(revocation));
        releaseConnector = typeof release === 'function' ? release : null;
    };
    const stopConnector = () => {
        releaseConnector?.();
        releaseConnector = null;
    };
    const subscribe = (dependencies, callback) => {
        const relevant = (Array.isArray(dependencies) ? dependencies : []).some((entry) => (
            String(entry).startsWith(`${sourceId}.`)
        ));
        if (!relevant || typeof callback !== 'function') return () => {};
        listeners.add(callback);
        startConnector();
        scheduleStale();
        let active = true;
        return () => {
            if (!active) return false;
            active = false;
            listeners.delete(callback);
            if (!listeners.size) {
                stopConnector();
                if (staleTimer !== null) clearTimeout(staleTimer);
                staleTimer = null;
            }
            return true;
        };
    };
    return Object.freeze({ source: sourceId, fields: () => Array.from(definitions.values()), publish, revoke, read, subscribe });
}

const geolocationConnector = (geolocation, ttlMs) => ({
    subscribe(publish, revoke) {
        if (!geolocation || typeof geolocation.watchPosition !== 'function') return null;
        const watchId = geolocation.watchPosition(
            (position) => publish({
                subjectId: 'current',
                field: 'position',
                value: { latitude: position.coords.latitude, longitude: position.coords.longitude },
                unit: 'degrees',
                timestamp: position.timestamp,
                ttlMs
            }),
            () => revoke({ subjectId: 'current', field: 'position' }),
            { enableHighAccuracy: false, maximumAge: Math.floor(ttlMs / 2), timeout: ttlMs }
        );
        return () => geolocation.clearWatch?.(watchId);
    }
});

export function registerLiveConditionSources(registry, {
    geolocation = null,
    healthConnector = null,
    eventTarget = null,
    navigatorState = null,
    locationTtlMs = 60000,
    healthTtlMs = 15000,
    now
} = {}) {
    const location = createLiveConditionSource({
        source: 'location',
        fields: [{ field: 'position', type: 'location', unit: 'degrees', group: 'live' }],
        connector: geolocationConnector(geolocation, locationTtlMs),
        now
    });
    registry.registerSource({
        source: 'location',
        describe: (field) => field === 'distance'
            ? {
                source: 'location', field, type: 'number', unit: 'km', group: 'live',
                dependencies: ['location.position']
            }
            : location.fields().find((entry) => entry.field === field),
        discover: () => [
            ...location.fields(),
            {
                source: 'location', field: 'distance', type: 'number', unit: 'km', group: 'live',
                dependencies: ['location.position']
            }
        ],
        resolve: (context, field) => {
            if (field !== 'distance') return location.read(context, field);
            const current = location.read({ subjectId: 'current' }, 'position');
            const target = context?.targetLocation
                || context?.contact?.location
                || context?.contact?.properties?.location
                || context?.atome?.location
                || context?.atome?.properties?.location;
            const distance = current.available ? distanceKm(current.value, target) : null;
            return distance === null
                ? { available: false, reasonCode: 'location_distance_unavailable' }
                : { available: true, value: distance, unit: 'km' };
        },
        subscribe: location.subscribe
    });
    const health = createLiveConditionSource({
        source: 'health',
        fields: [{ field: 'heart_rate', type: 'number', unit: 'bpm', group: 'live', ttlMs: healthTtlMs }],
        connector: healthConnector,
        now
    });
    registry.registerSource({
        source: 'health',
        describe: (field) => health.fields().find((entry) => entry.field === field),
        discover: () => health.fields(),
        resolve: health.read,
        subscribe: health.subscribe
    });

    const subscribeEvents = (dependencies, prefix, names, callback) => {
        if (!eventTarget?.addEventListener || !dependencies.some((entry) => String(entry).startsWith(`${prefix}.`))) {
            return () => {};
        }
        names.forEach((name) => eventTarget.addEventListener(name, callback));
        let active = true;
        return () => {
            if (!active) return false;
            active = false;
            names.forEach((name) => eventTarget.removeEventListener(name, callback));
            return true;
        };
    };
    const online = () => navigatorState?.onLine !== false;
    const runtimeFields = [
        { source: 'runtime', field: 'online', type: 'boolean', group: 'live' }
    ];
    registry.registerSource({
        source: 'runtime',
        describe: (field) => runtimeFields.find((entry) => entry.field === field),
        discover: () => runtimeFields,
        resolve: (context, field) => field === 'online'
            ? { available: true, value: online() }
            : { available: false, reasonCode: 'runtime_value_unavailable' },
        subscribe: (dependencies, callback) => subscribeEvents(
            dependencies, 'runtime', ['online', 'offline'],
            () => callback({ dependencies: ['runtime.online'], reason: 'network_changed' })
        )
    });
    const presenceFields = [
        { source: 'presence', field: 'online', type: 'boolean', group: 'live' }
    ];
    registry.registerSource({
        source: 'presence',
        describe: (field) => presenceFields.find((entry) => entry.field === field),
        discover: () => presenceFields,
        resolve: (context, field) => field === 'online'
            ? { available: true, value: context?.presence?.online ?? online() }
            : { available: false, reasonCode: 'presence_value_unavailable' },
        subscribe: (dependencies, callback) => subscribeEvents(
            dependencies, 'presence', ['online', 'offline', 'squirrel:presence-changed'],
            (event) => callback({ dependencies: ['presence.online'], reason: event.type })
        )
    });
    const sessionValue = (field) => {
        const state = eventTarget?.__authCheckResult || {};
        if (field === 'authenticated') return state.authenticated === true;
        if (field === 'anonymous') return state.anonymous === true;
        if (field === 'user_id') return state.userId || eventTarget?.__currentUser?.id;
        return undefined;
    };
    const sessionFields = [
        { source: 'session', field: 'authenticated', type: 'boolean', group: 'live' },
        { source: 'session', field: 'anonymous', type: 'boolean', group: 'live' },
        { source: 'session', field: 'user_id', type: 'string', group: 'live' }
    ];
    registry.registerSource({
        source: 'session',
        describe: (field) => sessionFields.find((entry) => entry.field === field),
        discover: () => sessionFields,
        resolve: (context, field) => {
            const value = context?.session?.[field] ?? sessionValue(field);
            return value === undefined
                ? { available: false, reasonCode: 'session_value_unavailable' }
                : { available: true, value };
        },
        subscribe: (dependencies, callback) => subscribeEvents(
            dependencies, 'session',
            ['squirrel:auth-checked', 'squirrel:user-logged-in', 'squirrel:user-logged-out'],
            (event) => callback({
                dependencies: sessionFields.map((entry) => `session.${entry.field}`),
                reason: event.type
            })
        )
    });
    return Object.freeze({ location, health });
}

export { distanceKm };
