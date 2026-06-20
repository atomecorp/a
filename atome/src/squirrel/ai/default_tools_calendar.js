export const registerCalendarDefaultTools = ({ Agent, safeString, requireCalendarApi, requireCalendarServiceApi, invokeRuntimeDefaultTool }) => {
    Agent.registerTool({
        name: 'calendar.list_events',
        description: 'List calendar events.',
        capabilities: ['calendar.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                projectId: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            const payload = params?.projectId ? { projectId: String(params.projectId) } : {};
            return invokeRuntimeDefaultTool({
                tool_id: 'calendar.list_events',
                source_tool: 'calendar.list_events',
                params: payload,
                context
            });
        },
        summary: () => 'List calendar events'
    });

    Agent.registerTool({
        name: 'calendar.get_event',
        description: 'Get a calendar event by id.',
        capabilities: ['calendar.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['eventId'],
            properties: {
                eventId: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            const eventId = safeString(params?.eventId);
            if (!eventId) throw new Error('Missing eventId');
            return invokeRuntimeDefaultTool({
                tool_id: 'calendar.get_event',
                source_tool: 'calendar.get_event',
                params: { eventId },
                context
            });
        },
        summary: (params) => `Get calendar event ${params?.eventId || ''}`
    });

    Agent.registerTool({
        name: 'calendar.create_event',
        description: 'Create a calendar event.',
        capabilities: ['calendar.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            properties: {
                event: { type: 'object' },
                projectId: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            const payload = params?.event && typeof params.event === 'object'
                ? { ...params.event }
                : { ...(params || {}) };
            if (params?.projectId) payload.projectId = String(params.projectId);
            delete payload.event;
            return invokeRuntimeDefaultTool({
                tool_id: 'calendar.create_event',
                source_tool: 'calendar.create_event',
                params: payload,
                context
            });
        },
        summary: () => 'Create calendar event'
    });

    Agent.registerTool({
        name: 'calendar.update_event',
        description: 'Update a calendar event.',
        capabilities: ['calendar.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['eventId'],
            properties: {
                eventId: { type: 'string' },
                changes: { type: 'object' }
            }
        },
        handler: async ({ params, context }) => {
            const eventId = safeString(params?.eventId);
            if (!eventId) throw new Error('Missing eventId');
            const changes = params?.changes && typeof params.changes === 'object'
                ? params.changes
                : {};
            return invokeRuntimeDefaultTool({
                tool_id: 'calendar.update_event',
                source_tool: 'calendar.update_event',
                params: { eventId, ...changes },
                context
            });
        },
        summary: (params) => `Update calendar event ${params?.eventId || ''}`
    });

    Agent.registerTool({
        name: 'calendar.delete_event',
        description: 'Delete a calendar event.',
        capabilities: ['calendar.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['eventId'],
            properties: {
                eventId: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            const eventId = safeString(params?.eventId);
            if (!eventId) throw new Error('Missing eventId');
            return invokeRuntimeDefaultTool({
                tool_id: 'calendar.delete_event',
                source_tool: 'calendar.delete_event',
                params: { eventId },
                context
            });
        },
        summary: (params) => `Delete calendar event ${params?.eventId || ''}`
    });

    Agent.registerTool({
        name: 'calendar.ensure_calendar',
        description: 'Ensure a calendar exists (creates default if missing).',
        capabilities: ['calendar.write'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                calendarId: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            const calendarId = safeString(params?.calendarId) || undefined;
            return invokeRuntimeDefaultTool({
                tool_id: 'calendar.ensure_calendar',
                source_tool: 'calendar.ensure_calendar',
                params: calendarId ? { calendarId } : {},
                context
            });
        },
        summary: () => 'Ensure calendar exists'
    });

    Agent.registerTool({
        name: 'calendar.share',
        description: 'Share a calendar with another user.',
        capabilities: ['calendar.write', 'share.write'],
        risk_tier: 'HIGH',
        parameters: {
            required: ['phone'],
            properties: {
                phone: { type: 'string' },
                calendarId: { type: 'string' },
                permissions: { type: 'object' },
                shareType: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarApi();
            const phone = safeString(params?.phone);
            if (!phone) throw new Error('Missing phone');
            const options = {
                calendarId: params?.calendarId ? String(params.calendarId) : undefined,
                phone,
                permissions: params?.permissions,
                shareType: params?.shareType
            };
            return api.shareCalendar(options);
        },
        summary: () => 'Share calendar'
    });

    Agent.registerTool({
        name: 'calendar.export_webcal',
        description: 'Export calendar events as an ICS feed and optional webcal URL.',
        capabilities: ['calendar.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                calendarId: { type: 'string' },
                baseUrl: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarApi();
            return api.exportWebcal({
                calendarId: params?.calendarId ? String(params.calendarId) : undefined,
                baseUrl: params?.baseUrl ? String(params.baseUrl) : undefined
            });
        },
        summary: () => 'Export calendar webcal'
    });

    Agent.registerTool({
        name: 'calendar.sources',
        description: 'List unified calendar sources and their roles.',
        capabilities: ['calendar.read'],
        risk_tier: 'LOW',
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
