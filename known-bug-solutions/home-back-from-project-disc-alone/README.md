# eVe home back from a project: the disc alone in the centre, the app looks frozen

## Symptom

Reported on Android (Galaxy A23) on 2026-10-27: after leaving a project (Organiser,
the dashboard tool of the ribbon), the home shows the eVe disc alone, large, in the
centre; no tile; a touch beside it does nothing. The app looks blocked (a touch on
the disc itself brings the tiles back, but nothing invites it).

## Root cause (confirmed 2026-10-27, on the device)

`dashboard_home_style.js#takeDashboardEveEntry` stores a launch's first arrival with
the default mode `solo`. `dashboard_home_return.js#takeDashboardHomeArrival` then
decides `grid` when eVe was left asleep (or for a guest), but nothing remembered that
decision: `dashboard_eve_atom.js` told `onMode` (→ `rememberDashboardEveMode`) only
when the disc moved. The next arrival of the same launch (back from a project) read
`solo` without a greeting: the disc stayed alone, and `closeBeside` acts only while
the assistant is on screen. On the Web probes it passed because eVe was « never
seen » there: she arrived, then went to her corner, which remembered `grid`.

## Fix

`createDashboardEveAtom` tells `onMode` the mode it starts in, like any later one
(`eVe/domains/dashboard/dashboard_eve_atom.js`).

## Regression

`temp/android_bugs/return_timing.mjs` (device, CDP + real `adb input tap`): three
cycles Dernier projet → project → Organiser; the home must come back `grid`,
docked, each time. Before: `solo` after the first return. After: `grid` 3/3.
Web: `temp/android_bugs/project_return.probe.mjs`.

## Acceptance

Back from a project, the home is as it was left: its tiles, the disc in its corner.
