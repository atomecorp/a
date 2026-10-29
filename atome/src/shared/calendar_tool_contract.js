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
    alarms: { type: 'array', items: { type: 'object' } }, recurrence: { type: 'object' }, conditions: { type: 'object' }
};
const contract = (name, description, write, properties = {}, required = [], extra = {}) => ({
    name: 'calendar.' + name, description, write, risk: write ? 'MEDIUM' : 'LOW',
    capabilities: [write ? 'calendar.write' : 'calendar.read'], ...extra,
    input_schema: { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) }
});

export const CALENDAR_AGENDA_TOOLS = [
    contract('time.read', 'Read current time, epoch milliseconds and local timezone.', false),
    contract('alarm.set', 'Set an agenda alarm at an ISO date with timezone or after delay_ms. Optional command runs a Runtime V2 tool through MCP at that time; sensitive actions still need approval. Runs only while the application is alive. eventId/alarmId replace an existing alarm.', true, {
        at: isoDate, delay_ms: { type: 'number', minimum: 1 }, title: { type: 'string' }, message: { type: 'string' },
        eventId: id, alarmId: id, projectId: id, calendarId: id,
        command: { type: 'object', description: 'Specify tool_id for Runtime V2, or tool_name for an AI/MCP registered tool; input contains its arguments.',
            properties: { tool_id: { type: 'string' }, tool_name: { type: 'string' }, action: { type: 'string' }, input: { type: 'object' } } }
    }),
    contract('alarm.read', 'Read agenda alarms and remaining milliseconds (countdown), of one event or of every event.', false, { eventId: id }),
    contract('alarm.cancel', 'Cancel one alarm, or all alarms of an event when alarmId is omitted, preserving the agenda event.', true,
        { eventId: id, alarmId: id }, ['eventId']),
    contract('list_events', 'List every calendar event of the account (projects and personal).', false),
    contract('get_event', 'Get a calendar event by id.', false, { eventId: id }, ['eventId']),
    contract('create_event', 'Create a calendar event (or todo) in the current or explicit project; default alarms apply when alarms is omitted.', true, event, ['start']),
    contract('update_event', 'Update a calendar event: changes holds the event fields to replace.', true,
        { eventId: id, changes: { type: 'object', additionalProperties: false, properties: event } }, ['eventId', 'changes']),
    contract('delete_event', 'Delete a calendar event.', true, { eventId: id }, ['eventId']),
    contract('ensure_calendar', 'Ensure a calendar exists (creates the default one when calendarId is omitted); name names a calendar made now.', true,
        { calendarId: id, name: { type: 'string', minLength: 1 } }, [], { risk: 'LOW' }),
    contract('share', 'Share a calendar with another user by phone.', true, {
        phone: { type: 'string', minLength: 1 }, calendarId: id, shareType: { type: 'string' },
        permissions: { type: 'object', additionalProperties: false, properties: {
            read: { type: 'boolean' }, alter: { type: 'boolean' }, delete: { type: 'boolean' }, create: { type: 'boolean' } } }
    }, ['phone'], { risk: 'HIGH', capabilities: ['calendar.write', 'share.write'] }),
    contract('export_webcal', 'Export calendar events as an ICS feed and optional webcal URL.', false,
        { calendarId: id, baseUrl: { type: 'string' }, name: { type: 'string' }, timeZone: { type: 'string' } })
];
