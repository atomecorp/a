import { validateParams } from '../ai/agent_gateway_normalize.js';
// Accent-, case- and space-insensitive matching of channel names and queries.
export const normalizeTvQuery = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const TV_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'CHANNEL_NOT_FOUND', 'AMBIGUOUS_CHANNEL',
    'AUTH_REQUIRED', 'GEO_BLOCKED', 'PROVIDER_UNAVAILABLE', 'DRM_UNSUPPORTED', 'EMBED_NOT_ALLOWED',
    'EXTERNAL_ONLY', 'NOT_CONFIGURED', 'RIGHTS_NOT_VERIFIED', 'USER_GESTURE_REQUIRED',
    'FULLSCREEN_UNSUPPORTED', 'EPG_UNAVAILABLE', 'PLAYBACK_FAILED', 'NO_ACTIVE_CLIENT',
    'AMBIGUOUS_CLIENT', 'NO_ACTIVE_CHANNEL', 'CANCELLED']);
export const normalizeTvError = error => TV_ERRORS.includes(error) ? error : 'PLAYBACK_FAILED';
// One contract for runtime V2, AI discovery and direct MCP calls.
const text = { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' };
const date = { type: 'string', format: 'date-time', maxLength: 40 };
const page = { cursor: { type: 'string', maxLength: 32 }, limit: { type: 'integer', minimum: 1, maximum: 200 } };
const shapes = {
    list_channels: [{ category: text, query: { type: 'string', maxLength: 200 }, ...page }, [], 'List television channels of the public catalogue (Free-TV, IPTV-org). With query: matching channels of every country, the user\'s country first; without: the country being browsed, favourites first. Does not start playback.'],
    find_channel: [{ query: text }, ['query'], 'Find television channels by name in every country (e.g. CNN, BBC News, Rai 1); returns candidates, does not start playback.'],
    open_channel: [{ channel: text, fullscreen: { type: 'boolean' } }, ['channel'], 'Put on a television channel by its exact name (e.g. TF1, France 3, franceinfo, CNN, BBC News): it plays in place on a TV object of the current project. Without an exact name it returns CHANNEL_NOT_FOUND or AMBIGUOUS_CHANNEL with candidates to propose to the user; never open a candidate without confirmation. fullscreen enlarges playback to the whole project view.'],
    close: [{}, [], 'Stop and close television, releasing playback resources.'],
    set_fullscreen: [{ enabled: { type: 'boolean' } }, ['enabled'], 'Enlarge television playback to the whole project view (true) or return it to its TV object (false); playback continues.'],
    get_state: [{}, [], 'Read actual television playback and presentation, including required user actions.'],
    now: [{ channel: text }, [], 'Read the current TV programme from authorized EPG; does not open television.'],
    next: [{ channel: text }, [], 'Read the next programme, not the next channel; does not open television.'],
    get_epg: [{ channel: text, from: date, to: date }, ['channel', 'from', 'to'], 'Read authorized television EPG in an explicit interval of at most seven days.'],
    search_program: [{ query: text, from: date, to: date, ...page }, ['query'], 'Search authorized EPG; missing interval defaults to the next 24 hours.']
};
const programSchema = { type: 'object', additionalProperties: false,
    required: ['id', 'channel_id', 'title', 'start', 'end', 'provenance', 'fetched_at', 'expires_at'], properties: {
        id: text, channel_id: text, title: { type: 'string' }, description: { type: 'string' },
        start: date, end: date, provenance: text, fetched_at: date, expires_at: date
    } };
const channelSchema = { type: 'object', additionalProperties: false,
    required: ['id', 'name', 'aliases', 'categories', 'availability'], properties: {
        id: text, name: text, aliases: { type: 'array', items: text }, categories: { type: 'array', items: text },
        current_program: { anyOf: [programSchema, { type: 'null' }] }, country: text, language: text, type: text, logo: { type: ['string', 'null'] }, availability: text
    } };
export const TV_OUTPUT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['ok'], properties: {
    ok: { type: 'boolean' }, error: { type: 'string', enum: TV_ERRORS }, channel_id: { type: ['string', 'null'] },
    operation: { type: 'string' }, playback: { type: 'string' }, fullscreen: { type: 'boolean' },
    system_fullscreen: { type: 'boolean' }, action_required: { type: ['string', 'null'] },
    channels: { type: 'array', items: channelSchema }, candidates: { type: 'array', items: channelSchema },
    programs: { type: 'array', items: programSchema }, program: programSchema, cursor: { type: ['string', 'null'] }
} });
export const TV_COMMANDS = Object.freeze(Object.entries(shapes).map(([action, [properties, required, description]]) => Object.freeze({
    action, name: 'tv.' + action, description,
    capability: ['open_channel', 'close', 'set_fullscreen'].includes(action) ? 'tv.control' : 'tv.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required }, output_schema: TV_OUTPUT_SCHEMA
})));
export function validateTvInput(action, input = {}) {
    const schema = TV_COMMANDS.find(command => command.action === action)?.input_schema;
    return schema && validateParams(schema, input).ok ? null : 'INVALID_ARGUMENT';
}
export const validateTvOutput = output => validateParams(TV_OUTPUT_SCHEMA, output).ok ? null : 'PLAYBACK_FAILED';
export function tvPeriod(input, now = Date.now()) {
    const iso = value => {
        if (typeof value !== 'string') return false;
        const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
        if (!parts) return false;
        const [, y, m, d, h, min, sec] = parts.map(Number);
        return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
            && h <= 23 && min <= 59 && sec <= 59 && Number.isFinite(Date.parse(value));
    };
    if ((input.from != null && !iso(input.from)) || (input.to != null && !iso(input.to))) return null;
    const from = input.from == null ? now : Date.parse(input.from);
    const to = input.to == null ? from + 86400000 : Date.parse(input.to);
    return to > from && to - from <= 7 * 86400000 ? { from, to } : null;
}
export function tvPage(items, { cursor = '0', limit = 50 } = {}) {
    if (!/^(0|[1-9][0-9]*)$/.test(cursor)) return { ok: false, error: 'INVALID_ARGUMENT' };
    const offset = Number(cursor);
    if (!Number.isSafeInteger(offset) || offset > items.length) return { ok: false, error: 'INVALID_ARGUMENT' };
    return { ok: true, items: items.slice(offset, offset + limit), cursor: offset + limit < items.length ? String(offset + limit) : null };
}
