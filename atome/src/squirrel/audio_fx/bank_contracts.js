// The Sampler's bank and automation commands (todo/sampler_cahier_des_charges_2026-10-29.md §8.3, §9, §10, §13):
// import an SFZ, DecentSampler or SF2 bank, arrange loose sounds, export an instrument as SFZ, auto-sample an
// external instrument. Same family and shape as instrument_contracts.js; run by
// eVe/domains/audio_fx/instrument_bank_commands.js (INSTRUMENT_BANK_ACTIONS).
export const INSTRUMENT_BANK_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'NOT_FOUND', 'INVALID_INSTRUMENT', 'WRITE_FAILED',
    'PLAY_FAILED', 'BANK_UNREADABLE', 'BANK_UNSUPPORTED', 'SAMPLE_MISSING', 'ROOT_UNKNOWN', 'CAPTURE_UNAVAILABLE', 'SILENT_CAPTURE', 'INVALID_PLAN']);

const text = { type: 'string', minLength: 1, maxLength: 200 };
const url = { type: 'string', minLength: 1, maxLength: 2048, description: 'An http(s) address of a .sfz, .dspreset or .sf2 file; an SFZ or DecentSampler bank\'s sounds are fetched beside it.' };
const note = { type: 'integer', minimum: 0, maximum: 127 };
const velocity = { type: 'integer', minimum: 1, maximum: 127 };
const media = { type: 'array', minItems: 1, maxItems: 1024, uniqueItems: true, items: text };
const source = { bank_atome_id: { ...text, description: 'The bank file among the person\'s media.' },
    sample_atome_ids: { ...media, minItems: 0, description: 'The person\'s media holding the bank\'s sounds, matched by file name.' }, url };
const definitions = {
    bank_inspect: [source, [], 'Read a sampler bank without importing it (dry run): its format, presets (an SF2 lists all, each with its index, bank and program), region counts, the sounds it names that are missing, and what eVe cannot hold of it (warnings). Give bank_atome_id or url.', false, 'read'],
    bank_import: [{ ...source, name: text, presets: { type: 'array', minItems: 1, maxItems: 1024, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 65535 } },
        flac: { type: 'boolean' }, play: { type: 'boolean' } }, [],
        'Import an SFZ, DecentSampler (.dspreset) or SoundFont 2 (.sf2) bank into Mes instruments (one instrument per SF2 preset; presets: the indices bank_inspect gave, all by default). Its sounds join the person\'s media first, integer WAVs and SF2 samples stored as FLAC (flac false keeps WAVs). Zones, round-robin, cuts, release samples, loops, tuning, level and pan are kept; the envelope becomes the instrument\'s. name: the instrument\'s name when the bank makes one (else the bank\'s or preset\'s). The first instrument plays on a new chain unless play is false. Give bank_atome_id (with sample_atome_ids) or url. Returns instruments [{ instrument_id, name, zone_count, warnings }].', true, 'write'],
    samples_arrange: [{ media_atome_ids: media, instrument_id: text, name: text, middle_c: { type: 'string', enum: ['C4', 'C3'] },
        layer_db: { type: 'number', minimum: 0, maximum: 24 } }, ['media_atome_ids'],
        'Arrange sounds automatically (rangement automatique) on instrument_id, or on a new instrument named name: each sound\'s root from its file name (C4, F#3, Db2, a MIDI number, do3 = 60; middle_c says whether C4 or C3 is 60), else its WAV smpl/acid metadata, else pitch analysis; sounds of one root become velocity layers by measured level (a pp…fff or v3 name wins), those within layer_db (3 dB) of each other or named rr1/rr2 play in turn (round-robin); each root spreads halfway to its neighbours. Returns zone_ids and unplaced sounds (root_unknown).', true, 'write'],
    instrument_export_sfz: [{ instrument_id: text }, ['instrument_id'],
        'Write an instrument as an SFZ bank: returns sfz (the text), files [{ sample_id, path, url }] to save beside it, and warnings for what SFZ says another way (a mix, layers, a one-way cut widened). Writes nothing.', false, 'read'],
    auto_sample: [{ output_id: text, instrument_id: text, channel: { type: 'integer', minimum: 0, maximum: 15 }, name: text, keys: { type: 'array', minItems: 2, maxItems: 2, items: note },
        step: { type: 'integer', minimum: 1, maximum: 127 }, velocities: { type: 'array', minItems: 1, maxItems: 16, uniqueItems: true, items: velocity },
        hold_ms: { type: 'integer', minimum: 1, maximum: 60000 }, tail_ms: { type: 'integer', minimum: 0, maximum: 60000 },
        threshold_db: { type: 'number', minimum: -120, maximum: -1 } }, [],
        'Auto-sample an external instrument on MIDI output output_id, or one of eVe\'s own instruments instrument_id (give one of them): eVe plays every step-th note of keys (36..96 by 3) at each velocity (34, 89, 127), hold_ms held then tail_ms of tail, records the audio input (MIDI) or its own output (an instrument of eVe, stereo; Web only, at most 600 s, else CAPTURE_UNAVAILABLE or INVALID_PLAN), cuts each note at threshold_db and lays a new instrument (each take a region of one recording, answering velocities up to its own). Returns instrument_id, zone_ids, silent notes and how many takes were truncated.', true, 'write']
};
export const INSTRUMENT_BANK_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `audio_fx.${action}`, action, description, persistent, capability: `audio_fx.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: INSTRUMENT_BANK_ERRORS },
        reason: { type: 'string' }, instrument_id: { type: 'string' }, instruments: { type: 'array', items: { type: 'object' } },
        zone_ids: { type: 'array', items: { type: 'string' } }, unplaced: { type: 'array', items: { type: 'object' } }, sfz: { type: 'string' },
        files: { type: 'array', items: { type: 'object' } }, warnings: { type: 'array', items: { type: 'string' } }, missing: { type: 'array', items: { type: 'string' } },
        format: { type: 'string' }, name: { type: 'string' }, presets: { type: 'array', items: { type: 'object' } },
        takes: { type: 'integer' }, silent: { type: 'array', items: { type: 'object' } }, truncated: { type: 'integer' } } }
})));
export const INSTRUMENT_BANK_ASSISTANT_INSTRUCTIONS = 'Sampler banks: « importe cette banque SFZ » calls audio_fx.bank_inspect then audio_fx.bank_import with the same '
    + 'bank_atome_id (and its sounds\' media ids) or url; for an SF2 pick presets from bank_inspect. « range ces sons » calls audio_fx.samples_arrange with '
    + 'the media ids. « exporte en SFZ » calls audio_fx.instrument_export_sfz. « échantillonne mon synthé » calls audio_fx.auto_sample with the MIDI output id, « échantillonne cet instrument » with the instrument_id. '
    + 'Never invent ids: read them first.';
