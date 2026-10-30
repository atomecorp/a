# A panel or a home level shows nothing (or « Chargement… ») offline or when the network does not answer

## Symptom

Offline, or on a network that accepts the connection but never answers, a panel or a
Dashboard level opens empty or stays loading although its data is on the device:
Médiathèque types (Web), Contacts rubric (signed-in account), the home tiles (next
appointment, monitors), Divertissement (TV, Spotify/Deezer states), the Contact panel,
the Home/Settings panel, the Sommeil page, a conversation header. On iOS the very
first touch after launch took ~1 s before the grid moved.

## Cause

1. Local data read **after** a network read in the same chain (`await network; await local`)
   or joined with it (`Promise.all([network, local])`): the local answer waited for the
   server. Examples: `collectPeopleDirectory` (directory + book), `list_user_media_files`
   (`/api/uploads` then the takes), the home `load()` (calendar + monitors + directory),
   `funItems` (TV catalogue + music provider states), the Contacts source (community feed,
   which also threw offline).
2. Unbounded `fetch` (media list, weather): a silent server kept the read pending forever.
3. Sequential prefetch: one rubric stuck on the network left every later rubric uncached.
4. iOS first touch: the tool catalogue refresh bound to `window` `focus` re-built ~650
   definitions and re-read ~650 records in one block (0.6 s + 0.4 s on an A12Z).

## Fix (2026-10-21)

- `eVe/intuition/runtime/local_first_read.js#readLocalFirst`: the local read is returned,
  the network read is handed to `update` afterwards; consumers: Mystic `loadChildren({ update })`,
  Dashboard rubric sources (`dashboard_mystic_rubric_reads.js`), Finder sources `load({ scope, update })`.
- People directory owner `contact_public_directory.js`; `collectPeopleDirectory({ local })`,
  `findPersonById` (book first, server only for someone unknown).
- `list_user_media_files`: both sources read together, wave per source, `local: true`,
  server read bounded 10 s; no `auth_required` on Web for the device's takes.
- Network-only data never blocks a display: Home `getPreferences`, Privacy rules, Sommeil
  circle posts, Communication sync, weather (bounded 10 s).
- Tool catalogue refresh: slices of 6, unchanged entries skipped (`TOOL_CANONICAL_PERSISTED`,
  `TOOL_CATALOG_RECORD_VERSIONS`).

## Follow-up 2026-10-23: the network answer arrived but the Mystic level never showed it

Symptom: a lazy Mystic level (« Mes vidéos », « Mes sons ») kept its first (local) answer forever,
although `update(children)` was called with the server's list.

Cause (`eVe/intuition/ribbon/bevy_ui_mystic_activation.js`): `refreshChildren` compared the surface
epoch captured BEFORE the level opened; the level's own opening turn renders animated and bumps
`state.surfaceEpoch`, so every later refresh was dropped. Second cause: the post-opening
`stale.then(children => …)` delivered the first read's (older) answer after a network refresh had
already landed, overwriting it.

Fix: `refreshChildren(item, children, context)` checks the level on top, the context and the phase
(a running turn is waited for), no epoch; after opening, the level shows `item.children` (the
latest), never the first read's value. Probe `temp/media_library/library_fix.probe.mjs`
(« Mes vidéos opens at once and lists the stored video »).

## Follow-up 2026-10-30: a touch took minutes (Courses, BUG-041) — reads queued behind writes

Symptom: a tap on a shopping tile, a profile change or a calendar programme left the screen frozen for
seconds to minutes on a slow network.

Cause: domain runtimes with one serial queue carrying reads and writes, each write re-reading the whole
list, each own commit reloading (`atome:changed`) and queueing more reads; reload loops coalesced only the
local half of `readLocalFirst`, so one network read (10 s timeout) stacked per change.

Fix: `local_first_read.js#createLocalFirstReload` (latest-wins over both phases, at most one network read
in flight; an older answer never covers a newer one) and `createLatestRead` (one read at a time). Reads leave
the change queues (life profiles), writes patch the data held in memory (life profiles, books, effect assets),
concurrent asks share one pass (effect assets), the home's data load is coalesced. Harness
`temp/bugs_2026-10-30/lotI/timing.mjs` (before/after), probe `temp/bugs_2026-10-30/lotI/reads.probe.mjs`.

## Regression check

- Mechanism: `node temp/offline_panels_2026-10-21/local_first.probe.mjs` (21 checks, real modules,
  silent network).
- Device: iPad in airplane mode, `temp/offline_panels_2026-10-21/drive.sh` + `obs_*.js` (tap → content),
  `panels2.js` (panel mount times), `hang_install.js` (directory read that never answers).

## Acceptance

Every home rubric, sub-level and panel shows its local content in < 1 s offline and with a
server that never answers; the network content replaces it in place when it lands.
