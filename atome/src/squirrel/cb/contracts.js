import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the CB sociale (R-173 lot L6, cahier §8, tests 48 to 50).
// Every command runs the very actions of the CB's band (eVe/domains/cb_social/cb_commands.js): « Mets la CB sur le 19 »
// tunes the 19 as the dial does, « Portée 50 km » picks 50 km as Portée does. What eVe never does alone (cahier §8): speak
// on a channel and accept the notice have no command at all; accepting a call, launching a bottle, replying to one and
// widening the reach are asked to the person (confirmed and outward: mcp_security_policy.js); refusing a call and narrowing the
// reach are not.
export const CB_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'PRESENTATION_UNAVAILABLE', 'cb_notice_required', 'cb_not_open',
    'cb_call_not_invited', 'cb_call_not_open', 'cb_bottle_not_open', 'cb_bottle_none', 'cb_bottle_escaped', 'CB_FAILED']);
const text = { type: 'string', minLength: 1, maxLength: 8000 };
// The reaches of the CB and the Appel (dashboard_cb_channel_tools.js CB_CHANNEL_RANGES), in km or the whole world.
const range = { type: 'string', enum: ['5', '50', '500', 'world'] };
const definitions = {
    'cb.tune': ['tune', { channel: { type: 'integer', minimum: 1, maximum: 40 } }, ['channel'],
        'Tune the CB to a channel (1 to 40), as its dial does: the CB opened first when it is not (its recording notice shown instead when it is not accepted yet: the person accepts it, never the assistant). Never speaks.', 'control'],
    'cb.scan': ['scan', {}, [], 'Scan the CB: tune to the next channel where someone is (Scan of the band).', 'control'],
    'cb.range': ['range', { range }, ['range'], 'Set the reach of the CB, or of the Appel when it shows: 5, 50, 500 km or world (Portée of the band). A wider reach is asked to the person first; an equal or narrower one is set at once.', 'control'],
    'cb.leave': ['leave', {}, [], 'Leave the CB or the Appel showing, as its ✕ does (an Appel: Dispo. off, an invitation refused, a call ended for both).', 'control'],
    'cb.call.available': ['call_available', { on: { type: 'boolean' }, search: { type: 'boolean' } }, ['on'],
        'The Appel aléatoire (opened from the CB when it does not show): on, findable by others of the zone (Dispo.); search, a meeting asked at once (Chercher, which is also Dispo.).', 'control'],
    'cb.call.respond': ['call_respond', { accept: { type: 'boolean' } }, ['accept'],
        'Answer the invitation to an Appel showing: accept (asked to the person first), or refuse. Never chosen for the person.', 'send'],
    'cb.call.end': ['call_end', {}, [], 'End the Appel under way, for both (Fin).', 'control'],
    'bottle.launch': ['bottle_launch', { text }, ['text'],
        'Launch a bottle with this text from the sea, in the reach in force: read the text back to the person, then launch it once they say yes (asked first).', 'send'],
    'bottle.catch': ['bottle_catch', {}, [], 'Catch a bottle from the sea, opened at once (Attraper): its words are then read by bottle.open.', 'write'],
    'bottle.open': ['bottle_open', {}, [], 'Read the bottle caught and showing: its words, its kind. Writes nothing.', 'read'],
    'bottle.decide': ['bottle_decide', { decision: { type: 'string', enum: ['ignore', 'keep'] } }, ['decision'],
        'Decide about the bottle showing: keep it, or ignore it (it goes back to the sea).', 'write'],
    'bottle.reply': ['bottle_reply', { text }, ['text'], 'Reply in the thread of the bottle showing (texts only). Asked to the person first.', 'send'],
    'bottle.list': ['bottle_list', {}, [], 'List the person\'s bottles (Mes bouteilles): launched, with their days left and replies; kept, with their thread. Writes nothing.', 'read']
};
export const CB_COMMANDS = Object.freeze(Object.entries(definitions).map(([name, [action, properties, required, description, verb]]) => Object.freeze({
    name: `communication.${name}`, action, description, persistent: verb !== 'read', capability: `cb.${verb}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string' }, shown: { type: 'string' },
        channel: { type: 'number' }, range: { type: 'string' }, available: { type: 'boolean' }, searching: { type: 'boolean' }, state: { type: 'string' },
        bottle: { type: 'object' }, mine: { type: 'object' } } }
})));
// Always asked to the person.
export const CB_CONFIRMED_COMMANDS = Object.freeze(['communication.bottle.launch', 'communication.bottle.reply']);
// The reach in force, as its panel shows it (dashboard_cb_channel.js, dashboard_cb_call.js register theirs): the Appel's when it
// shows, else the CB's, '' when neither shows. A reach wider than it sends the voice to more people.
const CB_REACH_ORDER = Object.freeze(['5', '50', '500', 'world']);
const reaches = new Map();
export const registerCbReach = (kind, read) => { reaches.set(kind, read); return () => { if (reaches.get(kind) === read) reaches.delete(kind); }; };
export const cbCurrentReach = () => {
    for (const kind of ['call', 'channel']) { const shown = reaches.get(kind)?.(); if (shown?.shown) return String(shown.range || ''); }
    return '';
};
/** Whether `range` is wider than the reach in force (none in force: any reach is). */
export const cbReachWidens = (range, current = cbCurrentReach()) => CB_REACH_ORDER.indexOf(String(range)) > CB_REACH_ORDER.indexOf(String(current));
// Asked only for such an input: accepting a call (refusing one is the person's request done at once); widening the reach
// (user, 19 Nov. 2026, choice (b): « Redemander pour élargir »; a reach equal or narrower is done at once).
export const CB_CONFIRMED_WHEN = Object.freeze({
    'communication.cb.call.respond': input => input?.accept === true,
    'communication.cb.range': input => cbReachWidens(input?.range)
});
// Toward another person: asked again even when the person asked the assistant (AGENTS.md rule 22, mcp_confirmation_gate.js).
export const CB_OUTWARD_COMMANDS = Object.freeze(['communication.cb.range', 'communication.cb.call.respond', 'communication.bottle.launch',
    'communication.bottle.reply']);
export const validateCbInput = (action, input) => {
    const contract = CB_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const CB_ASSISTANT_INSTRUCTIONS = 'CB sociale: « mets la CB sur le 19 » communication.cb.tune {channel: 19}; « lance un scan » communication.cb.scan; « portée 50 km » communication.cb.range {range: "50"} (« le monde » world); « ferme la CB » communication.cb.leave; « je suis dispo pour un appel » communication.cb.call.available {on: true}, « cherche quelqu\'un » {on: true, search: true}; an invitation to an Appel: communication.cb.call.respond with the person\'s own answer, never chosen for them; « termine l\'appel » communication.cb.call.end (a bare « raccroche » or « quitte » still dismisses the assistant); « écris une bouteille : … » read the text back, then communication.bottle.launch once they say yes; « attrape une bouteille » communication.bottle.catch then « lis-la » communication.bottle.open; « garde-la » / « relâche-la » communication.bottle.decide; « mes bouteilles » communication.bottle.list. Never speak on a channel, never accept the recording notice: those are the person\'s alone.';
export const cbError = (error) => {
    const code = String(error?.code || error?.message || error || '').split(':')[0];
    if (code === 'auth_session_required' || code === 'AUTH_REQUIRED') return 'AUTH_REQUIRED';
    if (CB_ERRORS.includes(code) || /^cb_[a-z0-9_]+$/.test(code)) return code;
    return 'CB_FAILED';
};
