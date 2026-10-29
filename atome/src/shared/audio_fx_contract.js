// Audio effects (todo/effets_generateurs_audio L5–L6): the rack is what plays
// live in Capture › Effets (its strips, chains and inputs), one per person,
// back as it was left at the next launch (D1); an audio effect is a chain saved
// as an effect of Mes effets (D6, D9-1): data, never code, linked wherever it
// is placed (its composition is shared, its parameters belong to each instance).
export const AUDIO_RACK_ATOME_TYPE = 'audio_rack';
export const AUDIO_EFFECT_ATOME_TYPE = 'audio_effect';
export const AUDIO_EFFECT_NAME_MAX = 40;
export const AUDIO_EFFECT_MODULES_MAX = 64;

const PRIVATE = Object.freeze({ access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] } });

export const AUDIO_RACK_TYPE = Object.freeze({ type: AUDIO_RACK_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    rack: { type: 'object', required: ['version', 'strips'], properties: {
        version: { type: 'number', enum: [1] },
        strips: { type: 'array', maxItems: 16, items: { type: 'object' } },
        last_input: { type: 'string' },
        chain_count: { type: 'number', minimum: 0 },
        effect_params: { type: 'object' },
        presets: { type: 'object' }
    } },
    revision: { type: 'number', minimum: 0 },
    ...PRIVATE
} });

export const AUDIO_EFFECT_TYPE = Object.freeze({ type: AUDIO_EFFECT_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    name: { type: 'string', minLength: 1, maxLength: AUDIO_EFFECT_NAME_MAX },
    // Its tool's label (≤ 6 letters, AGENTS.md rule 11) and glyph (its first effect's, D20).
    short_name: { type: 'string', maxLength: 6 },
    icon: { type: 'string', maxLength: 64 },
    // Its modules, as a strip's chain (no Volume of the strip); a module may be
    // another audio effect (`user_effect`, D7), flattened when compiled.
    chain: { type: 'array', minItems: 1, maxItems: AUDIO_EFFECT_MODULES_MAX, items: { type: 'object' } },
    origin: { type: 'string', enum: ['user', 'assistant'] },
    revision: { type: 'number', minimum: 0 },
    favorite: { type: 'boolean' },
    created_at: { type: 'string' },
    ...PRIVATE
} });
