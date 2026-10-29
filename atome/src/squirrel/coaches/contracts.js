import { validateParams } from '../ai/agent_gateway_normalize.js';
import { COACH_DAYS, COACH_LIMITS, COACH_QUALITIES } from '../../shared/coach_contract.js';

// Coaches and bookings (cahier FEAT-010 + FEAT-012, user validation of 28 Oct. 2026): everyone finds a coach and its free
// slots; an account asks for a session, the coach accepts or refuses, the session lands in both agendas; either side
// cancels within the coach's delay. A coach is the user's own coaching agenda (coaches.mine): its name, the quality it
// DECLARES (coach, trainer with a diploma, health professional — never checked by eVe), specialties, weekly hours,
// unavailable days, a session's length and its cancellation delay. One contract for runtime V2, AI discovery and direct
// MCP calls, run by eVe/domains/coaches/coach_runtime.js. A coach is named by its `coach_id` (coaches.find), a booking
// by its `booking_id` (coaches.bookings).
export const COACH_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'AUTH_REQUIRED', 'OWN_COACHING', 'SLOT_TAKEN', 'TOO_LATE',
    'NOT_ALLOWED', 'PRESENTATION_UNAVAILABLE', 'SOURCE_UNAVAILABLE', 'WRITE_FAILED']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const clock = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', description: 'HH:MM, the coach\'s own time' };
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD, the coach\'s own calendar' };
const coachingFields = {
    name: { type: 'string', minLength: 1, maxLength: COACH_LIMITS.name, description: 'The name shown to the people searching.' },
    quality: { type: 'string', enum: COACH_QUALITIES, description: 'Declared by the coach, never checked: coach, trainer (diploma), health (health professional).' },
    specialties: { type: 'array', maxItems: COACH_LIMITS.specialties, items: { type: 'string', minLength: 1, maxLength: COACH_LIMITS.specialty } },
    place: { type: 'string', maxLength: COACH_LIMITS.place, description: 'Where the sessions happen (a town, a gym, « visio »).' },
    slot_minutes: { type: 'integer', minimum: COACH_LIMITS.minMinutes, maximum: COACH_LIMITS.maxMinutes, description: 'A session\'s length.' },
    cancel_hours: { type: 'integer', minimum: 0, maximum: COACH_LIMITS.maxCancelHours, description: 'Until how many hours before a session its client may cancel it.' },
    timezone: { type: 'string', minLength: 1, maxLength: 60, description: 'IANA zone of the hours (the device\'s by default).' },
    ranges: { type: 'array', maxItems: COACH_LIMITS.ranges, description: 'The weekly hours, all of them (replaces the previous ones).',
        items: { type: 'object', additionalProperties: false, required: ['day', 'start', 'end'], properties: { day: { type: 'string', enum: COACH_DAYS }, start: clock, end: clock } } },
    off: { type: 'array', maxItems: COACH_LIMITS.off, description: 'The unavailable days, all of them (replaces the previous ones), each from start to end included.',
        items: { type: 'object', additionalProperties: false, required: ['start'], properties: { start: day, end: day } } }
};
const definitions = {
    find: [{ query: { type: 'string', maxLength: 80, description: 'A name, a specialty or a place (« yoga »).' } }, [],
        'The coaches everyone can book, by name, specialty or place, each with the quality it declares.', false, 'read'],
    slots: [{ coach_id: id }, ['coach_id'], 'A coach\'s free slots for the three weeks to come (its hours, less what is busy).', false, 'read'],
    book: [{ coach_id: id, starts_at: { type: 'string', minLength: 10, maxLength: 40, description: 'ISO 8601 start, from coaches.slots' },
        minutes: coachingFields.slot_minutes, title: { type: 'string', minLength: 1, maxLength: COACH_LIMITS.title },
        note: { type: 'string', maxLength: COACH_LIMITS.note, description: 'What the user chooses to tell the coach, nothing else is sent.' },
        calendar_id: { ...id, description: 'The user\'s agenda that receives the session once accepted (default: Perso).' } }, ['coach_id', 'starts_at'],
    'Ask a coach for a session; it stays a request until the coach accepts. Say back the coach, the day and the time and wait for the user\'s yes.', true, 'write'],
    bookings: [{ side: { type: 'string', enum: ['client', 'coach'], description: 'client: the user\'s own bookings; coach: the requests and sessions of the user\'s coaching.' } }, [],
        'The bookings and where each stands: requested, accepted, refused, cancelled.', false, 'read'],
    answer: [{ booking_id: id, accept: { type: 'boolean' } }, ['booking_id', 'accept'], 'The coach accepts or refuses a request; accepted, it lands in both agendas.', true, 'write'],
    cancel: [{ booking_id: id }, ['booking_id'],
        'Cancel a booking: a request at any time; an accepted session until the coach\'s delay before it (the coach until its start). Wait for the user\'s yes.', true, 'write'],
    mine: [{}, [], 'The user\'s own coaching: name, declared quality, specialties, hours, unavailable days, length, delay, published or not.', false, 'read'],
    become: [coachingFields, [], 'Become a coach or change one\'s coaching (only the fields given change), published in the directory. The quality is declared, eVe never certifies it. Say back what is published and wait for the yes.', true, 'write'],
    stop: [{}, [], 'Take the user\'s coaching out of the directory (its sessions stay).', true, 'write'],
    open: [{ coach_id: id, booking_id: id, view: { type: 'string', enum: ['all', 'bookings', 'requests', 'setup'] }, query: { type: 'string', maxLength: 80 } }, [],
        'Show Coachs: a coach and its slots, a booking, the user\'s bookings, the requests to the user\'s coaching, its settings, or every coach (query: a search).', false, 'control']
};
const coachSchema = { type: 'object', properties: { coach_id: { type: 'string' }, name: { type: 'string' }, quality: { type: 'string' }, declared: { type: 'boolean' },
    specialties: { type: 'array', items: { type: 'string' } }, place: { type: 'string' } } };
export const COACH_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `coaches.${action}`, action, description, persistent, capability: `coaches.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: COACH_ERRORS },
        coaches: { type: 'array', items: coachSchema }, coach: coachSchema, slots: { type: 'array', items: { type: 'object' } },
        booking: { type: 'object' }, bookings: { type: 'array', items: { type: 'object' } }, coaching: { type: 'object' } } }
})));
export const COACH_CONFIRMED_COMMANDS = Object.freeze(['coaches.book', 'coaches.cancel', 'coaches.become', 'coaches.stop']);
export const validateCoachInput = (action, input) => {
    const contract = COACH_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const COACH_ASSISTANT_INSTRUCTIONS = 'Coachs: « trouve-moi un coach de yoga » calls coaches.find with query yoga (then coaches.open with the query to show them); a coach\'s quality is declared by the coach, never certified by eVe: always say « se déclare entraîneur diplômé ». « ses créneaux » coaches.slots; « réserve jeudi 18 h avec Sam » coaches.slots of that coach, then coaches.book with the matching starts_at after saying back the coach, the day and the time (it stays a request until the coach accepts); « mes réservations » coaches.bookings; « annule ma séance » coaches.cancel (an accepted session only until the coach\'s delay). For a coach: « je deviens coach de yoga, entraîneur diplômé » coaches.become with name, quality trainer, specialties; « je suis dispo le jeudi de 18 h à 21 h » coaches.mine then coaches.become with every range kept plus the new one; « je suis absent du 12 au 15 novembre » the same with off; « mes demandes » coaches.bookings side coach; « accepte la demande de Paul » coaches.answer accept true. Never invent a coach_id, starts_at or booking_id.';
