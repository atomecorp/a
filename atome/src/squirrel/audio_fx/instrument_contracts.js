// The Sampler's commands (todo/sampler_cahier_des_charges_2026-10-29.md §10): instruments and effects are one family
// (synthe_sampler_briques §6), so these join AUDIO_FX_COMMANDS (contracts.js), run by
// eVe/domains/audio_fx/instrument_commands.js. Each screen action of the Sampler has its command; the instrument itself
// follows eVe/intuition/tools/molecule/kernel/instrument_schema.js and every change runs through instrument_operations.js.
export const INSTRUMENT_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'NOT_FOUND', 'INVALID_INSTRUMENT',
    'PLACE_OCCUPIED', 'STRETCH_UNAVAILABLE', 'PLAY_FAILED', 'WRITE_FAILED']);

const text = { type: 'string', minLength: 1, maxLength: 200 };
const note = { type: 'integer', minimum: 0, maximum: 127 };
const velocity = { type: 'integer', minimum: 1, maximum: 127 };
const range = { type: 'array', minItems: 2, maxItems: 2, items: note };
const take = { type: 'integer', minimum: 0, maximum: 1000 };
const frame = { type: 'integer', minimum: 0 };
const media = { type: 'array', minItems: 1, maxItems: 128, uniqueItems: true, items: text };
const loop = { type: ['object', 'null'], additionalProperties: false, required: ['start', 'end'], properties: {
    start: frame, end: frame, mode: { type: 'string', enum: ['continuous', 'sustain'] }, ping_pong: { type: 'boolean' },
    crossfade: frame, count: { type: 'integer', minimum: 0, maximum: 1000000 } },
    description: 'Loop start (inclusive) and end (exclusive) in source frames; continuous loops to the note\'s end, sustain while the key is held (the rest then plays as the release); crossfade = equal-power splice frames (round loops only); count = passes, 0 for ever. null: no loop.' };
const stack = { type: 'object', additionalProperties: false, required: ['kind'], properties: {
    kind: { type: 'string', enum: ['alternate', 'mix', 'layers'] }, draw: { type: 'string', enum: ['cycle', 'random', 'random_no_repeat'] },
    levels: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'number', minimum: 0, maximum: 1 } }, crossfade: { type: 'integer', minimum: 0, maximum: 127 } },
    description: 'How the zone\'s takes play: alternate (round-robin by draw), mix (together, one level 0..1 per take, 4 takes at most) or layers (sharing the zone\'s velocities, crossfade = seam width in velocity steps).' };
// A composed note (cahier sampler §7.3) and the markers of its segments (§7.1); the kernel's vocabulary
// (eVe/intuition/tools/molecule/kernel/sample_follow_actions.js) checks every value again.
const stepId = { type: 'string', minLength: 1, maxLength: 64 };
const draw = { type: 'string', enum: ['one', 'cycle', 'random', 'random_no_repeat', 'velocity', 'note'],
    description: 'How a step picks its segment: one (its single segment), cycle, random, random_no_repeat, velocity (spread across the velocity) or note (spread across the zone\'s notes).' };
const trigger = { type: 'object', additionalProperties: false, required: ['kind'], properties: {
    kind: { type: 'string', enum: ['segment_end', 'marker', 'passes', 'note_off', 'legato', 'velocity', 'controller', 'duration'] },
    marker_id: stepId, count: { type: 'integer', minimum: 1, maximum: 1000000 }, above: { type: 'number', minimum: 0, maximum: 127 },
    number: { type: 'integer', minimum: 0, maximum: 127 }, ms: { type: 'number', minimum: 1, maximum: 600000 } },
    description: 'When the transition fires: segment_end, marker (marker_id crossed), passes (count loop passes), note_off, legato (a new note while held), velocity (above 1..127), controller (number above 0..1), duration (ms since the step began).' };
const follow = { type: 'object', additionalProperties: false, required: ['type'], properties: {
    type: { type: 'string', enum: ['next', 'previous', 'stop', 'repeat', 'target', 'random', 'jump_marker', 'draw', 'note_off', 'fade'] },
    target_step: stepId, marker_id: stepId },
    description: 'What follows: the Timeline cells\' next, previous, stop, repeat, target (target_step), random, and the sample\'s own jump_marker (marker_id, carried by every segment of the step), draw (another segment of the step), note_off, fade.' };
