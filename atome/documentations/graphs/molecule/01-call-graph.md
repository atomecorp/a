# Call Graph - Molecule Recording

```mermaid
flowchart TD
  BevyTool["Bevy media tool\nui.capture.audio / ui.capture.video / ui.detail.record.toggle"] --> Bootstrap["tool runtime bootstrap\nlazy capture handler"]
  Bootstrap --> Active{"Active Molecule group?"}

  Active -->|no| Generic{"Generic media kind"}
  Generic -->|audio| AudioController["startAudioRecording / stopAudioRecording"]
  Generic -->|video| VideoController["startVideoRecordingSession / stopVideoRecordingSession"]
  AudioController --> GenericAtome["persist generic media Atome"]
  VideoController --> GenericAtome

  Active -->|yes| GroupToggle["createMoleculeRecordToggleHandler"]
  GroupToggle -->|start| GroupStart["startGroupTimelineRecording"]
  GroupToggle -->|stop| GroupStop["stopGroupTimelineRecording"]

  GroupStart --> CoordinatorStart["recording.start"]
  CoordinatorStart --> ArmedTrack["resolve exactly one compatible armed track"]
  ArmedTrack --> ExactCapability["resolveSampleAccurateCapability"]
  ExactCapability -->|explicit exact AUv3 plugin_input| AdapterStart["captureAdapter.startCapture"]
  ExactCapability -->|unsupported source or video| Reject["av_sample_accurate_overdub_unsupported"]
  AdapterStart --> LockEpoch["lock epoch + auv3.host_transport origin"]

  GroupStop --> CoordinatorStop["recording.stop"]
  CoordinatorStop --> Finish["captureAdapter.finishCapture"]
  Finish --> Validate["validate render/host clocks + epoch/rate\nactual playback start; observed == record start\npositive host round trip; origin - roundtrip placement\nzero overrun/discontinuity"]
  Validate --> PersistAtome["audio controller persists media Atome"]
  PersistAtome --> RequireAtome["require persisted Atome id"]
  RequireAtome --> ClipCommit["session.apply('molecule.clip.add')"]
  ClipCommit -->|commit failed| CommitRetry["cache validated clip + media Atome\nstatus=commit_failed"]
  CommitRetry -->|stop retry| ClipCommit
  ClipCommit --> TimelinePersist["projectStore.saveTimeline"]
  ClipCommit --> BevyRender["sceneBridge.render on #eve_surface_project"]

  Close["closeGroupTimeline"] --> RecordingDispose["await recording.dispose"]
  RecordingDispose -->|capture active| CancelCapture["captureAdapter.cancelCapture"]
  RecordingDispose --> ClearScene["sceneBridge.clear"]
  ClearScene --> SessionDispose["session.dispose"]
```

## Notes

- Generic audio/video and exact Molecule overdub share tool entry points but not timing guarantees.
- The exact path has no provisional media object: the persisted Atome id is mandatory before the clip mutation.
- If the clip mutation fails after capture finalization, the coordinator retains the same validated clip and media Atome in `commit_failed`; retrying `stop()` retries only `session.apply` and never finalizes or persists capture twice.
- Exact host compensation proves strictly positive `input_latency_frames + output_latency_frames = roundtrip_latency_frames`, then requires `record_offset_frames_applied` to equal that sum. Placement is `timeline_origin_frame - roundtrip_latency_frames`.
- `playback_start_frame` is the actual earlier backing-track start; `playback_observed_frame == recording_start_frame` proves playback was active in the capture quantum. That playback lead is not applied again to placement.
- `plugin_input` means AUv3 input captured inside the same render quantum. Plug-in output/mix remains a distinct generic source.
- Video takes the generic controller path; the exact branch returns `av_sample_accurate_overdub_unsupported` before capture until audio-sample PTS mapping exists.
- Rendering is a downstream Bevy projection, never a recording-owned DOM `<video>`/`<img>`, product canvas, native overlay, or simulated WebGPU viewfinder.
