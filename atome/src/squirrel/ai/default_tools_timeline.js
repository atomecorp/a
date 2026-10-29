import { TIMELINE_TOOL_SCHEMAS, TIMELINE_WRITE_VERBS, timelineWriteVerbSchema } from '#shared/timeline_tool_contract.js';

const requireMoleculeTimelineApi = () => {
    const api = globalThis.eveMoleculeTimelineApi || globalThis.window?.eveMoleculeTimelineApi || null;
    if (!api) {
        throw new Error('eveMoleculeTimelineApi is not available');
    }
    return api;
};

// The gateway calls handler({ params, context }); every timeline tool forwards
// its params to one Molecule timeline API method.
const TIMELINE_TOOLS = [
    ['read', 'readGroupTimeline', 'Read the active Molecule timeline snapshot.', 'timeline.read', 'LOW'],
    ['operation', 'applyGroupTimelineOperation', 'Apply one Molecule timeline operation through the active session.', 'timeline.write', 'MODERATE'],
    ['batch', 'applyGroupTimelineBatch', 'Apply an atomic Molecule timeline operation batch through the active session.', 'timeline.write', 'MODERATE'],
    ['transfer', 'transferGroupTimelineEntity', 'Atomically transfer a Section or Track between two open Molecules.', 'timeline.write', 'MODERATE'],
    ['transport.toggle', 'toggleGroupTimelineTransport', 'Toggle Molecule, Section, or Track playback on the canonical Kira transport.', 'timeline.write', 'LOW'],
    ['clip.place', 'placeGroupTimelineClip', 'Place a ribbon tool (placed_tool_id) or another project (placed_project_id) on a track at start_seconds: a tool executes when the playhead reaches it (a lasting tool runs to the clip end); a project plays nested, or is launched/opened (mode).', 'timeline.write', 'LOW'],
    ['transport.play', 'launchGroupTimelineTransport', 'Play a project\'s timeline (group_id = the project id) from start_seconds, opening it first if needed: a launched project.', 'timeline.write', 'LOW'],
    ['transport.stop', 'stopGroupTimelineTransport', 'Stop the active Molecule transport.', 'timeline.write', 'LOW'],
    ['cells.trigger', 'triggerGroupTimelineCells', 'Cells (non-linear transport): press or release cells [{scene_id, track_id}] ("scene" = the whole Scene); each follows its own quantization, play mode, passes and Follow Action.', 'timeline.write', 'LOW'],
    ['cells.stop', 'stopGroupTimelineCells', 'Stop every playing cell of a Molecule.', 'timeline.write', 'LOW'],
    ['transport.list.toggle', 'toggleGroupTimelineListTransport', 'Toggle sequential playback of the ordered open Molecules on the canonical Kira transport.', 'timeline.write', 'LOW'],
    ['transport.list.stop', 'stopGroupTimelineListTransport', 'Stop sequential Molecule List playback.', 'timeline.write', 'LOW'],
    ['record.prepare', 'prepareGroupTimelineRecording', 'Prepare the current project for microphone recording using the existing Record tool owner. Return group_id and track_id for record.start; creates a Molecule only when needed.', 'timeline.write', 'MODERATE'],
    ['mix.param.set', 'setGroupTimelineMixParam', 'Set one mix module parameter of a strip (strip_id, module_id, param, value): heard at once, kept once it rests.', 'timeline.write', 'LOW'],
    ['history.undo', 'undoGroupTimeline', 'Undo the last Molecule timeline edit on the active session.', 'timeline.write', 'MODERATE'],
    ['history.redo', 'redoGroupTimeline', 'Redo the last undone Molecule timeline edit on the active session.', 'timeline.write', 'MODERATE']
];

const RECORD_TOOLS = [
    ['start', 'startGroupTimelineGenericRecording', 'Start a generic Molecule capture on an armed region or Track. With duration_ms, stop automatically and return the actual imported recording after completion.'],
    ['stop', 'stopGroupTimelineGenericRecording', 'Stop and commit a generic Molecule capture.'],
    ['cancel', 'cancelGroupTimelineGenericRecording', 'Cancel and discard a generic Molecule capture.']
];

export const registerTimelineDefaultTools = ({ Agent }) => {
    TIMELINE_TOOLS.forEach(([verb, method, description, capability, risk]) => Agent.registerTool({
        name: `eve.timeline.${verb}`, description, capabilities: [capability], risk_tier: risk,
        parameters: TIMELINE_TOOL_SCHEMAS[verb],
        handler: async ({ params = {} }) => requireMoleculeTimelineApi()[method](params)
    }));

    ['list', 'mix', 'timeline'].forEach((activity) => Agent.registerTool({
        name: `eve.timeline.activity.${activity}`,
        description: `Open the Molecule ${activity} activity on the shared Bevy project surface.`,
        capabilities: ['timeline.read'],
        risk_tier: 'LOW',
        parameters: TIMELINE_TOOL_SCHEMAS.activity,
        handler: async ({ params = {} }) => requireMoleculeTimelineApi().setGroupTimelineActivity({ ...params, activity })
    }));

    RECORD_TOOLS.forEach(([verb, method, description]) => Agent.registerTool({
        name: `eve.timeline.record.${verb}`,
        description,
        capabilities: ['timeline.write', 'media.capture'],
        risk_tier: verb === 'start' ? 'HIGH' : 'MODERATE',
        parameters: TIMELINE_TOOL_SCHEMAS[`record.${verb}`],
        handler: async ({ params = {} }) => {
            const result = await requireMoleculeTimelineApi()[method](params);
            const { state, ...receipt } = result;
            return receipt;
        }
    }));

    TIMELINE_WRITE_VERBS.forEach((verb) => Agent.registerTool({
        name: `eve.timeline.${verb}`,
        description: `Apply Molecule timeline ${verb}.`,
        capabilities: ['timeline.write'],
        risk_tier: 'MODERATE',
        parameters: timelineWriteVerbSchema(verb),
        handler: async ({ params = {} }) => requireMoleculeTimelineApi().applyGroupTimelineOperation({
            group_id: params.group_id, operation: `eve.timeline.${verb}`, command: params.command
        })
    }));
};
