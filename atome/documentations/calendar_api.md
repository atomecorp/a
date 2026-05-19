# Calendar API (EventCalendar)

This document describes the APIs implemented in `src/application/examples/calendar.js`.

## Overview

The calendar logic is implemented as an API object exported as `CalendarAPI`.

- Storage backend: `AdoleAPI.atomes` (create/get/list/alter/delete)
- Event atome type: `calendar_event`
- Calendar atome type: `calendar`
- Default calendar id: `calendar_default`

When `src/application/examples/calendar.js` runs in a browser/webview environment, it also:

- Assigns the API to `window.CalendarAPI`
- Attempts to load the UI demo from `src/application/examples/calendarUI.js`

## Data model

### Event object (normalized)

`CalendarAPI` normalizes events into a consistent shape:

- `id` (string|null)
- `calendarId` (string) – defaults to `calendar_default`
- `title` (string)
- `description` (string)
- `location` (string)
- `start` (Date) – required
- `end` (Date|null)
- `allDay` (boolean)
- `timezone` (string) – defaults to the local timezone (fallback `UTC`)
- `color` (string|null)
- `alarms` (array)
- `recurrence` (object|null)
- `kind` (string) – optional; recommended values: `event` (default), `todo`
- `status` (string) – optional; recommended values: `open` (default), `done`
- `dueAt` (Date|null) – optional; for todos, the due date/time
- `completedAt` (Date|null) – optional; for done todos
- `createdAt` (string|null) – ISO date string when present
- `updatedAt` (string|null) – ISO date string when present

Internally, persistence uses an “atome particles” payload with keys like:

- `title`, `description`, `location`
- `start` (ISO string), `end` (ISO string|null)
- `all_day` (boolean)
- `calendar_id` (string)
- `timezone` (string)
- `alarms` (JSON string|null)
- `recurrence` (JSON string|null)
- `kind` (string) – optional
- `status` (string) – optional
- `due_at` (ISO string|null) – optional
- `completed_at` (ISO string|null) – optional
- `created_at` (ISO string), `updated_at` (ISO string)

## Todos (Phase 1) using the calendar backend

The current codebase does not ship a dedicated `TaskAPI` yet, but the calendar storage model can support simple todos ("due date + reminder") by storing them as `calendar_event` atomes with extra particles.

### Recommended particles for todos

- `kind: 'todo'`
- `status: 'open' | 'done'`
- `due_at: <ISO string>`
- `completed_at: <ISO string|null>`

### Recommended mapping rules

- For a todo, treat `start` as the due date/time. Persist `due_at` equal to `start`.
- When marking a todo done, set `status = 'done'` and set `completed_at`.
- When reopening, set `status = 'open'` and clear `completed_at`.

### How to use with existing API

You can implement todos today by calling existing CRUD methods:

- Create: `CalendarAPI.createEvent({ title, start: dueDate, kind: 'todo', status: 'open', alarms: [...] })`
- Complete: `CalendarAPI.updateEvent(id, { status: 'done', completedAt: new Date() })`
- Reopen: `CalendarAPI.updateEvent(id, { status: 'open', completedAt: null })`

Note: The current implementation of `src/application/examples/calendar.js` does not yet normalize/persist these fields automatically; the section above defines the intended contract to implement.

### Alarm object

Alarms are stored in `event.alarms` as an array. Each alarm can include:

- `id` (string) – optional
- `offsetMinutes` (number) – minutes relative to the next occurrence (negative means “before”)
- `at` (string|Date) – optional absolute trigger time (overrides `offsetMinutes`)
- `action` (string) – `notify` or `script`
- `message` (string) – notification text
- `script` (function|string) – only when `action === 'script'`
- `targetUserId` or `targetPhone` – optional remote notification target

Default behavior:

- If you do not provide an `alarms` property at all when creating an event, the API adds a default alarm (`offsetMinutes = -30`).
- If you provide `alarms: []`, no default alarm is added.

### Recurrence object

Recurrence is stored in `event.recurrence` as an object. Supported fields:

- `freq` (string) – `daily`, `weekly`, `monthly`, `yearly`
- `interval` (number) – defaults to `1`
- `until` (string|Date) – optional
- `count` (number) – optional maximum occurrences
- `byWeekday` (array) – for weekly recurrence; values are numbers `0..6` or strings like `mon`, `tue`, …
- `weekStart` (number) – optional; default is `1` (Monday)

Safety limits:

