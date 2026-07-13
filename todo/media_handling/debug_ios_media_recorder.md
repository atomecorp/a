# Debug iOS Media Recorder After Renderer Unification

Status: pending until MTRAX / molecule / Bevy path unification is complete.
Scope: repair iOS app and AUv3 audio/video recording without adding fallbacks or new parallel media paths.

## Non-negotiable constraints

- Do not start this repair before the renderer/media path unification is merged.
- Do not reintroduce DOM media rendering for project atomes.
- Do not use `navigator.mediaDevices`, `MediaRecorder`, or browser `AudioContext` recording as an iOS/AUv3 fallback.
- Do not create another MTRAX-specific media persistence path.
- Do not persist `blob:`, `file://`, absolute iOS sandbox paths, or temporary preview URLs.
- Keep persisted media references limited to stable `file_path`, `media_url`, recording id, owner id, and normalized media metadata.
- Keep Bevy as the renderer for project atomes. HTML stays limited to tools, panels, menus, and overlays.

## Current verified failures

### MTRAX audio recording on iOS

`eVe/domains/mtrax/media/record_capture_runtime.js` still starts audio recording through:

- `navigator.mediaDevices.getUserMedia({ audio: true, video: false })`
- `MediaRecorder`

That is wrong for iOS app and AUv3. The native audio recorder already exists:

- JS: `atome/src/application/audio_runtime/record_audio_api.js`
- iOS app Swift: `platforms/ios/atome-auv3/application/ViewController.swift`
- AUv3 Swift: `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift`

When audio and video are armed together, audio starts first. If the browser audio path fails, MTRAX returns before reaching the native video path. This makes audio + video appear broken even though the native video route exists.

### Audio tool oscilloscope on iOS/AUv3

The live scope in `eVe/intuition/tools/capture_audio_scope.js` can render only:

- a `MediaStream`
- a native-style `level_meter` source with `readLevels()`

Native recording returns `stream: null`, which is correct. The missing piece is a native live meter contract. `eVe/intuition/tools/capture_audio_scope_source.js` expects one of:

- `window.audio_get_levels`
- `window.audioGetLevels`
- `window.__SQUIRREL_AUDIO_GET_LEVELS__`
- native invoke command `audio_get_levels`

There is no iOS/AUv3 implementation for this contract. AUv3 has an old `updateAudioVisualization` channel, but the current eVe scope does not consume it. Treat that as legacy or remove it during repair.

## Required post-unification repair plan

### 1. Audit the final unified media entry points

Before editing, identify the single canonical post-unification functions for:

- starting an audio recording session
- stopping an audio recording session
- starting a video recording session
- stopping a video recording session
- creating/persisting `audio_recording` and `video_recording` atomes
- resolving `file_path` and `media_url`
- projecting persisted media atomes into Bevy

Do not repair against any path that the unification has deprecated.

### 2. Route MTRAX audio recording to native iOS/AUv3

For iOS app and AUv3, MTRAX audio must use the existing native recorder contract:

- `record_start`
- `record_stop`
- iOS app command: `audio_record_start`
- iOS app command: `audio_record_stop`
- AUv3 bridge action: `record_start`
- AUv3 bridge action: `record_stop`

The MTRAX audio path must not call `getUserMedia` or `MediaRecorder` in iOS/AUv3 runtime.

Expected shape:

```text
MTRAX record request
  -> canonical recording session orchestration
  -> native audio backend for iOS/AUv3
  -> native result with file_path/frame_count/sample_rate/channels/duration
  -> canonical media persistence
  -> Bevy-projected audio_recording atome
```

### 3. Keep native video recording on the native iOS route

The existing native video route uses:

- JS controller: `eVe/domains/media/api/video_recording_controller.js`
- native command: `media_video_record_start`
- native command: `media_video_record_stop`

After unification, MTRAX must still reach that native route for iOS video recording. Do not replace it with browser `MediaRecorder`.

### 4. Fix mixed audio + video recording ordering

Mixed recording must not fail before native video is reached because native audio setup failed through a browser-only path.

The session orchestration should either:

- start native audio and native video through one coordinated recording session, or
- prepare both native backends and fail atomically before any partial persisted media is created.

If one backend fails after another has started, stop and discard the already-started backend through the same canonical discard/finalize path. Do not leave orphan files or pending runtime sessions.

### 5. Add the native live level meter contract

Implement one canonical native meter contract consumed by `resolveAudioScopeSource()`.

Required public shape:

```js
{
  peak: number,
  rms: number,
  value: number
}
```

Values must be normalized to `0..1`.

iOS app should expose levels from the active `AVAudioEngine` recording tap. AUv3 should expose levels from the active mic recorder or plugin recorder source, depending on the recording source. The scope should poll the same canonical reader; do not wire the UI to `updateAudioVisualization`.

### 6. Remove or quarantine obsolete visualization channels

If `updateAudioVisualization` is no longer the canonical contract, either remove it or leave it explicitly isolated from the Audio tool scope. Do not keep two live metering APIs for the same purpose.

### 7. Preserve canonical persistence

Every successful native recording must produce enough data for canonical persistence:

- `file_name`
- `file_path`
- `media_url`
- `duration_sec`
- `frame_count` for audio where available
- `sample_rate`
- `channels`
- `size_bytes`
- `provider`
- `source`

`absolute_file_path` may be returned for native diagnostics, but must not become persisted project state.

## Validation checklist

Run the narrowest checks first, then widen only after the root checks pass.

### Static contract checks

- Confirm no iOS/AUv3 MTRAX audio path calls `getUserMedia` or `MediaRecorder`.
- Confirm MTRAX video iOS still reaches `media_video_record_start` / `media_video_record_stop`.
- Confirm mixed audio + video recording does not return before preparing the native video path because of a browser audio failure.
- Confirm `resolveAudioScopeSource()` can obtain a native `level_meter` source in iOS/AUv3.
- Confirm the Audio scope does not depend on `updateAudioVisualization`.

### JS tests

Re-run the existing focused checks:

```bash
npm run test:run -- tests/eve/media_persistence_service.sanitization.test.mjs
npm run test:run -- tests/eve/video_recording_preview_stream_contract.test.mjs
npm run test:run -- tests/probes/record_capture_source_atome_contract.test.mjs
npm run test:run -- tests/probes/selected_project_video_audio_sync.test.mjs
node --test atome/src/application/audio_runtime/runtime_audio_backend.strict_native.test.mjs
node --test eVe/intuition/tools/core/hmtracks_audio_engine_v1.strict_native.test.mjs
```

Add or update focused tests only if the unified path has no coverage for:

- iOS/AUv3 MTRAX audio using native record start/stop
- mixed audio + video native session startup/failure cleanup
- native audio level meter source resolution

### iOS/AUv3 smoke validation

Required manual/runtime evidence before declaring fixed:

- iOS app audio-only recording creates a playable `audio_recording` atome.
- AUv3 audio-only recording creates a playable `audio_recording` atome.
- iOS app video-only recording creates a playable `video_recording` atome.
- iOS app mixed audio + video recording no longer fails in the audio branch before video starts.
- Audio tool oscilloscope moves during iOS app recording.
- Audio tool oscilloscope moves during AUv3 recording.
- Stopped recordings survive reload through stable `file_path` / `media_url`.

## Completion criteria

The repair is complete only when:

- iOS/AUv3 recording never falls back to browser capture.
- MTRAX, capture tool, and persisted media all use the unified post-cleanup path.
- The Audio tool live scope receives native levels through one canonical meter contract.
- Bevy renders the resulting media atomes.
- No obsolete duplicate recording or metering path remains active.
