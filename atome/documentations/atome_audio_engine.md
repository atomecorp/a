# Atome Audio Engine — Unified Audio Contract

## Overview

The Atome audio engine is moving from fragmented runtime-specific implementations to one
logical contract with explicit native and browser adapters.

The original Rust engine remains the foundation for Tauri desktop and cross-platform native playback/recording:

- **CPAL** (v0.15) — low-level audio I/O (input/output streams, device enumeration)
- **Kira** (v0.12) — high-level playback engine (mixer, effects, tweens, clocks, spatial audio)

In parallel, AUv3 and iOS now expose the same unified playback/record/debug contract through a native Swift bridge. The goal of this document is not only to describe the current engine, but to define how this new system must replace the old audio paths everywhere, including:

- audio playback
- video audio playback
- microphone recording
- generic plugin-output recording and exact plugin-input recording
- metering / debug / validation

This target must be true in the following runtime contexts:

- browser mode when Atome/eVe is served by Fastify on FreeBSD
- app / Tauri mode
- AUv3 mode

The rule going forward is simple:

> Every feature that emits or records audio must converge on the canonical audio contract. Runtime adapters may differ, but an adapter may claim sample-accurate overdub only when playback and capture expose the same measured render clock and epoch.

## Targets and Backends

| Target | Backend | Generic recording | Exact overdub | Proven timing boundary |
|--------|---------|------------------|---------------|------------------------|
| macOS / Windows / Linux / FreeBSD Tauri | Rust native recorder + Kira playback | yes | no | no common playback/record epoch exposed by the public contract |
| iOS app | native recorder bridge | yes | no | app capture is not mapped to the AUv3 render clock |
| iOS AUv3, microphone | Swift microphone recorder | yes | no | microphone frames are not mapped to plugin render frames |
| iOS AUv3, plugin output (`plugin`) | Swift render-path output recorder | yes | no | generic output capture only |
| iOS AUv3, plugin input (`plugin_input`) | same-quantum render-input recorder | yes | yes, after strict validation | `auv3.render` capture clock + `auv3.host_transport` timeline clock + matching `clock_epoch` |
| Browser served by Fastify / Web | `getUserMedia` + recording-only `AudioWorklet` | yes | no | exact local `AudioContext` frames, not a Kira-shared clock |
| Browser or native video | media/container recorder | yes | no | PTS-to-audio-sample mapping is unavailable |
| Android | planned native adapter | planned | no proven support | capability remains unsupported until a common clock contract exists |

## Architecture

The architecture is one logical audio stack with runtime-owned execution paths:

