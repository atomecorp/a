// The Slice tool and the sample editor (todo/sampler_cahier_des_charges_2026-10-29.md
// §3, §6, §8.4), on any audio atome (Q19: Médiathèque, clip, Sampler).
// `sample_edit`: one per audio source and person — its slice points (with their
// origin and lock), the non-destructive edit (pieces of the untouched source)
// and the tempo its grid and magnet follow; its render is a cache recomputed at
// each revision, never stored; « Figer » makes a new sound media (origin kept).
// `audio_slice`: a slice as a sample of its own (Q20): it references its source
// and region, never a copy.
export const SAMPLE_EDIT_ATOME_TYPE = 'sample_edit';
export const AUDIO_SLICE_ATOME_TYPE = 'audio_slice';
export const SLICE_POINTS_MAX = 4096;
export const EDIT_PIECES_MAX = 4096;
export const AUDIO_SLICE_NAME_MAX = 40;

const id = { type: 'string', minLength: 1, maxLength: 200 };
const frame = { type: 'integer', minimum: 0 };
const shape = { type: 'object', required: ['frames', 'sample_rate', 'channels'], properties: {
    frames: { type: 'integer', minimum: 2 }, sample_rate: { type: 'integer', minimum: 8000, maximum: 384000 },
    channels: { type: 'integer', minimum: 1, maximum: 32 } } };
const owned = { created_at: { type: 'string' }, access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] } };

export const SAMPLE_EDIT_TYPE = Object.freeze({ type: SAMPLE_EDIT_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    source_atome_id: id,
    // The source as the engine reads it: positions are its frames.
    source: shape,
    points: { type: 'array', maxItems: SLICE_POINTS_MAX, items: { type: 'object', required: ['id', 'frame', 'origin'], properties: {
        id, frame, origin: { type: 'string', enum: ['division', 'dynamics', 'hand'] }, locked: { type: 'boolean' }, warp_at: frame } } },
    pieces: { type: 'array', minItems: 1, maxItems: EDIT_PIECES_MAX, items: { type: 'object', required: ['kind'], properties: {
        kind: { type: 'string', enum: ['source', 'silence'] }, start: frame, end: frame, frames: frame, reverse: { type: 'boolean' },
        gain_db: { type: 'number' }, stretch: { type: 'number' }, pitch: { type: 'number' }, dc: { type: 'boolean' }, ramps: { type: 'array' } } } },
    tempo: { type: 'object', required: ['bpm'], properties: { bpm: { type: 'number', minimum: 20, maximum: 999 }, origin_frame: frame } },
    // The sounds Figer made from it.
    frozen: { type: 'array', items: id },
    revision: { type: 'number', minimum: 0 },
    ...owned
} });

export const AUDIO_SLICE_TYPE = Object.freeze({ type: AUDIO_SLICE_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    name: { type: 'string', minLength: 1, maxLength: AUDIO_SLICE_NAME_MAX },
    source_atome_id: id,
    sample_edit_id: id,
    index: { type: 'integer', minimum: 0 },
    // Its region of the source: start inclusive, end exclusive, in source frames.
    start: frame,
    end: { type: 'integer', minimum: 1 },
    sample_rate: shape.properties.sample_rate,
    channels: shape.properties.channels,
    ...owned
} });
