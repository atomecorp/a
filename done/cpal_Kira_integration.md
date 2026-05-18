# CPAL + Kira Audio Engine Integration Plan

## Feasibility Analysis

### CPAL (v0.17.3) — Cross-Platform Audio I/O

| Platform | Backend | Input (Record) | Output (Play) | Status |
|----------|---------|----------------|---------------|--------|
| macOS    | CoreAudio | ✅ | ✅ | Native, production-ready |
| iOS      | CoreAudio | ✅ | ✅ | Native, production-ready |
| Web/WASM | Web Audio API | ✅ | ✅ | Via `wasm-bindgen` feature |
| Web/WASM | Audio Worklet | ✅ | ✅ | Low-latency, requires nightly + atomics |
| Windows  | WASAPI | ✅ | ✅ | Native |
| Linux    | ALSA/PipeWire | ✅ | ✅ | Native |
| Android  | AAudio | ✅ | ✅ | Native |

### Kira (v0.12.0) — Expressive Audio Engine

| Platform | Playback | Streaming | File Loading | Effects/Mixer |
|----------|----------|-----------|-------------|---------------|
| macOS    | ✅ | ✅ | ✅ (from file) | ✅ |
| iOS      | ✅ | ✅ | ✅ (from file) | ✅ |
| Web/WASM | ✅ (static only) | ❌ (no threads) | ❌ (no FS) | ✅ |
| Windows  | ✅ | ✅ | ✅ | ✅ |
| Linux    | ✅ | ✅ | ✅ | ✅ |

### Verdict: **FEASIBLE** ✅

**Key architecture decision:**

- **CPAL** handles all low-level audio I/O (record + play) on all platforms
- **Kira** provides the high-level playback engine (mixer, effects, tweens, clocks) on top of CPAL
- For **WASM/Web**: the same Rust code compiles to `.wasm` via `wasm-pack` with `wasm-bindgen`
- For **Tauri** (macOS/iOS): direct native access via Tauri commands
- **Recording** is CPAL-only (Kira is playback-only) — this is fine, CPAL handles input streams natively

### WASM Limitations (mitigated)

1. **No file loading from disk** in Kira WASM → We pass raw PCM/WAV bytes from JS to WASM
2. **No streaming sounds** in Kira WASM → We use `StaticSoundData` (preloaded in memory)
3. **Recording in WASM** → CPAL input stream works via Web Audio API (getUserMedia under the hood)

---

## Current System (to be replaced)

```
┌─ JS Facade ───────────────────────────────────────────────┐
│  Squirrel.av.audio  (audio.facade.js)                     │
│  ├─ Backend: 'iplug' → window.__toDSP → Tauri command     │
│  │   └─ iplug_bridge.rs → native_recorder.rs → recorder.mm│
│  │       (AVAudioEngine FFI via C/Obj-C)                   │
│  └─ Backend: 'html' → WebAudio API + Tone.js              │
│      └─ backend.html.js                                    │
└───────────────────────────────────────────────────────────┘
```

**Problems:**

- macOS recording via Obj-C FFI (brittle, not cross-platform)
- iOS uses separate Swift AVAudioEngine (code duplication)
- Web uses completely different Tone.js/WebAudio stack
- No unified effects/mixer pipeline across platforms
- No WASM path — web is pure JS

---

## New Architecture

