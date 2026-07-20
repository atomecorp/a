# Risk Map - Molecule Recording

| Level | Boundary | Failure mode | Delivered guard | Residual action |
|---|---|---|---|---|
| Critical | Exact capability | Generic capture is mislabeled as exact because it returns a frame count. | Molecule always requests exact capability; unsupported sources fail with `av_sample_accurate_overdub_unsupported`. | Keep negative capability tests on browser, desktop/Tauri, iOS app, microphone, plug-in output/mix, and video. |
| Critical | Clock identity | Capture and timeline frames collapse different clocks or epochs. | Require `auv3.render` capture, `auv3.host_transport` origin, matching reference, and a non-empty locked epoch at start/stop. | Validate AUv3 `plugin_input` over long hardware takes. |
| Critical | Playback proof | Playback lead is missing, same-quantum observation fails, or lead is applied twice. | Require `playback_start_frame < recording_start_frame`, `playback_observed_frame == recording_start_frame`, and place only from timeline origin minus round trip. | Exercise pre-roll and long hardware takes. |
| Critical | Video timing | Video/container PTS is placed as if it were an audio sample position. | Exact video returns `av_sample_accurate_overdub_unsupported` with reason `video_pts_audio_sample_mapping_unavailable`; generic video remains enabled. | Implement and validate PTS-to-audio-frame mapping before enabling capability. |
| High | Durable media ordering | Timeline clip references a transient or failed capture result. | Capture controller persists the media Atome; coordinator requires its id before `molecule.clip.add`. | Keep ordering/failure-injection tests. |
| High | Commit retry | A transient timeline commit failure stops/persists the same take twice or loses its durable media identity. | Cache the validated clip and Atome id in `commit_failed`; retry only `session.apply`. | Keep stop-retry tests that assert one backend finalization and one media identity. |
| High | Integer timing | Wall/UI time or fractional values introduce cumulative drift. | Exact request/result and clip schema require safe integer frames; seconds are derived. | Test long overdubs and boundary compensation. |
| High | Host latency offset | One latency leg is zero/omitted or a different value is applied to placement. | Require strictly positive `input_latency_frames + output_latency_frames = roundtrip_latency_frames = record_offset_frames_applied`. | Exercise asymmetric input/output latency and reject every mismatch. |
| High | Discontinuity | Dropped frames, overrun, or sample-rate mismatch silently shift the take. | Non-zero overrun/discontinuity and sample-rate mismatch reject clip commit. | Preserve backend counters and hardware stress tests. |
| High | Lifecycle | Closing a timeline leaves capture running. | `closeGroupTimeline` awaits coordinator `dispose()`, which waits for start settlement and cancels active capture. | Keep close-during-start and close-during-record tests. |
| Medium | Renderer ownership | Recording introduces a DOM/native preview or fake Bevy frame that diverges from the compositor or intercepts input. | Recorder-owned live frames feed only the bounded active-tool overlay in the one Bevy/WebGPU renderer; session guards reject stale frames and cleanup never owns tracks. | Keep real-frame, one-canvas, hidden-consumer, and fifty-cycle cleanup checks. |
| Medium | Tool concurrency | Repeated gestures race start/stop. | Tool operations are serialized/idempotent and controllers reject concurrent starts. | Keep rapid-toggle probes. |

## Capability interpretation

`plugin_input` is the AUv3 input observed inside the same render quantum. It is the only exact source and still requires explicit exact mode. Generic plug-in output/mix is intentionally a different source and guarantee.
