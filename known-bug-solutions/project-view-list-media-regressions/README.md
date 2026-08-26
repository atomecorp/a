# Project View List and Media Regressions

## Symptoms

- A List footer Delete click reports `tool_handler_missing_v2`.
- Sequential playback stops before items outside the currently loaded List or
  Matrix page, including the final item.
- The first audio waveform advances, while subsequent projected waveforms stay
  static.
- A recorded video with a confirmed audio track can show moving video while
  eVe playback has no audio.
- An imported video without persisted duration reaches its final frame but the
  List remains in Play and never advances to the next item.
- A durationless first audio can start and advance its waveform while the List
  remains on that row forever because the decoded Kira duration was discarded.
- A historical WhatsApp import can contain valid AAC while lacking persisted
  `has_audio` metadata; treating that unknown value as false makes the failure
  silently visual-only.
- A short extracted video-audio clip can play inside a Molécule, then the next
  WhatsApp video moves with no sound and every later Kira voice remains at
  position zero even though load and play both report success.

## Confirmed ownership and correction

- `atome_edit_footer_definition_invocation_runtime.js` invokes the unified
  Delete action. It must await the canonical lazy Delete module first; the
  module remains the sole registrar of `ui.delete.selection`.
- `project_view_records.js` owns canonical paged reads. Playback uses its own
  private page state and the existing navigation resolver, so it reads the
  complete current container without moving the user-visible List or Matrix.
- `project_scene_invalidation_runtime.js` owns playback mirror indexes. Direct
  prefix reconciliation explicitly invalidates the derived index after it
  replaces projected records in place.
- `selected_project_media_playback_runtime.js` resolves a durable recorded
  video source from final file properties. Browser playback keeps owner identity
  on the extraction URL. Native playback must not trust legacy relative values
  such as `recordings/video.mp4`: it reconstructs
  `data/users/<media_user_id>/recordings/video.mp4`, while new recordings persist
  that canonical path directly. Required
  audio is loaded before the video timeline starts. The active state is only
  published after the video and its Kira voice both start; either failure rolls
  back the paired transport before the List queue can remove its Visualizer or
  advance.
- Preserve the established replay correction in
  [`media-video-audio-replay`](../media-video-audio-replay/README.md): the media
  reader owns paired video/audio playback, runs before the animation reader,
  clears completed sessions, and reuses one stable voice id per media Atome.
- `project_view_playback_runtime.js` defensively awaits the canonical stop for
  every refused media start while its projected playback id is still visible.
  Decoder completion is resolved through `playback_source_atome_id`, because a
  List thumbnail, Matrix tile, or Visualizer has a projected id different from
  its media Atome. The source session is stopped before the queue advances.
  A Stop received while `startItem` is still pending also stops the item as soon
  as that start resolves instead of leaving it outside the `started` set.
  An `AbortError` is silent only when it belongs to that intentional decoder
  cancellation; an active decoder refusal remains reported.
- `backend.kira.js` returns the positive duration produced by the WASM decoder
  for URL-loaded clips. `selected_project_media_playback_runtime.js` records
  that duration in the shared project-audio duration owner before the queue
  decides how long to hold the current row.
- Historical video audio state is tri-valued. Explicit false/zero is
  visual-only; true and unknown both require successful extracted-audio load
  and voice start, with atomic rollback on failure.
- Video container duration is not audio-track duration. The Web Kira engine
  must never slice `StaticSoundData` past its decoded frames when a video or
  Molécule supplies the longer container duration. A requested duration equal
  to or longer than the remaining decoded audio means natural audio playback,
  while a strictly shorter user crop remains a real slice. This prevents the
  Kira render transport from freezing at the end of a shorter AAC track and
  does not stretch audio or shorten the outer Molécule transport.

## Regression coverage

Run:

```sh
npx vitest run \
  tests/eve/atome_edit_footer_delete_cold_start.test.mjs \
  tests/eve/media_persistence_service.sanitization.test.mjs \
  tests/eve/project_view_playback_regressions.test.mjs \
  tests/eve/selected_project_media_playback_runtime.test.mjs

cargo test --manifest-path platforms/web/audio-wasm/Cargo.toml
```

The tests cover cold Delete registration, a 201-item playback scope, terminal
queue state, A-to-B-to-C mirror replacement, durable video extraction source,
required-audio preload failure, voice-start rollback, queue ordering, and
intentional decoder cancellation. They also cover legacy relative recording
paths, projected `ended`, durationless queue advancement, manual Stop, random
loop re-entry, unknown WhatsApp audio metadata, Kira-loaded duration completion,
and terminal transport reset.
The Web audio tests also pin the exact project-3 duration mismatches
(`3.626 > 3.562667` and `23.953144 > 23.936`) and preserve an explicit shorter
crop.

## Required platform acceptance

Follow `.codex/visual-test-protocol.md` on Web, Tauri Debug, and a physical
iPhone. Record a List Delete click, a multi-page sequential queue, two audio
items with advancing waveforms, and a recorded video with audible replay. Do
not report cross-platform acceptance from unit coverage alone.
