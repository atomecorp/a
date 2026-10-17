import { validateParams } from '../ai/agent_gateway_normalize.js';

export const MUSIC_PROVIDERS = Object.freeze(['spotify', 'deezer']);
export const MUSIC_WRITES = Object.freeze(['create_playlist', 'add_tracks', 'favorite_current']);
export class MusicFailure extends Error {
    constructor(code, { uncertain = false, retryAfter = null } = {}) {
        super(code); this.code = code; this.uncertain = uncertain; this.retryAfter = retryAfter;
    }
}
export const MUSIC_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'CONTEXT_CHANGED', 'NOT_CONFIGURED',
    'DEVELOPER_ACCESS_REQUIRED', 'AUTHORIZATION_REQUIRED', 'PERMISSION_DENIED', 'AUTHORIZATION_EXPIRED', 'CANCELLED',
    'USER_GESTURE_REQUIRED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_REJECTED', 'RATE_LIMITED', 'SUBSCRIPTION_REQUIRED',
    'NO_ACTIVE_DEVICE', 'NO_ACTIVE_MUSIC', 'CURRENT_SONG_CHANGED', 'AMBIGUOUS_SELECTION', 'ITEM_NOT_FOUND',
    'OPERATION_UNCONFIRMED', 'OPERATION_CONFLICT', 'OPERATION_NOT_FOUND', 'VERSION_CONFLICT', 'COMMIT_FAILED']);
const provider = { type: 'string', enum: MUSIC_PROVIDERS };
const id = { type: 'string', pattern: '^[A-Za-z0-9]{1,100}$' };
const text = { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' };
const requestId = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,160}$' };
const attempt = { type: 'string', pattern: '^[a-f0-9]{32}$' };
const kind = { type: 'string', enum: ['song', 'playlist', 'artist'] };
const page = { limit: { type: 'integer', minimum: 1, maximum: 10 }, offset: { type: 'integer', minimum: 0, maximum: 10000 } };
export const MUSIC_ITEM_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['id', 'name', 'kind'],
    properties: { id, name: { type: 'string' }, kind, artist: { type: 'string' } } });
const device = { type: 'object', properties: { id: { type: ['string', 'null'] }, name: { type: 'string' },
    active: { type: 'boolean' }, restricted: { type: 'boolean' } }, additionalProperties: false };
