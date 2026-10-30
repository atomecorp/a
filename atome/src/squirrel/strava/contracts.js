import { validateParams } from '../ai/agent_gateway_normalize.js';

// Strava (register R-016 lot F, question 31 « Strava d'abord », mockup temp/results_panel/mockups/M12_connexions.png:
// Préférences › Santé). The person's Strava account, connected through Strava's own sign-in page; its activities read
// into the person's records (#shared/activity_import_contract.js), where the Résultats monitor and the workouts tile read
// them. One contract for runtime V2, AI discovery, voice and direct MCP calls; the screen's actions run through it
// (eVe/domains/strava/strava_runtime.js); the server owner holds the tokens (server/strava/). The assistant never
// reads Strava data (Strava's terms): an import answers counts only.
export class StravaFailure extends Error {
    constructor(code) { super(code); this.code = code; }
}
export const STRAVA_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'CONTEXT_CHANGED', 'NOT_CONFIGURED',
    'AUTHORIZATION_REQUIRED', 'PERMISSION_DENIED', 'AUTHORIZATION_EXPIRED', 'CANCELLED', 'USER_GESTURE_REQUIRED',
    'PROVIDER_UNAVAILABLE', 'PROVIDER_REJECTED', 'RATE_LIMITED', 'IMPORT_WRITE_FAILED']);
// The scopes asked: the profile's name, and every activity the person can see, « Only You » included.
export const STRAVA_SCOPES = Object.freeze(['read', 'activity:read_all']);
// The days read back when none is said: a re-import of them changes only what Strava changed.
export const STRAVA_IMPORT_DAYS = 30;
const attempt = { type: 'string', pattern: '^[a-f0-9]{32}$' };
const definitions = {
    get_state: [{}, [], 'read', 'Read whether Strava can be connected on this atome server (configured) and whether the person\'s account is connected (state, the Strava name). Never opens a page.'],
    connect: [{}, [], 'control', 'Open Strava\'s own sign-in page for the person to allow atome to read their activities, wait for their answer, then import the last 30 days. Never ask for a password or a token. NOT_CONFIGURED: the atome server has no Strava application yet.'],
    await_connection: [{ attempt_id: attempt }, ['attempt_id'], 'read', 'Wait on the authenticated socket for a Strava authorization attempt. No polling.'],
    cancel_connection: [{ attempt_id: attempt }, ['attempt_id'], 'control', 'Cancel the person\'s pending Strava authorization attempt.'],
    import: [{ days: { type: 'integer', minimum: 1, maximum: 365, description: 'The days read back from today; 30 when absent.' } }, [], 'write',
        'Read the person\'s Strava activities of the last days into their records (Résultats, workouts). Idempotent: an activity already imported and unchanged is not written again. Answers counts only, never the activities.'],
    disconnect: [{}, [], 'control', 'Disconnect Strava: atome\'s access is revoked at Strava and its tokens removed. The activities already imported stay.']
};
export const STRAVA_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, access, description]]) => Object.freeze({
    action, name: `strava.${action}`, access, description, capability: `strava.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: STRAVA_ERRORS },
        configured: { type: 'boolean' }, state: { type: 'string', enum: ['not_configured', 'disconnected', 'connected'] },
        identity: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' } } },
        attempt_id: attempt, authorization_url: { type: 'string' }, expires_at: { type: 'number' }, cancelled: { type: 'boolean' },
        provider_revoked: { type: 'boolean' }, added: { type: 'integer' }, updated: { type: 'integer' }, unchanged: { type: 'integer' } } }
})));
export const validateStravaInput = (action, input = {}) => {
    const contract = STRAVA_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const stravaError = error => {
    const code = error?.code || error?.message || error;
    if (STRAVA_ERRORS.includes(code)) return code;
    if (code === 'not_authenticated') return 'AUTH_REQUIRED';
    if (code === 'provider_principal_changed') return 'CONTEXT_CHANGED';
    if (code === 'provider_cancelled' || code === 'social_cancelled') return 'CANCELLED';
    if (code === 'social_authorization_expired') return 'AUTHORIZATION_EXPIRED';
    if (code === 'social_authorization_denied') return 'PERMISSION_DENIED';
    if (code === 'social_not_configured') return 'NOT_CONFIGURED';
    return 'PROVIDER_UNAVAILABLE';
};
export const STRAVA_ASSISTANT_INSTRUCTIONS = 'Strava: « connecte Strava » calls strava.connect (Strava\'s own page opens; NOT_CONFIGURED means the atome server has no Strava application yet, say so); « importe mes activités Strava » calls strava.import; « déconnecte Strava » calls strava.disconnect. You never read Strava activities or their values (Strava\'s terms): only say how many were added or updated.';
