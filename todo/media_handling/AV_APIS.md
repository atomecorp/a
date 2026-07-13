# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# AV APIs Audit

Date: 2026-05-17

Status: Current-state audit plus target implementation plan. The target architecture is normative; status sections describe remaining migration work.

## Scope

This audit covers the current audio/video subsystem across:

- `src/application/audio_runtime`
- `eVe/domains/media`
- `eVe/domains/mtrax`
- `src-tauri/src/audio_engine`
- `platforms/ios/atome-auv3/Common`
- `platforms/ios/atome-auv3/auv3`
- `engines/audio`

The audit checks architectural separation, professional API coverage, realtime safety, synchronization risks, and future sampler-oriented playback requirements.

## Executive Status

The refactor has moved the project toward a unified audio contract, but it has not yet achieved strict professional AV subsystem separation.

Current strengths:

- `PlayRecordCore` declares a command-bus backed playback/record API contract and routes high-level operations through deterministic intents.
- Tauri native audio has a clearer module split: `bridge.rs`, `playback.rs`, `recorder.rs`, and `metering.rs`.
- AUv3 audio playback and recording are now operational and use user-scoped file paths.
- Video capture has a native iOS path and a browser `MediaRecorder` path.
- MTrack builds a session object that separates visual video clips from `native_audio_clips`.

Current blockers:

- Audio playback and recording are still combined in `PlayRecordCore`.
- Video recording APIs still own capture; Atome persistence and preview UI ownership have moved behind dedicated services.
- Tauri `bridge.rs` performs video-container audio extraction with `ffmpeg`, which mixes transport/API command handling with codec/container management.
- AUv3 `utils.swift` still contains playback rendering, decoding, recording, transport polling, and debug capture in one realtime-sensitive class.
- Browser/WebMedia recording paths still duplicate audio/video capture behavior outside the unified AV contract.
- Several legacy and shim paths remain and must be removed or replaced by explicit, typed runtime backends; none is a valid silent alternate path.

## Current Public API Surface

### Audio Playback

Existing entry points:

- `Squirrel.av.audio` in `src/application/audio_runtime/audio.facade.js`
- `PlayRecordCore.loadAsset`, `playAsset`, `playVoice`, `stopAsset`, `stopVoice`, `jumpAsset`, `destroyAsset`, `setVoiceGain`, `setVoiceRate`
- Tauri commands: `audio_init`, `audio_load_clip`, `audio_load_clip_from_bytes`, `audio_has_clip`, `audio_play`, `audio_play_instance`, `audio_stop`, `audio_stop_instance`, `audio_destroy_clip`, `audio_set_volume`, `audio_set_playback_rate`
- AUv3 Swift bridge commands such as `loadLocalPath`, `loadAndPlay`, `stopSlot`, `clearAuxSlots`

Current capabilities:

- Load file-backed or byte-backed clips outside AUv3/iOS-host restrictions.
- Start/stop assets and voices.
- Start playback from an offset and optional duration.
- Set voice gain and playback rate.
- Basic loop start/end support exists at native Tauri playback level.
- AUv3 supports host-routed native playback with visual-only WebView elements.

Missing professional playback behavior:

- No typed public media graph API.
- No stable voice state query API beyond minimal clip metadata/cache state.
- No sample-accurate scheduling API exposed to callers.
- No explicit transport-synchronized start time, preroll, or beat/timebase mapping.
- No reverse playback.
- No persistent marker/region model in the playback object model.
- No pitch/time-stretch abstraction.
- No pluggable resampler/decoder policy.
- No device/output routing API.
- No latency reporting or compensation API.

### Audio Recording

Existing entry points:

- `window.record_start` / `window.record_stop`
- `PlayRecordCore.recordStart` / `recordStop`
- `record_audio()` in `eVe/domains/media/api/audio_api.js`
- Tauri commands: `audio_record_start`, `audio_record_stop`
- AUv3 `recordStart` / `recordStop` in `platforms/ios/atome-auv3/auv3/utils.swift`
- Explicit browser recording backend through WebAudio/AudioWorklet in `audio_api.js`

Current capabilities:

- Native Tauri mic recording to WAV through CPAL and hound.
- Native AUv3 mic/plugin recording to WAV.
- User-scoped recording paths.
- Basic duration, frame count, sample rate, channel count, size, and peak metadata.
- Basic metering through `audio_get_levels`.

Missing professional recording behavior:

- No explicit input device selection.
- No source graph routing selection beyond `mic` and `plugin`.
- No record-arm model.
- No punch-in/punch-out scheduling.
- No pre-roll/post-roll capture.
- No monitoring path API.
- No latency compensation.
- No multi-track synchronized recording session API.
- No recording format/container configuration exposed through the JS API, despite Rust supporting `Int16`, `Int24`, and `Float32` internally.
- No deterministic offline export path.

### Video Playback

Existing entry points:

- `record_video_play`
- media atome playback helpers in media modules
- MTrack visual playback runtime
- Native audio extraction for video soundtracks routed into audio playback where possible

Current capabilities:

- Visual video playback exists through DOM/video-layer/MTrack paths.
- Video audio can be routed as `native_audio_clips` in MTrack.
- AUv3 can keep WebView video muted and route audio to native playback.

Missing professional video playback behavior:

- No unified `Squirrel.av.video` facade equivalent to `Squirrel.av.audio`.
- No explicit video decode API.
- No compositor API contract.
- No frame-accurate seek API.
- No dropped-frame reporting.
- No hardware decode/device policy.
- No unified video/audio sync authority.
- No professional timeline clock ownership contract at the public API level.

### Video Recording

Existing entry points:

- `record_video()`
- `startVideoRecording()` / `stopVideoRecording()`
- iOS native commands: `media_video_record_start`, `media_video_record_stop`
- MTrack record capture runtime with native iOS and `MediaRecorder` paths

Current capabilities:

- Browser/Tauri WebMedia recording through `MediaRecorder`.
- iOS app/AUv3 native camera recording through `AVCaptureMovieFileOutput`.
- Native iOS preview frame dispatch into the web layer.
- Atome creation after capture.

Missing professional recording behavior:

- No typed video recorder session API.
- No explicit codec/container profile object.
- No keyframe interval, color space, bitrate ladder, stabilization, or orientation policy API.
- No deterministic audio/video sync report.
- No raw frame/callback pipeline.
- No pluggable encoder path.
- No offline render/export path.

## Architectural Separation Audit

### Audio Rendering

Tauri audio rendering is mostly isolated in `src-tauri/src/audio_engine/playback.rs`, but decoding, asset storage, voice management, transport-like region logic, and playback parameter control all live in one global `PlaybackEngine`.

Violation:

- `PlaybackEngine` is a global mutable singleton with `clips`, `voices`, manager state, and tween config in one lock-protected object.
- `play_instance` clones `StaticSoundData`, slices regions, applies looping, gain, rate, and starts playback in one function.

