# Atome Audio Engine — Unified Native Audio

## Overview

The Atome audio engine is now moving from a fragmented set of runtime-specific audio implementations to a single logical audio system with runtime-specific native backends.

The original Rust engine remains the foundation for Tauri desktop and cross-platform native playback/recording:

- **CPAL** (v0.15) — low-level audio I/O (input/output streams, device enumeration)
- **Kira** (v0.12) — high-level playback engine (mixer, effects, tweens, clocks, spatial audio)

In parallel, AUv3 and iOS now expose the same unified playback/record/debug contract through a native Swift bridge. The goal of this document is not only to describe the current engine, but to define how this new system must replace the old audio paths everywhere, including:

- audio playback
- video audio playback
- microphone recording
- plugin-output recording
- metering / debug / validation

This target must be true in the following runtime contexts:

- browser mode when Atome/eVe is served by Fastify on FreeBSD
- app / Tauri mode
- AUv3 mode

The rule going forward is simple:

> Every feature that emits or records audio must converge on the unified native audio engine, even if the UI layer, transport layer, or media decoding layer differs by runtime.

## Targets and Backends

| Target | Backend | Playback | Recording | Status |
|--------|---------|----------|-----------|--------|
| macOS (Tauri) | Rust `CPAL + Kira` | native | native | existing foundation |
| iOS app (Tauri shell) | native bridge / unified playback contract | native | native | aligned with new runtime contract |
| iOS AUv3 | Swift native render + recorder bridge | native | native | sample-accurate validation now passing |
| Web served by Fastify (FreeBSD) | Kira WASM + canonical web capture adapter | WASM | canonical web capture adapter | required target |
| FreeBSD / Tauri native host | native backend with system audio dependencies | native | native | runtime prerequisites must be provisioned |
| Android (Tauri) | CPAL / native backend | native | native | planned through Rust path |
| Web (browser) | Kira WASM | WASM | canonical web capture adapter | required target |
| Windows | WASAPI | native | native | Rust path |
| Linux | ALSA / PipeWire | native | native | Rust path |

## Architecture

The architecture is now a single logical audio stack with multiple native execution paths:

```text
┌─ JavaScript ───────────────────────────────────────────────────────────┐
│  Squirrel.av.audio / runtime media APIs                               │
│  audio_engine_debug_runtime.js                                        │
│  record_audio_api.js                                               │
│                                                                       │
│  Responsibilities:                                                    │
│  - transport commands                                                 │
│  - fixture generation / debug suite                                   │
│  - runtime selection                                                  │
│  - sample-accuracy assessment                                         │
└───────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
┌─ Tauri / Native App ─────────────────────┐  ┌─ AUv3 / iOS Plugin ──────────────┐
│ Rust audio engine                        │  │ Swift bridge + native render path │
│ platforms/desktop-tauri/src/audio_engine               │  │ platforms/ios/atome-auv3/Common/WebViewManager    │
│ - playback.rs (Kira)                     │  │ platforms/ios/atome-auv3/auv3/AudioUnit...        │
│ - recorder.rs (CPAL)                     │  │ platforms/ios/atome-auv3/auv3/utils.swift         │
│ - metering.rs                            │  │                                   │
│ - bridge.rs                              │  │ Responsibilities:                 │
│                                          │  │ - accept JS PCM buffers           │
│ Responsibilities:                        │  │ - inject them in render graph     │
│ - clip loading                           │  │ - capture playback / record frame │
│ - playback                               │  │ - emit record_done analysis       │
│ - recording                              │  │ - expose sample-accurate metrics  │
└──────────────────────────────────────────┘  └───────────────────────────────────┘
```

## Current Direction

Historically, Atome used several unrelated audio systems:

- Obj-C / AVAudioEngine bridges on Apple platforms
- Swift-specific playback paths in AUv3
- Tone.js / HTML media / WebAudio in JS
- separate recording implementations

That fragmentation makes the following difficult:

- consistent transport behavior
- routing audio from video and standalone clips through one mixer
- debug visibility
- sample-accurate validation
- replacing one system without breaking another

The new direction is:

1. keep one JavaScript-facing contract
2. drive one native audio engine per runtime
3. make sample-accurate verification part of the engine contract
4. route both audio clips and video soundtrack playback through the same engine

An important consequence is that web playback and capture remain two explicit
responsibilities behind the same canonical public contract. Browser media acquisition
may use platform capture primitives inside the approved adapter, but it must not create
a WebAudio/AudioWorklet engine, alternate product path, or runtime fallback.

## Files

