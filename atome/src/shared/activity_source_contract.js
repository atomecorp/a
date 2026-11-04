/** This device's connection to its health store as a source of activities (D18 improvement 6): Apple Health on iOS,
 *  Health Connect on Android. One record per person, source and device, because a store and its permissions belong to
 *  one device: whether the person connected it, the categories they chose to import (the store's own sheet then grants
 *  each one, or not), the store's incremental position (`anchor`: an HKQueryAnchor, a Health Connect changes token or
 *  history page; opaque here), and the moment of the last complete synchronization. Disconnecting keeps every imported
 *  activity (#activity_import_contract.js) and forgets the anchor, so a new connection reads the history again without
 *  duplicating it. No health value is ever written here. */
export const ACTIVITY_SOURCE_STORES = Object.freeze(['apple_health', 'health_connect']);
// What the person may choose to import: the sessions themselves, and the measures each session may carry.
export const ACTIVITY_SOURCE_CATEGORIES = Object.freeze(['workouts', 'heart_rate', 'active_energy', 'distance', 'steps']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ANCHOR_MAX = 8192;
const iso = { type: 'string' };
export const ACTIVITY_SOURCE_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'source', 'device', 'connected', 'categories'], properties: {
        version: { type: 'number', enum: [1] }, source: { type: 'string', enum: ACTIVITY_SOURCE_STORES },
        device: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' }, connected: { type: 'boolean' },
        categories: { type: 'array', maxItems: ACTIVITY_SOURCE_CATEGORIES.length, items: { type: 'string', enum: ACTIVITY_SOURCE_CATEGORIES } },
        anchor: { type: 'string', maxLength: ANCHOR_MAX }, history_done: { type: 'boolean' },
        connected_at: iso, disconnected_at: iso, last_sync_at: iso
    } });

const invalid = () => { throw Object.assign(new Error('activity_source_invalid'), { code: 'activity_source_invalid' }); };
export const validateActivitySource = value => {
    const props = ACTIVITY_SOURCE_SCHEMA.properties;
    if (!value || typeof value !== 'object' || value.version !== 1 || Object.keys(value).some(key => !Object.hasOwn(props, key))
        || !ACTIVITY_SOURCE_STORES.includes(value.source) || !/^[A-Za-z0-9_-]{1,64}$/.test(value.device) || typeof value.connected !== 'boolean'
        || !Array.isArray(value.categories) || new Set(value.categories).size !== value.categories.length
        || value.categories.some(category => !ACTIVITY_SOURCE_CATEGORIES.includes(category))
        || (value.anchor !== undefined && (typeof value.anchor !== 'string' || !value.anchor || value.anchor.length > ANCHOR_MAX))
        || (value.history_done !== undefined && typeof value.history_done !== 'boolean')
        || ['connected_at', 'disconnected_at', 'last_sync_at'].some(key => value[key] !== undefined && !(typeof value[key] === 'string' && ISO.test(value[key])))) invalid();
    return value;
};
export const activitySourceId = (actor, source, device) => `activity_source:${encodeURIComponent(actor)}:${source}:${device}`;
