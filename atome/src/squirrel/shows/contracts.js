import { validateParams } from '../ai/agent_gateway_normalize.js';

// The Spectacles rubric (Dashboard › Activité): one contract for runtime V2, AI discovery and direct
// MCP calls, like the shopping list. Every action of its screens is one of these commands; the
// Dashboard's own tools call them too (eVe/domains/shows/shows_runtime.js).
// An entry is one row the last `shows.search` (or the list on screen) returned: the actions on an
// entry name it by its `entry_id`.
export const SHOWS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'PLATE_NOT_FOUND', 'ENTRY_NOT_FOUND', 'POSITION_UNAVAILABLE',
    'SOURCE_UNAVAILABLE', 'NOT_CONFIGURED', 'NO_DATE', 'NO_PLACE', 'NO_SITE', 'NO_TICKETS', 'USER_GESTURE_REQUIRED',
    'PRESENTATION_UNAVAILABLE', 'CALENDAR_UNAVAILABLE', 'NAVIGATION_FAILED', 'PLACE_NOT_FOUND']);
// The radius steps of the rubric (eVe/domains/dashboard/dashboard_preferences.js#DASHBOARD_SHOWS_RADII_KM).
export const SHOWS_RADII_KM = Object.freeze([2, 5, 10, 20, 50, 100]);
// The orders each server kind (server/ws_shows.js) can be read in, its first by default: an outing by
// `date` (soonest), `distance` (nearest) or `name` (its place's name, A to Z), a place by `distance` or
// `name`. The kinds absent keep their one order (films by popularity, matches by date, DATAtourisme's).
const DATED = Object.freeze(['date', 'distance', 'name']), PLACED = Object.freeze(['distance', 'name']);
export const SHOWS_SORTS = Object.freeze({ concerts: DATED, stage: DATED, expos: DATED, events: DATED, family: DATED, free: DATED, sport: DATED, outings: DATED,
    cinemas: PLACED, heritage: PLACED, restaurants: PLACED, bars: PLACED });
export const SHOWS_SORT_NAMES = Object.freeze(['date', 'distance', 'name']);

const plate = { type: 'string', minLength: 1, maxLength: 40, pattern: '^[a-z_]+$' };
const entryId = { type: 'string', minLength: 1, maxLength: 200 };
const entry = { entry_id: entryId };
const sort = { type: 'string', enum: SHOWS_SORT_NAMES };
const definitions = {
    plates: [{}, [], 'List the plates of Activité as this server offers them: Spectacles (`level: shows`: cinema, concerts, sport, stage, family, free) and Temps libre (`level: leisure`: heritage, museums, nature, hiking, restaurants, bars, experiences, wellbeing, events, outings), each with its key, short label and full name.', false, 'read'],
    search: [{ plate, query: { type: 'string', maxLength: 80 }, radius_km: { type: 'integer', enum: SHOWS_RADII_KM }, cinemas: { type: 'boolean' },
        sort, page_token: { type: 'string', maxLength: 12 } }, ['plate'],
        'What is on around the chosen place (the user\'s own position unless shows.set_place chose another) for one plate (films showing, concerts, matches, outings, places); query narrows it (a word, an artist, a town); radius_km defaults to the user\'s radius; cinemas true lists the cinemas around instead of the films; sort orders an outing by date (soonest, its default), distance (nearest) or name (its place\'s name), a place by distance (its default) or name; films and matches keep their own order. Returns entries with entry_id, title, date, place, distance from the place looked around, and whether they have a site or tickets, with the place looked around.', false, 'read'],
    open: [{ plate, query: { type: 'string', maxLength: 80 }, entry_id: entryId, cinemas: { type: 'boolean' }, sort }, ['plate'],
        'Show a plate\'s list on the Dashboard (the user sees it), optionally searched, sorted (as shows.search), optionally with one entry shown on top, or the cinemas around.', false, 'read'],
    set_radius: [{ radius_km: { type: 'integer', enum: SHOWS_RADII_KM } }, ['radius_km'], 'Set how far around the chosen place the plates look (kept in the user\'s preferences).', true, 'write'],
    set_place: [{ query: { type: 'string', minLength: 1, maxLength: 120 }, here: { type: 'boolean' }, lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 }, label: { type: 'string', minLength: 1, maxLength: 120 } }, [],
        'Choose the place the plates look around (kept in the user\'s preferences): query names a town or an address (a trip: « à Lyon »), its best match is taken; or lat, lon and label give a place exactly (a point chosen on the map); here true goes back to the user\'s own position. Returns the place now looked around.', true, 'write'],
    add_to_calendar: [entry, ['entry_id'], 'Add a dated entry (concert, match, outing) to the user\'s personal calendar, with its place and its page.', true, 'write'],
    navigate: [entry, ['entry_id'], 'Take the user to an entry\'s place: create the itinerary and start the spoken guidance (gps.navigate_to).', true, 'control'],
    open_site: [entry, ['entry_id'], 'Open an entry\'s own page (the event, the cinema, the film) in the browser.', false, 'control'],
    open_tickets: [entry, ['entry_id'], 'Open the official ticketing or booking page of an entry in the browser, when its organiser published one.', false, 'control']
};
const entrySchema = { type: 'object', required: ['entry_id', 'title', 'kind'], properties: {
    entry_id: { type: 'string' }, kind: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, start: { type: 'string' },
    end: { type: 'string' }, place: { type: 'string' }, city: { type: 'string' }, distance_km: { type: 'number' }, league: { type: 'string' },
    price: { type: 'string' }, has_site: { type: 'boolean' }, has_tickets: { type: 'boolean' },
    // What the source asks to credit with its data (DATAtourisme: the producer and last update; a photo's credits).
    source: { type: 'string' }, credit: { type: 'string' } } };
