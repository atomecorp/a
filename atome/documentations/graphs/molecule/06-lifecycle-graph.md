# Lifecycle Graph - Molecule Recording

```mermaid
flowchart TD
  Open["openGroupTimeline"] --> Session["create MoleculeSession"]
  Session --> Recording["createMoleculeRecordingSession"]
  Recording --> Render["render canonical timeline on Bevy canvas"]
  Render --> Ready["group ready"]

  Ready --> Read["readGroupTimelineRecording"]
  Ready --> Start["startGroupTimelineRecording"]
  Start --> Active["exact capture active; render/host clocks, origin, epoch locked"]
  Active --> Stop["stopGroupTimelineRecording"]
  Stop --> Persist["persist media Atome"]
  Persist --> Clip["commit frame-exact clip"]
  Clip -->|commit failed| CommitFailed["retain finalized clip/media\nretry stop"]
  CommitFailed --> Clip
  Clip --> Ready
  Active --> Cancel["cancelGroupTimelineRecording"]
  Cancel --> Ready

  Ready --> Close["closeGroupTimeline"]
  Active --> Close
  Close --> DisposeRecording["await recording.dispose"]
  DisposeRecording -->|active| CancelBackend["await cancelCapture"]
  DisposeRecording --> Clear["await sceneBridge.clear"]
  CancelBackend --> Clear
  Clear --> DisposeSession["session.dispose"]
  DisposeSession --> Delete["sessionsByGroup.delete"]
  Delete --> Complete["closed"]

  BevyGeneric["Bevy audio/video tool without active group"] --> GenericController["generic audio/video controller"]
  GenericController --> GenericStop["stop/discard releases capture"]
```

## Lifecycle findings

- The recording coordinator has an explicit terminal `dispose()` operation.
- Group close awaits recording disposal before clearing the scene or disposing the session.
- Disposal cancels active capture and also handles a start that is still settling.
- Stop creates a clip only after capture has finished, timing has validated, and the media Atome is durable.
- A clip-commit failure after those phases retains the immutable finalized result in `commit_failed`; retry does not touch the capture backend or create another media Atome.
- Cancel/dispose create no clip.
- Generic video remains available outside the exact coordinator; exact video returns `av_sample_accurate_overdub_unsupported` before acquisition until audio-sample PTS mapping exists.
- Recording never owns a second product renderer, DOM `<video>`/`<img>`, native overlay, or fake WebGPU preview surface.
