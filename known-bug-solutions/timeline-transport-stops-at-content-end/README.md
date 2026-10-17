# Timeline: Play stops at the last clip, the bottom scrub does nothing

## Symptom

In the Timeline view, playback stops at the end of the last clip; with the
playhead parked after the content, Play does nothing and the playhead cannot go
further. Stop sends the playhead back to where Play started. Scrubbing the
project row at the bottom moves nothing in the timeline (and its preview shows
the List order, not the arrangement).

## Confirmed cause

- `project_view_timeline_content.js#transport` started a bounded playback
  (`open_ended: false`): the transport ends with the content.
- `stopPlayback` did not store the heard position, so the next render read the
  stored (start) playhead back.
- The project row (`project_view_footer.js`) always drove the List's recursive
  transport (`projectViewTransport`) through `project_view_surface_runtime.js#applyFooterOutcome`,
  whatever the view.

## Durable correction

- Play is open-ended unless the loop ribbon bounds it; the view follows the
  playhead past the content.
- Stop stores the heard position (`transport.seek`).
- A view with its own transport exposes `footerTimeline()` (arrangement +
  transport snapshot) and `footerScrub()`; the surface tree and the footer
  outcome use them. The footer exposes `transportMotionUpdates(snapshot)` so
  the timeline's playhead tick also moves the row's playhead.
- A take on the fly passes `busy_record_sources`: armed regions of the same
  input stay armed instead of failing with `generic_molecule_recording_source_busy`.

## Regression checks

`PROBE_ISOLATED=1 HEADLESS=0 node temp/timeline/ux/timeline_user_acceptance.probe.mjs`:
`play_goes_on_past_the_content_and_the_view_follows`, `stop_keeps_the_playhead`,
`project_row_scrub_jumps_the_playing_timeline`, `project_row_scrub_moves_the_stopped_playhead`,
`take_on_the_fly_leaves_the_same_source_region_armed`. Sample accuracy unchanged:
`temp/timeline/timeline_sync_real_app.probe.mjs` 13/13 (run it alone).
