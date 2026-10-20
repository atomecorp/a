import { PERSONAL_IMPORT_TOOLS, personalImportInputSchema, personalImportToolResult } from '#shared/personal_import_tools.js';
import { CALENDAR_AGENDA_TOOLS } from '#shared/calendar_tool_contract.js';
export const registerCalendarDefaultTools = ({ Agent, safeString, requireCalendarServiceApi, invokeRuntimeDefaultTool }) => {
    for (const tool of PERSONAL_IMPORT_TOOLS.filter(tool => tool.name.startsWith('calendar.'))) Agent.registerTool({
        name: tool.name, description: tool.description, capabilities: [tool.write ? 'calendar.write' : 'calendar.read'],
        risk_tier: tool.write ? 'MEDIUM' : 'LOW', parameters: personalImportInputSchema(tool),
        handler: async ({ params = {} }) => { const api = await requireCalendarServiceApi(); return personalImportToolResult(tool,
            await (tool.param ? api[tool.method](params[tool.param], params) : api[tool.method](params))); }
    });
    // Agenda tools: the runtime tool owns the behaviour, the shared contract its input.
    for (const tool of CALENDAR_AGENDA_TOOLS) Agent.registerTool({
        name: tool.name, description: tool.description,
        capabilities: tool.capabilities, risk_tier: tool.risk,
        parameters: tool.input_schema,
        handler: ({ params, context }) => invokeRuntimeDefaultTool({ tool_id: tool.name, source_tool: tool.name, params: params || {}, context }),
        summary: () => tool.description
    });

    Agent.registerTool({
        name: 'calendar.sources',
        description: 'List unified calendar sources and their roles.',
        capabilities: ['calendar.read'],
        risk_tier: 'LOW',
        parameters: { type: 'object', additionalProperties: false, properties: {} },
        handler: async () => {
            const api = await requireCalendarServiceApi();
            return api.sources();
        },
        summary: () => 'List calendar sources'
    });

    Agent.registerTool({
        name: 'calendar.search',
        description: 'Search the unified calendar view.',
        capabilities: ['calendar.read'],
        risk_tier: 'LOW',
        parameters: {
            type: 'object',
            required: ['query'],
            properties: {
                query: { type: 'string' },
                limit: { type: 'number' },
                source_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarServiceApi();
            const query = safeString(params?.query || params?.q);
            if (!query) throw new Error('Missing query');
            return api.search(query, params || {});
        },
        summary: (params) => `Search calendar ${params?.query || params?.q || ''}`
    });

    Agent.registerTool({
        name: 'calendar.today',
        description: 'List today calendar events from the unified multi-source calendar view.',
        capabilities: ['calendar.read'],
        risk_tier: 'LOW',
        parameters: {
            type: 'object',
            properties: {
                source_id: { type: 'string' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarServiceApi();
            return api.today(params || {});
        },
        summary: () => 'List today calendar events'
    });

    Agent.registerTool({
        name: 'calendar.next',
        description: 'List upcoming calendar events from the unified multi-source calendar view.',
        capabilities: ['calendar.read'],
        risk_tier: 'LOW',
        parameters: {
            type: 'object',
            properties: {
                source_id: { type: 'string' },
                limit: { type: 'number' },
                reference: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarServiceApi();
            return api.next(params || {});
        },
        summary: () => 'List next calendar events'
    });

    Agent.registerTool({
        name: 'calendar.create',
        description: 'Create a calendar event through the unified calendar service.',
        capabilities: ['calendar.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                start: { type: 'string' },
                end: { type: 'string' },
                calendarId: { type: 'string' },
                source_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarServiceApi();
            const payload = params?.event && typeof params.event === 'object'
                ? { ...params.event }
                : { ...(params || {}) };
            delete payload.event;
            return api.create(payload, params || {});
        },
        summary: () => 'Create calendar event through the unified service'
    });

    Agent.registerTool({
        name: 'calendar.update',
        description: 'Update a calendar event through the unified calendar service.',
        capabilities: ['calendar.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            type: 'object',
            required: ['event_id'],
            properties: {
                event_id: { type: 'string' },
                changes: { type: 'object' },
                source_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarServiceApi();
            const eventId = safeString(params?.event_id || params?.eventId || params?.id);
            if (!eventId) throw new Error('Missing event_id');
            const changes = params?.changes && typeof params.changes === 'object'
                ? params.changes
                : { ...(params || {}) };
            delete changes.event_id;
            delete changes.eventId;
            delete changes.id;
            delete changes.changes;
            return api.update(eventId, changes, params || {});
        },
        summary: (params) => `Update calendar event ${params?.event_id || params?.eventId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'calendar.delete',
        description: 'Delete a calendar event through the unified calendar service.',
        capabilities: ['calendar.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            type: 'object',
            required: ['event_id'],
            properties: {
                event_id: { type: 'string' },
                source_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarServiceApi();
            const eventId = safeString(params?.event_id || params?.eventId || params?.id);
            if (!eventId) throw new Error('Missing event_id');
            return api.delete(eventId, params || {});
        },
        summary: (params) => `Delete calendar event ${params?.event_id || params?.eventId || params?.id || ''}`
    });
};
