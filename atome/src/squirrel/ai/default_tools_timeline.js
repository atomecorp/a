import { TIMELINE_TOOL_SCHEMAS, TIMELINE_WRITE_VERBS, timelineWriteVerbSchema } from '#shared/timeline_tool_contract.js';
import { TIMELINE_AI_RUNTIME_TOOL_IDS } from './timeline_tool_ids.js';

// The gateway calls handler({ params, context }). Every tool runs its Runtime V2 twin
// (timeline_tool_ids.js, eVe/intuition/tools/timeline_actions.js): one executor, one policy.
const TIMELINE_TOOLS = [
    ['read', 'Read the active Molecule timeline snapshot.', 'timeline.read', 'low'],
    ['operation', 'Apply one Molecule timeline operation through the active session.', 'timeline.write', 'moderate'],
    ['batch', 'Apply an atomic Molecule timeline operation batch through the active session.', 'timeline.write', 'moderate'],
    ['transfer', 'Atomically transfer a Section or Track between two open Molecules.', 'timeline.write', 'moderate'],
    ['transport.toggle', 'Toggle Molecule, Section, or Track playback on the canonical Kira transport.', 'timeline.write', 'low'],
    ['clip.place', 'Place a ribbon tool (placed_tool_id) or another project (placed_project_id) on a track at start_seconds: a tool executes when the playhead reaches it (a lasting tool runs to the clip end); a project plays nested, or is launched/opened (mode).', 'timeline.write', 'low'],
    ['transport.play', 'Play a project\'s timeline (group_id = the project id) from start_seconds, opening it first if needed: a launched project.', 'timeline.write', 'low'],
    ['transport.stop', 'Stop the active Molecule transport.', 'timeline.write', 'low'],
    ['cells.trigger', 'Cells (non-linear transport): press or release cells [{scene_id, track_id}] ("scene" = the whole Scene); each follows its own quantization, play mode, passes and Follow Action.', 'timeline.write', 'low'],
    ['cells.stop', 'Stop every playing cell of a Molecule.', 'timeline.write', 'low'],
    ['transport.list.toggle', 'Toggle sequential playback of the ordered open Molecules on the canonical Kira transport.', 'timeline.write', 'low'],
    ['transport.list.stop', 'Stop sequential Molecule List playback.', 'timeline.write', 'low'],
    ['record.prepare', 'Prepare the current project for microphone recording using the existing Record tool owner. Return group_id and track_id for record.start; creates a Molecule only when needed.', 'timeline.write', 'moderate'],
    ['mix.param.set', 'Set one mix module parameter of a strip (strip_id, module_id, param, value): heard at once, kept once it rests.', 'timeline.write', 'low'],
    ['history.undo', 'Undo the last Molecule timeline edit on the active session.', 'timeline.write', 'moderate'],
    ['history.redo', 'Redo the last undone Molecule timeline edit on the active session.', 'timeline.write', 'moderate'],
    ['performance.delete', 'Delete the recorded performance (automation played live) of the active Molecule.', 'timeline.write', 'moderate'],
    ['realign', 'Lay a project\'s timeline again in its List order (the current project when project_id is omitted).', 'timeline.write', 'moderate'],
    ['midi.export', 'Hand a MIDI clip\'s own .mid file (clip_id) to the system\'s export.', 'timeline.write', 'moderate'],
    ['mix.preset.list', 'List the person\'s console strip presets (id, name, lane), of one lane when given.', 'timeline.read', 'low'],
    ['mix.preset.save', 'Save a console strip\'s chain, input and output (strip_id) as a preset under name.', 'timeline.write', 'moderate'],
    ['mix.preset.load', 'Lay a strip preset (preset_id) on a console strip (strip_id), in place of its effects.', 'timeline.write', 'moderate'],
    ['track.import', 'Lay the person\'s media atomes (media_atome_ids: audio, video, image) end to end on a track (track_id) from start_seconds, as its Importer plate.', 'timeline.write', 'moderate'],
    ['audio.export', 'Hand an audio clip\'s window (clip_id), as heard, to the system\'s export as a 24-bit WAV.', 'timeline.write', 'moderate'],
    ['midi.freeze', 'Figer: render a MIDI clip (clip_id) by its eVe instrument as an audio clip on the next free track, its MIDI track muted.', 'timeline.write', 'moderate']
];

const RECORD_DESCRIPTIONS = {
    start: 'Start a generic Molecule capture on an armed region or Track. With duration_ms, stop automatically and return the actual imported recording after completion.',
    stop: 'Stop and commit a generic Molecule capture.',
    cancel: 'Cancel and discard a generic Molecule capture.'
};

// A capture's receipt reaches the assistant without the Molecule state it carries.
const withoutCaptureState = (outcome) => {
    const receipt = outcome?.result?.result;
    if (!receipt || typeof receipt !== 'object') return outcome;
    const { state, ...rest } = receipt;
    return { ...outcome, result: { ...outcome.result, result: rest } };
};

export const registerTimelineDefaultTools = ({ Agent, invokeRuntimeDefaultTool }) => {
    const runTwin = (name, project = (outcome) => outcome) => async ({ params = {}, context }) => project(
        await invokeRuntimeDefaultTool({ tool_id: TIMELINE_AI_RUNTIME_TOOL_IDS[name], source_tool: name, params, context })
    );

    TIMELINE_TOOLS.forEach(([verb, description, capability, risk]) => {
        const name = `eve.timeline.${verb}`;
        if (!TIMELINE_AI_RUNTIME_TOOL_IDS[name]) throw new Error(`timeline_ai_tool_without_runtime_twin:${name}`);
        Agent.registerTool({
            name, description, capabilities: [capability], risk_tier: risk,
            parameters: TIMELINE_TOOL_SCHEMAS[verb],
            handler: runTwin(name)
        });
    });

    ['list', 'mix', 'timeline'].forEach((activity) => Agent.registerTool({
        name: `eve.timeline.activity.${activity}`,
        description: `Open the Molecule ${activity} activity on the shared Bevy project surface.`,
        capabilities: ['timeline.read'],
        risk_tier: 'low',
        parameters: TIMELINE_TOOL_SCHEMAS.activity,
        handler: runTwin(`eve.timeline.activity.${activity}`)
    }));

    Object.entries(RECORD_DESCRIPTIONS).forEach(([verb, description]) => Agent.registerTool({
        name: `eve.timeline.record.${verb}`,
        description,
        // A take turns the microphone on (its twin asks media.capture) but sends nothing out: `moderate`, done at once when
        // the person asked her; `high` is what leaves toward others (mcp_security_policy.js OUTWARD_AI_TIERS, rule 22).
        capabilities: ['timeline.write', 'media.capture'],
        risk_tier: 'moderate',
        parameters: TIMELINE_TOOL_SCHEMAS[`record.${verb}`],
        handler: runTwin(`eve.timeline.record.${verb}`, withoutCaptureState)
    }));

    TIMELINE_WRITE_VERBS.forEach((verb) => Agent.registerTool({
        name: `eve.timeline.${verb}`,
        description: `Apply Molecule timeline ${verb}.`,
        capabilities: ['timeline.write'],
        risk_tier: 'moderate',
        parameters: timelineWriteVerbSchema(verb),
        handler: runTwin(`eve.timeline.${verb}`)
    }));
};
