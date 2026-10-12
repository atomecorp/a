# Project → Dashboard: one-second pause, then a snap to the wallpaper

## Evidence

`temp/dashboard_cache/transition_frames.probe.mjs` (CDP screencast, every
composed frame, HEADLESS=0): after the Atome tap nothing moved for ~1 s, the
Dashboard faded in over the project colour, then the whole background changed
in ONE frame (mean difference 85/255) to the wallpaper; ~300 ms later the
projects row reordered.

## Root cause

The leaving project was not in the (stale) projects row, so
`waitForProjectThumbnail` waited its full 700 ms and `beginProjectClosing().play`
took the no-thumbnail path, which never faded the full-screen project-colour
frame: `finish()` removed it at once. The post-arrival reload then moved the
project to the head of the row.

## Correction

- `dashboard_data_controller.promoteLeavingProject` puts the leaving project's
  tile at the head before the first render (where the reload will put it).
- Without a thumbnail, the frame fades out with the cover (crossfade).

## Measured after

Transition starts at ~0.3 s; the background change is spread over ~5 frames
(max 25/255); no reorder after arrival.
