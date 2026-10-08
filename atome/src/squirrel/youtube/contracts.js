import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for runtime V2, AI discovery and direct MCP calls, like TV.
// The YouTube tool plays a video in place on a YouTube Atome of the project.
export const YOUTUBE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'VIDEO_NOT_FOUND', 'NO_ACTIVE_VIDEO',
    'youtube_search_not_configured', 'youtube_search_unavailable', 'youtube_search_rate_limited',
    'youtube_search_quota_guard', 'youtube_search_quota_or_permission', 'youtube_video_commit_failed',
    'youtube_object_create_failed', 'project_id_missing', 'CANCELLED']);

const text = { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' };
const videoId = { type: 'string', pattern: '^[A-Za-z0-9_-]{11}$' };
const shapes = {
    search: [{ query: text, limit: { type: 'integer', minimum: 1, maximum: 10 } }, ['query'], 'read',
        'Search YouTube videos by words (artist, song, show); returns videos to propose, does not start playback.'],
    play: [{ query: text, video_id: videoId, fullscreen: { type: 'boolean' } }, [], 'control',
        'Play a YouTube video in place on a YouTube object of the current project: the given video_id, or the best result for query (the user\'s words, e.g. "Pink Floyd Comfortably Numb"). fullscreen enlarges playback to the whole project view.'],
    close: [{}, [], 'control', 'Stop YouTube playback; the YouTube object stays in the project.'],
    set_fullscreen: [{ enabled: { type: 'boolean' } }, ['enabled'], 'control',
        'Enlarge YouTube playback to the whole project view (true) or return it to its object (false); playback continues.']
};
const videoSchema = { type: 'object', additionalProperties: false, required: ['id', 'title'], properties: {
    id: videoId, title: { type: 'string' }, channel: { type: 'string' } } };
export const YOUTUBE_OUTPUT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['ok'], properties: {
    ok: { type: 'boolean' }, error: { type: 'string', enum: YOUTUBE_ERRORS }, videos: { type: 'array', items: videoSchema },
    video_id: { type: ['string', 'null'] }, title: { type: 'string' }, playback: { type: 'string' }, fullscreen: { type: 'boolean' }
} });
export const YOUTUBE_COMMANDS = Object.freeze(Object.entries(shapes).map(([action, [properties, required, access, description]]) => Object.freeze({
    action, name: 'youtube.' + action, description, capability: 'youtube.' + access,
    input_schema: { type: 'object', additionalProperties: false, properties, required }, output_schema: YOUTUBE_OUTPUT_SCHEMA
})));
export function validateYoutubeInput(action, input = {}) {
    const schema = YOUTUBE_COMMANDS.find(command => command.action === action)?.input_schema;
    if (!schema || !validateParams(schema, input).ok) return 'INVALID_ARGUMENT';
    return action === 'play' && !input.query && !input.video_id ? 'INVALID_ARGUMENT' : null;
}
export const normalizeYoutubeError = error => YOUTUBE_ERRORS.includes(error) ? error : 'youtube_search_unavailable';
