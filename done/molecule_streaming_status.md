# Molecule Streaming and Audio Status

Last updated: 2026-04-27

Current validation status:

- `npm run -s probe:browser-media-acceptance` passes end to end.
- Desktop acceptance is green.
- MTrack acceptance is green.

Validated media set:

- Desktop: `0000.png`, `atome.svg`, `Jeezs's fire.m4v`, `Vampire.m4v`, `test.m4a`
- MTrack: `0000.png`, `atome.svg`, `Jeezs's fire.m4v`, `Vampire.m4v`, `test.m4a`

## Completed Fixes

### Done — Browser Kira route aligned with `web_wasm_kira`

Files:

- `eVe/domains/mtrax/audio/hmtracks_native_audio_runtime.js`
- `eVe/domains/mtrax/audio/hmtracks_native_playback_runtime.js`
- `eVe/intuition/tools/core/hmtracks_audio_engine_v1.js`

Result:

- Browser MTrack now uses the Kira/WASM playback route instead of falling back to the Web Audio decode path for protected clip preparation and playback control.

### Done — Protected browser media auth aligned across MTrack and Molecule

Files:

- `eVe/domains/mtrax/media/source_runtime.js`
- `eVe/domains/mtrax/media/authorized_playback_runtime.js`
- `eVe/core/media_engine/molecule.js`
- `eVe/core/media_engine/molecule.api.js`

Result:

- Browser auth requests merge local auth headers correctly.
- Protected browser video uses direct authenticated URLs instead of byte-prefetch blob transport.
- Molecule duration probing and mounted `<video>` playback use authenticated direct URLs for protected uploads.

Observed effect:

- Desktop protected media failures dropped to zero.
- Final probe no longer shows the previous protected video auth regressions.

### Done — MTrack Kira playback runtime regression fixed

File:

- `eVe/domains/mtrax/audio/hmtracks_native_playback_runtime.js`

Root cause:

- `scheduleNativeKiraVoice()` used `bridge` internally without receiving it as an argument.
- On browser Kira/WASM playback this threw `ReferenceError: bridge is not defined` during `play`.
- That exception bubbled through `syncHmtracksNativeAudioPlayback()` into `updatePlaybackFrame()`, which stopped playback with `engine_start_update_frame_failed`.

Fix:

- Pass `bridge` explicitly into `scheduleNativeKiraVoice()` from both Kira scheduling call sites.

Observed effect:

- `Jeezs's fire.m4v`, `Vampire.m4v`, and `test.m4a` now pass in MTrack.
- Final probe shows no `engine_start_update_frame_failed` occurrences.

## Remaining Architecture Work

### Open — Stream uploads on the server instead of buffering entire request bodies

Target file:

- `server/server.js`

Problem:

- The upload route still buffers large request bodies in RAM before writing them.

Target outcome:

- Route-level streaming upload handling with direct write-to-disk and post-write registration.

Recommended validation:

- Add a dedicated large-upload probe.
- Re-run `npm run -s probe:browser-media-acceptance` after the server-side change.

### Open — Add a real URL/streaming load path for Kira WASM

Target files:

- `src/application/audio_runtime/backend.kira.js`
- `src/wasm/squirrel_audio_wasm.js`
- related Rust/WASM binding sources

Problem:

- Browser Kira/WASM still depends on a bytes-loading path, which keeps the file in JS memory before handing it to the WASM layer.

Target outcome:

- A native WASM URL-loading or stream-loading entry point so browser audio can be loaded without full JS heap buffering.

Recommended validation:

- Add a dedicated large-audio WASM probe.
- Re-run `npm run -s probe:browser-media-acceptance` after the runtime change.

## Current Architecture Snapshot

Browser video:

- Protected video should stay on direct authenticated URLs.
- Browser networking handles range requests.
- Molecule/WebGPU consumes decoded video frames.

Browser audio:

- Runtime target is `web_wasm_kira`.
- MTrack playback now reaches the Kira/WASM control path correctly.
- Large-file memory behavior is still limited by the current bytes-loading WASM boundary.

Server uploads:

- Functional for current acceptance coverage.
- Not yet stream-safe for large media.
