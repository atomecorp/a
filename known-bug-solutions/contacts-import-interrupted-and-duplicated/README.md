# Native contacts import never finishes, then duplicates after a reinstall

## Symptom

2026-10-12, user's iPhone 17 Pro: 85 of 953 address-book contacts imported;
after the app was reinstalled a new import produced a second copy of many
people (1040 live contacts for 953 in the book), photos 404.

## Root causes

1. `canonical_import.capture().check` compared `session.updatedAt`. On iOS and
   Tauri `ensureLocalSession` renews the local token of the same account every
   840 s (`installLocal → setSessionState`, new `updatedAt`): every import longer
   than 14 min ended in `import_session_changed`. The same renewal dispatches
   `squirrel:user-logged-in`, and `import_lifecycle` stopped (aborted) every
   collector on it.
2. The native contacts key was `macos_contacts/<squirrel.surface_id>`; the
   surface id lives in WebView `localStorage` and changes on reinstall. A new key
   means new origin ids, hence a complete second copy of the book, and the
   previous checkpoint is never resumed.
3. Former origins cannot be found again by recomputing their id: the ones
   written before the identity migration were hashed with the local owner id
   (0/157 match on the device).
4. A photo whose upload failed was stored without photo while the cursor
   advanced: a delta never retried it. A media record whose file is gone (iOS
   keeps files on the local Swift server only) kept its dead URL.

## Correction

- `capture().check` compares identity only (mode + `user.id`);
  `readMediaAssetBytes` likewise. `import_lifecycle` ignores a
  `squirrel:user-logged-in` for the account its collectors already run for.
- Contacts key is stable: `macos_contacts` (account-scoped through the origin
  hash). The lifecycle passes `legacy_source_prefix: 'macos_contacts/'`;
  `canonical_import` adopts an origin of a former key **by external identity**
  (`source_collection`, `external_id`, `recurrence_id`), preferring a live
  record. `resume` moves an enabled checkpoint of a former key to the current
  one (no cursor: one full read), disabling the former row.
- After a full, complete snapshot with that prefix, `local_source` removes
  (soft, restorable, origins `suppressed_reason: 'import_duplicate'`) records of
  the `macos_contacts/*` family that the book no longer reaches and that carry
  the native id or the exact name/phones/emails of a reached record. Records with
  another source, current-key records, namesakes with other numbers and
  hand-made contacts (non-reserved ids) are never touched.
- A transient photo failure keeps the cursor (`complete: false`): the next
  cycle re-reads the same changes. `contact_photo_payload_invalid` /
  `contact_photo_owner_invalid` are permanent and do not hold it. An existing
  photo media is read back (`readMediaAssetBytes`); a missing file is uploaded
  again.
- Progress is the origins themselves (reservation before the record): a
  resumed full read writes nothing for contacts already done.

## Rejected hypotheses

- A periodic progress cursor: the native history token covers the whole book;
  saving it mid-run would skip unread contacts. Idempotent re-reading is the
  checkpoint.
- Recomputing former origin ids with the current owner (first attempt): misses
  every pre-migration origin.

## Regression checks

- `temp/contacts_ios_2026-10-12/import_resume.probe.mjs` (real bootstrap,
  session, lifecycle, local source, upload on fake-indexeddb): interrupted run
  then resumed boot, 5 same-account renewals mid-run (≤ 2 full reads; 6 without
  the login guard), former checkpoint migrated, former copies removed with
  namesake/manual kept, groups kept, photo retried and readable, reinstall
  re-read with zero contact/image writes. Against `HEAD` it fails 10/11 checks.
- `temp/dashboard_fix/contacts_store_no_mass_loss.probe.mjs` still passes.