```text
┌─ JavaScript ───────────────────────────────────────────────────────────┐
│  Squirrel.av.audio / runtime media APIs                               │
│  sample_accurate_recording.js / record_audio_api.js                  │
│                                                                       │
│  Responsibilities:                                                    │
│  - transport commands                                                 │
│  - runtime selection                                                  │
│  - typed capability and integer-frame validation                      │
└───────────────────────────────────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
┌─ Tauri / Native App ────────────┐  ┌─ AUv3 / iOS Plugin ──────────────┐
│ Rust audio engine                        │  │ Swift bridge + native render path │
│ platforms/desktop-tauri/src/audio_engine               │  │ platforms/ios/atome-auv3/Common/WebViewManager    │
│ - playback.rs (Kira)                     │  │ platforms/ios/atome-auv3/auv3/AudioUnit...        │
│ - recorder.rs (CPAL)                     │  │ AUv3Recorder.swift / AUv3RenderEngine.swift       │
│ - metering.rs                            │  │                                   │
│ - bridge.rs                              │  │ Responsibilities:                 │
│                                          │  │ - accept JS PCM buffers           │
│ Responsibilities:                        │  │ - inject them in render graph     │
│ - clip loading                           │  │ - capture playback / record frame │
│ - playback                               │  │ - emit record_done analysis       │
│ - recording                              │  │ - expose plugin_input exact fields│
└──────────────────────────────────────────┘  └───────────────────────────────────┘
                                  ┌─ Browser Capture ───────────────────┐
                                  │ getUserMedia + AudioContext         │
                                  │ recording-only AudioWorklet         │
                                  │ - numbered continuous PCM chunks    │
                                  │ - explicit tail flush + flush_ack   │
                                  │ - no Kira-shared clock claim        │
                                  └─────────────────────────────────────┘
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
3. make sample-accurate verification mandatory for paths that request exact overdub
4. route both audio clips and video soundtrack playback through the same engine

An important consequence is that web playback and capture remain two explicit
responsibilities behind the same canonical public contract. The browser recorder does
create a minimal `AudioContext`/`AudioWorklet` graph for capture, frame accounting and
tail flushing. That graph is recording-only: it is not a second playback engine and it
does not make the browser recorder share Kira's clock.

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
| `tests/atome/audio_sample_accurate_recording.test.mjs` | exact capability, clock, latency, and placement contract |
| `tests/atome/record_audio_auv3_clock_contract.test.mjs` | AUv3 event timing and terminal cleanup contract |
| `platforms/ios/atome-auv3/Common/WebViewManager.swift` | shared WebView setup/composition state and injected native bridge bootstrap |
| `platforms/ios/atome-auv3/Common/WebViewManagerScriptMessages.swift` | WK script-message dispatch and local media-path normalization |
| `platforms/ios/atome-auv3/Common/WebViewManagerAudioTransport.swift` | audio/MIDI commands, PCM injection, and host time/transport streams |
| `platforms/ios/atome-auv3/Common/WebViewManagerNavigation.swift` | navigation lifecycle and bounded native media-permission delegation |
| `platforms/ios/atome-auv3/Common/WebViewManagerIPC.swift` | serialized native-invoke responses, JS dispatch throttling, readiness queue, and safe mode |
| `platforms/ios/atome-auv3/Common/AudioControllerProtocol.swift` | common contract for playback / stop / debug expected peak propagation |
| `platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift` | AUv3 controller exposing the audio controller to the WebView bridge |
| `platforms/ios/atome-auv3/auv3/utils.swift` | AUv3 shared render/record state and clock epoch |
| `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift` | record start/stop events and contractual frame/health payload |
| `platforms/ios/atome-auv3/auv3/AUv3RenderEngine.swift` | same-quantum `plugin_input` pull and discontinuity accounting |
| `atome/src/application/audio_runtime/record_audio_api.js` | recording entry point that must converge to the unified engine |
| `atome/src/application/audio_runtime/sample_accurate_recording.js` | exact capability gate and result normalizer |
| `eVe/domains/media/api/audio_api.js` | public recording controller and Molecule capture adapter |
| `eVe/domains/media/api/audio_core_record.js` | browser worklet recorder and native recording facade |
| `eVe/domains/media/api/audio_core_helpers.js` | browser chunk/flush/clock validation and PCM/WAV helpers |
| `eVe/domains/media/api/video_api_record.js` | generic video capture and explicit exact-overdub rejection |

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

Feature code uses `startAudioRecording` / `stopAudioRecording` from
`eVe/domains/media/api/audio_api.js`. `record_audio_api.js` and
`audio_core_record.js` route that canonical request to the runtime-owned adapter; feature
code does not invoke Tauri, Swift, `MediaRecorder` or `AudioWorklet` directly.

```javascript
const started = await startAudioRecording({ fileName: 'take1.wav' });
if (!started.ok) throw new Error(started.error);

const stopped = await stopAudioRecording();
if (!stopped.ok) throw new Error(stopped.error);

