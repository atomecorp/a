import { unfoldContentLines, parseContentLine, buildContentLine, foldContentLine,
    escapeContentText, decodeContentText, splitContentValue } from '../shared/content_lines.js';
import ICAL from '../../assets/vendor/ical/ical.bundle.js';
import { installIanaZones } from './icalendar_iana.js';

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const text = (properties, name) => decodeContentText(properties.find(p => p.name === name)?.value || '');
const property = (properties, name) => properties.find(p => p.name === name) || null;
const values = (properties, name) => properties.filter(p => p.name === name);
const safeProperty = p => /^[A-Z0-9-]+$/.test(p.name) && !/PASSWORD|TOKEN|SECRET|AUTH|ATOME|CONFLICT/.test(p.name);
const managed = new Set(['UID', 'DTSTART', 'DTEND', 'SUMMARY', 'DESCRIPTION', 'LOCATION', 'DTSTAMP',
    'LAST-MODIFIED', 'SEQUENCE', 'STATUS', 'RRULE', 'RECURRENCE-ID', 'EXDATE', 'RDATE', 'DURATION']);

export function canonicalCalendarDate(value) {
    if (!value) return null;
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(...value.split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0))) : new Date(value);
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && canonicalCalendarDateValueUnchecked(date) !== value) return null;
    return Number.isFinite(date.getTime()) ? date : null;
}
const canonicalCalendarDateValueUnchecked = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function canonicalCalendarDateValue(value, allDay, reference = null) {
    const date = canonicalCalendarDate(value);
    if (!date) return null;
    const floating = reference && !reference.params?.TZID && !reference.value.endsWith('Z');
    if (!allDay && !floating) return date.toISOString();
    const part = name => String(date[`get${name}`]()).padStart(2, '0');
    const day = canonicalCalendarDateValueUnchecked(date);
    return allDay ? day : `${day}T${part('Hours')}:${part('Minutes')}:${part('Seconds')}`;
}

