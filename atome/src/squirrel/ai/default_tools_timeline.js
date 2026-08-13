const requireMoleculeTimelineApi = () => {
    const api = globalThis.eveMoleculeTimelineApi || globalThis.window?.eveMoleculeTimelineApi || null;
    if (!api) {
        throw new Error('eveMoleculeTimelineApi is not available');
    }
    return api;
};

const TIMELINE_WRITE_VERBS = Object.freeze([
    'clip.move',
    'clip.trim',
    'clip.crop',
    'clip.loop',
    'clip.split',
    'clip.cut',
    'clip.copy',
    'clip.paste',
    'clip.erase',
    'clip.duplicate',
    'track.add',
    'track.remove',
    'track.update',
    'track.reorder',
    'track.group',
    'track.loop',
    'track.quantization',
    'track.mute',
    'track.solo',
    'transport.seek',
    'transport.scrub',
    'transport.loop',
    'transport.tempo',
    'quantization.set',
    'metronome.set',
    'section.add',
    'section.update',
    'section.remove',
    'record_region.add',
    'record_region.update',
    'record_region.remove',
    'view.set',
    'automation.lane.add',
    'automation.lane.remove',
    'automation.keyframe.add',
    'automation.keyframe.move',
    'automation.keyframe.edit',
    'automation.keyframe.remove'
]);

const registerTimelineWriteVerb = ({ Agent, verb }) => {
    Agent.registerTool({
        name: `eve.timeline.${verb}`,
        description: `Apply Molecule timeline ${verb}.`,
        capabilities: ['timeline.write'],
        risk_tier: 'MODERATE',
        parameters: {
            type: 'object',
            properties: {
                group_id: { type: 'string' },
                command: { type: 'object' }
            }
        },
        handler: async (params = {}) => requireMoleculeTimelineApi().applyGroupTimelineOperation({
            ...params,
            operation: `eve.timeline.${verb}`,
            command: params.command || params
        })
    });
};

