# An atome made on iOS / Tauri never appears in its typed list (a new contact « introuvable »)

## Symptom

iPad, 14 Nov. 2026 (R-163): Carnet › Filtrer « 0611223344 » › the phone row answered
« Contact introuvable »; a contact made with Créer did not appear in the Carnet. The card
was committed (present in an unpaged `listStateCurrent`), but not in the book.

## Evidence

- Cursor read (`listStateCurrent(null, { atomeType: 'contact', storageOrder: true, after })`,
  used by `canonical_import.js#readTable`): 2 934 rows; unpaged read: 2 936.
- The two missing rows: `atome_type: 'contact'` in `atomes`, no `type` in their properties
  (their event did carry `props.type: 'contact'`). The 2 934 others came from the server
  with `properties.type`.

## Root cause

The commit keeps the type in the envelope: `atome-store` `canonical::sanitize_properties`
drops the reserved keys (`type`, `atome_type`, …) from `state_current.properties`, as
Fastify's `sanitizeAtomeProperties` does. The local server's cursor read
(`atome/servers/atome-server/src/local/local_atome_state_current_list.rs`) matched only
`json_extract(properties, '$.type' | '$.kind')`, so every atome made on this device was
outside its own type's walk.

## Correction

The cursor read walks the envelope: `FROM atomes a JOIN state_current sc … WHERE
LOWER(COALESCE(a.atome_type, '')) = ? AND a.rowid > ? ORDER BY a.rowid` — one range seek
on `idx_atomes_type_lower` (3 ms a page of 250 among 15 000 rows on a Mac, against 40 ms for a
union adding the envelope to the two property indexes). The cursor is now the `atomes` rowid.

## Regression checks

- `local_atome_state_current_list_tests.rs#a_whole_typed_read_walks_the_type_from_a_cursor_each_row_once`:
  half of the rows carry no type in their properties.
- iPad: Carnet › phone row opens the new card; Créer › the contact shows in the Carnet.

## Acceptance

Every row of a type is listed once by the cursor read, wherever it was made.
