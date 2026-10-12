# Dashboard rows (contacts, appointments, health) vanish and come back at boot

## Symptom

2026-10-11 (user report): right after launch the Dashboard "flickers" — the
Contacts and Appointments rows disappear and reappear, and the health tiles of
the Monitor row toggle between "Association requise" and "Lecture…".

## Root causes

1. `eVe/domains/dashboard/dashboard_data_controller.js::ensureItemsSession`
   compared the session **object**. `setSessionState` builds a new object on
   every reconnection / token renewal of the same account, so every lane and
   cache was cleared.
2. A category-scoped `invalidateCache({ categoryIds, reset: false })` (sync
   `projection-ready`, contact population, preference publications) deleted the
   visible items before the reload; any render in between painted the row empty.
3. `seedVisibleItemsFromCache(..., emptyMissing)` (environment watcher, forced on
   every `eve:profile-preferences-updated`) wrote `[]` for a row whose cache had
   just been invalidated.
4. Contacts reloaded on every preference publication (a dozen at boot), not only
   when `preferences.contacts.favorites` changed.
5. `atome/src/squirrel/health/health_owner.js` published `needs_link`
   (« Association requise ») before the auth answer, then `loading` again on
   login, and a failed link-status read flipped a known value to `needs_link`.
6. The beginner program dashboard destroyed itself on every
   `squirrel:user-logged-in`, even for the same account.

## Correction

- Session identity = `user.id` (same account: nothing is cleared).
- Without `reset`, a scoped invalidation keeps the visible list until the reload
  replaces it in one go; seeding never empties an account row or a row of the
  same project.
- Contacts reload only when the favorites signature changes; calendar change
  bursts are debounced (400 ms) and a same-account login is ignored.
- Health: stays `loading` until `squirrel:auth-checked`; no `loading`
  re-notification for the same account; an unanswered link status keeps the
  last reading (`temporarily_unavailable` only when none exists).
- Beginner dashboard closes only when the actor changes.

## Regression checks

- `temp/dashboard_fix/dashboard_lanes_never_empty.probe.mjs` (Node, real
  controller): 350 samples, no row returns to 0 (the Monitor row did before).
- `temp/dashboard_fix/health_boot_states.probe.mjs`: no `needs_link` before the
  auth answer, no extra notification on a same-account login.
- `temp/dashboard_fix/dashboard_quick_contact_real_app.probe.mjs` step A (real
  app, isolated Fastify).