Required split:

- `AudioAssetStore`: decoded assets and metadata.
- `AudioVoiceScheduler`: voices, sample/beat scheduling, looping, one-shot/gate/loop modes.
- `AudioRenderBackend`: Kira/CPAL or AUv3 render integration.
- `AudioTransportAdapter`: timeline timebase to render schedule conversion.

### Video Rendering

Video rendering is not isolated. `video_api.js` owns preview panel creation, DOM mutations, native preview lifecycle, and recording API orchestration. Native iOS recording also emits preview frames from the recorder class.

Violation:

- `AppNativeVideoRecorder` records movie files and encodes/dispatches JPEG preview frames through `WebViewManager.evaluateJS`.
- `video_api.js` handles native capture, browser capture, and playback helpers; project media creation routes through `MediaPersistenceService`, while preview stream and panel ownership route through preview services.

Required split:

- `VideoCaptureService`: owns camera sessions.
- `VideoRecorderService`: owns recording lifecycle.
- `VideoPreviewPublisher`: owns preview frames only.
- `VideoPreviewRenderer`: UI/WebGPU rendering only.
- `MediaPersistenceService`: Atome/file persistence only.

### Audio Playback

The public playback facade is clearer than before, but `PlayRecordCore` still mixes playback and recording in one API class. `backend.kira.js` also stores JS-side markers in `clipMeta`, while Tauri playback owns actual region/loop behavior.

Violation:

- Marker state exists in JS memory only and is not persisted or represented in the native engine.
- AUv3 playback routing uses separate WebKit message paths from Tauri invoke, so transport/control is not single-authority.

Required split:

- `AudioPlaybackAPI` separate from `AudioRecordingAPI`.
- `AudioMarkerRegionAPI` with persisted object model.
- Native marker/region ownership or deterministic replication to native backends.

### Video Playback

Video playback has no professional API boundary. It is mostly behavior inside media/MTrack modules.

Violation:

- Video visual playback, video soundtrack extraction, auth URL normalization, MTrack track state, and native audio session construction are spread across separate modules without a single API schema.

Required split:

- `VideoPlaybackAPI.loadAsset/play/stop/seek/setRate/queryState`.
- `VideoFrameClock` owned by a synchronization layer.
- `VideoSoundtrackRouting` delegated to the audio graph, not embedded in MTrack session assembly.

### Audio Recording

Tauri recording is more isolated than playback, but realtime safety is not professional-grade yet.

Violation:

- CPAL callback writes WAV samples through a `Mutex<WavWriter>` inside the audio callback.
- I16/U16 paths allocate `Vec<f32>` per callback for metering conversion.
- Metering and disk writing are coupled to the capture callback.

Required split:

- Realtime input callback writes to a lock-free ring buffer only.
- Disk writer runs on a non-realtime writer thread.
- Metering reads from a separate non-blocking tap/ring buffer or uses allocation-free stack/block processing.

### Video Recording

Video recording is functionally separated from audio recording, but it is not architecturally isolated from preview, UI, and persistence.

Violation:

- iOS native recorder owns both `AVCaptureMovieFileOutput` and `AVCaptureVideoDataOutput` preview frame generation.
- JS `record_video()` owns MediaRecorder configuration, native dispatch, file persistence, Atome creation, and UI control state.
- There is duplicated video recording logic in `src/application/examples/record_video.js` and `eVe/domains/media/api/video_api.js`.

Required split:

- Browser/native recorder implementations must implement a common `VideoRecordingBackend` interface.
- Persistence and project Atome creation must be post-processing services.
- Preview must subscribe to capture frames, not be owned by the recorder.

### Realtime Streaming Pipelines

Current streaming/capture paths are fragmented:

- Tauri audio uses CPAL callbacks.
- AUv3 uses the AU render block.
- Browser audio uses WebAudio/AudioWorklet capture.
- Video uses MediaRecorder, AVCapture, and preview JPEG dispatch.
- MTrack uses its own session/timeline runtime.

Violation:

- There is no shared stream model for audio buffers, video frames, timestamps, backpressure, drops, or clock domain conversion.

Required split:

- `AVStream<TFrame>` abstraction with monotonic timestamps, sample/frame counters, backpressure policy, and lifecycle states.
- Separate stream roles: `capture`, `monitor`, `record`, `playback`, `preview`, `export`.

### Decoding and Encoding

Decoding/encoding responsibilities are not isolated enough.

Violation:

- Tauri `bridge.rs` invokes `ffmpeg` to extract audio from video containers before playback.
- `playback.rs` does container sniffing and decoding route selection.
- AUv3 `utils.swift` performs file decode using `AVAudioFile` then `AVAssetReader`.
- Browser video recording uses MIME candidate selection inline inside API modules.

Required split:

- `MediaDecodeService`: container sniffing, decode path, metadata probe.
- `MediaEncodeService`: recording codec/container profiles.
- `MediaTranscodeService`: extraction/transcode jobs with explicit cache ownership.
- Bridge/API layers must call these services, not implement them.

### Synchronization Layers

Synchronization exists but is not unified:

- MTrack builds audio engine sessions with transport data.
- AUv3 polls host transport inside the render block at intervals.
- Video preview and recording use wall-clock based `Date.now()`/`CACurrentMediaTime()`.
- Tauri audio uses Kira playback but does not expose sample clock as the canonical transport.

Violation:

- No single `AVClock` or `TransportClock` API owns sample time, host time, timeline time, and conversion.
- Video recording completion estimates frame count using theoretical FPS rather than actual frame timestamps.

Required split:

- `AVClock`: sample time, host time, beat time, timeline time, monotonic conversion.
- `SyncSession`: binds audio voices, video frames, recording sessions, and timeline position.
- `LatencyModel`: input/output latency, codec delay, device delay, WebView/native bridge delay.

### Transport and Control

Transport/control is spread across `PlayRecordCore`, `Squirrel.av.audio`, Tauri commands, AUv3 Swift messages, MTrack transport modules, and media APIs.

Violation:

- Audio control has multiple transport paths: command bus, Tauri invoke, WebKit messages, direct facade backend calls.
- Video control has separate `record_video`, `startVideoRecording`, MTrack runtime, and native invoke paths.

Required split:

- One `TransportControlAPI` that owns play, pause, stop, seek, locate, loop, rate, arm, punch, preroll, and schedule.
- Runtime backends should only execute resolved commands.

### UI and Control Logic

UI and media control are still mixed.

Violation:

- `video_api.js` creates and mutates preview DOM elements, stores panel rects, handles drag/resize, and controls capture sessions.
- `audio_api.js` creates project Atomes after recording stop.

Required split:

