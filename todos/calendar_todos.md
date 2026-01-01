# Calendar Todos (Phase 1 now, Phase 2 later)

This document specifies how to support **simple todos** ("due date + reminder") inside the existing Calendar feature, and how to evolve into a richer task system later **without changing the core storage model**.

Scope constraints for this spec:

- Do **not** introduce a new storage backend.
- Use existing `CalendarAPI` and atome storage (`AdoleAPI.atomes`).
- Keep everything compatible with existing `calendar_event` items.
- Phase 1 should be minimal: due date + reminder + completion.

---

## 0) Current state (what we already have)

Source of truth today:

- Logic + storage: `src/application/examples/calendar.js` exports `CalendarAPI`.
- UI demo: `src/application/examples/calendarUI.js` uses `CalendarAPI`.

Storage:

- Events are stored as atomes of type `calendar_event`.
- `CalendarAPI` persists fields via particles:
  - `title`, `description`, `location`
  - `start`, `end`, `all_day`, `calendar_id`, `timezone`, `color`
  - `alarms` (JSON string), `recurrence` (JSON string)
  - `created_at`, `updated_at`

Reminders:

- Already implemented via `alarms` + local timers (`scheduleAlarmsForEvent`).

---

## 1) Phase 1 (now): todos = calendar events with a task schema

### 1.1 Principle

A todo is stored as a `calendar_event` with additional task-related particles.

This avoids new APIs/backends, and makes todos naturally visible in calendar views.

### 1.2 Minimal todo fields

Add/recognize these particles on `calendar_event`:

- `kind`: string
  - Values: `event` (default), `todo`
- `status`: string
  - Values: `open` (default), `done`
- `due_at`: ISO string
  - For Phase 1, this is the canonical “due date/time” of a todo.
- `completed_at`: ISO string | null

Notes:

- For a todo, `start` should mirror `due_at` for calendar rendering.
- `end` can be omitted (null).
- `all_day` can be true for “due date only” todos.

### 1.3 Data mapping rules

When creating/updating a todo:

- `kind = 'todo'`
- `due_at = start` (ISO)
- If `status === 'done'` then set `completed_at = nowIso()` if missing.
- If `status === 'open'` then set `completed_at = null`.

When reading existing items:

- If `kind` is missing:
  - Treat as `event`.
- If `kind === 'todo'` and `due_at` missing:
  - Derive `due_at` from `start`.
- If `status` missing:
  - Default to `open`.

### 1.4 Reminder rules

No new reminder system is required.

- Use the existing `alarms` array.
- Default alarm behavior for Phase 1:
  - For todos, it is OK to keep the current default (offset -30) OR define a dedicated default (e.g. -60).
  - If a client explicitly passes `alarms: []`, do not add defaults.

### 1.5 UI rules (calendar view)

Minimum UI requirements for Phase 1:

- Todos appear in the calendar month/day views like events (because they are events).
- A todo should be visually distinguishable:
  - If the UI already supports a “badge” or alternative title formatting, prefix the title like `[TODO]`.
  - If it doesn’t, do nothing in Phase 1.

Completion interaction (choose one minimal option):

- Option A (minimal): Completing a todo is done via edit form (status toggle) and saves via `updateEvent`.
- Option B (slightly better): Add a “Mark done” action for selected items.

This spec does not require implementing UI changes immediately, but it defines the data contract.

---

## 2) API changes required (small and backwards-compatible)

### 2.1 Extend normalization in `CalendarAPI`

Add task fields to the normalized event object:

- `kind` (string)
- `status` (string)
- `dueAt` (Date|null)
- `completedAt` (Date|null)

Normalization sources:

- particles keys: `kind`, `status`, `due_at`, `completed_at`

### 2.2 Extend persistence mapping in `buildEventParticles(...)`

When saving, include:

- `kind`
- `status`
- `due_at`
- `completed_at`

Ensure:

- If the event is a todo and `due_at` is missing, set it from `start`.
- Keep existing keys unchanged for non-todo events.

### 2.3 Add optional sugar methods (recommended, not mandatory)

To avoid spreading task logic across UI code, add convenience wrappers:

- `CalendarAPI.createTodo({ title, dueAt, alarms, ... })`
- `CalendarAPI.completeTodo(eventId)`
- `CalendarAPI.reopenTodo(eventId)`
- `CalendarAPI.listTodos({ from, to, status })`

These wrappers call existing CRUD methods internally.

If you do not add these now, you can still implement Phase 1 by calling `createEvent/updateEvent` directly.

---

## 3) Phase 2 (later): richer tasks but still “based on calendar”

### 3.1 What “based on calendar” can realistically mean

Keeping tasks as `calendar_event` works well for:

- tasks with due dates
- tasks scheduled into time blocks
- recurring tasks
- reminders

It becomes less ideal for:

- inbox tasks with no date
- complex task dependencies
- long checklists/subtasks
- multiple assignees and workflow states

Still, we can extend the same item type with more particles.

### 3.2 Extended fields for Phase 2

Add these particles (still on `calendar_event`):

- `priority`: `low|normal|high|urgent`
- `tags`: JSON array of strings
- `notes`: string
- `estimate_minutes`: number
- `project_ref`: string (optional)
- `subtasks`: JSON array (each subtask has `title`, `status`, `completed_at`)
- `inbox`: boolean (true when no due date)

Scheduling semantics:

- Keep `start/end` for scheduled blocks.
- Keep `due_at` for deadlines.
- A task can have only a `due_at` (deadline) without `end`.

### 3.3 Required higher-level behavior (Phase 2)

- `tasks.reschedule_incomplete()` (mentioned in `documentations/AI.md`) should be implemented as:
  - query incomplete tasks
  - choose new slots
  - update `start/end` (and possibly `due_at`)
  - emit audit events

This is a new high-level capability, but it can still use `CalendarAPI.updateEvent` underneath.

---

## 4) Compatibility and migration

### 4.1 Backward compatibility

- Existing events remain valid; missing task fields default to event behavior.
- Existing clients that do not understand task fields should ignore them.

### 4.2 Forward compatibility

- Always store arrays/objects as JSON strings (consistent with `alarms` and `recurrence`).
- Avoid renaming existing particles.

---

## 5) Implementation checklist (Phase 1)

1. Extend `normalizeEvent(...)` to include `kind/status/dueAt/completedAt`.
2. Extend `buildEventParticles(...)` to persist `kind/status/due_at/completed_at`.
3. Decide minimal UI approach:
   - A: add a checkbox for `status` in the form
   - or B: keep it as "event" for UI and only use due+reminder
4. Ensure `listEvents()` still filters correctly and schedules alarms for todos.
5. Add documentation updates:
   - Update Calendar API docs to include task fields.

---

## 6) Acceptance criteria (Phase 1)

- A todo can be created with a due date and an alarm.
- The todo is stored as a `calendar_event`.
- The todo is visible in the calendar month/day view.
- Marking it done sets `status=done` and `completed_at`.
- Existing events are unaffected.
