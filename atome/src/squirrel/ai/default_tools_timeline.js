import { TIMELINE_TOOL_SCHEMAS, TIMELINE_WRITE_VERBS, timelineWriteVerbDescription, timelineWriteVerbSchema } from '#shared/timeline_tool_contract.js';
import { TIMELINE_LIVE_TOOLS } from '#shared/timeline_live_tools.js';
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
    ['cells.command', 'Drive cells [{scene_id, track_id}] beside their launch: op play (if silent), restart (from its start), stop, pause (the next pause resumes), speed (value 0.25-4) or pitch (value -24..24 semitones, audio clips); each on its own quantization.', 'timeline.write', 'low'],
    ['transport.command', 'Drive a project\'s playback (group_id): op play, stop, toggle, pause (resumed by the next pause) or jump to {kind: start|bar|marker|scene|value, bar, marker_id, scene_id}, landing while it plays on the next step of quantize (project = its Aimant, bar, beat, off).', 'timeline.write', 'low'],
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
    ['mix.preset.save', 'Save a console strip (strip_id) as a preset under name, replacing a preset of that name: its parts (effects, routing, io), all when omitted.', 'timeline.write', 'moderate'],
    ['mix.preset.load', 'Lay a strip preset (preset_id) on a console strip (strip_id): the parts asked (effects, routing, io), all it holds when omitted; volume, pan and opacity stay.', 'timeline.write', 'moderate'],
    ['mix.preset.reset', 'Reset a console strip (strip_id) to a new track\'s strip: its default chain, input and output.', 'timeline.write', 'moderate'],
    ['track.import', 'Lay the person\'s media (media_atome_ids: audio, video, image, MIDI; a media atome id or media_import.list\'s media_id) end to end on a track (track_id) from start_seconds, as its Importer plate.', 'timeline.write', 'moderate'],
    ['hardware.list', 'List the outside MIDI devices: plugged (the ports seen now, a known model\'s controls) and own (the person\'s, set up before), each its key, name, links (⇢ receives MIDI, ⇠ sends MIDI, ♪ sound back on an input) and controls.', 'timeline.read', 'low'],
    ['hardware.place', 'Lay an outside device (hardware.list key or name) on a track of the current project: on track_id it engages for its zone (start_seconds to end_seconds, the take\'s default length when omitted; at 0 when no start); without track_id, a synth gets its own track playing it, an effect a new track holding its zone.', 'timeline.write', 'moderate'],
    ['hardware.learn', 'Learn the next control the person moves on the device laid on track_id (its module_id when it has several): it becomes one of the device\'s controls, automatable. Waits 15 s.', 'timeline.write', 'moderate'],
    ['multicam.regie.effect', 'Choose the Multicam Régie\'s effect of its upper zones F1–F3 (fade, slide, star, blur, pip, zoom, glitch, color, black, iris), or switch its Latch (effect latch).', 'timeline.write', 'low'],
    ['multicam.camera.set', 'Set a Blackmagic camera of a Multicam angle (track_id): name iris, focus, iso, shutter, white_balance, nd, lift, gamma, gain, saturation or contrast with its values; sent by the angle\'s own link (network or Bluetooth) and kept on the angle.', 'timeline.write', 'moderate'],
    ['multicam.camera.share', 'Share this device\'s camera and microphone with the account\'s Multicam (the iPhone as a camera of the Mac); a second call stops sharing.', 'timeline.write', 'moderate'],
    ['media.list', 'List the current project\'s media (sounds, videos, pictures, MIDI files; of types when given): media_id, type, name, length and the clips playing each.', 'timeline.read', 'low'],
    ['media.add', 'Join the person\'s media (media_atome_ids: a media atome id or media_import.list\'s media_id) to the current project, laid on no track (Médias › Ajouter).', 'timeline.write', 'moderate'],
    ['media.replace', 'Make every clip playing the project\'s media media_ids (media.list, one type) play the person\'s media by_media_atome_id instead, same place and length; the replaced media leave the project.', 'timeline.write', 'moderate'],
    ['media.delete', 'Delete the project\'s media media_ids (media.list) and every clip playing them; the history keeps them.', 'timeline.write', 'moderate'],
    ['audio.export', 'Hand an audio clip\'s window (clip_id), as heard, to the system\'s export as a 24-bit WAV.', 'timeline.write', 'moderate'],
    ['midi.freeze', 'Figer: render a MIDI clip (clip_id) by its eVe instrument as an audio clip on the next free track, its MIDI track muted.', 'timeline.write', 'moderate'],
    ...TIMELINE_LIVE_TOOLS
];

const RECORD_DESCRIPTIONS = {
    start: 'Start a generic Molecule capture on an armed region or Track. With duration_ms, stop automatically and return the actual imported recording after completion.',
    stop: 'Stop and commit a generic Molecule capture.',
    cancel: 'Cancel and discard a generic Molecule capture.'
};

// A capture's receipt reaches the assistant without the Molecule state it carries.
// A tool whose work outlasts the gateway's default 8 s answers when it is done, never a TOOL_TIMEOUT while the work goes on
// and lands (R-295 défaut 45): a timed take waits for its own end (record.start's longest duration_ms), and track.import lays
// its media one after another after reading the person's media list (≈ 0.5 s a media on an iPad).
const RECORD_FINISH_MS = 30000;
const TOOL_TIMEOUTS_MS = Object.freeze({
    'track.import': 120000,
    'media.add': 120000,
    'media.replace': 120000,
    'record.start': TIMELINE_TOOL_SCHEMAS['record.start'].properties.duration_ms.maximum + RECORD_FINISH_MS
});
const timeoutOf = (verb) => (TOOL_TIMEOUTS_MS[verb] ? { timeout_ms: TOOL_TIMEOUTS_MS[verb] } : {});

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
            name, description, capabilities: [capability], risk_tier: risk, ...timeoutOf(verb),
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
        ...timeoutOf(`record.${verb}`),
        handler: runTwin(`eve.timeline.record.${verb}`, withoutCaptureState)
    }));

    TIMELINE_WRITE_VERBS.forEach((verb) => Agent.registerTool({
        name: `eve.timeline.${verb}`,
        description: timelineWriteVerbDescription(verb),
        capabilities: ['timeline.write'],
        risk_tier: 'moderate',
        parameters: timelineWriteVerbSchema(verb),
        handler: runTwin(`eve.timeline.${verb}`)
    }));
};
