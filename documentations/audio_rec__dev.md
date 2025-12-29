# Atome Audio MVP – Implementation Plan for Copilot

This document describes the concrete steps to implement the new audio system in Atome/Squirrel. Follow these steps in order. Each step can be turned into tasks, files, and functions.

---

## 1. Establish the audio architecture

1. Create a high-level module for the audio system:

   * Path suggestion: `src/squirrel/audio/engine/`.
   * Main entry file: `audio_engine.ts`.
2. Implement an **engine abstraction** with pluggable backends:

   * `WebAudioBackend` (MVP, default).
   * `NativeBackend` placeholder (for future Rust/iPlug2 implementation in Tauri).
3. Define a common `AudioEngine` interface:

   * `init(context: AudioContextLike): Promise<void>`
   * `createTrackGraph(...)`
   * `createRecorder(...)`
   * `loadClip(...)`
   * `play(...)`, `stop(...)`, `seek(...)`
   * `setTempo(...)`
   * `scheduleAutomation(...)`
4. Make sure the engine does not depend on any UI framework. It must be purely functional and testable.
5. Expose the engine as a global Atome service:

   * Example: `atome.services.audioEngine`.
   * Use a clean dependency injection pattern if available in the current Atome/Squirrel codebase.

---

## 2. Add environment and sync configuration

1. Add new environment variables to the `.env` template(s):

   * `ATOME_ENV=dev|test|prod`
   * `ATOME_SYNC_URL=https://atome.one` or `https://staging.atome.one` or `http://localhost:xxxx`.
2. In the Tauri Rust side and the Fastify/Axum servers:

   * Read `ATOME_ENV` at startup.
   * Configure logging level:

     * `dev`: maximum debug (audio, UI, network).
     * `test`: debug for functional tests.
     * `prod`: info + errors only.
3. Implement a small config helper in JS/TS:

   * `src/squirrel/config/env.ts` example:

     * `getAtomeEnv(): 'dev' | 'test' | 'prod'`.
     * `getSyncUrl(): string`.
4. For audio atomes and audio files:

   * Ensure that in `prod` and `test`, the sync layer uploads audio metadata and files to `ATOME_SYNC_URL`.
   * In `dev`, default to local-only storage, with an option to enable remote sync for testing.

---

## 3. Define core ADOLE audio objects

Create ADOLE object schemas and/or TypeScript types for the audio domain. Suggested types:

1. `AudioFileAtome` (represents a physical audio file):

   * `id: string`
   * `project_id: string`
   * `path: string` (local path or URL)
   * `hash: string` (content hash for deduplication)
   * `sample_rate: number`
   * `bit_depth: number`
   * `channels: number`
   * `duration: number` (seconds)
   * `created_at`, `updated_at`
2. `AudioClipAtome` (logical clip placed on a timeline):

   * `id: string`
   * `project_id: string`
   * `audio_file_id: string`
   * `record_position: number` (absolute time when recorded)
   * `play_position: number` (position on timeline in seconds or beats)
   * `start_offset: number` (offset inside the file)
   * `end_offset: number`
   * `group_id: string | null` (logical “track” grouping)
   * `stretch_ratio: number` (1.0 = normal)
   * `pitch_shift: number` (in semitones)
   * `stretch_algo: 'bungee' | 'none'`
   * `gain: number`
   * `pan: number`
   * `muted: boolean`
   * `solo: boolean`
3. `TimelineAtome`:

   * `id: string`
   * `project_id: string`
   * `name: string`
   * `type: 'audio' | 'actions' | 'mixed'`
   * `clips: string[]` (list of `AudioClipAtome` and/or `ActionClipAtome` ids)
   * `tempo_segments: TempoSegment[]`
   * `follow_actions: TimelineFollowAction[]`
4. `TempoSegment`:

   * `start_position: number` (timeline position)
   * `bpm: number`
   * `time_signature: string` (ex: "4/4")
5. `RoutingGraphAtome`:

   * `id: string`
   * `project_id: string`
   * `nodes: RoutingNode[]`
   * `connections: RoutingConnection[]`
6. `RoutingNode`:

   * `id: string`
   * `type: 'input' | 'bus' | 'output' | 'plugin'`
   * `name: string`
   * `params: Record<string, any>` (e.g. gain, pan, plugin params)
7. `RoutingConnection`:

   * `id: string`
   * `source_node_id: string`
   * `source_channel: number`
   * `target_node_id: string`
   * `target_channel: number`
   * `gain: number`
8. `WidgetAtome`:

   * `id: string`
   * `project_id: string`
   * `type: 'slider' | 'button' | 'xy' | 'toggle' | 'macroTrigger' | ...`
   * `mapping_targets: WidgetMapping[]`
9. `WidgetMapping`:

   * `target_type: 'param' | 'action' | 'macro' | 'routing'`
   * `target_id: string`
   * `param_path?: string` (e.g. "gain", "filter.cutoff")
10. `ActionClipAtome`:

