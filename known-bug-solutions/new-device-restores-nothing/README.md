# A new device (or a reinstalled browser) restores nothing; re-imports duplicate contacts

## Symptom

2026-10-12 (user report): after reinstalling, projects come back but appointments,
contacts and the profile photo do not; an accidental re-import from the iPhone
must not duplicate contacts.

## Evidence

`temp/dashboard_fix/restore_new_device.probe.mjs` (isolated Fastify): device 1
creates a project, a contact, an appointment and a profile photo; the server
vault holds all of them (`project 2, calendar_event 1, contact 1, user 1`).
A fresh browser on the same number received 550 sync events yet restored
nothing — not even the project — and ran the first launch again.

## Root causes

1. Web: `browser_workspace.synchronizeBrowserWorkspace` imports
   `state-current list`, which the server serves in the canonical projected
   shape (`id`, `type`, `meta.owner_id`, `meta.project_id`).
   `guest_workspace_store.importWorkspaceStates` filtered on a flat `owner_id`
   and dropped every row.
2. Native imports (contacts, calendars) were keyed by the WebView surface id,
   which changes on reinstall: re-imports created new origins, hence duplicates
   (contacts fixed earlier the same day in
   `known-bug-solutions/contacts-import-interrupted-and-duplicated`; calendars
   kept the device key).
3. No business identity: the same person seen under another native id (other
   device, other book, manual card) became a second card.

## Correction

- Web import flattens each state with the canonical `mapStateCurrentToAtome`
  (id, type, owner, project, parent) and derives `deleted_at` from `__deleted`.
- `canonical_import` accepts `identityKeys` / `mergeIntoExisting`: an observation
  without origin that shares a key with a live record is merged into it
  (existing values win, lists are united). Contacts: E.164 numbers through
  `contactBookPhone`; a card created by an import takes the source's photo
  fields, a hand-made card keeps its own photo. Native calendar events: series +
  start; the native calendar key is stable (`native_calendar`) with adoption of
  the former `native_calendar/<surface>` origins.

## Existing duplicates (merge on request, 12 Oct. 2026)

The phone identity only prevents NEW copies: cards duplicated before it stay in
the book (the Dashboard shows one tile per person, the Contacts panel shows
them all). They are merged only when the user asks — Contacts › Import/export ›
« Fusionner les doublons », or the tool `contacts.merge_duplicates` — never by an
import or at boot. Owner: `mergeDuplicates()` in
`atome/src/squirrel/contacts/local_source.js`. Cards sharing an E.164 number
(transitively) form a group; the hand-made card is kept, else the one with a
photo, else the most complete; it receives the others' missing values (photo
whole, numbers deduplicated); the others are deleted through `Atome.commit`
`delete` (restorable with `restore`); their import origins and group
memberships move to the kept card, so the next import updates it. A deleted
favorite's heart moves to the kept card
(`eVe/intuition/tools/contact_favorites_preference.js`, on the
`eve:people-directory-updated` `merge` event).

Rejected: merging automatically on import/boot (a merge deletes cards: it must
be the user's decision); suppressing the merged cards' origins like
`removeFormerImportCopies` does (the native record would stop updating the
kept card).

## Regression checks

- `temp/dashboard_fix/restore_new_device.probe.mjs` — 5/5 (failed 4/5 before).
- `temp/dashboard_fix/import_dedupe_phone.probe.mjs` — 8/8.
- `temp/contacts_ios_2026-10-12/import_resume.probe.mjs` — 12/12 (expectations
  moved to the phone rule: a hand-made card with the same number absorbs the
  book card).
- `temp/contacts_merge/merge_duplicates.probe.mjs` — 22/22 (merge, three
  spellings of one number, heart moved, card without number untouched, group
  membership, re-import updates the kept card, restore).
- `temp/contacts_merge/merge_duplicates_real_app.probe.mjs` — real app, real
  click on « Fusionner les doublons ».

## To verify

Physical iPhone reinstall (Swift sync path persists remote events directly; the
profile photo is inline in the user Atome; contact photos are local Swift files
re-uploaded by the next import); `0xDEAD10CC` kills of the iOS app holding
`adole.db` while suspended are not addressed (imports now resume instead).