/** Resolve IANA wall time without changing the original RFC date representation. */
export function calendarDate(p, timezones = []) {
    if (!p) return null;
    const match = p.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!match) throw new Error('ics_date_invalid');
    const [, y, m, d, hh = '00', mm = '00', ss = '00', z] = match;
    const target = Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss);
    const validated = new Date(target);
    if (validated.getUTCFullYear() !== +y || validated.getUTCMonth() !== +m - 1 || validated.getUTCDate() !== +d
        || +hh > 23 || +mm > 59 || +ss > 59) throw new Error('ics_date_invalid');
    if (!p.value.includes('T')) return new Date(+y, +m - 1, +d);
    if (!p.params?.TZID || z) {
        return !z && p.value.includes('T') ? new Date(+y, +m - 1, +d, +hh, +mm, +ss) : new Date(target);
    }
    if (timezones.length) {
        const timezone = timezones.find(zone => text(zone.properties, 'TZID') === p.params.TZID);
        if (timezone) {
            const component = new ICAL.Component(ICAL.parse(['BEGIN:VCALENDAR', 'VERSION:2.0',
                ...componentLines(timezone), 'BEGIN:VEVENT', buildContentLine({ ...p, name: 'DTSTART' }), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')));
            return component.getFirstSubcomponent('vevent').getFirstPropertyValue('dtstart').toJSDate();
        }
    }
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: p.params.TZID, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const wallAt = instant => {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
        return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    };
    const offsets = [...new Set([-36, 0, 36].map(hours => {
        const instant = target + hours * 3600000; return wallAt(instant) - instant;
    }))];
    const candidates = offsets.map(offset => target - offset).filter(instant => wallAt(instant) === target);
    // RFC 5545 3.3.5: first occurrence in a fold; offset before a forward gap.
    return new Date(candidates.length ? Math.min(...candidates) : target - Math.min(...offsets));
}

function parseRule(p) {
    if (!p) return null;
    const parts = Object.fromEntries(p.value.split(';').map(part => part.split('=')));
    const days = String(parts.BYDAY || '').split(',');
    return { freq: String(parts.FREQ || '').toLowerCase(), interval: Number(parts.INTERVAL || 1),
        ...(parts.COUNT ? { count: Number(parts.COUNT) } : {}),
        ...(parts.UNTIL ? { until: calendarDate({ value: parts.UNTIL, params: {} }).toISOString(),
            until_original: calendarDate({ value: parts.UNTIL, params: {} }).toISOString() } : {}),
        ...(days.length && days[0] ? { byWeekday: days.map(day => WEEKDAYS.indexOf(day)).filter(day => day >= 0) } : {}),
        rrule: p.value };
}

function durationEnd(start, duration, timezones) {
    if (!start) throw new Error('ics_duration_start_required');
    const value = start.value.replace(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/,
        (_, y, m, d, hh, mm, ss, z) => `${y}-${m}-${d}${hh ? `T${hh}:${mm}:${ss}${z || ''}` : ''}`);
    const time = ICAL.Time.fromString(value), offset = ICAL.Duration.fromString(duration.value);
    if (offset.toSeconds() <= 0) throw new Error('ics_duration_invalid');
    time.adjust((offset.weeks || 0) * 7 + (offset.days || 0), 0, 0, 0);
    const dayEnd = calendarDate({ value: time.toString().replace(/[-:]/g, ''), params: start.params }, timezones);
    return new Date(dayEnd.getTime() + ((offset.hours || 0) * 3600 + (offset.minutes || 0) * 60 + (offset.seconds || 0)) * 1000);
}

function parseTree(input) {
    if (typeof input !== 'string' || input.length > 32 * 1024 * 1024) throw new Error('ics_size_invalid');
    const roots = [], stack = [];
    for (const line of unfoldContentLines(input)) {
        if (!line) continue;
        const p = parseContentLine(line);
        if (p.name === 'BEGIN') {
            const component = { name: p.value.toUpperCase(), properties: [], children: [] };
            if (stack.length) stack.at(-1).children.push(component); else roots.push(component);
            stack.push(component);
            if (stack.length > 8) throw new Error('ics_nesting_invalid');
        } else if (p.name === 'END') {
            if (stack.pop()?.name !== p.value.toUpperCase()) throw new Error('ics_component_unmatched');
        } else {
            if (!stack.length) throw new Error('ics_calendar_required');
            stack.at(-1).properties.push(p);
        }
    }
    if (stack.length || roots.length !== 1 || roots[0].name !== 'VCALENDAR') throw new Error('ics_calendar_incomplete');
    if (text(roots[0].properties, 'VERSION') !== '2.0') throw new Error('ics_version_unsupported');
    return roots[0];
}

export function parseCalendarData(input) {
    const root = parseTree(input);
    const timezones = root.children.filter(c => c.name === 'VTIMEZONE');
    return root.children.filter(c => c.name === 'VEVENT').map(c => {
        const props = c.properties, startProperty = property(props, 'DTSTART');
        const uid = text(props, 'UID');
        if (!uid) throw new Error('ics_uid_required');
        const status = text(props, 'STATUS').toUpperCase();
        const duration = property(props, 'DURATION'), endProperty = property(props, 'DTEND');
        if (duration && endProperty) throw new Error('ics_end_duration_conflict');
        const start = calendarDate(startProperty, timezones), end = duration ? durationEnd(startProperty, duration, timezones) : calendarDate(endProperty, timezones);
        if (!start && status !== 'CANCELLED') throw new Error('ics_start_required');
        const dateList = name => values(props, name).flatMap(p => splitContentValue(p.value, ',').map(value => ({ ...p, value })));
        return { id: uid, uid, exchange_uid: uid, title: text(props, 'SUMMARY'), description: text(props, 'DESCRIPTION'),
            location: text(props, 'LOCATION'), start, end,
            allDay: startProperty?.params?.VALUE === 'DATE' || /^\d{8}$/.test(startProperty?.value || ''),
            timezone: startProperty?.params?.TZID || (startProperty?.value.endsWith('Z') ? 'UTC' : ''),
            sequence: Number(text(props, 'SEQUENCE') || 0), status: status === 'CANCELLED' ? 'cancelled' : 'open',
            ical_status: status || 'CONFIRMED', recurrence_id: property(props, 'RECURRENCE-ID')?.value || '',
            recurrence: parseRule(property(props, 'RRULE')), exdates: dateList('EXDATE'), rdates: dateList('RDATE'),
            alarms: c.children.filter(a => a.name === 'VALARM').map(a => ({ enabled: false,
                message: text(a.properties, 'DESCRIPTION'), ical_properties: a.properties })),
            icalendar: { start: startProperty, end: endProperty, duration, recurrence_id: property(props, 'RECURRENCE-ID'),
                timezones, extra_properties: props.filter(p => !managed.has(p.name) && safeProperty(p)) },
            updatedAt: calendarDate(property(props, 'LAST-MODIFIED') || property(props, 'DTSTAMP'))?.toISOString() || null };
    });
}

const componentLines = c => [`BEGIN:${c.name}`, ...(c.properties || []).map(p => buildContentLine(p)),
    ...(c.children || []).flatMap(componentLines), `END:${c.name}`];
function activeReference(event, field) {
    const reference = event.icalendar?.[field] || event.icalendar?.start;
    if (event.allDay || event.timezone == null) return reference;
    const originalZone = reference?.params?.TZID || (reference?.value.endsWith('Z') ? 'UTC' : '');
    if (originalZone === event.timezone) return reference;
    const params = { ...reference?.params }; delete params.TZID;
    if (event.timezone && event.timezone !== 'UTC') params.TZID = event.timezone;
    return { ...reference, params, value: event.timezone === 'UTC' ? 'Z' : '' };
}
function formatDate(value, reference, allDay = false, timezones = []) {
    const date = canonicalCalendarDate(value);
    if (!date) throw new Error('ics_date_invalid');
    if (!Number.isFinite(date.getTime())) throw new Error('ics_date_invalid');
    let parts;
    if (reference?.params?.TZID && !allDay) {
        const definition = timezones.find(zone => text(zone.properties, 'TZID') === reference.params.TZID);
        if (definition) {
            const zone = new ICAL.Timezone({ component: new ICAL.Component(ICAL.parse(componentLines(definition).join('\r\n'))), tzid: reference.params.TZID });
            const time = ICAL.Time.fromJSDate(date, true).convertToZone(zone);
            return time.toString().replace(/[-:]/g, '').replace(/Z$/, '');
        }
        parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: reference.params.TZID,
            hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            second: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]));
    } else {
        const mode = allDay || (reference && !reference.value.endsWith('Z')) ? '' : 'UTC';
        const get = key => date[`get${mode}${key}`]();
        parts = { year: get('FullYear'), month: String(get('Month') + 1).padStart(2, '0'), day: String(get('Date')).padStart(2, '0'),
            hour: String(get('Hours')).padStart(2, '0'), minute: String(get('Minutes')).padStart(2, '0'), second: String(get('Seconds')).padStart(2, '0') };
    }
    const base = `${parts.year}${parts.month}${parts.day}`;
    return allDay ? base : `${base}T${parts.hour}${parts.minute}${parts.second}${reference?.params?.TZID || (reference && !reference.value.endsWith('Z')) ? '' : 'Z'}`;
}