export const SHOWS_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `shows.${action}`, action, description, persistent, capability: `shows.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: SHOWS_ERRORS },
        plates: { type: 'array', items: { type: 'object', properties: { plate: { type: 'string' }, level: { type: 'string', enum: ['shows', 'leisure'] },
            label: { type: 'string' }, name: { type: 'string' } } } },
        entries: { type: 'array', items: entrySchema }, entry: entrySchema, next_page_token: { type: 'string' }, radius_km: { type: 'integer' },
        place: { type: 'object', properties: { label: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' }, here: { type: 'boolean' } } },
        event_id: { type: 'string' } } }
})));
export const validateShowsInput = (action, input) => {
    const contract = SHOWS_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const showsError = error => (SHOWS_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'SOURCE_UNAVAILABLE');
export const SHOWS_ASSISTANT_INSTRUCTIONS = 'Spectacles (outings around the user): « quels concerts ce soir ? », « qu\'est-ce qui passe au cinéma ? », « des matchs ce week-end ? », « une expo près d\'ici » call shows.search with the plate (shows.plates lists them) and the user\'s words as query when they name something; say a few titles with their day, place and distance, never invent sessions or prices. « montre-les » calls shows.open. « ajoute-le à mon agenda » calls shows.add_to_calendar, « emmène-moi » shows.navigate, « ouvre le site » shows.open_site, « prends des billets » shows.open_tickets, each with the entry_id of the entry meant; NO_TICKETS means its organiser published no ticketing, offer the site. « cherche plus loin » calls shows.set_radius with a larger step. « trie par date / par distance / par lieu » passes sort date, distance or name to shows.search or shows.open. « des concerts à Lyon le mois prochain », « je pars à Bordeaux, qu\'est-ce qu\'il y a ? » call shows.set_place with the town as query, then shows.search (it stays chosen until « autour de moi » calls shows.set_place with here true); say which place you looked around. POSITION_UNAVAILABLE means ask the user to allow location or to choose the weather town. Temps libre (places and outings around): « un restaurant près d\'ici », « un bar sympa », « des monuments à visiter », « un musée », « une balade », « un spa », « qu\'est-ce qu\'il y a comme fêtes ce week-end ? » call shows.search with the matching Temps libre plate (restaurants, bars, heritage, museums, hiking, wellbeing, events, outings for meals, parties, workshops and markets…); what users themselves organise around is events.nearby; give names, town and distance, never opening hours, prices or ratings the entries do not carry.';
