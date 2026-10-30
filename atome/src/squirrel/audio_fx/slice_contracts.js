// The Slice tool's and the sample editor's commands (todo/sampler_cahier_des_charges_2026-10-29.md
// §6, §8, §10), on any audio atome (Q19): each screen action said by the voice or an MCP call. They
// join the audio_fx family (instruments and effects are one, synthe_sampler_briques §6) and are run by
// eVe/domains/sample_edit/sample_edit_commands.js#SAMPLE_EDIT_ACTIONS through the pure kernel of
// eVe/domains/sample_edit/ (slice points, edit list, offline render). Positions are source frames for
// points and slices, frames of the edit for edit selections (warp markers then stretch the source windows they
// cover, keeping the length); ends are exclusive.
export const SAMPLE_EDIT_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'NOT_FOUND', 'POINT_EXISTS', 'POINT_LOCKED',
    'POINT_ORDER', 'TEMPO_REQUIRED', 'EMPTY_RANGE', 'STRETCH_UNAVAILABLE', 'DECODE_FAILED', 'PLAY_FAILED', 'NOTHING_TO_UNDO', 'WRITE_FAILED']);

const text = { type: 'string', minLength: 1, maxLength: 200 };
const frame = { type: 'integer', minimum: 0 };
const note = { type: 'integer', minimum: 0, maximum: 127 };
const media = { ...text, description: 'The audio atome (a sound of the Médiathèque, a clip\'s sound, a Sampler sample).' };
const slice = { type: 'integer', minimum: 0, description: 'A slice by its index (0 the first), as slice_read lists them.' };
const magnet = { type: 'string', enum: ['free', 'beat', '1/8', '1/16'], description: 'Aimant: the point is drawn to the tempo\'s beats, eighths or sixteenths.' };
const definitions = {
    slice_read: [{ media_atome_id: media }, ['media_atome_id'],
        'Read the Slice tool of a sound: its points (frame, origin division / dynamics / hand, locked, warp_at), the slices they make, the edit\'s pieces, its length and tempo.', false, 'read'],
    slice_tempo_set: [{ media_atome_id: media, bpm: { type: 'number', minimum: 20, maximum: 999 }, origin_frame: frame }, ['media_atome_id', 'bpm'],
        'The sound\'s tempo (and the frame of its first beat) that the grid division and the magnet follow.', true, 'write'],
    slice_divide: [{ media_atome_id: media, parts: { type: 'integer', minimum: 2, maximum: 1024 }, step: { type: 'string', enum: ['bar', 'beat', '1/8', '1/16', '1/32'] },
        beats_per_bar: { type: 'integer', minimum: 1, maximum: 32 }, slice, start: frame, end: frame }, ['media_atome_id'],
        'Divide in equal parts (parts) or on the musical grid of the known tempo (step), the whole sound or one slice (slice) or a range: only the division\'s own points in that range are replaced, so « divide in 4 then this part in 4 » keeps the first cuts.', true, 'write'],
    slice_detect: [{ media_atome_id: media, sensitivity: { type: 'number', minimum: 0, maximum: 1 }, min_gap_ms: { type: 'number', minimum: 0, maximum: 10000 }, slice, start: frame, end: frame },
        ['media_atome_id'], 'Cut at the attacks (dynamics) with a sensitivity 0..1 (0.5 unless given) and a minimum gap (55 ms unless given); only the dynamics\' own points in the range are replaced.', true, 'write'],
    slice_point_add: [{ media_atome_id: media, frame, zero_crossing: { type: 'boolean' }, magnet }, ['media_atome_id', 'frame'],
        'Put a point by hand at a source frame (drawn to the nearest zero crossing or by the magnet when asked).', true, 'write'],
    slice_point_move: [{ media_atome_id: media, point_id: text, frame, mode: { type: 'string', enum: ['cut', 'warp'] }, magnet, zero_crossing: { type: 'boolean' } },
        ['media_atome_id', 'point_id', 'frame'],
        'Move a point: cut (Couper, the cut moves in the source) or warp (the point is a warp marker: its sound lands at frame, the part before stretches, the part after shrinks, rendered in the cache, source untouched). It becomes a hand point.', true, 'write'],
    slice_point_remove: [{ media_atome_id: media, point_id: text }, ['media_atome_id', 'point_id'], 'Remove a point (a locked one is unlocked first).', true, 'write'],
    slice_point_lock: [{ media_atome_id: media, point_id: text, locked: { type: 'boolean' } }, ['media_atome_id', 'point_id', 'locked'],
        'Lock a point (it becomes a hand point, no method replaces it, it does not move) or unlock it.', true, 'write'],
    slices_make: [{ media_atome_id: media }, ['media_atome_id'],
        'Make each slice a sample of its own: one audio_slice atome per slice, referencing the source and its region (never a copy). Returns slice_atome_ids.', true, 'write'],
    slices_to_keys: [{ media_atome_id: media, instrument_id: text, note }, ['media_atome_id', 'instrument_id'],
        'Put the slices on a Sampler instrument, one per key from note (36 unless given): a kit in one gesture. Returns zone_ids.', true, 'write'],
    slices_to_round_robin: [{ media_atome_id: media, instrument_id: text, note, velocity: { type: 'integer', minimum: 1, maximum: 127 },
        draw: { type: 'string', enum: ['cycle', 'random', 'random_no_repeat'] } }, ['media_atome_id', 'instrument_id', 'note'],
        'Put the slices on one zone of a Sampler instrument at note, played in turn (cycle, random, random without repeat).', true, 'write'],
    slices_to_midi: [{ media_atome_id: media, project_id: text, note }, ['media_atome_id', 'project_id'],
        'A MIDI clip in the project replaying the slices in their original order and timing at the sound\'s tempo (slice i on note + i, 36 unless given): change its tempo without stretching, rearrange it. Needs the tempo (slice_tempo_set). Returns media_atome_id.', true, 'write'],
    slices_to_cells: [{ media_atome_id: media, project_id: text, track_id: text }, ['media_atome_id', 'project_id'],
        'Each slice into a cell of the project: a Scene per slice laid after the last one, the slice a clip of that Scene on track_id (the first content track unless given), its source window the slice\'s region (nothing copied). Returns scene_ids, clip_ids, track_id.', true, 'write'],
    edit_from_slices: [{ media_atome_id: media }, ['media_atome_id'],
        'Lay the edit as the slices, one piece each, so a slice can be removed, moved, duplicated, reversed, set apart (edit_apply with index).', true, 'write'],
    edit_apply: [{ media_atome_id: media, op: { type: 'string', enum: ['cut', 'copy', 'paste', 'silence', 'trim', 'fade_in', 'fade_out', 'reverse', 'gain', 'normalize',
        'remove_dc', 'stretch', 'pitch', 'piece_remove', 'piece_move', 'piece_duplicate'] }, start: frame, end: frame, at: frame, gain_db: { type: 'number', minimum: -96, maximum: 48 },
        semitones: { type: 'number', minimum: -24, maximum: 24 },
        target_db: { type: 'number', minimum: -60, maximum: 0 }, ratio: { type: 'number', minimum: 0.25, maximum: 4 }, index: { type: 'integer', minimum: 0 }, to: { type: 'integer', minimum: 0 } },
        ['media_atome_id', 'op'],
        'A non-destructive edit of the sound: on the selection start..end (frames of the edit, before warp markers) cut, copy, silence, trim, fade_in, fade_out, reverse, gain (gain_db), normalize (to target_db, 0 unless given), remove_dc, stretch (ratio, pitch kept), pitch (semitones, length kept); paste at a frame; on a piece (index) piece_remove, piece_move (to), piece_duplicate. The source is never touched.', true, 'write'],
    edit_undo: [{ media_atome_id: media }, ['media_atome_id'], 'Undo the last change of this sound\'s slices or edit made in this session (the project\'s own undo).', true, 'write'],
    sample_analyze: [{ media_atome_id: media, what: { type: 'string', enum: ['end_silence', 'loop', 'root'] }, start: frame, end: frame, apply: { type: 'boolean' } },
        ['media_atome_id', 'what'],
        'Analyze the edited sound: end_silence (where it really ends; apply trims it), loop (the best loop near start..end, at zero crossings, with its score), root (its root note, by the local Basic Pitch transcriber).', false, 'read'],
    sample_play: [{ media_atome_id: media, slice, start: frame, end: frame }, ['media_atome_id'],
        'Listen to a slice of the source, or to the edited sound (start..end of the result, all of it unless given). Writes nothing.', false, 'read'],
    sample_freeze: [{ media_atome_id: media, name: { type: 'string', minLength: 1, maxLength: 80 } }, ['media_atome_id'],
        'Figer: the edited sound becomes a new sound in the person\'s media (32-bit float WAV), its origin kept (source_atome_id). Returns media_atome_id.', true, 'write']
};
export const SAMPLE_EDIT_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `audio_fx.${action}`, action, description, persistent, capability: `audio_fx.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: SAMPLE_EDIT_ERRORS },
        reason: { type: 'string' }, scene_ids: { type: 'array', items: { type: 'string' } }, clip_ids: { type: 'array', items: { type: 'string' } },
        track_id: { type: 'string' }, sample_edit_id: { type: 'string' }, revision: { type: 'number' }, points: { type: 'array', items: { type: 'object' } },
        slices: { type: 'array', items: { type: 'object' } }, pieces: { type: 'array', items: { type: 'object' } }, length: { type: 'integer' },
        tempo: { type: 'object' }, instrument_id: { type: 'string' }, zone_ids: { type: 'array', items: { type: 'string' } },
        slice_atome_ids: { type: 'array', items: { type: 'string' } }, media_atome_id: { type: 'string' }, analysis: { type: 'object' } } }
})));
export const SAMPLE_EDIT_ASSISTANT_INSTRUCTIONS = 'Slice tool and sample editor (any sound): « coupe cette boucle en 8 » calls audio_fx.slice_divide parts 8; '
    + '« redivise la deuxième partie en 4 » slice_divide slice 1 parts 4; « coupe aux attaques » audio_fx.slice_detect; « fais-en un kit » '
    + 'audio_fx.slices_to_keys on an instrument (audio_fx.instrument_create first if none); « dans les cellules » audio_fx.slices_to_cells with the project id; « en clip MIDI » audio_fx.slices_to_midi (the tempo first: '
    + 'audio_fx.slice_tempo_set); « enlève le silence de la fin » audio_fx.sample_analyze what end_silence apply true; « fige-le » audio_fx.sample_freeze; '
    + '« monte la sélection d\'un ton » audio_fx.edit_apply op pitch semitones 2 on its start..end; « coupe la sélection » op cut. '
    + 'Never invent a point_id or a slice index: read audio_fx.slice_read first.';
