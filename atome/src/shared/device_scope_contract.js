/** « This device only » (decision Q70, 31 Oct. 2026): an Atome whose id lies in the `device:` namespace is account-global,
 * committed through the one pipeline (`window.Atome.commit`), kept in this device's local store and history, and never
 * sent nor synchronized. The id carries the scope, so every layer that only sees an id (an outbox row, a state, a
 * bootstrap pass, an adoption payload) knows it: the browser workspace never queues it, Tauri's Axum sync worker and the
 * iOS outbox never enqueue it, and Fastify refuses it. The health profile lives there. */
export const DEVICE_ATOME_PREFIX = 'device:';
export const DEVICE_SCOPE = 'device';

export const isDeviceAtomeId = id => typeof id === 'string' && id.toLowerCase().startsWith(DEVICE_ATOME_PREFIX);
/** `device:<part>:<part>…`, each part encoded; at least one part. */
export const deviceAtomeId = (...parts) => {
    if (!parts.length || parts.some(part => typeof part !== 'string' || !part)) throw new Error('device_atome_id_invalid');
    return DEVICE_ATOME_PREFIX + parts.map(encodeURIComponent).join(':');
};
/** An event's scope as its id says it. A `device:` atome is account-global: its events carry the `global` scope every
 * backend already knows (no project, no containment) and only its id keeps it off every server; asking another scope for
 * it, or `device` for another id, is refused. */
export const deviceEventScope = (atomeId, scope) => {
    if (isDeviceAtomeId(atomeId)) {
        if (scope && scope !== DEVICE_SCOPE && scope !== 'global') throw new Error('device_scope_mismatch');
        return 'global';
    }
    if (scope === DEVICE_SCOPE) throw new Error('device_scope_id_required');
    return scope || null;
};
