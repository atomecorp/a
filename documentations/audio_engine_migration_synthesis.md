# Audio Engine Migration — Synthesis Note

## Summary

Migration of the Atome/eVe audio engine from fragmented legacy backends to the unified
Kira/CPAL engine, as described in `eVe/todo/audio_engine_migration.md`.

---

## 1. What Was Migrated

### Audio Facade (`src/application/audio_runtime/audio.facade.js`)

- Updated module header to reflect kira as the primary backend
- Added `stop` and `stop_clip` to the `immediateNames` set for low-latency transport calls
- `detect_and_set_backend()` already preferred kira via `runtime.preferredFacadeBackendOrder`

### MTrack Video Audio Routing

Four files changed to route video clip audio through the native audio pipeline:

- **`playback_seek_policy_runtime.js`**: `shouldUseLegacyVideoElementAudio()` now returns `false`
  (was `true` for all video clips). Emergency escape hatch:
  `window.__eveMtraxForceLegacyVideoAudio = true`

- **`hmtracks_session_runtime.js`**: `native_audio_clips` now includes both `audio` AND `video`
  clips from audible tracks. Video clip entries use `kind: 'video_audio'` to distinguish
  from pure audio clips. `decodeAudioData` can decode audio from video containers (MP4, WebM).

- **`media_position_runtime.js`**: `nativeAudioOwnsClip` now applies to video clips when
  `!legacyVideoAudioAllowed`, so HTMLVideoElements are muted and audio is owned by the
  native pipeline.

- **Effect chain**: `media_audio_state_runtime.js` already handled the muting logic correctly —
  when `disconnectLegacy` is true AND `shouldUseLegacyVideoElementAudio` returns false,
  video elements are muted. The change to return false triggers this existing behavior.

### Recording Pipeline (`eVe/domains/media/api/audio_api.js`)

- `record_audio()` now checks for the unified `window.record_start` / `window.record_stop`
  (from `record_audio_api.js`) first for Tauri/AUv3 runtimes
- Falls back to old backends only for browser `web_capture_fallback`
- Returns a compatible controller object with `stop()` method

---

## 2. What Was Deprecated (Markers Added)

### `src/application/audio_runtime/backend.legacy_auv3.js`

- Header marked DEPRECATED — superseded by `backend.kira.js`
- Kept for AUv3 swiftBridge compatibility until native AUv3 audio is fully unified

### `platforms/ios/atome-auv3/auv3/utils.swift` — C FFI Recording Bridge

- `squirrel_recorder_core_*` functions marked DEPRECATED
- Kept for AUv3 backward compatibility until native AUv3 recording
  routes through the unified pipeline

---

## 3. What Was Kept (With Justification)

| Component | Kept? | Justification |
|-----------|-------|---------------|
| `backend.kira.js` | ✅ Primary | New unified backend (Tauri native + WASM) |
| `backend.legacy_auv3.js` | ✅ Deprecated | AUv3 swiftBridge still routes through this for live hosts |
| `record_audio_api.js` | ✅ Active | Unified recorder wrapper (Tauri/AUv3/browser) — architecturally sound |
| `record_audio.js` | ✅ Active | Browser recording via getUserMedia + AudioWorklet — approved exception for web capture |
| `record_video.js` | ✅ Active | MediaRecorder API — independent of audio engine |
| `hmtracks_audio_engine_v1.js` | ✅ Active | AudioWorklet timeline clock for MTrack — not an audio decoder |
| `hmtracks_native_audio_runtime.js` | ✅ Active | Web Audio `decodeAudioData` pipeline for MTrack clips |
| `runtime_audio_backend.js` | ✅ Active | Runtime resolver (single decision point for backend selection) |
| `utils.swift` C FFI | ✅ Deprecated | AUv3 render block + recording — cannot remove without Xcode rebuild/testing |
| `AudioControllerProtocol.swift` | ✅ Active | AUv3 protocol for mute/test tone — minimal, not harmful |
| `WebViewManager.swift` | ✅ Active | JS↔Swift bridge — clean, no legacy audio logic |
| `AudioWorklet` (browser recording) | ✅ Active | Only path for browser-side audio capture; exception is minimal and documented |

