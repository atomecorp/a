import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract per online video service (YouTube, PeerTube), for runtime V2,
// AI discovery and direct MCP calls, like TV. The service plays a video in
// place on one of its video Atomes of the project. `refField` names the input
// that designates one video (`video_id`, `video_url`).
export const createOnlineVideoContract = ({ key, label, refField, refSchema, searchErrors }) => {
    const errors = Object.freeze(['INVALID_ARGUMENT', 'VIDEO_NOT_FOUND', 'NO_ACTIVE_VIDEO',
        ...searchErrors.map((code) => `${key}_search_${code}`), `${key}_video_commit_failed`,
        `${key}_object_create_failed`, 'project_id_missing', 'CANCELLED']);
    const text = { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' };
    const shapes = {
        search: [{ query: text, limit: { type: 'integer', minimum: 1, maximum: 10 } }, ['query'], 'read',
            `Search ${label} videos by words (artist, song, show); returns videos to propose, does not start playback.`],
        play: [{ query: text, [refField]: refSchema, fullscreen: { type: 'boolean' } }, [], 'control',
            `Play a ${label} video in place on a ${label} object of the current project: the given ${refField}, or the best result for query (the user's words, e.g. "Pink Floyd Comfortably Numb"). fullscreen enlarges playback to the whole project view.`],
        close: [{}, [], 'control', `Stop ${label} playback; the ${label} object stays in the project.`],
        set_fullscreen: [{ enabled: { type: 'boolean' } }, ['enabled'], 'control',
            `Enlarge ${label} playback to the whole project view (true) or return it to its object (false); playback continues.`]
    };
    const videoSchema = { type: 'object', additionalProperties: false, required: ['id', 'title'], properties: {
        id: refSchema, title: { type: 'string' }, channel: { type: 'string' } } };
    const outputSchema = Object.freeze({ type: 'object', additionalProperties: false, required: ['ok'], properties: {
        ok: { type: 'boolean' }, error: { type: 'string', enum: errors }, videos: { type: 'array', items: videoSchema },
        [refField]: { type: ['string', 'null'] }, title: { type: 'string' }, playback: { type: 'string' }, fullscreen: { type: 'boolean' }
    } });
    const commands = Object.freeze(Object.entries(shapes).map(([action, [properties, required, access, description]]) => Object.freeze({
        action, name: `${key}.${action}`, description, capability: `${key}.${access}`,
        input_schema: { type: 'object', additionalProperties: false, properties, required }, output_schema: outputSchema
    })));
    const validate = (action, input = {}) => {
        const schema = commands.find((command) => command.action === action)?.input_schema;
        if (!schema || !validateParams(schema, input).ok) return 'INVALID_ARGUMENT';
        return action === 'play' && !input.query && !input[refField] ? 'INVALID_ARGUMENT' : null;
    };
    const normalizeError = (error) => (errors.includes(error) ? error : `${key}_search_unavailable`);
    return Object.freeze({ errors, commands, outputSchema, validate, normalizeError, refField });
};
