// Molecule timeline tools: one input contract per capability, consumed by the
// AtomeAI registration (`eve.timeline.<verb>`) and the Runtime V2 registration
// (`ui.timeline.<verb>`), which both call the same Molecule timeline API.
const id = { type: 'string', minLength: 1 };
const groupId = { ...id, description: 'Molecule (group) id; the active Molecule when omitted.' };
const closed = (properties = {}, required = []) => ({
    type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {})
});

// Mixer verbs carry a typed command contract (strip ids are `<track_id>:<lane>`).
const destination = { type: ['object', 'null'], properties: { kind: { type: 'string', enum: ['main', 'bus', 'strip', 'device', 'screen', 'midi_port'] }, id: { type: 'string' }, channel: { type: 'integer' } } };
const stripCommand = (properties, required = []) => ({
    type: 'object', required: ['strip_id', ...required],
    properties: { strip_id: { type: 'string' }, ...properties }
});
const MIX_COMMANDS = Object.freeze({
    'mix.module.add': stripCommand({
        module_id: { type: 'string' },
        type: { type: 'string', enum: ['volume', 'pan', 'mono', 'fx', 'send', 'opacity', 'video_fx'] },
        effect: { type: 'string', enum: ['reverb', 'delay', 'compressor', 'eq', 'filter', 'distortion', 'color'] },
        params: { type: 'object' }, destination, index: { type: 'integer' }
    }, ['module_id', 'type']),
    'mix.module.update': stripCommand({ module_id: { type: 'string' }, effect: { type: 'string' }, params: { type: 'object' }, destination }, ['module_id']),
    'mix.module.move': stripCommand({ module_id: { type: 'string' }, index: { type: 'integer' } }, ['module_id', 'index']),
    'mix.module.remove': stripCommand({ module_id: { type: 'string' } }, ['module_id']),
    'mix.module.bypass': stripCommand({ module_id: { type: 'string' }, bypass: { type: 'boolean' } }, ['module_id', 'bypass']),
    'mix.output.set': stripCommand({ destination, enabled: { type: 'boolean' } }),
    'mix.input.set': stripCommand({ input: { type: 'object', properties: { kind: { type: 'string', enum: ['track', 'live_audio'] }, device_id: { type: 'string' } } } }, ['input']),
    'mix.group.create': { type: 'object', required: ['group_id', 'master_strip_id', 'member_strip_ids'], properties: { group_id: { type: 'string' }, master_strip_id: { type: 'string' }, member_strip_ids: { type: 'array', items: { type: 'string' } } } },
    'mix.group.join': stripCommand({ group_id: { type: 'string' } }, ['group_id']),
    'mix.group.leave': stripCommand({}),
    'mix.group.dissolve': { type: 'object', required: ['group_id'], properties: { group_id: { type: 'string' } } }
});

const EDIT_VERBS = [
    'clip.move', 'clip.trim', 'clip.crop', 'clip.loop', 'clip.fades', 'clip.stretch', 'clip.split', 'clip.join', 'clip.take',
    'clip.cut', 'clip.copy', 'clip.paste', 'clip.erase', 'clip.duplicate',
    'scene.add', 'scene.update', 'scene.remove', 'scene.move', 'cell.set', 'cell.clear', 'cell.place',
    'track.add', 'track.remove', 'track.update', 'track.reorder', 'track.loop', 'track.quantization', 'track.mute', 'track.solo',
    'transport.seek', 'transport.scrub', 'transport.loop', 'transport.tempo', 'quantization.set', 'metronome.set',
    'section.add', 'section.update', 'section.remove', 'record_region.add', 'record_region.update', 'record_region.remove',
    'view.set', 'automation.lane.add', 'automation.lane.remove',
    'automation.keyframe.add', 'automation.keyframe.move', 'automation.keyframe.edit', 'automation.keyframe.remove'
];

/** Write verbs applied through `applyGroupTimelineOperation`, with their command contract. */
export const TIMELINE_WRITE_VERBS = Object.freeze([...EDIT_VERBS, ...Object.keys(MIX_COMMANDS)]);
export const timelineWriteVerbSchema = verb => closed({
    group_id: groupId,
    command: MIX_COMMANDS[verb] || { type: 'object', description: `Command of the Molecule kernel operation ${verb}.` }
}, ['command']);

const record = closed({
    group_id: groupId, track_id: id, capture_id: id,
    duration_ms: { type: 'integer', minimum: 100, maximum: 600000 },
    record_region_id: id, source_kind: { type: 'string', enum: ['audio', 'video', 'screen', 'photo'] }
}, ['group_id']);

/** Input contract of every other timeline tool, by verb. */
export const TIMELINE_TOOL_SCHEMAS = Object.freeze({
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
    'transport.list.toggle': closed({ group_ids: { type: 'array', items: { type: 'string' } } }),
    'transport.list.stop': closed(),
    'cells.trigger': closed({
        group_id: id, gesture: { type: 'string', enum: ['press', 'release'] },
        cells: { type: 'array', items: closed({ scene_id: id, track_id: id }) }
    }, ['group_id', 'cells']),
    'cells.stop': closed({ group_id: id }, ['group_id']),
    activity: closed({ project_id: id }),
    'record.prepare': closed({ project_id: id }),
    'record.start': record, 'record.stop': record, 'record.cancel': record,
    'history.undo': closed({ group_id: groupId }),
    'history.redo': closed({ group_id: groupId }),
    'performance.delete': closed({ group_id: groupId })
});
