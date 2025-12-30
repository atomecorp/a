// ============================================
// EventCalendar API (logic + storage)
// ============================================

import { AdoleAPI } from '../../squirrel/apis/unified/adole_apis.js';
import { RemoteCommands } from '/squirrel/apis/remote_commands.js';
import { BuiltinHandlers } from '/squirrel/apis/remote_command_handlers.js';
import { createNotification } from '../../squirrel/components/template_builder.js';

const EVENT_ATOME_TYPE = 'calendar_event';
const CALENDAR_ATOME_TYPE = 'calendar';
const DEFAULT_CALENDAR_ID = 'calendar_default';
const DEFAULT_ALARM_MINUTES = -30;
const MAX_OCCURRENCES = 800;

const eventCache = new Map();
const calendarCache = new Map();
const alarmTimers = new Map();
const listeners = new Set();

function nowIso() {
    return new Date().toISOString();
}

function getLocalTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (_) {
        return 'UTC';
    }
}

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
    const date = toDate(value);
    return date ? date.toISOString() : null;
}

function safeJsonParse(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const shouldParse = trimmed.startsWith('{') || trimmed.startsWith('[');
    if (!shouldParse) return value;
    try {
        return JSON.parse(trimmed);
    } catch (_) {
        return value;
    }
}

function normalizeArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    const parsed = safeJsonParse(value);
    return Array.isArray(parsed) ? parsed : [];
}

function normalizeObject(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    const parsed = safeJsonParse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
}

function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        return value === 'true' || value === '1' || value === 'yes';
    }
    return false;
}

function normalizeId(raw) {
    return raw?.atome_id || raw?.id || raw?.atomeId || null;
}

function normalizeParticles(raw) {
    return raw?.particles || raw?.data || raw?.properties || {};
}

function getCurrentProjectId() {
    if (typeof window === 'undefined') return null;
    if (window.__currentProject?.id) return window.__currentProject.id;
    if (AdoleAPI?.projects?.getCurrentId) return AdoleAPI.projects.getCurrentId();
    return null;
}

function mergeAtomeLists(tauriList, fastifyList) {
    const merged = new Map();
    const add = (items) => {
        (items || []).forEach((item) => {
            const id = normalizeId(item);
            if (!id) return;
            const particles = normalizeParticles(item);
            const updated = particles.updated_at || item.updated_at || item.updatedAt || item.created_at || item.createdAt || '';
            const existing = merged.get(id);
            if (!existing) {
                merged.set(id, { item, updated });
                return;
            }
            const existingUpdated = existing.updated || '';
            if (String(updated) > String(existingUpdated)) {
                merged.set(id, { item, updated });
            }
        });
    };
    add(tauriList);
    add(fastifyList);
    return Array.from(merged.values()).map((entry) => entry.item);
}

function buildAlarmDefaults() {
    return [{
        id: `alarm_${Date.now()}`,
        offsetMinutes: DEFAULT_ALARM_MINUTES,
        action: 'notify',
        message: 'Calendar reminder'
    }];
}

function normalizeEvent(input = {}) {
    const particles = normalizeParticles(input);
    const alarms = normalizeArray(particles.alarms || input.alarms);
    const recurrence = normalizeObject(particles.recurrence || input.recurrence);
    const start = toDate(particles.start || particles.start_at || input.start);
    const end = toDate(particles.end || particles.end_at || input.end);

    return {
        id: normalizeId(input) || input.id || null,
        calendarId: particles.calendar_id || particles.calendarId || input.calendarId || DEFAULT_CALENDAR_ID,
        title: particles.title || particles.name || input.title || input.name || 'Untitled event',
        description: particles.description || input.description || '',
        location: particles.location || input.location || '',
        start,
        end: end || null,
        allDay: normalizeBoolean(particles.all_day || particles.allDay || input.allDay),
        timezone: particles.timezone || input.timezone || getLocalTimeZone(),
        color: particles.color || input.color || null,
        alarms: alarms.length ? alarms : (input.alarms ? normalizeArray(input.alarms) : []),
        recurrence: recurrence || null,
        createdAt: particles.created_at || input.createdAt || input.created_at || null,
        updatedAt: particles.updated_at || input.updatedAt || input.updated_at || null,
        raw: input
    };
}