- `AVControlAPI`: no DOM.
- `MediaAtomeService`: creates/updates Atomes.
- `PreviewUI`: uses AVControlAPI and MediaAtomeService only.

## Coupling Points and Risks

### Critical Coupling

- `PlayRecordCore` is both playback and recording control, so recording lifecycle changes can affect playback initialization and command-bus behavior.
- `record_audio_api.js` chooses native/browser/AUv3 recording and owns pending promise state; this is transport, state machine, and API in one file.
- `backend.kira.js` is named Kira but contains AUv3-specific WebKit path normalization and bridge posting.
- `AppNativeMediaCaptureController` handles photo, permissions, preview, video recording, and preview host attachment.
- `AppNativeVideoRecorder` couples native recording with preview frame encoding and JS dispatch.
- `bridge.rs` couples Tauri command handling with ffmpeg process execution and media cache management.
- `utils.swift` couples AUv3 render, file playback, decode, recording, transport polling, and debug capture.

### Obsolete or Transitional Abstractions

- AUv3 Swift recording now routes through a native recorder backend instead of declaring `squirrel_recorder_core_*` C FFI calls directly.
- The previous `RecorderCoreShim.mm` build-time shim has been replaced by a named AUv3 native recorder backend boundary.
- `backend.kira.js` still describes replacing legacy paths but contains AUv3 command-specific branches.
- Empty diagnostic functions such as `logRecordDiag`, `logAudioDiag`, and `logVideoDiag` create inert instrumentation surfaces.

### Duplicated Pipelines

- Audio capture exists in native Tauri CPAL, AUv3 Swift/FFI, browser WebAudio/AudioWorklet, and MTrack MediaRecorder audio capture.
- Video recording exists in `examples/record_video.js`, `media/api/video_api.js`, MTrack `record_capture_runtime.js`, and iOS native Swift.
- Video audio extraction exists in Tauri `ffmpeg` extraction and MTrack native audio clip preparation.
- Media persistence and Atome creation are duplicated between audio and video APIs.

### Unsafe Shared State

- Rust playback uses a global `RwLock<Option<PlaybackEngine>>`; large decode/load operations occur while holding a write lock.
- Rust recorder uses a global `Mutex<HashMap<String, RecordingSession>>`.
- JS recording state uses module-level `audioState`, `videoState`, and `PENDING` maps without a formal lifecycle state machine.
- AUv3 Swift has many mutable properties read/written across render, decode, main, and utility queues, partly protected by `os_unfair_lock` but not uniformly.

### Realtime and Threading Risks

- Disk writes occur inside CPAL callbacks through `WavWriter` locking.
- I16/U16 metering allocates a `Vec<f32>` per audio callback.
- AUv3 render path calls capture methods and periodically calls host transport polling logic from the render block.
- AUv3 file decode uses a semaphore wait in an async loading path; it is not inside the render callback, but it should be replaced with a deterministic async asset loading service.
- Swift native video preview performs image conversion and JPEG encoding in the recorder sample-buffer callback path.

### Performance Bottlenecks

- `audio_load_clip_from_bytes` sends byte arrays through JSON serialization for Tauri.
- Tauri video audio extraction spawns `ffmpeg` synchronously from the command path.
- Playback loads whole files into memory as `StaticSoundData`.
- AUv3 decodes full files into `fileAudioL` and `fileAudioR` arrays.
- Native video preview sends base64 JPEG frames through JS evaluation.

## Professional API Coverage Matrix

| Area | Current status | Professional status |
| --- | --- | --- |
| Audio playback | Partial | Missing scheduler, routing graph, persisted regions, state query, latency |
| Audio recording | Partial | Missing device/source graph, arm/punch/preroll, ring-buffer writer |
| Video playback | Fragmented | Missing public facade, sync, decode/compositor contracts |
| Video recording | Partial | Missing typed profiles, sync reports, raw frame path |
| Transport control | Partial | Split across command bus, MTrack, native bridges |
| Synchronization | Incomplete | No single AV clock/timebase authority |
| Timeline control | Partial | MTrack-specific, not generic AV API |
| Monitoring/metering | Basic audio only | Missing per-channel/per-bus scopes, video stats |
| Buffer management | Internal only | Missing explicit buffer pool/ring API |
| Stream management | Fragmented | No cross-runtime stream model |
| Codec/container | Internal/ad hoc | No codec profile API or decode service |
| Realtime callbacks/events | Partial | No typed event stream contract |
| Automation/control surfaces | Partial | MTrack/project specific |
| Device management | Minimal | No enumerate/select/configure API |
| Latency management | Missing | No latency query/compensation model |
| Error handling | Partial | Some typed errors, still many silent catches |
| Offline rendering/export | Missing | No export graph |
| Scheduling | Minimal | No sample-accurate scheduled API |
| Media graph routing | Missing | No node/edge graph contract |

## Audio/Video Functional Parity Requirement

The target AV API must not create artificial feature gaps between audio and video. Audio and video can have media-specific implementation details, but they must expose the same professional control concepts wherever technically applicable.

Parity rules:

- Audio and video assets must share the same base asset lifecycle: load, unload, prepare, play, pause, stop, seek, schedule, query, dispose.
- Audio and video recording sessions must share the same base lifecycle: create, prepare, arm, start, stop, finalize, discard, fail, dispose.
- Audio and video must use the same marker, region, loop, cue, slice, automation, and timeline object model.
- Audio and video must use the same transport authority and clock model.
- Audio and video must use the same media graph routing concepts, with media-specific node types only where required.
- Audio and video must expose equivalent monitoring concepts: level/peak/RMS for audio, frame rate/drop/jitter/latency for video, and sync drift for both.
- Audio and video must expose equivalent codec/container profile APIs.
- Audio and video must expose equivalent error, event, and state models.
- If a capability is unavailable for one backend, the API must return a typed unsupported-capability error. It must not silently omit the control or expose a weaker shape.

Current parity failures:

| Capability | Audio status | Video status | Required correction |
| --- | --- | --- | --- |
| Public facade | `Squirrel.av.audio` exists | No equivalent `Squirrel.av.video` facade | Create a unified `Squirrel.av.video` facade with the same lifecycle and event conventions |
| Playback regions | Partial native audio `start_seconds`/`duration_seconds` | No first-class video region API | Move region model to shared `Squirrel.av.timeline` / `Squirrel.av.sampler` |
| Loop regions | Partial audio loop fields | No equivalent video loop fields | Define media-neutral loop regions with audio crossfade and video transition policy |
| Markers | JS-only audio marker cache | No equivalent persistent video marker cache | Persist marker objects for all media assets |
| Recording sessions | Audio has `record_start`/`record_stop` | Video has separate `record_video` / native invoke path | Introduce common `createRecordingSession` and media-specific backend adapters |
| Device API | Missing/implicit | Missing/implicit | Create shared device enumeration and selection API |
| Monitoring | Audio levels only | No equivalent video stats API | Add video frame/drop/jitter stats and shared sync drift metrics |
| Codec profiles | Internal/ad hoc | Internal/ad hoc | Create shared codec/container profile registry |
| Offline export | Missing | Missing | Create one export graph for audio-only, video-only, and mixed renders |
| Scheduling | Minimal audio voice scheduling | MTrack-specific video scheduling | Promote scheduling to shared transport/timeline API |

