# Contact favorites lost between sessions; Dashboard rows reloaded on every visit

## Symptom

2026-10-12 (user report): favorite contacts are gone after a restart; the
Contacts row flickers, disappears, or arrives long after the rest of the
Dashboard; appointments, favorites and monitors reload every time the Dashboard
is shown; ticking one favorite showed the same person three or four times.

## Root causes

1. `bevy_panel_home_actions.js#normalizeHomeProfile` rebuilt `preferences` from a
   closed list without `contacts` (nor `tv`, `youtube`, `notifications`…). Every
   Home save (Me panel, own card) rewrote the profile without favorites, and
   mounting the card published preferences without them.
   `background_prefs.js` then wrote `{...stored, ...memory}` (stale memory won).
2. The Contacts row waited for the whole directory + local book + profile, and
   cached `[]` when preferences were not yet published; it reloaded on every
   import cycle and every profile save.
3. `calendar` had no in-memory cache and `open()` forced it to `loading`; the
   clock re-read it every minute while an appointment was running. The native
   calendar cursor restarted from 1970 on every cycle (about 60 pages, each one
   announcing `squirrel:import-updated`).
4. Duplicates on a heart: a favorite briefly matched any card with the same
   number (all duplicate cards became favorites).

## Correction

- Home: carries every preference it does not own; on save, the STORED value of
  those sections wins over the panel's copy. Background tool writes only its own
  section.
- Favorites are the ticked card id; the E.164 number is kept beside it as a
  fallback only when that card disappeared (`favoritePhonesWithoutCard`). The
  Dashboard row shows one tile per person.
- Dashboard data: contacts population memoized per account (a heart refilters
  without I/O), favorites wait (bounded) for published preferences, reads shared
  across a second open, unchanged reloads do not repaint, the snapshot survives
  an unresolved session; `calendar` is an account cache revalidated on real
  changes or every 15 min; `calendarNext({ overlap, filter })` keeps running
  appointments and filters before the limit.
- Imports announce only pages that wrote something; native calendar cursors
  (Swift, Objective-C) reread only the live window once history is complete.
- Health owner keeps the last reading (fresh 60 s) after its last subscriber.

## Regression checks

- `temp/dashboard_cache/dashboard_cache_real_app.probe.mjs` (HEADLESS=0) — 21/21.
- `temp/dashboard_cache/import_notify_once.probe.mjs` — 5/5.
- `temp/dashboard_cache/transition_frames.probe.mjs` — see
  `known-bug-solutions/dashboard-transition-jump`.
