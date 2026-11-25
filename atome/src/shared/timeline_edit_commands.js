// The command contract of the Molecule timeline's edit verbs (`eve.timeline.<verb>` / `ui.timeline.<verb>`), read from
// their kernel reducers (eVe/intuition/tools/molecule/kernel/*, through session/timeline_operations.js's aliases), so the
// assistant can find and call each one by its fields (rule 22: every screen action by voice). The objects stay open: a
// reducer keeps its own checks and errors; the schema says what it reads. Its description is the tool's description.
const str = (description) => ({ type: 'string', minLength: 1, ...(description ? { description } : {}) });
const num = (description, extra = {}) => ({ type: 'number', ...extra, ...(description ? { description } : {}) });
const int = (description, extra = {}) => ({ type: 'integer', ...extra, ...(description ? { description } : {}) });
const bool = (description) => ({ type: 'boolean', ...(description ? { description } : {}) });
const obj = (description) => ({ type: 'object', ...(description ? { description } : {}) });
const command = (description, properties, required = []) => ({
    type: 'object', description, properties, ...(required.length ? { required } : {})
});

const clipId = str('The clip (timeline.clips[].clip_id of timeline.read).');
const trackId = str('The track (timeline.tracks[].track_id).');
const sectionId = str('The section (timeline.sections[].section_id).');
const sceneId = str('The Scene (timeline.scenes[].scene_id).');
const frame = (description) => int(description, { minimum: 0 });
const cellAt = { scene_id: sceneId, track_id: trackId };
const cellRange = { ...cellAt, from_frame: frame('Range start, in frames from the Scene\'s start.'), to_frame: frame('Range end, in frames from the Scene\'s start.') };
const grid = { type: 'string', enum: ['off', 'bar', 'beat', '1/2beat', '1/4beat', '1/8beat', '1/16beat', '1/32beat'] };
const destination = obj('Where it plays: {kind: main|bus|strip|device|screen|midi_port, id, channel}; null: its track\'s.');
const trackFields = {
    track_id: trackId, section_id: sectionId, name: str(), order: int(), solo: bool(), mute: bool(), record_arm: bool(),
    continue_beyond_section: bool(), quantization: { ...grid, description: 'The track\'s own grid; omitted for the project\'s.' }, loop: obj('The track\'s loop {enabled, start_frame, end_frame}.')
};
const cellSettings = obj('Any of: play_mode (loop|one_shot), trigger (latch|momentary), passes, quantize_start, quantize_end, fade_in_ms, fade_out_ms (attack, release), decay_ms, sustain (0..1), follow_action, midi, speed, reverse, velocity (0..1), resume, repeat, ratchet_count, ratchet_division, chance (0..1), choke_group, name, takes, take_follow, loop_points, loop_region {from_frame,to_frame}, scene_start, play (launch|poly|mono|legato), bend_range, glide_ms, instrument_id.');
const keyframe = { automation_id: str('The automation lane.'), keyframe_id: str('The point.') };

