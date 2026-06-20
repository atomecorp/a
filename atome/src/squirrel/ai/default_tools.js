import { registerAdoleDefaultTools } from './default_tools_adole.js';
import { registerCalendarDefaultTools } from './default_tools_calendar.js';
import { registerMailDefaultTools } from './default_tools_mail.js';
import { registerContactsDefaultTools } from './default_tools_contacts.js';
import { registerBankDefaultTools } from './default_tools_bank.js';
import { registerShareDefaultTools } from './default_tools_share.js';
import { registerTimelineDefaultTools } from './default_tools_timeline.js';

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
    if (globalThis.atome?.calendar) return globalThis.atome.calendar;
    if (globalThis.window?.atome?.calendar) return globalThis.window.atome.calendar;
    return null;
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

    registerAdoleDefaultTools({ Agent, requireGlobal, safeString, getAdoleAPI });
    registerCalendarDefaultTools({ Agent, safeString, requireCalendarApi, requireCalendarServiceApi, invokeRuntimeDefaultTool });
    registerMailDefaultTools({ Agent, safeString, prepareMailApi });
    registerContactsDefaultTools({ Agent, safeString, prepareContactsApi, requireContactsApi });
    registerBankDefaultTools({ Agent, safeString, requireBankApi });
    registerShareDefaultTools({ Agent, requireGlobal, safeString, getAdoleAPI });
    registerTimelineDefaultTools({ Agent });
};

registerDefaultTools();
