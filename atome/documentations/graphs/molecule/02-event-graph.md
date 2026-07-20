# Event Graph - Molecule Recording

```mermaid
flowchart TD
  Intent["User intent on Bevy record tool"] --> Toggle["normalized active/inactive toggle"]
  Toggle --> Route{"Active Molecule timeline?"}

  Route -->|no| GenericEvent["generic audio/video controller transition"]
  GenericEvent --> GenericState["recording state event + Bevy latch projection"]

  Route -->|yes and active=true| ExactStart["startGroupTimelineRecording"]
  ExactStart --> Capability["exact capability decision"]
  Capability -->|accepted| Started["coordinator status=recording\nrender + host clocks / origin / epoch locked"]
  Capability -->|rejected| StartError["typed unsupported/clock error\nno capture and no clip"]

  Route -->|yes and active=false| ExactStop["stopGroupTimelineRecording"]
  ExactStop --> Persisted["recorded media Atome persisted"]
  Persisted --> ClipEvent["molecule.clip.add event"]
  ClipEvent -->|apply failed| CommitFailed["status=commit_failed\nvalidated capture retained"]
  CommitFailed -->|stop retry| ClipEvent
  ClipEvent --> CommitEvent["onStateCommitted"]
  CommitEvent --> Save["canonical timeline saved"]
  CommitEvent --> Render["single Bevy scene re-rendered"]

  CancelIntent["cancelGroupTimelineRecording"] --> CancelEvent["capture canceled; no clip event"]
  CloseIntent["closeGroupTimeline"] --> DisposeEvent["recording.dispose"]
  DisposeEvent -->|active| CancelEvent
```

## Event guarantees

- UI latch changes follow controller results; UI events do not define sample positions.
- An exact start emits no timeline mutation.
- The only successful exact timeline mutation is `molecule.clip.add`, after durable media identity exists.
- A failed `molecule.clip.add` application emits no successful timeline mutation. The coordinator retains the immutable finalized clip/media identity and a later stop retries that application only.
- Exact video rejection is the expected `av_sample_accurate_overdub_unsupported` capability result; it does not disable generic video recording or synthesize a live preview.
- Closing the group triggers coordinator disposal even when capture is active.
