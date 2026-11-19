// Shared prelude: the mounted Timeline content, the tool gateway, the timeline API, the host clock.
const G = await import('/chunks/shared/__TG__');
const SURF = await import('/chunks/shared/__PV__');
const api = window.eveMoleculeTimelineApi;
// AUM_PROJECT=<project id>: the project's timeline, when the last activated one is another project's.
var gid = '__GID__' || api.getActiveGroupTimelineId();
const content = SURF.readMountedProjectViewContent();
const tool = (tool_id, input = {}, action = 'pointer.click') => G.invokeToolGateway({ tool_id, action, input, source: { type: 'ui', layer: 'probe' } });
const timeline = () => api.readGroupTimeline({ group_id: gid })?.timeline || api.readGroupTimeline({ group_id: gid });
const transport = () => api.readGroupTimelineTransport({ group_id: gid });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
