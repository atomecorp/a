import { validateParams } from '../ai/agent_gateway_normalize.js';
import { ACTIVITY_CATEGORY_SLUGS } from '../../shared/activity_categories.js';
import { PUBLIC_EVENT_MAX_CATEGORIES, PUBLIC_EVENT_REPORT_REASONS } from '../../shared/public_event_contract.js';

// Public events (todo/evenements_publics_2026-10-26.md): a dated activity a user declares (a concert,
// a match, a meal, a party…) is published to everyone around its place, in the Activité rubrics. It is
// the user's own calendar event made public: one contract for runtime V2, AI discovery and direct MCP
// calls, run by eVe/domains/public_events/public_events_runtime.js through the calendar's one writer.
// An event of the user is named by its `event_id` (events.mine gives them); an event found around by
// its `entry_id` (events.nearby gives them). Publishing is confirmed by the user.
export const EVENTS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'PLACE_NOT_FOUND', 'POSITION_UNAVAILABLE', 'AUTH_REQUIRED',
    'OWN_EVENT', 'PRESENTATION_UNAVAILABLE', 'SOURCE_UNAVAILABLE', 'WRITE_FAILED']);
export const EVENTS_REPEATS = Object.freeze(['none', 'daily', 'weekly', 'monthly']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const isoDate = { type: 'string', minLength: 10, maxLength: 40, description: 'ISO 8601 date-time' };
const categories = { type: 'array', minItems: 1, maxItems: PUBLIC_EVENT_MAX_CATEGORIES, items: { type: 'string', enum: ACTIVITY_CATEGORY_SLUGS } };
const url = { type: 'string', maxLength: 500, pattern: '^https://' };
const fields = {
    title: { type: 'string', minLength: 1, maxLength: 200 }, start: isoDate, end: isoDate, all_day: { type: 'boolean' },
    repeat: { type: 'string', enum: EVENTS_REPEATS }, categories,
    place: { type: 'string', minLength: 2, maxLength: 200, description: 'The place as said (« salle des fêtes de Nolande »), found by the map geocoder.' },
    price_eur: { type: 'number', minimum: 0, maximum: 100000, description: '0 = free.' }, ticket_url: url, url,
    description: { type: 'string', maxLength: 2000 },
    creation_id: { ...id, description: 'A creation of Créer (creation.list) laid as the poster.' }
};
const definitions = {
    categories: [{}, [], 'List the activity categories an event can be declared in (slug, label, the Activité plate it shows in).', false, 'read'],
    declare: [{ ...fields, notify_contacts: { type: 'boolean', description: 'Also send it as News to the user\'s contacts.' } },
        ['title', 'start', 'categories', 'place'],
        'Declare a new public event: it joins the user\'s calendar and everyone around its place finds it in the Activité rubrics of its categories. Ask the user to confirm the title, date, place and categories first.', true, 'write'],
    publish: [{ event_id: id, categories, place: fields.place, price_eur: fields.price_eur, ticket_url: url, url, creation_id: fields.creation_id },
        ['event_id', 'categories', 'place'], 'Make an event of the user\'s calendar public (events.mine or calendar.list_events give its id).', true, 'write'],
    update: [{ event_id: id, ...fields }, ['event_id'], 'Change a public event of the user (its title, date, place, categories, price, links).', true, 'write'],
    unpublish: [{ event_id: id }, ['event_id'], 'Withdraw a public event of the user from everyone; it stays in their calendar.', true, 'write'],
    mine: [{}, [], 'The user\'s public events with their status: live, refused (quota, suspended, invalid, past) or hidden (reported).', false, 'read'],
    nearby: [{ categories, query: { type: 'string', maxLength: 80 }, radius_km: { type: 'integer', minimum: 1, maximum: 100 } }, [],
        'What people declared around the place the Activité rubrics look around: their events of the categories asked (all when none), soonest first, with the organiser.', false, 'read'],
    report: [{ entry_id: id, reason: { type: 'string', enum: PUBLIC_EVENT_REPORT_REASONS } }, ['entry_id', 'reason'],
        'Report an event found around (spam, false, offensive, other); three reports hide it.', true, 'write'],
    contact: [{ entry_id: id, text: { type: 'string', minLength: 1, maxLength: 2000 } }, ['entry_id', 'text'],
        'Write to the organiser of an event found around (someone not yet in contact receives it as their contact request).', true, 'send'],
    panel: [{ ...fields, public: { type: 'boolean', description: 'Annon.: the event public (true) or private (false).' },
        notify_contacts: { type: 'boolean', description: 'Diffuser › Contacts: a News to the contacts once saved.' },
        choose_poster: { type: 'boolean', description: 'Affiche › Import: open the import panel (then media_import.* chooses in it).' } }, [],
        'Set the fields of the event panel shown (events.open): title, date, repetition, categories, place, price, ticket link, poster, Annon., Contacts. Nothing is saved until events.save.', false, 'control'],
    save: [{}, [], 'Garder: save the event panel shown; a public event goes out to everyone around. Confirm with the user first.', true, 'write'],
    share: [{ event_id: id, destinations: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', pattern: '^(tiktok|instagram|facebook:profile|facebook:page:[0-9]{1,40})$' } } },
        ['event_id', 'destinations'], 'Diffuser › Réseaux by voice: prepare a public event of the user (its poster and words) for the user\'s connected social networks (social.accounts lists them); returns the job to publish with social.publish.', false, 'read'],
    open: [{ event_id: id, categories, creation_id: fields.creation_id, mine: { type: 'boolean', description: 'Show the list « Mes annonces » instead.' } }, [],
        'Show the event panel to declare an event (its categories chosen, a creation as its poster), one of the user\'s public events, or (mine) the list of the user\'s public events with their status.', false, 'control']
};
const eventSchema = { type: 'object', properties: { event_id: { type: 'string' }, entry_id: { type: 'string' }, title: { type: 'string' }, start: { type: 'string' },
    end: { type: 'string' }, place: { type: 'string' }, city: { type: 'string' }, categories: { type: 'array', items: { type: 'string' } },
    organizer: { type: 'string' }, distance_km: { type: 'number' }, price: { type: 'string' }, free: { type: 'boolean' }, status: { type: 'string' },
    reason: { type: 'string' } } };
export const EVENTS_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `events.${action}`, action, description, persistent, capability: `events.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: EVENTS_ERRORS },
        event_id: { type: 'string' }, event: eventSchema, events: { type: 'array', items: eventSchema },
        categories: { type: 'array', items: { type: 'object' } }, sent: { type: 'boolean' }, saved: { type: 'boolean' }, job_id: { type: 'string' }, preview: { type: 'object' } } }
})));
export const EVENTS_CONFIRMED_COMMANDS = Object.freeze(['events.declare', 'events.publish', 'events.save']);
export const validateEventsInput = (action, input) => {
    const contract = EVENTS_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const eventsError = error => (EVENTS_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'WRITE_FAILED');
export const EVENTS_ASSISTANT_INSTRUCTIONS = 'Événements publics (what users organise, for everyone around): « j\'organise un concert samedi à 20 h à la salle des fêtes de Nolande », « on fait un repas de quartier dimanche midi », « je lance un cours de yoga tous les mardis » call events.declare with the title, start (and end), repeat, the categories (events.categories lists them: concert, stage, screening, sport, festival, expo, family, meal, party, workshop, outing, market, wellbeing), the place as said and the price (price_eur 0 when free); first say back the title, day, hour, place and categories and wait for the user\'s yes. « rends cet événement public » calls events.publish on an event of their calendar; « change l\'heure de mon concert » events.update; « retire mon annonce » events.unpublish; « où en sont mes annonces ? » events.mine (refused quota: the daily limit; hidden: reported by others); « montre mes annonces » events.open with mine true. « mets mon dessin comme affiche » passes its creation_id (creation.list) to events.declare, events.publish or events.update. « qu\'est-ce que les gens organisent près d\'ici ? » calls events.nearby; « écris à l\'organisateur » events.contact with the entry_id; « signale cette annonce » events.report. « je veux déclarer un événement » calls events.open; while its panel shows, every field the user says goes through events.panel (« le titre c\'est … », « samedi à 20 h », « c\'est un concert », « à la salle des fêtes de Nolande », « entrée 10 euros », « préviens mes contacts », « prends mon dessin comme affiche » with creation_id, « choisis une photo comme affiche » with choose_poster then media_import.list / media_import.choose), then « garde-le » events.save after the user\'s yes. « partage-le sur Instagram » calls events.share then social.publish with its job_id. Never invent an entry_id or event_id.';
