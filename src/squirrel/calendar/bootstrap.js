import { createCalendarApiSource } from './calendar_api_source.js';
import { createIcloudLegacyCalendarConnector } from './icloud_legacy_connector.js';
import { createCalendarService } from './service.js';

const SERVICE_KEY = '__SQUIRREL_CALENDAR_SERVICE__';
const API_KEY = '__SQUIRREL_CALENDAR_API__';

const installCalendarGlobals = (env, api) => {
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.calendar = api;

    env.atome = env.atome || {};
    env.atome.calendar = api;
    env.atome.tools = env.atome.tools || {};
    env.atome.tools.calendar = api;

    env.AtomeCalendar = api;
    return api;
};

const ensureCalendarPanelApi = async () => {
    if (typeof globalThis !== 'undefined' && typeof globalThis.open_calendar_panel === 'function') {
        return true;
    }
    const mod = await import('../../application/eVe/intuition/tools/calendar.js');
    return typeof globalThis.open_calendar_panel === 'function' || typeof mod?.CalendarAPI === 'object';
};

const getOrCreateService = (env) => {
    if (env[SERVICE_KEY]) return env[SERVICE_KEY];
    const service = createCalendarService({
        primarySource: createCalendarApiSource()
    });
    env[SERVICE_KEY] = service;
    return service;
};

const resolveSecureAuthOptions = async (env, options = {}) => {
    const authRef = String(options?.auth_ref || options?.authRef || '').trim();
    if (!authRef) {
        return { ...options };
    }
    const securityApi = env?.Squirrel?.security || env?.atome?.security || env?.AtomeSecurity || null;
    if (!securityApi || typeof securityApi.readToken !== 'function') {
        throw new Error('security_token_vault_unavailable');
    }
    const stored = await securityApi.readToken(authRef);
    if (!stored || stored.ok !== true) {
        throw new Error(stored?.error || 'security_token_read_failed');
    }
    return {
        ...options,
        auth: stored.value
    };
};

export const createGlobalCalendarApi = ({
    env = globalThis
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global calendar bootstrap requires an object-like environment');
    }
    if (env[API_KEY]) return env[API_KEY];

    const api = {
        get service() {
            return getOrCreateService(env);
        },
        registerSource(source) {
            return getOrCreateService(env).registerSource(source);
        },
        unregisterSource(sourceId) {
            return getOrCreateService(env).unregisterSource(sourceId);
        },
        sources() {
            return getOrCreateService(env).calendarSources();
        },
        sync(options = {}) {
            return getOrCreateService(env).syncSources(options);
        },
        syncInitial(options = {}) {
            return getOrCreateService(env).syncInitial(options);
        },
        syncIncremental(options = {}) {
            return getOrCreateService(env).syncIncremental(options);
        },
        syncPull(options = {}) {
            return getOrCreateService(env).syncPull(options);
        },
        syncStatus() {
            return getOrCreateService(env).syncStatus();
        },
        search(query, options = {}) {
            return getOrCreateService(env).calendarSearch(query, options);
        },
        today(options = {}) {
            return getOrCreateService(env).calendarToday(options);
        },
        next(options = {}) {
            return getOrCreateService(env).calendarNext(options);
        },
        read(eventId, options = {}) {
            return getOrCreateService(env).calendarRead(eventId, options);
        },
        create(input = {}, options = {}) {
            return getOrCreateService(env).calendarCreate(input, options);
        },
        update(eventId, changes = {}, options = {}) {
            return getOrCreateService(env).calendarUpdate(eventId, changes, options);
        },
        async configureIcloudLegacyConnector(options = {}) {
            const resolvedOptions = await resolveSecureAuthOptions(env, options);
            const connector = createIcloudLegacyCalendarConnector(resolvedOptions);
            getOrCreateService(env).registerSource(connector);
            return {
                ok: true,
                source: connector.source_id,
                provider: connector.provider
            };
        },
        async openPanel() {
            const openPanel = env?.open_calendar_panel
                || env?.window?.open_calendar_panel
                || globalThis?.open_calendar_panel
                || null;
            if (typeof openPanel === 'function') {
                await openPanel();
                return { ok: true };
            }
            await ensureCalendarPanelApi();
            const lateOpenPanel = env?.open_calendar_panel
                || env?.window?.open_calendar_panel
                || globalThis?.open_calendar_panel
                || null;
            if (typeof lateOpenPanel !== 'function') {
                return { ok: false, error: 'calendar_panel_unavailable' };
            }
            await lateOpenPanel();
            return { ok: true };
        },
        closePanel() {
            const closePanel = env?.close_calendar_panel
                || env?.window?.close_calendar_panel
                || globalThis?.close_calendar_panel
                || null;
            if (typeof closePanel !== 'function') {
                return { ok: false, error: 'calendar_panel_unavailable' };
            }
            closePanel();
            return { ok: true };
        }
    };

    env[API_KEY] = installCalendarGlobals(env, api);
    return env[API_KEY];
};

export const bootstrapGlobalCalendar = ({
    env = (typeof window !== 'undefined' ? window : globalThis)
} = {}) => createGlobalCalendarApi({ env });

if (typeof window !== 'undefined') {
    bootstrapGlobalCalendar({ env: window });
}
