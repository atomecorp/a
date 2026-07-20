# Graphs - media-recording

## Status

Covered area: media recording.

## Purpose

This folder maps the real audio/video capture pipeline, finalization, frame contract, and
the boundary between generic recording and exact overdub.

## Files analyzed

- `eVe/domains/media/api/audio_api.js`
- `eVe/domains/media/api/audio_core_record.js`
- `eVe/domains/media/api/audio_core_helpers.js`
- `eVe/domains/media/api/video_api_record.js`
- `eVe/domains/media/api/video_api_record_options.js`
- `eVe/domains/media/api/video_api_record_finalize.js`
- `eVe/domains/media/api/video_api_record_native.js`
- `eVe/intuition/tools/capture_recording_feedback_runtime.js`
- `atome/src/application/audio_runtime/record_audio_api.js`
- `atome/src/application/audio_runtime/play_record_core.js`
- `atome/src/application/audio_runtime/sample_accurate_recording.js`
- `atome/engines/audio/core/recorder/recorder_core.cpp`
- `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift`
- `platforms/ios/atome-auv3/auv3/AUv3RenderEngine.swift`
- `platforms/ios/atome-auv3/Common/AppNativeVideoRecorder.swift`
- `platforms/ios/atome-auv3/Common/AppNativeVideoRecorderLifecycle.swift`
- `platforms/ios/atome-auv3/Common/AppNativeVideoRecorderTerminal.swift`
- `platforms/ios/atome-auv3/Common/WebViewManager.swift`
- `platforms/ios/atome-auv3/Common/WebViewManagerScriptMessages.swift`
- `platforms/ios/atome-auv3/Common/WebViewManagerAudioTransport.swift`
- `platforms/ios/atome-auv3/Common/WebViewManagerNavigation.swift`
- `platforms/ios/atome-auv3/Common/WebViewManagerIPC.swift`

## Main entry points

- `startAudioRecording` / `stopAudioRecording` - public generic audio control
- `createMoleculeRecordingCaptureAdapter` - exact capability and lifecycle adapter
- `record_audio` - browser worklet capture or native facade
- `record_start` / `record_stop` - runtime bridge
- `normalizeSampleAccurateRecordingResult` - exact frame placement gate
- `startVideoRecording` / `stopVideoRecording` - generic video control
- `media_video_record_state` / `stop` / `cancel` / `ack` - native iOS recovery lifecycle

## Guarantees and boundaries

- The browser retains every `AudioWorklet` frame, including the tail, at the
  `AudioContext` sample rate. That clock is not shared with Kira, so browser overdub is
  never advertised as exact.
- Exact mode is explicit (`requireSampleAccurate: true`) and limited to AUv3
  `plugin_input`. Capture uses `auv3.render` / `record_start_render_quantum`; timeline
  origin uses `auv3.host_transport`; start and stop use the same locked epoch.
- Native evidence includes the real earlier playback start and a same-quantum proof:
  `playback_start_frame < recording_start_frame` and
  `playback_observed_frame == recording_start_frame`.
- Input, output, round-trip latency and the applied offset are strictly positive integer
  frames. Exact mode requires input + output = round trip = applied offset, and placement
  is `timeline_origin_frame - roundtrip_latency_frames`. Pull/capacity failures invalidate
  exact completion through discontinuity accounting.
- Desktop/Tauri, iOS app, AUv3 microphone, generic `plugin` output, and video exact
  requests return `av_sample_accurate_overdub_unsupported` without disabling generic
  recording.
- Generic video recording is connected but owns no DOM `<video>`/`<img>`, native overlay,
  or fake WebGPU viewfinder. Exact video remains unsupported until PTS-to-audio-sample
  mapping exists.
- Browser video option/exact gating and terminal payload validation are separated into
  focused helpers. A stopped terminal payload is persisted with stable Atome/upload ids,
  so a retry does not stop the encoder twice or create duplicate durable media.
- Native iOS video state survives WebView reload until the cached terminal result is
  physically discarded or acknowledged after durable project-Atome association. Start
  and stop delegate waits are watchdog-bounded; concurrent stops coalesce; cleanup failure
  remains retryable.
- Native audio stop closes producer admission, waits for active pushes, drains the writer
  ring, and only then finalizes the WAV header and written-frame count. A terminal timing
  failure can be physically discarded through the existing file API; failed cleanup stays
  explicit and retryable.
- Finalization requires the expected protocol signal and durable-state transition; no
  partial result or unconfirmed cleanup is reported as success.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
