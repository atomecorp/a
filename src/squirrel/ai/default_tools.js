const requireGlobal = (name, value) => {
    if (!value) {
        throw new Error(`${name} is not available`);
    }
    return value;
};

const safeString = (value) => {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str ? str : null;
};

const loadCalendarApi = async () => {
    if (globalThis.CalendarAPI) return globalThis.CalendarAPI;
    const mod = await import('../../application/eVe/intuition/tools/calendar.js');
    return mod?.CalendarAPI || globalThis.CalendarAPI || null;
};

const requireCalendarApi = async () => {
    const api = await loadCalendarApi();
    if (!api) {
        throw new Error('CalendarAPI is not available');
    }
    return api;
};

const registerDefaultTools = () => {
    if (typeof globalThis === 'undefined') return;
    const Agent = globalThis.AtomeAI;
    if (!Agent || typeof Agent.registerTool !== 'function') return;

    const AdoleAPI = globalThis.AdoleAPI;

    Agent.registerTool({
        name: 'adole.auth.current',
        description: 'Return current authenticated user info (tauri/fastify).',
        capabilities: ['auth.read'],
        risk_level: 'LOW',
        handler: async () => {
            const api = requireGlobal('AdoleAPI', AdoleAPI);
            const fn = api?.auth?.current;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.auth.current is not available');
            return fn();
        },
        summary: () => 'Read current user'
    });

    Agent.registerTool({
        name: 'adole.atomes.get',
        description: 'Get one atome by id.',
        capabilities: ['atome.read'],
        risk_level: 'LOW',
        params_schema: {
            required: ['id'],
            properties: {
                id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', AdoleAPI);
            const fn = api?.atomes?.get;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.atomes.get is not available');
            const id = safeString(params?.id);
            if (!id) throw new Error('Missing atome id');
            return fn(id);
        },
        summary: (params) => `Read atome ${params?.id || ''}`
    });

    Agent.registerTool({
        name: 'adole.atomes.list',
        description: 'List atomes (optional type/projectId/ownerId/includeShared).',
        capabilities: ['atome.read'],
        risk_level: 'LOW',
        params_schema: {
            properties: {
                type: { type: 'string' },
                projectId: { type: 'string' },
                ownerId: { type: 'string' },
                includeShared: { type: 'boolean' },
                limit: { type: 'number' },
                offset: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', AdoleAPI);
            const fn = api?.atomes?.list;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.atomes.list is not available');

            const payload = {
                ...(params?.type ? { type: String(params.type) } : {}),
                ...(params?.projectId ? { projectId: String(params.projectId) } : {}),
                ...(params?.ownerId ? { ownerId: String(params.ownerId) } : {}),
                ...(typeof params?.includeShared === 'boolean' ? { includeShared: params.includeShared } : {}),
                ...(Number.isFinite(params?.limit) ? { limit: params.limit } : {}),
                ...(Number.isFinite(params?.offset) ? { offset: params.offset } : {})
            };

            return fn(payload);
        },
        summary: () => 'List atomes'
    });

    Agent.registerTool({
        name: 'adole.atomes.create',
        description: 'Create an atome (type/properties/parentId/ownerId). Useful for messages, documents, shapes, etc.',
        capabilities: ['atome.write'],
        risk_level: 'MEDIUM',
        params_schema: {
            properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                parentId: { type: 'string' },
                ownerId: { type: 'string' },
                color: { type: 'string' },
                properties: { type: 'object' },
                particles: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', AdoleAPI);
            const fn = api?.atomes?.create;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.atomes.create is not available');

            const payload = {
                ...(params?.id ? { id: String(params.id) } : {}),
                ...(params?.type ? { type: String(params.type) } : {}),
                ...(params?.color ? { color: String(params.color) } : {}),
                ...(params?.parentId ? { projectId: String(params.parentId) } : {}),
                ...(params?.ownerId ? { ownerId: String(params.ownerId) } : {}),
                ...(params?.properties && typeof params.properties === 'object' ? { properties: params.properties } : {}),
                ...(params?.particles && typeof params.particles === 'object' && !params?.properties ? { particles: params.particles } : {})
            };

            return fn(payload);
        },
        summary: () => 'Create atome'
    });

    Agent.registerTool({
        name: 'adole.atomes.alter',
        description: 'Alter/patch atome properties by id.',
        capabilities: ['atome.write'],
        risk_level: 'MEDIUM',
        params_schema: {
            required: ['id'],
            properties: {
                id: { type: 'string' },
                properties: { type: 'object' },
                particles: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', AdoleAPI);
            const fn = api?.atomes?.alter;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.atomes.alter is not available');
            const id = safeString(params?.id);
            if (!id) throw new Error('Missing atome id');
            const payload = params?.properties || params?.particles;
            if (!payload || typeof payload !== 'object') {
                throw new Error('Missing properties payload');
            }
            return fn(id, payload);
        },
        summary: (params) => `Alter atome ${params?.id || ''}`
    });

    Agent.registerTool({
        name: 'calendar.list_events',
        description: 'List calendar events.',
        capabilities: ['calendar.read'],
        risk_level: 'LOW',
        params_schema: {
            properties: {
                projectId: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarApi();
            const payload = params?.projectId ? { projectId: String(params.projectId) } : {};
            return api.listEvents(payload);
        },
        summary: () => 'List calendar events'
    });

    Agent.registerTool({
        name: 'calendar.get_event',
        description: 'Get a calendar event by id.',
        capabilities: ['calendar.read'],
        risk_level: 'LOW',
        params_schema: {
            required: ['eventId'],
            properties: {
                eventId: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarApi();
            const eventId = safeString(params?.eventId);
            if (!eventId) throw new Error('Missing eventId');
            return api.getEvent(eventId);
        },
        summary: (params) => `Get calendar event ${params?.eventId || ''}`
    });

    Agent.registerTool({
        name: 'calendar.create_event',
        description: 'Create a calendar event.',
        capabilities: ['calendar.write'],
        risk_level: 'MEDIUM',
        params_schema: {
            properties: {
                event: { type: 'object' },
                projectId: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarApi();
            const payload = params?.event && typeof params.event === 'object'
                ? { ...params.event }
                : { ...(params || {}) };
            if (params?.projectId) payload.projectId = String(params.projectId);
            delete payload.event;
            return api.createEvent(payload);
        },
        summary: () => 'Create calendar event'
    });

    Agent.registerTool({
        name: 'calendar.update_event',
        description: 'Update a calendar event.',
        capabilities: ['calendar.write'],
        risk_level: 'MEDIUM',
        params_schema: {
            required: ['eventId'],
            properties: {
                eventId: { type: 'string' },
                changes: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarApi();
            const eventId = safeString(params?.eventId);
            if (!eventId) throw new Error('Missing eventId');
            const changes = params?.changes && typeof params.changes === 'object'
                ? params.changes
                : {};
            return api.updateEvent(eventId, changes);
        },
        summary: (params) => `Update calendar event ${params?.eventId || ''}`
    });

    Agent.registerTool({
        name: 'calendar.delete_event',
        description: 'Delete a calendar event.',
        capabilities: ['calendar.write'],
        risk_level: 'MEDIUM',
        params_schema: {
            required: ['eventId'],
            properties: {
                eventId: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarApi();
            const eventId = safeString(params?.eventId);
            if (!eventId) throw new Error('Missing eventId');
            return api.deleteEvent(eventId);
        },
        summary: (params) => `Delete calendar event ${params?.eventId || ''}`
    });

    Agent.registerTool({
        name: 'calendar.ensure_calendar',
        description: 'Ensure a calendar exists (creates default if missing).',
        capabilities: ['calendar.write'],
        risk_level: 'LOW',
        params_schema: {
            properties: {
                calendarId: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireCalendarApi();
            const calendarId = safeString(params?.calendarId) || undefined;
            return api.ensureCalendar(calendarId);
        },
        summary: () => 'Ensure calendar exists'
    });

    Agent.registerTool({
        name: 'calendar.share',
        description: 'Share a calendar with another user.',
        capabilities: ['calendar.write', 'share.write'],
        risk_level: 'HIGH',
        params_schema: {
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
        risk_level: 'LOW',
        params_schema: {
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
        name: 'adole.share.atomes',
        description: 'Share one or more atomes with a user (by phone number).',
        capabilities: ['share.write'],
        risk_level: 'HIGH',
        params_schema: {
            required: ['phoneNumber', 'atomeIds', 'permissions'],
            properties: {
                phoneNumber: { type: 'string' },
                atomeIds: { type: 'array' },
                permissions: { type: 'object' },
                mode: { type: 'string', enum: ['real-time', 'validation-based'] }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', AdoleAPI);
            const fn = api?.share?.shareAtome || api?.share?.share_atome;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.share.share_atome is not available');

            const phoneNumber = safeString(params?.phoneNumber);
            if (!phoneNumber) throw new Error('Missing phoneNumber');

            const atomeIds = Array.isArray(params?.atomeIds)
                ? params.atomeIds.map(String)
                : [String(params?.atomeIds || '')].filter(Boolean);
            if (!atomeIds.length) throw new Error('Missing atomeIds');

            const permissions = params?.permissions;
            if (!permissions || typeof permissions !== 'object') throw new Error('Missing permissions');

            const mode = safeString(params?.mode) || 'real-time';
            return fn(phoneNumber, atomeIds, permissions, mode);
        },
        summary: () => 'Share atomes'
    });

    Agent.registerTool({
        name: 'adole.share.grant_permission',
        description: 'Grant share permissions (Fastify) without creating share_request atomes.',
        capabilities: ['share.write'],
        risk_level: 'HIGH',
        params_schema: {
            required: ['atomeId', 'principalId', 'permissions'],
            properties: {
                atomeId: { type: 'string' },
                principalId: { type: 'string' },
                permissions: { type: 'object' },
                particleKey: { type: 'string' },
                expiresAt: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', AdoleAPI);
            const fn = api?.share?.grantSharePermission || api?.share?.grant_share_permission;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.share.grant_share_permission is not available');

            const atomeId = safeString(params?.atomeId);
            const principalId = safeString(params?.principalId);
            if (!atomeId || !principalId) throw new Error('Missing atomeId/principalId');
            const permissions = params?.permissions;
            if (!permissions || typeof permissions !== 'object') throw new Error('Missing permissions');

            const options = {
                ...(params?.particleKey ? { particleKey: String(params.particleKey) } : {}),
                ...(params?.expiresAt ? { expiresAt: String(params.expiresAt) } : {})
            };

            return fn(atomeId, principalId, permissions, options);
        },
        summary: () => 'Grant share permission'
    });

    Agent.registerTool({
        name: 'adole.share.publish',
        description: 'Publish/share payload via Fastify share.publish.',
        capabilities: ['share.write'],
        risk_level: 'HIGH',
        params_schema: {
            properties: {
                payload: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', AdoleAPI);
            const fn = api?.share?.publish || api?.share?.share_publish;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.share.publish is not available');
            return fn(params?.payload || {});
        },
        summary: () => 'Publish share payload'
    });
};

registerDefaultTools();