| File | Role |
|------|------|
| `platforms/desktop-tauri/src/audio_engine/mod.rs` | Rust audio engine module root |
| `platforms/desktop-tauri/src/audio_engine/playback.rs` | Kira `AudioManager` — load, play, stop, volume, rate, effects |
| `platforms/desktop-tauri/src/audio_engine/recorder.rs` | CPAL input stream on dedicated thread → WAV via hound |
| `platforms/desktop-tauri/src/audio_engine/metering.rs` | Lock-free RMS + peak metering |
| `platforms/desktop-tauri/src/audio_engine/bridge.rs` | Tauri `#[tauri::command]` handlers |
| `platforms/desktop-tauri/src/audio_engine/tests.rs` | Rust integration tests |
| `platforms/web/audio-wasm/src/lib.rs` | WASM build of the engine |
| `atome/src/application/audio_runtime/backend.kira.js` | JS backend for Rust / native engine usage |
| `atome/src/application/audio_runtime/audio.facade.js` | Public audio facade |
| `eVe/intuition_/tools/audio_engine_debug_runtime.js` | debug suite, fixture playback, sample-accuracy assessment, suite aggregation |
| `platforms/ios/atome-auv3/Common/WebViewManager.swift` | JS → Swift bridge for AUv3 audio commands and PCM injection |
| `platforms/ios/atome-auv3/Common/AudioControllerProtocol.swift` | common contract for playback / stop / debug expected peak propagation |
| `platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift` | AUv3 controller exposing the audio controller to the WebView bridge |
| `platforms/ios/atome-auv3/auv3/utils.swift` | AUv3 native render path, JS audio mix, record events, frame tracking |
| `atome/src/application/audio_runtime/record_audio_api.js` | recording entry point that must converge to the unified engine |

## JavaScript API

The public API remains `Squirrel.av.audio`. Existing callers should continue to use the facade rather than binding themselves to runtime-specific code.

### Playback

```javascript
// Load a clip (Tauri — from file path)
Squirrel.av.audio.create_clip({ id: 'track1', path_or_bookmark: '/path/to/song.wav' });

// Load a clip (Web — from URL, fetched as bytes)
Squirrel.av.audio.create_clip({ id: 'track1', url: '/audio/song.wav' });

// Play
Squirrel.av.audio.play('track1');

// Stop
Squirrel.av.audio.stop('track1');

// Volume (in decibels, 0 = unity)
Squirrel.av.audio.set_param({ id: 'track1', paramId: 'volume', value: -6.0 });

// Playback rate (1.0 = normal, 2.0 = double speed)
Squirrel.av.audio.set_param({ id: 'track1', paramId: 'playback_rate', value: 1.5 });

// Destroy
Squirrel.av.audio.destroy_clip('track1');
```

### Recording

Recording is accessed via the native engine commands and must become the only production recording route:

```javascript
await window.__TAURI__.core.invoke('audio_record_start', {
  sessionId: 'rec1',
  filePath: 'data/users/me/recordings/take1.wav',
  sampleRate: 44100,
  channels: 1
});

const result = await window.__TAURI__.core.invoke('audio_record_stop', {
  sessionId: 'rec1'
});
```

### AUv3 / Native PCM Injection Contract

For AUv3 sample-accurate playback validation, JavaScript sends a rendered PCM buffer to Swift. The bridge now accepts:

- `sampleRate`
- `duration`
- `audioData`
- `expectedPeakFrame`

`WebViewManager.handleAudioBuffer(...)` forwards that payload to the native audio controller and also propagates `expectedPeakFrame` to the render path so the native side can report meaningful sample-accuracy metadata on recording stop.

## Tauri Commands

| Command | Parameters | Description |
|---------|-----------|-------------|
| `audio_init` | — | Initialize the Kira audio manager |
| `audio_load_clip` | `id`, `path` | Load audio file into a clip |
| `audio_play` | `id` | Play a loaded clip |
| `audio_stop` | `id` | Stop a playing clip |
| `audio_destroy_clip` | `id` | Remove clip from memory |
| `audio_set_volume` | `id`, `db` | Set volume in decibels |
| `audio_set_playback_rate` | `id`, `rate` | Set playback speed |
| `audio_record_start` | `session_id`, `file_path`, `sample_rate`, `channels` | Start recording mic to WAV |
| `audio_record_stop` | `session_id` | Stop recording, finalize WAV |
| `audio_get_levels` | — | Get real-time RMS/peak levels |
| `audio_shutdown` | — | Shut down the audio engine |

## Supported Formats

Via Kira + Symphonia:

- **WAV** (PCM 16/24/32-bit, float)
- **MP3**
- **OGG Vorbis**
- **FLAC**

Recording currently outputs **16-bit PCM WAV**.

## WASM Build (Web)

```bash
cd platforms/web/audio-wasm
./build.sh
```

In WASM mode, file-based loading is not available. Use `audio_load_clip_from_bytes(id, Uint8Array)` or pass a `url` to `create_clip`.

## Cargo Dependencies

Added to `platforms/desktop-tauri/Cargo.toml`:

```toml
kira = { version = "0.12", features = ["cpal", "wav", "mp3", "ogg", "flac"] }
once_cell = "1"
ringbuf = "0.4"
```

Existing:

```toml
cpal = "0.15"
hound = "3"
```

## Runtime System Dependencies

Rust crate dependencies are not sufficient on their own. Some runtimes also require system-level audio dependencies.

