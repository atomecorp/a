import { validateParams } from '../ai/agent_gateway_normalize.js';

// The automatic track freeze (R-370, todo/gel_automatique_pistes_2026-11-25.md): one contract for runtime V2, AI
// discovery and direct MCP calls, run by eVe/domains/audio_freeze/freeze_commands.js through the planner
// (freeze_planner.js) and the engine's load meter — the owners the screen will read. A track is named by its
// track_id in the project open.
export const AUDIO_FREEZE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_OPEN', 'NOT_FOUND', 'HOST_UNSUPPORTED', 'WRITE_FAILED']);

const text = { type: 'string', minLength: 1, maxLength: 200 };
const definitions = {
    load: [{}, [], 'The audio engine\'s load now: load and peak (1.0 = the render takes as long as the sound: past it, the sound breaks up), each track\'s share (loads, what thawing it would cost), the tracks frozen and the memory their stems take.', false, 'read'],
    report: [{}, [], 'How the last runs went (« comment s\'est passée la répétition ? »): for each of the last five playbacks, its end, its peak load, how many tracks played frozen.', false, 'read'],
    prepare: [{}, [], '« Prépare le concert »: every track that is not hot now (armed, live, chosen, its notes drawn at random, set to always live) is rendered and frozen, those worked on lately included.', false, 'write'],
    status: [{}, [], 'The tracks frozen (track_id, how far heard through its stem: 1 frozen, between a fade), the renders under way and whether the automatic freeze is on.', false, 'read'],
    enable: [{ on: { type: 'boolean' } }, ['on'], 'Turn the automatic freeze on (default) or off for this account; off, every track plays live.', true, 'write'],
    track_policy: [{ track_id: text, policy: { type: 'string', enum: ['auto', 'live'] } }, ['track_id', 'policy'],
        'How a track takes the automatic freeze: auto (frozen while nobody works on it) or live (« toujours en direct »: never frozen).', true, 'write']
};
export const AUDIO_FREEZE_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `audio_freeze.${action}`, action, description, persistent, capability: `audio_freeze.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: AUDIO_FREEZE_ERRORS },
        load: { type: 'number' }, peak: { type: 'number' }, enabled: { type: 'boolean' },
        loads: { type: 'array', items: { type: 'object', properties: { track_id: { type: 'string' }, load: { type: 'number' } } } },
        frozen: { type: 'array', items: { type: 'object', properties: { track_id: { type: 'string' }, mix: { type: 'number' } } } },
        runs: { type: 'array', items: { type: 'object', properties: { ended_at: { type: 'string' }, peak: { type: 'number' }, frozen: { type: 'integer' }, tracks: { type: 'integer' } } } },
        used_bytes: { type: 'integer' }, budget_bytes: { type: 'integer' } } }
})));

export const validateAudioFreezeInput = (action, input) => {
    const contract = AUDIO_FREEZE_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};

export const AUDIO_FREEZE_ASSISTANT_INSTRUCTIONS = 'Track freeze: tracks nobody works on are played from a render made '
    + 'while the project is stopped, so the processor keeps room. « où en est le processeur ? » calls audio_freeze.load; '
    + '« comment s\'est passée la répétition ? » audio_freeze.report; « prépare le concert » audio_freeze.prepare; '
    + '« garde la guitare toujours en direct » audio_freeze.track_policy live on that track (read the timeline for its track_id); '
    + '« arrête le gel automatique » audio_freeze.enable false.';
