# A menu swipe or a slow exploration opens a tool; the grown tool is cut at the bar's edge

## Symptom

2026-11-02 (user report, three menus: contextual rail, project ribbon, main ribbon): a quick swipe along the bar opens a
tool or a palette at the release (reproduced: the ribbon's Créer palette) instead of scrolling; a slow exploration
scrolls the bar instead of growing the tool under the finger, and its release runs the grown tool; the next real tap on
a tool after a swipe is swallowed; a press that stops a gliding rail runs the tool under it; the tool grown at the bar's
end is cut by the ribbon's fixed block (Organize).

## Root causes

1. `bevy_ui_pointer_runtime.js` decided the lens on the first travel by direction only: no speed, so a swipe browsed
   like an exploration; before the decision the ribbon already scrolled (stale lens geometry).
2. `bevy_ui_pointer_reveal_runtime.js#releaseLens` ran the grown tool on any release over it (BUG-053/054/055 rule).
3. `bevy_ui_main_menu_scroll_runtime.js` kept `suppressActivateNodeId` after a swipe whose release emitted no
   activation: the next tap on that tool was consumed.
4. `bevy_ui_scroll_runtime.js#begin` cancelled a glide silently: the press's release was a tap.
5. `solveLinearLensLayout` had no bounds on a scrolling bar: the grown tool stayed centred and the band's clip cut it;
   the fixed block's tools were in the browsed row and were pushed under the Atome.

## Correction

`decideLens` (speed `LENS_FLING_PX_PER_MS` from the press, nothing before the hold tolerance; a swipe on a bar that
scrolls scrolls it, its generic scroll begun there), `releaseLens` runs nothing after a travel, `catchGlide` marks a
press that stops a glide (no tap), the ribbon's press resets its suppression (and a press while it snaps is no tap),
`solveLinearLensLayout({ viewport })` keeps the grown tool inside the visible span, `collectLensLayout` leaves the fixed
block out of a scrolling row.

## Regression checks

- `tests/eve/menu_swipe_explore_tap.test.mjs` (real pointer runtime; 5 of 6 red on the old code).
- Real app: `temp/swipe_r110/menu.probe.mjs` (ribbon, 3 of 7 red on the old code), `temp/swipe_r110/rail.probe.mjs`.
- A probe counting command-bus events must count by `seq` (`listEvents({ fromSeq })`): the bus log is bounded, its
  length stays constant once full and a filtered count then « sees » old commands.
