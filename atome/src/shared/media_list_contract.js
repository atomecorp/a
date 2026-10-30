// eVe's media lists (user, 30 Oct. 2026, BUG-033 / Q23): one Atome per list, synced with the account, holding
// mixed entries — the person's own files (a sound, a video), a music service's song, an online video. A list
// was made for a kind (`mixed` from Médias, `audio` from Musique or Audio, `video` from Vidéos); a rubric shows
// the lists of its kind and the mixed ones. The provider playlists (Spotify, Apple Music) stay the provider's.
export const MEDIA_LIST_ATOME_TYPE = 'media_list';
export const MEDIA_LIST_KINDS = Object.freeze(['mixed', 'audio', 'video']);
export const MEDIA_LIST_ENTRY_MEDIA = Object.freeze(['audio', 'video']);
// Where an entry plays: `file` (the person's stored media, its atome id as ref), `music` (a music service's
// song, `provider` naming it), `online` (an online video service's video, `provider` its key, or `media_library`
// for a free Médiathèque video).
export const MEDIA_LIST_ENTRY_SOURCES = Object.freeze(['file', 'music', 'online']);
export const MEDIA_LIST_NAME_MAX = 80;
export const MEDIA_LIST_ENTRIES_MAX = 500;

const text = max => ({ type: 'string', maxLength: max });
export const MEDIA_LIST_ENTRY_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['id', 'media', 'source', 'ref', 'label'],
    properties: { id: { type: 'string', minLength: 1, maxLength: 400 }, media: { type: 'string', enum: MEDIA_LIST_ENTRY_MEDIA },
        source: { type: 'string', enum: MEDIA_LIST_ENTRY_SOURCES }, ref: { type: 'string', minLength: 1, maxLength: 400 },
        provider: text(80), label: { type: 'string', minLength: 1, maxLength: 400 }, detail: text(400), image: text(2000),
        duration: { type: 'number', minimum: 0 }, added_at: text(40),
        // A music service's own place of the song (Apple Music: library or catalog).
        scope: text(40) } });
export const MEDIA_LIST_TYPE = Object.freeze({ type: MEDIA_LIST_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    name: { type: 'string', minLength: 1, maxLength: MEDIA_LIST_NAME_MAX }, kind: { type: 'string', enum: MEDIA_LIST_KINDS },
    entries: { type: 'array', maxItems: MEDIA_LIST_ENTRIES_MAX, items: MEDIA_LIST_ENTRY_SCHEMA },
    // A canonical particle: value N lives at particle version N + 1 (expected_versions guards each write).
    revision: { type: 'number', minimum: 0 },
    created_at: { type: 'string' }, access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] }
} });

// An entry's id: its source and ref (one place per media in a list).
export const mediaListEntryId = entry => `${entry.source}:${entry.provider || ''}:${entry.ref}`;
// Whether a list of `kind` takes (or shows in a rubric of) `media`: a mixed list takes every media; `all` shows every list.
export const mediaListCompatible = (kind, media) => media === 'all' || kind === 'mixed' || kind === media;
