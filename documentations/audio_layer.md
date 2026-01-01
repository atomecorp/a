# Atome Audio MVP – Unified Implementation Plan (WebAudio + iPlug2 Native)

This document unifies the WebAudio MVP plan and the iPlug2 native plan into a single specification for Atome/Squirrel.

## Goals

* Real-time safe audio for guitar rigs/synths, low-latency monitoring, deterministic timing.
* A modular Atome workflow (clips, groups, timelines, widgets, actions) without a classic DAW UI.
* A plugin-like internal module system (Atome plugins) built on iPlug2 DSP modules where available.
* Browser/Web: WebAudio runtime, no iPlug2 dependency.
* Tauri/desktop: iPlug2 native runtime (recording + playback) as main backend, WebAudio as fallback.
* Web/JS stays for UI, orchestration, ADOLE objects, and sync; no DSP in the UI thread.

---

## 0. Platform & repository overview

### 0.1 Platform strategy

**Browser (pure web)**

* iPlug2 is not available.
* Backend: `WebAudioBackend` for both playback and recording.
* ADOLE model, timelines, clips, routing, widgets, automation, follow actions are identical.

**Tauri / desktop native (macOS/Windows/Linux)**

* Two possible backends, selected via environment / config:

  * `webaudio`: same behavior as browser (100% WebAudio).
  * `native_iplug2`: iPlug2 for playback AND recording (native pipeline already implemented).
* In `native_iplug2` mode:

  * Recording and playback are handled fully by the iPlug2 engine.
  * The native engine writes WAVs into the Atome blob store.
  * JS/Tauri only orchestrates (start/stop record, playback, timelines) and creates/updates ADOLE objects.

### 0.2 Repository layout

**Engine abstraction (JS/TS)**

`src/squirrel/audio/engine/`

* `audio_engine.ts` – high-level engine abstraction and factory.
* `webaudio_backend.ts` – WebAudio implementation.
* `native_backend.ts` – wrapper that calls Tauri commands iPlug2 side.

**Native audio engine (C++/Rust/iPlug2)**

`src/native/audio/engine/`

* `atome_audio_engine.cpp` / `.h` – core iPlug2-based engine.
* `atome_audio_c_api.cpp` / `.h` – C ABI facade for Rust.
* `vendor/iplug2/` – iPlug2 as git submodule or vendor directory.

**JS/TS ↔ native bridge**

* `src/squirrel/audio/bridge/` – optional helpers (types, serialization, IPC payloads).
* `src-tauri/src/audio/mod.rs` – Rust module exposing Tauri commands that call the C ABI.

---

## 1. Runtime configuration and environment variables

### 1.1 Environment variables

Add/extend `.env` templates:

* `ATOME_ENV=dev|test|prod`
* `ATOME_SYNC_URL=http://localhost:xxxx | https://staging.atome.one | https://atome.one`
* `ATOME_AUDIO_BACKEND=webaudio|native_iplug2` (or equivalent naming)

### 1.2 Rust/Tauri and servers

On Tauri (Rust) and Fastify/Axum:

* Read `ATOME_ENV` at startup and configure logging:

  * `dev`: maximum debug (audio, UI, network, engine).
  * `test`: functional debug.
  * `prod`: info + errors only.
* Use `ATOME_SYNC_URL` for metadata and blob endpoints.
* Use `ATOME_AUDIO_BACKEND` to decide:

  * Which backend is exposed to JS: `WebAudioBackend` or `NativeBackend`.

### 1.3 JS/TS config helper

In `src/squirrel/config/env.ts`:

* `getAtomeEnv(): 'dev' | 'test' | 'prod'`
* `getSyncUrl(): string`
* `getAudioBackend(): 'webaudio' | 'native_iplug2'`

Behavior:

* `dev`: audio metadata and files default to local-only (opt-in remote sync).
* `test` / `prod`: audio metadata and blobs are synced by default.

---

## 2. ADOLE audio objects (single logical model)

