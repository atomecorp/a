/** What a person declares for a health monitor (a glass of water): typed values in the monitor's own unit, never
 *  converted, one record per monitor and civil day. A withdrawn entry stays, dated: nothing declared is erased. */
export const HEALTH_DECLARATION_METHODS = Object.freeze(['declared']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
export const HEALTH_DECLARATION_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'monitor_id', 'day', 'entries'], properties: {
        version: { type: 'number', enum: [1] }, monitor_id: { type: 'string', minLength: 1 },
        day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        entries: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: false,
            required: ['id', 'value', 'unit', 'method', 'at'], properties: {
                id: { type: 'string', minLength: 1, maxLength: 80 }, value: { type: 'number', exclusiveMinimum: 0 },
                unit: { type: 'string', minLength: 1 }, method: { type: 'string', enum: HEALTH_DECLARATION_METHODS },
                at: { type: 'string' }, withdrawn_at: { type: 'string' }
            } } }
    } });

const two = value => String(value).padStart(2, '0');
/** The civil day (device calendar) an instant falls in, as YYYY-MM-DD. */
export const healthDeclarationDay = ms => { const date = new Date(ms); return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`; };
export const healthDeclarationId = (actor, monitorId, day) => `health_declaration:${encodeURIComponent(actor)}:${monitorId}:${day}`;

/** A day's record checked against its monitor (#squirrel/health/health_catalog.js `declaration`). */
export const validateHealthDeclaration = (record, monitor) => {
    const limit = monitor?.declaration;
    const valid = limit && record?.version === 1 && record.monitor_id === monitor.id && /^\d{4}-\d{2}-\d{2}$/.test(record.day)
        && Array.isArray(record.entries) && record.entries.length <= 200
        && Object.keys(record).every(key => Object.hasOwn(HEALTH_DECLARATION_SCHEMA.properties, key))
        && record.entries.every(entry => Object.keys(entry).every(key => Object.hasOwn(HEALTH_DECLARATION_SCHEMA.properties.entries.items.properties, key))
            && typeof entry.id === 'string' && entry.id && Number.isFinite(entry.value) && entry.value > 0 && entry.value <= limit.max
            && entry.unit === monitor.unit && HEALTH_DECLARATION_METHODS.includes(entry.method) && ISO.test(entry.at)
            && healthDeclarationDay(Date.parse(entry.at)) === record.day
            && (entry.withdrawn_at === undefined || ISO.test(entry.withdrawn_at)));
    if (!valid) throw new Error('health_declaration_invalid');
    return record;
};
/** The entries still counted (not withdrawn). */
export const healthDeclarationEntries = record => (record?.entries || []).filter(entry => !entry.withdrawn_at);
