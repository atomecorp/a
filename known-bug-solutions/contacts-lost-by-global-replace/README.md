# Many contacts are missing and never come back; photos missing

## Symptom

2026-10-11 (user report): the contact list is "totally incomplete" and many
people have no photo.

## Root causes

1. `atome/src/squirrel/contacts/local_source.js` implemented `updateContact` and
   `deleteContact` with `store.replace(cache)`: `canonical_import.js::replace`
   deletes **and marks `suppressed`** every stored contact absent from the cache.
   A stale or partially paged cache therefore deleted contacts in bulk, and
   `collect` skipped any suppressed/deleted origin on every later import.
2. One invalid photo (`persistContactPhoto` throws) cancelled the whole import,
   so the cursor never advanced and the 5-minute retry failed identically.
   vCard photos produced `data:image/image/jpeg` and kept folded base64.
3. macOS declared every non-PNG thumbnail as JPEG (Contacts often stores TIFF):
   undecodable image. Photos over 512 KB were dropped instead of resized; only
   the thumbnail key was read.
4. A native record without identifier made the whole snapshot fail.
5. iOS 18 limited access was reported as `authorized`.
6. The public directory read stopped at its first 500 entries.

## Correction

- `canonical_import.update(id, input)` / `remove(id, { reason })`: single-record
  writes; `suppress` and `replace` record `suppressed_reason`. Only
  `user_delete` blocks a re-import.
- One-time recovery: `createImportLifecycle({ recoveryVersion })` runs a full
  import without cursor and with `restore_suppressed: true`; `collect` then
  restores (`restore` event) the records a global rewrite removed. Contacts use
  `contacts_replace_loss_2026_10`.
- Photo errors are per contact (imported without photo, warning logged); vCard
  MIME / base64 normalized; native photos re-encoded to JPEG ≤ 256 px on iOS and
  macOS, with the full image as fallback when no thumbnail exists.
- Records without identifier are skipped alone. iOS reports `limited`; a manual
  import then shows the notice and opens the app's Settings page.
- Avatars fall back to the silhouette when the photo URL fails
  (`image.fallback` in `bevy_ui_image_runtime.js`).
- Directory read is paged (500 × up to 20).

## Regression checks

- `temp/dashboard_fix/contacts_store_no_mass_loss.probe.mjs` (real local source
  over an in-memory Atome store): partial-cache rewrite loses 3 contacts; a
  unit edit loses none; recovery restores the 3 but not the user-deleted one;
  an invalid photo no longer cancels the import.
- `temp/dashboard_fix/avatar_image_fallback.probe.mjs`.

## To verify

Native snapshot on a real iPhone/Mac: imported count equals the address book,
photos present, limited-access notice (needs a device; not run).