These are logical ADOLE types (kinds), not rigid SQL tables. They must fit Atome’s generic DB architecture: `objects`, `properties`, `property_versions`, `permissions`, etc., type-agnostic.

### 2.1 Audio assets and clips

**AudioFileAtome (physical audio file)**

* `id: string`
* `user_id: string` (owner)
* `project_ids: string[]` (projects using this asset – optional convenience)
* `content_hash: string` (canonical hash, dedup identity)
* `sample_rate: number`
* `bit_depth: number`
* `channels: number`
* `duration: number` (seconds)
* `container: 'wav'` (MVP)
* `source: 'recording' | 'import' | 'generated'` (origin)
* `local_path: string` (full path under `data/users/<user_id>/media/...`)
* `created_at, updated_at`

**AudioClipAtome (clip on a timeline)**

* `id: string`
* `project_id: string`
* `timeline_id: string`
* `audio_file_id: string`
* `record_position: number` (absolute project time when recorded)
* `play_position: number` (timeline position, seconds or beats)
* `start_offset: number` (inside file)
* `end_offset: number`
* `group_id: string | null` (logical track/group)
* `stretch_ratio: number` (`1.0` = normal)
* `pitch_shift: number` (semitones)
* `stretch_algo: 'bungee' | 'none'`
* `gain: number`
* `pan: number`
* `muted: boolean`
* `solo: boolean`

### 2.2 Timelines and tempo

**TimelineAtome**

* `id: string`
* `project_id: string`
* `name: string`
* `type: 'audio' | 'actions' | 'mixed'`
* `timebase: 'seconds' | 'beats'`
* `clips: string[]` (IDs of `AudioClipAtome`, `ActionClipAtome`, `TimelineClipAtome`)
* `tempo_segments: TempoSegment[]`
* `follow_actions: TimelineFollowAction[]`

**TempoSegment**

* `start_position: number` (timeline position, in timebase)
* `bpm: number`
* `time_signature: string` (e.g. `"4/4"`)

### 2.3 Timeline events, markers, nested timelines

**TimelineEventAtome**

* `id: string`
* `timeline_id: string`
* `time: number` (seconds or beats)
* `timebase: 'seconds' | 'beats'`
* `type: string` (e.g. `audio_clip_start`, `timeline_play`, `routing_set`, `script_run`, etc.)
* `target_atome_id?: string`
* `target_clip_id?: string`
* `target_timeline_id?: string`
* `payload: any` (type-specific data)

**TimelineMarkerAtome**

* `id: string`
* `timeline_id: string`
* `time: number`
* `timebase: 'seconds' | 'beats'`
* `name: string`
* `tags: string[]` (e.g. `['loop_start']`, `['loop_end']`, `['cue']`, `['end']`)

**TimelineClipAtome (nested timeline)**

* `id: string`
* `project_id: string`
* `timeline_id: string` (parent)
* `nested_timeline_id: string`
* `play_position: number`
* `start_marker_id?: string`
* `end_marker_id?: string`
* `loop_markers?: { start_marker_id: string; end_marker_id: string }`

### 2.4 Audio reference timeline

**AudioRefTimelineAtome**:

* A `TimelineAtome` that references one `AudioFileAtome` via a single `AudioClipAtome` spanning the whole duration.
* Used to attach markers/events to that asset.
* Shared as a bundle: `AudioFileAtome + AudioRefTimelineAtome`.

### 2.5 Routing

**RoutingGraphAtome**

* `id: string`
* `project_id: string`
* `nodes: RoutingNode[]`
* `connections: RoutingConnection[]`

**RoutingNode**

* `id: string`
* `type: 'input' | 'bus' | 'output' | 'plugin'`
* `name: string`
* `params: Record<string, any>` (gain, pan, plugin params, sends, etc.)

**RoutingConnection**

* `id: string`
* `source_node_id: string`
* `source_channel: number`
* `target_node_id: string`
* `target_channel: number`
* `gain: number`

### 2.6 Widgets and mappings

