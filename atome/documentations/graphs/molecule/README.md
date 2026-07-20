# Graphs - Molecule

## Status

Recording, persistence, lifecycle, and renderer ownership updated to the delivered Molecule runtime contract.

## Purpose

This folder maps the active group-timeline and recording paths so exact multitrack behavior can be audited without confusing it with generic capture.

## Files analyzed

- `eVe/intuition/tools/core/tool_runtime_bootstrap.js`
- `eVe/intuition/tools/core/tool_runtime_bootstrap_transport_handlers.js`
- `eVe/intuition/tools/core/tool_runtime_recording_handlers.js`
- `eVe/intuition/tools/capture.js`
- `eVe/intuition/tools/molecule/runtime.js`
- `eVe/intuition/tools/molecule/recording/index.js`
- `eVe/intuition/tools/molecule/session/session.js`
- `eVe/intuition/runtime/molecule_stores.js`
- `eVe/domains/media/api/audio_api.js`
- `eVe/domains/media/api/video_recording_controller.js`
- `atome/src/application/audio_runtime/sample_accurate_recording.js`
- `eVe/intuition/tools/molecule/kernel/schemas.js`

## Main entry points

- `installMoleculeGroupTimelineRuntime`
- `startGroupTimelineRecording`
- `stopGroupTimelineRecording`
- `cancelGroupTimelineRecording`
- `readGroupTimelineRecording`
- `createMoleculeRecordingSession`
- `createMoleculeRecordingCaptureAdapter`
- `startAudioRecording` / `stopAudioRecording`
- `startVideoRecordingSession` / `stopVideoRecordingSession`
- `resolveSampleAccurateRecordingCapability`

## Locked conclusions

- Bevy tools `ui.capture.audio` and `ui.capture.video` invoke real generic recording controllers.
- An active Molecule timeline routes media record toggles through its `read/start/stop/cancel/dispose` coordinator.
- The single product renderer is Bevy/WebGPU on `#eve_surface_project`; capture does not own a parallel product DOM/native preview surface.
- Generic video recording has no DOM `<video>`/`<img>`, native overlay, or fake WebGPU viewfinder. A viewfinder is unavailable until real camera frames feed the shared compositor.
- Exact mode is explicitly requested and uses safe integer frames plus one locked `clock_epoch`.
- Capture uses `auv3.render` / `record_start_render_quantum`; timeline placement uses `auv3.host_transport` and `timeline_origin_frame`.
- Exact evidence requires `playback_start_frame < recording_start_frame` and `playback_observed_frame == recording_start_frame`.
- Exact compensation fields are strictly positive and require `roundtrip_latency_frames = input_latency_frames + output_latency_frames = record_offset_frames_applied`; placement is `timeline_origin_frame - roundtrip_latency_frames`.
- Exact capability is limited to AUv3 `plugin_input`.
- Browser, desktop/Tauri, iOS app, AUv3 microphone, AUv3 plug-in output/mix, and video remain generic-only.
- Exact video returns `av_sample_accurate_overdub_unsupported` until video/container PTS is mapped to the audio sample timeline.
- Capture persists the media Atome before Molecule commits `molecule.clip.add`.
- A failed `molecule.clip.add` after finalization leaves the coordinator in `commit_failed`; a later stop retries the same cached clip/Atome commit without repeating backend stop or persistence.
- Group close disposes the recording coordinator and cancels active capture before scene/session teardown.

## Guarded boundaries

- Generic success must never be promoted to exact overdub.
- A missing/mismatched render or host-transport clock, epoch, frame origin, playback-start/observation proof, sample rate, strictly positive round-trip latency proof, applied record offset, or persisted Atome id rejects the exact operation.
- Any non-zero overrun/discontinuity rejects the clip commit.
- Exact-video capability must remain `supported: false` until the PTS mapping is implemented and validated.

## Graphs

- `01-call-graph.md`
- `02-event-graph.md`
- `03-state-graph.md`
- `04-source-of-truth-graph.md`
- `05-async-graph.md`
- `06-lifecycle-graph.md`
- `07-risk-map.md`
- `08-open-questions.md`
