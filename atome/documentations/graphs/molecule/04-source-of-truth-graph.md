# Source-of-Truth Graph - molecule

```mermaid
flowchart TD
  ProjectStore["projectStore timelines\nruntime.js:163,167\npersistence/index.js:106"]:::truth
  EventStore["eventStore/eventSink append\nsession.js:221"]:::truth
  SessionState["MoleculeSession private state\nsession.js:132"]:::runtime
  SessionsByGroup["sessionsByGroup Map\nruntime.js:145,177"]:::runtime
  Registry["MoleculeSessionRegistry maps\nregistry.js:28-29"]:::runtime
  Instances["multi-instance instances Map\nmulti_instance/index.js:31"]:::runtime
  PanelDom["panel dataset timelineId/toolsStatus\npanel/index.js:231-253"]:::ui
  CurrentGroup["currentGroup string\nruntime.js:146,178,210"]:::runtime
  MediaRefs["mediaStore media_ref/runtime_assets\nmedia/index.js:64-88"]:::truth

  ProjectStore <--> SessionState
  EventStore --> SessionState
  SessionState --> PanelDom
  SessionsByGroup --> SessionState
  Registry --> SessionState
  Instances --> Registry
  Instances --> PanelDom
  CurrentGroup --> SessionsByGroup
  MediaRefs --> SessionState

  MultiSource["MULTI_SOURCE_OF_TRUTH: timeline/session/panel ownership can exist in multiple containers"]:::risk
  ProjectStore --> MultiSource
  SessionState --> MultiSource
  SessionsByGroup --> MultiSource
  Registry --> MultiSource
  Instances --> MultiSource
  PanelDom --> MultiSource

  classDef truth fill:#d5f5d5,stroke:#1d7a1d,color:#111
  classDef runtime fill:#e8eefc,stroke:#315aa8,color:#111
  classDef ui fill:#fff2cc,stroke:#8a6d00,color:#111
  classDef risk fill:#ffd6d6,stroke:#a80000,color:#111
```

## Ownership questions resolved

- State owner during an open session: `MoleculeSession` private `state`.
- Durable timeline snapshot: `projectStore.saveTimeline`.
- Durable mutation log: `eventSink.append`.
- UI reflection: molecule panel DOM, not durable.
- Concurrent copies: `sessionsByGroup`, `registry/byTimeline`, `instances`, panel dataset and project store.
