# Project State and Legacy Media Reconciliation

## Symptoms

- A project disappears after another project is created or renamed.
- A project thumbnail vanishes after rename.
- List or Matrix says a project is empty although its media Atome exists.
- Media owned by a migrated opaque principal returns 404.

## Confirmed causes

Project slot reads also performed writes, so stale lists could assign duplicate slots. Dashboard cached the account-global project catalogue under the current project. Rename used two mutations. Structured views ignored `meta.project_id`, which is the canonical server projection shape. Identity migration updated database owners without reconciling physical `data/users/<legacy-id>/...` paths.

## Canonical correction

- Reconcile all project slots under the per-user order lock and persist one batch.
- Cache Dashboard `projects` globally and invalidate it on project mutations.
- Rename with one project-scoped `Atome.commit`; projection merge preserves preview fields.
- Read project, parent, and owner through `atome_record_utils.js` across root, `properties`, and `meta`.
- Migrate a legacy file only when `principal_identity_aliases` proves ownership; copy atomically, retain the source, update metadata, and journal the operation.
- Persist tools and user preferences with `scope: "global"`; repair historical pollution with new append-only events.

Never repair this by hiding duplicate cards, falling back to a basename search, accepting another principal's legacy directory, recreating missing projects, or adding a view-specific filter.

## Regression coverage

Run the focused Node/Vitest suites for project order, Dashboard preferences, project view real-server shape, ADOLE replay, principal file migration, selected media playback, and Bevy project renderer guards.

## Production acceptance

Back up SQLite and inventory/checksum legacy media before deployment. Through the authenticated UI, verify all project cards and thumbnails, rename, create a new project, open List and Matrix, fetch the known legacy resources, and exercise mixed/all-active Play/Stop plus a project switch. Remove inherited source copies only in a separate explicitly approved cleanup after checksum equality is proven.
