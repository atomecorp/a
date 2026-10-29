# Dashboard footer drawn but not touchable on a wide screen (iPad, desktop)

## Symptom

On the iPad (1408×970) or any screen wider than the home's tiles, the
Dashboard's bottom line shows, but Back, the bottom field (« Rechercher »,
« Adresse ou recherche ») and the docked Atom do not react to a touch or a
click. The band tools above them still work. On a phone it does not show:
there the frame is almost as wide as the screen.

## Evidence (2026-10-28)

On the iPad « Jeezs's Tab », WDA taps reached the canvas at the right point
(`pointerdown` on `CANVAS`), but `eveBevyUiRuntime.hitTestAtClientPoint`
returned `null` at (52, 918) and (300, 918). The path to `…_dashboard_eve_search_back`
goes through `…_dashboard_eve_scroll` (`scroll_area`, `overflow: scroll_y`,
position 516, width 376, `clip_margin [526,18,526,18]`), and the footer slot
lies at `position [-508, 882]`, outside that scroll area's own box.

## Root cause

`dashboard_mystic_geometry.js#layoutFrame` lays the footer across the whole
room, past the centred frame of the tiles, and lets it paint there through
`paintMargin` → `clip_margin` (`matrix_template_runtime.js`). The renderer
honoured `clip_margin`, but `bevy_ui_hit_test_runtime.js#hitTestBevyUiNode`
rejected every point outside a clipping node's own box. So what showed past
the frame could not be touched.

## Fix

`hitTestBevyUiNode` clips with `overflowClipForNode` (`bevy_ui_layout_runtime.js`),
which is the node's box widened by its `clip_margin`. A clipping node's
descendants answer to a touch where they are painted. The node itself still
answers only in its own box.

## Regression check

`hitTestAtClientPoint` at the footer's Back on a 1408×970 surface returns
`…_search_back`. On the iPad, touching the Web list's field puts the caret
in it, and Back leaves Web, then Média.
`temp/web/web_ui.probe.mjs` (phone) stays ALL PASS.