const location = { zone_id: text, step_id: stepId, release: { type: 'boolean' }, take };
const markerFields = { kind: { type: 'string', enum: ['slice', 'loop_point', 'action'] },
    when: { type: 'object', additionalProperties: false, required: ['kind'], properties: {
        kind: { type: 'string', enum: ['once', 'every_pass', 'every_n', 'at_nth', 'once_per_voice'] }, n: { type: 'integer', minimum: 1, maximum: 1000000 } },
        description: 'When it fires: once (the instrument\'s first crossing), every_pass, every_n (n), at_nth (n), once_per_voice.' },
    action: { type: ['object', 'null'], additionalProperties: false, required: ['command'], properties: { command: text, input: { type: 'object' } },
        description: 'The eVe command it runs (family.action) with its input, outside the audio thread; null: none.' },
    priority: { type: 'integer', minimum: -100, maximum: 100 }, delay_ms: { type: 'number', minimum: 0, maximum: 60000 } };
const segmentHelp = 'The segment is a step\'s (step_id), else a release take (release true), else a take; take is its index.';
const definitions = {
    instrument_create: [{ name: text, strip_id: text }, ['name'], 'Create an empty Sampler instrument: a strip whose input plays notes (strip_id: an existing chain it becomes the input of). Returns instrument_id.', true, 'write'],
    instrument_update: [{ instrument_id: text, name: text, favorite: { type: 'boolean' } }, ['instrument_id'], 'Rename an instrument of Mes instruments, or add it to or take it from the favourites.', true, 'write'],
    instrument_delete: [{ instrument_id: text }, ['instrument_id'], 'Delete an instrument of Mes instruments (its chains stop playing it); its sounds stay in the person\'s media.', true, 'write'],
    instrument_read: [{ instrument_id: text }, ['instrument_id'], 'Read an instrument: its settings (params), samples and zones with their takes, stack, cuts and release takes.', false, 'read'],
    samples_place: [{ instrument_id: text, media_atome_ids: media, note, velocity, spread: { type: 'string', enum: ['fit', 'keys', 'velocities', 'notes', 'alternate'] } },
        ['instrument_id', 'media_atome_ids', 'note', 'velocity', 'spread'],
        'Drop sounds (the person\'s audio media) on a free place of the key × velocity map at note and velocity. One sound: fit (the larger free rectangle around), keys (along the free notes) or velocities (every free velocity of that note). Several: notes (one per free note from there), velocities (stacked as velocity layers) or alternate (one zone, round-robin). Returns the zones made.', true, 'write'],
    zone_drop: [{ instrument_id: text, zone_id: text, media_atome_ids: media, mode: { type: 'string', enum: ['alternate', 'mix', 'layers', 'replace'] } },
        ['instrument_id', 'zone_id', 'media_atome_ids', 'mode'],
        'Drop sounds on a zone: they take turns with its takes (alternate), play with them (mix), share its velocities (layers) or replace them.', true, 'write'],
    zone_set: [{ instrument_id: text, zone_id: text, keys: range, velocities: range, gain_db: { type: 'number', minimum: -60, maximum: 12 }, stack,
        cuts: { type: 'array', maxItems: 128, uniqueItems: true, items: text }, release_decay_s: { type: 'number', minimum: 0.001, maximum: 60 }, borrow_neighbours: { type: 'boolean' },
        output: { type: 'integer', minimum: 0, maximum: 15 } },
        ['instrument_id', 'zone_id'],
        'Set a zone: its notes and velocities, level, stack, the zones it cuts when it plays (choke, one way: « la charleston fermée coupe l\'ouverte »), how fast its release takes fade with the time held, whether its round-robin borrows the neighbour zones\' takes, and the output it sounds on (0-based, 0 is « Sortie 1 »; the output just past the instrument\'s last opens a new one, 16 at most; a chain plays it with audio_fx.set_input).', true, 'write'],
    zone_remove: [{ instrument_id: text, zone_id: text }, ['instrument_id', 'zone_id'], 'Remove a zone from the map; the zones that cut it forget it.', true, 'write'],
    take_set: [{ instrument_id: text, zone_id: text, take, start: frame, end: frame, offset: frame, velocity_offset: frame, root: note,
        tune_cents: { type: 'number', minimum: -1200, maximum: 1200 }, gain_db: { type: 'number', minimum: -60, maximum: 12 }, pan: { type: 'number', minimum: -1, maximum: 1 },
        playback: { type: 'string', enum: ['forward', 'reverse'] }, loop, stretch: { type: 'number', minimum: 0.25, maximum: 4 } },
        ['instrument_id', 'zone_id', 'take'],
        'Set how a take reads its sample: region start and end (exclusive) in source frames, start offset (plus velocity_offset × velocity), root note and tuning, level and pan, direction, loop, and duration apart from pitch (stretch ×0.25..×4, shared by the zone\'s takes; refused where the engine has no real-time stretch: STRETCH_UNAVAILABLE).', true, 'write'],
    take_remove: [{ instrument_id: text, zone_id: text, take }, ['instrument_id', 'zone_id', 'take'], 'Remove a take from its zone (a zone keeps one).', true, 'write'],
    release_takes_set: [{ instrument_id: text, zone_id: text, media_atome_ids: { ...media, minItems: 0 } }, ['instrument_id', 'zone_id', 'media_atome_ids'],
        'The sounds a zone plays when its key is let go (a damper, a fret noise), quieter the longer the key was held; an empty list removes them.', true, 'write'],
    params_set: [{ instrument_id: text, gain_db: { type: 'number', minimum: -60, maximum: 12 }, attack_ms: { type: 'number', minimum: 0.1, maximum: 10000 },
        decay_ms: { type: 'number', minimum: 1, maximum: 10000 }, sustain: { type: 'number', minimum: 0, maximum: 1 }, release_ms: { type: 'number', minimum: 1, maximum: 20000 },
        velocity_sense: { type: 'number', minimum: 0, maximum: 1 }, tune_cents: { type: 'number', minimum: -1200, maximum: 1200 }, glide_ms: { type: 'number', minimum: 0, maximum: 5000 },
        polyphony: { type: 'integer', minimum: 1, maximum: 128 }, mode: { type: 'string', enum: ['poly', 'mono', 'legato'] }, bend_range: { type: 'number', minimum: 0, maximum: 48 } },
        ['instrument_id'], 'Set the instrument\'s own settings: level, envelope (attack, decay, sustain, release), velocity sensitivity, tuning, glide, polyphony, voice mode (poly, mono, legato) and pitch-bend range.', true, 'write'],
    facade_set: [{ instrument_id: text, facade: { type: 'array', maxItems: 13, items: { type: 'object', properties: {
        param: { type: 'string', enum: ['gain_db', 'attack_ms', 'decay_ms', 'sustain', 'release_ms', 'velocity_sense', 'tune_cents', 'glide_ms', 'polyphony', 'bend_range'] },
        macro: { type: 'object', required: ['name', 'targets'], properties: { name: text, targets: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object',
            required: ['param', 'depth'], properties: { param: { type: 'string' }, depth: { type: 'number', minimum: -1, maximum: 1 } } } } } },
        value: { type: 'number', minimum: 0, maximum: 1 } } } } }, ['instrument_id', 'facade'],
    'Set the instrument\'s façade, what it shows when opened (Débutant, Exécution, the assistant): its settings in order, each a parameter ({ param }) or a macro ({ macro: { name, targets: [{ param, depth -1..1 }] }, value 0..1 }) moving several parameters from their own setting by depth × their range. « fais une macro Douceur qui allonge l\'attaque et le relâché » = a macro with those two targets.', true, 'write'],
    note_play: [{ instrument_id: text, note, velocity, duration_ms: { type: 'integer', minimum: 1, maximum: 60000 } }, ['instrument_id', 'note'],
        'Audition a note on the instrument (velocity 89 and 610 ms unless given). Writes nothing.', false, 'read'],
    composed_set: [{ instrument_id: text, zone_id: text, composed: { type: 'boolean' } }, ['instrument_id', 'zone_id', 'composed'],
        'Turn a zone into a composed note (its takes become its first step, step_1) or back (its first step\'s segments become its takes, its transitions go).', true, 'write'],
    composed_step_add: [{ instrument_id: text, zone_id: text, media_atome_ids: media, step_id: stepId, draw, at: take }, ['instrument_id', 'zone_id', 'media_atome_ids'],
        'Add a step of these sounds to a composed note (at its end unless at says where); returns step_id.', true, 'write'],
    composed_step_set: [{ instrument_id: text, zone_id: text, step_id: stepId, draw }, ['instrument_id', 'zone_id', 'step_id', 'draw'], 'Set how a step picks its segment.', true, 'write'],
    composed_step_remove: [{ instrument_id: text, zone_id: text, step_id: stepId }, ['instrument_id', 'zone_id', 'step_id'],
        'Remove a step (a note keeps one) with the transitions that leave it or lead to it.', true, 'write'],
    composed_segment_set: [{ instrument_id: text, ...location, start: frame, end: frame, offset: frame, velocity_offset: frame, root: note,
        tune_cents: { type: 'number', minimum: -1200, maximum: 1200 }, gain_db: { type: 'number', minimum: -60, maximum: 12 }, pan: { type: 'number', minimum: -1, maximum: 1 },
        playback: { type: 'string', enum: ['forward', 'reverse'] }, loop, stretch: { type: 'number', minimum: 0.25, maximum: 4 } },
        ['instrument_id', 'zone_id', 'step_id', 'take'], 'Set how a step\'s segment reads its sample, as audio_fx.take_set does a take (stretch is shared by every segment of the note).', true, 'write'],
    transition_set: [{ instrument_id: text, zone_id: text, index: take, from: { ...stepId, description: 'The step it leaves; absent: any step.' }, trigger, follow,
        fade_ms: { type: 'number', minimum: 0, maximum: 10000 } }, ['instrument_id', 'zone_id', 'trigger', 'follow'],
        'Add a transition to a composed note (or replace the one at index): when trigger fires in the step from, follow, crossfading over fade_ms. « après 3 passages passe au refrain » = trigger passes 3, follow target.', true, 'write'],
    transition_remove: [{ instrument_id: text, zone_id: text, index: take }, ['instrument_id', 'zone_id', 'index'], 'Remove a composed note\'s transition.', true, 'write'],
    marker_add: [{ instrument_id: text, ...location, marker_id: stepId, frame, ...markerFields }, ['instrument_id', 'zone_id', 'take', 'frame'],
        `Put a marker at frame of a segment's source (inside its region): a slice point, a loop point or an action running a command when crossed. ${segmentHelp} Returns marker_id.`, true, 'write'],
    marker_move: [{ instrument_id: text, ...location, marker_id: stepId, frame }, ['instrument_id', 'zone_id', 'take', 'marker_id', 'frame'], `Move a marker to another frame. ${segmentHelp}`, true, 'write'],
    marker_set: [{ instrument_id: text, ...location, marker_id: stepId, ...markerFields }, ['instrument_id', 'zone_id', 'take', 'marker_id'],
        `Set a marker's kind, when it fires, its command, priority (-100..100, first among markers of one frame) and delay. ${segmentHelp}`, true, 'write'],
    marker_remove: [{ instrument_id: text, ...location, marker_id: stepId }, ['instrument_id', 'zone_id', 'take', 'marker_id'],
        `Remove a marker (refused while a transition still needs it). ${segmentHelp}`, true, 'write'],
    validate: [{ instrument: { type: 'object' } }, ['instrument'], 'Check an instrument description without saving it (dry run); returns the normalized instrument or the reason it is refused.', false, 'read']
};
export const INSTRUMENT_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `audio_fx.${action}`, action, description, persistent, capability: `audio_fx.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: INSTRUMENT_ERRORS },
        reason: { type: 'string' }, instrument_id: { type: 'string' }, instrument: { type: 'object' }, facade: { type: 'array' }, zone_ids: { type: 'array', items: { type: 'string' } },
        step_id: { type: 'string' }, marker_id: { type: 'string' } } }
})));
export const INSTRUMENT_ASSISTANT_INSTRUCTIONS = 'Sampler: « fais-moi un kit avec ces 12 sons » calls audio_fx.instrument_create then audio_fx.samples_place '
    + 'with the media ids and spread notes from note 36; « en round-robin » is spread alternate (one zone) or audio_fx.zone_drop mode alternate on a zone; '
    + '« la charleston fermée coupe l\'ouverte » calls audio_fx.zone_set on the closed one with cuts [the open one\'s zone_id]; « boucle ce son tant que la touche est '
    + 'tenue » audio_fx.take_set with loop mode sustain; « plus doux » moves the façade (audio_fx.instrument_read gives it) or audio_fx.params_set. « fais une note composée : attaque, boucle, puis la fin au relâché » calls audio_fx.composed_set then composed_step_add and transition_set (trigger note_off, follow next); « à ce point, lance la lumière » audio_fx.marker_add with an action. Never invent an instrument_id, zone_id, step_id or marker_id: read audio_fx.instrument_read first.';
