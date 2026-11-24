// One contract for runtime V2, AI discovery and MCP: what the assistant needs to
// read about the user's current context (selection, other devices), the debug
// reports it files (bug_report_contract.js: sent to the server, listed in Réglages >
// Avancé), the orders it relays to the user's other devices and the media it hands
// over to them. Handlers live with the eVe assistant.
export const DEBUG_REPORT_ORIGINS = Object.freeze(['user_requested', 'assistant_failure']);

const line = maxLength => ({ type: 'string', minLength: 1, maxLength });
export const ASSISTANT_CONTEXT_COMMANDS = Object.freeze([
    { name: 'help.open', required: [], properties: { query: { type: 'string', maxLength: 500 } },
        description: 'Open the existing eVe Help panel on the dashboard when the user asks to open Help. '
            + 'A request to explain something alone does not require opening a panel; use help.search for information.' },
    { name: 'help.search', required: [], properties: {
        query: { type: 'string', maxLength: 500 },
        workspace_mode: { type: 'string', enum: ['dashboard', 'project'] }
    }, description: 'Search the local eVe Help catalogue before answering a question about how to use eVe, or about what atome/eVe is, '
        + 'why it exists, its purpose, vision or principles (topic about_eve, its author\'s own pitch: query e.g. "pourquoi eve" or '
        + '"about eve"). Answer those from the returned text, never from general knowledge. Use concise topic keywords '
        + 'rather than a whole question; the local search requires every word to match. '
        + 'Returns existing help articles in the current language, without opening tools or changing a project. '
        + 'Articles marked unverified are not proof that a procedure is currently available; say so and do not invent steps.' },
    { name: 'selection.get', required: [], properties: {},
        description: 'Read the live selection of the current project: selected ids (last = focus) and a compact description '
            + '(type, name or text, position) of the selected objects first, then of the other objects. Call it before acting '
            + 'on "this", "it", "the selected object" or "the selection"; never claim nothing is selected without calling it.' },
    { name: 'debug.report', persistent: true, required: ['request', 'reason'],
        description: 'File a bug report when the user asks to report a bug or to put something in the debug logs ("envoie un '
            + 'rapport de bug", "signale un bug", "mets ça dans les logs de debug"), or when an explicit user request could not '
            + 'be done with the available tools. It is sent to the eVe team at once and listed in Réglages > Avancé. The '
            + 'conversation excerpt, selection, platform and versions are attached automatically.',
        properties: {
            request: line(2000), reason: line(4000),
            attempted: { type: 'array', maxItems: 20, items: line(200) },
            origin: { type: 'string', enum: DEBUG_REPORT_ORIGINS },
            share_contact: { type: 'boolean', description: 'True only after the user explicitly agreed to attach their phone '
                + 'number, name and e-mail to the report.' },
            conversation: { type: 'object', description: 'Attached by the assistant session; never fill it.' }
        } },
    { name: 'debug.reports.list', required: [], properties: { limit: { type: 'number', minimum: 1, maximum: 50 } },
        description: 'List the latest bug reports (filed by the user or the assistant), newest first, whether each was sent and '
            + 'whether the eVe team fixed it.' },
    { name: 'debug.reports.delete', persistent: true, required: ['ids'],
        properties: { ids: { type: 'array', minItems: 1, maxItems: 50, items: line(80) } },
        description: 'Remove bug reports from the user\'s list in Réglages > Avancé, as its Supprimer tool does: "supprime les '
            + 'rapports résolus", "efface ce rapport de bug". Take the ids from debug.reports.list; only when the user asked for it. '
            + 'The eVe team keeps the reports it received.' },
    { name: 'assistant.session.end', required: [], properties: {},
        description: 'End the assistant session and stop listening, as a hang-up. Call it when the user dismisses the assistant: '
            + '"au revoir", "tu peux partir", "raccroche", "c\'est bon, tu peux raccrocher", "quitte", "arrête de m\'écouter", "c\'est tout, merci", "goodbye", '
            + '"hang up". Not on a mere mention or a question about these words. Say nothing yourself: once she has left, eVe says '
            + 'her own farewell, which names the wake phrase "Ève, écoute-moi" that, like the assistant button, opens a new session.' },
    // A call-back: an event of eVe's own calendar whose alarm rings, then reopens the assistant.
    { name: 'assistant.callback.schedule', persistent: true, required: ['reason'],
        description: 'Schedule a call-back when the user asks you to call them back or to talk to them later: « rappelle-moi dans '
            + '10 minutes », « rappelle-moi à 15 h de … », « reparle-moi de ça demain à 9 h ». At that time it rings and you open by '
            + 'yourself, ready to listen, and tell why you call. reason = what to call back about, in the user\'s words; give '
            + 'delay_minutes for a delay, or time (HH:MM, the next one to come) with an optional date (YYYY-MM-DD), both local. '
            + 'Then say the result\'s when to the user.',
        properties: {
            reason: line(500), delay_minutes: { type: 'number', minimum: 1 },
            time: { type: 'string', pattern: '^\\d{1,2}:\\d{2}$' }, date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
        } },
    { name: 'assistant.callback.run', required: ['reason'], properties: { reason: line(500), requested_at: line(40) },
        description: 'Run by a scheduled call-back\'s alarm: opens the assistant, which tells the user why it calls. Never call it '
            + 'yourself; use assistant.callback.schedule.' },
    // Timed actions (eVe/intuition/runtime/timed_tool_runs.js): a tool run after a delay or at a time; the clocks are
    // calendar.time.read.
    { name: 'timer.schedule', required: ['tool'],
        description: 'Run an Atome tool later, without asking again: after delay_seconds, or at a local time (HH:MM or '
            + 'HH:MM:SS, the next one to come; date YYYY-MM-DD to pick another day), within 24 hours, while eVe stays open. '
            + 'tool = the exact tool name (as for surface.run), input = its own input, action only when not pointer.click. '
            + '« arrête l\'enregistrement dans 2 minutes » → tool captures.stop, delay_seconds 120; « à 18 h, ferme la capture » '
            + '→ tool captures.close, time 18:00. To make a capture last a given time, prefer captures.start with duration_seconds. '
            + 'A reminder that must ring, or a call-back, is not this tool: use the calendar or assistant.callback.schedule. '
            + 'Then tell the user the result\'s when.',
        properties: {
            tool: line(128), input: { type: 'object', description: 'Input of the tool, as its own schema describes it.' },
            action: { type: 'string', maxLength: 64 }, label: { type: 'string', maxLength: 200 },
            delay_seconds: { type: 'number', minimum: 1, maximum: 86400 },
            time: { type: 'string', pattern: '^\\d{1,2}:\\d{2}(:\\d{2})?$' }, date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
        } },
    { name: 'timer.list', required: [], properties: {},
        description: 'List the timed actions waiting (tool, when, seconds left) and the last ones run with their outcome.' },
    { name: 'timer.cancel', required: [], properties: { timer_id: line(80), tool: line(128) },
        description: 'Cancel timed actions: one by its timer_id (timer.list), every one of a tool, or, with neither, all of them '
            + '(« annule le minuteur », « n\'arrête pas l\'enregistrement finalement »).' },
    // The user's other devices (surface registry + remote command relay).
    { name: 'surfaces.list', required: [], properties: {},
        description: 'List the other devices where Atome is open and connected now (spoken name, platform, shared by another '
            + 'account or not), then the screens of the local network (a Chromecast, an Apple TV), those heard now and those '
            + 'known but absent. Call it when the user asks which devices or screens are available or names one you cannot '
            + 'find; read the names aloud and ask which one.' },
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
            + 'plays there. A screen of the local network (a Chromecast, an Apple TV: « envoie la vidéo vers l\'Apple TV du '
            + 'salon ») is named the same way: it fetches and plays the video, photo or sound itself. Always say the result '
            + 'message, including refusals, unknown and offline devices, and a pairing to do (surface.pair).',
        properties: {
            surface: line(120), atome_id: line(128),
            fullscreen: { type: 'boolean', description: 'False only when the user asked for a small window.' }
        } },
    // An AirPlay receiver is paired once (R-248): the television shows a code, the person says it.
    { name: 'surface.pair', required: ['surface'],
        description: 'Pair an Apple TV (an AirPlay screen of the network) once, so media can be sent to it: called with its '
            + 'name alone, its television shows a four-digit code; called again with pin = the digits the user reads there, '
            + 'it is paired. Use it when surface.send_media says the screen must be paired. Say the result message.',
        properties: { surface: line(120), pin: { type: 'string', maxLength: 8, description: 'The code the television shows.' } } },
    { name: 'surface.mirror', required: ['surface'],
        description: 'Show the whole view of this device on a screen of the network (an Apple TV, a Chromecast: « mets l\'écran '
            + 'sur la télé du salon ») or on another device of the user (« montre mon bureau sur le Mac »): it goes there live, '
            + 'mirrored or extended as the screen mode says (ui.external_display.mode). Say the result message, including a '
            + 'pairing to do (surface.pair).',
        properties: { surface: line(120) } },
    { name: 'media.resume', required: ['atome_id'],
        description: 'Resume on THIS device a media object that was just teleported here from another device: opens its '
            + 'project, plays it from position_seconds, fullscreen when asked. Sent by the device the media left; the '
            + 'assistant uses surface.send_media instead.',
        properties: {
            atome_id: line(128), project_id: line(128),
            position_seconds: { type: 'number', minimum: 0 },
            fullscreen: { type: 'boolean' }
        } },
    // The whole view of a device shown by another device of the account (R-248, Téléporte with nothing selected): sent by
    // the device that leads; the assistant never calls these, Téléporte does.
    { name: 'display.follow', required: ['leader_surface_id'],
        description: 'Show on THIS device the place of another device of the user (its project, its view), following it live. '
            + 'Sent by that device (Téléporte, nothing selected); the assistant never calls it.',
        properties: { leader_surface_id: line(128) } },
    { name: 'display.unfollow', required: [],
        description: 'Stop following another device here, and come back to this device\'s own place. Sent by the device that '
            + 'led; the assistant never calls it.',
        properties: { leader_surface_id: line(128) } },
    { name: 'display.relay', required: ['from', 'message'],
        description: 'One message between a device and another that follows it (its place, a request of its Timeline). Sent '
            + 'by those devices only; the assistant never calls it.',
        properties: { from: line(128), message: { type: 'object' } } }
]);
export const ASSISTANT_CONTEXT_COMMAND_NAMES = Object.freeze(ASSISTANT_CONTEXT_COMMANDS.map(command => command.name));
