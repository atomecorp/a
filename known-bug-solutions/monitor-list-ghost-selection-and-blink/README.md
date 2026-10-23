# Monitor list: several sensors selected without asking, rows blinking

## Symptom

In the eVe home's monitor (« capteurs ») list, touching one sensor sometimes ticks several, or a sensor
unticked comes back ticked; some rows blink now and then, the home behind them too.

## Causes (2026-10-23)

1. **A scroll that starts on the checkbox column swept.** A checkbox owns its drag
   (`bevy_ui_pointer_runtime.js#ownsDrag`): the list never scrolled from it and every move swept the rows
   crossed (`bevy_panel_list_selection.js#drag`), the press itself toggling the first.
2. **An older selection was put back.** `background.js#loadPreferencesFromProfile` only treated a profile
   read as outdated when the wallpaper changed, so a read started before a tap applied the old
   `health_monitors`; the save of tap N (and its synchronized echo) re-published after tap N+1 and
   `dashboard_health_modules.js#onPreferences` adopted it — the next tap then toggled from a stale list.
3. **Redraws for nothing.** Every health poll (60 s) notified with an identical reading, rebuilding the whole
   home and the whole list; `persistDashboardPreference` published the same preferences twice per tap.

## Fix

- `eVe/domains/rendering/bevy_ui_pointer_touch_sweep.js`: on touch, a checkbox's press waits — quick travel
  that scrolls = scroll (no press, nothing toggles), still 250 ms = sweep, lift = tap, a list that cannot
  scroll sweeps at once. Mouse unchanged.
- `background.js`: every `eve:profile-preferences-updated` bumps the read revision (a read in flight only
  fills missing keys); `dashboard_health_modules.js` ignores publications while its saves are pending.
- `dashboard_health_modules.js#shownOf`: a reading redraws only when what a row shows changes;
  `dashboard_weather_preferences.js#publishPreferences` skips an identical publication.

## Regression

`node temp/corrections_2026-10-23/logic.probe.mjs` (touch gate 5/5); real app
`temp/corrections_2026-10-23/monitors.probe.mjs`. Acceptance on a phone: scroll the list starting on the
checkboxes — nothing ticks; tap quickly several rows — each ends as tapped, no row blinks.
