import { validateParams } from '../ai/agent_gateway_normalize.js';
import { INSTRUMENT_ASSISTANT_INSTRUCTIONS, INSTRUMENT_COMMANDS } from './instrument_contracts.js';
import { SAMPLE_EDIT_ASSISTANT_INSTRUCTIONS, SAMPLE_EDIT_COMMANDS } from './slice_contracts.js';
import { INSTRUMENT_BANK_ASSISTANT_INSTRUCTIONS, INSTRUMENT_BANK_COMMANDS } from './bank_contracts.js';

// The live effects of Capture › Effets (todo/effets_generateurs_audio L7): one contract for runtime V2, AI discovery
// and direct MCP calls, run by eVe/domains/audio_fx/audio_fx_commands.js through the rack (fx_rack_runtime.js) and
// Mes effets (audio_effect_library.js) — the same owners as the tiles and their panels. An effect is named by its key:
// `dsp:<effect>` (Délai dsp:echo, Ampli dsp:amp, Baffle dsp:convolution, Réverb dsp:reverb…) or `user:<effect id>`
// (Mes effets); a chain by its `strip_id`, a module of it by its `module_id` (audio_fx.catalog gives them).
export const AUDIO_FX_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'NOT_FOUND', 'NOT_LIT', 'NAME_REQUIRED',
    'VOLUME_REQUIRED', 'EFFECT_LOOP', 'PLAY_FAILED', 'WRITE_FAILED', 'HOST_UNSUPPORTED', 'SOURCE_UNAVAILABLE']);