- Occurrence expansion is capped to `MAX_OCCURRENCES` (800) unless `count` is lower.

## Public API

`CalendarAPI` is exported from `src/application/examples/calendar.js`:

```js
import { CalendarAPI } from './calendar.js';
```

### `await CalendarAPI.listEvents(options?)`

Lists calendar events for the current project.

- `options.projectId` (string) – optional; defaults to the current project id.

Returns:

- `{ ok: true, items: Event[] }`

Side effects:

- Populates an in-memory cache and schedules alarms.

### `await CalendarAPI.getEvent(eventId)`

Fetches one event by id, using the in-memory cache when possible.

Returns:

- `Event|null`

### `await CalendarAPI.createEvent(input)`

Creates a new event.

- Validates that `title` and `start` exist.
- Converts `alarms` and `recurrence` to JSON strings for storage.

Returns:

- Success: `{ ok: true, event: Event }`
- Failure: `{ ok: false, error: string }`

### `await CalendarAPI.updateEvent(eventId, changes)`

Updates an existing event.

Returns:

- Success: `{ ok: true, event: Event }`
- Failure: `{ ok: false, error: string }`

### `await CalendarAPI.deleteEvent(eventId)`

Deletes an event by id.

Returns:

- Success: `{ ok: true }`
- Failure: `{ ok: false, error: string }`

### `await CalendarAPI.createCalendar(input?)`

Creates a calendar atome.

Inputs:

- `id` or `calendarId` (string) – optional; auto-generated when omitted
- `name`, `color`, `timezone`, `description`
- `projectId` (string) – optional

Returns:

- Success: `{ ok: true, calendar }`
- Failure: `{ ok: false, error: string }`

### `await CalendarAPI.ensureCalendar(calendarId?)`

Ensures a calendar exists.

- If the calendar is missing, it creates a “Default calendar”.

Returns:

- `calendar|null`

### `await CalendarAPI.shareCalendar(options)`

Shares a calendar with another user (phone-based).

Inputs:

- `calendarId` (string) – defaults to `calendar_default`
- `phone` / `targetPhone` (string) – required
- `permissions` (object) – defaults to `{ read: true, alter: false, delete: false, create: false }`
- `shareType` (string) – defaults to `linked`

Returns:

- Success: `{ ok: true, data }`
- Failure: `{ ok: false, error: string }`

### `CalendarAPI.buildWebcalUrl(options?)`

Builds a webcal URL for an ICS endpoint.

- `calendarId` (string) – defaults to `calendar_default`
- `baseUrl` (string) – defaults to `window.location.origin`

Returns:

- `string|null`

URL format:

- `webcal://<host>/calendar/<calendarId>.ics`

### `await CalendarAPI.exportWebcal(options?)`

Generates an ICS document and (optionally) a webcal URL.

Inputs:

- `calendarId` (string)
- `events` (Event[]) – optional; defaults to `await listEvents()`
- `name`, `timeZone`, `prodId` – optional metadata
- `baseUrl` (string) – optional, for building the webcal URL

Returns:

- `{ ok: true, ics: string, url: string|null }`

### `CalendarAPI.buildIcs(events, options?)`

Builds an ICS text for the provided events.

### `CalendarAPI.expandOccurrences(event, rangeStart, rangeEnd)`

Expands a recurring event into concrete occurrences within a range.

### `CalendarAPI.scheduleAlarmsForEvent(event)`

Schedules local timers for the next upcoming occurrence(s) of an event.

Notes:

- The scheduling horizon is ~3 months.
- On trigger, the API can show a local notification and optionally send a remote command.

### `CalendarAPI.on(handler)` / `CalendarAPI.off(handler)`

Subscribes to API changes.

- `handler(type, payload)` is called on changes.
- Returns an unsubscribe function.

Known `type` values emitted by this module:

- `create`, `update`, `delete`
- `calendar:create`
- `calendar:share`

## Minimal usage example

```js
import { CalendarAPI } from './calendar.js';

await CalendarAPI.ensureCalendar('calendar_default');

const result = await CalendarAPI.createEvent({
  title: 'Daily standup',
  start: new Date(),
  end: new Date(Date.now() + 15 * 60 * 1000),
  recurrence: { freq: 'daily', interval: 1 },
  alarms: [{ offsetMinutes: -5, action: 'notify', message: 'Standup in 5 minutes' }]
});

if (result.ok) {
  console.log('Created:', result.event.id);
}
```
