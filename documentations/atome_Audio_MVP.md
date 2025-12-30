# Atome Audio MVP – iPlug2-Based Implementation Plan for Copilot

This document describes the concrete steps to implement the new **native audio system** in Atome/Squirrel, using **iPlug2** as the DSP/real-time engine and Atome/ADOLE as the object/timeline/routing/automation model. The goal is:

* **Real-time safe** audio for guitar rigs/synths, low latency monitoring, deterministic timing.
* A **modular Atome-like workflow** (clips, groups, timelines, widgets, actions) without a traditional DAW UI.
* A **plugin-like internal module system** (Atome plugins) built on top of iPlug2 DSP modules.
* Web/JS remains for UI and orchestration; **no DSP in the UI thread**.

---

## 0. Repository structure and target layout

1. Create (or confirm) a dedicated native audio module:

   * Suggested path: `src/native/audio/` (Rust + C++ + iPlug2)
   * Suggested JS/TS bridge path: `src/squirrel/audio/bridge/`
2. Add an `iplug2/` vendor directory or submodule:

   * `vendor/iplug2/` (submodule recommended)
3. Create a single **AtomeAudioEngine** native library:

   * Built with iPlug2 (C++)
   * Exposed to Rust (Tauri/Axum) via C ABI
   * Controlled from JS via Tauri IPC

---

## 1. Establish environment and sync configuration

1. Add new environment variables to `.env` templates:

   * `ATOME_ENV=dev|test|prod`
   * `ATOME_SYNC_URL=...`
   * `ATOME_AUDIO_BACKEND=iplug2`
2. Ensure Tauri/Rust reads these at startup:

   * `dev`: maximal logs
   * `test`: functional logs
   * `prod`: info+errors only
3. Ensure audio files and audio-atome metadata are synced like all Atome objects:

   * Metadata via ADOLE sync layer
   * Binary audio files via blob upload/download API

---

## 2. Define core ADOLE audio objects (unchanged model)

Keep the same ADOLE object model as the web plan. iPlug2 only changes the execution backend.

Implement these objects in the ADOLE/database layer (SQLite/libSQL) with full versioning:

* `AudioFileAtome`
* `AudioClipAtome`
* `TimelineAtome`
* `TempoSegment`
* `RoutingGraphAtome`
* `RoutingNode`
* `RoutingConnection`
* `WidgetAtome`
* `WidgetMapping`
* `ActionClipAtome`
* `ActionEvent`

Deduplication is mandatory for `AudioFileAtome` (content hash).

---

## 3. Build the iPlug2 engine as a native “host runtime” (not a DAW)

### 3.1. Create the native engine project

1. Create a C++ project folder:

   * `src/native/audio/engine/`
2. Create a C ABI interface for Rust:

   * `src/native/audio/engine/atome_audio_c_api.h`
   * `src/native/audio/engine/atome_audio_c_api.cpp`
3. Compile the engine as:

   * macOS: `.dylib`
   * Windows: `.dll`
   * Linux: `.so`
   * iOS: static lib or framework (for AUv3/embedded target later)

### 3.2. Define the engine API (C ABI)

Expose the minimal set of functions to control the engine:

* Lifecycle

  * `atome_audio_init(sample_rate, buffer_size, channels_in, channels_out)`
  * `atome_audio_shutdown()`
* Transport

  * `atome_audio_set_tempo(bpm)`
  * `atome_audio_set_tempo_segments(json)`
  * `atome_audio_play(timeline_id, position)`
  * `atome_audio_stop(timeline_id)`
  * `atome_audio_seek(timeline_id, position)`
* Clip management

  * `atome_audio_load_file(audio_file_id, path)`
  * `atome_audio_add_clip(timeline_id, clip_json)`
  * `atome_audio_remove_clip(timeline_id, clip_id)`
  * `atome_audio_update_clip(clip_id, clip_json)`
* Recording

  * `atome_audio_start_record(record_json)`
  * `atome_audio_stop_record(record_session_id)`