const CLIP = {
    'clip.move': command('Move a clip to start_seconds, on another track when track_id is given.', { clip_id: clipId, start_seconds: num('', { minimum: 0 }), track_id: trackId }, ['clip_id', 'start_seconds']),
    'clip.trim': command('Trim a clip\'s start or end edge to value_seconds on the timeline (Rogner).', { clip_id: clipId, edge: { type: 'string', enum: ['start', 'end'] }, value_seconds: num() }, ['clip_id', 'edge', 'value_seconds']),
    'clip.crop': command('Crop a clip\'s start or end edge to value_seconds, its content staying in place.', { clip_id: clipId, edge: { type: 'string', enum: ['start', 'end'] }, value_seconds: num() }, ['clip_id', 'edge', 'value_seconds']),
    'clip.slip': command('Slide a clip\'s content inside its window: the source part it plays, in seconds of its media.', { clip_id: clipId, source_in_seconds: num('', { minimum: 0 }), source_out_seconds: num('', { minimum: 0 }) }, ['clip_id']),
    'clip.loop': command('Loop a clip as a block (Bord › Boucle): repeated as it is over duration_frames.', { clip_id: clipId, enabled: bool(), duration_frames: frame() }, ['clip_id']),
    'clip.view': command('Set how a clip shows: a MIDI clip piano, grid, steps or pads; an audio clip wave, slice or motif.', { clip_id: clipId, view: { type: 'string', enum: ['piano', 'grid', 'steps', 'pads', 'wave', 'slice', 'motif'] } }, ['clip_id']),
    'clip.mode': command('Set what a placed tool or project clip does when the playhead reaches it: nested, launch, open or run.', { clip_id: clipId, mode: { type: 'string', enum: ['nested', 'launch', 'open', 'run'] } }, ['clip_id']),
    'clip.edge': command('Set what dragging a clip\'s edge does: Rogner (trim), Boucle (loop) or Étirer (stretch).', { clip_id: clipId, edge: { type: 'string', enum: ['crop', 'loop', 'stretch'], description: 'crop = Rogner, loop = Boucle, stretch = Étirer.' } }, ['clip_id', 'edge']),
    'clip.fades': command('Set a clip\'s fade in and fade out, in frames.', { clip_id: clipId, in_frames: frame(), out_frames: frame() }, ['clip_id']),
    'clip.gain': command('Set a clip\'s gain in dB (its Son › Gain).', { clip_id: clipId, gain_db: num() }, ['clip_id', 'gain_db']),
    'clip.velocity': command('Set a MIDI clip\'s velocity (0..1): its notes play louder or softer.', { clip_id: clipId, velocity: num('', { minimum: 0, maximum: 1 }) }, ['clip_id', 'velocity']),
    'clip.transition': command('A crossfade with the next clip touching it (Enchaînement): its kind and length in frames; frames 0 removes it.', { clip_id: clipId, kind: { type: 'string', enum: ['none', 'fade', 'black', 'slide'] }, frames: frame() }, ['clip_id']),
    'clip.source': command('Make a clip play another media atome, at the same place and length.', { clip_id: clipId, atome_id: str('The media atome it plays now.') }, ['clip_id', 'atome_id']),
    'clip.output': command('Send a clip to its own output (Sortie), replacing its track\'s; null gives it back to its track.', { clip_id: clipId, destination }, ['clip_id']),
    'clip.stretch': command('Stretch a clip by ratio (Étirer), its pitch kept with pitch_lock.', { clip_id: clipId, enabled: bool(), ratio: num('', { exclusiveMinimum: 0 }), engine: str(), pitch_lock: bool() }, ['clip_id']),
    'clip.warp': command('Warp an audio clip to the tempo (follow), transposed by pitch_semitones, along its markers.', { clip_id: clipId, enabled: bool(), follow: bool(), pitch_semitones: num(), markers: { type: 'array' } }, ['clip_id']),
    'clip.tune': command('Retune the notes of an audio clip (Hauteur): it plays atome_id, the render of its original with notes [{note_id, from_frame, to_frame, pitch, shift, drift}]; clear gives its original back.', { clip_id: clipId, atome_id: str('The rendered media atome.'), notes: { type: 'array' }, formant_semitones: num(), clear: bool() }, ['clip_id']),
    'clip.split': command('Split a clip at at_seconds into left_clip_id and right_clip_id (Couper).', { clip_id: clipId, at_seconds: num(), left_clip_id: str(), right_clip_id: str() }, ['clip_id', 'at_seconds', 'left_clip_id', 'right_clip_id']),
    'clip.join': command('Join two touching clips into one (Joindre).', { left_clip_id: str(), right_clip_id: str() }, ['left_clip_id', 'right_clip_id']),
    'clip.take': command('Choose which take of a clip plays (comping).', { clip_id: clipId, take: int('The take played, 1-based.', { minimum: 1 }) }, ['clip_id', 'take']),
    'clip.cut': command('Cut clips to the clipboard.', { clip_id: clipId, clip_ids: { type: 'array', items: str() } }),
    'clip.copy': command('Copy clips to the clipboard.', { clip_id: clipId, clip_ids: { type: 'array', items: str() } }),
    'clip.paste': command('Paste the clipboard at start_seconds, on track_id when given.', { start_seconds: num('', { minimum: 0 }), track_id: trackId }, ['start_seconds']),
    'clip.duplicate': command('Duplicate clips right after themselves, or at start_seconds.', { clip_id: clipId, clip_ids: { type: 'array', items: str() }, start_seconds: num('', { minimum: 0 }) }),
    'clip.erase': command('Delete a clip (Supprimer); the history keeps it.', { clip_id: clipId }, ['clip_id']),
    'clip.sound.split': command('Lay a video clip\'s sound on its own track (Isoler), linked to the video.', { clip_id: clipId, sound_clip_id: str(), track_id: trackId, track_name: str() }, ['clip_id']),
    'clip.sound.unlink': command('Unlink a video clip and its isolated sound (Délier).', { clip_id: clipId }, ['clip_id']),
    'clip.sound.link': command('Link a video clip and a sound clip again, so the sound follows every edit of the video.', { clip_id: clipId, sound_clip_id: str() }, ['clip_id', 'sound_clip_id']),
    'clip.scene.detach': command('Make a clip laid by a Scene a free clip of the Timeline, named name.', { clip_id: clipId, scene_id: sceneId, name: str() }, ['clip_id']),
    'clip.group': command('Group clips into one clip-block.', { clip_group_id: str(), clip_ids: { type: 'array', minItems: 2, items: str() }, name: str() }, ['clip_ids']),
    'clip.ungroup': command('Ungroup a clip-block.', { clip_group_id: str() }, ['clip_group_id'])
};

