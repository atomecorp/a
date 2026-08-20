# Recording Integration Plan

Status: Complete. The recording contract and its required runtime validation are closed.

## Goal

Provide one coherent audio/video recording entry path while keeping two guarantees deliberately separate:

- **Generic recording** produces a playable persisted media Atome on every backend that supports capture.
- **Exact multitrack overdub** is accepted only when record and playback positions are measured in one proven render clock and one locked epoch.

A precise file frame count is not, by itself, proof of exact overdub placement.

## Product Tool Wiring

- The Bevy tools `ui.capture.audio` and `ui.capture.video` lazy-load the capture runtime and invoke the real audio and video recording controllers.
- `ui.detail.record.toggle` delegates media recording to the same capture handlers. When a Molecule timeline is active, it delegates to the Molecule recording coordinator; otherwise it stays on the generic capture controller.
- UI latches and gestures are projections of controller state. They are never the timing authority.
- The product has one visible renderer and one canvas: Bevy/WebGPU on `#eve_surface_project`. Recording does not create a second product canvas, a parallel DOM preview, or a native preview overlay.

## Generic Recording Contract

Generic audio and video capture remains available wherever the selected backend supports it. Start/stop results are normalized around stable session identity, file information, `frame_count`, `sample_rate`, and provider metadata when the backend can expose them.

`duration_sec` is derived from `frame_count / sample_rate` for audio. Wall-clock timers and UI frame cadence do not determine clip placement.

Generic capture is the correct route for browser microphones, desktop/Tauri microphones, iOS app microphones, AUv3 microphones, and browser/native video until a common-clock exact contract is proven for those sources.

Native audio finalization closes producer admission, waits for all in-flight pushes, and
drains the writer ring before finalizing WAV size and frame count. A terminal timing error
keeps explicit discard recovery; physical deletion must succeed before discard is
reported. Browser video freezes and validates one terminal payload, then retries durable
persistence/project association with stable recording and upload identities rather than
stopping the encoder or creating the Atome twice.

## Exact Overdub Capability Matrix

| Runtime / source | Generic recording | Exact overdub | Proven clock contract |
|---|---:|---:|---|
| Browser microphone | yes | no | Browser capture frames are not proven to share Kira's render epoch. |
| Desktop / Tauri microphone | yes | no | Native capture has no proven common playback/record epoch. |
| iOS app microphone | yes | no | App-native capture is not mapped to the AUv3 render clock. |
| AUv3 microphone | yes | no | Microphone frames are not measured as `plugin_input` inside the same AUv3 render quantum. |
| AUv3 `plugin_input` | yes | yes, when explicitly requested and validated | Input captured on `auv3.render`; timeline origin latched on `auv3.host_transport`; matching locked `clock_epoch`. |
| AUv3 plug-in output/mix | yes | no | Generic output capture is distinct from the same-quantum `plugin_input` contract. |
| Browser or native video | yes | no | No validated mapping exists from video/container PTS to the audio sample timeline. |

An exact request on any unsupported row is rejected with `av_sample_accurate_overdub_unsupported`. The same source remains usable through its generic controller when exactness is not requested.

## Exact Timing Contract

An exact start request must contain:

```js
{
  media_kind: 'audio',
  source: 'plugin_input',
  require_sample_accurate: true,
  timeline_start_frame,
  timeline_sample_rate,
  clock_id: 'auv3.render',
  clock_reference: 'record_start_render_quantum',
  timeline_clock_id: 'auv3.host_transport'
}
```

The public flag is normalized into the explicit native bridge field
`requireSampleAccurate: true`; exact mode is never inferred from `plugin_input` or precise
result metadata. The capability result must confirm both clock identities. The AUv3 start
result then supplies a non-empty `clock_epoch` and an integer host-transport
`timeline_origin_frame`; both are locked into the request and must match the stop result.

The exact stop result is accepted only when:

- all frame positions/counts are safe integers;
- the file sample rate equals the timeline sample rate;
- `clock_id`, `clock_reference`, `timeline_clock_id`, `clock_epoch`, and `timeline_origin_frame` match the start contract;
- `playback_start_frame` is the real earlier playback start, so it is strictly less than `recording_start_frame`;
- `playback_observed_frame` equals `recording_start_frame`, proving same-quantum observation;
- `frame_count` is positive;
- `overrun_frames` and `discontinuity_frames` are both zero;
- both host latency legs, their sum, and the applied offset are strictly positive integer frames, with `roundtrip_latency_frames = input_latency_frames + output_latency_frames`;
- `record_offset_frames_applied` equals that exact `roundtrip_latency_frames` value;
- latency/offset compensation still produces a positive integer clip range.