**WidgetAtome**

* `id: string`
* `project_id: string`
* `type: 'slider' | 'button' | 'xy' | 'toggle' | 'macroTrigger' | ...`
* `mapping_targets: WidgetMapping[]`

**WidgetMapping**

* `target_type: 'param' | 'action' | 'macro' | 'routing'`
* `target_id: string`
* `param_path?: string` (e.g. `"gain"`, `"filter.cutoff"`)

### 2.7 Action clips and events

**ActionClipAtome**

* `id: string`
* `project_id: string`
* `timeline_id: string`
* `play_position: number`
* `duration: number`
* `events: ActionEvent[]`

**ActionEvent**

* `time_offset: number` (relative to clip start, seconds or beats)
* `type: 'widgetChange' | 'script' | 'editCommand' | 'routingChange'`
* `payload: any`

### 2.8 Follow actions

**TimelineFollowAction**

* `id: string`
* `scope: 'clip' | 'group' | 'timeline'`
* `target_id: string`
* `action_type: 'PlayNextClip' | 'Stop' | 'LoopClip' | 'RandomClipInGroup' | 'JumpToMarker' | 'PlayTimeline' | 'StopTimeline' | 'TriggerActionClip'`
* `params: any`

Attach follow actions to:

* `AudioClipAtome` (per-clip),
* `group_id` (track/group level),
* `TimelineAtome` (timeline behavior).

---

## 3. AudioEngine abstraction (JS/TS)

Define a common interface used by Atome UI and orchestration:

```ts
export interface AudioEngine {
  init(context?: AudioContextLike): Promise<void>;

  // Routing / graph
  createTrackGraph(...args: any[]): Promise<void>; // or more precise types later
  setRoutingGraph(graph: RoutingGraphAtome): Promise<void>;
  updateRoutingGraph(delta: any): Promise<void>;

  // Clips and assets
  loadClip(clip: AudioClipAtome, file: AudioFileAtome): Promise<void>;
  updateClip(clip: AudioClipAtome): Promise<void>;
  removeClip(clipId: string): Promise<void>;

  // Timelines / transport
  playTimeline(timelineId: string, options?: any): Promise<void>;
  stopTimeline(timelineId: string): Promise<void>;
  seekTimeline(
    timelineId: string,
    position: number | { type: 'time' | 'marker'; value: any }
  ): Promise<void>;
  setTempo(timelineId: string, bpm: number): Promise<void>;
  setTempoSegments(timelineId: string, segments: TempoSegment[]): Promise<void>;

  // Recording
  startRecord(recordSpec: any): Promise<{ record_session_id: string }>;
  stopRecord(
    record_session_id: string
  ): Promise<{ audio_file_id: string; duration: number; content_hash: string }>;

  // Automation / actions
  scheduleAutomation(event: ActionEvent, ctx: { timeline_id: string }): Promise<void>;

  // Diagnostics
  getState(): Promise<any>;
  getLastError(): Promise<string | null>;
}
```

Expose a singleton:

* `atome.services.audioEngine` – created with backend `webaudio` or `native_iplug2` based on platform/env.

---

## 4. WebAudio backend

**Browser : WebAudio uniquement**
**Tauri : WebAudio fallback si iPlug2 indisponible ou désactivé** (browser + Tauri fallback)

### 4.1 Core responsibilities

`WebAudioBackend`:

* Owns a single `AudioContext`.
* Maintains:

  * a global transport/clock (play/stop/seek, current time),
  * a registry: `audioFileCache: Map<audio_file_id, AudioBuffer>`,
  * `activeClips: Map<clip_id, { sourceNode, gainNode, panNode, bungeeNode? }>`.

### 4.2 Lifecycle

**init()**

* Create `AudioContext` (on first user gesture if required).
* Create master gain, analyser, primary output node.

**loadClip(audioClip, audioFile)**

* Resolve the WAV (blob from Atome store or URL).
* Decode to `AudioBuffer`.
* Put in `audioFileCache` keyed by `audio_file_id / content_hash`.

