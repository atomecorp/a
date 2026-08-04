# Calendar API

Canonical implementation: `eVe/intuition/tools/calendar_api.js`.

CalendarAPI persists through the canonical Atome mutation pipeline. Events are Atomes of `type: calendar_event`; calendars use `type: calendar`. The DOM and the Bevy panel are not state authorities.

## Event shape

Normalized events expose `id`, `projectId`, `calendarId`, `title`, `description`, `location`, `start`, `end`, `allDay`, `timezone`, `color`, `alarms`, `recurrence`, `createdAt`, `updatedAt`, `kind`, `status`, `dueAt`, and `completedAt`.

`kind` is `event` by default or `todo`. Todos store `due_at` from `dueAt`/`start`; `status` is `open` or `done`; reopening clears `completed_at`. Existing records without task fields normalize as open events.

## Canonical methods

- `listEvents`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent`
- `createCalendar`, `ensureCalendar`, `shareCalendar`
- `exportWebcal`, `buildWebcalUrl`, `buildIcs`, `expandOccurrences`
- `scheduleAlarmsForEvent`, `on`, `off`

Creates carry explicit `type: calendar_event`; `kind` remains a separate business value. All durable methods route through `window.Atome.commit`. Sharing reuses the established Adole owner. ICS is returned as data and an optional Webcal URL; no HTML download fallback is created.

`type` is commit-envelope metadata, not an ordinary particle. The Atome commit normalizer projects that trusted value into the reserved event metadata consumed by ADOLE, while property sanitation continues to reject caller-supplied `type`. Both individual and list `state_current` reads must restore the envelope type from `atomes.atome_type`; business `kind: event|todo` must never replace `calendar_event` during projection.

Todo creation and completion use the existing `createEvent`/`updateEvent` methods with `kind`, `status`, `dueAt`, and `completedAt`. No additional public API is introduced.

## Unified service

`atome/src/squirrel/calendar/bootstrap.js` installs the existing `Squirrel.calendar`, `atome.calendar`, and `AtomeCalendar` facades. They expose source registration/sync, `sources`, `search`, `today`, `next`, `read`, `create`, `update`, `delete`, `openPanel`, and `closePanel`. Conflict resolution prefers the writable primary source and exposes provenance metadata.

The built-in source normalizes an unavailable or inaccessible optional `ensureCalendar('default')` lookup as a source result. That auxiliary logical-calendar lookup cannot abort creation of a canonical `calendar_event`; the event remains scoped by its real data project and persists through the existing Atome pipeline.

## Runtime and MCP

Runtime V2 tools: `calendar.list_events`, `calendar.get_event`, `calendar.create_event`, `calendar.update_event`, `calendar.delete_event`, `calendar.ensure_calendar`, `calendar.share`, and `calendar.export_webcal`.

MCP methods: `calendar.sources`, `calendar.search`, `calendar.today`, `calendar.next`, `calendar.create`, `calendar.update`, `calendar.delete`, `calendar.share`, and `calendar.export_webcal`. Calendar writes remain confirmation/rate-limit governed; sharing additionally requires `share.write`.