```
┌─ JS Facade ──────────────────────────────────────────────────┐
│  Squirrel.av.audio  (audio.facade.js) — UNCHANGED API       │
│  ├─ Backend: 'kira' (new)                                    │
│  │   ├─ Tauri: invoke('audio_*') → Rust AudioEngine          │
│  │   └─ Web:   WASM module → same Rust AudioEngine           │
│  └─ Backend: 'html' (legacy, kept for gradual migration)     │
└──────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
         ┌──────┴──────┐        ┌──────┴──────┐
         │   Tauri      │        │   WASM      │
         │  Commands    │        │  Bindings   │
         │  (invoke)    │        │ (wasm-pack) │
         └──────┬──────┘        └──────┬──────┘
                │                       │
         ┌──────┴───────────────────────┴──────┐
         │        Rust AudioEngine Module       │
         │  src-tauri/src/audio_engine/         │
         │  ┌─────────────────────────────────┐│
         │  │  Kira AudioManager (playback)   ││
         │  │  - StaticSoundData              ││
         │  │  - Mixer / Effects / Tweens     ││
         │  │  - Clocks (beat sync)           ││
         │  │  - Spatial audio                ││
         │  └─────────────────────────────────┘│
         │  ┌─────────────────────────────────┐│
         │  │  CPAL Recorder (input)          ││
         │  │  - Input stream → ring buffer   ││
         │  │  - WAV encoding (hound)         ││
         │  │  - Level metering               ││
         │  └─────────────────────────────────┘│
         │                                      │
         │         CPAL Backend (I/O)           │
         │  ┌───────────────────────────────┐  │
         │  │ macOS: CoreAudio              │  │
         │  │ iOS:   CoreAudio              │  │
         │  │ Web:   Web Audio API (WASM)   │  │
         │  │ Win:   WASAPI                 │  │
         │  │ Linux: ALSA/PipeWire          │  │
         │  └───────────────────────────────┘  │
         └─────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Rust Audio Engine Core

**Files to create:**

```
src-tauri/src/audio_engine/
├── mod.rs              — Public module interface
├── playback.rs         — Kira-based playback (AudioManager, clips, mixer)
├── recorder.rs         — CPAL-based recording (input stream, WAV export)
├── metering.rs         — Real-time level metering (RMS, peak)
└── bridge.rs           — Tauri command handlers (audio_play, audio_record, etc.)
```

**Cargo.toml changes:**

```toml
# Upgrade CPAL and add Kira
cpal = { version = "0.17", features = [] }        # was 0.15
kira = { version = "0.12", features = ["cpal", "wav", "mp3", "ogg", "flac"] }
```

**Tauri commands to expose:**

```rust
#[tauri::command] fn audio_init() -> Result<(), String>
#[tauri::command] fn audio_load_clip(id: String, path: String) -> Result<(), String>
#[tauri::command] fn audio_play(id: String) -> Result<(), String>
#[tauri::command] fn audio_stop(id: String) -> Result<(), String>
#[tauri::command] fn audio_set_volume(id: String, db: f64) -> Result<(), String>
#[tauri::command] fn audio_set_playback_rate(id: String, rate: f64) -> Result<(), String>
#[tauri::command] fn audio_record_start(session_id: String, path: String, sample_rate: u32, channels: u16) -> Result<(), String>
#[tauri::command] fn audio_record_stop(session_id: String) -> Result<RecordResult, String>
#[tauri::command] fn audio_get_levels() -> Result<Levels, String>
#[tauri::command] fn audio_add_effect(track_id: String, effect: String) -> Result<(), String>
```

### Phase 2: WASM Bridge (Web)

**Files to create:**

```
platforms/web/audio-wasm/
├── Cargo.toml          — wasm-pack project, depends on same audio_engine
├── src/
│   └── lib.rs          — #[wasm_bindgen] exports
└── build.sh            — wasm-pack build script
```

**Cargo.toml for WASM crate:**

```toml
[package]
name = "squirrel-audio-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["AudioContext", "MediaStream", "console"] }
cpal = { version = "0.17", features = ["wasm-bindgen"] }
kira = { version = "0.12", default-features = false, features = ["cpal", "wav", "pcm"] }
hound = "3"
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"
```

**WASM exports (mirroring Tauri commands):**

```rust
#[wasm_bindgen] pub fn audio_init() -> Result<(), JsValue>
#[wasm_bindgen] pub fn audio_load_clip_from_bytes(id: &str, data: &[u8]) -> Result<(), JsValue>
#[wasm_bindgen] pub fn audio_play(id: &str) -> Result<(), JsValue>
#[wasm_bindgen] pub fn audio_stop(id: &str) -> Result<(), JsValue>
#[wasm_bindgen] pub fn audio_record_start() -> Result<(), JsValue>
#[wasm_bindgen] pub fn audio_record_stop() -> Result<Vec<u8>, JsValue>
#[wasm_bindgen] pub fn audio_get_levels() -> Result<JsValue, JsValue>
```

### Phase 3: JS Integration (Squirrel.av.audio backend)

**Files to modify:**

- `src/application/audio_runtime/audio.facade.js` — Add 'kira' backend registration
- New: `src/application/audio_runtime/backend.kira.js` — Kira backend (routes to Tauri or WASM)

**Backend detection priority:**

```
1. 'kira-tauri' — if window.__TAURI__ exists → use Tauri invoke()
2. 'kira-wasm'  — if WebAssembly available → load squirrel_audio_wasm.wasm
3. 'html'       — legacy fallback (Tone.js/WebAudio)
```

**New: `src/application/audio_runtime/backend.kira.js`:**

```javascript
// Registers the 'kira' backend on Squirrel.av.audio
// Detects Tauri vs WASM and routes commands accordingly
(function() {
  const audio = window.Squirrel.av.audio;
  
  const isTauri = !!window.__TAURI__;
  let wasmModule = null;
  
  const backend = {
    async init() {
      if (isTauri) {
        await window.__TAURI__.invoke('audio_init');
      } else {
        // Load WASM module
        const { default: init } = await import('/wasm/squirrel_audio_wasm.js');
        wasmModule = await init();
      }
    },
    
    create_clip(arg) { /* route to tauri invoke or wasm */ },
    play(arg)        { /* route to tauri invoke or wasm */ },
    stop(arg)        { /* route to tauri invoke or wasm */ },
    // ... all facade methods
    
    dispatch_batch(batch) {
      for (const cmd of batch) {
        if (typeof this[cmd.name] === 'function') this[cmd.name](cmd.arg);
      }
    }
  };
  
  audio.__register_backend('kira', backend);
})();
```

### Phase 4: Recording Integration

**Replace current flow:**

```
OLD: JS → window.__toDSP → iplug_bridge.rs → native_recorder.rs → recorder.mm (Obj-C FFI)
NEW: JS → Tauri invoke('audio_record_start') → audio_engine/recorder.rs (pure Rust/CPAL)
```

The CPAL recorder in pure Rust replaces:

- `src-tauri/src/native_recorder.rs` (Rust FFI wrapper)
- `src-tauri/native/recorder.mm` (Obj-C AVAudioEngine)
- `src/application/audio_runtime/record_audio_api.js` (will be simplified)

### Phase 5: Testing

**Test matrix:**

| Test | macOS (Tauri) | iOS (Tauri) | Web (WASM) |
|------|--------------|-------------|------------|
| Play WAV file | `cargo test` + Tauri | Xcode simulator | Browser `window.__DEBUG__` |
| Play MP3/OGG | `cargo test` + Tauri | Xcode simulator | Browser |
| Record mic → WAV | `cargo test` + Tauri | Device only | Browser (getUserMedia) |
| Playback + Effects | Manual via UI | Manual | Browser |
| Level metering | `window.__DEBUG__` | Device | Browser |
| Multiple clips | `cargo test` | Device | Browser |

**Autonomous test via WebView (debug_UI.md):**

```javascript
// Test: init audio engine
await window.__TAURI__.invoke('audio_init');
console.log('[TEST] audio_init OK');

