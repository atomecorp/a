# Calendar UI demo (EventCalendar Lab)

This document describes the UI demo implemented in `src/application/examples/calendarUI.js`.

Note: Some code references (for example in `src/application/index.js`) mention `calendar_UI.js`, but the current file name in this workspace is `calendarUI.js`.

## Purpose

`calendarUI.js` is a demo UI that exercises `CalendarAPI` from `src/application/examples/calendar.js`.

It provides:

- A form to create/update/delete events
- A “stored events” list with selection
- A month grid powered by the `eventCalendar(...)` library
- A day timeline view with click/drag selection
- Share-calendar controls (phone + permissions)
- Webcal/ICS generation

## Entry point

The module exports and also immediately runs the initializer:

- `initCalendarUI()`
- The file ends with `initCalendarUI();`

You can also import it manually:

```js
import { initCalendarUI } from './calendarUI.js';
initCalendarUI();
```

## Dependencies and expectations

### Calendar API

The UI imports:

```js
import { CalendarAPI } from './calendar.js';
```

It uses:

- `CalendarAPI.createEvent(payload)`
- `CalendarAPI.updateEvent(eventId, payload)`
- `CalendarAPI.deleteEvent(eventId)`
- `CalendarAPI.ensureCalendar(calendarId)`
- `CalendarAPI.shareCalendar({ calendarId, phone, permissions })`
- `CalendarAPI.exportWebcal({ calendarId, baseUrl })`
- `CalendarAPI.on(handler)`

### Month grid library

The UI expects a global function:

- `eventCalendar(options)`

If `eventCalendar` is missing, the UI sets an error status and stops.

It subscribes to:

- `calendarInstance.on('did-change-month', handler)`

## UI behavior

### Layout

The UI mounts under a root element with id `view`.

It creates a wrapper with id `calendar-demo` containing:

- Left panel: form sections (event details, recurrence, alarm, share calendar, webcal)
- Right side: month view + day timeline + stored events list

### Event form payload

When the user clicks “Create event” / “Update event”, the UI builds a payload shaped like:

- `title` (string)
- `start` (Date)
- `end` (Date|null)
- `location` (string)
- `description` (string)
- `allDay` (boolean)
- `calendarId` (string) – always `calendar_default` in the demo
- `recurrence` (object|null)
  - `freq`: `daily|weekly|monthly|yearly`
  - `interval`: number
  - `byWeekday`: array of `0..6` (weekly only, optional)
- `alarms` (array)
  - `offsetMinutes`: number (defaults to `-30`)
  - `action`: `notify|script`
  - `message`: string
  - `script`: string

### Selecting an event

- Clicking an event in the list selects it and populates the form.
- Clicking the month grid day cell is handled by `handleCalendarClick(...)` (used to change the selected day and/or pick an event).

### Day timeline interaction

The “day slots” panel supports drag selection:

- Mouse down starts selecting a time slot
- Mouse move updates the selection overlay
- Mouse up finalizes the selection and updates form start/end

### Share calendar

The “Share calendar” section calls:

```js
CalendarAPI.shareCalendar({
  calendarId: 'calendar_default',
  phone,
  permissions: {
    read: <checkbox>,
    alter: <checkbox>,
    delete: false,
    create: <checkbox>
  }
});
```

### Webcal / ICS

The “Generate webcal” button calls:

```js
CalendarAPI.exportWebcal({
  calendarId: 'calendar_default',
  baseUrl
});
```

On success it displays the generated `webcal://.../calendar/<id>.ics` URL (when a base URL is provided).

## Live refresh

The UI keeps itself updated by:

- Subscribing to `CalendarAPI.on(() => refreshEvents(statusEl))`
- Calling `CalendarAPI.ensureCalendar(DEFAULT_CALENDAR_ID).then(() => refreshEvents(statusEl))`

This means create/update/delete operations should trigger a refresh automatically.
