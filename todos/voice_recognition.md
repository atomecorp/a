# Voice Recognition (Deferred)

Status: deferred (not doing now). This note captures the plan so we can resume quickly later.

## Goal
Add cross-platform speech-to-text for Tauri desktop + mobile using `tauri-plugin-stt`.

## Scope
- Desktop: macOS, Windows, Linux (Vosk offline models).
- Mobile: iOS, Android (native speech APIs).
- UI: real-time transcript + interim results + errors.

## Tasks
- [ ] Decide target platforms for the first MVP (desktop only vs full mobile).
- [ ] Add Rust plugin in `src-tauri/Cargo.toml` and register in `src-tauri/src/main.rs`.
- [ ] Add permissions to `src-tauri/capabilities/default.json` (stt + mic).
- [ ] Add JS bindings package and a small wrapper module (start/stop, events).
- [ ] Wire UI state (listening, processing, idle) and transcript display.
- [ ] Add error handling + permission prompts in UI flow.
- [ ] Add download progress UI for desktop Vosk models.
- [ ] Add settings for language selection and continuous mode.
- [ ] Update build scripts to enable STT feature flag.

## Platform Notes
- iOS: add `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription`.
- Android: add `RECORD_AUDIO` permission.
- Desktop: install or bundle `libvosk` and verify model download paths.

## Testing
- [ ] Verify mic permissions on each platform.
- [ ] Verify interim results and final results.
- [ ] Verify offline behavior on desktop (after model download).
- [ ] Verify error cases (no mic, denied permission, no network).