**playTimeline(timelineId, position)**

* Get current timeline, list of clips intersecting the start position.
* For each clip:

  * Create `AudioBufferSourceNode`.
  * Apply `start_offset`, `end_offset`.
  * Connect: `Source -> BungeeNode? -> Gain/Pan -> Routing graph -> destination`.

**stopTimeline(timelineId)**

* Stop and dispose all sources belonging to that timeline.

**seekTimeline(timelineId, position)**

* Stop all active sources, recompute which clips should play at new position, restart them.

### 4.3 Tempo and latency helpers

* `beatsToSeconds(beat, tempoSegments)`
* `secondsToBeats(seconds, tempoSegments)`
* Global or per-timeline latency value.
* Use latency when:

  * placing new recorded clips (play_position shifted),
  * scheduling automation events.

### 4.4 Bungee (Web)

* Bungee integrated as JS or WASM.
* Wrap as `BungeeNode`:

  * Inputs: audio stream.
  * Params: `stretch_ratio`, `pitch_shift`.
* When `stretch_algo === 'bungee'` on a clip:

  * Insert `BungeeNode` into chain.
* Support real-time parameter changes via `updateClipTimeStretch(clipId, stretch_ratio, pitch_shift)`.

### 4.5 Routing (Web)

Internal graph:

* `nodes: Map<string, AudioNodeWrapper>`
* `connections: RoutingConnection[]`

Helpers:

* `createNode(nodeDef: RoutingNode)`
* `connectNodes(connection)`
* `disconnectNodes(nodeId)`
* `updateRoutingNodeParams(nodeId, params)`

Node types:

* `input`: microphone/device input (via `getUserMedia`).
* `bus`: `GainNode`, `ChannelMerger`, `ChannelSplitter`.
* `output`: `AudioContext.destination` or Tauri audio output.
* `plugin`: WebAudio-based FX or generator nodes.

Expose read-only snapshots for UI:

* matrix,
* node/cable,
* AUM-like channel strips.

### 4.6 Recording (WebAudio)

**Règle générale (unifiée)** : WebAudio est utilisé **uniquement** en Browser ou en **fallback** si iPlug2 est indisponible en Tauri.

`RecorderService` (Web only) :

* Capture depuis un `RoutingNode` input/bus.
* Encode WAV → blob.
* Écrit dans `data/users/<user_id>/media/audio/recordings/<content_hash>.wav`.
* Retourne `{ audio_file_id, duration, content_hash, latency_ms?, latency_compensated_play_position? }`.
* **Même API JS** que le backend natif.

Punch-in/overdub : identique, enregistrement aligné sur le transport et suivi des clips/groupes sélectionnés.

---

## 5. Native iPlug2 backend (Tauri)

**Priorité audio Tauri** : iPlug2 → WebAudio fallback

### API JS UNIFIÉE

* `audioEngine.startRecord(spec)`
* `audioEngine.stopRecord(session_id)`
* Retour commun : `{ audio_file_id, duration, content_hash, latency_ms?, latency_compensated_play_position? }`
* Aucune différence d’usage côté JS.

### Backend selection

* `native_iplug2` si disponible.
* Sinon `webaudio` automatiquement.
* Contrôlé par `ATOME_AUDIO_BACKEND` + détection au runtime.

### 5.1 Native engine project

In `src/native/audio/engine/`:

* Implement `AtomeAudioEngine` using iPlug2.
* Provide C ABI:

  * `atome_audio_c_api.h`
  * `atome_audio_c_api.cpp`

Build:

* macOS: `.dylib`
* Windows: `.dll`
* Linux: `.so`
* iOS: static lib or framework (for AUv3 / embedded later).

### 5.2 C ABI API

Expose:

**Lifecycle:**

* `atome_audio_init(sample_rate, buffer_size, channels_in, channels_out)`
* `atome_audio_shutdown()`

**Transport:**

