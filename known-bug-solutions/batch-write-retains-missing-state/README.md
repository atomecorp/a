# Successful batch writes still read as absent

## Reproduction and confirmed owner

In the real Web Programme/Nutrition collector, type a manual answer and press
Save. The command reports success, but its next read returns a missing question,
empty value and no purpose grant. The editor consequently appears empty. Calling
the same declared command or its canonical Programme owner reproduces the result;
pointer timing and tool registration are not the failing boundary.

`eVe/core/atome_commit_fetch.js#fetchStateCurrent` remembers an absent ID through
`atome_commit_backend.js`'s existing negative cache. Collection intentionally
checks for previous preference/grant records before creating them. Single
`atome_commit.js#commit` clears that absence after a successful write; `commitBatch`
did not. The preference and grant were committed to the canonical browser
workspace, but subsequent canonical reads used the previous cached absence.
No WebSocket write is expected for the local browser workspace authority.

## Canonical correction

After confirmed batch transport/storage success, `commitBatch` clears remembered
absence for every written Atome ID, before optional state refresh. This also
applies when `refreshState:false`; failed writes do not claim new state. The
existing commit/event/cache owners remain unchanged. No UI workaround, delayed
retry, direct database read, second mutation route or new cache is introduced.

## Evidence

- `tests/eve/guest_profile.test.mjs`, "invalidates known absence for every successful
  batch write, including when refresh is disabled": real fake-indexeddb storage
  and the canonical commit/read pipeline, two absent IDs, both refresh modes,
  exact stored/read values, and no cloud request. Removing invalidation makes the
  canonical reads remain null despite the records existing in storage.
- The companion "keeps remembered absence when a batch is refused before storage"
  regression verifies actor rejection, no created record and preserved absence.
- Final six focused suites pass 106/106, including Nutrition, collection, Programme,
  configuration, sessions and guest-profile regression.
- The final responsive public Web replay is ok:true in
  temp/atm2017/nutrition-final-report.json, including revocation/reallow and reload.
  Its one startup HTTP premature close predates the health scenario; no browser
  error/warning or health-scenario server error is recorded.
- `temp/atm2017/nutrition-preference-first-owner-diagnostic.json` and the later
  narrow diagnostic preserve failing native/gateway/owner comparisons.
- `temp/atm2017/nutrition-final-fixed-desktop-evidence.json` confirms the actual
  native public Programme flow, preference Save/read, refusal/resume/reload and
  unchanged meal/consumption facts after the source correction. Browser warnings/
  errors and newly recorded Fastify errors are empty in that run.

## Acceptance limits

The shared JavaScript owner is corrected and Web is exercised. Tauri, physical
iOS and cloud-delivery acceptance are not run for this issue. Their next check
is the same absent-read -> batch create -> immediate canonical read sequence,
followed by a real collector Save/reopen. History-command/cache behavior outside
this batch path is not qualified by this fix.
