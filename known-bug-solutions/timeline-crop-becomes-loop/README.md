# Shrinking a clip by its end loops it instead of cropping

## Symptom

Dragging a Timeline clip's end edge inward on a take whose source length is
unknown turns it into a loop.

## Confirmed cause

`project_view_timeline_gestures.js#commitClip` treated any end-edge change past
the "source left" as a loop; with an unknown source length that bound was 0.

## Durable correction

Shrinking is always a crop; a source of unknown length never loops (its
remaining length is treated as infinite).

## Regression checks

- `temp/timeline/timeline_clip_crop_real_app.probe.mjs` (6/6).