function buildEventParticles(event, { includeCreatedAt = false } = {}) {
    const particles = {
        title: event.title,
        description: event.description || '',
        location: event.location || '',
        start: toIso(event.start),
        end: event.end ? toIso(event.end) : null,
        all_day: !!event.allDay,
        calendar_id: event.calendarId || DEFAULT_CALENDAR_ID,
        timezone: event.timezone || getLocalTimeZone(),
        color: event.color || null,
        alarms: event.alarms && event.alarms.length ? JSON.stringify(event.alarms) : null,
        recurrence: event.recurrence ? JSON.stringify(event.recurrence) : null,
        updated_at: nowIso()
    };

    if (includeCreatedAt) {
        particles.created_at = event.createdAt || nowIso();
    }

    Object.keys(particles).forEach((key) => {
        if (particles[key] === undefined) delete particles[key];
    });

    return particles;
}

function validateEvent(event) {
    if (!event.title) return 'Title is required';
    if (!event.start) return 'Start date is required';
    return null;
}

function addDays(date, days) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
}

function addWeeks(date, weeks) {
    return addDays(date, weeks * 7);
}

function addMonths(date, months) {
    const next = new Date(date.getTime());
    const day = next.getDate();
    next.setMonth(next.getMonth() + months);
    if (next.getDate() !== day) {
        next.setDate(0);
    }
    return next;
}

function addYears(date, years) {
    const next = new Date(date.getTime());
    const month = next.getMonth();
    next.setFullYear(next.getFullYear() + years);
    if (next.getMonth() !== month) {
        next.setDate(0);
    }
    return next;
}

