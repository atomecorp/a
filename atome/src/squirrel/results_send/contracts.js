import { validateParams } from '../ai/agent_gateway_normalize.js';

// « Envoyer mes résultats » (register R-016, lot E; mockup temp/results_panel/mockups/M11_envoi.png validated by the user on
// 2026-10-28, everything ticked by default): the Résultats monitor's cards chosen to send, then Publier. One contract for
// runtime V2, AI discovery, voice and direct MCP calls; every action of the screen runs through it
// (eVe/domains/results_send/results_send_runtime.js). It sends nothing itself: Publier sends (publish.*).
export const RESULTS_SEND_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'PRESENTATION_UNAVAILABLE', 'RESULTS_SEND_SOURCE_MISSING', 'RESULTS_SEND_NOT_OPEN',
    'RESULTS_SEND_NOTHING', 'RESULTS_SEND_KEY_UNKNOWN']);
// A row: a card of the monitor (its key, e.g. rings, glucose, cardio, feeling) or `__name__`, « Mon nom ».
const key = { type: 'string', minLength: 1, maxLength: 80, description: 'A row\'s key as results_send.read lists it; « Mon nom » is __name__.' };
const definitions = {
    open: [{}, [], 'Show « Envoyer mes résultats » on the Dashboard over the open Résultats monitor: on top the exact preview of what leaves (the ticked cards), under « Ce que tu envoies » one row per card of the monitor and « Mon nom », every row ticked. Sends nothing.', 'control'],
    read: [{}, [], 'Read the open sending screen: each row\'s key, label and whether it is ticked. Writes nothing.', 'read'],
    pick: [{ key, checked: { type: 'boolean', description: 'true ticks, false unticks; absent: the row changes.' } }, ['key'],
        'Tick or untick a row of the open sending screen (the preview follows).', 'control'],
    next: [{}, [], '« Suite »: open Publier with the ticked cards as its content (the people, the eVe feed and the person\'s words are chosen there; Publier sends).', 'control'],
    close: [{}, [], 'Close the sending screen (✕), back to the Résultats monitor.', 'control']
};
export const RESULTS_SEND_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, access]]) => Object.freeze({
    name: `results_send.${action}`, action, description, persistent: false, capability: `results_send.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: RESULTS_SEND_ERRORS },
        open: { type: 'boolean' }, rows: { type: 'array', items: { type: 'object', required: ['key', 'label', 'checked'], properties: {
            key: { type: 'string' }, label: { type: 'string' }, checked: { type: 'boolean' } } } } } }
})));
export const validateResultsSendInput = (action, input) => {
    const contract = RESULTS_SEND_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const RESULTS_SEND_ASSISTANT_INSTRUCTIONS = 'Résultats: « envoie mes résultats » (the Résultats monitor open) calls results_send.open; every row starts ticked, the person\'s name and feeling included. « n\'envoie pas mon ressenti », « enlève mon nom » call results_send.pick with that row\'s key from results_send.read and checked false; « suite » calls results_send.next (Publier opens with them: who receives them is chosen there, then publish.* as usual); « annule » calls results_send.close.';