## Required Professional AV Architecture

### Module Boundaries

The target architecture should be:

```text
Squirrel.av
  audio
    playback
    recording
    monitoring
    device
  video
    playback
    recording
    preview
    device
  transport
  sync
  timeline
  graph
  codec
  export
  events

Runtime backends
  tauri.native.audio
  tauri.native.video
  ios.app.audio
  ios.app.video
  ios.auv3.audio
  ios.auv3.video
  web.wasm.audio
  web.media.video
```

Rules:

- Public API objects own intent and validation only.
- Runtime backends own execution only.
- Codec services own decode/encode/transcode only.
- Transport owns time, scheduling, and state transitions.
- UI owns presentation only.
- Persistence owns Atome/file metadata only.

### Naming

Use stable, explicit names:

- `Squirrel.av.audio.assets`
- `Squirrel.av.audio.voices`
- `Squirrel.av.audio.recorders`
- `Squirrel.av.video.assets`
- `Squirrel.av.video.recorders`
- `Squirrel.av.assets`
- `Squirrel.av.regions`
- `Squirrel.av.markers`
- `Squirrel.av.transport`
- `Squirrel.av.sync`
- `Squirrel.av.timeline`
- `Squirrel.av.graph`
- `Squirrel.av.codec`
- `Squirrel.av.export`
- `Squirrel.av.sampler`

All operations should be verb-object:

- `loadAsset`
- `unloadAsset`
- `createVoice`
- `startVoice`
- `stopVoice`
- `scheduleVoice`
- `setVoiceParam`
- `createRecordingSession`
- `armRecordingSession`
- `startRecordingSession`
- `stopRecordingSession`
- `createMarker`
- `moveMarker`
- `deleteMarker`
- `createRegion`
- `updateRegion`
- `deleteRegion`
- `createTransport`
- `setTransportLoop`
- `scheduleTransportEvent`
- `createRoute`
- `connectRoute`
- `disconnectRoute`

### Lifecycle

Every long-lived object must have:

- `id`
- `schema_version`
- `state`
- `created_at`
- `updated_at`
- `runtime_backend`
- `owner_user_id`
- `project_id`
- `clock_id`
- `trace_id`

Session states:

- `created`
- `prepared`
- `armed`
- `running`
- `stopping`
- `completed`
- `failed`
- `disposed`

Invalid transitions must throw deterministic typed errors.

### Threading Model

Realtime audio callbacks may only:

- read immutable render state;
- read lock-free command queues;
- write to lock-free ring buffers;
- update atomics.

Realtime audio callbacks must never:

- allocate;
- block;
- lock mutexes;
- touch disk;
- call JS/WebView;
- spawn processes;
- wait on semaphores;
- perform codec decode.

Video capture callbacks should avoid:

- heavy image conversion in the capture callback;
- base64 conversion in frame callbacks;
- JS dispatch from the capture callback.

Preview frames should be copied into a bounded queue and encoded/dispatched by a preview worker.

### Synchronization Strategy

Introduce `AVClock`:

```javascript
{
  id,
  sample_rate,
  host_time_origin,
  sample_frame,
  seconds,
  beats,
  bpm,
  time_signature,
  latency: {
    input_seconds,
    output_seconds,
    codec_seconds,
    bridge_seconds
  }
}
```

All playback, recording, preview, and export operations must reference a clock id.

### Event Model

Events must be typed, versioned, and replayable:

- `av.asset.loaded`
- `av.asset.failed`
- `av.voice.started`
- `av.voice.stopped`
- `av.recording.armed`
- `av.recording.started`
- `av.recording.stopped`
- `av.recording.failed`
- `av.transport.located`
- `av.transport.started`
- `av.transport.stopped`
- `av.sync.drift`
- `av.device.changed`
- `av.stream.underrun`
- `av.stream.overrun`

Every event must include:

- `event_id`
- `schema_version`
- `trace_id`
- `clock_id`
- `timestamp_seconds`
- `sample_frame` when audio-related
- `media_frame` when video-related
- `object_id`
- `payload`

### Routing Model

Use a first-class media graph:

```javascript
{
  id,
  nodes: [
    { id: 'mic_1', type: 'device.input.audio' },
    { id: 'sample_1', type: 'asset.audio' },
    { id: 'camera_1', type: 'device.input.video' },
    { id: 'clip_video_1', type: 'asset.video' },
    { id: 'track_1', type: 'bus.audio' },
    { id: 'video_track_1', type: 'bus.video' },
    { id: 'compositor_1', type: 'processor.video.compositor' },
    { id: 'main', type: 'device.output.audio' }
  ],
  edges: [
    { id, from: 'sample_1.out.1', to: 'track_1.in.1', gain: 1 },
    { id, from: 'track_1.out.1', to: 'main.in.1', gain: 1 },
    { id, from: 'clip_video_1.video', to: 'video_track_1.in', opacity: 1 },
    { id, from: 'video_track_1.out', to: 'compositor_1.in.1' }
  ]
}
```

Graph updates must be command-bus operations and must support deterministic replay.

### Codec and Container API

Add:

- `Squirrel.av.codec.probe(source)`
- `Squirrel.av.codec.decode({ source, targetFormat })`
- `Squirrel.av.codec.encode({ streamId, profile })`
- `Squirrel.av.codec.extractAudio({ videoAssetId, profile })`
- `Squirrel.av.codec.createProfile({ codec, container, sampleRate, channels, bitDepth, bitrate })`

Profiles must be named and persisted:

- `audio.wav.pcm24`
- `audio.wav.float32`
- `audio.m4a.aac`
- `video.mov.h264.aac`
- `video.mp4.h264.aac`
- `video.webm.vp9.opus`

### Offline Export

Add `Squirrel.av.export.renderTimeline`:

```javascript
await Squirrel.av.export.renderTimeline({
  timelineId,
  range: { start_seconds, end_seconds },
  profileId: 'video.mp4.h264.aac',
  outputPath,
  realtime: false
});
```

The export pipeline must not depend on DOM playback or screen recording. It must render from the timeline/media graph model.

## Audio/Video Sampler-Oriented Playback Requirements

The playback API must reserve a shared audio/video sampler object model now, even before all DSP and video-processing features exist. The model must be media-neutral first and media-specific only at the final backend capability layer.

