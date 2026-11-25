import { validateParams } from '../ai/agent_gateway_normalize.js';

// The MIDI sync (R-379, Réglages › Avancé › Synchro): one contract for runtime V2, AI discovery and direct MCP calls,
// run by eVe/domains/midi/midi_sync_commands.js on the person's settings (eVe/domains/midi/midi_sync_settings.js) — the
// owner the panel reads. A device is named by its MIDI port name, as the panel lists it.
export const MIDI_SYNC_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'HOST_UNSUPPORTED', 'WRITE_FAILED']);

const name = { type: 'string', minLength: 1, maxLength: 200 };
const device = { type: 'object', properties: { name: { type: 'string' }, clock: { type: 'boolean' }, transport: { type: 'boolean' },
    offset_ms: { type: 'integer' } } };
const definitions = {
    status: [{}, [], 'Who gives the tempo (master: an input device\'s name, empty for eVe itself; follow: its starts and stops followed), the tempo read from it, and each output device with what it receives (clock, transport: Start, Continue, Stop and the song position, offset_ms: how much earlier they leave). The input devices are listed too.', false, 'read'],
    master: [{ port: { type: 'string', maxLength: 200 }, follow: { type: 'boolean' } }, [],
        'Choose who gives the tempo: port an input device\'s name (« synchronise-toi sur la Digitakt »), empty for eVe itself (« Interne »); follow: whether its starts and stops drive the transport.', true, 'write'],
    output: [{ name, clock: { type: 'boolean' }, transport: { type: 'boolean' }, offset_ms: { type: 'integer', minimum: 0, maximum: 89 } }, ['name'],
        'What an output device receives from eVe: clock (24 ticks a beat), transport (« envoie le départ à la boîte à rythmes »), offset_ms (0 to 89, earlier for a late device). Only the values given change.', true, 'write']
};
export const MIDI_SYNC_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `midi_sync.${action}`, action, description, persistent, capability: `midi_sync.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: MIDI_SYNC_ERRORS },
        master: { type: 'string' }, follow: { type: 'boolean' }, tempo: { type: 'number' },
        outputs: { type: 'array', items: device }, inputs: { type: 'array', items: { type: 'string' } }, output: device } }
})));

export const validateMidiSyncInput = (action, input) => {
    const contract = MIDI_SYNC_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};

export const MIDI_SYNC_ASSISTANT_INSTRUCTIONS = 'MIDI sync: « qui donne le tempo ? » calls midi_sync.status; '
    + '« synchronise-toi sur la Digitakt » midi_sync.master with that input\'s name (read midi_sync.status for the names), '
    + '« reprends le tempo » midi_sync.master with an empty port; « envoie l\'horloge et le départ à la TR-8 » '
    + 'midi_sync.output clock and transport true on that output.';