const SCENE_CELL = {
    'scene.add': command('Add a Scene (a column of cells) from start_frame, duration_frames long.', { scene_id: sceneId, name: str(), start_frame: frame(), duration_frames: frame() }, ['scene_id']),
    'scene.update': command('Rename, move, resize a Scene, or set its kept gain in dB.', { scene_id: sceneId, name: str(), start_frame: frame(), duration_frames: frame(), gain_db: num() }, ['scene_id']),
    'scene.remove': command('Delete a Scene and its cells.', { scene_id: sceneId }, ['scene_id']),
    'scene.move': command('Move a Scene to index among the Scenes.', { scene_id: sceneId, index: int('', { minimum: 0 }) }, ['scene_id', 'index']),
    'scene.layout': command('Arrange a Scene in the Scene view (its blocks of cells).', { scene_id: sceneId, layout: obj('The Scene view\'s arrangement.') }, ['scene_id', 'layout']),
    'cell.set': command('Set a cell\'s settings (Réglages of a cell), or those of several cells.', { ...cellAt, cells: { type: 'array', items: { type: 'object', properties: cellAt } }, settings: cellSettings }, ['settings']),
    'cells.defaults.set': command('Set the settings a new cell takes (Réglages › Longueur, Décompte…): any cell setting, length, count_in_beats.', { settings: obj('Cell settings, plus length {count, unit: bar|beat} and count_in_beats.') }, ['settings']),
    'cell.clear': command('Empty a cell.', cellAt, ['scene_id', 'track_id']),
    'cell.carve': command('Silence a range of a cell (Silence); restore gives it back.', cellRange, ['scene_id', 'track_id', 'from_frame', 'to_frame']),
    'cell.restore': command('Give a silenced range of a cell back (Désilence).', cellRange, ['scene_id', 'track_id', 'from_frame', 'to_frame']),
    'cell.remove': command('Remove a range of a cell, the rest closing up (Suppr.).', cellRange, ['scene_id', 'track_id', 'from_frame', 'to_frame']),
    'cell.insert': command('Insert frames of silence at at_frame, or a copy of a range (copy {from_frame, to_frame}).', { ...cellAt, at_frame: frame(), frames: frame(), copy: obj('{from_frame, to_frame} to insert instead of silence.') }, ['scene_id', 'track_id', 'at_frame']),
    'cell.roll': command('Roll a cell\'s sound by frames, as a cylinder (Roll).', { ...cellAt, frames: int() }, ['scene_id', 'track_id', 'frames']),
    'cell.offset': command('Move a cell\'s whole sound by frames inside its Scene (Offset).', { ...cellAt, frames: int() }, ['scene_id', 'track_id', 'frames']),
    'cell.trim': command('Move a cell\'s start or end (Début, Fin) to frame.', { ...cellAt, edge: { type: 'string', enum: ['start', 'end'] }, frame: frame() }, ['scene_id', 'track_id', 'edge', 'frame']),
    'cell.place': command('Move a cell to another place, copied with copy, exchanged with exchange.', { from_scene_id: sceneId, from_track_id: trackId, to_scene_id: sceneId, to_track_id: trackId, copy: bool(), exchange: bool() }, ['from_scene_id', 'from_track_id', 'to_scene_id', 'to_track_id']),
    'cell.group': command('Group cells into a cell-block.', { cell_group_id: str(), members: { type: 'array', items: { type: 'object', properties: cellAt } }, name: str() }, ['members']),
    'cell.ungroup': command('Ungroup a cell-block.', { cell_group_id: str() }, ['cell_group_id'])
};