### FreeBSD / Tauri

For FreeBSD / Tauri, runtime provisioning must be treated as part of the migration scope.

Current assumption to confirm in the codebase and deployment environment:

- native audio on FreeBSD requires at least `JACK`

This matters because the migration is not actually complete if:

- the new engine is correct in code
- but the target FreeBSD / Tauri environment cannot run it due to missing system audio dependencies

Therefore, FreeBSD / Tauri must be validated on two levels:

1. code path ownership and routing
2. system dependency provisioning

At minimum, the migration output should document:

- which FreeBSD packages/services are required
- whether each dependency is needed for playback, recording, or both
- whether the dependency is production-required or test-only

## Sample-Accurate Validation

One of the major additions of the new engine is that AUv3 is no longer validated only by "did audio play?" or "did recording finish?". It is now validated by sample-accurate measurements derived from the native render timeline.

### Validation Fixture

The reference fixture is:

- `impulse_48k_mono`
- sample rate: `48000`
- expected impulse frame: `24000`

That means the ground truth used by the suite is:

```text
expectedPeakFrame = 24000
expectedSampleRate = 48000
```

### What the Native AUv3 Path Reports

On AUv3, the native recorder now emits:

- `peak`
- `first_peak_frame`
- `playback_start_frame`
- `recording_start_frame`
- `expected_peak_frame`

This is emitted in the `record_done` payload from `platforms/ios/atome-auv3/auv3/utils.swift`.

### Why Raw Peak Detection Was Not Enough

In AUv3 plugin routing, recording can start before playback actually enters the render graph. This creates a real and measurable startup offset between:

- when recording begins
- when the injected JS audio actually starts being mixed

Because of that, comparing `first_peak_frame` directly to `expectedPeakFrame` is incorrect in AUv3 plugin mode.

### Normalized Measurement

The debug runtime now computes:

```text
raw_measured_sample   = first_peak_frame
playback_offset       = playback_start_frame - recording_start_frame
measured_sample       = raw_measured_sample - playback_offset
delta_samples         = measured_sample - expected_sample
```

This normalization is applied for:

- runtime: `auv3`
- source: `plugin`

This is the key change that makes sample-accuracy evaluation meaningful in the plugin routing case.

### Latest Validated AUv3 Result

The current validated AUv3 suite result is:

- `play_record_sync`: `measured_sample = 24000`, `delta_samples = 0`
- `sample_alignment`: `measured_sample = 24000`, `delta_samples = 0`
- `sample_accuracy_verified = true`
- `suite_finished.status = "ok"`
- `counts.ok = 5`
- `counts.unsupported = 1`
- `counts.warning = 0`
- `counts.error = 0`

The `unsupported = 1` case is currently `direct_from_disk` in AUv3. It is intentionally not treated as a suite failure when workflow correctness and sample accuracy are both validated.

### Suite Aggregation Rule

The suite now remains `ok` when:

- no scenario ended in `error`
- no scenario ended in `warning`
- any `unsupported` result is expected / non-fatal
- workflow remains valid
- sample-accuracy checks are verified

This prevents AUv3 from being marked unhealthy just because `direct_from_disk` is not implemented yet.

## iOS App Runtime

The iOS app runtime now follows the same native playback contract used by the AUv3 debug path. In current validation logs, the app runtime uses the same native JS-audio backend family and the same debug suite structure (`[APP][audio_debug]`).

That means:

- the app runtime should converge on the same transport and playback semantics
- sample-accuracy and routing rules defined for AUv3 should also drive app-level integration
- AUv3 is currently the strictest native validation target and therefore acts as the reference implementation for Apple-native timing behavior

## Browser Runtime Served by Fastify / FreeBSD

This runtime needs to be named explicitly because it is not the same thing as a purely theoretical "web fallback".

When Atome/eVe is served by Fastify on FreeBSD and runs inside a browser:

- playback must still obey the unified engine contract
- audio clip ownership must still converge through the same public facade
- video soundtrack ownership must still converge through the same transport rules
- recording may still require a browser-native capture path

Current working assumption:

- browser capture may still need `getUserMedia` + `AudioWorklet`
- if that assumption remains true, this path must stay minimal and recording-only
- it must not survive as a parallel production playback engine

This point is important because otherwise the migration could accidentally end in a split architecture:

- one "real" engine for native runtimes
- one semi-legacy engine for browser mode

That outcome is explicitly out of scope. Browser mode served by Fastify / FreeBSD is part of the migration target, not an excuse to preserve the old playback architecture.

This browser target must also be distinguished from FreeBSD / Tauri native hosting:

- browser + Fastify / FreeBSD is the browser runtime target
- FreeBSD / Tauri native hosting is the native runtime target

They may share the same machine or deployment family, but they do not have the same runtime constraints. In particular, system audio dependencies such as `JACK` matter for the native FreeBSD / Tauri host, not necessarily for browser playback itself.

## Integration Goal: One Engine Everywhere

