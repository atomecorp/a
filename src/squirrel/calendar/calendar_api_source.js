import {
    CALENDAR_V1_ARCHITECTURE_DECISION,
    createCalendarConnectorContract
} from './connector_contract.js';

const normalizeText = (value) => String(value || '').trim();

const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const toIso = (value) => {
    const date = toDate(value);
    return date ? date.toISOString() : null;
};

const loadCalendarApi = async () => {
    if (globalThis.CalendarAPI) return globalThis.CalendarAPI;
    const mod = await import('../../application/eVe/intuition/tools/calendar.js');
    return mod?.CalendarAPI || globalThis.CalendarAPI || null;
};

const normalizeCalendarEvent = (event = {}) => ({
    id: normalizeText(event.id || event.event_id || event.uid || ''),
    calendarId: normalizeText(event.calendarId || event.calendar_id || ''),
    title: normalizeText(event.title || event.name || ''),
    description: normalizeText(event.description || ''),
    location: normalizeText(event.location || ''),
    start: toDate(event.start),
    end: toDate(event.end),
    allDay: event.allDay === true,
    timezone: normalizeText(event.timezone || ''),
    updatedAt: toIso(event.updatedAt || event.updated_at || event.start || null),
    recurrence: event.recurrence && typeof event.recurrence === 'object' ? { ...event.recurrence } : null,
    raw: event
});

export const createCalendarApiSource = ({
    source_id = CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.id,
    role = CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.role,
    writable = CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.writable,
    apiLoader = loadCalendarApi
} = {}) => {
    const contract = createCalendarConnectorContract({
        provider: source_id,
        role,
        write_capabilities: writable ? ['calendar_create', 'calendar_update', 'calendar_delete'] : []
    });

    const requireApi = async () => {
        const api = await apiLoader();
        if (!api) {
            throw new Error('CalendarAPI is not available');
        }
        return api;
    };

    return {
        source_id,
        role,
        writable,
        contract,
        async listEvents(options = {}) {
            const api = await requireApi();
            const response = await api.listEvents(options);
            const items = Array.isArray(response?.items) ? response.items : [];
            return {
                ok: true,
                source_id,
                items: items.map((entry) => normalizeCalendarEvent(entry))
            };
        },
        async getEvent(eventId) {
            const api = await requireApi();
            const response = await api.getEvent(eventId);
            if (!response) {
                return { ok: false, error: 'calendar_event_not_found', source_id, event_id: String(eventId || '') || null };
            }
            if (response?.ok === false || !response?.event) {
                const event = response?.id ? response : null;
                if (!event) {
                    return { ok: false, error: 'calendar_event_not_found', source_id, event_id: String(eventId || '') || null };
                }
                return {
                    ok: true,
                    source_id,
                    event: normalizeCalendarEvent(event)
                };
            }
            return {
                ...response,
                source_id,
                event: normalizeCalendarEvent(response.event)
            };
        },
        async ensureCalendar(calendarId) {
            const api = await requireApi();
            if (typeof api.ensureCalendar !== 'function') {
                return { ok: false, error: 'calendar_ensure_unavailable', source_id };
            }
            const calendar = await api.ensureCalendar(calendarId);
            if (!calendar) {
                return { ok: false, error: 'calendar_ensure_failed', source_id, calendar_id: String(calendarId || '') || null };
            }
            return {
                ok: true,
                source_id,
                calendar: { ...calendar }
            };
        },
        async createEvent(input = {}) {
            if (!writable) {
                return { ok: false, error: 'calendar_source_read_only', source_id };
            }
            const api = await requireApi();
            const response = await api.createEvent(input);
            if (response?.ok !== true || !response?.event) return response;
            return {
                ...response,
                source_id,
                event: normalizeCalendarEvent(response.event)
            };
        },
        async updateEvent(eventId, changes = {}) {
            if (!writable) {
                return { ok: false, error: 'calendar_source_read_only', source_id };
            }
            const api = await requireApi();
            const response = await api.updateEvent(eventId, changes);
            if (response?.ok !== true || !response?.event) return response;
            return {
                ...response,
                source_id,
                event: normalizeCalendarEvent(response.event)
            };
        },
        async deleteEvent(eventId, options = {}) {
            if (!writable) {
                return { ok: false, error: 'calendar_source_read_only', source_id };
            }
            const api = await requireApi();
            if (typeof api.deleteEvent !== 'function') {
                return { ok: false, error: 'calendar_delete_unavailable', source_id };
            }
            const response = await api.deleteEvent(eventId, options);
            if (response?.ok !== true) return response;
            return {
                ...response,
                source_id
            };
        }
    };
};

export { normalizeCalendarEvent as normalizeCalendarApiEvent };
