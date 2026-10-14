# Deleted Atomes come back on iOS/Tauri (stacked or duplicated template cells)

## Symptom

iPhone, 2026-10-14: the Dashboard mystique showed two layouts at once. A v1
`rec` cell and a v2 `find` cell sat under the new `objectives` cell, four
cells existed twice, and taps seemed dead. The Web build of the same account
was clean.

## Evidence

- `Atome.listStateCurrent(<system template project>)` on the device returned
  records carrying `properties.__deleted: true` and `deleted_at`.
- Home instance cells: two live copies shared one `template_slot_id`.

## Root cause

1. The Swift local server (`AiSRuntimeStateCurrent.swift`) and the Tauri
   server (`local_atome.rs`) ignored `include_deleted` and listed tombstones.
   Fastify (`database/adole.js#stateCurrentListScope`) excludes them by
   default. The template planner treated deleted source cells as live, so it
   kept their instance copies.
2. `planTemplateInstanceSync` mapped one instance record per slot and silently
   ignored extra copies (racing syncs from two devices): they were never
   updated or deleted.

## Correction

- Both local servers add `a.deleted_at IS NULL` and
  `COALESCE(json_extract(sc.properties,'$.__deleted'),0) <> 1` unless
  `include_deleted` is true. Internal Swift callers keep their former default.
- `planTemplateInstanceSync` keeps the most recent copy of a slot and deletes
  the others.

## Regression checks

- `tests/eve/dashboard_basic_template_sync.test.mjs`: "deletes the extra copies
  two racing syncs made of one slot".
- Device: `syncProjectTemplateInstances(home)` deleted 6 records; the home has
  18 cells.
