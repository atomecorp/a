# Lifecycle Graph - molecule

```mermaid
flowchart TD
  Create["create timeline\nruntime.js:101"] --> Save["save initial timeline\nruntime.js:163"]
  Save --> Session["create session\nsession.js:118"]
  Session --> Panel["open panel\npanel/index.js:209"]
  Panel --> Bind["bind listeners/tools/history\npanel/index.js:40,132,153,179,189,255"]
  Bind --> Ready["ready: sessionsByGroup set\nruntime.js:177"]
  Ready --> Update["apply/undo/redo\nsession.js:205,248,277"]
  Update --> Persist["eventSink + projectStore\nsession.js:221,238"]
  Ready --> UiClose["close button -> closeMoleculePanel\npanel/index.js:255"]
  UiClose --> Hidden["panel hidden only\npanel/index.js:202-206"]:::risk
  Hidden --> Ghost["PARTIAL_LIFECYCLE: session/listeners/map can remain"]:::risk
  Ready --> RuntimeClose["closeGroupTimeline\nruntime.js:196"]
  RuntimeClose --> Hide["closeMoleculePanel\nruntime.js:204"]
  Hide --> Dispose["session.dispose\nruntime.js:208"]
  Dispose --> Delete["sessionsByGroup.delete\nruntime.js:209"]
  Delete --> Complete["disposed"]

  Recording["recording lifecycle"] --> RecStart["startCapture -> current set\nrecording/index.js:203-204"]
  RecStart --> RecConfirm["finish/import/add clip/current null\nrecording/index.js:219-243"]
  RecStart --> RecCancel["cancelCapture/current null\nrecording/index.js:246-249"]

  classDef risk fill:#ffd6d6,stroke:#a80000,color:#111
```

## Lifecycle findings

- `PARTIAL_LIFECYCLE`: `closeMoleculePanel` does not dispose session or unregister `sessionsByGroup`.
- `PARTIAL_LIFECYCLE`: panel listeners are attached to DOM nodes and cleared only by replacing panel content on next open; no explicit remove path exists.
- `RISK`: recording lifecycle has `start`, `confirm`, `cancel`, but no external dispose/cancel-on-session-close hook was found.
