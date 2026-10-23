# Multitrack preview without video, no crossfade, Timeline cut after the first clip

## Symptom

- List (or Matrix) in **Simultaneous** mode: Play → the sound plays, the Visual
  (upper preview) stays empty — no video at all.
- Timeline (multitrack view): the Visual never shows the video; a fade-out on
  the upper lane over the lower one never crosses from one picture to the other.
- Timeline of a project seeded from a simultaneous List: every track stops at
  the end of the FIRST seeded clip (a 24 s sound stops after 5 s).

## Causes (2026-10-23)

1. `eVe/intuition/runtime/bevy_panel/bevy_panel_record_composite_preview.js`:
   the page filter assigned `visible = entries` when no member was a page, then
   emptied `entries` (`entries.length = 0`) and pushed `visible` back — the
   same, now empty, array. Every non-page composition had no member.
2. Nothing chose a priority video nor applied the clip fades to the picture:
   the Visual composed every active leaf at its scene place, and the Timeline
   transport never reached the Visual at all.
3. `eVe/intuition/tools/molecule/kernel/reducers.js#addClip` set an open
   section's length to the first added clip's extent only; the transport cuts
   each clip at its section's end (`runtime_transport.js#buildTransportTimeline`).

## Fix

- Composite layout filters into a new array; new `arrangement: 'stack'`.
- One owner of the multitrack picture: `eVe/core/media_engine/molecule_video_program.js`
  (`MoleculeSession#getVideoProgram`) — video clips under way, top priority
  first (List: `hierarchy_order` = the simultaneous z stack; Timeline: the top
  lane, `visualOrder: -track.order`), weights = opacity × fade envelope taken
  top-down until the picture is full (true crossfade, no dip).
- `eVe/domains/rendering/project_view_visual_program.js` follows the playing
  engine session (recursive transport and `eve:molecule-transport-state` from
  the Timeline transport), shows the layers stacked in the Visual
  (`project_view_visual_panel.js#setProgram`, opacity by motion), and drives
  their decoders on each clip's window.
- `addClip`: a section grows to hold every clip added to it.

- Timelines saved before the fix: on open (`runtime.js#openGroupTimeline`),
  `kernel/section_extent.js#sectionExtentRepairs` lists each section shorter
  than the end of its last clip, and one canonical batch
  (`molecule.section.update`, label `timeline.sections.hold_clips`) lengthens
  it — durable (event + saved timeline), done once. Open sections are left open.

## Regression checks

- `node temp/multitrack_preview/video_program_logic.probe.mjs` (priority, cut,
  crossfade weights, fade from black, sound has no picture).
- `node temp/multitrack_preview/section_extent_logic.probe.mjs`.
- `node temp/multitrack_preview/section_repair_logic.probe.mjs` (repair of a saved short section).
- `node --test tests/probes/molecule_v2_structure.probe.mjs` (section rules).
- Real app: `PROBE_ISOLATED=1 HEADLESS=0 node temp/multitrack_preview/section_repair_real_app.probe.mjs`
  (old short section → reopen lengthens it, durably; the sound plays past 6.5 s).
- Real app, pixels: `PROBE_ISOLATED=1 HEADLESS=0 node temp/multitrack_preview/preview_video_real_app.probe.mjs`
  (List simultaneous: priority video shown and moving; Timeline: top lane
  alone, two layers mid-fade, lower lane alone after; release on Stop).

## Acceptance

Two videos and a sound, Simultaneous: the preview shows the top row's video
full frame while the sound plays. In the Timeline, a fade-out on the upper
lane dissolves into the lower lane's video; after it the lower video plays on.
