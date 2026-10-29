// Instruments (todo/sampler_cahier_des_charges_2026-10-29.md §3): a Sampler is
// an `instrument` atome of the person's library (Mes instruments), synced and
// offline like an audio effect. Its sound is its description (the eVe kernel's
// instrument_schema.js): samples are audio atomes it names, never copies; slices,
// edits and stretches are data. A strip plays it when its input names it.
export const INSTRUMENT_ATOME_TYPE = 'instrument';
export const INSTRUMENT_NAME_MAX = 40;
export const INSTRUMENT_ZONES_MAX = 1024;

export const INSTRUMENT_TYPE = Object.freeze({ type: INSTRUMENT_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    name: { type: 'string', minLength: 1, maxLength: INSTRUMENT_NAME_MAX },
    // Its tool's label (≤ 6 letters, AGENTS.md rule 11) and glyph.
    short_name: { type: 'string', maxLength: 6 },
    icon: { type: 'string', maxLength: 64 },
    // The normalized description: { id, kind: 'sampler', seed, params, samples, zones }.
    instrument: { type: 'object', required: ['kind', 'samples', 'zones'], properties: {
        kind: { type: 'string', enum: ['sampler'] },
        samples: { type: 'array', items: { type: 'object' } },
        zones: { type: 'array', maxItems: INSTRUMENT_ZONES_MAX, items: { type: 'object' } }
    } },
    // The settings shown on its façade (cahier Q21): parameter keys and macros.
    facade: { type: 'array', items: { type: 'object' } },
    origin: { type: 'string', enum: ['user', 'assistant', 'import'] },
    revision: { type: 'number', minimum: 0 },
    favorite: { type: 'boolean' },
    created_at: { type: 'string' },
    access: { type: 'string', enum: ['private'] },
    visibility: { type: 'string', enum: ['private'] }
} });
