# BevyUI: a child reaching outside its rounded parent is painted wrongly

## Symptom

A node partly outside a parent that clips with rounded corners (`overflow: 'hidden'` +
`radius`) shows, at random from one run to the next, a soft blurred end or a dull, darkened
colour, as if half transparent. Identical nodes side by side differ; a repaint does not fix it.
Seen on 26 Oct. 2026 on the slider gauges' slab (`bevy_ui_slider_gauge.js`), which then slid
inside its ground and overhung it.

## What is established (26 Oct. 2026)

- The projected records are right: z order, colour, gradient, clip rect
  (`PROJECT_SCENES` → `runtime.records`, probe `temp/slider_redesign/records.probe.mjs`).
- Same result with the renderer of HEAD (`git show HEAD:atome/src/wasm/...`, served by
  `temp/slider_redesign/with_wasm.mjs`): not the renderer work in progress that day.
- A child with rounded clip rects goes through the polygon cut
  (`atome/renderers/bevy-core/src/clip.rs#apply_entity_clip` → `apply_polygon_clip`); a
  child fully inside its parent (`whole`) or cut by a plain rectangle does not.
- The defect disappears as soon as no child overhangs its rounded parent.

The root cause inside the polygon cut is not located yet.

## Fix applied

Never let a painted child overhang a rounded clip: lay it at its visible size
(`sliderSlabRect`). Where a cut is really needed, cut with a plain rectangle (no `radius`
on the clipping node) and round the child itself (the colour scales' window).

## Regression / acceptance

- `temp/slider_redesign/repaint.probe.mjs` (TAG=…): twelve gauges, before and after a
  repaint; every slab sharp, the mixer fader in its lane colour.
