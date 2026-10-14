# Every tap is dead after media lands in a project that is not on screen

## Symptom

Web, 2026-10-13, Dashboard mystique. After an audio take from the home landed in
the last project, nothing answered any more: tiles, the search field and the
Mystic stayed silent until the home was reopened. It happened about one run in
two of `temp/dashboard_mystic/dashboard_mystic_v2.probe.mjs`.

## Evidence

- The home runtime was intact: `inspect()` showed it active, the stage idle,
  `openSequence` unchanged by the tap. The tap never reached the tile.
- Surface interceptor spies (top and bottom priority) saw no pointer phase.
- `document.elementFromPoint(x, y)` at the tile returned
  `project_view_<last project id>`, a DOM layer of the project the take went to.

## Root cause

`eVe/domains/media/rendering/project_media_atome_renderer.js::renderProjectMediaAtome`
calls `eveToolBase.ensureProjectLayer(projectId)` for the destination project.
For a project with no layer yet, `ensureProjectLayerElement` created a fixed,
full-view `div` (`pointer-events: auto`, no `display` state) above the canvas
of the project on screen. It swallowed every pointer.

## Correction

`eVe/intuition/runtime/tool_genesis_mount_runtime.js::ensureProjectLayer`:
when another project layer is active (`getActiveProjectLayerId()`) and this one
has no visibility state yet (`style.display` empty), the layer is created with
`display: none; pointer-events: none`. Only the visibility owner,
`project_layer_visibility_runtime.js::syncActiveProjectLayerVisibility`, shows
a project layer, when that project opens.

## Regression checks

- `HEADLESS=0 node temp/dashboard_mystic/dashboard_mystic_v2.probe.mjs`:
  37/37 on 9 consecutive runs (failed about one run in two before). Its
  failure-only diagnostic records `elementFromPoint`, a BevyUI hit test and
  interceptor spies at the Capture tile.
- Any media written into another project (capture from a template home,
  quick contact sends to a project) must leave `elementFromPoint` on the canvas.