This document is not only about the engine that exists now. It defines the integration target for the whole product:

> The new unified audio system must become the single source of truth for all sound playback and recording in Atome.

That includes:

- standalone audio clips
- soundtrack audio from video objects
- microphone recording
- plugin output capture
- debug playback fixtures
- metering and validation

## Migration Inventory

For this document to be usable as a real migration spec, the first rule is to name the current entry points that must converge.

### JavaScript / Framework Entry Points to Migrate

| Area | Current entry points | Migration target |
|------|----------------------|------------------|
| Public clip playback | `atome/src/application/audio_runtime/audio.facade.js`, `atome/src/application/audio_runtime/backend.kira.js`, `atome/src/application/audio_runtime/backend.legacy_auv3.js` | keep one public facade, retire backend-specific feature code |
| Audio recording | `eVe/domains/media/api/audio_api.js`, `atome/src/application/examples/record_audio.js`, `atome/src/application/examples/record_audio_UI.js`, `atome/src/application/audio_runtime/record_audio_api.js` | one recording contract backed by the unified native engine |
| Video recording / media capture | `eVe/domains/media/api/video_api.js`, `atome/src/application/examples/record_video.js`, `atome/src/application/examples/record_video_UI.js` | separate visual capture is allowed, but audio persistence and playback must converge |
| Shared media persistence | `eVe/domains/media/api/media_api_shared.js` | remain the canonical helper layer for project/user/storage resolution |
| Media atome rendering | `atome/src/application/examples/user.js`, `eVe/domains/media/api/audio_api.js`, `eVe/domains/media/api/video_api.js` | all media atomes must resolve to one playback ownership model |
| AUv3 native bridge | `platforms/ios/atome-auv3/Common/WebViewManager.swift`, `platforms/ios/atome-auv3/Common/AudioControllerProtocol.swift`, `platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift`, `platforms/ios/atome-auv3/auv3/utils.swift` | reference native implementation for Apple timing and routing |
| Debug validation | `eVe/intuition_/tools/audio_engine_debug_runtime.js` | source of truth for runtime validation and sample-accuracy assessment |
| MTrack integration | `eVe/intuition_/tools/mtrack.js` and related mtrack bridge/controller files | timeline playback must be driven by the unified engine clock and routing model |

### Meaning of "Migrated"

A subsystem is not considered migrated when it merely "can play audio through the new engine".

A subsystem is migrated only when:

- it no longer owns an independent production playback path
- it no longer owns an independent production recording path
- its transport semantics are delegated to the unified engine
- its persistence model is aligned with the canonical media record
- its debug and validation path observe the same signal flow as production

## Canonical Media Contract

All media-carrying atomes and timeline items must converge on the same logical media description, even if the visual representation differs.

### Canonical Record Fields

The current `audio_api.js` / `video_api.js` pair already converges on a shared property shape. The migration target is to make this the canonical media description:

- `kind`
- `media_url`
- `media_type`
- `media_source`
- `visualType`
- `file_name`
- `file_path`
- `recording_id`
- `projectId`
- `project_id`
- `width`
- `height`

These fields are already present in the media-atome creation flow and must remain the stable interop layer between:

- persistence
- rendering
- playback ownership
- upload / sync
- recording outputs

### Canonical Ownership Rule

Each media object has exactly one playback owner.

- the visual layer may own display
- the transport layer may own UI state
- the unified audio engine must own audible playback

That rule is especially important for video. A visual `video` element may still exist, but once the unified engine owns the soundtrack, the DOM/media element must not also emit sound.

## Contract by Atome Type

### `audio` and `sound`

For `audio` and `sound` atomes:

- source resolution must end in a unified clip registration
- playback, stop, pause, seek, rate and gain must go through `Squirrel.av.audio`
- waveform / level / debug information must observe the same playback path
- no direct `HTMLAudioElement` production playback is allowed once the runtime has a unified backend

### `video`

For `video` atomes:

- the visual renderer may stay DOM/native-video based if needed
- soundtrack playback must be extracted or routed into the unified audio engine
- the visual element must be muted whenever the unified engine owns the soundtrack
- play / pause / stop / seek / rate must drive both visual state and audio engine state from one transport contract
- no double-output audio is allowed

### `audio_recording`

For `audio_recording` atomes:

- recording start/stop must converge on one engine contract
- produced files must resolve to one canonical persisted media record
- playback of the recorded result must use the same engine as imported audio clips
- listing / sync / upload may remain adapter-specific, but not playback

### `video_recording`

For `video_recording` atomes:

- video capture may keep a capture-specific implementation
- resulting media registration must still land in the canonical media record shape
- soundtrack playback of the resulting video must use the unified engine
- any "play recorded video" workflow must obey the same video audio ownership rule as imported videos

## File Read / Write Policy

If this migration is meant to replace the old system fully, file ownership and file semantics must be explicit.

### Read Path

All playback sources must resolve to one of these:

