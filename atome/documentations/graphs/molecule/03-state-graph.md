# State Graph - molecule

```mermaid
stateDiagram-v2
  [*] --> runtime_installed: installMoleculeGroupTimelineRuntime
  runtime_installed --> requested: openGroupTimeline(detail)
  requested --> timeline_built: buildTimelineFromSteps
  timeline_built --> saved_initial: await projectStore.saveTimeline
  saved_initial --> session_created: createMoleculeSession
  session_created --> panel_open: openMoleculePanel
  panel_open --> ready: sessionsByGroup.set/currentGroup
  ready --> mutating: session.apply/undo/redo
  mutating --> committed: eventSink.append + onStateCommitted
  committed --> ready: emit listeners/renderTimeline
  ready --> hidden_partial: closeMoleculePanel only
  hidden_partial --> ready: session still active PARTIAL_LIFECYCLE
  ready --> closing: closeGroupTimeline
  closing --> disposed: session.dispose + sessionsByGroup.delete
  disposed --> [*]
  requested --> failed: invalid group/project/stores
  saved_initial --> failed: openMoleculePanel throws UNKNOWN rollback
  mutating --> failed: reducer/eventSink/projectStore error
```

## State notes

- `RISK`: `hidden_partial` exists because `closeMoleculePanel` only sets `display = 'none'`.
- `UNKNOWN`: no rollback state is implemented in `openGroupTimeline` after initial `projectStore.saveTimeline`.
- `PARTIAL_LIFECYCLE`: listener cleanup happens in `session.dispose`, but close button does not reach dispose.