function ruleValue(rule) {
    // Preserve rules the editor cannot express; structured edits override recognized fields.
    const parts = Object.fromEntries(String(rule.rrule || '').split(';').filter(Boolean).map(p => p.split('=')));
    if (rule.freq) parts.FREQ = rule.freq.toUpperCase();
    if (rule.interval) parts.INTERVAL = String(rule.interval);
    if (rule.count) parts.COUNT = String(rule.count); else delete parts.COUNT;
    if (rule.until) {
        if (!parts.UNTIL || rule.until !== rule.until_original) parts.UNTIL = formatDate(rule.until,
            parts.UNTIL?.length === 8 ? { value: parts.UNTIL, params: { VALUE: 'DATE' } } : null, parts.UNTIL?.length === 8);
    } else delete parts.UNTIL;
    if (rule.byWeekday?.length && (!parts.BYDAY || !/[+-]?\d/.test(parts.BYDAY))) parts.BYDAY = rule.byWeekday.map(day => WEEKDAYS[day] || String(day)).join(',');
    return Object.entries(parts).map(([key, value]) => `${key}=${value}`).join(';');
}

/** Export active canonical values. Original content is never emitted as a stale blob. */
export function buildIcs(events = [], options = {}) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atome//Canonical Calendar//EN', 'CALSCALE:GREGORIAN'];
    const add = (name, value, params = {}) => lines.push(buildContentLine({ name, value, params }));
    if (options.name) add('X-WR-CALNAME', escapeContentText(options.name));
    const timezoneKeys = new Set();
    const component = c => {
        lines.push(`BEGIN:${c.name}`);
        for (const p of c.properties || []) if (safeProperty(p)) lines.push(buildContentLine(p));
        for (const child of c.children || []) component(child);
        lines.push(`END:${c.name}`);
    };
    for (const event of events) for (const zone of event.icalendar?.timezones || []) {
        const key = text(zone.properties, 'TZID');
        if (!timezoneKeys.has(key)) { component(zone); timezoneKeys.add(key); }
    }
    for (const event of events) {
        if (!event.start && event.status !== 'cancelled') continue;
        const uid = event.exchange_uid || event.uid || event.id;
        if (!uid) throw new Error('ics_uid_required');
        lines.push('BEGIN:VEVENT'); add('UID', escapeContentText(uid));
        const startReference = activeReference(event, 'start'), endReference = activeReference(event, 'end');
        add('DTSTAMP', formatDate(event.updatedAt || event.updated_at || options.now || new Date()));
        add('SEQUENCE', String(event.sequence || 0));
        if (event.start) add('DTSTART', formatDate(event.start, startReference, event.allDay, event.icalendar?.timezones || []),
            event.allDay ? { VALUE: 'DATE' } : (startReference?.params || {}));
        const duration = event.icalendar?.duration;
        const currentStart = event.start ? { value: formatDate(event.start, startReference, event.allDay, event.icalendar?.timezones || []),
            params: event.allDay ? { VALUE: 'DATE' } : (startReference?.params || {}) } : null;
        const keepDuration = duration && currentStart && event.end && durationEnd(currentStart, duration, event.icalendar?.timezones || []).getTime() === canonicalCalendarDate(event.end)?.getTime();
        if (keepDuration) add('DURATION', duration.value, duration.params);
        else if (event.end) add('DTEND', formatDate(event.end, endReference, event.allDay, event.icalendar?.timezones || []),
            event.allDay ? { VALUE: 'DATE' } : (endReference?.params || {}));
        add('SUMMARY', escapeContentText(event.title || ''));
        if (event.description) add('DESCRIPTION', escapeContentText(event.description));
        if (event.location) add('LOCATION', escapeContentText(event.location));
        add('STATUS', event.status === 'cancelled' ? 'CANCELLED' : (event.ical_status || 'CONFIRMED'));
        if (event.recurrence) add('RRULE', ruleValue(event.recurrence));
        if (event.recurrence_id) add('RECURRENCE-ID', event.recurrence_id, event.icalendar?.recurrence_id?.params || {});
        for (const [name, entries] of [['EXDATE', event.exdates], ['RDATE', event.rdates]]) {
            for (const entry of entries || []) add(name, entry.value, entry.params || {});
        }
        for (const p of event.icalendar?.extra_properties || []) if (!managed.has(p.name) && safeProperty(p)) lines.push(buildContentLine(p));
        for (const alarm of event.alarms || []) {
            lines.push('BEGIN:VALARM');
            // Imported alarms are inert data. Exporting them never dispatches an action.
            if (alarm.ical_properties?.length) {
                for (const p of alarm.ical_properties) if (safeProperty(p)) lines.push(buildContentLine(p));
            } else {
                const minutes = Number(alarm.offsetMinutes ?? -15);
                add('TRIGGER', `${minutes < 0 ? '-' : ''}PT${Math.abs(minutes)}M`);
                add('ACTION', 'DISPLAY'); add('DESCRIPTION', escapeContentText(alarm.message || 'Reminder'));
            }
            lines.push('END:VALARM');
        }
        lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldContentLine).join('\r\n') + '\r\n';
}

