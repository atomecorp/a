# Risk Map - media-recording

| Level | Real risk | Affected boundary | Required guarantee / action |
|---|---|---|---|
| Critical | Promote browser `AudioWorklet` frames to the Kira clock | `audio_core_record.js` / multitrack placement | Forbidden: preserve `capture_clock.shared_with_kira = false` and `sample_accurate_overdub = false`. |
| Critical | Accept an exact take after pull/capacity failure | AUv3 `plugin_input` / native recorder | Every failure contributes to `discontinuity_frames`; any non-zero value invalidates exact completion. |
| Critical | Place video on audio samples without PTS mapping | `video_api_record.js` | Return `av_sample_accurate_overdub_unsupported`; keep generic capture available. |
| Critical | Reapply playback lead as a placement offset | exact result normalization | Treat actual `playback_start_frame` and same-quantum `playback_observed_frame` as proof only; place from `timeline_origin_frame - roundtrip_latency_frames`. |
| High | Lose the browser tail at stop | worklet `flush` / `flush_ack` | Emit the tail before acknowledgement, validate sequences/frames, then clean up. |
| High | Mix epochs, clocks, or sample rates | `sample_accurate_recording.js` | Reject any render/host-transport id, reference, epoch, origin, or rate mismatch across request/start/stop. |
| High | Ignore a native overrun | C++/Swift recorder and `record_audio_api.js` | `overrun_frames` is contractual; exact mode requires zero and generic mode must report it. |
| High | Lose the final accepted native render quantum during stop | `recorder_core.cpp` producer/writer boundary | Close producer admission, wait for every active push, mark producer drained, then empty and join the writer before finalizing the WAV header. |
| High | Acknowledge native video before the project Atome is durable | iOS state/stop/ack protocol | Keep the terminal result cached across reload and send `media_video_record_ack` only after project association succeeds. |
| High | Report discard while a physical recording file remains | audio/video terminal cleanup | Cleanup failure stays typed and retryable; clear controller/native state only after deletion is confirmed. |
| High | Duplicate media after retryable persistence failure | browser video persistence/project association | Reuse the frozen terminal payload plus stable Atome/upload ids; do not stop MediaRecorder or persist a second object. |
| Medium | Invent latency compensation | placement normalization | Require strictly positive latency legs and `roundtrip_latency_frames = output_latency_frames + input_latency_frames = record_offset_frames_applied`; no wall-clock estimate. |
| Medium | Confuse generic success with exact success | all recording APIs | Exact mode is explicit (`requireSampleAccurate`), with no silent downgrade; desktop, iOS app, browser, `plugin`, mic, and video remain non-exact. |
| Medium | Reintroduce a parallel video preview | video controller / capture tools | No DOM `<video>`/`<img>`, native overlay, or fake WebGPU viewfinder; add preview only through real Bevy camera textures. |