- local file path / bookmark
- persisted `recording_id`
- canonical `media_url`
- in-memory PCM fixture / byte payload for debug or controlled playback

Backend-specific source parsing is allowed internally, but not in feature code.

### Write Path

Current recording flows already resolve local recording paths like:

```text
data/users/<userId>/recordings/<fileName>
```

This should remain the canonical local recording location unless a runtime requires a sandbox-specific equivalent. On Apple plugin/app runtimes, sandbox and app-group storage may differ physically, but they must still map to the same logical recording contract.

### Accepted Persistence Rule

Recording code may differ by runtime, but the persisted result must always expose:

- file identity
- canonical path
- project ownership
- atome identity when materialized in the project
- replayability through the unified playback engine

### Format Rule

Current state:

- audio engine recording output is WAV
- video capture may still output browser/container-native video formats

Migration rule:

- audio playback inside Atome/eVe must not depend on whether the source came from WAV, MP3, OGG, FLAC, extracted video soundtrack, or runtime-specific capture
- once ingested, all playable audio must become a first-class unified-engine source

## MTrack Integration Specification

MTrack is a first-order migration target, not a side case.

If the unified engine does not own MTrack playback semantics, then the audio migration is incomplete.

### MTrack Responsibilities That Must Move to the Unified Engine

- clip preload / prepare
- play / pause / stop
- seek / scrub
- playhead clock
- mute / gain / solo semantics
- audio preview
- video clip soundtrack playback
- timeline-driven routing
- eventual export / bounce / render path

### MTrack Clock Rule

When MTrack is in playback mode, the unified audio engine must become the master clock for any session that contains audible media.

That means:

- the playhead UI follows the engine clock
- scrubbing requests reposition the engine first, then the UI
- visual timeline state must not be treated as the source of truth once transport starts

### MTrack Clip Rule

Every MTrack clip with audible content must become an engine-managed media source:

- audio clips map directly to engine clips
- video clips map to visual media + engine-owned soundtrack
- muted clips remain present visually but must not emit audible output

### MTrack Preview Rule

Preview, audition, and in-place clip listening must use the same engine family as timeline playback. A special preview path is acceptable only if it is still implemented inside the unified engine contract.

### MTrack Export Rule

The long-term target is that offline or export rendering also reuses the same routing model as live playback. The exact export implementation may differ, but the graph semantics must match the live engine:

- same clip timing
- same track mute/solo behavior
- same gain/rate decisions
- same video soundtrack inclusion rules

## Video Integration Specification

### Split Visual and Audio Ownership

The migration must explicitly separate:

- visual decoding / frame presentation
- audio decoding / audio routing

The visual stack can remain specialized. The soundtrack stack must converge.

### Video Soundtrack Rule

For any `video` atome or MTrack video clip:

- soundtrack audio must be routed through the unified engine
- the video element or native video layer must be muted if its soundtrack is mirrored into the unified engine
- transport commands must apply to both visual and audio state from one controller

### Seek Rule

Seek must be defined as:

1. compute the target media position
2. reposition the audio engine source
3. reposition the visual renderer
4. resume in sync from the same transport command

The anti-pattern to avoid is "seek the video element and hope the audio follows later".

### Rate Rule

Playback rate changes must be applied consistently to:

- engine-owned soundtrack
- visual playback layer
- MTrack clock interpretation when relevant

### Double Audio Is a Bug

If a video is audible both through a DOM/native video element and through the unified engine, the migration is wrong. This is not a cosmetic bug; it is a contract failure.

## Runtime-Specific Rules

### Desktop / Tauri

- Rust `CPAL + Kira` remains the primary native engine
- feature code must call the JS facade or canonical media APIs, not runtime-specific internals
- old HTML/Tone branches are migration debt and must be removed; they are not supported
  runtime fallbacks and must not receive new feature dependencies
- on FreeBSD / Tauri, required system audio dependencies must be provisioned explicitly; at minimum, `JACK` must be confirmed or rejected as a real prerequisite

### iOS App

- the app runtime must align with AUv3 transport semantics where native playback is involved
- app-level audio ownership must converge with the same unified media contract
- validation must not rely on separate app-only playback assumptions

### AUv3

- AUv3 remains the strictest sample-accuracy validation runtime
- playback offset normalization is part of the validation contract for plugin routing
- any future AUv3 media feature must preserve the frame-reporting contract needed by `audio_engine_debug_runtime.js`

### Web

- web must converge on the same canonical engine contract without retaining a supported
  fallback path
- remaining legacy paths must not be invoked as runtime fallbacks and must be removed
  after their owning features use the canonical engine
- for browser mode served by Fastify / FreeBSD, playback ownership must still converge to the unified contract
- if `AudioWorklet` remains necessary, it must be limited to browser recording and not retained as a general playback engine

## Cutover Plan by Subsystem

### Subsystem 1: Public Audio Playback

Definition of done:

