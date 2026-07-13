# Recording Integration Plan

Status: Specification and implementation backlog. Completed items are marked explicitly; remaining items are active work.

## Goal

Build one coherent recording pipeline for browser, Tauri, iOS/AUv3, Node V3, and the future multitrack recorder.

The target behavior is:

- Record direct-to-disk whenever a native runtime can do it.
- Preserve sample-accurate timing metadata for multitrack placement.
- Produce playable project atomes immediately after stop.
- Keep the UI gesture path independent from the capture backend.
- Avoid divergent recorder implementations with different result shapes.

## Canonical API

All runtimes should converge on:

```js
record_start({
  sessionId,
  fileName,
  filePath,
  source,
  sampleRate,
  channels,
  timelineStartFrame,
  timelineSampleRate
})

record_stop(sessionId)
```

The canonical stop payload must include:

```js
{
  session_id,
  file_name,
  file_path,
  absolute_file_path,
  duration_sec,
  frame_count,
  sample_rate,
  channels,
  provider
}
```

`duration_sec` is derived from `frame_count / sample_rate`, not wall-clock time.

## Runtime Strategy

Browser:

- Use the browser capture backend explicitly when the browser runtime is selected.
- Use AudioWorklet only for PCM capture.
- Validate that chunks are non-empty and generate a playable WAV before creating atomes.

Tauri:

- Use native direct-to-disk capture through `audio_record_start/audio_record_stop`.
- Use CPAL input and Hound WAV writing.
- Default to Int24 or Float32 for production capture.
- Return exact `frame_count` from the native writer path.

iOS/AUv3:

- Do not rely on browser Media Capture.
- Route recording through Swift native APIs.
- Use `AVAudioRecorder` for simple microphone/file capture or `AVAudioEngine` where graph/plugin capture is required.
- Emit `record_started`, `record_done`, and `record_error` with the same session id contract.

Node V3:

- Treat as native-provider only.
- Expose a `record_start/record_stop` provider with the same payload contract.
- Do not assume `navigator.mediaDevices`.

## Multitrack Requirements

- Every recording session needs a declared timeline sample rate.
- Start and stop must store frame positions, not just seconds.
- Clip placement must use integer frames.
- Drift correction belongs in playback/monitoring, not in recorded clip metadata.
- Direct-to-disk recording should never depend on UI frame rate or JavaScript timers.

## Immediate Tasks

1. Normalize native stop payloads to preserve frontend-relative `file_path` and expose absolute paths separately.
2. Return native `frame_count` from Tauri recording.
3. Make audio atome creation consume `frame_count`, `sample_rate`, and a stable recording path.
4. Replace direct `getUserMedia` preview assumptions with a capture-provider abstraction.
5. Add browser probe: Atom swipe up -> audio item -> record -> stop -> atome rendered -> URL fetch -> decode/play.
6. Add Tauri native smoke: `audio_record_start` -> wait -> `audio_record_stop` -> WAV exists -> frame count > 0 -> load/play.
7. Add iOS/AUv3 bridge smoke: start/stop messages round-trip with matching `sessionId`.

## Acceptance Criteria

- Browser recordings are playable after creation and survive reload/listing.
- Tauri recordings are direct-to-disk and return exact `frame_count`.
- iOS/AUv3 never falls back to web Media Capture for recording.
- Node V3 reports unsupported unless a native provider is registered.
- Multitrack clips can be placed using integer start frame and duration frame values.

## Current Implementation Status

Done in this pass:

- Tauri direct-to-disk stop now returns `frame_count` and derives `duration_sec` from frames.
- Tauri stop payload keeps logical `file_path` separate from `absolute_file_path`.
- Browser WebAudio stop returns `frame_count`, `fileName`, and `file_path`.
- Browser recording playback now falls back to local IndexedDB cache and Fastify can serve recording files stored under `recordings/` through the existing upload download route.
- Native/iOS/Tauri capture preview no longer requires `navigator.mediaDevices.getUserMedia`; it renders a provider-neutral audio preview when web capture is unavailable.
- Unified native `record_audio` stop creates an `audio_recording` atome when the native bridge only returns a file path.
- Added a focused local probe at `tests/probes/audio_recording_quick_capture_probe.test.mjs` for Atom swipe reveal, browser record/stop, and WAV decode.

Validated:

- `node --check src/application/audio_runtime/record_audio_api.js`
- `node --check eVe/domains/media/api/audio_api.js`
- `node --check eVe/intuition/tools/capture.js`
- `node --check server/server.js`
- `cargo check` in `src-tauri`
- `cargo test audio_engine_tests::test_metering` in `src-tauri`
- `node src/squirrel/voice/bootstrap.test.mjs`
- `node tests/probes/eve_runtime_transport_record_reveal_probe.test.mjs`
- `node tests/probes/audio_recording_quick_capture_probe.test.mjs`

Probe result:

- Atom swipe-up quick capture reveals `video`, `photo`, `audio`, and `record`.
- Browser recording produced `frame_count: 13440`, `sample_rate: 16000`, `duration_sec: 0.84`.
- The resulting WAV fetched and decoded successfully with decoded duration `0.84`.

Remaining work:

- Run a real Tauri microphone smoke test against hardware, not only `cargo check`.
- Run an iOS/AUv3 bridge smoke test and require `record_done.frame_count`.
- Add Node V3 native provider registration or keep `record` explicitly unsupported.
- Harden the Rust CPAL callback path so sample write errors are stored and surfaced on stop.
- For multitrack, add timeline start/stop frame metadata and place clips by integer frames.