* Routing

  * `atome_audio_set_routing_graph(routing_json)`
  * `atome_audio_update_routing(delta_json)`
* Automation / actions

  * `atome_audio_schedule_action(action_event_json)`
  * `atome_audio_load_action_clip(action_clip_json)`
* Diagnostics

  * `atome_audio_get_state_json()`
  * `atome_audio_get_last_error()`

All complex payloads are passed as JSON strings for simplicity of bridge and to match ADOLE objects.

---

## 4. Implement real-time safe DSP graph inside iPlug2

### 4.1. Core constraints (must follow)

1. No allocations in the audio callback.
2. No locks in the audio callback.
3. Pre-allocate all buffers and nodes.
4. Message passing from control thread to audio thread via lock-free queues.

### 4.2. Implement Atome routing graph as an iPlug2 internal graph

1. Build a node system:

   * Input nodes (device inputs)
   * Bus nodes (mixers, aux)
   * Output nodes
   * Plugin nodes (Atome DSP modules)
2. Implement connections as a deterministic ordering:

   * Resolve a topological order at control-time.
   * Apply changes via a graph “swap” strategy:

     * Build a new graph off-audio-thread.
     * Atomically swap pointers.
3. Implement routing updates:

   * Prefer param updates (gain, send levels) over rebuilding nodes.
   * When rebuild is needed, use the swap strategy.

### 4.3. Multi-view routing UI (Atome side)

UI views are just different presentations of `RoutingGraphAtome`:

* Matrix view
* Node/cable view
* AUM-like channel strip view

The engine only needs the graph definition and deltas.

---

## 5. Implement file decoding, clip playback, and multi-timeline transport

### 5.1. Audio file handling

1. Enforce WAV as the recording container.
2. Support project sample-rate choice:

   * If source file SR differs, resample offline at import or use a high quality resampler.
3. Implement an `AudioFileCache` in native:

   * Maps `audio_file_id` → decoded PCM buffers
   * Deduplicate by hash and share PCM across clips

### 5.2. Clip playback model

Each `AudioClipAtome` becomes a voice/reader:

* Reads from shared PCM
* Applies offsets, trimming, gain/pan
* Feeds into routing graph

### 5.3. Multi-timeline transport

1. Implement a master transport clock.
2. Allow multiple timelines active simultaneously.
3. Each timeline has:

   * A clip list
   * Tempo segments
   * Follow actions
4. Scheduling strategy:

   * Maintain sample-accurate scheduling using the master clock.
   * Convert beats↔seconds via tempo segments.

---

## 6. Integrate Bungee (time-stretch + independent pitch shift) natively

1. Add Bungee as a native dependency (preferred) or WASM-in-native if required.
2. Create a `TimeStretchProcessor` module:

   * Inputs: PCM stream
   * Parameters: `stretch_ratio`, `pitch_shift`
   * Output: processed PCM stream
3. Attach the processor per clip when:

   * `stretch_algo == 'bungee'`
4. Real-time constraints:

   * Pre-allocate Bungee internal buffers.
   * Parameter changes must be lock-free.
5. Provide an engine command:

   * `atome_audio_update_clip()` triggers stretch/pitch updates.

---

## 7. Recording pipeline (no direct monitoring, engine-managed monitoring)

### 7.1. Capture sources

1. Recording can target:

   * Hardware input node
   * Any bus node (resampling/bounce)
2. Implement a record session object:

   * Holds target node id
   * Holds output file path
   * Holds start time and latency compensation

### 7.2. Write WAV safely

1. Use a lock-free ring buffer from audio thread to writer thread.
2. Writer thread serializes PCM → WAV.
3. When stopping:

   * Flush ring buffer
   * Finalize WAV header
   * Return:

     * `audio_file_id`, `path`, `duration`, `hash`

### 7.3. Latency compensation

1. Measure output latency and processing latency.
2. Adjust `play_position` of created `AudioClipAtome` to align with timeline.

---

## 8. Non-destructive editing commands (Atome level, engine reflects state)