- all public audio playback enters through `Squirrel.av.audio`
- `backend.kira.js` or its successor is the preferred native route
- `backend.legacy_auv3.js` is removal-bound migration debt, not a supported fallback
- no feature module calls raw media elements for production audio

### Subsystem 2: Audio Atomes

Definition of done:

- `audio` / `sound` atomes no longer own local playback implementations
- all transport actions are mapped to the unified engine
- recorded audio and imported audio use the same playback path

### Subsystem 3: Video Atomes

Definition of done:

- video visual rendering is decoupled from soundtrack ownership
- soundtrack playback is engine-owned
- muted DOM/native video element when engine-owned soundtrack is active
- seek/rate/play/pause semantics are unified

### Subsystem 4: Recording

Definition of done:

- `audio_api.js`, `record_audio_api.js`, `record_audio.js`, and UI wrappers all converge on one logical recording engine contract
- runtime-specific adapters remain thin
- playback of recorded results uses the unified playback engine

### Subsystem 5: MTrack

Definition of done:

- MTrack transport is engine-clocked
- all audible clips are engine-managed sources
- preview and timeline playback follow the same routing semantics
- video clip soundtrack playback is engine-owned

### Subsystem 6: Debug / Validation

Definition of done:

- runtime validation observes production audio paths
- AUv3 sample accuracy remains green
- app/native runtimes expose enough metrics for regression detection

## Definition of Done for the Full Migration

The framework migration can be called complete only when all of the following are true:

1. `audio`, `sound`, `video`, `audio_recording`, and `video_recording` atomes all resolve to one media ownership model.
2. MTrack transport uses the unified engine as audible clock owner.
3. Video soundtrack playback is routed through the unified engine everywhere it matters.
4. Recording outputs are replayed through the same engine as imported media.
5. No production feature depends on direct `HTMLAudioElement` or `HTMLVideoElement` audio output when a unified native backend is available.
6. AUv3 sample-accuracy validation remains green.
7. Fallback backends are compatibility-only, not first-class production paths.
8. Browser mode served by Fastify / FreeBSD follows the same ownership rules and only keeps the minimal browser-specific capture exception, if still required.
9. Native FreeBSD / Tauri runtime prerequisites are documented and provisioned, including `JACK` if confirmed necessary for audio operation.

## Execution Appendix: Migration Matrix

This appendix is the operational layer of the document. It is meant to be used during implementation and review.

Status legend:

- `current` = currently in production or actively used
- `bridge` = transitional adapter, still allowed during migration
- `target` = intended final owner
- `retire` = remove once replacement is validated

### Playback and Transport

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `atome/src/application/audio_runtime/audio.facade.js` | public JS facade with backend switching | remains public facade | keep as the only public JS entry point; hide backend specifics from feature code | all clip playback still enters through facade | `target` |
| `atome/src/application/audio_runtime/backend.kira.js` | native/Rust backend adapter | unified native engine adapter | extend until it becomes the preferred native path for clip playback and transport | clip load/play/stop/rate/gain pass on Tauri/native runtimes | `target` |
| `atome/src/application/audio_runtime/backend.legacy_auv3.js` | legacy backend | removal-bound debt | forbid new feature dependencies; detach feature modules and delete it | no production-critical feature depends on it | `bridge` |
| `atome/src/application/examples/user.js` media playback hooks | feature-local media creation/play behavior | facade + canonical media controller | route all audio/video audible playback commands to unified engine instead of local media ownership | `audio`, `sound`, `video` atomes play through unified transport | `current` |

### Recording and Persistence

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `eVe/domains/media/api/audio_api.js` | eVe audio capture + persistence wrapper | canonical audio recording adapter | reduce to project/media/persistence adapter on top of one recording engine contract | recorded media persists and replays through unified engine | `bridge` |
| `atome/src/application/audio_runtime/record_audio_api.js` | runtime recording bridge | canonical recording bridge | keep only as a thin adapter to the unified engine contract | start/stop semantics identical across runtimes | `bridge` |
| `atome/src/application/examples/record_audio.js` | feature/runtime recording implementation | UI wrapper over canonical recording APIs | remove ownership of backend choices and engine semantics | no standalone engine logic remains in example layer | `current` |
| `atome/src/application/examples/record_audio_UI.js` | recording UI + backend toggles | UI only | keep UI concerns; remove backend-selection logic once migration completes | UI triggers canonical record commands only | `current` |
| `eVe/domains/media/api/media_api_shared.js` | shared media persistence helpers | remains canonical media helper layer | keep as common source for auth, path, project and media metadata resolution | audio/video APIs resolve the same canonical media fields | `target` |

### Video and Soundtrack Ownership

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `eVe/domains/media/api/video_api.js` | video capture / preview / persistence wrapper | canonical video adapter with engine-owned soundtrack | keep capture/persistence concerns; move soundtrack playback ownership to unified engine | video playback does not emit double audio | `bridge` |
| `atome/src/application/examples/record_video.js` | browser/video capture implementation | capture-only wrapper | keep only capture-specific logic; remove long-term playback ownership | recorded video replays with engine-owned soundtrack | `current` |
| `atome/src/application/examples/record_video_UI.js` | video recording UI | UI only | keep UI concerns; delegate playback/record ownership to canonical APIs | UI never owns production soundtrack playback | `current` |
| DOM / native video element audio output | local visual media element | unified engine soundtrack routing | mute local media-element audio whenever engine soundtrack is active | no double-output audio, seek/rate stay synchronized | `retire` |