* `atome_audio_set_tempo(bpm)`
* `atome_audio_set_tempo_segments(json)`
* `atome_audio_play(timeline_id, position)`
* `atome_audio_stop(timeline_id)`
* `atome_audio_seek(timeline_id, position)`

**Clips:**

* `atome_audio_load_file(audio_file_id, path)`
* `atome_audio_add_clip(timeline_id, clip_json)`
* `atome_audio_remove_clip(timeline_id, clip_id)`
* `atome_audio_update_clip(clip_id, clip_json)`

**Recording:**

* `atome_audio_start_record(record_json)`
* `atome_audio_stop_record(record_session_id)`

**Routing:**

* `atome_audio_set_routing_graph(routing_json)`
* `atome_audio_update_routing(delta_json)`

**Automation / actions:**

* `atome_audio_schedule_action(action_event_json)`
* `atome_audio_load_action_clip(action_clip_json)`

**Diagnostics:**

* `atome_audio_get_state_json()`
* `atome_audio_get_last_error()`

All complex data travels as JSON strings reflecting ADOLE objects.

### 5.3 Real-time DSP constraints

In the audio callback:

* No dynamic allocations.
* No locks, no blocking I/O.
* Pre-allocate all buffers and nodes.
* Use lock-free queues to pass commands and parameter changes from control/thread to audio thread.

### 5.4 Routing graph in iPlug2

Nodes:

* Inputs (hardware).
* Buses (groups, aux, FX buses).
* Outputs.
* Plugins (DSP modules).

Connections:

* Compute topological order off audio thread.
* Use a graph swap strategy:

  * Build new graph on control thread.
  * Atomically swap pointers used by audio thread.
* Prefer param updates (gain/sends) over structural rebuilds.

### 5.5 File decoding and transport

* Enforce WAV as recording container.
* Support project sample rate:

  * Resample offline on import if needed, or use a high-quality native resampler.
* Implement `AudioFileCache`:

  * `audio_file_id → decoded PCM buffer(s)`.
  * Deduplicate by `content_hash`.
* Multi-timeline transport:

  * Single master transport clock.
  * Several timelines active in parallel.
  * Each timeline: clip list, tempo segments, follow actions.
  * Sample-accurate scheduling using master clock.
  * Beats ↔ seconds via `TempoSegment`.

### 5.6 Bungee native

* Integrate Bungee as native dependency (or WASM inside native if needed).

**TimeStretchProcessor module:**

* Input: PCM stream,
* Params: `stretch_ratio`, `pitch_shift`,
* Output: processed stream.

Attach per-clip when `stretch_algo == 'bungee'`.

Respect RT constraints:

* Pre-allocate internal buffers,
* Parameter updates via lock-free queues.
* Trigger updates through `atome_audio_update_clip()` when properties change.

### 5.7 Recording pipeline (native iPlug2)

**Règle générale (prioritaire)** : Sur Tauri, iPlug2 est le backend principal pour l’enregistrement et la lecture.

Pipeline :

* Capture → buffer natif → writer thread → WAV.
* Écrit dans `data/users/<user_id>/media/audio/recordings/<content_hash>.wav`.
* Retourne `{ audio_file_id, duration, content_hash, path, latency_ms, latency_compensated_play_position }`.
* **Même API JS** que WebAudio.

Fallback :

* Si échec init iPlug2 → bascule automatique vers WebAudio.
* JS ne change jamais son appel.

Latence :

* Mesurée par le moteur natif.
* Compensation appliquée pour `play_position` afin d’aligner les prises.

---

## 6. Tauri bridge (JS ↔ Rust ↔ C++)

### 6.1 Rust bindings

In `src-tauri/src/audio/mod.rs`:

* Load the native library.
* Expose Tauri commands that wrap C API:

  * `audio_init`, `audio_shutdown`
  * `audio_set_routing`, `audio_update_routing`
  * `audio_load_file`, `audio_add_clip`, `audio_update_clip`, `audio_remove_clip`
  * `audio_play`, `audio_stop`, `audio_seek`
  * `audio_start_record`, `audio_stop_record`
  * `audio_schedule_action`
  * `audio_get_state`, `audio_get_last_error`