The term "sampler" in this architecture means region-triggered media playback. It applies to audio samples and video samples/clips. Audio-specific behaviors include pitch, time-stretch, gain, pan, loop crossfades, and granular processing. Video-specific behaviors include frame-accurate reverse, speed/rate, video loop transitions, freeze/hold behavior, frame blending, and future visual granular or slice workflows. The API shape must remain unified.

### Asset Model

```javascript
{
  id,
  type: 'av.asset',
  media_kind: 'audio' | 'video' | 'image_sequence' | 'mixed',
  source,
  media_clock: {
    sample_rate,
    frame_rate,
    timebase,
    frame_count,
    sample_count
  },
  channels,
  width,
  height,
  duration_seconds,
  regions: [],
  markers: [],
  slices: [],
  round_robin_groups: [],
  velocity_layers: [],
  pitch_model: null,
  stretch_model: null,
  video_rate_model: null,
  video_transition_model: null,
  granular_model: null
}
```

### Marker Model

```javascript
{
  id,
  asset_id,
  name,
  kind: 'start' | 'end' | 'cue' | 'loop_start' | 'loop_end' | 'slice' | 'transient',
  frame,
  sample_frame,
  video_frame,
  seconds,
  beats,
  persistent: true,
  automation_enabled: true
}
```

### Region Model

```javascript
{
  id,
  asset_id,
  name,
  start_marker_id,
  end_marker_id,
  start_frame,
  end_frame,
  start_sample_frame,
  end_sample_frame,
  start_video_frame,
  end_video_frame,
  loop: {
    enabled,
    start_marker_id,
    end_marker_id,
    crossfade_frames,
    mode: 'forward' | 'ping_pong',
    audio_crossfade_frames,
    video_transition_frames,
    video_transition_kind: 'cut' | 'crossfade' | 'hold' | 'blend'
  },
  playback_mode: 'one_shot' | 'gate' | 'loop',
  reverse_enabled,
  pitch_semitones,
  stretch_ratio,
  video_rate,
  frame_blend_enabled,
  velocity_min,
  velocity_max,
  midi_note_min,
  midi_note_max,
  round_robin_group_id,
  automation_enabled
}
```

### Voice Trigger Model

```javascript
{
  id,
  asset_id,
  region_id,
  trigger: {
    source: 'api' | 'midi' | 'automation',
    note,
    velocity,
    timestamp,
    clock_id
  },
  playback: {
    mode: 'one_shot' | 'gate' | 'loop',
    reverse,
    pitch_semitones,
    stretch_ratio,
    video_rate,
    gain,
    pan,
    opacity
  }
}
```

### Required Future Features

- Multiple start markers for audio and video assets.
- Multiple end markers for audio and video assets.
- Playback regions for audio samples and video clips.
- Independent loop regions for audio and video.
- Cue points with shared transport semantics.
- Slicing zones for audio transients and video frame/time ranges.
- One-shot, gate, and loop playback modes for both audio and video.
- Loop crossfades for audio and equivalent loop transition policy for video.
- Reverse playback for both audio and video.
- Pitch manipulation hooks for audio and media-rate hooks for video.
- Time-stretch hooks for audio and time-remap hooks for video.
- MIDI-triggered playback for audio regions and video regions.
- Velocity-triggered regions for audio and video.
- Round-robin sample/clip selection for audio and video.
- Automation of markers and regions for both media types.
- Persistence of all regions and markers inside Atome state.
- Granular synthesis compatibility for audio and future granular frame/slice workflows for video.

### Capability Parity Contract

Every sampler capability must be represented by a shared schema field even when implementation differs by media kind:

| Shared capability | Audio implementation | Video implementation |
| --- | --- | --- |
| Start/end markers | Sample-frame or seconds markers | Video-frame or seconds markers |
| Regions | Sample ranges | Frame/time ranges |
| Looping | Loop region plus audio crossfade | Loop region plus visual transition policy |
| One-shot | Play until end marker | Play until end marker |
| Gate | Stop/release on trigger release | Stop/hold/fade on trigger release |
| Reverse | Reverse sample playback | Reverse frame playback |
| Pitch/rate | Pitch shift plus playback rate | Playback rate/time-remap |
| Time-stretch | Audio stretch processor | Video retime/frame blend policy |
| MIDI trigger | Note/velocity to region | Note/velocity to clip/region |
| Round robin | Audio sample selection | Video clip/region selection |
| Granular future | Audio grains | Video frame/slice grains |

Backend capability errors must be explicit:

```javascript
{
  ok: false,
  error: 'av_capability_unsupported',
  capability: 'reverse_playback',
  media_kind: 'video',
  backend: 'web.media.video'
}
```

Unsupported capability errors are acceptable. Divergent API shapes are not acceptable.

### API Stability Rule

Do not expose marker/region features as ad hoc backend-specific parameters. The public API must operate on persisted marker and region IDs so audio and video backends can evolve without breaking project files or creating media-specific API forks.

## Implementation Priorities

## Execution Plan to Complete the AV Refactor

This plan turns the audit into an implementation sequence. Each step must keep existing public behavior working while moving ownership to the target AV architecture.

### Current Refactor Status

Last updated: 2026-05-17

Completed:

- P1 public API boundary seed:
  - Added shared AV contract helpers for lifecycle objects, media-neutral stores, and typed unsupported-capability errors.
  - Added `Squirrel.av.audio.playback` and `Squirrel.av.audio.recording` compatibility namespaces while keeping legacy audio aliases working.
  - Added `Squirrel.av.video.playback`, `Squirrel.av.video.recording`, and `Squirrel.av.video.preview` facade namespaces.
  - Added targeted JS tests for audio/video API boundary behavior.
- P0 Tauri codec/transcode separation:
  - Moved video-container soundtrack extraction logic out of `src-tauri/src/audio_engine/bridge.rs`.
  - Added `src-tauri/src/audio_engine/transcode.rs` for video container detection, native audio cache ownership, cache refresh policy, cache rebuild, and `ffmpeg` execution.
  - Moved transcode/cache unit tests from the bridge into the transcode service.
- P0 Tauri recorder realtime risk reduction:
  - Removed direct `hound::WavWriter` disk writes from the CPAL input callback.
  - Added a bounded lock-free SPSC ring buffer between the CPAL callback and a non-realtime WAV writer thread.
  - Added explicit `overrun_frames` accounting when the realtime ring buffer cannot accept a full callback block.
  - Added `overrun_frames` to the Tauri `audio_record_stop` JSON payload.
- P0 recorder metering allocation cleanup:
  - Removed per-callback `Vec<f32>` allocations for I16/U16 input metering.
  - Added typed metering helpers for `i16` and `u16` slices.
  - Added targeted Rust tests for f32/i16/u16 metering paths.
