# A Timeline clip moves only after it has been cropped

## Symptom

Dragging a clip in the Timeline view shows it moving, but on release it jumps
back. Once one of its edges has been cropped, the same drag works. Typical on a
project whose timeline was seeded from the List: its clips sit back to back.

## Confirmed cause

The kernel refuses any overlap on a track and never pushes another clip
(`eVe/intuition/tools/molecule/kernel/collisions.js`). The gesture
(`eVe/domains/rendering/project_view_timeline_gestures.js`) previewed the finger
position as is and committed `clip.move` there: next to a neighbour, every
target overlapped, the kernel refused it and nothing said so. Cropping opened a
gap, so short moves inside that gap succeeded.

Same family: a crop edge pulled into a neighbour was refused; the start edge of
a block-looped clip was computed on its source cycle, not on the span it plays,
and collapsed the clip to 0.01 s.

## Durable correction

- Kernel placement policy: `nearestFreeStart(clips, candidate, ignoreId, rate,
  { direction })` returns the free start nearest to the finger, past the
  neighbour in the direction of travel; `freeGapAround` gives how far an edge
  may travel. A block loop occupies its whole played span.
- The gesture previews and commits only those positions; edges stop at the
  neighbours and at the start of the source; a looped clip is handled by its
  span (start edge crops the cycle and keeps the span's end, end edge sets the
  span, below one cycle it unloops and crops).

## Regression checks

- `tests/eve/molecule_kernel_free_placement.test.mjs` (4/4).
- `PROBE_ISOLATED=1 HEADLESS=0 node temp/timeline/ux/timeline_user_acceptance.probe.mjs`:
  `back_to_back_clip_moves_past_its_neighbour`, `end_edge_stops_at_the_neighbour`,
  `looped_clip_start_crop_keeps_its_end`, `touch_moves_a_clip_and_seeks`.