* Serialize/deserialise JSON payloads to/from ADOLE objects.

### 6.2 Thread model

* Audio thread entirely inside C++ iPlug2.
* Rust:

  * manages device setup,
  * forwards commands from JS to C API,
  * collects logs/errors.
* JS:

  * orchestrates ADOLE objects, UI, timelines, routing views,
  * chooses backend (`WebAudioBackend` vs `NativeBackend`).

---

## 7. Audio Playback – Timeline-Based Orchestration

Playback is timeline-centric, not file-centric.

### 7.1 Assets vs timelines

**AudioFileAtome (or AudioAssetAtome) = data:**

* WAV blob,
* technical metadata: sample rate, channels, duration, `content_hash`,
* no markers, no events.

**TimelineAtome = behavior:**

* contains clips, markers, events, follow actions,
* can target any Atome (audio, video, UI, routing, scripts),
* is itself an Atome, so can be controlled by other timelines.

Markers only exist on timelines, never on the asset itself.

### 7.2 Audio reference timeline

To attach markers to a single audio file:

1. Create `AudioRefTimelineAtome` for that `AudioFileAtome`.
2. Add one `AudioClipAtome` spanning the full duration.
3. Add markers/events to this timeline (intro, verse, chorus, loops, cue points).
4. Share `AudioFileAtome + AudioRefTimelineAtome` as a reusable bundle.

### 7.3 Transport API (timeline-based)

High-level commands (JS → engine → WebAudio or iPlug2):

* `timeline_play({ timeline_id, start: { type: 'time'|'marker', value }, options })`
* `timeline_stop({ timeline_id })`
* `timeline_seek({ timeline_id, to: { type: 'time'|'marker', value } })`
* `timeline_set_loop({ timeline_id, loop: { start_marker_id, end_marker_id } | null })`
* `timeline_get_state({ timeline_id })`

Timebase:

* seconds or beats depending on `TimelineAtome.timebase`.

Tempo and tempo changes via `TempoSegment`.

### 7.4 Timeline events (unified)

Minimum event types:

**Audio:**

* `audio_clip_start`, `audio_clip_stop`, `audio_clip_param`

**Video:**

* `video_start`, `video_stop`, `video_seek`

**UI:**

* `ui_show`, `ui_hide`, `ui_set`, `ui_animate`

**Scripting:**

* `script_run`

**Routing:**

* `routing_set`, `routing_update`

**Timeline control:**

* `timeline_play`, `timeline_stop`, `timeline_seek`, `timeline_jump_marker`

### 7.5 Nested timelines

Because timelines are Atomes:

* A timeline can trigger another timeline with a `TimelineEventAtome` of type `timeline_play`.

**Nested timeline model:**

* Represented as `TimelineClipAtome` (or a clip with `clip_kind = 'timeline'`),
* Fields: `nested_timeline_id`, `play_position`, optional `start_marker_id`, `end_marker_id`, `loop_markers`.

**Engine scheduling:**

* When parent hits the nested clip, it schedules child timeline events relative to parent’s timebase.

### 7.6 Convenience helpers

Helpers on top of the transport API:

* `play_asset_as_timeline({ audio_file_id, marker_set_id? })`

  * Create or load the corresponding `AudioRefTimelineAtome`,
  * Call `timeline_play` with default start.

* `play_marker_segment({ timeline_id, start_marker_id, end_marker_id, loop? })`

  * Play between two markers, optionally loop.

---

## 8. Timelines & multiple timelines per project

Each project can have multiple `TimelineAtome`.

**TimelineService (JS layer):**

* `createTimeline(projectId, name, type)`
* `addClip(timelineId, clipId, play_position)`
* `removeClip(timelineId, clipId)`
* `moveClip(timelineId, clipId, newPosition)`

Per-timeline playback control:

