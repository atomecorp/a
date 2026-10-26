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

## 2026-10-26 — passwords, keys and settings after a recovery

### Symptom

User request: every setting, token, password and API key, the name and the
photo must come back when the account is recovered, paired on another device
or opened after losing every device.

### Root causes

1. `Squirrel.security` sealed the mail password, saved logins, CardDAV/CalDAV
   logins, the Anthropic/Mistral/Google/DeepSeek keys and the wake verifier in
   localStorage with a random key kept beside them
   (`squirrel.home.device_key.<user>`): no other device could ever read them.
2. Settings kept in localStorage only: the daily AI budget
   (`eve_ai_quota_tracker_v1:<user>`), accepted and hand-typed people
   (`eve_comm_relationship_accept_v1`, `eve_comm_manual_recipients_v1`, shared
   by every account of the device), the text tool presets (`eve.tool_presets.v1`).
3. Tauri/iOS: signing in creates a bare local user record (`bind()`), which
   `loadUserProfile` took for the profile; the first launch then saved defaults
   (and any preference writer an empty identity) over the account, newer than
   the cloud's profile, so they won everywhere.
4. Web restore paged `state-current list` by offset over the newest change
   first: a state changed during the walk slipped between two pages.
5. Mail: the device's copy of the settings (not per account) won over the
   account's `preferences.mail`.

### Correction

1. `Squirrel.security` stores in the principal's server vault
   (`createAccountSecretVault`, `ai-provider` `secret.*`); an earlier version's
   sealed entries move there once (`device_secret_transfer.js`).
2. `preferences.assistant.ai_budget_tokens_per_day`,
   `preferences.relationships.*`, `preferences.tools.text`; device values move
   once (`device_settings_transfer.js`), the account's value wins.
3. `requireAccountProfileHere`: on a native device, while the cloud holds a
   profile not yet received, the profile is "not available locally" for reads
   and writes; first launch waits for it (reads coalesced during the replay).
   Initialising the first launch keeps a level already chosen.
4. Keyset walk oldest change first (`order: 'oldest'`, `after`).
5. Account settings merged last.

Not moved, by nature: session/device keys, sync cursors, the server choice
(needed before signing in), camera/microphone permission cache, where eVe
Basic was left on this device, the assistant's learned memory and proactive
state (no user-facing setter; learned, not set).

### Regression checks

- `temp/account_restore/account_restore.probe.mjs` — 20/20 (real Web app,
  recovery code on a fresh browser: identity, photo, level, handedness,
  language, mail settings + password, saved logins, Anthropic key, AI budget,
  text presets, people, project, contact, appointment, 300 objects over two
  restore pages; nothing secret left on either device).
- `temp/account_restore/secret_vault_ws.probe.mjs` — 8/8 (sealed on disk,
  another device reads, another account cannot, ids only in a list).
- `temp/account_restore/native_profile_guard.probe.mjs` — 7/7 (guard on its
  real code; the Tauri/iOS app itself was not run).

