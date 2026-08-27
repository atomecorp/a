# Project View List and Media Regressions

## Video playback stalls after recursive transport refactoring

Confirmed shared-path regressions on 2026-08-27. The new recursive transport
publishes position about every 33 ms. `project_view_surface_events.js` consumed
those ticks like legacy state announcements and forced the contextual rail
to reopen. `enterVirtual` clears the old target before entering the new one;
both events change the rail layout and request a complete project-view render.
An integration test using the real context and rail owners reproduced
30 refreshes and 60 render requests for 30 position-only ticks.

The event owner now refreshes only for recursive status/active-path changes;
legacy object announcements still refresh, including refused starts. The same
test now counts 30 progress patches, zero refreshes and zero render requests.
Pause/Resume continue updating the tools. Separately, the decode owner no
longer increments frameVersion on an already-active transport tick. Activation
may prime an existing image; subsequent frames use the existing decoder
callbacks. A second red-before test verifies this without weakening seek,
scrub, frame retention or source disposal.

Eight focused suites pass 45 tests, M1 passes all 28 Molecule suites plus M0,
and syntax passes 1917 files. Real Web Project 3 reproduces the palette being
closed by playback before the fix. After reload, it remains open as the same
video advances from 6.83 to 18.37 seconds; the video remains visible, and the
footer/row heads move. Sequential audio/composite/video transitions and natural
completion also work. No browser warning/error was observed after reload.
These observations are not an FPS, dropped-frame, audible-output or iOS proof.

Physical acceptance is blocked: the iPhone is unavailable; the connected
iPad has no installed WebDriverAgent and Xcode rejects its signing profile
(certificate not included, exit 65). The original Appium instance also points
to a deleted driver; the existing global installation was tried separately
and its diagnostic server was stopped afterward. No signing settings, app
data or user servers were changed. **To verify:** deploy these JS changes to
the native app and measure frame pacing on the actual failing device through
a provisioned native test session. Tauri was not exercised in this repair.

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

## Recursive List transport reports `Clip '...:asset' not found`

Confirmed on 2026-08-27: timeline normalization adds `assetId: ''` to an
unshared source. The shared audio executor previously assembled the core load
payload as `{ assetId, ...source }`. That empty value overwrote the session's
explicit occurrence identity, so `PlayRecordCore` registered the media under
its URL-derived identity while the voice requested the session's `...:asset`
identity. The facade load route had the same field-priority defect.

The source fix belongs to `media_playback_audio_executor.js`: compose source
or explicit load payload first, then apply the explicit occurrence identity.
Do not force re-decoding on every prepare or retry a missing voice; those
workarounds preserved the wrong identity and are removed from `molecule.js`
and `molecule_session_clips.js`. The inspected WASM `audio_init` retains the
engine's clip map, so replacing that manager was not the cause of this case.

`media_playback_command.probe.mjs` fails before the fix using the real
executor and `PlayRecordCore`; it pins Web-core, native-core and facade load
identity for empty and conflicting source ids. The existing
`molecule_audio_mix_transport.probe.mjs` runs actual normalized sessions
through the executor/core boundary and verifies play, pause, resume, seek,
scrub and Stop with exactly two loads for two occurrences.

Real Web acceptance used existing Project 3: container Play, sequential
transition, stable Pause, footer scrub, Resume, natural end and replay from
zero produced no missing-clip rejection. This is not a native or audible
output proof. Separately, Project 2's `probleme.mov` extraction returned HTTP
500 because ffmpeg found no `0:a:0` stream; Project 3's sampled video previews
reported `AbortError`. Those are distinct unresolved media issues, not
evidence of failed asset registration.

## Recursive List plays but the Visualizer stays empty

Confirmed on 2026-08-27 in existing Web Project 3. The surface copied
`activePathIds` into the old playback signal, whose Visual resolver treated
the first id as media. That id was the container, and no published media
records accompanied it. Manual selection and the old object queue used a
different, working subject contract.

The compiler snapshot now exposes `rootRecord` and `activeLeafRecords`.
`project_view_visual_subject.js` consumes the active leaves directly, using
the existing composite preview for concurrent leaves, without selecting a
row or requiring expansion. Surface events clear obsolete recursive snapshots
when object playback takes over. Publication precedes decoder-id resolution.

A second reproduced cause kept video empty after subject resolution: every
33 ms transport tick assigned `currentTime`, leaving real decoders at
`readyState: 1`. The shared video decoder now tolerates small continuous drift,
avoids restarting an already active video, and preserves explicit paused
seek requests across decoder creation/metadata. `seeked` requests a shared
compositor redraw. Its duplicated timeline normalizer was removed in favor
of the existing media contract; the module is below 500 lines.

