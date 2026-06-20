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
    'clip.split',
    'clip.cut',
    'clip.copy',
    'clip.paste',
    'clip.erase',
    'clip.duplicate',
    'track.add',
    'track.remove',
    'track.reorder',
    'track.mute',
    'track.solo',
    'transport.seek',
    'transport.scrub',
    'transport.loop',
    'transport.tempo',
    'transport.snap',
    'view.set',
    'marker.upsert',
    'marker.delete'
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

    TIMELINE_WRITE_VERBS.forEach((verb) => registerTimelineWriteVerb({ Agent, verb }));
};
