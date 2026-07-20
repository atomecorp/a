# Async Graph - Molecule Recording

```mermaid
flowchart TD
  Start["recording.start"] --> ValidateRequest["validate explicit exact mode, armed track\ninteger origin/rate, render + host clocks"]
  ValidateRequest --> Capability["await resolveSampleAccurateCapability"]
  Capability -->|unsupported| Reject["reject before backend start"]
  Capability -->|AUv3 plugin_input supported| StartCapture["await captureAdapter.startCapture"]
  StartCapture --> VerifyEpoch["verify dual clock ids/reference\nlock clock_epoch + timeline_origin_frame"]
  VerifyEpoch --> Recording["status=recording"]

  Stop["recording.stop"] --> Finish["await captureAdapter.finishCapture"]
  Finish --> Normalize["normalize real playback/same-quantum proof\nverify positive input + output = roundtrip = applied offset\nplace at timeline origin - roundtrip"]
  Normalize --> PersistMedia["await media Atome persistence"]
  PersistMedia --> RequireId["require persisted Atome id"]
  RequireId --> ApplyClip["await session.apply('molecule.clip.add')"]
  ApplyClip -->|failure| CacheCommit["retain finalized clip + Atome id\nstatus=commit_failed"]
  CacheCommit -->|stop retry| ApplyClip
  ApplyClip --> Event["await eventSink.append"]
  Event --> Commit["await onStateCommitted"]
  Commit --> Save["await projectStore.saveTimeline"]
  Commit --> Render["await Bevy scene render"]

  Cancel["recording.cancel"] --> CancelCapture["await captureAdapter.cancelCapture"]
  Dispose["recording.dispose"] --> StartPending{"start still settling?"}
  StartPending -->|yes| AwaitStart["await start settlement"]
  AwaitStart --> MaybeCancel{"capture became active?"}
  StartPending -->|no| MaybeCancel
  MaybeCancel -->|yes| CancelCapture
  MaybeCancel -->|no| Disposed["status=disposed"]
  CancelCapture --> Disposed
```

## Async locks

- Capability resolution completes before backend acquisition.
- The start epoch and host-transport origin are locked before the coordinator reports `recording`.
- Exact stop validation runs before the media result can mutate the timeline.
- Media Atome persistence completes before `session.apply` commits the clip.
- Capture finalization, timing normalization, and media persistence run at most once for a take. If `session.apply` fails, retrying stop reuses the cached finalized clip and Atome id.
- Session commit persistence/rendering uses the existing awaited Molecule commit callback.
- Disposal waits for an in-flight start and cannot leave an acquired capture unobserved.
- A generic video operation uses the video controller independently and without a recording viewfinder; exact video returns `av_sample_accurate_overdub_unsupported` at capability resolution and does not enter this stop chain.