Regression tests: `project_view_transport_runtime.test.mjs`,
`project_view_surface_context_refresh.test.mjs`, and
`bevy_video_decode_source_runtime.test.mjs`. Four failing reproductions pass
after correction; the wider seven-suite run passes 104 tests, M1 passes, and
syntax passes for 1916 files. Real Web gestures show nested text/video,
transition to the next video, Pause, footer scrub within/across branches and
Resume with the footer still selected. Video decoders reach `readyState: 4`.
This does not prove Tauri/iPhone or physical audio output. One existing sampled
List-thumbnail `AbortError` remains; it does not concern the Visualizer decoder.

## A moving head appears above/in the Visualizer

The Visualizer must show media only; transport heads belong to rows and the
footer (explicit user rule, 2026-08-27). The shared preview now accepts
`showPlaybackProgress: false`, honored both during initial waveform projection
and incremental audio updates without disabling video mirrors.

The top-of-canvas line was a separate coordinate defect: the footer head's
parent-local y=0 was written directly into its projected screen position.
`bevy_ui_tree_motion_runtime.js` now derives projected deltas from the current
local node position, preserving layout offsets and native/hit-tree coordinates.
`bevy_ui_nested_motion.test.mjs` and `project_view_list_transport_ui.test.mjs`
cover both causes. Real Web Project 3 playback and footer scrub retain the
heads on rows/footer only. Tauri and iPhone have not been validated for this
specific change.

## Footer scrub briefly removes the Visualizer video

Confirmed on 2026-08-27 with a real footer drag within the same WhatsApp video
in Web Project 3. The decoder alternates `readyState: 4 -> 1 -> 4` while seeking.
The source lookup correctly rejects the unready HTML video; Bevy clears its
per-render external bindings and skips that video, exposing the background.
This is distinct from transport starvation and does not require a row change.

The existing decoder now retains one `VideoFrame` before assigning source
time, reuses it through pending seeks, and closes it on new decoded data or
source removal/replacement. The source lookup and Rust external-texture import
accept that frame through the same Bevy draw. Global decoder shutdown now
reuses the single-source removal owner instead of duplicating disposal.

Do not weaken first-frame readiness, keep an expired HTML-video bind group,
add a poster/CPU copy, or overlay a DOM video. The
[WebGPU external-texture lifetime contract](https://www.w3.org/TR/2026/CRD-webgpu-20260109/#gpuexternaltexture)
allows an imported VideoFrame to remain valid until the frame is closed;
HTML-video imports expire between tasks. The Web Cargo target enables the
VideoFrame binding gated by web-sys 0.3.85. No dependency version changes.

`bevy_video_decode_source_runtime.test.mjs` reproduces the failure before the
repair and covers undecoded first frames, retention, repeated pending seeks,
latest target, ready-frame replacement, source replacement, shutdown and
paused scrub. Stream tests retain their existing readiness guard: two old
expectations incorrectly exposed a never-decoded video and were corrected.
The six focused suites pass 32 tests; M1 and syntax pass. The canonical WASM
build passes (version `56ea5207ac321b7b`). Real Project 3 captures during
repeated footer drags retain the image even at `readyState: 1`; paused scrub
settles at `14.143753 s` without resuming, and active scrub resumes afterward.
The footer/row heads remain outside Visual. No import/retention/GPU error was
observed; two pre-existing sampled-thumbnail AbortError warnings remain
separate. Tauri/iPhone and physical audio output remain unverified.

## List composite video samples flicker during playback

Confirmed on 2026-08-27 in Web Project 3's text/video Molecule. Temporal List
previews contain up to five fixed 40 ms video samples. The shared preview
unconditionally stamped each with `playback_source_atome_id`, enrolling it in
`playbackMirrorsFor`. Transport then played and sought all those samples as
live videos. Their fixed times changed, readiness dropped and two sample
decoders reported `play_refused AbortError`.

The existing `recordPreviewNode` now accepts `followPlayback` (default true).
`recordTimelinePreviewNode` passes false for sampled images, clearing the
projected playback association even when copied source properties contain it.
The original source is unchanged. Audio waveforms keep their progression link;
normal Visualizer/Matrix previews remain live. Do not filter sample IDs in
transport, weaken decoder readiness, or add a parallel thumbnail player.

Two failing-before tests in `project_view_list_preview_model.test.mjs` pass
afterward. Six focused suites pass 36 tests; M1 and syntax pass. Real Play,
Pause (21 seconds), paused footer drag and Resume preserve the five sample
times at 0, 0.9065, 1.813, 2.7195 and 3.601666 seconds, all paused/readyState 4.
Only live previews advance. No new sample AbortError occurs after reload.
Continuous flicker after settled Pause was not reproduced in the baseline;
the unintended live sample starts and interrupted plays were reproduced.

Remaining separate observation: immediately after a composite footer scrub,
one Visualizer capture contains text without video, and the next restores
video. The List filmstrip remains intact. Decoder frame retention alone does
not prove composite subject/reprojection continuity; investigate that boundary
before declaring Visualizer scrub fully fixed. Tauri/iPhone, actual Matrix
interaction and physical audio output were not validated in this repair.
