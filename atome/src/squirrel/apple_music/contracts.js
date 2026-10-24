import { validateParams } from '../ai/agent_gateway_normalize.js';

const text = { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' };
const id = { type: 'string', minLength: 1, maxLength: 200, pattern: '^[A-Za-z0-9._-]+$' };
const requestId = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,160}$' };
const scope = { type: 'string', enum: ['catalog', 'library'] };
const kind = { type: 'string', enum: ['song', 'playlist', 'artist'] };
const page = { limit: { type: 'integer', minimum: 1, maximum: 25 }, offset: { type: 'integer', minimum: 0, maximum: 10000 } };
export const APPLE_MUSIC_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'CONTEXT_CHANGED', 'HOST_UNSUPPORTED',
    'AUTHORIZATION_REQUIRED', 'PERMISSION_DENIED', 'SUBSCRIPTION_REQUIRED', 'PROVIDER_UNAVAILABLE', 'ITEM_NOT_FOUND',
    'AMBIGUOUS_SELECTION', 'NO_ACTIVE_MUSIC', 'OPERATION_UNCONFIRMED', 'OPERATION_CONFLICT', 'OPERATION_NOT_FOUND',
    'COMMIT_FAILED', 'VERSION_CONFLICT', 'BUSY', 'CURRENT_SONG_CHANGED']);
export const APPLE_MUSIC_WRITES = Object.freeze(['create_playlist', 'add_tracks', 'favorite_current']);
export const APPLE_MUSIC_ASSISTANT_INSTRUCTIONS = 'Apple Music: music listening requests ("mets ce morceau", "joue du Pink Floyd", "lance ma playlist") use apple_music.play with the user\'s query, kind song, artist or playlist, and scope catalog or library. Explicit YouTube or television requests keep their own tools. Music generation keeps ui.ai.audio.generate. A mere artist mention does not authorize playback. Discover Apple Music tools before reporting them unavailable. AUTHORIZATION_REQUIRED means call apple_music.authorize on an explicit listening/library request, then continue after native consent; PERMISSION_DENIED is not authorization to retry. AMBIGUOUS_SELECTION means propose the returned candidates and ask which one, never choose silently. Playlist names are resolved through list_playlists or search with scope library and kind playlist; duplicate names require clarification. Create playlists with apple_music.create_playlist, then resolve songs using apple_music.search and pass their returned IDs and original scope to apple_music.add_tracks. Never fabricate IDs. Pause, resume, next, previous and stop use the corresponding apple_music commands. No playlist deletion is offered. An OPERATION_UNCONFIRMED write must only be checked with operation_status using its request_id; never repeat it with another request_id. Say music is playing only when playback equals playing, and a playlist was created or changed only after a confirmed write. Opening a view or passing compilation is not playback proof. Requests such as mets ce morceau en favori or ajoute aux favoris use apple_music.favorite_current, which captures the actual current song on the device. Never search a replacement song or guess an ID. Report a favorite only if favorited is true; an unconfirmed favorite uses operation_status with the same request_id.';
const definitions = {
    favorite_current: [{ request_id: requestId }, [], 'write',
        'Add the currently identified Apple Music song to real Apple Music favorites. The device captures and verifies the exact song; never supply an invented ID. Confirm only favorited=true. If unconfirmed, read operation_status with the same request_id; never resubmit with a new ID.'],
    get_state: [{}, [], 'read', 'Read Apple Music authorization, device capabilities and actual playback without requesting permission.'],
    authorize: [{}, [], 'control', 'Request the native Apple Music consent on this iPhone or iPad. Never ask for an Apple password or token.'],
    search: [{ query: text, scope, kind, limit: page.limit }, ['query'], 'read',
        'Find Apple Music songs, artists or playlists in the catalogue or personal library. Returns native IDs and candidates; never starts playback.'],
    list_playlists: [page, [], 'read', 'Browse the authorized personal Apple Music playlists on this device, with pagination.'],
    list_library: [{ kind: { type: 'string', enum: ['song', 'playlist'] }, ...page }, ['kind'], 'read',
        'Browse songs or playlists in the authorized personal Apple Music library, with pagination and native IDs. Does not play or modify them.'],
    playlist_tracks: [{ id, scope, ...page }, ['id'], 'read', 'Read the songs of an Apple Music playlist. Does not play or modify it.'],
    play: [{ query: text, id, scope, kind }, [], 'control',
        'Play Apple Music on this iPhone/iPad: a song, playlist, or an artist’s top songs. Pass query with the user’s words, or an exact returned id with kind and scope. Ambiguous names return candidates to ask the user; never select a candidate yourself.'],
    resume: [{}, [], 'control', 'Resume the current Apple Music queue.'],
    pause: [{}, [], 'control', 'Pause Apple Music without clearing its queue.'],
    stop: [{}, [], 'control', 'Stop Apple Music playback.'],
    seek: [{ seconds: { type: 'number', minimum: 0, maximum: 86400 } }, ['seconds'], 'control', 'Move the current Apple Music song to a time, in seconds from its start.'],
    artwork: [{ ids: { type: 'array', minItems: 1, maxItems: 25, items: id, uniqueItems: true }, scope, size: { type: 'integer', minimum: 32, maximum: 600 } }, [], 'read',
        'Read song covers as image data: the given song IDs from their scope, or without ids the song playing now. Never changes playback.'],
    next: [{}, [], 'control', 'Skip to the next Apple Music track in the current queue.'],
    previous: [{}, [], 'control', 'Return to the previous Apple Music track in the current queue.'],
    create_playlist: [{ name: text, description: { type: 'string', maxLength: 1000 }, request_id: requestId }, ['name'], 'write',
        'Create an Apple Music playlist in the authorized library. Returns a durable operation request_id. If unconfirmed, read operation_status; never retry with another request_id. Does not start playback.'],
    add_tracks: [{ playlist_id: id, track_ids: { type: 'array', minItems: 1, maxItems: 25, items: id, uniqueItems: true },
        scope, request_id: requestId }, ['playlist_id', 'track_ids'], 'write',
    'Append verified song IDs to a library Apple Music playlist. scope identifies where the songs came from. If unconfirmed, read operation_status; never resend with a fresh request_id.'],
    operation_status: [{ request_id: requestId }, ['request_id'], 'read', 'Read the durable receipt of an Apple Music playlist write; never repeats the external operation.']
};
export const APPLE_MUSIC_ITEM_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['id', 'name', 'kind', 'scope'], properties: { id, name: { type: 'string' }, kind, scope,
        artist: { type: 'string' }, artwork_url: { type: 'string' }, duration: { type: 'number' } } });