* `playTimeline(timelineId)`
* `stopTimeline(timelineId)`
* `seekTimeline(timelineId, position)`

Cross-timeline triggers:

* Follow actions or clips can call `playTimeline(otherTimelineId)` or `stopTimeline(otherTimelineId)`.

---

## 9. Non-destructive editing operations

All editing on audio is non-destructive and property-based; audio files are never rewritten unless explicit “render/freeze” is requested.

**On `AudioClipAtome`:**

* `splitClip(clipId, splitPosition)`:

  * Create two new clips:

    * Clip A: same `start_offset`, `end_offset = start_offset + (splitPosition - play_position)`.
    * Clip B: `start_offset = end of A`, `end_offset = original end_offset`.
  * Replace original clip on timeline with A + B.

* `joinClips(clipIdA, clipIdB)`:

  * If contiguous and from same `AudioFileAtome`, merge into a single clip.

* `trimClip(clipId, newStartOffset, newEndOffset)`:

  * Update offsets only; source file remains intact.

* `moveClip(clipId, newPlayPosition)`:

  * Update `play_position` only.

* `groupClips(clipIds[], groupId)`:

  * Assign same `group_id` to create a logical track/group.

**On `ActionClipAtome`:**

* `splitActionClip`, `joinActionClips`, `moveActionClip`, `loopActionClip`.

Rule for engines:

* ADOLE/DB is the source of truth.
* Engines receive deltas (`updateClip`, `setTimeline`, etc.) and update runtime.

---

## 10. Widgets, automation, and action clips

### 10.1 Widget layer

* `WidgetAtome` rendered in Atome UI (slider, button, toggle, XY pad, etc.).
* Each widget has `WidgetMapping` entries linking UI → audio/routing/scripts.

### 10.2 Action recording

`WidgetAutomationRecorder`:

* Subscribes to widget events.
* When action recording is active:

  * For each widget event:

    * Capture `time_offset` (relative to action record start, seconds or beats),
    * Capture type + payload (target, value, etc.).
* At stop:

  * Wrap events into `ActionClipAtome`,
  * Place action clip on active timeline at the current `play_position`.

### 10.3 Action playback

During playback, engines execute `ActionEvent`:

* Parameter changes (gain, filter cutoff, plugin params),
* Script calls,
* Routing changes,
* Optional UI updates.

Distinction:

* DSP parameters → can be sample-accurate (in native engine; WebAudio approximated).
* Structural edits (graph rebuild, split/join/routing changes) → executed on control thread, never in audio callback, using graph swap strategies.

### 10.4 Generic automation API

High-level:

* `scheduleAutomation(target, paramPath, time, value)`

Internally:

* Equivalent to creating an `ActionEvent` in an `ActionClipAtome`,
* Scheduled by the engine based on the timeline.

---

## 11. Follow actions

### 11.1 Types

At minimum:

* `PlayNextClip`
* `Stop`
* `LoopClip`
* `RandomClipInGroup`
* `JumpToMarker`
* `PlayTimeline`
* `StopTimeline`
* `TriggerActionClip`

### 11.2 Attachment

* Per clip: `AudioClipAtome` has a follow action.
* Per group: `group_id` level.
* Per timeline: `TimelineAtome`.

### 11.3 FollowActionEngine

* Runs on control thread.
* Listens to playback events:

  * end of clip,
  * marker reached,
  * timeline end.
* When condition is met:

  * Looks up `TimelineFollowAction` definitions,
  * Dispatches engine commands:

    * `playClip(nextClipId)` / `playTimeline(otherTimelineId)` / trigger `ActionClipAtome`, etc.

---

## 12. Storage, sync, deduplication, and secure access

### 12.1 User-centric media storage

To be Atome-compliant and modular, storage is user-centric, not project-centric.

**Atome root (platform dependent):**

* macOS: `~/Library/Application Support/Atome/`
* Windows: `%APPDATA%/Atome/`
* Linux: `~/.local/share/Atome/`

Under that:

