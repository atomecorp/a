# The native voice session cannot be opened a second time

## Symptom

On Tauri (macOS, Windows, Android) and in the iOS app, the native voice engine opens once. Any later
`audio_voice_start` in the same process fails with
`voice_vad_failed: only one environment is allowed per process`: the guide restarted after an engine
error, a second conversation, standby resumed after the app went to the background.

## Cause

ONNX Runtime through `ort` 2.0.0-rc.15 builds one environment per process, ever:
`EnvironmentBuilder::build` refuses as soon as its global `CURRENT_ENV` was set once
(`ort/src/environment.rs:516`), even after that environment was dropped. `VoiceEngine::load`
called `ort::environment::init().build()` at every session start.

## Fix

`atome/engines/audio-engine/src/voice/mod.rs#environment`: the process's one environment, built at the
first session, kept in a static and cloned (it is an `Arc`) into every later session. Any new ONNX user
in a native process takes it from there, never builds its own.

## Regression

- `cargo test -p atome-audio-engine --features voice voice::tests::every_session_shares_the_one_process_environment`
  (link libvosk: `RUSTFLAGS="-L native=platforms/desktop-tauri/native/lib"`, `DYLD_LIBRARY_PATH` the same).
- `temp/r246_v3/parity` (R-246 V3 probe): five voice sessions opened and closed in one process, 0 error.

## Acceptance

Open the guide, hang up, let standby resume, open the guide again: each start succeeds.