- Recording diagnostics contract:
  - Propagated native `overrun_frames` through `record_stop`.
  - Propagated `overrun_frames` through eVe `record_audio().stop()` normalized results.
  - Removed no-op JS diagnostic hooks from the touched recording API paths.
- P0 Swift/AUv3 production diagnostics gate:
  - Added a centralized `AUv3Diagnostics` gate in `platforms/ios/atome-auv3/auv3/utils.swift`.
  - Replaced direct Swift `print` diagnostics in the AUv3 utility with diagnostics-gated calls.
  - Removed remaining `fallback` wording from touched AUv3 comments to keep runtime policy explicit.
- P0 AUv3 recorder backend boundary:
  - Removed Swift `@_silgen_name` recorder declarations from `platforms/ios/atome-auv3/auv3/utils.swift`.
  - Added `AUv3NativeRecorderBackend` as a first-class Objective-C++ recorder boundary for AUv3 recording start, stop, planar push, and interleaved push.
  - Added an AUv3 Swift bridging header for the recorder backend.
  - Removed the previous `RecorderCoreShim.mm` build-time shim.
- P1 MediaPersistenceService extraction:
  - Added `eVe/domains/media/api/media_persistence_service.js`.
  - Moved shared recording Atome ID/path resolution, media URL resolution, project Atome commit, and render projection logic out of `audio_api.js` and `video_api.js`.
  - Kept video-specific placement and authenticated media URL behavior via service options instead of keeping persistence code in `video_api.js`.
- P1 preview service/UI extraction:
  - Added `eVe/domains/media/preview/video_preview_stream_service.js`.
  - Moved the shared live preview `MediaStream` registry, refcounting, acquisition, release, and safe stream stop behavior out of `video_api.js`.
  - Added `eVe/domains/media/preview/video_preview_panel_service.js`.
  - Moved camera preview panel state, DOM ownership, drag/resize behavior, panel/surface presentation, and open/close/switch lifecycle out of `video_api.js`.
  - Kept `video_api.js` as the public API boundary and native/browser capture runtime provider.
- P1 AV monitoring overrun surface:
  - Added `Squirrel.av.monitoring` through the shared AV contracts.
  - Added `AVMonitoringStore.reportStreamOverrun`, `listStreamOverruns`, and `getStreamOverrunSummary`.
  - Connected native recorder `overrun_frames` results from `record_stop` to `av.stream.overrun` monitoring reports.
- P1 AVClock contract:
  - Added `AVClock` and `AVClockRegistry` to the shared AV contracts.
  - Exposed clocks through `Squirrel.av.clocks` and `Squirrel.av.sync.clocks`.
  - Required audio recording sessions, audio voice creation, video recording sessions, and video assets to resolve a registered clock and carry a verified `clock_id`.
- P3 persisted AV marker/region stores:
  - Replaced shared in-memory marker and region stores with Atome-backed persistent stores.
  - Added Atome commit/listStateCurrent backed create, update, delete, refresh, get, and list behavior for `Squirrel.av.markers` and `Squirrel.av.regions`.
  - Marker and region mutations now use deterministic Atome state instead of module-local memory.
- P2 shared AV feature-completeness contract:
  - Added shared AV device enumeration/selection, latency reporting, codec profile, media graph, video metrics, and offline export API contracts.
  - Exposed audio input/output and video input device helpers from the audio/video facades.
  - Exposed audio/video codec profile helpers and audio/video graph node helpers from the public facades.
  - Offline export now reports a typed unsupported-capability error until a concrete backend is registered.
- P0 AUv3 diagnostics and transport split:
  - Moved the AUv3 diagnostics gate out of `utils.swift` into `AUv3Diagnostics.swift`.
  - Moved host transport polling, tempo/playhead mapping, WebView transport cache publication, and transport delegate dispatch out of `utils.swift` into `AUv3TransportObserver.swift`.
  - Added the new AUv3 Swift modules to the `atomeAudioUnit` target membership.
  - Removed the direct transport JS silent catch path from the moved transport observer.
- P0 AUv3 module split completion:
  - Moved AUv3 render-block ownership out of `utils.swift` into `AUv3RenderEngine.swift`.
  - Moved playback state controls, seek/scrub helpers, and debug capture controls into `AUv3PlaybackState.swift`.
  - Moved JavaScript audio injection and mixing into `AUv3JavaScriptAudio.swift`.
  - Moved file decode, AVAudioFile decode, and AVAssetReader decode paths into `AUv3Decoder.swift`.
  - Moved AUv3 recording lifecycle, mic capture, recorder backend push, WAV analysis, and recording event publication into `AUv3Recorder.swift`.
  - Kept `utils.swift` focused on AUv3 state, bus setup, initialization, MIDI helpers, logging, and shared utility accessors.
- P0 Tauri real input recording verification:
  - Verified the CPAL recorder against the machine's real default input device after the ring-buffer writer change.
  - Captured a valid 44.1 kHz mono Int24 WAV with 88064 frames and `overrun_frames: 0`.

Validated:

- `node --test src/application/audio_runtime/play_record_core.test.mjs src/application/audio_runtime/av_api_boundaries.test.mjs` passed.
- `npm run check:syntax` passed.
- `rustfmt --check` on touched Rust audio engine files passed.
- `cargo check` passed.
- `cargo test audio_engine::transcode` passed.
- `cargo test audio_engine::metering::tests` passed.
- `xcodebuild -list -project platforms/ios/atome-auv3/atome.xcodeproj` passed and identified the `atomeAudioUnit` scheme.
- `xcodebuild -project platforms/ios/atome-auv3/atome.xcodeproj -scheme atomeAudioUnit -configuration Debug -sdk iphonesimulator build` passed.
- `xcodebuild -project platforms/ios/atome-auv3/atome.xcodeproj -scheme atomeAudioUnit -configuration Debug -sdk iphonesimulator build` passed after the AUv3 native recorder backend change.
- `node --test src/application/audio_runtime/play_record_core.test.mjs src/application/audio_runtime/av_api_boundaries.test.mjs` passed after the MediaPersistenceService extraction.
- `npm run check:syntax` passed after the MediaPersistenceService extraction.
- `node --test src/application/audio_runtime/play_record_core.test.mjs src/application/audio_runtime/av_api_boundaries.test.mjs` passed after the preview stream service extraction.
- `npm run check:syntax` passed after the preview stream service extraction.
- `node --test src/application/audio_runtime/play_record_core.test.mjs src/application/audio_runtime/av_api_boundaries.test.mjs` passed after the preview panel service extraction.
- `npm run check:syntax` passed after the preview panel service extraction.
- `node --test src/application/audio_runtime/play_record_core.test.mjs src/application/audio_runtime/av_api_boundaries.test.mjs` passed after adding AV monitoring overrun reports.
- `npm run check:syntax` passed after adding AV monitoring overrun reports.
- `node --test src/application/audio_runtime/play_record_core.test.mjs src/application/audio_runtime/av_api_boundaries.test.mjs` passed after adding `AVClock`.
- `npm run check:syntax` passed after adding `AVClock`.
- `node --test src/application/audio_runtime/play_record_core.test.mjs src/application/audio_runtime/av_api_boundaries.test.mjs` passed after replacing marker/region stores with Atome-backed persistence.
- `npm run check:syntax` passed after replacing marker/region stores with Atome-backed persistence.
- `node --test src/application/audio_runtime/play_record_core.test.mjs src/application/audio_runtime/av_api_boundaries.test.mjs` passed after adding shared AV device, latency, codec, graph, video metrics, and offline export contracts.
- `npm run check:syntax` passed after adding shared AV device, latency, codec, graph, video metrics, and offline export contracts.
- `xcodebuild -quiet -project platforms/ios/atome-auv3/atome.xcodeproj -scheme atomeAudioUnit -configuration Debug -sdk iphonesimulator build` passed after splitting AUv3 diagnostics and transport observer modules.
- `xcodebuild -quiet -project platforms/ios/atome-auv3/atome.xcodeproj -scheme atomeAudioUnit -configuration Debug -sdk iphonesimulator build` passed after completing the AUv3 render, playback, decoder, JavaScript audio, recorder, transport, and diagnostics split.
- `cargo test test_record_mic -- --nocapture --test-threads=1` passed outside the sandbox with the real default input device. The captured result was `frame_count: 88064`, `duration_sec: 1.9969160997732427`, `sample_rate: 44100`, `channels: 1`, `output_format: "Int24"`, and `overrun_frames: 0`.

