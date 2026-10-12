// One contract for runtime V2, AI discovery and MCP: what the assistant needs to
// read about the user's current context, and the debug reports it files when a
// request cannot be done. Handlers live with the eVe assistant.
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
        description: 'List the latest debug reports filed by the assistant, newest first.' }
]);
export const ASSISTANT_CONTEXT_COMMAND_NAMES = Object.freeze(ASSISTANT_CONTEXT_COMMANDS.map(command => command.name));
