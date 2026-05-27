# Graphs - runtime-api

## Status

Point traite: runtime-api.

## Purpose

Ce dossier cartographie le bloc runtime-api pour faciliter le debug des APIs globales, passerelles outil/panneau/timeline, `window.Molecule`, `eveMtrackApi`, `AdoleAPI` et events runtime.

## Files analyzed

- eVe/intuition/runtime/tool_gateway.js
- eVe/intuition/runtime/tool.js
- eVe/intuition/runtime/panel_api.js
- eVe/intuition/runtime/group_timeline_api.js
- eVe/domains/mtrax/api/window_api_runtime.js
- eVe/domains/mtrax/api/window_api_bridge_runtime.js
- eVe/core/media_engine/molecule.api.js
- eVe/core/atome_timeline.js
- eVe/core/event_bus.js
- atome/src/squirrel/apis/unified/adole_apis.js
- eVe/intuition/tools/core/tool_runtime.js

## Main entry points

- `invokeToolGateway` - eVe/intuition/runtime/tool_gateway.js:269
- `registerPanelApi` - eVe/intuition/runtime/panel_api.js:10
- `openPanelSurface` - eVe/intuition/runtime/panel_api.js:20
- `registerGroupTimelineApi` - eVe/intuition/runtime/group_timeline_api.js:10
- `openGroupTimeline` - eVe/intuition/runtime/group_timeline_api.js:20
- `createMtrackWindowApiRuntime` - eVe/domains/mtrax/api/window_api_runtime.js:4
- `window.eveMtrackApi` assignment - eVe/domains/mtrax/api/window_api_runtime.js:917
- `window.Molecule` assignment - eVe/core/media_engine/molecule.api.js:660
- `AdoleAPI` - atome/src/squirrel/apis/unified/adole_apis.js:52

## Main risks found

- RISK-001: `GLOBAL_STATE` / `MULTI_SOURCE_OF_TRUTH` sur nombreuses APIs `window`.
- RISK-002: `CONFLICT` entre `window.Molecule` media API et molecule timeline/session API.
- RISK-003: `ASYNC_RISK` sur tool gateway warmup et delegates async.
- RISK-004: `PARTIAL_LIFECYCLE` sur singleton APIs enregistrables sans owner.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
