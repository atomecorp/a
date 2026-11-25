// Molecule timeline tools: one input contract per capability, consumed by the
// AtomeAI registration (`eve.timeline.<verb>`) and the Runtime V2 registration
// (`ui.timeline.<verb>`), which both call the same Molecule timeline API.
import { TIMELINE_EDIT_COMMANDS } from './timeline_edit_commands.js';
import { TIMELINE_LIVE_TOOL_SCHEMAS } from './timeline_live_tools.js';

const id = { type: 'string', minLength: 1 };
const groupId = { ...id, description: 'Molecule (group) id; the active Molecule when omitted.' };
// A strip preset's parts (R-366): its effects, its routing, its input and output; all when omitted.
const presetParts = { type: 'array', items: { type: 'string', enum: ['effects', 'routing', 'io'] }, minItems: 1, uniqueItems: true,
    description: 'Parts of the strip preset: effects, routing (Aux, sends, IN, REC place, keys), io (input and output); all when omitted.' };
const closed = (properties = {}, required = []) => ({
    type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {})
});

// Mixer verbs carry a typed command contract (strip ids are `<track_id>:<lane>`).
const destination = { type: ['object', 'null'], properties: { kind: { type: 'string', enum: ['main', 'bus', 'strip', 'device', 'screen', 'midi_port'] }, id: { type: 'string' }, channel: { type: 'integer' } } };
const stripCommand = (properties, required = []) => ({
    type: 'object', required: ['strip_id', ...required],
    properties: { strip_id: { type: 'string' }, ...properties }
});
// A split module's ports sent out of the strip, and the key of a keyed one.
const outputs = { type: 'array', items: { type: 'object', required: ['port', 'destination'], properties: { port: { type: 'integer', minimum: 0 }, destination } } };
const key = {
    type: ['object', 'null'],
    description: 'What a keyed module (compressor, gate, ducker) listens to: {kind:"strip",id} or {kind:"port",module_id,port}.',
    properties: { kind: { type: 'string', enum: ['strip', 'port'] }, id: { type: 'string' }, module_id: { type: 'string' }, port: { type: 'integer', minimum: 0 } }
};
// What an IN module mixes in (D-S3), and which output of a multitimbral instrument (0-based, D-S2).
const output = { type: 'integer', minimum: 0, maximum: 15, description: 'An instrument output, 0-based (the first output by default).' };
const source = {
    type: ['object', 'null'],
    description: 'What an IN module mixes in: {kind:"live_audio",device_id}, {kind:"strip",id} (its own strip closes a loop, heard one return later) or {kind:"instrument",instrument_id,output}.',
    properties: { kind: { type: 'string', enum: ['live_audio', 'strip', 'instrument'] }, device_id: { type: 'string' }, id: { type: 'string' }, instrument_id: { type: 'string' }, output }
};
const effect = { type: 'string', description: 'dsp: an atome-dsp kind — dynamics compressor (character, sidechain key), limiter, gate, ducker, deesser, transient, expander, multiband; space reverb (space), convolution, echo (sync, mode); eq (8 bands), bell, low_shelf, high_shelf, low_pass, high_pass, band_pass, notch; voice vocoder, tuner, harmonizer, pitch_shift, doubler, denoise; modulation chorus, flanger, phaser, tremolo; saturation saturator, soft_clip, hard_clip, amp, lofi; master maximizer, imager, bands_2..4, mid_side, left_right. video_fx: color, wheels, curves, hsl, lut, bw, blur (params.mode 0 gaussian..4 lens), sharpen, denoise, vignette, grain, glow, aberration, pixelate, chroma_key (its Fond: params.background_track a video track id, or params.background_image a media atome id, else transparent), luma_key, mask. A choice param takes its index.' };
const MIX_COMMANDS = Object.freeze({
    'mix.module.add': stripCommand({
        module_id: { type: 'string' },
        type: { type: 'string', enum: ['volume', 'pan', 'mono', 'dsp', 'user_effect', 'send', 'input', 'opacity', 'transform', 'video_fx'] },
        effect, effect_id: { type: 'string', description: 'For a user_effect: the audio_effect atome (Mes effets) it places, linked.' },
        params: { type: 'object' }, destination, outputs, key, source, index: { type: 'integer' }
    }, ['module_id', 'type']),
    'mix.module.update': stripCommand({ module_id: { type: 'string' }, effect, params: { type: 'object' }, destination, outputs, key, source }, ['module_id']),
    'mix.module.move': stripCommand({ module_id: { type: 'string' }, index: { type: 'integer' }, to_strip_id: { type: 'string', description: 'Another strip of a compatible lane the module moves into, at index.' } }, ['module_id', 'index']),
    'mix.module.remove': stripCommand({ module_id: { type: 'string' } }, ['module_id']),
    'mix.module.bypass': stripCommand({ module_id: { type: 'string' }, bypass: { type: 'boolean' } }, ['module_id', 'bypass']),
    'mix.output.set': stripCommand({ destination, enabled: { type: 'boolean' } }),
    'mix.input.set': stripCommand({ input: { type: 'object', properties: { kind: { type: 'string', enum: ['track', 'live_audio', 'instrument'] }, device_id: { type: 'string' },
        instrument_id: { type: 'string', description: 'For an instrument: the instrument atome (Mes instruments) whose notes the strip plays.' }, output } } }, ['input']),
    'mix.record.set': stripCommand({ device_id: { type: ['string', 'null'], description: 'The input a take of this track opens: a microphone on its audio strip, a camera on its video strip (an id of media inputs); null for the input in use.' },
        monitoring: { type: 'boolean', description: 'On the audio strip: whether the take is heard while it records (false: recorded, not heard).' },
        format: { type: ['string', 'null'], enum: ['mono', 'stereo', null], description: 'On the audio strip, with channels: one physical channel (mono) or a pair (stereo); null with channels null for the input\'s first two.' },
        channels: { type: ['array', 'null'], items: { type: 'integer', minimum: 1 }, description: 'The input\'s physical channels, counted from 1: one in mono (17), a pair of neighbours in stereo (23, 24 = left, right).' } }),
    'mix.group.create': { type: 'object', required: ['group_id', 'master_strip_id', 'member_strip_ids'], properties: { group_id: { type: 'string' }, master_strip_id: { type: 'string' }, member_strip_ids: { type: 'array', items: { type: 'string' } } } },
    'mix.group.join': stripCommand({ group_id: { type: 'string' } }, ['group_id']),
    'mix.group.leave': stripCommand({}),
    'mix.group.dissolve': { type: 'object', required: ['group_id'], properties: { group_id: { type: 'string' } } }
});