Known validation caveat:

- `cargo test audio_engine::` still fails on pre-existing CoreAudio device initialization tests in this environment (`Failed to create AudioManager`), then poisons the shared test lock. The new transcode and metering tests pass when run with targeted filters.

Remaining:

- None.

### Phase 1: P0 Native Risk Removal

1. Extract Tauri video-container audio extraction out of `src-tauri/src/audio_engine/bridge.rs`.
   - Create a codec/transcode service module owned by the audio engine or a future media engine.
   - Move video container detection, cache path creation, cache invalidation, and `ffmpeg` execution into that service.
   - Keep `bridge.rs` limited to command validation, path resolution, calling playback/recorder/transcode services, and JSON response shaping.
   - Add Rust unit tests for video-container detection and cache refresh behavior in the new service module.

2. Replace CPAL callback disk writes in `src-tauri/src/audio_engine/recorder.rs`.
   - The CPAL callback must only check atomics, copy samples into a bounded realtime queue, update frame counters, and push allocation-free metering taps.
   - The WAV writer must run on a non-realtime writer loop that drains the queue and owns `hound::WavWriter`.
   - Overflow must be explicit: increment an overrun counter and report it in `RecordResult`; do not block the audio callback.
   - Stop/finalize must stop the stream first, close the producer, drain pending blocks, then finalize the WAV on the writer path.

3. Remove per-callback allocations in recorder metering.
   - Replace I16/U16 `Vec<f32>` conversion with allocation-free metering helpers that accept typed slices.
   - Keep existing `audio_get_levels` response shape stable.
   - Add unit coverage for metering conversion paths if pure functions are introduced.

4. Gate or remove production Swift debug paths.
   - Identify permanent debug prints and JS-evaluated diagnostics in `platforms/ios/atome-auv3/auv3/utils.swift`.
   - Route remaining diagnostics through a production-safe structured logging flag.
   - Avoid changing AUv3 render behavior until there is isolated coverage.

5. Replace the AUv3 legacy C FFI recorder path.
   - Inventory all `squirrel_recorder_core_*` and `RecorderCoreShim` call sites.
   - Introduce a first-class AUv3 recorder backend interface with the same session lifecycle as `Squirrel.av.audio.recording`.
   - Remove legacy shims only after the new backend is exercised by app and AUv3 hosts.

### Phase 2: P1 Public Boundary Completion

1. Keep `Squirrel.av.audio.playback` and `Squirrel.av.audio.recording` as the public split; migrate callers off legacy `create_clip`, `play_instance`, and `record_start` aliases incrementally.
2. Promote `Squirrel.av.video.playback`, `Squirrel.av.video.recording`, and `Squirrel.av.video.preview` from compatibility wrappers to backend-adapter based APIs.
3. Extract `MediaPersistenceService` from `audio_api.js` and `video_api.js` so recording stop does not own Atome/file persistence.
4. Extract preview UI from `video_api.js`; capture services should publish preview frames or streams, and UI should subscribe.
5. Add `AVClock` objects to recording/playback session creation and reject session APIs that omit a clock once migration is complete.

### Phase 3: Shared Media Object Model

1. Replace in-memory marker/region stores with persisted Atome state.
2. Make audio and video playback use marker and region IDs instead of ad hoc start/duration parameters at the public API level.
3. Add shared capability errors for unsupported reverse playback, scheduling, pitch/stretch, video retime, loop transition, and offline export.
4. Add event emission for `av.asset.loaded`, `av.voice.started`, `av.recording.started`, `av.recording.stopped`, and `av.stream.overrun`.

### Phase 4: Feature Completion and Validation

1. Add device enumeration/selection for audio input/output and video input.
2. Add latency reporting and compensation fields to session state.
3. Add typed codec/container profiles and route all encode/decode/transcode jobs through codec services.
4. Add video monitoring metrics: frame rate, dropped frames, jitter, decode latency, render latency, and A/V drift.
5. Add offline export from timeline/media graph without DOM playback or screen recording.

### Refactor Guardrails

- No bridge module may own codec, persistence, preview UI, or transport policy after its phase is complete.
- No realtime audio callback may lock, allocate, touch disk, spawn processes, or call JS.
- Legacy aliases may remain temporarily, but they must delegate into the split AV APIs.
- Missing backend behavior must return typed capability errors, not silent alternate routes or missing API fields.
- Every phase must include targeted tests plus the global syntax/build check appropriate to the touched runtime.

### P0: Remove Structural Regressions and Realtime Risks

1. Move CPAL callback disk writes to a lock-free ring buffer plus writer thread.
2. Remove per-callback allocations in recorder metering.
3. Split Tauri `bridge.rs` media extraction into a codec/transcode service.
4. Remove or replace AUv3 legacy C FFI recorder path with a first-class native recorder backend.
5. Remove permanent debug-style logs from production Swift paths or gate them behind production-safe structured logging.

### P1: Establish Clean API Boundaries

1. Split `PlayRecordCore` into `AudioPlaybackAPI`, `AudioRecordingAPI`, and shared command intent utilities.
2. Create `VideoPlaybackAPI` and `VideoRecordingAPI`.
3. Extract `MediaPersistenceService` from audio/video API files.
4. Extract `PreviewService` and `PreviewUI` from `video_api.js`.
5. Define `AVClock` and require all transport/session APIs to reference it.
6. Create shared `AVAssetAPI`, `AVMarkerAPI`, and `AVRegionAPI` used by audio and video.

