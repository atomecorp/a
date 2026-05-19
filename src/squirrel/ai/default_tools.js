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

const withSoftTimeout = async (task, {
    timeoutMs = 0,
    fallbackValue = null
} = {}) => {
    const duration = Number(timeoutMs);
    if (!Number.isFinite(duration) || duration <= 0) {
        return task();
    }
    return Promise.race([
        Promise.resolve().then(() => task()),
        new Promise((resolve) => {
            setTimeout(() => resolve(fallbackValue), duration);
        })
    ]);
};

const loadCalendarApi = async () => {
    if (globalThis.CalendarAPI) return globalThis.CalendarAPI;
    const mod = await import('../../../eve/application/intuition/tools/calendar.js');
    return mod?.CalendarAPI || globalThis.CalendarAPI || null;
};

const requireCalendarApi = async () => {
    const api = await loadCalendarApi();
    if (!api) {
        throw new Error('CalendarAPI is not available');
    }
    return api;
};

const requireMailApi = async () => {
    if (globalThis.atome?.mail) return globalThis.atome.mail;
    if (globalThis.window?.atome?.mail) return globalThis.window.atome.mail;
    const mod = await import('../mail/bootstrap.js');
    return mod?.createGlobalMailApi ? mod.createGlobalMailApi({ env: globalThis }) : globalThis.atome?.mail || globalThis.window?.atome?.mail || null;
};

const requireCalendarServiceApi = async () => {
    if (globalThis.atome?.calendar) return globalThis.atome.calendar;
    if (globalThis.window?.atome?.calendar) return globalThis.window.atome.calendar;
    const mod = await import('../calendar/bootstrap.js');
    return mod?.createGlobalCalendarApi ? mod.createGlobalCalendarApi({ env: globalThis }) : globalThis.atome?.calendar || globalThis.window?.atome?.calendar || null;
};

const requireContactsApi = async () => {
    if (globalThis.atome?.contacts) return globalThis.atome.contacts;
    if (globalThis.window?.atome?.contacts) return globalThis.window.atome.contacts;
    const mod = await import('../contacts/bootstrap.js');
    return mod?.createGlobalContactsApi ? mod.createGlobalContactsApi({ env: globalThis }) : globalThis.atome?.contacts || globalThis.window?.atome?.contacts || null;
};

const requireBankApi = async () => {
    if (globalThis.atome?.bank) return globalThis.atome.bank;
    if (globalThis.window?.atome?.bank) return globalThis.window.atome.bank;
    const mod = await import('../bank/bootstrap.js');
    return mod?.createGlobalBankApi ? mod.createGlobalBankApi({ env: globalThis }) : globalThis.atome?.bank || globalThis.window?.atome?.bank || null;
};

const prepareContactsApi = async (options = {}) => {
    const api = await requireContactsApi();
    if (!api) {
        throw new Error('Contacts API is not available');
    }
    if (typeof api.ensureReady === 'function') {
        const ready = await withSoftTimeout(
            () => api.ensureReady({
                ...options
            }),
            {
                timeoutMs: 1500,
                fallbackValue: {
                    ok: false,
                    error: 'contacts_sync_timeout'
                }
            }
        );
        if (ready?.ok === false) {
            const cached = typeof api.list === 'function' ? api.list({ limit: 1 }) : null;
            if (!Array.isArray(cached?.items) || !cached.items.length) {
                return api;
            }
        }
        return api;
    }
    if (typeof api.configureMacosSource === 'function') {
        api.configureMacosSource(options);
    }
    if (typeof api.syncPull === 'function') {
        const syncResult = await api.syncPull({});
        if (syncResult?.ok !== true) {
            const cached = typeof api.list === 'function' ? api.list({ limit: 1 }) : null;
            if (!Array.isArray(cached?.items) || !cached.items.length) {
                throw new Error(syncResult?.error || 'contacts_sync_failed');
            }
        }
    }
    return api;
};