const EDIT_VERBS = [
    'clip.move', 'clip.trim', 'clip.crop', 'clip.loop', 'clip.view', 'clip.mode', 'clip.fades', 'clip.stretch', 'clip.warp', 'clip.tune', 'clip.split', 'clip.join', 'clip.take',
    'clip.cut', 'clip.copy', 'clip.paste', 'clip.erase', 'clip.duplicate', 'clip.sound.split', 'clip.sound.unlink',
    'scene.add', 'scene.update', 'scene.remove', 'scene.move', 'cell.set', 'cell.clear', 'cell.carve', 'cell.restore', 'cell.roll', 'cell.offset', 'cell.remove', 'cell.insert', 'cell.trim', 'cell.place', 'cell.group', 'cell.ungroup', 'clip.scene.detach', 'clip.group', 'clip.ungroup', 'clip.group.move',
    'track.add', 'track.remove', 'track.update', 'track.reorder', 'track.loop', 'track.quantization', 'track.mute', 'track.solo',
    'transport.seek', 'transport.scrub', 'transport.loop', 'transport.tempo', 'quantization.set', 'metronome.set',
    'section.add', 'section.update', 'section.remove', 'record_region.add', 'record_region.update', 'record_region.remove',
    'view.set', 'automation.lane.add', 'automation.lane.remove',
    'automation.keyframe.add', 'automation.keyframe.move', 'automation.keyframe.edit', 'automation.keyframe.remove', 'automation.carry',
    // Reducers once reached only by `operation` (rule 22): each now a tool of its own, found by its description.
    'clip.slip', 'clip.edge', 'clip.gain', 'clip.source', 'clip.output', 'clip.velocity', 'clip.transition', 'clip.sound.link',
    'marker.add', 'marker.update', 'marker.remove', 'section.move', 'track.move', 'scene.layout', 'cells.defaults.set',
    // A track's Clavier (user, 25 Nov. 2026): its sounds split and layered over a keyboard.
    'keyboard.bar.add', 'keyboard.bar.edge', 'keyboard.bar.set', 'keyboard.bar.remove'
];

