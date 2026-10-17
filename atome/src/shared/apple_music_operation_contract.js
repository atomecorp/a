// The external library owns playlists and favorites. This Atome owns only the exact request and its receipt.
export const APPLE_MUSIC_OPERATION_TYPE = Object.freeze({ type: 'apple_music_operation', kind: 'data_model', schema: {
    request: { type: 'object', additionalProperties: false, required: ['action', 'input'], properties: {
        action: { type: 'string', enum: ['create_playlist', 'add_tracks', 'favorite_current'] },
        input: { type: 'object', additionalProperties: false, properties: {
            name: { type: 'string', maxLength: 200 }, description: { type: 'string', maxLength: 1000 },
            playlist_id: { type: 'string', maxLength: 200 }, scope: { type: 'string', enum: ['catalog', 'library'] },
            song_id: { type: 'string', maxLength: 200 }, entry_id: { type: 'string', maxLength: 200 },
            track_ids: { type: 'array', maxItems: 25, items: { type: 'string', maxLength: 200 } }
        } }
    } },
    status: { type: 'string', enum: ['prepared', 'submitting', 'completed', 'failed', 'unconfirmed'] },
    result: { type: 'object', additionalProperties: false, required: ['ok'], properties: {
        ok: { type: 'boolean' }, error: { type: 'string', maxLength: 80 }, playlist_id: { type: 'string', maxLength: 200 },
        song_id: { type: 'string', maxLength: 200 }, favorited: { type: 'boolean' }
    } },
    revision: { type: 'integer', minimum: 0 }, access: { type: 'string', enum: ['private'] },
    visibility: { type: 'string', enum: ['private'] }
} });
