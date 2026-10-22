import { validateParams } from '../ai/agent_gateway_normalize.js';
import { GPS_POINT_SCHEMA, GPS_ROUTE_SCHEMA } from '../../shared/gps_trip_contract.js';

const id = { type: 'string', minLength: 1, maxLength: 200 };
const query = { type: 'string', minLength: 1, maxLength: 200 };
export const GPS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'TRIP_NOT_FOUND', 'NOT_CONFIGURED',
    'PROVIDER_UNAVAILABLE', 'NO_ROUTE', 'OUT_OF_COVERAGE', 'PERMISSION_DENIED', 'LOCATION_UNAVAILABLE',
    'HOST_UNSUPPORTED', 'NAVIGATION_ALREADY_ACTIVE', 'NO_ACTIVE_TRIP', 'VERSION_CONFLICT', 'CONTEXT_CHANGED',
    'PRESENTATION_UNAVAILABLE', 'CANCELLED', 'RATE_LIMITED', 'INVALID_PROVIDER_RESPONSE', 'PLACE_NOT_FOUND', 'CONTACT_REQUIRED']);
const definitions = {
    list_trips: [{ offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, [], 'Read private GPS itineraries, active device trip first, then newest first.', false],
    get_trip: [{ trip_id: id }, ['trip_id'], 'Read an existing private GPS itinerary.', false],
    create_trip: [{ request_id: id, name: { type: 'string', maxLength: 512 }, origin: GPS_POINT_SCHEMA,
        destination: GPS_POINT_SCHEMA, waypoints: { type: 'array', maxItems: 16, items: GPS_POINT_SCHEMA } },
        ['request_id', 'origin', 'destination'], 'Create a private account-global itinerary. Does not start guidance.', true],
    search_places: [{ query }, ['query'], 'Search the configured address service on explicit submission.', false],
    locate: [{}, [], 'Request this device position on an explicit user action. Does not retain or share fixes.', false],
    calculate_route: [{ trip_id: id, origin: GPS_POINT_SCHEMA }, ['trip_id'], 'Calculate and retain a Valhalla itinerary, without starting guidance.', true],
    preview: [{ trip_id: id }, ['trip_id'], 'Open a GPS itinerary on the current presentation surface. Does not start guidance.', false],
    new_trip: [{}, [], 'Open the itinerary creation surface without starting guidance or creating a durable trip.', false],
    start_navigation: [{ trip_id: id }, ['trip_id'], 'Start foreground/background guidance on this device, requesting location access. Refuses a second active trip.', true],
    stop_navigation: [{}, [], 'Stop guidance and release location and speech. Closing the preview does not stop guidance.', true],
    get_state: [{}, [], 'Read device guidance state without requesting location access.', false],
    share_position: [{ user_id: id }, ['user_id'], 'Share this account live position, read-only and live, with one accepted contact (they accept it on their side). Updates while eVe runs on this device; stop_sharing_position or revoking the share ends it.', true],
    stop_sharing_position: [{ user_id: id }, ['user_id'], 'Stop sharing this account live position with this contact.', true],
    list_shared_positions: [{}, [], 'Read the recent live positions contacts share with this account.', false],
    navigate_to: [{ destination: query, origin: GPS_POINT_SCHEMA }, ['destination'], 'Take the user to an address or place said or typed in their words: search it, use this device position as origin unless given, create and calculate the private itinerary, show it, and start spoken guidance.', true]
};
export const GPS_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `gps.${action}`, action, description, persistent, capability: persistent ? 'gps.control' : 'gps.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' },
        error: { type: 'string', enum: GPS_ERRORS }, trip: { type: 'object' }, trips: { type: 'array' }, place: GPS_POINT_SCHEMA,
        places: { type: 'array', items: GPS_POINT_SCHEMA }, position: { type: 'object' }, positions: { type: 'array' }, route: GPS_ROUTE_SCHEMA, state: { type: 'object' } } }
})));
export const validateGpsInput = (action, input) => {
    const contract = GPS_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const gpsError = error => GPS_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'PROVIDER_UNAVAILABLE';
export const GPS_ASSISTANT_INSTRUCTIONS = 'GPS: a request to go somewhere (« emmène-moi au 10 rue de Rivoli », « guide-moi jusqu\'à la gare de Lyon », « itinéraire pour Versailles ») calls gps.navigate_to with the destination in the user\'s words; say the returned place label, distance and duration. PLACE_NOT_FOUND or OUT_OF_COVERAGE means ask for a more precise address. NAVIGATION_ALREADY_ACTIVE means ask whether to stop the current guidance with gps.stop_navigation first, never stop it silently. « arrête le GPS », « stop le guidage » call gps.stop_navigation. Report guidance as started only when the result says ok.';