* `id: string`
* `project_id: string`
* `timeline_id: string`
* `play_position: number`
* `duration: number`
* `events: ActionEvent[]`

11. `ActionEvent`:

* `time_offset: number` (relative to clip start, in seconds or beats)
* `type: 'widgetChange' | 'script' | 'editCommand' | 'routingChange'`
* `payload: any` (serialized details of the action)

Implement these objects in the ADOLE layer and database schema (SQLite/libSQL) with full versioning and deduplication for `AudioFileAtome`.

---

## 4. Implement the WebAudio backend (MVP)

1. Create a `WebAudioBackend` class implementing `AudioEngine`.
2. Inside `WebAudioBackend`, manage:

   * A single `AudioContext` instance.
   * A global transport node (clock, play/stop/seek).
   * A registry of active `AudioClipAtome` → `AudioBufferSourceNode` + gain/pan nodes.
3. Implement basic lifecycle:

   * `init()` creates the context and any global nodes (master gain, analyser, etc.).
   * `loadClip(audioClip)`:

     * Fetch or read the associated WAV file.
     * Decode into an `AudioBuffer`.
     * Create a source node and connect to the routing graph.
   * `play(timelineId, position)`:

     * Start the transport.
     * Start all clips that intersect the playhead position.
   * `stop()`:

     * Stop all active sources, reset playhead.
   * `seek(position)`:

     * Stop active sources and restart them at the new position.
4. Integrate tempo and tempo segments:

   * Maintain a conversion between beats and seconds based on `TempoSegment`.
   * Provide helper functions:

     * `beatsToSeconds(beat, tempoSegments)`.
     * `secondsToBeats(seconds, tempoSegments)`.
5. Implement latency compensation:

   * Compute a global latency value.
   * When recording or scheduling, apply an offset so clips are placed at the correct `play_position`.

---

## 5. Integrate Bungee for real-time time-stretch and pitch-shift

1. Add Bungee as a dependency (WebAssembly or JS library, depending on its packaging).
2. In `WebAudioBackend`, create a `BungeeProcessor` abstraction:

   * Wrap the Bungee API in a class such as `BungeeNode`.
   * Connect `AudioBufferSourceNode` → `BungeeNode` → rest of the graph.
3. For each `AudioClipAtome`:

   * When `stretch_algo === 'bungee'`, configure Bungee with:

     * `stretch_ratio`
     * `pitch_shift`
   * Ensure configuration updates in real time when these properties change.
4. Provide a function `updateClipTimeStretch(clipId, stretch_ratio, pitch_shift)` in the engine:

   * Locate the active node.
   * Apply new parameters to the Bungee node.
5. Ensure Bungee can work in streaming mode or with pre-rendered buffers, depending on its capabilities.

---

## 6. Implement the routing system (graph, matrix, AUM-like views)

1. In the engine, implement an internal routing graph:

   * A dictionary `nodes: Map<string, AudioNodeWrapper>`.
   * A list of `connections: RoutingConnection`.
2. Create helpers:

   * `createNode(nodeDef: RoutingNode)`.
   * `connectNodes(connection: RoutingConnection)`.
   * `disconnectNodes(nodeId: string)`.
3. Support node types:

   * `input`: capture from microphone / device input.
   * `bus`: gain node or channel mixer.
   * `output`: destination to `AudioContext.destination` or Tauri native output.
   * `plugin`: WebAudio-based FX or generator.
4. Expose routing operations through an API usable by Atome’s UI:

   * `addRoutingNode(nodeDef)`.
   * `addRoutingConnection(connectionDef)`.
   * `updateRoutingNodeParams(nodeId, params)`.
5. For the UI:

   * Provide read-only snapshots of the routing graph so multiple visualizations can be built:

     * Matrix view.
     * Node graph view.
     * AUM-like channel strip view.

---

## 7. Implement recording and clip creation

1. Create a `RecorderService` inside the audio engine or as a dedicated module:

   * Able to record from any `RoutingNode` of type `input` or `bus`.
2. Steps when starting recording:

   * Determine active inputs to record.
   * Create new `AudioFileAtome` placeholders for each input.
   * Start capturing audio samples into in-memory buffers or a streaming writer.
   * Store `record_start_time` using the global transport clock.
3. Steps when stopping recording:

   * Finalize WAV files (write headers and flush to disk).
   * Compute `duration` from sample count.
   * Create corresponding `AudioClipAtome`:

     * `record_position = record_start_time`.
     * `play_position` determined by current timeline playhead.
     * `start_offset = 0`, `end_offset = duration`.
   * Save `AudioFileAtome` and `AudioClipAtome` into ADOLE/database.
4. When there is an active selection of clips or a group:

   * Start playback of these clips in sync.
   * Record new clips aligned with them (punch-in / overdub behavior).

---

## 8. Implement timelines and multiple timelines per project

1. For each project, allow creation of several `TimelineAtome` objects.
2. Implement a `TimelineService`:

   * `createTimeline(projectId, name, type)`.
   * `addClip(timelineId, clipId, play_position)`.
   * `removeClip(timelineId, clipId)`.
   * `moveClip(timelineId, clipId, newPosition)`.