Editing operations must remain pure-property edits on ADOLE objects:

* `splitClip`, `joinClips`, `trimClip`, `moveClip`, `groupClips`

Implementation rule:

1. Atome updates ADOLE objects.
2. Sync layer records versioned changes.
3. Engine receives delta updates:

   * `atome_audio_update_clip()`
   * or timeline reload if needed.

No audio is rewritten unless an explicit “render/freeze” is requested later.

---

## 9. Widgets, automation, and action clips (sample-accurate)

### 9.1. Widget layer

1. Implement widgets in Atome UI:

   * slider, button, toggle, XY
2. Widget change produces `ActionEvent` payloads.

### 9.2. Action recording

1. While recording actions:

   * Collect events with precise timestamps (sample or ms resolution).
2. Create an `ActionClipAtome`:

   * Place it on a timeline like audio clips.

### 9.3. Action playback

1. Engine schedules actions sample-accurately:

   * Parameter changes (gain, filter cutoff)
   * Transport actions (play/stop)
   * Edit commands (split/trim/move) are executed on the control thread and then synced.

Rule:

* **DSP params** can be sample-accurate.
* **Structural edits** (routing rebuild, split/join) occur on the control thread using safe swap strategies.

---

## 10. Follow actions

1. Implement follow action definitions on clips, groups, and timelines.
2. The engine emits “end-of-clip” and marker events.
3. A `FollowActionEngine` (control thread) decides next actions:

   * Play next clip
   * Loop
   * Trigger another timeline
   * Trigger an action clip

Follow actions must be able to trigger both audio and action clips.

---

## 11. Tauri bridge (JS ↔ Rust ↔ C++)

1. Create Rust bindings:

   * `src-tauri/src/audio/mod.rs`
   * Link to the native iPlug2 engine library.
2. Expose Tauri commands:

   * `audio_init`, `audio_shutdown`
   * `audio_set_routing`, `audio_update_routing`
   * `audio_load_file`, `audio_add_clip`, `audio_update_clip`, `audio_remove_clip`
   * `audio_play`, `audio_stop`, `audio_seek`
   * `audio_start_record`, `audio_stop_record`
   * `audio_schedule_action`
   * `audio_get_state`
3. Ensure thread model:

   * Audio callback stays in C++/iPlug2.
   * Rust handles command dispatch and logging.
   * JS orchestrates Atome objects and UI.

---

## 12. Storage, sync, and upload/download of audio files

1. Deduplicate audio files using `hash`.
2. Store local files in a project-managed directory:

   * `projects/<project_id>/audio/<audio_file_id>.wav`
3. Sync metadata via the standard Atome sync.
4. Sync binary files:

   * Upload on create/record in `prod/test`.
   * Download on demand when opening a project.

---

## 13. Debugging and crash tracing (including “second mic click”)

1. Add structured logs on every state transition:

   * recorder: idle → arming → recording → stopping → idle
   * transport: stop → play → seek → stop
2. Add a debug UI panel in dev mode:

   * list active timelines
   * list active clips and their sample positions
   * routing graph snapshot
   * CPU load, xrun counters
3. For the “second microphone click crash”:

   * Log the UI event
   * Log the command arguments
   * Log the recorder state
   * Assert against illegal transitions (e.g., starting recording while already stopping)

---

## 14. Minimal MVP milestones (recommended order)

1. Engine bootstrap (init/shutdown) + audio output.
2. Routing graph: input → master out.
3. WAV file load + clip playback (single timeline).
4. Recording input → WAV + create `AudioFileAtome` + `AudioClipAtome`.
5. Monitoring through engine (no direct monitoring).
6. Multi-timeline transport and triggers.
7. Bungee integration for real-time stretch/pitch.
8. Widgets + action recording/playback.
9. Follow actions (complete set).
10. Sync metadata + file upload/download + dedup.

---

This plan keeps Atome’s modular philosophy while moving the real-time core to iPlug2 for performance and professional stability.