### AUv3 and Apple Native Bridge

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `platforms/ios/atome-auv3/Common/WebViewManager.swift` | JS → Swift bridge | canonical AUv3 bridge | keep accepting PCM payloads and expected peak metadata; avoid runtime-specific divergence | debug fixture injection still works | `target` |
| `platforms/ios/atome-auv3/Common/AudioControllerProtocol.swift` | AU audio control contract | remains shared native contract | preserve unified methods for play/stop/inject/debug peak propagation | all AU controllers expose the same contract | `target` |
| `platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift` | AUv3 host/controller | unified AUv3 controller | keep transport ownership thin; delegate signal semantics to the audio engine path | playback/record/debug commands remain stable | `target` |
| `platforms/ios/atome-auv3/auv3/utils.swift` | AUv3 render/mix/record implementation | canonical AUv3 native reference | preserve frame tracking and `record_done` timing payloads required for validation | sample accuracy stays green | `target` |

### Debug and Validation

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `eVe/intuition_/tools/audio_engine_debug_runtime.js` | runtime validation suite | canonical validation harness | keep as source of truth for fixture playback, normalized sample-accuracy assessment, suite aggregation | AUv3 `play_record_sync` and `sample_alignment` stay at `delta_samples = 0` | `target` |
| AUv3 native timing payloads | native record-stop analysis | canonical runtime timing contract | keep exposing `first_peak_frame`, `playback_start_frame`, `recording_start_frame`, `expected_peak_frame` | sample-accurate verification remains possible | `target` |
| ad hoc media debug paths | fragmented feature-level diagnostics | shared engine-observing diagnostics | remove or demote any debug tooling that does not observe the production signal path | meters and debug panels match audible output | `retire` |

### Atome Types

| Atome type | Current owner | Target owner | Required migration action | Validation | Status |
|------------|---------------|--------------|---------------------------|------------|--------|
| `audio` | mixed local media/playback behavior | unified engine clip owner | route create/load/play/seek/rate/gain through canonical engine APIs | imported audio clip behaves identically across runtimes | `current` |
| `sound` | mixed local media/playback behavior | unified engine clip owner | same as `audio`; do not preserve a parallel sound-specific playback stack | no sound-specific playback divergence remains | `current` |
| `video` | visual renderer often owns both image and sound | split visual renderer + engine-owned soundtrack | separate visual display from soundtrack ownership | muted visual element + engine-owned audio path | `current` |
| `audio_recording` | recording-specific helper flows | canonical recorded-media path | unify record output, persistence and replay path | newly recorded audio is replayed through same engine as imported clips | `bridge` |
| `video_recording` | recording-specific helper flows | canonical recorded-media path with engine-owned soundtrack | unify persistence and playback semantics with imported video media | recorded video soundtrack obeys same routing rules as imported video | `bridge` |

### MTrack / MTrax

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `eVe/intuition_/tools/mtrack.js` | timeline feature implementation | unified engine transport client | route audible playback, preview, scrub and playhead to engine clock | MTrack playback is engine-clocked | `current` |
| MTrack bridge / controller files | panel/runtime coordination | transport adapter on top of unified engine | keep UI/panel coordination, remove ownership of audio semantics | preview and timeline playback share routing model | `bridge` |
| MTrack audio clips | mixed feature ownership | engine-managed clip sources | preload and render as first-class engine clips | mute/solo/gain behave predictably | `current` |
| MTrack video clips | visual clip ownership with implicit soundtrack | visual clip + engine-owned soundtrack | extract or route soundtrack to the unified engine, keep visual timeline sync | no double audio, synced seek/play/rate | `current` |
| MTrack export / bounce | undefined / legacy-specific | unified graph semantics | define export path that matches live routing semantics | exported result matches live playback graph behavior | `current` |

### Cutover Gates

Each row above can only move to `retire` or `target` after the following gates are satisfied:

1. Feature parity is verified on the target runtime.
2. Audible playback ownership is unique.
3. Recording output is replayable through the same engine family.
4. Debug tooling observes the production path.
5. For AUv3-sensitive paths, sample accuracy remains validated.

### Recommended Tracking Workflow

Use the matrix as a live migration board:

- add an owner for each row
- add an implementation branch or task id
- update `Status` from `current` to `bridge` to `target` only when the validation column is actually green
- move anything to `retire` only after at least one full regression pass on the affected runtime

## Migration Rules

The following rules should drive all future integration work.

### 1. No New Production Audio Path Outside the Unified Engine

Do not introduce new production playback through:

