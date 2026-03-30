# Audio Engine System Dependencies

## Overview

The unified audio engine uses **CPAL 0.15** (low-level I/O) and **Kira 0.12** (high-level mixer/playback).
Both rely on the platform's native audio subsystem via `cpal::default_host()`.

## Per-Runtime Requirements

### macOS (Tauri desktop)

- **Backend**: CoreAudio (built into macOS)
- **Extra packages**: none
- **Notes**: Works out of the box on all macOS versions supported by Tauri

### iOS / AUv3

- **Backend**: CoreAudio via AVAudioEngine (Swift)
- **Extra packages**: none
- **Notes**: AUv3 uses a dedicated Swift render block (`utils.swift`), not CPAL.
  The Kira/CPAL engine is not compiled for AUv3 targets.
  Recording uses the C FFI bridge (`squirrel_recorder_core_*`), which is deprecated
  and will be migrated in a future phase.

### Linux (Tauri desktop)

- **Backend**: ALSA (default CPAL host on Linux)
- **Required packages**:
  - `libasound2-dev` (Debian/Ubuntu) or `alsa-lib-devel` (Fedora/RHEL)
- **Optional**: PipeWire or PulseAudio ALSA plugin for session-level audio routing
- **JACK**: Not required by default. CPAL 0.15 does not enable the `jack` feature
  unless explicitly opted-in via `cpal = { version = "0.15", features = ["jack"] }`.
  If JACK support is needed, add the feature and install `libjack-dev`.

### FreeBSD (Tauri / Fastify server)

- **Backend**: OSS (default CPAL host on FreeBSD via the `oboe` or `oss` backend)
- **Required packages**:
  - FreeBSD ships OSS natively (`/dev/dsp`), no extra package required for basic audio
  - If running headless (Fastify-only server), audio output may not be available;
    CPAL will fail to open a device. This is expected — the browser takes over
    playback via WASM Kira.
- **JACK on FreeBSD**: Install `jackit` from ports/pkg if JACK is required.
  Enable with `cpal = { version = "0.15", features = ["jack"] }` in Cargo.toml.
  JACK is NOT confirmed necessary for the current architecture; the server
  runtime delegates playback to the browser (WASM Kira).
- **Recording on FreeBSD server**: Audio capture requires a real audio input device.
  For server-hosted browser sessions, recording uses `getUserMedia` + `AudioWorklet`
  in the browser, not CPAL on the server.

### Browser (Fastify-served / PWA)

- **Playback**: WASM Kira module (`src-audio-wasm/`) compiled to WebAssembly
- **Recording**: `getUserMedia` + `AudioWorklet` (browser-native, no server-side audio)
- **Required**: Modern browser with WebAssembly and AudioWorklet support
- **Notes**: If WASM Kira fails to load, the `backend.html.js` WebAudio fallback
  is available but deprecated and not sample-accurate.

## Cargo.toml Reference

```toml
cpal = "0.15"
kira = { version = "0.12", features = ["cpal", "wav", "mp3", "ogg", "flac"] }
hound = "3"
ringbuf = "0.4"
```

## JACK Necessity Assessment

JACK is **not confirmed necessary**. The current architecture uses:

- CPAL `default_host()` which selects CoreAudio (macOS), ALSA (Linux), or OSS (FreeBSD)
- No explicit JACK host selection in the Rust code
- Server-side (Fastify/FreeBSD) does not perform audio playback; it serves the WASM module

JACK would only be needed if:

1. The deployment requires routing audio between applications on Linux/FreeBSD
2. Professional low-latency audio I/O is required on the server itself (unlikely for a web server)
