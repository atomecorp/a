# A scroll refresh projects an older tree after a newer one

## Symptom

A list over the home (Spectacles, any `dashboard_stage_list.js` list): a row touched
brings its picture on top, but the rows stay where they were, over the picture, and
the tools band under the picture is hidden. Moving the pointer, or any later repaint,
puts everything right. Lists that repaint every second (a video's progress) hid it.

## Cause

The touch lands on the rows' `scroll_area`; the scroll runtime then schedules its own
refresh (`createBevyUiScrollRuntime` → `refreshTree`, on the next animation frame).
`refreshTree` (`eVe/domains/rendering/bevy_ui_runtime.js`) projected
`state.sourceTrees.get(treeId)` at once, without waiting for the tree update already in
flight (the list's new layout, hydrating its picture). It read the OLD source tree,
and its projection landed after the new one: the rows' records went back to their old
place (direct transform path) while the new picture stayed.

Measured on 26 Oct. 2026 (`temp/shows/current_frame.probe.mjs`): the source tree held
the rows at y = 320 in the stage while the projected scroll thumb stayed at y = 175;
painting twice, or one pointer move, gave y = 495.

## Fix

`refreshTree` joins the tree's render queue (`state.renderQueues`): it waits for the
update in flight, then projects the tree installed, and a later update waits for it.

## Regression

- `temp/shows/current_frame.probe.mjs`: projected thumb at the rows' new place right
  after the touch, screenshot `a_after_touch.png` with the band shown.
- `temp/shows/shows_ui.probe.mjs` (« under the picture: the rows start below it »).
- `temp/video_lists/video_ui.probe.mjs` (scrolling, next page) stays 20/20.

## Acceptance

Touch a row of a list without moving the pointer afterwards: the picture on top, its
band under it, the rows below, at once.