- direct `HTMLAudioElement`
- direct `HTMLVideoElement` audio output
- Tone.js-only playback paths
- ad hoc Swift / Obj-C playback branches outside the unified contract

Legacy UI helpers discovered during migration are removal debt. They must not be invoked
as runtime fallbacks, extended, or treated as an allowed production path.

### 2. Video Audio Must Use the Same Engine as Audio Clips

Video playback is one of the main reasons for this migration.

The visual part of a video object may still be handled by a platform-specific renderer, but the audio part must be treated like any other audio source and routed through the unified engine.

Concretely:

- video transport commands (`play`, `pause`, `stop`, `seek`, `rate`, `volume`, `mute`) must control the unified audio engine
- the soundtrack must not be played twice
- if a video element still owns visual decoding, its own audio output must be muted when the unified engine owns the soundtrack
- any sync correction must be done at the transport level, not by letting two engines fight each other

### 3. Recording Must Converge to One Native Path

All recording flows must converge to the unified engine contract:

- microphone recording
- plugin output recording
- diagnostic fixture capture

`record_audio_api.js` should be treated as an adapter layer, not as an alternative recording system.

### 4. Debug and Metering Must Observe the Same Engine

Waveform views, peak meters, validation tools, and debug panels must read from the actual production engine path. A debug meter is only useful if it observes the same signal path that the user hears or records.

### 5. Sample Accuracy Is Part of the Contract

For controlled runtimes such as AUv3 plugin routing, timing is no longer a best-effort property. It is now part of the engine contract.

If a new path cannot expose enough timing information to validate:

- playback start
- record start
- measured peak position

then that path is not yet fully integrated.

## Migration Plan

### Phase 1 — Stabilize the Unified Core

Done or in progress:

- Rust playback / recording core for Tauri
- AUv3 PCM injection bridge from JS to native render path
- AUv3 recording event payload with timing metadata
- JS sample-accuracy assessment and suite aggregation

### Phase 2 — Route All Audio Clip Playback Through the Unified Engine

Required outcome:

- all clip playback requests go through `Squirrel.av.audio`
- runtime-specific backends are internal only
- no feature-specific playback shortcut bypasses the engine

### Phase 3 — Replace Video Audio Output

Required outcome:

- video UI keeps image transport if needed
- video audio is loaded / decoded / routed through the unified engine
- playback rate, pause, seek, stop, mute and gain share the same transport semantics as audio clips

This phase is the real replacement milestone for the old system.

### Phase 4 — Converge Recording APIs

Required outcome:

- mic recording uses the unified engine everywhere
- plugin capture uses the unified engine everywhere
- old recorder bridges become wrappers or are removed

### Phase 5 — Remove Legacy Backends

Only after feature parity and validation:

- remove dead playback branches
- remove duplicate recording paths
- delete remaining JS fallback code after the owning feature uses the canonical path

## Practical Integration Checklist

When integrating a feature into the new engine, the checklist is:

1. Does it emit or record audio?
2. If yes, can it be controlled entirely through the unified audio contract?
3. If it is a video feature, is the visual renderer decoupled from audio playback ownership?
4. If timing matters, does the runtime expose enough metrics to validate sample position?
5. Is the debug tooling observing the same signal path as production playback?

If any answer is "no", the migration is incomplete.

## Testing

### Rust / Tauri

```bash
cd platforms/desktop-tauri
cargo test audio_engine_tests
```

Tests cover:

1. engine lifecycle
2. clip load / play / stop
3. load from bytes
4. microphone recording
5. metering

### AUv3 / iOS Native Validation

The audio debug suite now covers:

1. `playback`
2. `record`
3. `direct_from_disk`
4. `direct_to_disk`
5. `play_record_sync`
6. `sample_alignment`

Current AUv3 expectation:

- `play_record_sync` must verify sample accuracy
- `sample_alignment` must verify sample accuracy
- `direct_from_disk` may remain `unsupported` temporarily
- final suite status must still be `ok` when all required checks pass

## Migration from Legacy System

The legacy audio system still exists in parts of the codebase, but it should now be considered transitional.

| Legacy | Unified Direction |
|--------|-------------------|
| Obj-C / AVAudioEngine-specific recorder bridges | native engine recording contract |
| feature-specific playback branches | `Squirrel.av.audio` + unified backend selection |
| direct HTML / video audio ownership | soundtrack routed through unified engine |
| runtime-local debug heuristics | shared sample-accuracy suite and native timing metrics |

Backend selection is platform ownership, not runtime fallback ordering. Each supported
runtime has one canonical backend contract:

- converge on the unified engine;
- fail explicitly when the required backend is unavailable;
- remove old paths after parity and validation.

## Decision Summary

The new Atome audio engine is now more than a Rust playback module. It is the product-wide audio contract.

The important consequence is this:

> Replacing the old audio system does not mean swapping one playback function. It means making the unified engine the single owner of playback, recording, routing, timing validation, and eventually video soundtrack output.

That is the integration target this document should be used against.