const shapes = {
    get_state: [{}, [], 'read', 'Read Spotify or Deezer connection readiness and actual provider capabilities. Never requests consent or starts music. Deezer remains unavailable without a verified developer contract.'],
    connect: [{}, [], 'control', 'Start Spotify OAuth consent. Returns an official authorization URL and attempt_id; the user must open it. Never ask for passwords or tokens.'],
    await_connection: [{ attempt_id: attempt }, ['attempt_id'], 'read', 'Wait on the authenticated socket for a specific OAuth attempt. No polling.'],
    cancel_connection: [{ attempt_id: attempt }, ['attempt_id'], 'control', 'Cancel this account’s pending music authorization attempt.'],
    disconnect: [{}, [], 'control', 'Remove the music connection from atome; does not stop playback or claim provider-side token revocation.'],
    search: [{ query: text, kind, ...page }, ['query'], 'read', 'Search the provider catalog for songs, artists or playlists. Does not play; keep returned IDs.'],
    open_item: [{ id, kind }, ['id', 'kind'], 'control', 'Return the official page-opening intention for an exact catalog item. Opening it is not proof of playback. Deezer supports public song search and page links only; no private API access is implied.'],
    list_library: [page, [], 'read', 'Browse the authorized user’s saved songs. No library mirror is persisted.'],
    list_playlists: [page, [], 'read', 'Browse the authorized user’s playlists.'],
    playlist_tracks: [{ id, ...page }, ['id'], 'read', 'Read accessible playlist items by exact provider ID.'],
    devices: [{}, [], 'read', 'List Spotify Connect playback devices. This is not a local atome audio player.'],
    play: [{ id, kind, query: text, device_id: id }, [], 'control', 'Play an exact returned ID or resolve the user query. Ambiguous results require user selection. Uses a Spotify device; Premium required. Returns opened_unconfirmed unless actual playback is observed.'],
    resume: [{ device_id: id }, [], 'control', 'Resume the Spotify device queue.'],
    pause: [{ device_id: id }, [], 'control', 'Pause playback on the Spotify device.'],
    next: [{ device_id: id }, [], 'control', 'Skip to the next track on the Spotify device.'],
    previous: [{ device_id: id }, [], 'control', 'Return to the previous track on the Spotify device.'],
    create_playlist: [{ name: text, description: { type: 'string', maxLength: 1000 }, request_id: requestId }, ['name'], 'write', 'Create a private Spotify playlist with a durable request/receipt. Never repeat an unconfirmed write.'],
    add_tracks: [{ playlist_id: id, track_ids: { type: 'array', minItems: 1, maxItems: 25, uniqueItems: true, items: id }, request_id: requestId },
        ['playlist_id', 'track_ids'], 'write', 'Append exact song IDs to an authorized playlist, with a durable request/receipt. Never repeat an unconfirmed write.'],
    favorite_current: [{ request_id: requestId }, [], 'write', 'Capture and save the actual current Spotify song, then verify its saved state. Never search a replacement.'],
    operation_status: [{ request_id: requestId }, ['request_id'], 'read', 'Read a private durable music receipt; never resends the provider write.']
};
export const MUSIC_COMMANDS = Object.freeze(Object.entries(shapes).map(([action, [properties, required, access, description]]) => Object.freeze({
    action, name: 'music.' + action, access, description, capability: 'music.' + access,
    input_schema: { type: 'object', additionalProperties: false, properties: { provider, ...properties }, required: ['provider', ...required] },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: MUSIC_ERRORS },
        provider, state: { type: 'string' }, configured: { type: 'boolean' }, supported: { type: 'boolean' },
        playback: { type: 'string' }, status: { type: 'string' }, request_id: requestId, attempt_id: attempt,
        authorization_url: { type: 'string' }, capabilities: { type: 'array', items: { type: 'string' } },
        items: { type: 'array', items: { anyOf: [MUSIC_ITEM_SCHEMA, device] } }, candidates: { type: 'array', items: MUSIC_ITEM_SCHEMA },
        current_song: { anyOf: [MUSIC_ITEM_SCHEMA, { type: 'null' }] }, device: { anyOf: [device, { type: 'null' }] },
        identity: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' } } },
        account: { type: 'object' }, cancelled: { type: 'boolean' }, provider_revoked: { type: 'boolean' },
        playlist_id: id, song_id: id, favorited: { type: 'boolean' }, has_more: { type: 'boolean' }, expires_at: { type: 'number' }, url: { type: 'string' } } }
})));
export function validateMusicInput(action, input = {}) {
    const schema = MUSIC_COMMANDS.find(command => command.action === action)?.input_schema;
    if (!schema || !validateParams(schema, input).ok) return 'INVALID_ARGUMENT';
    if (action === 'play' && (!!input.id === !!input.query || (input.id && !input.kind))) return 'INVALID_ARGUMENT';
    return null;
}
export const musicError = error => {
    const code = error?.code || error?.message || error;
    if (MUSIC_ERRORS.includes(code)) return code;
    if (code === 'not_authenticated') return 'AUTH_REQUIRED';
    if (code === 'provider_principal_changed') return 'CONTEXT_CHANGED';
    if (code === 'provider_cancelled' || code === 'social_cancelled') return 'CANCELLED';
    if (code === 'social_authorization_expired') return 'AUTHORIZATION_EXPIRED';
    if (code === 'social_authorization_denied') return 'PERMISSION_DENIED';
    return 'PROVIDER_UNAVAILABLE';
};
export const MUSIC_ASSISTANT_INSTRUCTIONS = 'Explicit Spotify or Deezer requests use music.* with provider spotify or deezer. Call music.get_state to check readiness. Never route those requests to Apple Music or YouTube. Deezer may report DEVELOPER_ACCESS_REQUIRED. A missing configuration or consent is not successful playback. music.connect returns an authorization URL for the user, never a token; music.await_connection waits for its attempt_id. Playback controls a Spotify device, not an atome decoder. Ask the user to choose AMBIGUOUS_SELECTION candidates; never pick an artist’s top song as a substitute. External writes retain request_id; OPERATION_UNCONFIRMED or submitting means only read music.operation_status with that ID, never repeat with a new request_id. Favorite requests use music.favorite_current. Confirm only explicit verified results; opened_unconfirmed is not playing.';
