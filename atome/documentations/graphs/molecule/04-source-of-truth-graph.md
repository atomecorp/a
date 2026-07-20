# Source-of-Truth Graph - Molecule Recording

```mermaid
flowchart TD
  RenderClock["AUv3 render clock\nauv3.render"]:::clock
  HostClock["AUv3 host transport\nauv3.host_transport timeline origin"]:::clock
  StartQuantum["record_start_render_quantum\nlocked clock_epoch"]:::clock
  NativeFrames["actual playback start < recording start\nplayback observed == recording start\npositive input + output = roundtrip = offset"]:::clock

  RenderClock --> StartQuantum
  HostClock --> StartQuantum
  StartQuantum --> NativeFrames
  NativeFrames --> Timing["validated recording_timing\nsafe integer frames"]:::runtime

  MediaAtome["persisted media Atome"]:::durable
  TimelineAtome["owner Atome molecule_timeline snapshot"]:::durable
  EventLog["deterministic molecule.clip.add event"]:::durable
  Session["open MoleculeSession state"]:::runtime
  Coordinator["recording coordinator state"]:::runtime
  BevyScene["Bevy project-scene projection\n#eve_surface_project"]:::projection
  UiLatch["Bevy tool latch/status"]:::projection

  Coordinator --> Timing
  Timing --> MediaAtome
  MediaAtome --> Session
  Session --> EventLog
  Session --> TimelineAtome
  TimelineAtome --> BevyScene
  Coordinator --> UiLatch

  FinalizedCommit["runtime-only validated clip + durable media id\nretained only while session.apply is retryable"]:::runtime
  MediaAtome --> FinalizedCommit
  FinalizedCommit --> Session

  GenericControllers["generic audio/video controllers"]:::runtime
  GenericControllers --> MediaAtome
  GenericControllers --> UiLatch

  classDef clock fill:#d9eaff,stroke:#245a9b,color:#111
  classDef durable fill:#d5f5d5,stroke:#1d7a1d,color:#111
  classDef runtime fill:#e8eefc,stroke:#315aa8,color:#111
  classDef projection fill:#fff2cc,stroke:#8a6d00,color:#111
```

## Ownership

- Exact timing truth combines validated AUv3 `plugin_input` render-clock capture with the host-transport timeline origin, not UI time, wall time, file duration, or DOM state.
- The locked epoch and integer frames are persisted with the clip; seconds are derived from the timeline sample rate.
- Playback truth preserves the actual earlier `playback_start_frame` and proves the recording quantum with `playback_observed_frame == recording_start_frame`.
- Latency truth is strictly positive, host-measured, and additive: `input_latency_frames + output_latency_frames = roundtrip_latency_frames = record_offset_frames_applied`; placement is `timeline_origin_frame - roundtrip_latency_frames`.
- The recorded file becomes durable through the media Atome before the Molecule session can reference it.
- The coordinator may retain an immutable finalized clip/media id only to retry a failed canonical `session.apply`; this runtime cache never replaces the media Atome, event log, or owner snapshot as durable truth.
- The owner Atome snapshot and deterministic event log are the durable timeline authorities.
- The coordinator and session are runtime state; Bevy records and tool latches are disposable projections.
- The DOM is not a product rendering or recording source of truth. Real recorder-owned scope/camera frames may feed the shared Bevy tool overlay, but those bounded frames, their session id, and their phase are disposable renderer state only; no visible DOM/native/fake-WebGPU viewfinder is authoritative.
- Generic plug-in output/mix and video results remain generic even when they have precise-looking metadata.
