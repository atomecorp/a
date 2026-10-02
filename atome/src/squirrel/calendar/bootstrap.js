import { readDavImport } from '../shared/dav_import_transport.js';
import { createCalendarImport } from './import_source.js';
import { createCalendarApiSource } from './calendar_api_source.js';
import { emitPerfEvent, perfElapsedMs, perfLog, perfNowMs } from '../../utils/perf_runtime.js';
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
    if (typeof globalThis.document !== 'undefined') {
        const { ensureToolModule } = await import('../../../../eVe/intuition/panel_definitions.js');
        await ensureToolModule('calendar');
        return typeof globalThis.open_calendar_panel === 'function';
    }
    return false;
};

const getOrCreateService = (env) => {
    if (env[SERVICE_KEY]) return env[SERVICE_KEY];
    const service = createCalendarService({
        primarySource: createCalendarApiSource()
    });
    env[SERVICE_KEY] = service;
    return service;
};

export const createGlobalCalendarApi = ({
    env = globalThis
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global calendar bootstrap requires an object-like environment');
    }
    if (env[API_KEY]) return env[API_KEY];

    const imports = createCalendarImport({ env });
    const api = {
        registerImportSource: imports.register,
        configureDavSource(options = {}) {
            const id = options.source_id || 'dav_calendar';
            imports.register(id, pull => readDavImport('calendar_event', options, pull, env));
            return { ok: true, source_id: id };
        },
        importDav(options = {}) {
            api.configureDavSource(options);
            return imports.activate(options.source_id || 'dav_calendar', { ...options,
                source_key: options.source_key || [options.auth_ref, options.calendar_url].join('/') });
        },
        activateSource: imports.activate,
        stopSource: imports.stop,
        importStatus: imports.status,
        importIcs: imports.importIcs,
        exportIcs: imports.exportIcs,
        importNative(options = {}) { return imports.activate('native_calendar', options); },
        dispose: imports.dispose,
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
        delete(eventId, options = {}) {
            return getOrCreateService(env).calendarDelete(eventId, options);
        },
        async openPanel() {
            const panelPerfStart = perfNowMs();
            const openPanel = env?.open_calendar_panel
                || env?.window?.open_calendar_panel
                || globalThis?.open_calendar_panel
                || null;
            if (typeof openPanel === 'function') {
                await openPanel();
                const totalMs = perfElapsedMs(panelPerfStart);
                perfLog('[Perf] calendar.openPanel', { totalMs, bootstrapped: false });
                emitPerfEvent('calendar.open_panel', { ok: true, totalMs, bootstrapped: false });
                return { ok: true };
            }
            await ensureCalendarPanelApi();
            const lateOpenPanel = env?.open_calendar_panel
                || env?.window?.open_calendar_panel
                || globalThis?.open_calendar_panel
                || null;
            if (typeof lateOpenPanel !== 'function') {
                emitPerfEvent('calendar.open_panel', {
                    ok: false,
                    totalMs: perfElapsedMs(panelPerfStart),
                    error: 'calendar_panel_unavailable'
                });
                return { ok: false, error: 'calendar_panel_unavailable' };
            }
            await lateOpenPanel();
            const totalMs = perfElapsedMs(panelPerfStart);
            perfLog('[Perf] calendar.openPanel', { totalMs, bootstrapped: true });
            emitPerfEvent('calendar.open_panel', { ok: true, totalMs, bootstrapped: true });
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