* `data/users/<user_id>/media/audio/recordings/<content_hash>.wav`

(Later: `media/audio/imports/...`, `media/video/...`, `media/image/...`, etc.)

Rules:

* Identity is `content_hash`, not the full path.
* Audio blobs are user resources shared across all projects.
* Projects reference blobs via ADOLE (`AudioFileAtome.content_hash`), not by file path.
* Local index maps:

  * `audio_file_id → content_hash → local_path`

### 12.2 Secure local file access (native)

On Rust side:

* Define `USER_AUDIO_ROOT`, e.g.:

  * `<AtomeRoot>/data/users/<user_id>/media/`

Path validation before passing to C++:

* Reject relative paths from JS.
* Canonicalize and enforce that resolved path is under `USER_AUDIO_ROOT`.
* Reject path traversal, symlink escapes.
* Enforce allowed extension list (MVP: `.wav` only).

Prefer content-addressed access:

* JS sends `audio_file_id / content_hash`.
* Rust resolves to full path in `USER_AUDIO_ROOT`.
* C++ only receives validated, canonical path.

### 12.3 Deduplication (local + server)

For each new audio file:

* Compute `content_hash` (e.g. SHA-256 on raw bytes).

Local dedup:

* If `content_hash` exists already in `data/users/<user_id>/media/audio/...`, do not store another copy.
* New `AudioFileAtome` points to existing blob (`content_hash`, `local_path`).

Server-side dedup:

* Blob store keyed by `content_hash`.
* Multiple users and projects can reference the same content hash.

### 12.4 Sharing without redundancy

Share audio via metadata:

* Send `AudioFileAtome` (or subset) with `audio_file_id`, `content_hash`, `duration`, `sample_rate`, etc.
* Handle permissions separately via ADOLE permissions.

Server:

* On upload:

  * If a blob with this `content_hash` exists, reuse it.

Client:

* On receiving a share:

  * If `content_hash` already in local store: link it.
  * Else download via `GET /blobs/<content_hash>` into `data/users/<user_id>/media/audio/...`.

### 12.5 Binary sync API

Metadata sync: existing Atome sync layer.

Binary sync:

* `PUT /blobs/<content_hash>` – upload if missing.
* `GET /blobs/<content_hash>` – download.
* `HEAD /blobs/<content_hash>` – existence check.

Respect `ATOME_ENV`:

* `prod/test`: upload on record/import by default.
* `dev`: local-only by default, with option to enable remote sync.

---

## 13. Debugging and logging (WebAudio + Tauri)

### 13.1 JS/TS (WebAudio + orchestration)

Add structured logs in:

* `WebAudioBackend` – clip creation, playback start/stop, Bungee params, routing changes.
* `RecorderService` – record start/stop, created files, durations.
* `TimelineService` – play/stop/seek, timeline selection.
* `FollowActionEngine` – triggers and resulting commands.

In dev mode, expose a debug panel:

* List active timelines and their current times.
* List active clips and approximate sample positions.
* Show routing graph snapshot.
* Show latency value, tempo, current backend (`webaudio` / `native_iplug2`).

### 13.2 Tauri/Rust/native

Rust:

* Log backend selection.
* Log device init / shutdown.
* Log all C API calls and their results in debug.
* Log panic/crash scenarios with enough context.

C++/iPlug2 (debug builds):

* Assert illegal state transitions.
* Log graph swaps, record sessions, xruns (buffer underruns).

### 13.3 “Second mic click” crash tracing

For the specific “second microphone click” crash scenario:

**JS:**

* Log each mic icon click:

  * time,
  * current recording state,
  * arguments sent to backend.

**Rust:**

* Log Tauri command received (`audio_start_record`, `audio_stop_record`),
* Record current recorder state.

**Native:**

* Recorder state machine:

  * `idle → arming → recording → stopping → idle`
* Reject illegal transitions with explicit error instead of crash:

  * e.g. `start_record` while already in `stopping`.

These logs make it trivial to replay and fix state bugs.