const { sample_rate, frame_count } = stopped.result;
const duration_sec = frame_count / sample_rate;
```

Generic recording stays available on browser, desktop/Tauri, iOS app, AUv3 microphone,
AUv3 plugin output and plugin input. It does not imply exact overdub.

Exact recording is opt-in through `require_sample_accurate: true`. Molecule resolves the
capability through `eveMoleculeRecordingCaptureAdapter` before start. The only supported
combination is audio from AUv3 `plugin_input`, pulled in the same render quantum, with:

```javascript
{
  source: 'plugin_input',
  clock_id: 'auv3.render',
  clock_reference: 'record_start_render_quantum',
  timeline_clock_id: 'auv3.host_transport',
  timeline_start_frame,
  timeline_sample_rate,
  require_sample_accurate: true
}
```

The public snake-case flag is normalized to the explicit native bridge field
`requireSampleAccurate: true`. Exact mode is never inferred from `plugin_input`, frame
metadata, or a successful generic capture.

An exact request on desktop/Tauri, iOS app, browser, AUv3 microphone, generic AUv3
`plugin` output or any video source is rejected with
`av_sample_accurate_overdub_unsupported`. Callers may retry as a generic
recording only by deliberately dropping the exact requirement; there is no silent
downgrade.

### Native stop and terminal cleanup

The native recorder has one producer/consumer finalization boundary. `stop` closes
producer admission, waits until every render push that was already in flight has left the
producer boundary, marks the producer drained, then lets the writer empty the ring before
joining it and rewriting the WAV header. The final accepted render quantum is therefore
included in `frame_count`; header size, duration, written frames, overrun frames, and
discontinuity frames all describe the same drained payload.

If native stop has already produced a file but timing/protocol validation makes that
result terminal, the controller enters `finalization_failed`. A later explicit discard
uses the existing `AtomeFileSystem.deleteFile` boundary on the returned file path. Delete
failure or timeout keeps the terminal state retryable and is never reported as a
successful discard. This prevents an invalid take from becoming either a timeline clip or
an orphaned file hidden behind a false cleanup acknowledgement.

### AUv3 / Native PCM Injection Contract

For AUv3 sample-accurate playback validation, JavaScript sends a rendered PCM buffer to Swift. The bridge now accepts:

- `sampleRate`
- `duration`
- `audioData`
- `expectedPeakFrame`

`WebViewManager.handleAudioBuffer(...)` forwards that payload to the native audio controller and also propagates `expectedPeakFrame` to the render path so the native side can report meaningful sample-accuracy metadata on recording stop.

PCM injection is the validation stimulus. It does not make generic `source = "plugin"`
output exact. The exact recorder source is `source = "plugin_input"`, read and accounted
inside the same render quantum.

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
| `audio_get_scope` | — | Read the latest 64-bin min/max envelope, RMS/peak, sequence, sample rate, and channel count published by the active recorder |
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

Sample-accurate overdub is a narrow capability, not a synonym for successful recording.
It is currently supported only for AUv3 `plugin_input` capture because that input is read
in the same native render quantum used for timing. The capability resolver requires
`clock_id = "auv3.render"` and
`clock_reference = "record_start_render_quantum"` for capture, plus
`timeline_clock_id = "auv3.host_transport"` for timeline placement. Start returns the
native `clock_epoch`; stop must return that same epoch. The native bridge receives the
explicit `requireSampleAccurate = true` flag; source selection alone never enables exact
mode.

Exact requests are rejected for desktop/Tauri, iOS app, browser, AUv3 microphone,
generic `plugin` output and video. Their generic recorders remain valid and available, but they must report exact
overdub as unsupported.

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
- `playback_observed_frame`
- `recording_start_frame`
- `expected_peak_frame`
- `sample_rate`
- `frame_count`
- `overrun_frames`
- `discontinuity_frames`
- `output_latency_frames`
- `input_latency_frames`
- `roundtrip_latency_frames`
- `record_offset_frames_applied`
- `clock_id`
- `clock_reference`
- `clock_epoch`
- `timeline_clock_id`
- `timeline_origin_frame`

This is emitted in the `record_done` payload by the AUv3 recorder. The production exact
normalizer rejects missing/invalid frame fields, sample-rate or epoch mismatches, empty
captures, `overrun_frames !== 0`, `discontinuity_frames !== 0`, non-positive input/output/
round-trip latency, a round-trip latency that does not equal input plus output latency, or
an applied record offset that does not equal that measured round-trip latency. It also
requires a real earlier playback start (`playback_start_frame < recording_start_frame`)
and the same-quantum observation proof
(`playback_observed_frame == recording_start_frame`).

### Why Raw Peak Detection Was Not Enough

In exact AUv3 `plugin_input` routing, backing-track playback has a real start before the
recording quantum. The recorder separately latches:

- the actual earlier `playback_start_frame`;
- the `playback_observed_frame` in the recording quantum;
- the same quantum's `recording_start_frame`.

The last two values must be equal. Comparing `first_peak_frame` directly to
`expectedPeakFrame` still ignores the real playback lead and is therefore only a debug
mistake, not a production placement rule.

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
- source: `plugin_input`

This is the key change that makes sample-accuracy evaluation meaningful in the `plugin_input` routing case.

The diagnostic impulse calculation above is not used as an invented placement offset.
Production placement is anchored in the host-transport timeline domain and subtracts the
strictly positive measured duplex round trip:

```text
raw_timeline_start = timeline_origin_frame - roundtrip_latency_frames
source_in_frame     = max(0, -raw_timeline_start)
timeline_start      = max(0, raw_timeline_start)
duration_frames     = frame_count - source_in_frame
```

The exact compensation invariant is:

```text
roundtrip_latency_frames = output_latency_frames + input_latency_frames
record_offset_frames_applied == roundtrip_latency_frames
```

The three latency values must be strictly positive measured integer contract fields;
`record_offset_frames_applied` must be an integer and equal the measured round trip. A
missing value or either equality mismatch rejects exact completion. `plugin_input` in the
AUv3 render graph is the only exact-eligible source; it is exact only after the full result
validation. Generic `plugin` output is not exact. This documentation does not claim a
measured microphone latency or permit an invented offset. Any pull/capacity failure
contributes to `discontinuity_frames` and makes the exact result invalid.

### AUv3 Acceptance Criterion

For an exact AUv3 `plugin_input` scenario, acceptance requires matching render-clock and
host-transport identities, reference, epoch and sample rate, a real earlier playback start,
same-quantum playback observation and recording start, strictly positive duplex latency,
zero overrun/discontinuity, a positive frame count and the expected impulse delta for the
fixture. A generic success payload or an expected `unsupported` scenario is not evidence
that another runtime has acquired this capability.

### Suite Aggregation Rule

The suite now remains `ok` when:

- no scenario ended in `error`
- no scenario ended in `warning`
- any `unsupported` result is expected / non-fatal
- workflow remains valid
- sample-accuracy checks are verified

This prevents AUv3 from being marked unhealthy just because `direct_from_disk` is not implemented yet.

## iOS App Runtime

The iOS app runtime follows the canonical native recording API, but it is not the AUv3
plugin render path. Generic app recording is supported. A request with
`require_sample_accurate: true` is rejected because the app recorder does not return the
`auv3.render` capture clock, `record_start_render_quantum` reference,
`auv3.host_transport` timeline clock/origin and matching epoch.
Shared API shape is not proof of a shared sample clock.

## Browser Runtime Served by Fastify / FreeBSD

This runtime needs to be named explicitly because it is not the same thing as a purely theoretical "web fallback".

When Atome/eVe is served by Fastify on FreeBSD and runs inside a browser:

- playback must still obey the unified engine contract
- audio clip ownership must still converge through the same public facade
- video soundtrack ownership must still converge through the same transport rules
- recording may still require a browser-native capture path

The implemented browser recorder uses `getUserMedia`, an `AudioContext` and a
recording-only `AudioWorklet`. It retains the context sample rate rather than resampling
the take to 16 kHz. Each chunk is numbered and carries start/end worklet frames. On stop:

1. the main thread sends `flush` with a request id;
2. the worklet blocks further input and emits the partial tail, if any;
3. it emits `flush_ack` with total frames, first/last frame, sample rate, flush frame and
   context time;
4. the main thread validates sequence, continuity, frame count and clock coherence;
5. only then does cleanup disconnect nodes, stop tracks and close the context.

`frame_count` is the validated PCM frame count and
`duration_sec = frame_count / sample_rate`. A protocol failure or typed
`audio_recording_flush_timeout` fails the stop; it does not manufacture a partial result.
The result explicitly carries `sample_accurate_overdub = false` and
`capture_clock.shared_with_kira = false`. The worklet path is exact within its own
`AudioContext` frame domain, but that domain is not proven to be Kira's playback clock.

This point is important because otherwise the migration could accidentally end in a split architecture:

- one "real" engine for native runtimes
- one semi-legacy engine for browser mode

That outcome is explicitly out of scope. Browser mode served by Fastify / FreeBSD is part of the migration target, not an excuse to preserve the old playback architecture. The capture worklet is the explicit recording exception, not a playback fallback.

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
- generic plugin output capture and exact plugin-input capture
- debug playback fixtures
- metering and validation

## Migration Inventory

For this document to be usable as a real migration spec, the first rule is to name the current entry points that must converge.

### JavaScript / Framework Entry Points to Migrate

| Area | Current entry points | Migration target |
|------|----------------------|------------------|
| Public clip playback | `atome/src/application/audio_runtime/audio.facade.js`, `atome/src/application/audio_runtime/backend.kira.js` | keep one public facade and no legacy backend fallback |
| Audio recording | `eVe/domains/media/api/audio_api.js`, `eVe/intuition/tools/capture.js`, `atome/src/application/audio_runtime/record_audio_api.js` | one recording contract backed by the unified native engine |
| Video recording / media capture | `eVe/domains/media/api/video_api.js`, `atome/src/application/examples/record_video.js`, `atome/src/application/examples/record_video_UI.js` | separate visual capture is allowed, but audio persistence and playback must converge |
| Shared media persistence | `eVe/domains/media/api/media_api_shared.js` | remain the canonical helper layer for project/user/storage resolution |
| Media Atome persistence/rendering | `eVe/domains/media/api/media_persistence_service.js`, `eVe/domains/media/rendering/project_media_atome_renderer.js` | all media Atomes use one durable association and project projection boundary |
| AUv3 native bridge | `platforms/ios/atome-auv3/Common/WebViewManager.swift`, `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift`, `platforms/ios/atome-auv3/auv3/AUv3RenderEngine.swift`, `platforms/ios/atome-auv3/auv3/utils.swift` | exact `plugin_input` reference implementation |
| Contract validation | `tests/atome/audio_sample_accurate_recording.test.mjs`, `tests/atome/record_audio_auv3_clock_contract.test.mjs` | executable exact assertions apply only to advertised `plugin_input` capability |
| Molecule integration | `eVe/intuition/tools/molecule/runtime.js`, `eVe/intuition/tools/molecule/recording/index.js` | timeline recording consumes the unified engine clock and canonical capture adapter |

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

### Recording Viewfinder Boundary

Generic video file capture and its recording feedback share the controller-owned source.
Browser/Tauri feedback registers that existing `MediaStream` with the shared Bevy external
image route; its hidden decoder is non-interactive and never owns or stops recorder tracks.
Native iOS feedback reads the latest bounded BGRA frame produced by
`AVCaptureVideoDataOutput` on the recorder's existing `AVCaptureSession`, converts it off
the capture callback, and submits at most 96 x 96 pixels at 15 fps to the same Bevy tool
overlay. No visible DOM media node, native preview layer, JPEG preview, second canvas, or
parallel renderer is permitted. Photo capture has no viewfinder and emits only the 120 ms
Bevy shutter flash.

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
- generic native recording is supported, but exact overdub requests are rejected until a
  common Kira playback/record clock id, reference and epoch are exposed and validated

### iOS App

- the app runtime must align with AUv3 transport semantics where native playback is involved
- app-level audio ownership must converge with the same unified media contract
- validation must not rely on separate app-only playback assumptions
- generic recording remains supported; exact overdub is rejected because the app bridge
  does not expose the AUv3 plugin render-clock contract

### AUv3

- exact overdub is limited to `source = "plugin_input"`; `source = "plugin"` remains generic
- exact mode requires the explicit native `requireSampleAccurate` flag; it is never inferred from the source
- microphone capture remains generic and must not inherit the `plugin_input` capability
- capture uses `auv3.render`, while placement uses `auv3.host_transport`
- `playback_start_frame` must be earlier than `recording_start_frame`, and `playback_observed_frame` must equal `recording_start_frame`
- exact results must preserve `frame_count`, measured input/output/round-trip latency,
  matching applied record offset, overrun/discontinuity, clock identity, reference and
  epoch fields
- pull/capacity errors must increment discontinuity accounting and invalidate exactness

### Web

- web must converge on the same canonical engine contract without retaining a supported
  fallback path
- remaining legacy paths must not be invoked as runtime fallbacks and must be removed
  after their owning features use the canonical engine
- for browser mode served by Fastify / FreeBSD, playback ownership must still converge to the unified contract
- the recording-only `AudioWorklet` must flush its partial tail and acknowledge stop before
  cleanup; it must remain separate from playback ownership
- browser recording explicitly reports `sample_accurate_overdub = false` because its
  `AudioContext` clock is not shared with Kira

## Cutover Plan by Subsystem

### Subsystem 1: Public Audio Playback

Definition of done:

- all public audio playback enters through `Squirrel.av.audio`
- `backend.kira.js` or its successor is the preferred native route
- the removed legacy AUv3 backend must stay absent; it is not a supported fallback
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
- generic and exact requests remain distinct, with no silent downgrade
- only validated AUv3 `plugin_input` results may produce frame-exact timeline placement

### Subsystem 5: MTrack

Definition of done:

- MTrack transport is engine-clocked
- all audible clips are engine-managed sources
- preview and timeline playback follow the same routing semantics
- video clip soundtrack playback is engine-owned

### Subsystem 6: Debug / Validation

Definition of done:

- runtime validation observes production audio paths
- AUv3 `plugin_input` exact scenarios pass all clock/frame/health gates
- app/native runtimes expose enough metrics for regression detection

## Definition of Done for the Full Migration

The framework migration can be called complete only when all of the following are true:

1. `audio`, `sound`, `video`, `audio_recording`, and `video_recording` atomes all resolve to one media ownership model.
2. MTrack transport uses the unified engine as audible clock owner.
3. Video soundtrack playback is routed through the unified engine everywhere it matters.
4. Recording outputs are replayed through the same engine as imported media.
5. No production feature depends on direct `HTMLAudioElement` or `HTMLVideoElement` audio output when a unified native backend is available.
6. AUv3 `plugin_input` exact validation passes before that capability is advertised.
7. Fallback backends are compatibility-only, not first-class production paths.
8. Browser mode served by Fastify / FreeBSD follows the same ownership rules and only keeps the minimal browser-specific capture exception, if still required.
9. Native FreeBSD / Tauri runtime prerequisites are documented and provisioned, including `JACK` if confirmed necessary for audio operation.
10. Exact overdub capability remains false for browser, desktop/Tauri, iOS app,
    AUv3 microphone, generic `plugin` output and video until each path proves a shared
    sample clock and epoch.

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
| Removed legacy AUv3 backend | deleted fallback path | remains absent | reject any attempt to restore backend-specific feature ownership | no production feature imports a legacy backend | `retire` |
| `eVe/domains/media/api/media_persistence_service.js` | durable media association and project projection | canonical media boundary | await project projection after commit while preserving the durable record on render failure | committed media ID is visible or returns explicit `renderError` | `target` |

### Recording and Persistence

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `eVe/domains/media/api/audio_api.js` | public capture/persistence controller + Molecule adapter | canonical audio recording adapter | keep generic and exact requests separate and surface typed capability errors | recorded media persists; unsupported exact requests are never downgraded | `target` |
| `atome/src/application/audio_runtime/record_audio_api.js` | runtime recording bridge | canonical recording bridge | route browser/native/AUv3 while preserving runtime capability boundaries | generic start/stop works; exact start only succeeds for AUv3 `plugin_input` | `target` |
| `atome/src/application/audio_runtime/sample_accurate_recording.js` | exact capability and normalization contract | remains exact gate | require explicit exact mode, render + host-transport clocks, real playback/observation frames, strictly positive duplex latency, matching epoch/rate and zero overrun/discontinuity | unsupported runtimes reject; accepted result yields deterministic `timeline_origin_frame - roundtrip_latency_frames` placement | `target` |
| `eVe/domains/media/api/audio_core_record.js` | browser capture plus native facade | canonical generic browser recorder | preserve AudioContext rate, numbered chunks and tail `flush_ack`; never claim shared Kira time | WAV frame count equals validated chunks; exact overdub remains false | `target` |
| `eVe/intuition/tools/capture.js` | capture-tool orchestration | UI wrapper over canonical recording APIs | keep UI state separate from backend choices and timing semantics | tools trigger only the canonical audio/video controllers | `target` |
| `eVe/intuition/tools/core/tool_runtime_recording_handlers.js` | BevyUI action routing | UI action boundary | delegate start/stop to registered capture handlers | tool latches reflect controller results without becoming recorder state | `target` |
| `eVe/domains/media/api/media_api_shared.js` | shared media persistence helpers | remains canonical media helper layer | keep as common source for auth, path, project and media metadata resolution | audio/video APIs resolve the same canonical media fields | `target` |

### Video and Soundtrack Ownership

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `eVe/domains/media/api/video_api.js`, `video_api_record.js` | generic video capture / persistence wrapper | canonical generic video adapter with engine-owned soundtrack | keep capture/persistence concerns; reject exact requests with `av_sample_accurate_overdub_unsupported` until PTS maps to the sample timeline; expose only the controller-owned live source to the shared Bevy feedback route | video playback does not emit double audio; exact video is never advertised; feedback disposal never stops recorder tracks | `bridge` |
| `atome/src/application/examples/record_video.js` | browser/video capture implementation | capture-only wrapper | keep only capture-specific logic; remove long-term playback ownership | recorded video replays with engine-owned soundtrack | `current` |
| `atome/src/application/examples/record_video_UI.js` | video recording UI | UI only | keep UI concerns; delegate playback/record ownership to canonical APIs | UI never owns production soundtrack playback | `current` |
| DOM / native video element audio output | local visual media element | unified engine soundtrack routing | mute local media-element audio whenever engine soundtrack is active | no double-output audio, seek/rate stay synchronized | `retire` |

### AUv3 and Apple Native Bridge

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `platforms/ios/atome-auv3/Common/WebViewManager*.swift` | shared WebView composition, script dispatch, audio transport, navigation and IPC | canonical AUv3 bridge split by responsibility | keep one native-invoke route while accepting PCM payloads and expected peak metadata | debug fixture injection and native recording commands still use the same bridge | `target` |
| `platforms/ios/atome-auv3/Common/AudioControllerProtocol.swift` | AU audio control contract | remains shared native contract | preserve unified methods for play/stop/inject/debug peak propagation | all AU controllers expose the same contract | `target` |
| `platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift` | AUv3 host/controller | unified AUv3 controller | keep transport ownership thin; delegate signal semantics to the audio engine path | playback/record/debug commands remain stable | `target` |
| `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift`, `AUv3RenderEngine.swift`, `utils.swift` | AUv3 record/render implementation | canonical AUv3 exact reference | preserve same-quantum input pull, frame tracking, health counters and `record_done` payload | valid `plugin_input` stays exact; any pull/capacity discontinuity rejects | `target` |

### Debug and Validation

| Module / file | Current owner | Target owner | Required migration action | Validation | Status |
|---------------|---------------|--------------|---------------------------|------------|--------|
| `tests/atome/audio_sample_accurate_recording.test.mjs`, `record_audio_auv3_clock_contract.test.mjs` | maintained executable contracts | canonical validation harness | validate production payload invariants and typed unsupported outcomes | valid exact fixtures normalize to the expected integer-frame placement | `target` |
| AUv3 native timing payloads | native record-stop analysis | canonical runtime timing contract | expose clock id/reference/epoch, sample rate, frame count, start frames, measured input/output/round-trip latency, matching applied offset and overrun/discontinuity | exact `plugin_input` result passes strict normalization | `target` |
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
| `eVe/intuition/tools/molecule/runtime.js` | active timeline feature runtime | unified engine transport client | consume explicit frame/clock contracts without owning recorder semantics | Molecule recording is engine-clocked and committed through its session | `target` |
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
5. For AUv3 `plugin_input`, exact clock/frame/health validation passes.

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

### 3. Recording Must Converge to One Canonical Contract

All recording flows must converge to the unified engine contract:

- microphone recording
- generic plugin output recording
- exact AUv3 plugin-input recording
- browser capture through the recording-only worklet adapter
- diagnostic fixture capture

`record_audio_api.js` should be treated as an adapter layer, not as an alternative recording system.

### 4. Debug and Metering Must Observe the Same Engine

Waveform views, peak meters, validation tools, and debug panels must read from the actual production engine path. A debug meter is only useful if it observes the same signal path that the user hears or records.

### 5. Sample Accuracy Is Part of the Contract

For controlled runtimes such as AUv3 `plugin_input` routing, timing is no longer a best-effort property. It is now part of the engine contract.

If a new path cannot expose enough timing information to validate:

- playback start
- record start
- sample rate and positive frame count
- common clock identity, reference and epoch
- measured input/output/round-trip latency and an applied offset equal to that round trip
- overrun and discontinuity counts

then that path may remain a generic recorder, but its exact capability must be false.
Video remains generic until a validated PTS-to-audio-sample mapping exists.

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

- `play_record_sync` must verify sample accuracy only for `plugin_input`
- `sample_alignment` must verify sample accuracy only for `plugin_input`
- `direct_from_disk` may remain `unsupported` temporarily
- final suite status must still be `ok` when all required checks pass
- any plugin-input pull/capacity error must surface as discontinuity and invalidate the
  exact result

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
