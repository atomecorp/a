// Calendar agenda tools: one input contract per capability, consumed by the
// Runtime V2 definitions (eVe tool bootstrap) and by the AtomeAI registration,
// which forwards its parameters unchanged to the same runtime tool.
const id = { type: 'string', minLength: 1 };
const isoDate = { type: 'string', description: 'ISO 8601 date-time' };
const event = {
    title: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' },
    start: isoDate, end: isoDate, allDay: { type: 'boolean' }, timezone: { type: 'string' }, color: { type: 'string' },
    calendarId: id, projectId: id, personal: { type: 'boolean', description: 'Account-wide event outside any project.' },
    kind: { type: 'string', enum: ['event', 'todo'] }, status: { type: 'string', enum: ['open', 'done', 'cancelled'] },
    dueAt: isoDate, completedAt: isoDate,
    alarms: { type: 'array', items: { type: 'object' }, description: 'Each { id, offsetMinutes (negative before), relativeTo (\'end\': from the end), ringtone, launch } or { id, at }.' },
    recurrence: { type: 'object', description: 'RFC 5545 rule { freq (daily|weekly|monthly|yearly), interval, byWeekday (0 = Sunday), until (ISO), count }.' },
    conditions: { type: 'object' }
};
// What an alarm launches (its « Quoi »): a music, a media, a project, a tool (an item of the event panel's lists) or a visio calling guests.
const launch = { type: 'object', required: ['kind'], description: 'kind music|media|project|tool|visio; a visio carries guests [{ id, name, phone }].',
    properties: { kind: { type: 'string', enum: ['music', 'media', 'project', 'tool', 'visio'] }, guests: { type: 'array', items: { type: 'object' } } } };
const contract = (name, description, write, properties = {}, required = [], extra = {}) => ({
    name: 'calendar.' + name, description, write, risk: write ? 'MEDIUM' : 'LOW',
    capabilities: [write ? 'calendar.write' : 'calendar.read'], ...extra,
    input_schema: { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) }
});

export const CALENDAR_AGENDA_TOOLS = [
    contract('time.read', 'Read current time, epoch milliseconds and local timezone.', false),
    contract('alarm.set', 'Set an agenda alarm at an ISO date with timezone or after delay_ms; or, on an event (eventId), offsetMinutes before (negative) or after (positive) its start, or its end with relativeTo end (« 15 min avant le début », « 30 min après la fin »), with what it does: a ringtone or a launch (music, media, project, tool, visio and its guests). Optional command runs a Runtime V2 tool through MCP at that time; sensitive actions still need approval. eventId/alarmId replace an existing alarm.', true, {
        at: isoDate, delay_ms: { type: 'number', minimum: 1 }, title: { type: 'string' }, message: { type: 'string' },
        offsetMinutes: { type: 'integer', minimum: -44640, maximum: 44640 }, relativeTo: { type: 'string', enum: ['start', 'end'] },
        ringtone: { type: 'string' }, launch,
        eventId: id, alarmId: id, projectId: id, calendarId: id,
        command: { type: 'object', description: 'Specify tool_id for Runtime V2, or tool_name for an AI/MCP registered tool; input contains its arguments.',
            properties: { tool_id: { type: 'string' }, tool_name: { type: 'string' }, action: { type: 'string' }, input: { type: 'object' } } }
    }),
    contract('alarm.read', 'Read agenda alarms and remaining milliseconds (countdown), of one event or of every event.', false, { eventId: id }),
    contract('alarm.cancel', 'Cancel one alarm, or all alarms of an event when alarmId is omitted, preserving the agenda event.', true,
        { eventId: id, alarmId: id }, ['eventId']),
    contract('repeat.set', 'Set how an event repeats (its « Répéter »): repeat none, daily, weekly, biweekly (every 2 weeks), monthly, yearly, or custom with interval and unit (daily|weekly|monthly|yearly), weekdays (0 = Sunday … 6, weekly only), and until (ISO date, inclusive) or count; forever when neither.', true, {
        eventId: id, repeat: { type: 'string', enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom'] },
        interval: { type: 'integer', minimum: 1, maximum: 99 }, unit: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
        weekdays: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, minItems: 1 }, until: isoDate, count: { type: 'integer', minimum: 1, maximum: 999 }
    }, ['eventId', 'repeat']),
    contract('list_events', 'List every calendar event of the account (projects and personal).', false),
    contract('get_event', 'Get a calendar event by id.', false, { eventId: id }, ['eventId']),
    contract('create_event', 'Create a calendar event (or todo) in the current or explicit project; default alarms apply when alarms is omitted.', true, event, ['start']),
    contract('update_event', 'Update a calendar event: changes holds the event fields to replace.', true,
        { eventId: id, changes: { type: 'object', additionalProperties: false, properties: event } }, ['eventId', 'changes']),
    contract('delete_event', 'Delete a calendar event.', true, { eventId: id }, ['eventId']),
    contract('ensure_calendar', 'Ensure a calendar exists (creates the default one when calendarId is omitted); name names a calendar made now.', true,
        { calendarId: id, name: { type: 'string', minLength: 1 } }, [], { risk: 'LOW' }),
    contract('calendars', 'List the account\'s calendars (Perso first, then its own: a life profile\'s, « Publications »…), each with shown: false when the person hid it from the Agenda.', false),
    contract('calendar_show', 'Show (shown true) or hide (shown false) a calendar\'s events in the Agenda; the calendar and its events stay. Its id comes from calendar.calendars.', true,
        { calendarId: id, shown: { type: 'boolean' } }, ['calendarId', 'shown'], { risk: 'LOW' }),
    contract('share', 'Share a calendar with another user by phone.', true, {
        phone: { type: 'string', minLength: 1 }, calendarId: id, shareType: { type: 'string' },
        permissions: { type: 'object', additionalProperties: false, properties: {
            read: { type: 'boolean' }, alter: { type: 'boolean' }, delete: { type: 'boolean' }, create: { type: 'boolean' } } }
    }, ['phone'], { risk: 'HIGH', capabilities: ['calendar.write', 'share.write'] }),
    contract('export_webcal', 'Export calendar events as an ICS feed and optional webcal URL.', false,
        { calendarId: id, baseUrl: { type: 'string' }, name: { type: 'string' }, timeZone: { type: 'string' } })
];