Recorded clip truth is stored as integer `start_frame`, `duration_frames`, `source_in_frame`, and `source_out_frame`. The persisted timing proof includes both host latency legs, their round-trip sum, and the equal applied record offset. Seconds are derived views only.

Placement is defined once, without adding playback lead a second time:

```text
raw_timeline_start = timeline_origin_frame - roundtrip_latency_frames
source_in_frame = max(0, -raw_timeline_start)
start_frame = max(0, raw_timeline_start)
```

## Molecule Recording Coordinator

Each open Molecule timeline owns one `createMoleculeRecordingSession(...)` coordinator with the public lifecycle:

- `read()` returns the current status, target, clock, epoch, frame origin, and capability.
- `start()` validates one armed compatible track, exact capability, integer frame origin/sample rate, and the locked start epoch.
- `stop()` finishes capture, validates exact timing, requires the persisted media Atome id, then commits one `molecule.clip.add` operation.
- `cancel()` discards the active capture without creating a clip.
- `dispose()` waits for an in-flight start, cancels an active capture, and makes the coordinator unusable.

The stop ordering is mandatory:

```text
finish capture
  -> validate exact frame/clock result
  -> persist the media as an Atome
  -> require the persisted Atome id
  -> commit molecule.clip.add
  -> persist/re-render the canonical timeline
```

A clip can therefore never reference an unpersisted recording result. Closing a group timeline disposes its recording coordinator before clearing the Bevy scene and disposing the Molecule session.

If `molecule.clip.add` fails after capture validation and media persistence, the
coordinator enters `commit_failed` and retains the immutable finalized clip plus media
Atome id. A later `stop()` retries only the canonical session mutation; it does not stop
the backend or persist the take again.

## Video Boundary

The generic video controller remains usable and persists normal video captures. The Molecule exact path rejects video before capture because exact placement would require a validated mapping from every video/container PTS to the audio sample timeline in the same locked epoch.

Video exactness may be enabled only after that mapping is implemented, measured, and validated. A nominal frame rate, file duration, or video frame count is not sufficient evidence.

Browser generic recording registers its existing controller-owned camera `MediaStream`
under the active tool overlay id, so real frames use the shared Bevy/WebGPU external-texture
path. The renderer owns only one fully hidden, non-interactive `<video>` consumer and caps
preview redraw notifications at 15 fps; that cap does not change recorder cadence. Preview
cleanup detaches this consumer without stopping controller-owned tracks. There is no visible
recording-owned DOM `<video>`/`<img>`, native overlay, fake frame, or second compositor.

Native iOS video uses a serialized `state`/`stop`/`cancel`/`ack` protocol. State discovery
recovers active or cached terminal work after WebView reload, start/stop delegate waits are
watchdog-bounded, concurrent stops coalesce, and cleanup failure stays retryable. A valid
terminal result remains cached until project-Atome association succeeds and the client
acknowledges it; a new start cannot overwrite unacknowledged work.

## Delivered Acceptance Criteria

- Bevy audio/video tools invoke real recording controllers rather than inert UI handlers.
- Generic recording stays available on supported browser/native backends.
- Exact requests are fail-closed and limited to AUv3 `plugin_input` captured inside the same render quantum; generic plug-in output/mix remains distinct.
- Exact placement uses the render clock for capture, host transport for timeline origin, one locked epoch, real playback-start/observation proof, and strictly positive duplex latency.
- Molecule exposes `start`, `stop`, `cancel`, `read`, and `dispose` through the active group runtime.
- Media Atome persistence completes before the clip mutation is committed.
- A failed Molecule clip commit retries from the cached finalized take without repeating capture finalization or media persistence.
- Browser video persistence and native iOS reload recovery preserve one terminal recording identity; native acknowledgement follows durable project association.
- Native audio drains every accepted producer push before reporting the final WAV frame count, and terminal discard is confirmed only after physical deletion.
- Exact video is rejected with `av_sample_accurate_overdub_unsupported` without audio-sample PTS mapping; browser generic video may show its real controller stream through the shared Bevy viewfinder without changing that capability classification.
- Recording adds no second product renderer or preview surface.

## Completion Record

The recording task is complete. The generic audio, video, and photo capture paths, the
AUv3 `plugin_input` exact-recording boundary, and their runtime validation are closed.
Unsupported exact-recording requests remain explicit capability errors; they are product
behavior, not unfinished work.

# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply:

- `./.codex/AGENTS.md`

If any instruction in this file conflicts with `./.codex/AGENTS.md`, `./.codex/AGENTS.md` has absolute precedence.