const text = { type: 'string', minLength: 1, maxLength: 200 };
const key = { type: 'string', pattern: '^(dsp|user):[A-Za-z0-9_\\-]+$', maxLength: 200 };
const index = { type: 'integer', minimum: 0, maximum: 64 };
const definitions = {
    catalog: [{}, [], 'What can play and what plays: the effects (key, name, lit), Mes effets (id, name, favorite), Mes instruments (id, name, favorite, lit), the inputs in use and every chain (strip_id, name, on, input, modules with module_id, key, params, bypass).', false, 'read'],
    inputs: [{}, [], 'The audio inputs an effect can play on (device_id, label); « default » is the device\'s own.', false, 'read'],
    start: [{ effect: key, device_id: text }, ['effect'], 'Light an effect: it plays at once on the input in use (or device_id), after the effects already lit on that input. It turns the microphone on.', true, 'write'],
    stop: [{ effect: key, strip_id: text }, [], 'Put an effect out (effect), or a whole chain (strip_id), or everything that plays (neither).', true, 'write'],
    add: [{ strip_id: text, effect: key, index }, ['strip_id', 'effect'], 'Add an effect to a chain, at index (before its Volume when none is given).', true, 'write'],
    move: [{ strip_id: text, module_id: text, to_strip_id: text, index }, ['strip_id', 'module_id', 'index'], 'Move a module to another place of its chain, or of another chain (to_strip_id).', true, 'write'],
    remove: [{ strip_id: text, module_id: text }, ['strip_id', 'module_id'], 'Take a module out of its chain; the chain ends with its last effect.', true, 'write'],
    set_param: [{ effect: key, strip_id: text, module_id: text, param: text, value: { type: 'number' } }, ['param', 'value'],
        'Set a value, in the unit of its parameter (dB, ms, Hz, ratio, 0..1): of an effect (effect) wherever it plays and when lit again, or of one module (strip_id, module_id).', true, 'write'],
    bypass: [{ strip_id: text, module_id: text, bypass: { type: 'boolean' } }, ['strip_id', 'module_id', 'bypass'], 'Let a module through without its effect, or put it back.', true, 'write'],
    set_input: [{ strip_id: text, device_id: text }, ['strip_id', 'device_id'], 'Choose the input a chain plays on (audio_fx.inputs).', true, 'write'],
    save: [{ strip_id: text, name: text, favorite: { type: 'boolean' } }, ['strip_id', 'name'], 'Save a chain as one of Mes effets under its name: the chain becomes that effect.', true, 'write'],
    update: [{ effect_id: text, name: text, favorite: { type: 'boolean' } }, ['effect_id'], 'Rename an effect of Mes effets, or add it to or take it from the favourites.', true, 'write'],
    compose: [{ effect_id: text, effects: { type: 'array', minItems: 1, maxItems: 32, items: key } }, ['effect_id', 'effects'],
        'Give an effect of Mes effets a new composition (its effects in order); everywhere it plays, it plays the new one.', true, 'write'],
    delete: [{ effect_id: text }, ['effect_id'], 'Delete an effect of Mes effets (put out first where it plays).', true, 'write'],
    favorite: [{ effect: key, favorite: { type: 'boolean' } }, ['effect', 'favorite'], 'Mark an effect as a favourite (its tile comes first in Capture › Effets), or no longer.', true, 'write'],
    save_preset: [{ effect: key, name: text, params: { type: 'object', additionalProperties: { type: 'number' } } }, ['effect', 'name'],
        'Save the effect\'s values as a preset under its name (the same name replaces it): its values as they play, or params (a project console module\'s).', true, 'write'],
    tone3000_search: [{ query: { type: 'string', maxLength: 200 }, page: { type: 'integer', minimum: 1, maximum: 999 } }, [],
        'Search the TONE3000 amp captures (an empty query lists the most downloaded): tones with id, title, author, image.', false, 'read'],
    tone3000_models: [{ tone_id: { type: 'integer', minimum: 1 } }, ['tone_id'], 'The models (sizes) of one TONE3000 tone: id, name, size.', false, 'read'],
    tone3000_take: [{ model_id: { type: 'integer', minimum: 1 }, effect: key }, ['model_id'],
        'Bring one TONE3000 model into the person\'s media (once); with effect (dsp:amp), that Ampli plays it at once.', true, 'write']
};
const moduleSchema = { type: 'object', properties: { module_id: { type: 'string' }, key: { type: 'string' }, params: { type: 'object' }, bypass: { type: 'boolean' } } };
const EFFECT_COMMANDS = Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `audio_fx.${action}`, action, description, persistent, capability: `audio_fx.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: AUDIO_FX_ERRORS },
        effects: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, name: { type: 'string' }, lit: { type: 'boolean' } } } },
        my_effects: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, favorite: { type: 'boolean' }, lit: { type: 'boolean' } } } },
        inputs: { type: 'array', items: { type: 'object', properties: { device_id: { type: 'string' }, label: { type: 'string' } } } },
        my_instruments: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, favorite: { type: 'boolean' }, lit: { type: 'boolean' } } } },
        strips: { type: 'array', items: { type: 'object', properties: { strip_id: { type: 'string' }, name: { type: 'string' }, on: { type: 'boolean' },
            device_id: { type: 'string' }, instrument_id: { type: 'string' }, modules: { type: 'array', items: moduleSchema } } } },
        effect_id: { type: 'string' }, asset_id: { type: 'string' },
        tones: { type: 'array', items: { type: 'object' } }, models: { type: 'array', items: { type: 'object' } } } }
}));
// Instruments and effects are one family (synthe_sampler_briques §6): the Sampler's commands join it, with its Slice
// tool and sample editor and its banks.
export const AUDIO_FX_COMMANDS = Object.freeze([...EFFECT_COMMANDS, ...INSTRUMENT_COMMANDS, ...SAMPLE_EDIT_COMMANDS, ...INSTRUMENT_BANK_COMMANDS]);
export const validateAudioFxInput = (action, input) => {
    const contract = AUDIO_FX_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const AUDIO_FX_ASSISTANT_INSTRUCTIONS = 'Live effects: « mets de la réverb sur mon micro » calls audio_fx.start with effect dsp:reverb; « ajoute un délai » '
    + 'audio_fx.start dsp:echo (it joins the chain of that input); « enlève la réverb » audio_fx.stop with that effect; « coupe les effets » audio_fx.stop alone. '
    + '« plus de réverb », « délai plus long » call audio_fx.catalog for the params then audio_fx.set_param on that effect; « enregistre cette chaîne sous Voix '
    + 'radio » audio_fx.save with its strip_id. « cherche un ampli Marshall » audio_fx.tone3000_search, then tone3000_models and '
    + 'tone3000_take with effect dsp:amp; « garde ces réglages sous Clair » audio_fx.save_preset; « mets la réverb en favori » audio_fx.favorite. Never invent a strip_id, module_id or effect id: read audio_fx.catalog first. '
    + INSTRUMENT_ASSISTANT_INSTRUCTIONS + ' ' + SAMPLE_EDIT_ASSISTANT_INSTRUCTIONS + ' ' + INSTRUMENT_BANK_ASSISTANT_INSTRUCTIONS;