const prepareMailApi = async (options = {}) => {
    const api = await requireMailApi();
    if (!api) {
        throw new Error('Mail API is not available');
    }
    if (typeof api.ensureReady === 'function') {
        const ready = await api.ensureReady(options);
        if (ready?.ok === false) {
            const cached = typeof api.list === 'function' ? api.list({ limit: 1 }) : null;
            if (!Array.isArray(cached?.items) || !cached.items.length) {
                throw new Error(ready?.error || 'mail_sync_failed');
            }
        }
    }
    return api;
};

const requireRuntimeToolApi = () => {
    const runtime = globalThis?.atome?.tools?.v2Runtime || globalThis?.window?.atome?.tools?.v2Runtime || null;
    if (!runtime || typeof runtime.invokeById !== 'function') {
        throw new Error('atome.tools.v2Runtime.invokeById is not available');
    }
    return runtime;
};

const buildRuntimeToolMeta = (context = {}) => {
    const meta = {};
    if (context?.trace_id) meta.trace_id = String(context.trace_id);
    if (context?.intent_id) meta.intent_id = String(context.intent_id);
    if (context?.idempotency_key) meta.idempotency_key = String(context.idempotency_key);
    return meta;
};

const invokeRuntimeDefaultTool = async ({
    tool_id,
    source_tool,
    params = {},
    context = {},
    action = 'pointer.click'
} = {}) => {
    const runtime = requireRuntimeToolApi();
    const input = (params && typeof params === 'object') ? { ...params } : {};
    const meta = buildRuntimeToolMeta(context);
    const source = (context?.source && typeof context.source === 'object')
        ? {
            ...context.source,
            type: String(context.source.type || '').trim() || 'ai',
            layer: String(context.source.layer || '').trim() || 'atome_ai_default_tool',
            tool: source_tool || tool_id
        }
        : {
            type: 'ai',
            layer: 'atome_ai_default_tool',
            tool: source_tool || tool_id
        };
    return runtime.invokeById({
        tool_id,
        action,
        input,
        source,
        ...(Object.keys(meta).length ? { meta } : {})
    });
};