export const APPLE_MUSIC_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, access, description]]) => Object.freeze({
    action, name: 'apple_music.' + action, access, description, capability: 'apple_music.' + access,
    // External playback/writes are never replayed as scene mutations. Write receipts use Atome.commit.
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' },
        error: { type: 'string', enum: APPLE_MUSIC_ERRORS }, playback: { type: 'string' }, authorization: { type: 'string' },
        current_song_id: id, current_entry_id: { type: 'string' }, song_id: id, favorited: { type: 'boolean' },
        supported: { type: 'boolean' }, items: { type: 'array', items: APPLE_MUSIC_ITEM_SCHEMA },
        candidates: { type: 'array', items: APPLE_MUSIC_ITEM_SCHEMA }, playlist_id: id, request_id: requestId,
        status: { type: 'string' }, has_more: { type: 'boolean' }, title: { type: 'string' }, artist: { type: 'string' },
        duration: { type: 'number' }, position: { type: 'number' },
        subscription: { type: 'boolean' }, capabilities: { type: 'array', items: { type: 'string' } } } }
})));
export function validateAppleMusicInput(action, input = {}) {
    const command = APPLE_MUSIC_COMMANDS.find(entry => entry.action === action);
    if (!command || !validateParams(command.input_schema, input).ok) return 'INVALID_ARGUMENT';
    if (action === 'play' && (!!input.id === !!input.query || (input.id && !input.kind))) return 'INVALID_ARGUMENT';
    return null;
}
export const appleMusicError = error => APPLE_MUSIC_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'PROVIDER_UNAVAILABLE';