/** Write verbs applied through `applyGroupTimelineOperation`, with their command contract. */
export const TIMELINE_WRITE_VERBS = Object.freeze([...EDIT_VERBS, ...Object.keys(MIX_COMMANDS)]);
export const timelineWriteVerbSchema = verb => closed({
    group_id: groupId,
    command: MIX_COMMANDS[verb] || TIMELINE_EDIT_COMMANDS[verb]
}, ['command']);
/** An edit verb's own description (its command's), for the tool that applies it. */
export const timelineWriteVerbDescription = verb => TIMELINE_EDIT_COMMANDS[verb]?.description || `Apply the console operation ${verb}.`;

const record = closed({
    group_id: groupId, track_id: id, capture_id: id,
    duration_ms: { type: 'integer', minimum: 100, maximum: 600000 },
    // `midi` and `action` (Geste, user 23 Nov. 2026) take the page clock, as their timeline takes do.
    record_region_id: id, source_kind: { type: 'string', enum: ['audio', 'video', 'screen', 'photo', 'midi', 'action'] }
}, ['group_id']);

/** Input contract of every other timeline tool, by verb. */
export const TIMELINE_TOOL_SCHEMAS = Object.freeze({
    ...TIMELINE_LIVE_TOOL_SCHEMAS,
    read: closed({ group_id: groupId }),
    operation: closed({ group_id: groupId, operation: { type: 'string', minLength: 1 }, command: { type: 'object' } }, ['operation']),
    batch: closed({
        group_id: groupId, label: { type: 'string' },
        operations: { type: 'array', minItems: 1, items: closed({ operation: { type: 'string', minLength: 1 }, command: { type: 'object' } }, ['operation']) }
    }, ['operations']),
    transfer: closed({
        source_group_id: id, target_group_id: id, entity_type: { type: 'string', enum: ['section', 'track'] },
        section_id: id, track_id: id, track_ids: { type: 'array', items: { type: 'string' } },
        target_section_id: id, target_index: { type: 'integer', minimum: 0 }
    }, ['source_group_id', 'target_group_id', 'entity_type']),
    'transport.toggle': closed({ group_id: id, section_id: id, track_id: id }, ['group_id']),
    'transport.stop': closed({ group_id: id }, ['group_id']),
    // A tool, a project or a Scene of the same project (R-369) placed on a track (a tool's instant clip spans `duration_seconds`;
    // `mode`: what the playhead does with it).
    'clip.place': closed({ group_id: id, track_id: id, clip_id: id, start_seconds: { type: 'number', minimum: 0 }, duration_seconds: { type: 'number', exclusiveMinimum: 0 },
        placed_tool_id: id, placed_project_id: id, placed_scene_id: id, mode: { type: 'string', enum: ['nested', 'launch', 'open', 'run'] } }, ['track_id']),
    // A project's timeline played from `start_seconds`, opened first if it is not (a launched project).
    'transport.play': closed({ group_id: id, project_id: id, start_seconds: { type: 'number', minimum: 0 } }, ['group_id']),
    'transport.list.toggle': closed({ group_ids: { type: 'array', items: { type: 'string' } } }),
    'transport.list.stop': closed(),
    // Also run by a MIDI binding (R-293), which hands every action its message's value.
    'cells.trigger': closed({
        group_id: id, gesture: { type: 'string', enum: ['press', 'release'] },
        // A Scene launched (track_id "scene") chains the next by `chain` (Lecture held: scene alone, loop_scene, loop_all;
        // none: each Scene's Follow Action); a cell played chromatically plays `note` at `velocity` (0..1).
        cells: { type: 'array', items: closed({ scene_id: id, track_id: id, chain: { type: 'string', enum: ['scene', 'loop_scene', 'loop_all'] },
            note: { type: 'integer', minimum: 0, maximum: 127 }, velocity: { type: 'number', minimum: 0, maximum: 1 } }) },
        midi_value: { type: 'number' }, midi_logical_value: { type: 'number' }, target_atome_id: { type: 'string' }
    }, ['group_id', 'cells']),
    'cells.stop': closed({ group_id: id }, ['group_id']),
    // A cell or a Scene driven beside its launch (R-363): played if silent, from its start, stopped, paused (the next pause
    // resumes there), its speed (0.25–4) or its pitch (−24–24 semitones, an audio clip) set by `value`; each on its own grid.
    'cells.command': closed({
        group_id: id, op: { type: 'string', enum: ['play', 'restart', 'stop', 'pause', 'speed', 'pitch'] },
        cells: { type: 'array', minItems: 1, items: closed({ scene_id: id, track_id: id }) },
        value: { type: 'number' }, midi_value: { type: 'number' }, midi_logical_value: { type: 'number' }, target_atome_id: { type: 'string' }
    }, ['group_id', 'op', 'cells']),
    // The project's playback driven (R-363): Lecture, Stop, Lecture/Stop, a pause (resumed by the next), or a jump to the
    // start, a bar, a marker, a Scene or the bar `value` names, landing while it plays on the grid's next step (`quantize`:
    // the project's Aimant, the bar, the beat, or off: at once).
    'transport.command': closed({
        group_id: id, op: { type: 'string', enum: ['play', 'stop', 'toggle', 'pause', 'jump'] },
        to: closed({ kind: { type: 'string', enum: ['start', 'bar', 'marker', 'scene', 'value'] }, bar: { type: 'integer', minimum: 1 }, marker_id: id, scene_id: id }),
        quantize: { type: 'string', enum: ['project', 'bar', 'beat', 'off'] }, value: { type: 'number' }, target_atome_id: { type: 'string' }
    }, ['group_id', 'op']),
    activity: closed({ project_id: id }),
    'record.prepare': closed({ project_id: id }),
    'record.start': record, 'record.stop': record, 'record.cancel': record,
    // A mix parameter set by a value (a control bound by « Lier », its logical value): heard at once, kept
    // as one `mix.module.update` once the control rests.
    // A held switch (R-367) is sent `gesture: 'press'`, its release `gesture: 'release'` (the param back to 0); `toggle` flips it.
    'mix.param.set': closed({
        group_id: groupId, strip_id: id, module_id: id, param: id, value: { type: 'number' },
        gesture: { type: 'string', enum: ['press', 'release'] }, toggle: { type: 'boolean' },
        midi_value: { type: 'number' }, midi_logical_value: { type: 'number' }, target_atome_id: { type: 'string' }
    }, ['strip_id', 'module_id', 'param']),
    'history.undo': closed({ group_id: groupId }),
    'history.redo': closed({ group_id: groupId }),
    'performance.delete': closed({ group_id: groupId }),
    // « Réalig »: a project's timeline laid again in its List order (the current project when omitted).
    realign: closed({ project_id: id }),
    // A MIDI clip's own .mid file handed to the system's export, and Figer: the clip rendered as sound by its eVe instrument.
    'midi.export': closed({ group_id: groupId, clip_id: id }, ['clip_id']),
    'midi.freeze': closed({ group_id: groupId, clip_id: id }, ['clip_id']),
    'audio.export': closed({ group_id: groupId, clip_id: id }, ['clip_id']),
    // A console strip's presets (mix_strip_presets.js), kept in the person's account: listed, saved under a name, laid on a strip.
    'mix.preset.list': closed({ lane: { type: 'string', enum: ['audio', 'video', 'midi'] } }),
    'mix.preset.save': closed({ group_id: groupId, strip_id: id, name: id, parts: presetParts }, ['strip_id']),
    'mix.preset.load': closed({ group_id: groupId, strip_id: id, preset_id: id, parts: presetParts }, ['strip_id', 'preset_id']),
    'mix.preset.reset': closed({ group_id: groupId, strip_id: id }, ['strip_id']),
    // The « Importer » plate of a track's empty part (R-344) by command: the person's media atomes laid end to end from start_seconds.
    'track.import': closed({ project_id: id, track_id: id, start_seconds: { type: 'number', minimum: 0 },
        media_atome_ids: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } }, ['track_id', 'media_atome_ids']),
    // A project's media, as the rail's Médias shows them (R-357): listed by kind, joined with no clip, replaced in every clip
    // playing them by another of the same kind (same place and length), deleted with their clips.
    'media.list': closed({ project_id: id, types: { type: 'array', items: { type: 'string', enum: ['audio', 'video', 'image', 'midi'] } } }),
    'media.add': closed({ project_id: id, media_atome_ids: { type: 'array', minItems: 1, items: id } }, ['media_atome_ids']),
    'media.replace': closed({ project_id: id, media_ids: { type: 'array', minItems: 1, items: id }, by_media_atome_id: id }, ['media_ids', 'by_media_atome_id']),
    'media.delete': closed({ project_id: id, media_ids: { type: 'array', minItems: 1, items: id } }, ['media_ids'])
});
