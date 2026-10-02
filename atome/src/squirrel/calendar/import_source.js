import { createCanonicalImport, importRecordId, importRecordProps } from '../shared/canonical_import.js';
import { createImportLifecycle } from '../shared/import_lifecycle.js';
import { getNativeImportInvoke } from '../contacts/macos_source.js';
import { parseCalendarData, buildIcs, canonicalCalendarDate, canonicalCalendarDateValue } from './icalendar.js';
import { saveExportFile } from '../shared/file_export.js';
import { importData } from '../shared/import_reconciliation.js';
import { readDavImport } from '../shared/dav_import_transport.js';

export function normalizeImportedEvent(input) {
    const source = input.properties || input;
    const fields = ['title', 'description', 'location', 'timezone', 'color', 'exchange_uid', 'recurrence_id',
        'sequence', 'ical_status', 'icalendar', 'exdates', 'rdates', 'status', 'native_series_id'];
    const output = Object.fromEntries(fields.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
    for (const key of ['start', 'end']) if (source[key] !== undefined) {
        const date = source[key] == null ? null : canonicalCalendarDate(source[key]);
        if (source[key] != null && !date) throw new Error('calendar_import_date_invalid');
        output[key] = canonicalCalendarDateValue(source[key], source.all_day ?? source.allDay ?? false,
            !source.timezone ? (source.icalendar?.[key] || source.icalendar?.start) : null);
    }
    output.all_day = source.all_day ?? source.allDay ?? false;
    output.calendar_id = source.calendar_id || source.calendarId;
    output.recurrence = source.recurrence ? JSON.stringify(source.recurrence) : null;
    // Imported alarm payloads cannot execute tool commands or invite attendees.
    output.alarms = JSON.stringify((source.alarms || []).map(alarm => ({ enabled: false, message: alarm.message || '',
        ...(alarm.ical_properties ? { ical_properties: alarm.ical_properties } : { offsetMinutes: alarm.offsetMinutes ?? -15 }) })));
    return importData({ ...output, kind: 'event', calendar_scope: 'personal', access: 'private', visibility: 'private' });
}

export function createCalendarImport({ env = globalThis, session, device } = {}) {
    const api = () => env.Atome || env.window?.Atome;
    const store = createCanonicalImport({ type: 'calendar_event', api, session, normalize: normalizeImportedEvent });
    const calendars = createCanonicalImport({ type: 'calendar', api, session, normalize: input => ({
        name: input.name || input.title || '', ...(input.color ? { color: input.color } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}), calendar_scope: 'personal', access: 'private', visibility: 'private'
    }) });
    const sources = new Map();
    const collect = async (response, options) => {
        options.checkSession?.();
        if (response?.ok !== true) throw new Error(response?.error || 'calendar_import_pull_failed');
        const items = response.items || [];
        const collectionInputs = response.calendars || [...new Set(items.map(item => item.calendarId || item.calendar_id || 'default'))]
            .map(id => ({ id, name: response.calendar_name || id }));
        const collected = await calendars.collect(collectionInputs, { ...options, complete: false });
        const mapping = new Map(collected.correspondences.map(p => [p.external_id, p.canonical_id]));
        const result = await store.collect(items.map(input => ({ ...input,
            calendarId: mapping.get(String(input.calendarId || input.calendar_id || 'default')) })), {
            ...options, cursor: response.cursor, complete: response.complete === true,
            removed_ids: response.removed_ids || [], removed_hrefs: response.removed_hrefs || [], coverage: response.coverage
        });
        return { ...result, more: response.more === true, coverage: response.coverage };
    };
    const ensureNative = () => {
        if (sources.has('native_calendar')) return;
        sources.set('native_calendar', async options => {
            const invoke = getNativeImportInvoke();
            if (!invoke) throw new Error('native_calendar_unavailable');
            return invoke('native_calendar_snapshot', { cursor: options.cursor, startYear: options.start_year || 1970,
                futureYears: options.future_years || 5, collections: options.collections || [] });
        });
    };
    const lifecycle = createImportLifecycle({ domain: 'calendar_event', env, api, session, device,
        restore(id, config) {
            if (id === 'native_calendar') ensureNative();
            else if (config.auth_ref) sources.set(id, options => readDavImport('calendar_event', config, options, env));
        },
        async run(id, options) {
            const source = sources.get(id);
            if (!source) throw new Error('calendar_import_source_unavailable');
            const response = await source(options);
            options.checkSession();
            return collect(response, options);
        }
    });
    return {
        register(id, pull) { if (typeof pull !== 'function') throw new Error('calendar_import_pull_required'); sources.set(id, pull); },
        activate(id, options = {}) { if (id === 'native_calendar') ensureNative(); return lifecycle.activate(id, options); },
        stop: lifecycle.deactivate, status: lifecycle.status, dispose: lifecycle.dispose,
        async importIcs(content, options = {}) {
            const checkSession = store.capture().check;
            const items = parseCalendarData(content);
            const result = await collect({ ok: true, complete: true, items }, { ...options, source_key: options.source_key || 'ics_file', checkSession });
            checkSession();
            if (env.dispatchEvent && env.CustomEvent) env.dispatchEvent(new env.CustomEvent('squirrel:import-updated',
                { detail: { domain: 'calendar_event', source_id: 'ics_file', ok: true } }));
            return result;
        },
        async exportIcs(options = {}) {
            const context = store.capture();
            const rows = await store.list('calendar_event', context);
            const events = rows.filter(row => !row.deleted_at && !row.deleted && !importRecordProps(row).__deleted)
                .map(row => ({ ...importRecordProps(row), id: importRecordId(row), allDay: importRecordProps(row).all_day,
                    recurrence: JSON.parse(importRecordProps(row).recurrence || 'null'), alarms: JSON.parse(importRecordProps(row).alarms || '[]') }))
                .filter(event => !options.calendar_id || event.calendar_id === options.calendar_id)
                .filter(event => !options.ids || options.ids.includes(event.id));
            const content = buildIcs(events, options); context.check();
            if (options.save) return { ...await saveExportFile(options.filename || 'calendar.ics', new TextEncoder().encode(content), 'text/calendar;charset=utf-8'), count: events.length };
            return { ok: true, content, count: events.length };
        }
    };
}
