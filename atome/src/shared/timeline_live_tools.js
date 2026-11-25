// The multitrack's live tools (heard or read at once, never written in the history): what the screen does by a gesture
// that had no command (rule 22, the gaps of tests/parcours_musique/commandes_vocales.md §13). Each is `eve.timeline.<verb>`
// for the assistant and `ui.timeline.<verb>` for the runtime and MCP (eVe/intuition/tools/timeline_live_actions.js).
const id = { type: 'string', minLength: 1 };
const groupId = { ...id, description: 'Molecule (group) id; the active Molecule when omitted.' };
const closed = (properties = {}, required = []) => ({
    type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {})
});
const seconds = { type: 'number', minimum: 0 };

/** [verb, description, capability, risk, input schema] */
export const TIMELINE_LIVE_TOOLS = Object.freeze([
    ['input.calibrate', 'Calibrer (Réglages › Avancé): measure the latency of the audio input a take opens (the chosen track\'s own, else the one in use) and keep it for every later take.',
        'timeline.write', 'moderate', closed({ group_id: groupId, track_id: { ...id, description: 'The track whose own input is measured; the input in use when omitted.' } })],
    ['input.level', 'Read the level of the audio input a track\'s take opens (its « Niveau »), over duration_ms, without hearing nor recording it: peak dB of both channels and of each; -120 is silence.',
        'timeline.read', 'low', closed({ group_id: groupId, track_id: id, duration_ms: { type: 'integer', minimum: 100, maximum: 5000 } }, ['track_id'])],
    ['mix.levels', 'Read the console\'s live output levels (each strip\'s edges, in dB) and its modules\' readings (a compressor\'s reduction, a tuner\'s note…), of strip_ids when given; nothing while nothing plays.',
        'timeline.read', 'low', closed({ group_id: groupId, strip_ids: { type: 'array', items: id } })],
    ['cells.bend', 'Bend the pitch of a cell played chromatically (its MIDI keyboard\'s pitch wheel): value 0..16383, 8192 centred; its bend_range gives the semitones.',
        'timeline.write', 'low', closed({ group_id: groupId, scene_id: id, track_id: id, value: { type: 'integer', minimum: 0, maximum: 16383 } }, ['scene_id', 'track_id', 'value'])],
    ['scene.gain', 'Set a Scene\'s gain in dB heard at once (its Master, in the Timeline and the cells playing), as the Scene\'s hold menu does while it moves; scene.update { gain_db } keeps it.',
        'timeline.write', 'low', closed({ group_id: groupId, scene_id: id, gain_db: { type: 'number', minimum: -60, maximum: 12 } }, ['scene_id', 'gain_db'])],
    ['transport.cue', 'Cue the stopped transport at seconds (the playhead when omitted): its picture shown and its sound ready there, as the console does before Lecture.',
        'timeline.write', 'low', closed({ group_id: groupId, seconds })],
    ['transport.preview', 'Hear a short grain of what lies at seconds, as the playhead dragged while stopped does (audio false: its picture only); transport.seek moves the playhead.',
        'timeline.write', 'low', closed({ group_id: groupId, seconds, audio: { type: 'boolean' } }, ['seconds'])],
    ['midi.note.preview', 'Hear a note of a MIDI clip at once on the route it plays to, as a touched pad or a piano roll key: pitch 0..127 or drum (kit sound); count repeats it every every_ms (Répét.).',
        'timeline.write', 'low', closed({
            group_id: groupId, clip_id: id, pitch: { type: 'integer', minimum: 0, maximum: 127 },
            drum: { type: 'string', enum: ['kick', 'snare', 'clap', 'hat', 'open_hat', 'tom_low', 'tom_mid', 'tom_high', 'crash', 'ride', 'rim', 'cowbell'] },
            velocity: { type: 'integer', minimum: 1, maximum: 127 }, count: { type: 'integer', minimum: 1, maximum: 64 },
            every_ms: { type: 'integer', minimum: 40, maximum: 2000 }
        }, ['clip_id'])]
]);

export const TIMELINE_LIVE_TOOL_SCHEMAS = Object.freeze(Object.fromEntries(TIMELINE_LIVE_TOOLS.map(([verb, , , , schema]) => [verb, schema])));
export const TIMELINE_LIVE_VERBS = Object.freeze(TIMELINE_LIVE_TOOLS.map(([verb]) => verb));