// Test: load and play a clip
await window.__TAURI__.invoke('audio_load_clip', { id: 'test1', path: 'test.wav' });
await window.__TAURI__.invoke('audio_play', { id: 'test1' });
console.log('[TEST] audio_play OK');

// Test: record 2 seconds
await window.__TAURI__.invoke('audio_record_start', { 
  sessionId: 'test_rec', path: 'test_rec.wav', sampleRate: 44100, channels: 1 
});
await new Promise(r => setTimeout(r, 2000));
const result = await window.__TAURI__.invoke('audio_record_stop', { sessionId: 'test_rec' });
console.log('[TEST] record result:', result);

// WASM test (web):
audio_init();
const response = await fetch('/test.wav');
const bytes = new Uint8Array(await response.arrayBuffer());
audio_load_clip_from_bytes('test1', bytes);
audio_play('test1');
```

---

## File Changes Summary

### New files

```
src-tauri/src/audio_engine/mod.rs
src-tauri/src/audio_engine/playback.rs
src-tauri/src/audio_engine/recorder.rs
src-tauri/src/audio_engine/metering.rs
src-tauri/src/audio_engine/bridge.rs
platforms/web/audio-wasm/Cargo.toml
platforms/web/audio-wasm/src/lib.rs
platforms/web/audio-wasm/build.sh
src/application/audio_runtime/backend.kira.js
```

### Modified files

```
src-tauri/Cargo.toml                    — upgrade cpal, add kira
src-tauri/src/main.rs                   — register audio_engine commands
src/application/audio_runtime/audio.facade.js   — add 'kira' backend detection
```

### Deprecated (kept but no longer primary)

```
src-tauri/src/native_recorder.rs        — replaced by audio_engine/recorder.rs
src-tauri/native/recorder.mm            — replaced by CPAL CoreAudio
src-tauri/src/iplug_bridge.rs           — recording part replaced
src/application/audio_runtime/backend.html.js   — kept as legacy fallback
```

---

## Build Commands

### Tauri (macOS/iOS)

```bash
cd src-tauri && cargo build          # macOS
cd src-tauri && cargo build --target aarch64-apple-ios  # iOS
```

### WASM (Web)

```bash
cd platforms/web/audio-wasm
wasm-pack build --target web --out-dir ../../../src/wasm/
```

### Full project

```bash
./run.sh  # existing script, will include WASM build step
```

---

## Migration Strategy

1. **Phase 1-2**: Build new engine alongside old system (no breaking changes)
2. **Phase 3**: Register 'kira' backend, auto-detect with priority over 'html'
3. **Phase 4**: Route recording through new engine
4. **Phase 5**: Test thoroughly on all platforms
5. **Final**: Remove legacy Obj-C recorder.mm and native_recorder.rs FFI

The `Squirrel.av.audio` public API **remains unchanged** — only the backend implementation changes. This means all existing UI code (record_audio_ui.js, audio examples, etc.) continues to work without modification.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| CPAL WASM input (recording) may have browser restrictions | getUserMedia permission prompt; test on Chrome/Safari/Firefox |
| Kira WASM cannot load from file | Pass raw bytes from JS fetch → WASM |
| iOS CoreAudio permissions | Add NSMicrophoneUsageDescription to Info.plist (already present for AUv3) |
| WASM module size could be large | Use `wasm-opt -Os`, strip symbols, lazy-load WASM only when audio needed |
| Audio Worklet requires nightly Rust | Start with standard `wasm-bindgen`, upgrade to audioworklet later for low-latency |
