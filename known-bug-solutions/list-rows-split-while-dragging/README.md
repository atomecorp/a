# A list's rows break apart while it is dragged (a waveform a row away from its name)

## Symptom

Captures › Audio or Vidéo on the iPhone (any list the renderer scrolls): grabbed by the
middle of a row and moved, some thumbnails stay where they were while their rows move:
a waveform a row away from its name, two thumbnails over each other, a hole. Worst with
the finger held still. At rest, a repaint puts it right.

## Cause

`atome/renderers/bevy-core/src/scroll_area.rs`: a record keeps the base pose read from
the world (`base_offsets`, the offsets it was read at). After the list was described
again at another offset (revealed at the row shown, 256 px), `present_record` moved the
new description's clips by the old base offsets: the clip missed the record, which was
judged out of view, skipped for good (`lay()`'s early out), and left frozen where the
JavaScript pose had put it while its row moved.

## Fix

- `RecordState.recheck`: every record described again is read again once, before the
  "out of view" skip may apply.
- `present_record`: the clips move by `clip_dy` (the description's offset against the
  offset shown), the record's position still by `dy` from its base offsets.

## Regression

- `cargo test -p atome-bevy-renderer-core --lib scroll`:
  `a_base_kept_from_an_earlier_description_is_cut_by_the_clips_where_they_now_lie` (red
  with the old math).
- `temp/list_scroll_2026-11-11/takes_scroll_delete.probe.mjs` (`SKIP_DELETE=1`,
  `KIND=audio|video`): frames during the drag, still, and at rest equal to a full repaint.

## Acceptance

Grab a row in the middle of Captures › Audio, move, hold still, move again, throw: each
waveform stays in its row in every frame.