### What Was NOT Changed (No Migration Needed)

| File | Reason |
|------|--------|
| `video_api.js` | Capture/recording API only; camera preview elements already muted by default |
| `media_api_shared.js` | Auth/metadata utilities only — no audio engine code |
| `record_audio_UI.js` | Pure UI wrapper — delegates to abstracted recording APIs |
| `record_video_UI.js` | Pure UI wrapper — no audio engine calls |
| `user.js` | Atome CRUD test harness — no audio references |
| `audio_engine_debug_runtime.js` | Debug/test harness already using Tauri invoke abstraction |
| `mtrack.js` (main) | Orchestration — delegates audio to runtime modules that were migrated |

---

## 4. System Dependencies by Runtime

See: `documentations/audio_engine_system_dependencies.md`

| Runtime | Audio Backend | Extra Packages |
|---------|---------------|----------------|
| macOS (Tauri) | CoreAudio | none |
| iOS (AUv3) | AVAudioEngine (Swift) | none |
| Linux (Tauri) | ALSA | `libasound2-dev` |
| FreeBSD (Fastify) | OSS (native) | none (JACK optional) |
| Browser | WASM Kira / WebAudio | modern browser |

**JACK is NOT confirmed necessary.** CPAL `default_host()` selects the platform default.
Server-side (Fastify/FreeBSD) does not perform audio playback — the browser handles it.

---

## 5. Tests

No automated test suite exists for the audio engine migration. Verification requires:

1. **Browser + Fastify**: Load MTrack with video clips → verify video elements are muted
   and audio plays through the native pipeline. Check WASM Kira initializes.
2. **Tauri desktop**: Verify `backend.kira.js` initializes → `audio_init` Tauri invoke
   succeeds. Test playback and recording through the unified facade.
3. **AUv3**: Verify swiftBridge still receives audio commands via `backend.legacy_auv3.js`.
   Recording via C FFI still works (deprecated but functional).
4. **Escape hatch**: Set `window.__eveMtraxForceLegacyVideoAudio = true` → verify
   video element audio restoration in MTrack.

---

## 6. Residual Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Video clip audio decode failure | Medium | `decodeAudioData` may fail on some video containers; MTrack should handle gracefully |
| WASM Kira module not built/deployed | Medium | Browser playback is unsupported until the Kira module is rebuilt or redeployed |
| AUv3 C FFI recording still active | Low | Deprecated with markers; removal requires coordinated Xcode rebuild |
| `shouldUseLegacyVideoElementAudio` returns false breaks edge case | Low | Escape hatch `__eveMtraxForceLegacyVideoAudio` available |
| No automated regression tests | Medium | Manual verification protocol needed for each runtime |

---

## 7. Architecture After Migration

```
                        ┌─────────────────────────┐
                        │   Squirrel.av.audio      │  ← Unified facade
                        │   (audio.facade.js)      │
                        └────┬────────┬────────┬───┘
                             │        │        │
                     ┌───────┘   ┌────┘    ┌───┘
                     ▼           ▼         ▼
              ┌──────────┐ ┌─────────┐ ┌─────────┐
              │  kira ✅  │ │native_audio ⚠️ │ │ html ⚠️ │
              │ PRIMARY  │ │DEPRECATED│ │DEPRECATED│
              └────┬─────┘ └────┬────┘ └────┬────┘
                   │            │            │
          ┌────────┴───┐       AUv3      WebAudio
          │            │    swiftBridge   (last resort)
      Tauri native  WASM Kira
      (CPAL+Kira)   (browser)
```

**MTrack audio pipeline** (post-migration):

- Audio clips → `decodeAudioData` → native audio pipeline ✅
- Video clips → `decodeAudioData` → native audio pipeline ✅ (NEW)
- HTMLVideoElement → muted when native owns clip ✅ (NEW)
- Legacy video element audio → disabled by default ✅ (NEW)