const STRUCTURE = {
    'track.add': command('Add a track to a section.', trackFields, ['track_id']),
    'track.remove': command('Delete a track and its clips.', { track_id: trackId }, ['track_id']),
    'track.update': command('Change a track: name, order, mute, solo, record_arm, quantization, loop.', trackFields, ['track_id']),
    'track.mute': command('Mute or unmute a track.', { track_id: trackId, mute: bool() }, ['track_id', 'mute']),
    'track.solo': command('Solo a track or not.', { track_id: trackId, solo: bool() }, ['track_id', 'solo']),
    'track.loop': command('Set a track\'s loop {enabled, start_frame, end_frame}.', { track_id: trackId, loop: obj() }, ['track_id', 'loop']),
    'track.quantization': command('Set a track\'s own grid.', { track_id: trackId, quantization: grid }, ['track_id', 'quantization']),
    'track.reorder': command('Move a track to target_index, in target_section_id when given.', { track_id: trackId, target_index: int('', { minimum: 0 }), target_section_id: sectionId }, ['track_id', 'target_index']),
    'track.move': command('Move a track to target_index, in target_section_id when given.', { track_id: trackId, target_index: int('', { minimum: 0 }), target_section_id: sectionId }, ['track_id', 'target_index']),
    'section.add': command('Add a section.', { section_id: sectionId, name: str(), order: int(), duration_frames: frame(), tempo: num(), meter: obj(), initial_track_id: trackId, initial_track_name: str() }, ['section_id']),
    'section.update': command('Change a section: name, order, duration_frames, tempo, meter.', { section_id: sectionId, name: str(), order: int(), duration_frames: frame(), tempo: num(), meter: obj() }, ['section_id']),
    'section.move': command('Move a section to target_index.', { section_id: sectionId, target_index: int('', { minimum: 0 }) }, ['section_id', 'target_index']),
    'section.remove': command('Delete a section.', { section_id: sectionId }, ['section_id']),
    'marker.add': command('Add a marker at time_seconds.', { marker_id: str(), name: str(), time_seconds: num('', { minimum: 0 }) }, ['marker_id', 'time_seconds']),
    'marker.update': command('Rename or move a marker.', { marker_id: str(), name: str(), time_seconds: num('', { minimum: 0 }) }, ['marker_id']),
    'marker.remove': command('Delete a marker.', { marker_id: str() }, ['marker_id']),
    'record_region.add': command('Add a recording zone on a track.', { record_region_id: str(), track_id: trackId, section_id: sectionId, start_frame: frame(), duration_frames: frame(), armed: bool(), source_kind: str('audio, video, screen, photo, midi or action.'), fill_mode: str(), takes: int() }, ['record_region_id', 'track_id']),
    'record_region.update': command('Change a recording zone.', { record_region_id: str(), start_frame: frame(), duration_frames: frame(), armed: bool(), fill_mode: str(), takes: int(), count_in_bars: int(), take_mode: str(), input_quantize: obj() }, ['record_region_id']),
    'record_region.remove': command('Delete a recording zone.', { record_region_id: str() }, ['record_region_id'])
};

const TRANSPORT = {
    'transport.seek': command('Place the playhead at playhead_seconds.', { playhead_seconds: num('', { minimum: 0 }) }, ['playhead_seconds']),
    'transport.scrub': command('Place the playhead at playhead_seconds, silently (transport.preview makes it heard).', { playhead_seconds: num('', { minimum: 0 }) }, ['playhead_seconds']),
    'transport.loop': command('Set the project\'s loop (Boucle) from start_seconds to end_seconds.', { enabled: bool(), start_seconds: num('', { minimum: 0 }), end_seconds: num('', { minimum: 0 }) }),
    'transport.tempo': command('Set the tempo (BPM), from start_seconds as a ramp when ramp is set; remove deletes a tempo change.', { tempo: num('', { exclusiveMinimum: 0 }), start_seconds: num('', { minimum: 0 }), ramp: bool(), remove: bool(), beats_per_bar: int('', { minimum: 1 }), beat_unit: int('', { minimum: 1 }) }),
    'quantization.set': command('Set the project\'s grid (quantization of launches and takes).', { quantization: grid }, ['quantization']),
    'metronome.set': command('Set the metronome: enabled, pre_roll_bars, volume, accent, sound, output, record_only (at least one).', { enabled: bool(), pre_roll_bars: int('', { minimum: 0 }), volume: num('', { minimum: 0, maximum: 1 }), accent: bool(), sound: { type: 'string', enum: ['beep', 'wood', 'clave', 'bell'] }, output: destination, record_only: bool() }),
    'view.set': command('Set what the project view shows: snap (Aimant), x_zoom, y_zoom, headers_open, unfolded_track_id, folded_groups, console, inspector, scene_filter, focus…', { snap: grid, x_zoom: num(), y_zoom: num(), headers_open: bool(), unfolded_track_id: str(), folded_groups: { type: 'array' }, console: obj(), inspector: bool(), scene_filter: str(), scene_id: sceneId, fx_track_id: str(), focus: obj() })
};