export const registerTimelineDefaultTools = ({ Agent }) => {
    Agent.registerTool({
        name: 'eve.timeline.read',
        description: 'Read the active Molecule timeline snapshot.',
        capabilities: ['timeline.read'],
        risk_tier: 'LOW',
        parameters: {
            type: 'object',
            properties: {
                group_id: { type: 'string' }
            }
        },
        handler: async (params = {}) => requireMoleculeTimelineApi().readGroupTimeline(params)
    });

    Agent.registerTool({
        name: 'eve.timeline.operation',
        description: 'Apply one Molecule timeline operation through the active session.',
        capabilities: ['timeline.write'],
        risk_tier: 'MODERATE',
        parameters: {
            type: 'object',
            required: ['operation'],
            properties: {
                group_id: { type: 'string' },
                operation: { type: 'string' },
                command: { type: 'object' }
            }
        },
        handler: async (params = {}) => requireMoleculeTimelineApi().applyGroupTimelineOperation(params)
    });

    Agent.registerTool({
        name: 'eve.timeline.batch',
        description: 'Apply an atomic Molecule timeline operation batch through the active session.',
        capabilities: ['timeline.write'],
        risk_tier: 'MODERATE',
        parameters: {
            type: 'object',
            required: ['operations'],
            properties: {
                group_id: { type: 'string' },
                operations: { type: 'array' },
                label: { type: 'string' }
            }
        },
        handler: async (params = {}) => requireMoleculeTimelineApi().applyGroupTimelineBatch(params)
    });

    Agent.registerTool({
        name: 'eve.timeline.transfer',
        description: 'Atomically transfer a Section or Track between two open Molecules.',
        capabilities: ['timeline.write'],
        risk_tier: 'MODERATE',
        parameters: {
            type: 'object',
            required: ['source_group_id', 'target_group_id', 'entity_type'],
            properties: {
                source_group_id: { type: 'string' },
                target_group_id: { type: 'string' },
                entity_type: { type: 'string', enum: ['section', 'track'] },
                section_id: { type: 'string' },
                track_id: { type: 'string' },
                track_ids: { type: 'array' },
                target_section_id: { type: 'string' },
                target_index: { type: 'integer' }
            }
        },
        handler: async (params = {}) => requireMoleculeTimelineApi().transferGroupTimelineEntity(params)
    });

    Agent.registerTool({
        name: 'eve.timeline.transport.toggle',
        description: 'Toggle Molecule, Section, or Track playback on the canonical Kira transport.',
        capabilities: ['timeline.write'],
        risk_tier: 'LOW',
        parameters: {
            type: 'object',
            required: ['group_id'],
            properties: {
                group_id: { type: 'string' },
                section_id: { type: 'string' },
                track_id: { type: 'string' }
            }
        },
        handler: async (params = {}) => requireMoleculeTimelineApi().toggleGroupTimelineTransport(params)
    });

    Agent.registerTool({
        name: 'eve.timeline.transport.stop',
        description: 'Stop the active Molecule transport.',
        capabilities: ['timeline.write'],
        risk_tier: 'LOW',
        parameters: { type: 'object', required: ['group_id'], properties: { group_id: { type: 'string' } } },
        handler: async (params = {}) => requireMoleculeTimelineApi().stopGroupTimelineTransport(params)
    });

    Agent.registerTool({
        name: 'eve.timeline.transport.list.toggle',
        description: 'Toggle sequential playback of the ordered open Molecules on the canonical Kira transport.',
        capabilities: ['timeline.write'],
        risk_tier: 'LOW',
        parameters: {
            type: 'object',
            properties: { group_ids: { type: 'array', items: { type: 'string' } } }
        },
        handler: async (params = {}) => requireMoleculeTimelineApi().toggleGroupTimelineListTransport(params)
    });

    Agent.registerTool({
        name: 'eve.timeline.transport.list.stop',
        description: 'Stop sequential Molecule List playback.',
        capabilities: ['timeline.write'],
        risk_tier: 'LOW',
        parameters: { type: 'object', properties: {} },
        handler: async () => requireMoleculeTimelineApi().stopGroupTimelineListTransport()
    });

    ['list', 'mix', 'timeline'].forEach((activity) => Agent.registerTool({
        name: `eve.timeline.activity.${activity}`,
        description: `Open the Molecule ${activity} activity on the shared Bevy project surface.`,
        capabilities: ['timeline.read'],
        risk_tier: 'LOW',
        parameters: { type: 'object', properties: { project_id: { type: 'string' } } },
        handler: async (params = {}) => requireMoleculeTimelineApi().setGroupTimelineActivity({
            ...params, activity
        })
    }));

    [
        ['start', 'startGroupTimelineGenericRecording', 'Start a generic Molecule capture on an armed region or Track.'],
        ['stop', 'stopGroupTimelineGenericRecording', 'Stop and commit a generic Molecule capture.'],
        ['cancel', 'cancelGroupTimelineGenericRecording', 'Cancel and discard a generic Molecule capture.']
    ].forEach(([verb, method, description]) => Agent.registerTool({
        name: `eve.timeline.record.${verb}`,
        description,
        capabilities: ['timeline.write', 'media.capture'],
        risk_tier: verb === 'start' ? 'HIGH' : 'MODERATE',
        parameters: {
            type: 'object', required: ['group_id'],
            properties: {
                group_id: { type: 'string' }, track_id: { type: 'string' }, capture_id: { type: 'string' },
                record_region_id: { type: 'string' }, source_kind: { type: 'string', enum: ['audio', 'video', 'screen', 'photo'] }
            }
        },
        handler: async (params = {}) => requireMoleculeTimelineApi()[method](params)
    }));

    Agent.registerTool({
        name: 'eve.timeline.history.undo',
        description: 'Undo the last Molecule timeline edit on the active session.',
        capabilities: ['timeline.write'],
        risk_tier: 'MODERATE',
        parameters: { type: 'object', properties: { group_id: { type: 'string' } } },
        handler: async (params = {}) => requireMoleculeTimelineApi().undoGroupTimeline(params)
    });

    Agent.registerTool({
        name: 'eve.timeline.history.redo',
        description: 'Redo the last undone Molecule timeline edit on the active session.',
        capabilities: ['timeline.write'],
        risk_tier: 'MODERATE',
        parameters: { type: 'object', properties: { group_id: { type: 'string' } } },
        handler: async (params = {}) => requireMoleculeTimelineApi().redoGroupTimeline(params)
    });

    TIMELINE_WRITE_VERBS.forEach((verb) => registerTimelineWriteVerb({ Agent, verb }));
};
