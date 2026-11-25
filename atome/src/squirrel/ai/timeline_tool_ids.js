// The AtomeAI timeline tools (`eve.timeline.*`) are the assistant's names for the
// Runtime V2 timeline tools (`ui.timeline.*`, eVe/intuition/tools/timeline_actions.js):
// one executor, one policy. This map is read by the AI tool registration
// (default_tools_timeline.js) and by the MCP access policy, so `ai.tools.call` of an
// `eve.timeline.*` tool is judged as the runtime tool it runs.
import { TIMELINE_WRITE_VERBS } from '#shared/timeline_tool_contract.js';
import { TIMELINE_LIVE_VERBS } from '#shared/timeline_live_tools.js';

const TWINNED_VERBS = [
    'read', 'batch', 'transfer', 'transport.toggle', 'clip.place', 'transport.play', 'transport.stop',
    'transport.list.toggle', 'transport.list.stop', 'mix.param.set', 'history.undo', 'history.redo',
    'activity.list', 'activity.mix', 'activity.timeline', 'record.start', 'record.stop', 'record.cancel',
    'operation', 'cells.trigger', 'cells.stop', 'cells.command', 'transport.command', 'record.prepare', 'performance.delete', 'realign', 'midi.export', 'midi.freeze', 'audio.export', 'track.import', 'hardware.list', 'hardware.place', 'hardware.learn', 'multicam.regie.effect', 'multicam.camera.set', 'multicam.camera.share', 'media.list', 'media.add', 'media.replace', 'media.delete', 'mix.preset.list', 'mix.preset.save', 'mix.preset.load', 'mix.preset.reset',
    ...TIMELINE_LIVE_VERBS, ...TIMELINE_WRITE_VERBS
];

export const TIMELINE_AI_RUNTIME_TOOL_IDS = Object.freeze(Object.fromEntries(
    TWINNED_VERBS.map((verb) => [`eve.timeline.${verb}`, `ui.timeline.${verb}`])
));
