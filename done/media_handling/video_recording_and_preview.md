# Video Recording and Preview

Status: Complete. Controller wiring, the Bevy live viewfinder, generic video recording,
and their runtime validation are delivered without a parallel visible media surface.
Sample-exact video remains an explicitly unsupported capability until a proven
audio-clock PTS mapping exists.

## Objective

All product video tools use one recording controller and one visible renderer:

- recording state and backend selection are centralized;
- the Bevy/WebGPU project surface is the only product renderer;
- native backends produce files and capture metadata, not UI overlays;
- generic recording remains usable even when exact multitrack placement is unsupported;
- invalid lifecycle transitions and unsupported exact requests fail explicitly.

## Product Architecture

### One Controller

`eVe/domains/media/api/video_recording_controller.js` owns generic video recording state and is the only product entry point for video start/stop/toggle behavior.

Its responsibilities are:

- serialize start and stop;
- prevent concurrent recordings and ambiguous stops;
- route to the selected browser, Tauri, or iOS capture backend;
- publish `idle`, `starting`, `recording`, `stopping`, `completed`, and `error` state;
- normalize the final result and persist the resulting video Atome;
- release capture resources on stop, discard, or failure.

UI tools do not call native video commands directly and do not own a second `isRecording` authority.

### One Renderer and One Canvas

The only visible product renderer is Bevy/WebGPU on `#eve_surface_project`.

- During browser recording, the controller-owned camera `MediaStream` is registered under the active Bevy tool overlay id through `eVe/domains/rendering/bevy_video_stream_source_runtime.js`; real camera frames therefore use the existing Bevy external-texture renderer.
- `eVe/domains/rendering/bevy_video_hidden_dom_runtime.js` owns the only browser media consumer: one fully transparent, non-interactive `<video>` below `#eve_bevy_video_decode_root`. The element is a renderer resource, not product UI or canonical state.
- The live stream lookup takes priority over URL decode for the same overlay id. `requestVideoFrameCallback` forwards at most 15 preview redraw notifications per second through the shared Bevy redraw dispatcher; this preview budget does not change encoder cadence, timestamps, or recorded output.
- Recording tools do not create a product-visible child `<canvas>`, `<video>`, `<img>`, DOM compositor, or dedicated preview renderer.
- iOS does not install a `UIView` or `AVCaptureVideoPreviewLayer` above the web view for tool previews.
- No static frame, poster, or placeholder is presented as if it were a live WebGPU preview.
- Disposing the browser viewfinder cancels its frame callback, detaches `srcObject`, and removes its hidden element without calling `stop()` on any track; the recording controller remains the capture-track owner.
- Tool geometry, hit-testing, selection, and chrome remain owned by the canonical Bevy UI projection.

This keeps pointer routing and rendering ownership identical during idle and recording states while presenting only real live frames inside the Bevy tool.

### Native Backends

Native iOS/Tauri code is responsible for capture permissions, device/session configuration, encoded file output, orientation, audio-track inclusion, and final file metadata.

Native capture code must not know the screen position of a product tool and must not install a preview overlay. Backend results return to the controller, which persists the media and exposes normalized state to the Bevy UI.

The browser backend separates option/exact-request normalization from terminal payload
validation. It rejects empty, zero-duration, or audio-only video output. Once the encoder
has stopped, it retains one frozen terminal payload plus stable Atome/upload identities so
persistence or project-association failure can be retried without a second recorder stop
or duplicate durable media.

The iOS backend exposes `media_video_record_state`, `media_video_record_stop`,
`media_video_record_cancel`, and `media_video_record_ack` around start. State recovery
survives WebView reload; concurrent stops share one native completion; start and stop
delegate waits are bounded by watchdogs; required audio and video tracks, file size, and
duration are validated; and physical cleanup failure remains retryable. A successful
terminal result stays cached natively until the project media Atome is durable and the
client acknowledges it.

## Delivered Tool Wiring

- `ui.capture.video` lazy-loads the capture module and invokes the real video recording controller.
- Capture and detail-record Bevy tools use the same start/stop controller state instead of local recording implementations.
- `ui.detail.record.toggle` delegates video media mode to the canonical capture handler.
- When a Molecule timeline is active, detail recording delegates to the Molecule recording coordinator. The coordinator applies the exact capability gate before capture.
- Repeated start/stop actions are serialized and idempotent at the tool boundary.

The generic and exact paths deliberately have different guarantees. Sharing UI/controller entry points does not promote a generic video result to sample-exact placement.

## Generic Video Contract

Generic video recording remains available on each supported capture backend. A successful stop:

1. finalizes the encoded file;
2. validates that the backend result is usable;
3. persists a video Atome;
4. returns the persisted Atome identity and normalized media metadata;
5. lets the normal project/timeline route reference that durable Atome.