const AUTOMATION = {
    'automation.lane.add': command('Add an automation lane for param of target_id (a track or a module).', { automation_id: str(), target_id: str(), param: str() }, ['automation_id', 'target_id', 'param']),
    'automation.lane.remove': command('Delete an automation lane.', { automation_id: str() }, ['automation_id']),
    'automation.keyframe.add': command('Add an automation point at time_seconds.', { ...keyframe, time_seconds: num('', { minimum: 0 }), value: num(), curve: str() }, ['automation_id', 'keyframe_id', 'time_seconds', 'value']),
    'automation.keyframe.move': command('Move an automation point.', { ...keyframe, time_seconds: num('', { minimum: 0 }), value: num(), curve: str() }, ['automation_id', 'keyframe_id']),
    'automation.keyframe.edit': command('Change an automation point\'s value or curve.', { ...keyframe, value: num(), curve: str() }, ['automation_id', 'keyframe_id']),
    'automation.keyframe.remove': command('Delete an automation point.', keyframe, ['automation_id', 'keyframe_id']),
    'automation.carry': command('Carry (or copy) a track\'s automation from from_seconds to to_seconds onto target_track_id at start_seconds.', { track_id: trackId, from_seconds: num(), to_seconds: num(), target_track_id: trackId, start_seconds: num(), copy: bool(), suffix: str() }, ['track_id'])
};

// A track's Clavier (eVe kernel keyboard_map.js): the sounds its MIDI strip plays, each a bar over its keys — side by side a
// split, one over another a layer, each on its channel multitimbral. A bar is one output of kind instrument of the strip
// `<track_id>:midi` (its endpoint_id); timeline.read shows them in mix.strips['<track_id>:midi'].output.midi_outputs.
const bar = { track_id: trackId, endpoint_id: str('The bar: its output\'s endpoint_id (a new id to add one).') };
const key = (description) => int(description, { minimum: 0, maximum: 127 });
const KEYBOARD = {
    'keyboard.bar.add': command('Lay one of the person\'s instruments on a track\'s Clavier, at key on row (0 the lowest): on a bar, over its keys (a layer); beside bars, on the free keys (a split); on an empty Clavier, every key.',
        { ...bar, instrument_id: str('The instrument atome (Mes instruments).'), name: str('Its name, shown on the bar.'), key: key('A key of the place it is laid at (60 = C3).'), row: int('The row, 0 the lowest.', { minimum: 0 }) },
        ['track_id', 'endpoint_id', 'instrument_id', 'key']),
    'keyboard.bar.edge': command('Move a bar\'s low or high end to key, never past the bars beside it on its row.', { ...bar, side: { type: 'string', enum: ['low', 'high'] }, key: key('The key the end goes to.') },
        ['track_id', 'endpoint_id', 'side', 'key']),
    'keyboard.bar.set': command('Set a bar: its keys range [low, high], transpose (±48 semitones), channel (0 every one, 1–16), velocity [soft, hard] (1–127) it answers to, fade (0–24 keys past its range, quieter, so two sounds cross at their seam).',
        { ...bar, range: { type: 'array', items: key(), minItems: 2, maxItems: 2 }, transpose: int('', { minimum: -48, maximum: 48 }), channel: int('', { minimum: 0, maximum: 16 }),
            velocity: { type: 'array', items: int('', { minimum: 1, maximum: 127 }), minItems: 2, maxItems: 2 }, fade: int('', { minimum: 0, maximum: 24 }) }, ['track_id', 'endpoint_id']),
    'keyboard.bar.remove': command('Take a bar off a track\'s Clavier.', bar, ['track_id', 'endpoint_id'])
};

/** Each edit verb's command, by verb. */
export const TIMELINE_EDIT_COMMANDS = Object.freeze({ ...CLIP, ...SCENE_CELL, ...STRUCTURE, ...TRANSPORT, ...AUTOMATION, ...KEYBOARD });