export function expandCalendarOccurrences(event, start, end, limit = 1000) {
    const root = new ICAL.Component(ICAL.parse(buildIcs([event]))), release = installIanaZones(root, calendarDate);
    try {
        const recurrence = new ICAL.Event(root.getFirstSubcomponent('vevent')).iterator();
        const output = [], until = end?.getTime() ?? Infinity, from = start?.getTime() ?? canonicalCalendarDate(event.start).getTime();
        let time, iterations = 0;
        while ((time = recurrence.next()) && iterations++ < 100000) {
            const date = time.toJSDate();
            if (date.getTime() > until) break;
            if (date.getTime() >= from) output.push(date);
            if (output.length >= limit) break;
        }
        return output;
    } finally { release(); }
}

export function calendarOccurrenceEnd(event, start) {
    const baseStart = canonicalCalendarDate(event.start), baseEnd = canonicalCalendarDate(event.end);
    if (!baseEnd || !baseStart) return null;
    const reference = activeReference(event, 'start'), zones = event.icalendar?.timezones || [];
    const propertyAt = date => ({ value: formatDate(date, reference, event.allDay, zones), params: reference?.params || {} });
    const duration = event.icalendar?.duration;
    if (duration && durationEnd(propertyAt(baseStart), duration, zones).getTime() === baseEnd.getTime()) {
        return durationEnd(propertyAt(start), duration, zones);
    }
    if (!event.allDay) return new Date(baseEnd.getTime() + start.getTime() - baseStart.getTime());
    const day = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(start); end.setDate(end.getDate() + Math.round((day(baseEnd) - day(baseStart)) / 86400000));
    return end;
}
