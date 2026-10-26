import { validateParams } from '../ai/agent_gateway_normalize.js';
import { STREAMING_SERVICES } from '../shared/streaming_services.js';

// Divertissement › Vidéo (Films & séries, Vidéos): one contract for runtime V2, AI discovery and
// direct MCP calls, like Spectacles. Every action of its screens is one of these commands, run by
// eVe/domains/media/films_runtime.js. An entry is one title the last `films.search`, `films.similar`
// or `films.lists` returned: the actions on an entry name it by its `entry_id`.
export const FILMS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'ENTRY_NOT_FOUND', 'NOT_CONFIGURED', 'SOURCE_UNAVAILABLE',
    'PRESENTATION_UNAVAILABLE', 'NOTHING_TO_PLAY', 'NOT_PLAYING', 'SAVE_FAILED']);
export const FILMS_SERVICE_KEYS = Object.freeze(STREAMING_SERVICES.map(service => service.key));

const service = { type: 'string', enum: FILMS_SERVICE_KEYS };
const entryId = { type: 'string', minLength: 1, maxLength: 200 };
const entry = { entry_id: entryId };
const definitions = {
    services: [{}, [], 'List the subscription video services (Netflix, Disney+, Prime Video, CANAL+, Paramount+, Shadowz, Molotov…), each with whether the user declared having it.', false, 'read'],
    set_service: [{ service, declared: { type: 'boolean' } }, ['service', 'declared'], 'Declare that the user has (declared true) or no longer has (false) a subscription to a service: Films & séries then lists what it includes (Réglages › Mots de passe et clés › Vidéo).', true, 'write'],
    search: [{ query: { type: 'string', maxLength: 120 }, service, page_token: { type: 'string', maxLength: 400 } }, [],
        'Films and series the user can watch without buying nor renting them — on their declared services, or free — newest first without a query, else matching it; service looks at that one service alone. Returns entries with entry_id, title, year, kind (movie, tv, archive: a public-domain film that plays whole in atome), the services having it and whether it has a trailer.', false, 'read'],
    similar: [entry, ['entry_id'], 'What resembles an entry the user can watch too (TMDB recommendations; after an Internet Archive film, the Archive\'s films like it).', false, 'read'],
    lists: [{ list: { type: 'string', enum: ['favorites', 'history'] } }, ['list'], 'The user\'s starred films and series, or those they watched (a trailer, a film, a service\'s page), newest first.', false, 'read'],
    favorite: [{ entry_id: entryId, favorite: { type: 'boolean' } }, ['entry_id', 'favorite'], 'Star (favorite true) or unstar an entry.', true, 'write'],
    like: [{ entry_id: entryId, liked: { type: 'boolean' } }, ['entry_id', 'liked'], 'Mark that the user likes (liked true) or no longer likes an entry (kept private in their account).', true, 'write'],
    open: [{ list: { type: 'string', enum: ['films', 'videos'] }, view: { type: 'string', enum: ['home', 'favorites', 'history', 'platforms'] },
        query: { type: 'string', maxLength: 120 }, service }, [],
        'Show a list on the Dashboard (the user sees it): Films & séries (list films, the default) or Vidéos (YouTube and PeerTube together, list videos); optionally its favorites, history or platforms, a search, or one declared service alone.', false, 'read'],
    play: [entry, ['entry_id'], 'Play an entry on the Dashboard: an Internet Archive film plays whole; a title opens its service\'s own page inside atome where the device has one (iOS), else plays its trailer. NOTHING_TO_PLAY: no trailer, the entry names its services.', false, 'control'],
    control: [{ action: { type: 'string', enum: ['play', 'pause', 'stop', 'next', 'previous', 'fullscreen', 'exit_fullscreen'] } }, ['action'],
        'Control what plays in the Dashboard\'s video list: resume, pause, stop, the next or previous entry, the whole screen or back.', false, 'control']
};
const entrySchema = { type: 'object', required: ['entry_id', 'title', 'kind'], properties: {
    entry_id: { type: 'string' }, kind: { type: 'string', enum: ['movie', 'tv', 'archive'] }, title: { type: 'string' }, year: { type: 'string' },
    overview: { type: 'string' }, services: { type: 'array', items: { type: 'string' } }, free: { type: 'boolean' }, has_trailer: { type: 'boolean' } } };
export const FILMS_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `films.${action}`, action, description, persistent, capability: `films.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: FILMS_ERRORS },
        services: { type: 'array', items: { type: 'object', properties: { service: { type: 'string' }, label: { type: 'string' }, declared: { type: 'boolean' } } } },
        entries: { type: 'array', items: entrySchema }, entry: entrySchema, next_page_token: { type: 'string' },
        list: { type: 'string' }, shown: { type: 'string', enum: ['home', 'search', 'ideas', 'favorites', 'history', 'platforms'] }, current: { type: 'string' }, page: { type: 'string' } } }
})));
export const validateFilmsInput = (action, input) => {
    const contract = FILMS_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const filmsError = error => (FILMS_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'SOURCE_UNAVAILABLE');
export const FILMS_ASSISTANT_INSTRUCTIONS = 'Films et séries (Divertissement › Vidéo): « qu\'est-ce qu\'il y a de nouveau sur Netflix ? », « un film d\'horreur », « où je peux voir Dune ? » call films.search (service for one service, the user\'s words as query); say a few titles with their year and the services having them, never a price nor a rental. « mets-le », « lance la bande-annonce » calls films.play with the entry_id meant; NOTHING_TO_PLAY means it has no trailer: say where it is. « montre-moi les films » calls films.open, « mes vidéos YouTube » films.open with list videos. « pause », « reprends », « arrête », « le suivant » call films.control. « j\'ai Disney+ », « je n\'ai plus Netflix » call films.set_service. « mets-le en favori » films.favorite, « j\'aime » films.like, « des films du même genre » films.similar.';
