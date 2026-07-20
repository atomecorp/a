# Open Questions - media-recording

## UNKNOWN-001

Question:
Will a future desktop or iOS-app backend expose a real common playback/capture clock?

Why it matters:
Without measured common id, reference, epoch, and sample rate, exact overdub must remain
unsupported.
Any future capability must also expose distinct render-capture and timeline-transport clock
identities rather than collapsing both domains into a wall-clock timestamp.

Affected files:
- `atome/src/application/audio_runtime/sample_accurate_recording.js`
- native desktop and iOS app adapters

How to verify:
Add a common frame contract and executable proof first; do not reuse a wall clock.

## UNKNOWN-002

Question:
Which video-PTS-to-audio-timeline mapping could eventually support exact audiovisual
overdub?

Why it matters:
The video container and Kira audio currently expose no validated common sample origin.

Affected files:
- `eVe/domains/media/api/video_api_record.js`
- future demux/decoder and audiovisual transport contract

How to verify:
Define and test PTS origin, timebase, drift, seek, and frame conversion. Until then,
exact mode returns `av_sample_accurate_overdub_unsupported` for video.

## UNKNOWN-003

Question:
What minimum capacity guarantees `plugin_input` pulls without discontinuity under load?

Why it matters:
A pull/capacity failure must count as a discontinuity and invalidate exact completion, but
operational limits still need measurement across supported quantum sizes.

Affected files:
- recorder AUv3 Swift/C++
- `atome/src/application/audio_runtime/sample_accurate_recording.js`

How to verify:
Test saturation and insufficient capacity; verify `discontinuity_frames > 0`, exact
completion fails, and no exact clip is persisted.

## UNKNOWN-004

Question:
Which independent calibration method will validate latency measured by every future exact
source?

Why it matters:
The contract requires `roundtrip_latency_frames = output_latency_frames +
input_latency_frames`, then `record_offset_frames_applied == roundtrip_latency_frames`.
None of these values may be invented outside the common frame domain.

How to verify:
Introduce a measured loopback fixture, document the method, and validate placement plus
both equalities before advertising another exact source.

## LOCKED-005

Generic video recording has no visible DOM/native viewfinder and no synthesized frame.
The delivered feedback uses only real recorder-owned camera frames routed into the shared
Bevy/WebGPU active-tool overlay. The hidden browser decoder or bounded native latest-frame
producer is disposable, session-guarded, and never persisted or allowed to own tracks.

## LOCKED-006

The delivered generic-video recovery protocol is not optional lifecycle metadata. Native
iOS keeps an unacknowledged terminal result across WebView reload, bounds start/stop with
watchdogs, and permits acknowledgement only after durable project association. Browser
retry reuses the same terminal payload and persistence identities. Cleanup failure remains
retryable and cannot be converted to success.