const registerDefaultTools = () => {
    if (typeof globalThis === 'undefined') return;
    const Agent = globalThis.AtomeAI;
    if (!Agent || typeof Agent.registerTool !== 'function') return;

    const getAdoleAPI = () => globalThis.AdoleAPI;

    Agent.registerTool({
        name: 'adole.auth.current',
        description: 'Return current authenticated user info (tauri/fastify).',
        capabilities: ['auth.read'],
        risk_tier: 'LOW',
        handler: async () => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
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
        risk_tier: 'LOW',
        parameters: {
            required: ['id'],
            properties: {
                id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
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
        risk_tier: 'LOW',
        parameters: {
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
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
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
        risk_tier: 'MEDIUM',
        parameters: {
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
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
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
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['id'],
            properties: {
                id: { type: 'string' },
                properties: { type: 'object' },
                particles: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
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
        name: 'eve.mtrack.clip.move',
        description: 'Move one or more MTrack clips (time and/or track) through the mtrack tool action pipeline.',
        capabilities: ['timeline.write', 'ui.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            properties: {
                clip_ids: { type: 'array' },
                clip_id: { type: 'string' },
                atome_ids: { type: 'array' },
                atome_id: { type: 'string' },
                start_seconds: { type: 'number' },
                delta_seconds: { type: 'number' },
                track_id: { type: 'number' },
                track_key: { type: 'string' },
                track_delta: { type: 'number' },
                snap: { type: 'boolean' },
                scope: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            return invokeRuntimeDefaultTool({
                tool_id: 'ui.move',
                source_tool: 'eve.mtrack.clip.move',
                params,
                context,
                action: 'on_apply'
            });
        },
        summary: () => 'Move MTrack clip(s)'
    });

    Agent.registerTool({
        name: 'eve.mtrack.clip.crop',
        description: 'Crop one or more MTrack clips (trim in/out) through the mtrack tool action pipeline.',
        capabilities: ['timeline.write', 'ui.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            properties: {
                clip_ids: { type: 'array' },
                clip_id: { type: 'string' },
                atome_ids: { type: 'array' },
                atome_id: { type: 'string' },
                in_seconds: { type: 'number' },
                in_delta_seconds: { type: 'number' },
                out_seconds: { type: 'number' },
                out_delta_seconds: { type: 'number' },
                snap: { type: 'boolean' },
                scope: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            return invokeRuntimeDefaultTool({
                tool_id: 'ui.crop',
                source_tool: 'eve.mtrack.clip.crop',
                params,
                context,
                action: 'on_apply'
            });
        },
        summary: () => 'Crop MTrack clip(s)'
    });

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

    Agent.registerTool({
        name: 'mail.list',
        description: 'List locally indexed mail items.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                mailbox: { type: 'string' },
                unread_only: { type: 'boolean' },
                limit: { type: 'number' },
                after_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            return api.list(params || {});
        },
        summary: () => 'List mail'
    });

    Agent.registerTool({
        name: 'mail.read',
        description: 'Read one locally indexed mail item by message id.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.read(messageId);
        },
        summary: (params) => `Read mail ${params?.message_id || params?.messageId || ''}`
    });

    Agent.registerTool({
        name: 'mail.search',
        description: 'Search the local mail index.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['query'],
            properties: {
                query: { type: 'string' },
                mailbox: { type: 'string' },
                unread_only: { type: 'boolean' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const query = safeString(params?.query || params?.q);
            if (!query) throw new Error('Missing query');
            return api.search(query, params || {});
        },
        summary: (params) => `Search mail ${params?.query || params?.q || ''}`
    });

    Agent.registerTool({
        name: 'mail.next_unread',
        description: 'Return the next unread mail from the local index.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                mailbox: { type: 'string' },
                after_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            return api.nextUnread(params || {});
        },
        summary: () => 'Next unread mail'
    });

    Agent.registerTool({
        name: 'mail.summarize',
        description: 'Summarize the local mail index.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                mailbox: { type: 'string' },
                unread_only: { type: 'boolean' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            return api.summarize(params || {});
        },
        summary: () => 'Summarize mail'
    });

    Agent.registerTool({
        name: 'mail.reply_draft',
        description: 'Create a local reply draft for a mail item.',
        capabilities: ['mail.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' },
                reply_text: { type: 'string' },
                signature: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.replyDraft(messageId, {
                reply_text: params?.reply_text || params?.replyText || '',
                signature: params?.signature || ''
            });
        },
        summary: () => 'Draft mail reply'
    });

    Agent.registerTool({
        name: 'mail.mark_read',
        description: 'Mark one mail item as read.',
        capabilities: ['mail.write'],
        risk_tier: 'LOW',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.markRead(messageId, { read: true });
        },
        summary: (params) => `Mark mail read ${params?.message_id || params?.messageId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'mail.mark_unread',
        description: 'Mark one mail item as unread.',
        capabilities: ['mail.write'],
        risk_tier: 'LOW',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.markUnread(messageId, { read: false });
        },
        summary: (params) => `Mark mail unread ${params?.message_id || params?.messageId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'mail.archive',
        description: 'Archive one mail item.',
        capabilities: ['mail.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.archive(messageId, {});
        },
        summary: (params) => `Archive mail ${params?.message_id || params?.messageId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'mail.delete',
        description: 'Delete one mail item.',
        capabilities: ['mail.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.delete(messageId, {});
        },
        summary: (params) => `Delete mail ${params?.message_id || params?.messageId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'mail.send',
        description: 'Queue a locally prepared draft for send after explicit confirmation.',
        capabilities: ['mail.send'],
        risk_tier: 'HIGH',
        parameters: {
            required: ['draft_id'],
            properties: {
                draft_id: { type: 'string' },
                confirmed: { type: 'boolean' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const draftId = safeString(params?.draft_id || params?.draftId || params?.id);
            if (!draftId) throw new Error('Missing draft_id');
            return api.send(draftId, {
                confirmed: params?.confirmed === true
            });
        },
        summary: () => 'Send mail draft'
    });

    Agent.registerTool({
        name: 'contacts.sources',
        description: 'List contact sources currently bridged into eVe.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        handler: async () => {
            const api = await prepareContactsApi();
            return api.sources();
        },
        summary: () => 'List contact sources'
    });

    Agent.registerTool({
        name: 'contacts.list',
        description: 'List synchronized contacts available in eVe.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                limit: { type: 'number' },
                source_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareContactsApi();
            return api.list(params || {});
        },
        summary: () => 'List contacts'
    });

    Agent.registerTool({
        name: 'contacts.search',
        description: 'Search synchronized contacts by name, email or phone.',
        capabilities: ['contacts.read'],
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
            const api = await prepareContactsApi();
            const query = safeString(params?.query || params?.q);
            if (!query) throw new Error('Missing query');
            return api.search(query, params || {});
        },
        summary: (params) => `Search contacts ${params?.query || params?.q || ''}`
    });

    Agent.registerTool({
        name: 'contacts.read',
        description: 'Read one synchronized contact by contact id or source contact id.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['contact_id'],
            properties: {
                contact_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareContactsApi();
            const contactId = safeString(params?.contact_id || params?.contactId || params?.id);
            if (!contactId) throw new Error('Missing contact_id');
            return api.read(contactId);
        },
        summary: (params) => `Read contact ${params?.contact_id || params?.contactId || ''}`
    });

    Agent.registerTool({
        name: 'contacts.create',
        description: 'Create one local eVe contact.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                contact: { type: 'object' },
                name: { type: 'string' },
                first_name: { type: 'string' },
                nickname: { type: 'string' },
                phone: { type: 'string' },
                email: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.createLocalContact !== 'function') {
                throw new Error('Contacts create API is not available');
            }
            const contact = params?.contact && typeof params.contact === 'object'
                ? { ...params.contact }
                : { ...(params || {}) };
            delete contact.contact;
            return api.createLocalContact(contact, params || {});
        },
        summary: (params) => `Create contact ${params?.contact?.name || params?.name || ''}`
    });

    Agent.registerTool({
        name: 'contacts.update',
        description: 'Update one local eVe contact.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        parameters: {
            required: ['contact_id'],
            properties: {
                contact_id: { type: 'string' },
                changes: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.updateLocalContact !== 'function') {
                throw new Error('Contacts update API is not available');
            }
            const contactId = safeString(params?.contact_id || params?.contactId || params?.id);
            if (!contactId) throw new Error('Missing contact_id');
            const changes = params?.changes && typeof params.changes === 'object'
                ? { ...params.changes }
                : params?.contact && typeof params.contact === 'object'
                    ? { ...params.contact }
                    : { ...(params || {}) };
            delete changes.contact_id;
            delete changes.contactId;
            delete changes.id;
            delete changes.changes;
            delete changes.contact;
            return api.updateLocalContact(contactId, changes, params || {});
        },
        summary: (params) => `Update contact ${params?.contact_id || params?.contactId || ''}`
    });

    Agent.registerTool({
        name: 'contacts.delete',
        description: 'Delete one local eVe contact.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        parameters: {
            required: ['contact_id'],
            properties: {
                contact_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.deleteLocalContact !== 'function') {
                throw new Error('Contacts delete API is not available');
            }
            const contactId = safeString(params?.contact_id || params?.contactId || params?.id);
            if (!contactId) throw new Error('Missing contact_id');
            return api.deleteLocalContact(contactId, params || {});
        },
        summary: (params) => `Delete contact ${params?.contact_id || params?.contactId || ''}`
    });

    Agent.registerTool({
        name: 'contacts.import_macos',
        description: 'Import contacts from the local macOS Contacts snapshot into the eVe local contacts store.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.importMacosContacts !== 'function') {
                throw new Error('Contacts import API is not available');
            }
            return api.importMacosContacts(params || {});
        },
        summary: () => 'Import Mac contacts'
    });

    Agent.registerTool({
        name: 'contacts.import_icloud',
        description: 'Import contacts from iCloud CardDAV into the eVe local contacts store.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.importIcloudContacts !== 'function') {
                throw new Error('iCloud contacts import API is not available');
            }
            return api.importIcloudContacts(params || {});
        },
        summary: () => 'Import iCloud contacts'
    });

    Agent.registerTool({
        name: 'contacts.push_icloud',
        description: 'Push one eVe contact to iCloud Contacts after explicit confirmation.',
        capabilities: ['contacts.write'],
        risk_tier: 'HIGH',
        parameters: {
            properties: {
                contact_id: { type: 'string' },
                contact: { type: 'object' },
                confirmed: { type: 'boolean' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.pushContactToIcloud !== 'function') {
                throw new Error('iCloud contacts write API is not available');
            }
            return api.pushContactToIcloud(params || {});
        },
        summary: (params) => `Push contact to iCloud ${params?.contact_id || params?.contact?.name || ''}`
    });

    Agent.registerTool({
        name: 'contacts.open_panel',
        description: 'Open the existing eVe contact panel.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        handler: async () => {
            const api = await prepareContactsApi();
            return api.openPanel();
        },
        summary: () => 'Open contact panel'
    });

    Agent.registerTool({
        name: 'bank.accounts',
        description: 'List normalized bank accounts.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        handler: async () => {
            const api = await requireBankApi();
            return api.accounts();
        },
        summary: () => 'List bank accounts'
    });

    Agent.registerTool({
        name: 'bank.balance',
        description: 'Read one account balance or the total balance.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                account_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.balance(params || {});
        },
        summary: () => 'Read bank balance'
    });

    Agent.registerTool({
        name: 'bank.transactions',
        description: 'List normalized bank transactions.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                account_id: { type: 'string' },
                period: { type: 'string' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.transactions(params || {});
        },
        summary: () => 'List bank transactions'
    });

    Agent.registerTool({
        name: 'bank.summary',
        description: 'Summarize bank movements over a period.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                account_id: { type: 'string' },
                period: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.summary(params || {});
        },
        summary: () => 'Summarize bank activity'
    });

    Agent.registerTool({
        name: 'bank.search_transactions',
        description: 'Search transactions in natural language over the local bank analytics index.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['query'],
            properties: {
                query: { type: 'string' },
                account_id: { type: 'string' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            const query = safeString(params?.query || params?.q);
            if (!query) throw new Error('Missing query');
            return api.searchTransactions(query, params || {});
        },
        summary: (params) => `Search bank transactions ${params?.query || params?.q || ''}`
    });

    Agent.registerTool({
        name: 'bank.find_payer',
        description: 'Find incoming payments from one payer or counterparty.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['name'],
            properties: {
                name: { type: 'string' },
                period: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            const name = safeString(params?.name || params?.payer || params?.counterparty);
            if (!name) throw new Error('Missing name');
            return api.findPayer(name, params || {});
        },
        summary: (params) => `Find payer ${params?.name || params?.payer || params?.counterparty || ''}`
    });

    Agent.registerTool({
        name: 'bank.spending_by_period',
        description: 'Aggregate debit spending by period.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                period: { type: 'string' },
                granularity: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.spendingByPeriod(params || {});
        },
        summary: () => 'Aggregate spending by period'
    });

    Agent.registerTool({
        name: 'bank.top_merchants',
        description: 'Rank top debit merchants over a period.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                period: { type: 'string' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.topMerchants(params || {});
        },
        summary: () => 'Top bank merchants'
    });

    Agent.registerTool({
        name: 'bank.recurring_payments',
        description: 'Detect recurring outgoing payments.',
        capabilities: ['bank.read'],
        risk_tier: 'LOW',
        handler: async ({ params }) => {
            const api = await requireBankApi();
            return api.recurringPayments(params || {});
        },
        summary: () => 'Detect recurring payments'
    });

    Agent.registerTool({
        name: 'adole.share.atomes',
        description: 'Share one or more atomes with a user (by phone number).',
        capabilities: ['share.write'],
        risk_tier: 'HIGH',
        parameters: {
            required: ['phoneNumber', 'atomeIds', 'permissions'],
            properties: {
                phoneNumber: { type: 'string' },
                atomeIds: { type: 'array' },
                permissions: { type: 'object' },
                mode: { type: 'string', enum: ['real-time', 'validation-based'] }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
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
        risk_tier: 'HIGH',
        parameters: {
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
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
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
        risk_tier: 'HIGH',
        parameters: {
            properties: {
                payload: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.share?.publish || api?.share?.share_publish;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.share.publish is not available');
            return fn(params?.payload || {});
        },
        summary: () => 'Publish share payload'
    });
};

registerDefaultTools();
