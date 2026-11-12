# A list over the Dashboard moves when its band changes (ticks land a row away)

## Symptom

Captures › Audio / Vidéo (any panel on the Dashboard's stage, cover `wide`): the first
box ticked shifts the whole list down (about 60 px on a 430 px phone); the next touch
lands on another row (unticks the first one), and Suppr. then deletes the wrong rows or
nothing. At rest an empty strip lies between the list and its band.

## Cause

`eVe/domains/dashboard/dashboard_surface_tools.js#dashboardPanelFootHeight` counted the
band's rows on `panelFootBandRect(band).width`: the stage band less a padding on each
side, though the foot band is laid in the slab (`dashboardStageSlab`, the band widened
by that padding), i.e. at the band's own width. Six tools then counted as two rows (one
laid): the foot reserved a row too many at rest, and none once the band held three tools
(the choice band), so the panel's body, and its list, moved.

## Fix

The rows are counted at the band's width, as laid. (Before 12 Nov. 2026 the rest band of
a takes list also really held seven tools on two rows, Suppr. included; Suppr. is gone
from it.)

## Regression

- `tests/eve/dashboard_panel_foot_rows.test.mjs` (2 of 3 red before).
- `temp/list_scroll_2026-11-11/tick.probe.mjs`: the list window stays put after a box is
  ticked; two real taps tick two rows.
- `temp/list_scroll_2026-11-11/takes_scroll_delete.probe.mjs` (`SKIP_SCROLL=1`): two
  boxes tapped, Suppr. touched twice, both rows gone.

## Acceptance

Tick a row, then another: the list does not move, both are ticked, Suppr. twice deletes
both.
