const EVENT_META_PROPERTY_KEYS = new Set([
    'type',
    'atome_type',
    'kind',
    'parent_id',
    'parentId',
    'project_id',
    'projectId',
    'owner_id',
    'ownerId',
    'owner',
    '__deleted',
    'deleted_at'
]);

const EVENT_INTERNAL_PROPERTY_KEYS = new Set(['__deleted', 'deleted_at']);

function parseEventPayload(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export function resolveEventPayload(event) {
    if (!event || typeof event !== 'object') return null;
    if (event.payload !== undefined) return event.payload;
    const props = event.props || event.properties || event.patch || null;
    return props && typeof props === 'object' ? { props } : null;
}

export function extractEventPatch(kind, payload, timestamp = null) {
    if (!kind) return null;
    const normalizedKind = String(kind).toLowerCase();
    if (normalizedKind === 'delete') {
        return { __deleted: true, deleted_at: timestamp || new Date().toISOString() };
    }
    const source = parseEventPayload(payload);
    if (normalizedKind === 'restore') {
        const restored = source && typeof source === 'object'
            ? (source.props || source.properties || source.patch || source.delta || {})
            : {};
        return {
            ...(restored && typeof restored === 'object' && !Array.isArray(restored) ? restored : {}),
            __deleted: false,
            deleted_at: null
        };
    }
    if (!source || typeof source !== 'object') return null;
    const patch = source.props || source.properties || source.patch || source.delta || null;
    return patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : null;
}

export function eventPropertyPatch(event) {
    if (!event || typeof event !== 'object') return null;
    return extractEventPatch(
        String(event.kind || '').trim(),
        resolveEventPayload(event),
        event.ts || event.timestamp || null
    );
}

export function eventDeletedPropertyKeys(event) {
    const payload = parseEventPayload(resolveEventPayload(event));
    const keys = payload?.delete_keys || payload?.deleteKeys || [];
    if (!Array.isArray(keys)) return [];
    return Array.from(new Set(keys
        .map((key) => String(key || '').trim())
        .filter((key) => key && !EVENT_META_PROPERTY_KEYS.has(key))));
}

export function eventExpectedPropertyVersions(event) {
    const payload = parseEventPayload(resolveEventPayload(event));
    const source = payload?.expected_versions || payload?.expectedVersions || {};
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    const versions = {};
    for (const [rawKey, rawVersion] of Object.entries(source)) {
        const key = String(rawKey || '').trim();
        const version = Number(rawVersion);
        if (!key || EVENT_META_PROPERTY_KEYS.has(key)) continue;
        if (Number.isInteger(version) && version >= 0) versions[key] = version;
    }
    return versions;
}

export function eventTouchedPropertyKeys(event) {
    const patch = eventPropertyPatch(event);
    const setKeys = patch
        ? Object.keys(patch).filter((key) => !EVENT_INTERNAL_PROPERTY_KEYS.has(key))
        : [];
    return Array.from(new Set([...setKeys, ...eventDeletedPropertyKeys(event)]));
}

const stableValue = (value) => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};

const actorIdentity = (actor) => {
    const value = parseEventPayload(actor);
    if (!value || typeof value !== 'object') return value || null;
    return value.id || value.user_id || value.userId || null;
};

export function eventIdempotencyIntent(event) {
    return stableValue({
        kind: String(event?.kind || ''),
        atome_id: event?.atome_id || event?.atomeId || null,
        project_id: event?.project_id || event?.projectId || null,
        tx_id: event?.tx_id || event?.txId || null,
        gesture_id: event?.gesture_id || event?.gestureId || null,
        actor_id: actorIdentity(event?.actor),
        props: eventPropertyPatch(event) || {},
        delete_keys: eventDeletedPropertyKeys(event),
        expected_versions: eventExpectedPropertyVersions(event)
    });
}

export function assertIdempotentEventReplay(existing, incoming) {
    const left = JSON.stringify(eventIdempotencyIntent(existing));
    const right = JSON.stringify(eventIdempotencyIntent(incoming));
    if (left === right) return;
    const error = new Error('event_id_conflict');
    error.code = 'event_id_conflict';
    throw error;
}

export function stripEventMetaPatch(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return {};
    const filtered = {};
    for (const [key, value] of Object.entries(patch)) {
        if (!EVENT_META_PROPERTY_KEYS.has(key)) filtered[key] = value;
    }
    return filtered;
}

export { EVENT_META_PROPERTY_KEYS };