Generic capture may expose duration, nominal frame rate, frame count, and container timestamps. Those fields are useful media metadata but are not proof of alignment to the audio sample timeline.

Generic availability is independent of live preview availability. A browser stream with
`requestVideoFrameCallback` binds to the Bevy tool; if that renderer resource is unavailable,
recording capability and its typed controller result remain separate from the preview.

## Exact Molecule Boundary

Molecule exact recording requests `require_sample_accurate: true`. Video is currently rejected with `av_sample_accurate_overdub_unsupported` and reason `video_pts_audio_sample_mapping_unavailable` before capture begins.

Exact video may be enabled only when all of the following are implemented and validated:

- every committed video/container PTS maps to an integer position on the audio sample timeline;
- playback and capture share an identified clock and one locked `clock_epoch`;
- host `input_latency_frames` and `output_latency_frames` are measured in that epoch, sum exactly to `roundtrip_latency_frames`, and `record_offset_frames_applied` equals the same sum;
- the mapping survives encoder reordering, dropped/duplicated frames, variable frame rate, pause/resume, and device latency;
- the stop result proves zero unreported discontinuity/overrun;
- clip `start_frame`, `duration_frames`, `source_in_frame`, and `source_out_frame` are derived from that mapping, not wall-clock duration.

Until then, generic video recording remains fully usable and exact multitrack video recording remains fail-closed. The exact audio capability is separate and limited to AUv3 `plugin_input` captured in the same render quantum.

## Molecule Commit Ordering

Once an exact video mapping exists, it must use the same coordinator ordering already enforced for exact audio:

```text
finish capture
  -> validate clock/epoch/integer-frame mapping and exact round-trip offset
  -> persist video as an Atome
  -> require persisted Atome id
  -> commit molecule.clip.add
  -> persist and render the canonical timeline through Bevy
```

There is no provisional clip that points at an unpersisted capture result.

## Lifecycle and Cleanup

- A generic controller stop or discard releases backend capture resources and returns to a terminal state.
- Browser preview disposal releases only its hidden Bevy consumer and frame callback. It never stops camera tracks; controller stop, discard, or failure owns track release.
- A retryable persistence/project-association failure retains the controller and active tool feedback; only confirmed terminal cleanup or durable association clears them.
- Native cleanup is successful only after physical deletion. A cleanup error remains recoverable and blocks a new recording from replacing the unresolved result.
- A Molecule recording coordinator exposes `read`, `start`, `stop`, `cancel`, and `dispose`.
- Closing an active Molecule timeline calls recording `dispose()` first; an active capture is canceled before the scene and session are disposed.
- Start failure cleans up any capture that already acquired an id.
- Stop validation failure never commits a timeline clip.

## Validation Matrix

### Automated

- Bevy video tool dispatch reaches the real controller and returns controller state.
- Concurrent/double start and repeated stop are deterministic.
- Browser persistence retry reuses the same terminal payload, Atome id, and upload id without stopping MediaRecorder twice.
- iOS reload recovery, coalesced stop/cancel, watchdog timeout, cleanup retry, and post-association acknowledgement are deterministic.
- Generic stop produces a durable video Atome before any timeline reference is created.
- Exact video requests are rejected before capture while audio-sample PTS mapping is unavailable.
- Timeline close cancels an active exact capture through coordinator disposal.
- Live-source tests verify priority over URL decode, hidden DOM ownership, the 15 fps redraw ceiling, idempotent replacement/disposal, and zero preview-owned `MediaStreamTrack.stop()` calls.
- Guard checks keep a single Bevy/WebGPU product renderer, reject product-visible DOM/native preview surfaces, and reject any fake frame presented as a live preview.

### Hardware

- Browser, Tauri, and iOS generic recordings produce readable, scrub-able files with expected audio and orientation.
- Repeated recordings release camera/microphone resources between sessions.
- The browser tool shows current camera frames inside Bevy throughout start/record/stop while its hidden media consumer remains non-interactive; no native or visible DOM preview surface intercepts input.
- Any future exact-video implementation must pass long-duration A/V drift, discontinuity, variable-frame-rate, and integer audio-frame placement tests before its capability can return `supported: true`.

## Definition of Done

- All Bevy video tools invoke the shared recording controller.
- Generic video capture remains available on supported backends.
- The product renders through one Bevy/WebGPU renderer and one canvas only.
- Browser live video is drawn only through the shared Bevy external-texture path; no product-visible parallel DOM `<video>`/`<img>` preview, fake frame, second canvas, or native overlay exists.
- Preview teardown never stops controller-owned capture tracks.
- Media persistence completes before a clip references the recording.
- Molecule exact video is rejected without a proven audio-sample PTS mapping.
- Generic success is never mislabeled as sample-exact.
- Stop, cancel, failure, and timeline close release capture resources deterministically.
- Reload or transient persistence failure cannot lose, duplicate, or prematurely acknowledge a completed native recording.
