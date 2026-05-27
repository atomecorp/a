# Async Graph - molecule

```mermaid
flowchart TD
  Open["openGroupTimeline async\nruntime.js:149"] --> SaveInitial["await projectStore.saveTimeline\nruntime.js:163"]
  SaveInitial --> CreateSession["createMoleculeSession sync\nruntime.js:164"]
  CreateSession --> OpenPanel["openMoleculePanel sync\nruntime.js:170"]
  OpenPanel --> SetMap["sessionsByGroup.set\nruntime.js:177"]
  OpenPanel --> OpenFail["ASYNC_RISK: prior save remains if panel open throws"]:::risk

  Apply["session.apply async\nsession.js:205"] --> Append["await eventSink.append\nsession.js:221"]
  Append --> Commit["await notifyStateCommitted\nsession.js:238"]
  Commit --> Emit["emit listeners sync\nsession.js:245"]

  Persist["applyAndPersist\npersistence/index.js:131"] --> SessionApply["await session.apply"]
  SessionApply --> Schedule["scheduleSave\npersistence/index.js:117"]
  Schedule --> Timer["setTimeout scheduler\npersistence/index.js:121"]
  Timer --> VoidSave["void task?.()\npersistence/index.js:124"]:::risk

  RecordingStart["recording.start\nrecording/index.js:172"] --> StartCapture["await captureEngine.startCapture\nrecording/index.js:203"]
  RecordingConfirm["recording.confirm\nrecording/index.js:219"] --> Finish["await finishCapture\nrecording/index.js:221"]
  Finish --> Import["await mediaStore.importMedia\nrecording/index.js:222"]
  Import --> AddClip["await persistence.applyAndPersist\nrecording/index.js:242"]
  RecordingCancel["recording.cancel\nrecording/index.js:246"] --> CancelCapture["await captureEngine.cancelCapture\nrecording/index.js:248"]

  Hydrate["hydrateSessionMedia\nmedia/index.js:113"] --> ResolveAudio["await resolvePlayback audio"]
  Hydrate --> ResolveVideo["await resolvePlayback video"]
  Hydrate --> ResolveWaveform["await resolvePlayback waveform"]
  Hydrate --> ResolveThumbnail["await resolvePlayback thumbnail"]

  classDef risk fill:#ffd6d6,stroke:#a80000,color:#111
```

## Async risks

- `ASYNC_RISK`: `openGroupTimeline` persists before the panel/session registration is complete; no rollback is proven.
- `ASYNC_RISK`: debounce timer runs `void task?.()`, so save failure can become detached from caller.
- `ASYNC_RISK`: `openInstance` calls `void save(session)` in `multi_instance/index.js:61`.
- `UNKNOWN`: no guard was found for state modified after panel close when the close button hides the DOM only.