function startOfWeek(date, weekStart = 1) {
    const d = new Date(date.getTime());
    const day = d.getDay();
    const diff = (day < weekStart) ? (day + 7 - weekStart) : (day - weekStart);
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function buildOccurrence(event, start) {
    const duration = event.end ? Math.max(0, event.end.getTime() - event.start.getTime()) : 0;
    const end = duration ? new Date(start.getTime() + duration) : null;
    return { ...event, start, end };
}

function expandOccurrences(event, rangeStart, rangeEnd) {
    const occurrences = [];
    const start = toDate(event.start);
    if (!start) return occurrences;

    const recurrence = normalizeObject(event.recurrence);
    const until = recurrence?.until ? toDate(recurrence.until) : null;
    const countLimit = recurrence?.count ? Math.max(1, Number(recurrence.count)) : MAX_OCCURRENCES;
    const freq = recurrence?.freq || recurrence?.frequency || null;
    const interval = Math.max(1, Number(recurrence?.interval || 1));
    const normalizedRangeStart = toDate(rangeStart) || start;
    const normalizedRangeEnd = toDate(rangeEnd) || addMonths(start, 1);

    if (!freq) {
        if (start >= normalizedRangeStart && start <= normalizedRangeEnd) {
            occurrences.push(buildOccurrence(event, start));
        }
        return occurrences;
    }

    let generated = 0;
    if (freq === 'daily') {
        let cursor = new Date(start.getTime());
        while (cursor <= normalizedRangeEnd && generated < countLimit) {
            if (until && cursor > until) break;
            if (cursor >= normalizedRangeStart) {
                occurrences.push(buildOccurrence(event, new Date(cursor.getTime())));
                generated += 1;
            }
            cursor = addDays(cursor, interval);
        }
        return occurrences;
    }

    if (freq === 'weekly') {
        const weekStart = typeof recurrence?.weekStart === 'number' ? recurrence.weekStart : 1;
        const baseWeek = startOfWeek(start, weekStart);
        const weekdays = Array.isArray(recurrence?.byWeekday) && recurrence.byWeekday.length
            ? recurrence.byWeekday
            : [start.getDay()];
        const normalizedWeekdays = weekdays.map((day) => {
            if (typeof day === 'number') return day;
            const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
            return map[String(day).slice(0, 3).toLowerCase()] ?? start.getDay();
        }).sort((a, b) => a - b);

        let weekIndex = 0;
        while (generated < countLimit) {
            const weekStartDate = addWeeks(baseWeek, weekIndex * interval);
            if (weekStartDate > normalizedRangeEnd) break;

            for (const weekday of normalizedWeekdays) {
                const occurrenceDate = addDays(weekStartDate, (weekday - weekStart + 7) % 7);
                if (occurrenceDate < start) continue;
                if (occurrenceDate > normalizedRangeEnd) continue;
                if (until && occurrenceDate > until) continue;
                if (occurrenceDate >= normalizedRangeStart) {
                    occurrences.push(buildOccurrence(event, occurrenceDate));
                    generated += 1;
                }
                if (generated >= countLimit) break;
            }

            weekIndex += 1;
        }
        return occurrences;
    }

    if (freq === 'monthly' || freq === 'yearly') {
        let cursor = new Date(start.getTime());
        const step = freq === 'monthly' ? addMonths : addYears;
        while (cursor <= normalizedRangeEnd && generated < countLimit) {
            if (until && cursor > until) break;
            if (cursor >= normalizedRangeStart) {
                occurrences.push(buildOccurrence(event, new Date(cursor.getTime())));
                generated += 1;
            }
            cursor = step(cursor, interval);
        }
        return occurrences;
    }

    return occurrences;
}

function formatIcsDate(date, allDay) {
    const d = toDate(date);
    if (!d) return '';
    const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    if (allDay) return iso.slice(0, 8);
    return iso;
}

function buildIcs(events, options = {}) {
    const name = options.name || 'Squirrel Calendar';
    const timeZone = options.timeZone || getLocalTimeZone();
    const prodId = options.prodId || '-//Squirrel//EventCalendar//EN';
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:${prodId}`,
        'CALSCALE:GREGORIAN',
        `X-WR-CALNAME:${name}`,
        `X-WR-TIMEZONE:${timeZone}`
    ];

    events.forEach((event) => {
        const uid = event.id || `evt-${Math.random().toString(16).slice(2)}`;
        const dtStart = formatIcsDate(event.start, event.allDay);
        const dtEnd = event.end ? formatIcsDate(event.end, event.allDay) : '';
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${uid}`);
        lines.push(`SUMMARY:${(event.title || 'Event').replace(/\n/g, ' ')}`);
        if (dtStart) lines.push(`DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${dtStart}`);
        if (dtEnd) lines.push(`DTEND${event.allDay ? ';VALUE=DATE' : ''}:${dtEnd}`);
        if (event.description) lines.push(`DESCRIPTION:${String(event.description).replace(/\n/g, ' ')}`);
        if (event.location) lines.push(`LOCATION:${String(event.location).replace(/\n/g, ' ')}`);

        if (event.recurrence && typeof event.recurrence === 'object') {
            const ruleParts = [];
            const freq = event.recurrence.freq || event.recurrence.frequency;
            if (freq) ruleParts.push(`FREQ=${String(freq).toUpperCase()}`);
            if (event.recurrence.interval) ruleParts.push(`INTERVAL=${event.recurrence.interval}`);
            if (event.recurrence.count) ruleParts.push(`COUNT=${event.recurrence.count}`);
            if (event.recurrence.until) {
                const until = formatIcsDate(event.recurrence.until, event.allDay);
                if (until) ruleParts.push(`UNTIL=${until}`);
            }
            if (Array.isArray(event.recurrence.byWeekday) && event.recurrence.byWeekday.length) {
                const map = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
                const days = event.recurrence.byWeekday.map((d) => {
                    if (typeof d === 'number') return map[d] || 'MO';
                    return String(d).slice(0, 2).toUpperCase();
                });
                ruleParts.push(`BYDAY=${days.join(',')}`);
            }
            if (ruleParts.length) lines.push(`RRULE:${ruleParts.join(';')}`);
        }

        const alarms = normalizeArray(event.alarms);
        alarms.forEach((alarm) => {
        const triggerMinutes = Number(alarm.offsetMinutes ?? alarm.offset ?? DEFAULT_ALARM_MINUTES);
        const triggerSign = triggerMinutes < 0 ? '-' : '';
        const trigger = `${triggerSign}PT${Math.abs(triggerMinutes)}M`;
            lines.push('BEGIN:VALARM');
            lines.push(`TRIGGER:${trigger}`);
            lines.push('ACTION:DISPLAY');
            lines.push(`DESCRIPTION:${alarm.message || 'Reminder'}`);
            lines.push('END:VALARM');
        });

        lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

function emitChange(type, payload) {
    listeners.forEach((fn) => {
        try { fn(type, payload); } catch (_) { }
    });
}

function clearEventTimers(eventId) {
    const timers = alarmTimers.get(eventId);
    if (!timers) return;
    timers.forEach((timer) => clearTimeout(timer));
    alarmTimers.delete(eventId);
}

function showLocalNotification(message, variant = 'info') {
    try {
        const host = document.getElementById('intuition') || document.body;
        const note = createNotification(message, variant, {
            style: {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                zIndex: 60000,
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
            }
        });
        host.appendChild(note);
        setTimeout(() => {
            try { note.destroy(); } catch (_) { }
        }, 5000);
    } catch (_) {
        console.log('[Calendar] Notification:', message);
    }
}

async function triggerAlarm(event, alarm, occurrenceStart) {
    const message = alarm.message || `Reminder: ${event.title}`;
    const payload = {
        eventId: event.id,
        title: event.title,
        start: occurrenceStart?.toISOString?.() || event.start?.toISOString?.() || '',
        calendarId: event.calendarId,
        alarm
    };

    if (alarm.action === 'script') {
        try {
            if (typeof alarm.script === 'function') {
                alarm.script(payload);
            } else if (typeof alarm.script === 'string' && alarm.script.trim()) {
                const runner = new Function('payload', alarm.script);
                runner(payload);
            }
        } catch (e) {
            console.warn('[Calendar] Alarm script failed:', e.message);
        }
        return;
    }

    showLocalNotification(message, 'info');

    if (alarm.targetUserId || alarm.targetPhone) {
        try {
            BuiltinHandlers.registerAll();
            if (RemoteCommands?.canStart) {
                const canStart = await RemoteCommands.canStart();
                if (!canStart) return;
            }
            await RemoteCommands.start();
            await RemoteCommands.sendCommand(
                alarm.targetUserId || alarm.targetPhone,
                'show-notification',
                { message }
            );
        } catch (e) {
            console.warn('[Calendar] Remote notification failed:', e.message);
        }
    }
}

function scheduleAlarmsForEvent(event) {
    if (!event || !event.id) return;
    clearEventTimers(event.id);

    const alarms = normalizeArray(event.alarms);
    if (!alarms.length) return;

    const horizonEnd = addMonths(new Date(), 3);
    const occurrences = event.recurrence
        ? expandOccurrences(event, new Date(), horizonEnd)
        : [buildOccurrence(event, toDate(event.start))];

    const timers = [];
    alarms.forEach((alarm) => {
        const offsetMinutes = Number(alarm.offsetMinutes ?? alarm.offset ?? DEFAULT_ALARM_MINUTES);
        const absoluteTime = alarm.at ? toDate(alarm.at) : null;
        let triggerTime = null;

        if (absoluteTime) {
            triggerTime = absoluteTime;
        } else {
            const nextOccurrence = occurrences.find((occ) => occ.start && occ.start >= new Date());
            if (nextOccurrence?.start) {
                triggerTime = new Date(nextOccurrence.start.getTime() + offsetMinutes * 60 * 1000);
            }
        }

        if (!triggerTime) return;
        const delay = triggerTime.getTime() - Date.now();
        if (delay <= 0) return;

        const timer = setTimeout(async () => {
            await triggerAlarm(event, alarm, triggerTime);
            scheduleAlarmsForEvent(event);
        }, delay);
        timers.push(timer);
    });

    if (timers.length) alarmTimers.set(event.id, timers);
}

async function listEvents(options = {}) {
    const projectId = options.projectId || getCurrentProjectId();
    const result = await AdoleAPI.atomes.list({
        type: EVENT_ATOME_TYPE,
        projectId,
        includeDeleted: false
    });

    const merged = mergeAtomeLists(result?.tauri?.atomes, result?.fastify?.atomes);
    const events = merged.map((atome) => normalizeEvent(atome)).filter((e) => e.start);
    events.forEach((event) => {
        eventCache.set(event.id, event);
        scheduleAlarmsForEvent(event);
    });

    return { ok: true, items: events };
}

async function getEvent(eventId) {
    if (eventCache.has(eventId)) return eventCache.get(eventId);
    const result = await AdoleAPI.atomes.get(eventId);
    const tauri = result?.tauri?.atome || result?.tauri?.data || null;
    const fastify = result?.fastify?.atome || result?.fastify?.data || null;
    const merged = mergeAtomeLists(tauri ? [tauri] : [], fastify ? [fastify] : []);
    const event = merged.length ? normalizeEvent(merged[0]) : null;
    if (event) eventCache.set(event.id, event);
    return event;
}

async function createEvent(input = {}) {
    const event = normalizeEvent(input);
    const hasAlarmProp = Object.prototype.hasOwnProperty.call(input, 'alarms');
    if (!hasAlarmProp && (!event.alarms || event.alarms.length === 0)) {
        event.alarms = buildAlarmDefaults();
    }

    const error = validateEvent(event);
    if (error) return { ok: false, error };

    const particles = buildEventParticles(event, { includeCreatedAt: true });
    const projectId = input.projectId || getCurrentProjectId();
    const result = await AdoleAPI.atomes.create({
        id: event.id || undefined,
        type: EVENT_ATOME_TYPE,
        projectId,
        particles
    });

    const success = result?.tauri?.success || result?.fastify?.success;
    if (success) {
        const createdId = event.id || normalizeId(result?.tauri?.data) || normalizeId(result?.fastify?.data);
        const storedEvent = { ...event, id: createdId, createdAt: particles.created_at, updatedAt: particles.updated_at };
        eventCache.set(createdId, storedEvent);
        scheduleAlarmsForEvent(storedEvent);
        emitChange('create', storedEvent);
        return { ok: true, event: storedEvent };
    }

    return { ok: false, error: result?.tauri?.error || result?.fastify?.error || 'Create failed' };
}

async function updateEvent(eventId, changes = {}) {
    const existing = await getEvent(eventId);
    if (!existing) return { ok: false, error: 'Event not found' };

    const updated = normalizeEvent({ ...existing, ...changes, id: eventId });
    const error = validateEvent(updated);
    if (error) return { ok: false, error };

    const particles = buildEventParticles(updated);
    const result = await AdoleAPI.atomes.alter(eventId, particles);
    const success = result?.tauri?.success || result?.fastify?.success;
    if (success) {
        const storedEvent = { ...updated, updatedAt: particles.updated_at };
        eventCache.set(eventId, storedEvent);
        scheduleAlarmsForEvent(storedEvent);
        emitChange('update', storedEvent);
        return { ok: true, event: storedEvent };
    }

    return { ok: false, error: result?.tauri?.error || result?.fastify?.error || 'Update failed' };
}

async function deleteEvent(eventId) {
    const result = await AdoleAPI.atomes.delete(eventId);
    const success = result?.tauri?.success || result?.fastify?.success;
    if (success) {
        clearEventTimers(eventId);
        const deleted = eventCache.get(eventId) || { id: eventId };
        eventCache.delete(eventId);
        emitChange('delete', deleted);
        return { ok: true };
    }
    return { ok: false, error: result?.tauri?.error || result?.fastify?.error || 'Delete failed' };
}

async function createCalendar(input = {}) {
    const calendarId = input.id || input.calendarId || `calendar_${Date.now()}`;
    const particles = {
        name: input.name || 'Calendar',
        color: input.color || '#2f80ed',
        timezone: input.timezone || getLocalTimeZone(),
        description: input.description || '',
        created_at: nowIso(),
        updated_at: nowIso()
    };
    const projectId = input.projectId || getCurrentProjectId();
    const result = await AdoleAPI.atomes.create({
        id: calendarId,
        type: CALENDAR_ATOME_TYPE,
        projectId,
        particles
    });
    const success = result?.tauri?.success || result?.fastify?.success;
    if (success) {
        const calendar = { id: calendarId, ...particles };
        calendarCache.set(calendarId, calendar);
        emitChange('calendar:create', calendar);
        return { ok: true, calendar };
    }
    return { ok: false, error: result?.tauri?.error || result?.fastify?.error || 'Calendar create failed' };
}

async function ensureCalendar(calendarId = DEFAULT_CALENDAR_ID) {
    if (calendarCache.has(calendarId)) return calendarCache.get(calendarId);
    const result = await AdoleAPI.atomes.get(calendarId);
    const tauri = result?.tauri?.atome || result?.tauri?.data || null;
    const fastify = result?.fastify?.atome || result?.fastify?.data || null;
    const merged = mergeAtomeLists(tauri ? [tauri] : [], fastify ? [fastify] : []);
    if (merged.length) {
        const calendar = { id: calendarId, ...normalizeParticles(merged[0]) };
        calendarCache.set(calendarId, calendar);
        return calendar;
    }
    const created = await createCalendar({ id: calendarId, name: 'Default calendar' });
    return created.ok ? created.calendar : null;
}

async function shareCalendar(options = {}) {
    const calendarId = options.calendarId || DEFAULT_CALENDAR_ID;
    const targetPhone = options.phone || options.targetPhone || null;
    const permissions = options.permissions || { read: true, alter: false, delete: false, create: false };
    const shareType = options.shareType || 'linked';

    if (!targetPhone) return { ok: false, error: 'Target phone is required' };

    await ensureCalendar(calendarId);
    const result = await AdoleAPI.sharing.share(targetPhone, [calendarId], permissions, shareType);
    const ok = result?.fastify?.success || result?.fastify?.ok;
    if (ok) {
        emitChange('calendar:share', { calendarId, targetPhone });
        return { ok: true, data: result };
    }
    return { ok: false, error: result?.fastify?.error || 'Share failed' };
}

function buildWebcalUrl(options = {}) {
    const calendarId = options.calendarId || DEFAULT_CALENDAR_ID;
    const baseUrl = options.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!baseUrl) return null;
    const httpUrl = baseUrl.replace(/\/$/, '');
    return `${httpUrl.replace(/^http/, 'webcal')}/calendar/${calendarId}.ics`;
}

async function exportWebcal(options = {}) {
    const calendarId = options.calendarId || DEFAULT_CALENDAR_ID;
    const list = options.events || (await listEvents()).items;
    const filtered = list.filter((event) => event.calendarId === calendarId);
    const ics = buildIcs(filtered, {
        name: options.name || 'Squirrel Calendar',
        timeZone: options.timeZone || getLocalTimeZone(),
        prodId: options.prodId
    });
    return {
        ok: true,
        ics,
        url: buildWebcalUrl({ calendarId, baseUrl: options.baseUrl })
    };
}

const CalendarAPI = {
    listEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    createCalendar,
    ensureCalendar,
    shareCalendar,
    exportWebcal,
    buildWebcalUrl,
    buildIcs,
    expandOccurrences,
    scheduleAlarmsForEvent,
    on(handler) {
        if (typeof handler !== 'function') return () => {};
        listeners.add(handler);
        return () => listeners.delete(handler);
    },
    off(handler) {
        listeners.delete(handler);
    }
};

if (typeof window !== 'undefined') {
    window.CalendarAPI = CalendarAPI;
    import('./calendarUI.js').catch((err) => {
        console.warn('[Calendar] UI failed to load:', err?.message || err);
    });
}

export { CalendarAPI };
