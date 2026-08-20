# iOS and AUv3 Media Recording Status

Status: Complete. Implementation, physical-device validation, and real-host validation
are closed.
Scope: iOS application and AUv3 audio/video recording on the shared Bevy projection route.

## Invariants

- iOS and AUv3 never fall back to `navigator.mediaDevices`, browser `MediaRecorder`, or a browser `AudioContext` recorder.
- The ordinary iOS app recorder is generic. Only AUv3 `source = "plugin_input"` may accept `require_sample_accurate: true`, after the complete clock, latency, overrun, and discontinuity checks pass.
- Project state stores stable relative media sources and normalized terminal metadata only. It never stores an absolute sandbox path, temporary preview URL, recording phase, session id, scope pairs, or preview pixels.
- The existing project Bevy/WebGPU canvas is the only visible renderer. There is no native preview layer, visible DOM media viewfinder, JPEG preview, or second canvas.

## Connected ownership

### Audio

- `atome/src/application/audio_runtime/record_audio_api.js` is the JavaScript runtime bridge.
- `platforms/ios/atome-auv3/application/AppNativeAudioController.swift` and its focused recording/scope owners implement ordinary iOS application capture.
- `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift`, `AUv3RenderEngine.swift`, and `AUv3NativeRecorderBackend.mm` implement AUv3 capture and the exact `plugin_input` path.
- Both native routes publish `record_scope` from fixed 64-bin min/max buffers. JavaScript forwards the matching session as `native_audio_scope`; `capture_recording_feedback_runtime.js` sends it to the active Bevy tool. There is no legacy level-meter or DOM oscilloscope owner.
- The real-time path performs no scope allocation, lock, log, or disk write. Envelope reads and JavaScript event delivery happen off the audio callback.

### Video and photo

- `eVe/domains/media/api/video_recording_controller.js` and `video_api_record_native.js` retain the canonical JavaScript start/stop boundary.
- `AppNativeVideoRecorder.swift` owns one `AVCaptureSession` with movie output plus `AVCaptureVideoDataOutput`. The callback retains only the latest frame; bounded conversion to BGRA at no more than 96 x 96 and 15 fps happens outside the capture callback.
- `media_video_preview_frame` returns only the latest ephemeral frame to the shared Bevy tool texture route. No recorder track or capture session is owned by feedback cleanup.
- Photo capture creates no preview. The UI emits only the 120 ms Bevy shutter flash.

## Terminal media contract

Audio stop must report a non-empty WAV with coherent RIFF/WAVE bytes, sample rate, channels,
integer frame count, duration, and byte size. Native video stop validates the actual AVAsset:
readability/playability, duration, video track, requested audio track, dimensions, orientation,
container, and codec metadata. JPEG photo stop validates bytes and dimensions.

Only after validation and durable persistence may the product perform one final project Atome
commit. Retryable persistence or association failure keeps the same reserved identity and
terminal file so retry does not re-record or duplicate the Atome. Confirmed discard removes
the physical terminal file; failed deletion remains explicit and retryable.

## Automated evidence

Focused contracts include:

- `tests/probes/ios_app_native_audio_recording_contract.test.mjs`
- `tests/probes/native_audio_scope_contract.test.mjs`
- `tests/probes/native_video_bevy_preview_contract.test.mjs`
- `tests/probes/native_video_terminal_metadata_contract.test.mjs`
- `tests/probes/native_video_recording_recovery_contract.test.mjs`
- `tests/probes/native_video_public_commit_ack_contract.test.mjs`
- `tests/eve/media_recording_atomic_commit_contract.test.mjs`
- `tests/eve/media_recording_format_validation.test.mjs`
- `tests/eve/photo_capture_persistence_contract.test.mjs`

The focused Node/Vitest contracts and arm64 simulator build are necessary gates, but they do
not replace runtime evidence from a physical iOS microphone/camera or a real AUv3 host.

## Completion Record

Physical iOS audio/video/photo capture and real-host AUv3 validation are complete. The
required start/stop, persistence, playback, exactness, long-take, and lifecycle checks
are closed for this recording task.

Do not mark this document complete from simulator or static-contract evidence alone.
