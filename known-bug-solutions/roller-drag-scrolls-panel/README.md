# A drag on a roller scrolls the panel instead of turning the roller

## Symptom

On a values zone that scrolls (Sport « Perso » card: Séries, Rép., Repos, Rythme; the medication sheet: Heure, Dose,
Max/jour; any date, time or alarm roller), a drag started on a roller often scrolls the whole zone and leaves the value
unchanged. A drag on its faded neighbours turns it; a drag on its pressed-in window, beside the value, does not.

## Confirmed cause

`bevy_ui_pointer_runtime.js` hands a drag to the scroll area only when the hit target does not own its drag
(`ownsDrag`), and that arbitration is right. The hole was in the roller itself: its window (`<id>_value`) was a plain
`row`, not an interactive kind, and the value field inside it (`number_input`) is only as wide as its text. A press
beside the value found no interactive node in the roller, so the hit test (`bevy_ui_hit_test_runtime.js`, deepest
interactive node) climbed to the `scroll_area` around it, which took the drag.

Proof (before the fix): `temp/d18_rollers/rollers.probe.mjs` — every drag at the window's margins hit
`…_card_body` / `health_record_body` (`scroll_area`), scrolled the zone and left the value unchanged (28 of 28, mouse and touch).

## Durable correction

`eVe/intuition/runtime/bevy_panel/bevy_panel_numeric_field.js#numericRollerFieldNode`: the window is a
`pointer_capture` node (same size, same selected surface, `flex_direction: 'row'`) carrying the roller's
press / drag / release / cancel and its double touch, as its neighbours do. Every roller goes through this brick
(`createNumericFieldRuntime` `presentation: 'roller'`, the choice, calendar and clock rollers, the contextual rail roller).

General rule: a control that owns its drag must cover its whole visible surface with drag-owning nodes; an inert
`row` / `column` / `panel` gap inside it lets the drag fall through to the scroll area.

## Regression checks

- `PROBE_PREBUILT_SERVER=1 node temp/d18_rollers/rollers.probe.mjs after` — 72/72: each roller's neighbours, window
  centre and window margins (mouse and touch) change its value with the zone's offset unchanged; the ground between
  rollers, a roller's name, the row beside a roller and a sheet's label scroll the zone; a double touch beside the value
  opens the typing.
