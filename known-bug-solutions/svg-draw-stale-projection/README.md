# SVG drawing retains its initial segment

Confirmed in Chromium/WebGPU on 2026-09-08.

During Draw, the source bounds grew to 333 x 304 while the projected SVG still
contained its initial two points and 23 x 21 viewBox. Stretching that initial
segment, compounded by the default blue shape tint, produced a blue block.

The realtime event owner treated every locally applied property update as a
direct transform. Geometry had a fast projection path; SVG content did not.
`realtime_atome_events_runtime.js` now uses the shared direct-transform property
classifier: local content mutations still reach the canonical scene projection,
while transform-only updates and duplicate DOM echoes remain deduplicated.
Draw uses a neutral shape tint; the stroke owns its authored color.

Regression: `tests/eve/project_scene_gesture_performance.test.mjs`.
Web sequence: open Create > Draw, draw a multi-segment stroke, inspect it during
and after the gesture, choose a flat brush, adjust Size and contextual Opacity,
draw again, close Create and verify Draw stops. Evidence and inspected pixels:
`temp/probe_reports/molecule_eve_ui_acceptance/draw_settings_v3/`.

This evidence covers Natural drawing. Structured-view drawing and vector-point
editing require their own Web acceptance.

A second structured-only failure was confirmed by draw_structured_creation_v1/v2: the empty draft inherited primitive blue, and the live visual-only update was overwritten by stale List/Matrix content during render. Use transparent #ffffff00 for an empty draft and neutral #ffffff for real SVG geometry. The existing visual-changed event now updates the content record before rendering. draw_live_projection_fixed_v5 passes nine Web checks; inspected held-pointer Matrix pixels show the stroke before release.
