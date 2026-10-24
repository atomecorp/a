// One contract for runtime V2, AI discovery and MCP: what the assistant needs to
// read about the user's current context (selection, other devices), the debug
// reports it files when a request cannot be done, the orders it relays to the
// user's other devices and the media it hands over to them. Handlers live with
// the eVe assistant.
export const DEBUG_REPORT_SOURCE_DOMAIN = 'assistant_debug';
export const DEBUG_REPORT_ORIGINS = Object.freeze(['user_requested', 'assistant_failure']);

const line = maxLength => ({ type: 'string', minLength: 1, maxLength });
export const ASSISTANT_CONTEXT_COMMANDS = Object.freeze([
    { name: 'selection.get', required: [], properties: {},
        description: 'Read the live selection of the current project: selected ids (last = focus) and a compact description '
            + '(type, name or text, position) of the selected objects first, then of the other objects. Call it before acting '
            + 'on "this", "it", "the selected object" or "the selection"; never claim nothing is selected without calling it.' },
    { name: 'debug.report', persistent: true, required: ['request', 'reason'],
        description: 'File a debug report document when an explicit user request could not be done with the available tools, '
            + 'or when the user asks to put something in the debug logs ("mets ça dans les logs de debug"). The conversation '
            + 'excerpt, selection and platform are attached automatically.',
        properties: {
            request: line(2000), reason: line(4000),
            attempted: { type: 'array', maxItems: 20, items: line(200) },
            origin: { type: 'string', enum: DEBUG_REPORT_ORIGINS },
            conversation: { type: 'object', description: 'Attached by the assistant session; never fill it.' }
        } },
    { name: 'debug.reports.list', required: [], properties: { limit: { type: 'number', minimum: 1, maximum: 50 } },
        description: 'List the latest debug reports filed by the assistant, newest first.' },
    { name: 'assistant.session.end', required: [], properties: {},
        description: 'End the assistant session and stop listening, as a hang-up. Call it when the user dismisses the assistant: '
            + '"au revoir", "tu peux partir", "raccroche", "c\'est bon, tu peux raccrocher", "quitte", "arrête de m\'écouter", "c\'est tout, merci", "goodbye", '
            + '"hang up". Not on a mere mention or a question about these words. The assistant says goodbye itself; '
            + 'the wake phrase "Ève, écoute-moi" or the assistant button opens a new session.' },
    // The user's other devices (surface registry + remote command relay).
    { name: 'surfaces.list', required: [], properties: {},
        description: 'List the other devices where Atome is open and connected now (spoken name, platform, shared by another '
            + 'account or not). Call it when the user asks which devices are available or names a device you cannot find.' },
    { name: 'surface.run', required: ['surface', 'tool'],
        description: 'Run one Atome tool on ANOTHER device of the user, never on this one: « sur la télé du salon, mets France 2 », '
            + '« sur le Mac, ouvre le projet X ». surface = the device name exactly as the user said it; tool = the exact Atome '
            + 'tool name you would use locally (discover it with atome_tool_search, e.g. tv.open_channel, youtube.play); '
            + 'arguments = that tool input. The device runs it under its own permissions and returns its own result. If the '
            + 'result status is SPOKEN_CONFIRMATION_REQUIRED, ask its question aloud and call again with confirmed true only '
            + 'after an explicit yes. Always tell the user the outcome with the result message, including refusals, unknown '
            + 'and offline devices, then any detail the device result gives (e.g. channel candidates to choose from).',
        properties: {
            surface: line(120), tool: line(128),
            arguments: { type: 'object', description: 'Input of the tool, as its own schema describes it.' },
            action: { type: 'string', maxLength: 64, description: 'Tool action when not the default pointer.click.' },
            confirmed: { type: 'boolean', description: 'True only after the user explicitly said yes to the spoken question.' }
        } },
    { name: 'surface.rename', required: ['label'], properties: { label: line(120) },
        description: 'Name THIS device so it can be addressed from the user\'s other devices: « appelle cet appareil la télé '
            + 'du salon », « renomme ce Mac en Mac du bureau ».' },
    // Media handoff: the playing (or selected) media moves to another device and goes on there.
    { name: 'surface.send_media', required: ['surface'],
        description: 'Move what plays here (a TV channel, a YouTube or PeerTube video, a video or audio object), or else the '
            + 'selected media, to ANOTHER device of the user, where it goes on playing at the same position, fullscreen: '
            + '« envoie ça sur la télé du salon », « mets ça sur le Mac », « continue sur l\'iPad ». surface = the device name '
            + 'exactly as the user said it; atome_id only when the user named another media object. It stops here once it '
            + 'plays there. Always say the result message, including refusals, unknown and offline devices.',
        properties: {
            surface: line(120), atome_id: line(128),
            fullscreen: { type: 'boolean', description: 'False only when the user asked for a small window.' }
        } },
    { name: 'media.resume', required: ['atome_id'],
        description: 'Resume on THIS device a media object that was just teleported here from another device: opens its '
            + 'project, plays it from position_seconds, fullscreen when asked. Sent by the device the media left; the '
            + 'assistant uses surface.send_media instead.',
        properties: {
            atome_id: line(128), project_id: line(128),
            position_seconds: { type: 'number', minimum: 0 },
            fullscreen: { type: 'boolean' }
        } }
]);
export const ASSISTANT_CONTEXT_COMMAND_NAMES = Object.freeze(ASSISTANT_CONTEXT_COMMANDS.map(command => command.name));