3. Implement playback control per timeline:

   * `playTimeline(timelineId)`.
   * `stopTimeline(timelineId)`.
   * `seekTimeline(timelineId, position)`.
4. Implement cross-timeline triggers:

   * Allow `TimelineFollowAction` or clips to call `playTimeline(otherTimelineId)` or `stopTimeline(otherTimelineId)`.

---

## 9. Implement non-destructive editing operations

For each `AudioClipAtome`, implement operations as pure functions that only modify properties.

1. `splitClip(clipId, splitPosition)`:

   * Create two new clips:

     * First: same `start_offset`, `end_offset = start_offset + (splitPosition - play_position)`.
     * Second: `start_offset` = end of first, `end_offset` = original `end_offset`.
   * Replace original clip by the two new clips on the timeline.
2. `joinClips(clipIdA, clipIdB)`:

   * If they are contiguous and from the same file, merge into one clip.
3. `trimClip(clipId, newStartOffset, newEndOffset)`:

   * Update offsets inside the same file, without touching the source.
4. `moveClip(clipId, newPlayPosition)`:

   * Update `play_position` only.
5. `groupClips(clipIds[], groupId)`:

   * Assign the same `group_id` to create a logical track.

Expose these as commands that can be called both from the UI and from automation/action clips.

---

## 10. Implement widgets and automation (action clips)

1. Implement `WidgetAtome` rendering in the Atome UI layer:

   * Basic widgets: slider, button, toggle, XY pad.
   * Each widget has one or more `WidgetMapping` entries.
2. Implement a `WidgetAutomationRecorder`:

   * Subscribes to widget change events.
   * When recording is active:

     * For every widget event, record an `ActionEvent` with:

       * `time_offset` relative to the current recording start.
       * `type` corresponding to the widget action.
       * A payload describing the parameter/value change.
   * At the end of recording, wrap events into an `ActionClipAtome` and place it on the active timeline.
3. Implement playback of `ActionClipAtome`:

   * During playback, at the appropriate times, re-apply actions:

     * Change widget visual state.
     * Propagate changes to underlying audio parameters or edit commands.
4. Ensure action clips are editable like audio clips:

   * `splitActionClip`, `joinActionClips`, `moveActionClip`, `loopActionClip`.
5. Provide a generic automation API:

   * `scheduleAutomation(target, paramPath, time, value)`.
   * Internally, use the same mechanism as `ActionClipAtome` so everything stays unified.

---

## 11. Implement follow actions

1. Define `FollowAction` types:

   * `PlayNextClip`, `Stop`, `LoopClip`, `RandomClipInGroup`, `JumpToMarker`, `PlayTimeline`, `StopTimeline`, `TriggerActionClip`.
2. Add follow action properties to:

   * `AudioClipAtome` (per clip).
   * Optionally `group_id` level.
   * `TimelineAtome` (timeline-level behavior).
3. Implement a `FollowActionEngine`:

   * Subscribed to playback events (end of clip, markers, etc.).
   * When a follow action condition is met, it dispatches the appropriate command:

     * e.g. `playClip(nextClipId)`, `playTimeline(otherTimelineId)`, etc.
4. Ensure that follow actions can also trigger `ActionClipAtome`.

---

## 12. Storage, sync, and deduplication

1. Implement deduplication for `AudioFileAtome`:

   * Compute `hash` for each new recording.
   * If a file with the same hash already exists, reuse it instead of creating a duplicate.
2. Ensure that all audio-related objects are fully versioned via ADOLE:

   * Each property change is an event.
   * It must be possible to restore previous versions of clips, timelines, routings, widgets, and action clips.
3. Integrate audio atomes in the existing sync engine:

   * Metadata: sync using the same mechanism as other Atome objects.
   * Audio files: upload and download through a binary or blob API.
   * Respect `ATOME_ENV` and `ATOME_SYNC_URL` for PROD/TEST/DEV behavior.

---

## 13. Debugging and logging for audio (Tauri + browser)

1. Add detailed logging in `WebAudioBackend`, `RecorderService`, `TimelineService`, `FollowActionEngine` and routing:

   * Log clip creation, playback start/stop, time-stretch parameter changes, routing changes.
2. In `dev` mode:

   * Expose a debug panel in Atome:

     * List active clips and nodes.
     * Show current routing graph.
     * Display transport time, latency value, tempo, current timeline.
3. For Tauri:

   * Log messages on the Rust side for:

     * Audio device initialization.
     * Errors from the WebView.
     * Crashes related to audio threads.
4. Ensure logs for:

   * "second click on microphone icon" flow:

     * UI event.
     * Command sent to backend.
     * State transitions in the recorder.

---

This plan is meant to be executed incrementally. Copilot can take each section and turn it into concrete code tasks, TypeScript types, Rust bindings, and UI components inside the Atome/Squirrel codebase.