### P2: Professional Feature Completeness

1. Add device enumeration and selection.
2. Add latency measurement and compensation.
3. Add typed codec/container profiles.
4. Add monitoring/metering scopes by device, bus, track, and recorder.
5. Add sample-accurate scheduling.
6. Add route graph nodes and edges.
7. Add video parity metrics: frame rate, dropped frames, jitter, decode latency, render latency, and A/V drift.

### P3: Audio/Video Sampler Compatibility

1. Persist markers and regions in Atome state for every media kind.
2. Add shared region-based playback API for audio and video.
3. Add MIDI trigger and velocity layer object model for audio and video regions.
4. Add audio loop crossfade and video loop transition backend support.
5. Add reverse playback backend support for audio and video.
6. Add stretch/pitch/time-remap hooks with stable API names even if implementation is initially unavailable.

## Redesign List

APIs to redesign:

- `Squirrel.av.audio` facade: split into explicit namespaces and remove hidden backend-specific behavior.
- `PlayRecordCore`: split playback, recording, transport, and command intent helpers.
- `record_audio_api.js`: make it a backend adapter, not the global recording state machine.
- `video_api.js`: split capture, preview, persistence, UI, and playback.
- `backend.kira.js`: remove AUv3-specific WebKit control logic into an AUv3 backend adapter.
- `bridge.rs`: only expose commands; move extraction/cache/decode policies out.
- `utils.swift`: split AUv3 render engine, decoder, playback state, recorder, transport observer, and diagnostics.

APIs to create:

- `Squirrel.av.assets`
- `Squirrel.av.markers`
- `Squirrel.av.regions`
- `Squirrel.av.audio.playback`
- `Squirrel.av.audio.recording`
- `Squirrel.av.video.playback`
- `Squirrel.av.video.recording`
- `Squirrel.av.transport`
- `Squirrel.av.sync`
- `Squirrel.av.timeline`
- `Squirrel.av.monitoring`
- `Squirrel.av.devices`
- `Squirrel.av.codec`
- `Squirrel.av.graph`
- `Squirrel.av.export`
- `Squirrel.av.sampler`

## Unresolved Risks

- AUv3 file decoding and playback are operational but still embedded in the audio unit class.
- Video preview frame dispatch uses base64 JPEG through JS evaluation and may become a bottleneck.
- MTrack native audio clip generation duplicates knowledge that should live in an audio graph/sync service.
- Browser capture remains a separate first-class web backend with an explicit capability contract and no silent substitution.
- Existing silent catches and empty diagnostic functions can hide failures and violate governance if they mask real errors.
- The web backend must be described as a first-class runtime backend everywhere; silent substitution language is forbidden.
- The current audit must be enforced as an audio/video parity contract; otherwise the project risks building a professional audio API and a weaker video API with incompatible markers, regions, scheduling, and automation semantics.

## Acceptance Criteria for a Professional Refactor

- Each AV subsystem has one public typed API and one backend adapter per runtime.
- No bridge file performs codec, persistence, UI, or transport logic.
- No realtime callback performs disk I/O, locking, allocation, process spawning, or JS dispatch.
- No UI module owns capture or playback state.
- No recording module owns rendering state.
- No playback module owns recording state.
- No video module owns audio extraction; it requests soundtrack routing through the audio graph.
- All capture/playback/export objects are represented in deterministic Atome state.
- All effectful API calls pass through command bus intent validation.
- All marker, region, loop, and sampler metadata is persisted by ID and survives backend replacement.
- Every audio playback feature has a video API equivalent when technically applicable, and every video playback feature has an audio API equivalent when technically applicable.
- Missing backend support is represented by typed capability errors, not by missing API fields, hidden alternate routes, or media-specific API forks.

## Professional Export Pipeline

Status: Specification to be decided and implemented during the AV completion phase.

Export must consume canonical Atome/Molecule state and the shared Bevy/WebGPU render path. Screen capture, DOM playback, and a second renderer are forbidden.

### Required output families

1. Non-destructive project package

- Preserve the Atome/Molecule project manifest, timeline, automation, effects, markers, source references, media metadata, schema versions, and edit history.
- Preserve original source files without baking edits into them.
- Include deterministic asset identity, checksums, relative paths, missing-media records, and relink information.
- The package is the authoritative editable deliverable; it is not a rendered movie.
- Open interchange candidates such as OpenTimelineIO may be evaluated as an additional interchange manifest, but must not replace the canonical Atome/Molecule model without an explicit decision.

2. Open archival master

- Evaluate an open, lossless or mathematically reversible video/container combination, such as Matroska with FFV1 or an equivalent approved profile.
- Evaluate an open lossless audio master such as WAV/BWF PCM or FLAC according to editing, metadata, and interoperability requirements.
- Record codec, container, color, pixel format, frame rate, sample rate, channel layout, timebase, and software/schema versions in the export manifest.

3. Delivery export

- Support a deliberately selected delivery profile such as MP4 with H.264/H.265 video and AAC audio, subject to licensing, platform, and distribution requirements.
- Keep delivery encoding separate from the canonical project and archival master.
- Expose profile selection through a typed API and MCP tool with deterministic parameters.

### Export job contract

- Create an immutable export job record.
- Pin the exact project snapshot, asset versions, schema versions, render settings, codec profile, and time range before rendering.
- Render in deterministic frame/sample order through the shared transport and clock contract.
- Persist progress by frame/sample checkpoint and write outputs atomically through temporary job-owned files.
- On interruption, resume only from a verified checkpoint or restart the affected segment deterministically.
- Never publish a partial output as a completed export.
- Preserve the source project and history when an export fails.

### Final validation contract

An export is complete only after:

- container and codec metadata are readable;
- expected frame count and duration match the pinned timeline;
- audio sample count, channel layout, and sample rate match the export contract;
- decoded audio/video timestamps remain synchronized within the declared tolerance;
- checksums and file sizes are recorded;
- the output can be reopened and decoded by supported target runtimes;
- the export manifest records success or a typed failure with the exact failed stage.

### Open decisions

- Select the archival video profile after testing FFV1/Matroska and alternatives for quality, size, decode speed, metadata, WASM/native support, and licensing.
- Select the archival audio profile after testing WAV/BWF versus FLAC for editing, metadata, and interoperability.
- Select delivery profiles and licensing boundaries for MP4 and audio-only exports.
- Decide whether OpenTimelineIO is an export/interchange adapter only or also a supported import contract.
- Define checkpoint granularity, retry limits, cancellation semantics, and cleanup rules for failed jobs.
