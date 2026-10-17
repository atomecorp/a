# Video picture ahead of its sound

## Symptom

During project playback the picture of a video with sound runs ~150–190 ms ahead
of what is heard (measured with `requestVideoFrameCallback` against the instant
heard at each frame's `expectedDisplayTime`).

## Confirmed cause

The project transport gave the video the rendered audio position, without taking
off the audio output latency (`baseLatency + outputLatency`, ~50 ms on macOS), and
the video decode runtime re-seeked only beyond 0.25 s of drift, so the start-up
lead was never corrected.

## Durable correction

- `project_view_transport_runtime.js` gives the picture the heard instant:
  position − `MediaPlaybackAudioExecutor#outputLatencySeconds()`.
- `eVe/domains/rendering/bevy_video_clock_follow.js#followVideoClock`: a playing
  video seeks beyond 120 ms, otherwise its `playbackRate` is nudged (±8 %) until it
  catches the clock, kept one display frame ahead (presentation).

## Regression checks

- `temp/mixer/av_sync_real_app.probe.mjs`: every presented frame within EBU R37
  (sound ≤ 40 ms early, ≤ 60 ms late); measured mean +3–9 ms.
