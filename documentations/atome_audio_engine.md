# Atome Audio Engine — CPAL + Kira

## Overview

The Atome audio engine is a unified, cross-platform audio system built on two Rust crates:

- **CPAL** (v0.15) — low-level audio I/O (input/output streams, device enumeration)
- **Kira** (v0.12) — high-level playback engine (mixer, effects, tweens, clocks, spatial audio)

It replaces the previous fragmented system (Obj-C AVAudioEngine for macOS, Swift AVAudioEngine for iOS, Tone.js/WebAudio for web) with a single Rust codebase that compiles to:

| Target | Backend | Playback | Recording | Build |
|--------|---------|----------|-----------|-------|
| macOS (Tauri) | CoreAudio | native | native | `cargo build` |
| iOS (Tauri) | CoreAudio | native | native | `cargo build --target aarch64-apple-ios` |
| Android (Tauri) | AAudio / OpenSL ES | native | native | `cargo build --target aarch64-linux-android` |
| Web (browser) | Web Audio API | WASM | WASM | `wasm-pack build` |
| Windows | WASAPI | native | native | `cargo build` |
| Linux | ALSA/PipeWire | native | native | `cargo build` |
| FreeBSD | JACK (required) | native | native | `cargo build` |

## Architecture

```
┌─ JavaScript ──────────────────────────────────────┐
│  Squirrel.av.audio  (audio.facade.js)             │
│  └─ Backend: 'kira' (backend.kira.js)             │
│      ├─ Tauri: window.__TAURI__.core.invoke(…)    │
│      └─ Web:   WASM module direct calls           │
└───────────────────────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │     Rust Audio Engine       │
         │  src-tauri/src/audio_engine │
         │  ┌────────────────────────┐ │
         │  │ playback.rs  (Kira)    │ │
         │  │ recorder.rs  (CPAL)    │ │
         │  │ metering.rs            │ │
         │  │ bridge.rs   (Tauri)    │ │
         │  └────────────────────────┘ │
         └─────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src-tauri/src/audio_engine/mod.rs` | Module root |
| `src-tauri/src/audio_engine/playback.rs` | Kira AudioManager — load, play, stop, volume, rate, effects |
| `src-tauri/src/audio_engine/recorder.rs` | CPAL input stream on dedicated thread → WAV via hound |
| `src-tauri/src/audio_engine/metering.rs` | Lock-free RMS + peak level metering |
| `src-tauri/src/audio_engine/bridge.rs` | Tauri `#[tauri::command]` handlers |
| `src-tauri/src/audio_engine/tests.rs` | Integration tests (init, play, record, metering) |
| `src-audio-wasm/src/lib.rs` | WASM build of the same engine via wasm-bindgen |
| `src-audio-wasm/build.sh` | Build script (`wasm-pack build --target web`) |
| `src/application/iplug/backend.kira.js` | JS backend — routes to Tauri invoke or WASM |
| `src/application/iplug/audio.facade.js` | Facade — unchanged public API, now prefers 'kira' backend |

## JavaScript API

The public API is `Squirrel.av.audio`. It has not changed. The kira backend is automatically selected when available.

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

Recording is accessed via Tauri commands directly (or via the existing `___record_audio_api.js` which will be updated to route here):

```javascript
// Tauri native
await window.__TAURI__.core.invoke('audio_record_start', {
  sessionId: 'rec1',
  filePath: 'data/users/me/recordings/take1.wav',
  sampleRate: 44100,
  channels: 1
});

// Wait...

const result = await window.__TAURI__.core.invoke('audio_record_stop', {
  sessionId: 'rec1'
});
// result = { success, session_id, file_path, duration_sec, sample_rate, channels }
```

### Level Metering

```javascript
// Returns real-time input levels (during recording)
const levels = await window.__TAURI__.core.invoke('audio_get_levels');
// levels = { rms, peak, rms_db, peak_db }
```

## Tauri Commands

| Command | Parameters | Description |
|---------|-----------|-------------|
| `audio_init` | — | Initialize the Kira AudioManager |
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

Recording always outputs **16-bit PCM WAV**.

## WASM Build (Web)

```bash
cd src-audio-wasm
./build.sh
# Output: src/wasm/squirrel_audio_wasm.js + .wasm
```

In WASM mode, file-based loading is not available. Use `audio_load_clip_from_bytes(id, Uint8Array)` or pass a `url` to `create_clip` (the backend fetches and loads automatically).

## Cargo Dependencies

Added to `src-tauri/Cargo.toml`:

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

## Testing

```bash
cd src-tauri
cargo test audio_engine_tests
```

Tests cover:

1. **test_init_shutdown** — engine lifecycle, idempotent init
2. **test_load_and_play_sine** — generate 440 Hz WAV, load from file, play, stop, destroy
3. **test_load_from_bytes** — load WAV from raw bytes, play
4. **test_record_mic** — record 2 seconds from microphone, verify WAV, play back
5. **test_metering** — RMS/peak computation accuracy

All tests use a serialisation lock to avoid conflicts with the shared global `AudioManager`.

## Migration from Legacy System

The legacy audio system is still present and functional:

| Legacy | New |
|--------|-----|
| `native_recorder.rs` → `recorder.mm` (Obj-C FFI) | `audio_engine/recorder.rs` (pure Rust CPAL) |
| `iplug_bridge.rs` record commands | `audio_engine/bridge.rs` audio commands |
| `backend.html.js` (Tone.js / WebAudio) | `backend.kira.js` (WASM Kira) |

The `Squirrel.av.audio` facade now detects backends in this order: `kira` → `iplug` → `html`. When the kira backend initialises successfully, it takes over. The legacy backends remain as a safety net.
