# Graphs - atome-core

## Status

Point traite: atome-core.

## Purpose

Ce dossier cartographie le bloc atome-core pour faciliter le debug des mutations atomes, commit pipeline, state_current, event bus, selection et timeline/undo.

## Files analyzed

- eVe/core/atome_commit.js
- eVe/core/atome_timeline.js
- eVe/core/atome_timeline_history.js
- eVe/core/atome_timeline_history_contract.js
- eVe/core/event_bus.js
- eVe/intuition/runtime/selection.js
- atome/src/squirrel/atome/atome.js
- atome/src/squirrel/apis/unified/adole.js
- atome/src/squirrel/apis/unified/adole_apis.js
- atome/src/squirrel/apis/unified/adole_api/atomes.js
- database/adole.js
- database/adole_event_contract.js
- database/adole_event_mutation.js
- database/schema.sql
- server/atomeRoutes.orm.js
- server/atomeHistoryCommands.js
- server/atomePropertySecurity.js
- server/atomeRealtime.js
- server/wsAtomeRealtimeOperation.js
- server/wsAtomeDeleteOperation.js
- server/wsSyncSecurity.js
- server/wsAtomeOperations.js
- platforms/desktop-tauri/src/server/local_atome_security.rs
- platforms/desktop-tauri/src/server/local_atome_sync_worker.rs
- platforms/desktop-tauri/src/server/local_atome_remote_projection.rs

## Main entry points

- `commit` - eVe/core/atome_commit.js:1760
- `commitBatch` - eVe/core/atome_commit.js:1923
- `getStateCurrent` - eVe/core/atome_commit.js:2122
- `listEvents` - eVe/core/atome_commit.js:2124
- `window.Atome` API assignment - eVe/core/atome_commit.js:2128
- `AtomeTimeline` assignment - eVe/core/atome_timeline.js:1329
- `eventBus.emit` - eVe/core/event_bus.js:45
- `dispatchSelectionEvent` - eVe/intuition/runtime/selection.js:94
- `createAtome` - database/adole.js:494
- `commitAtomeEvent` - server/atomeRoutes.orm.js:362
- `handleWsAtomeRealtimeOperation` - server/wsAtomeRealtimeOperation.js
- `executeAtomeHistoryCommand` - server/atomeHistoryCommands.js
- `handleWsAtomeDeleteOperation` - server/wsAtomeDeleteOperation.js

## Main risks found

- RISK-001: `MULTI_SOURCE_OF_TRUTH` entre DOM atomes, `state_current`, events, particles, window globals et timeline preview.
- RISK-002: `ASYNC_RISK` sur mirroring Fastify non bloquant depuis Tauri.
- RISK-003: `CONFLICT` entre selection globals et SelectionAPI.
- RISK-004: `PERFORMANCE_BLOCKER` possible sur commit high-frequency gestures.
- RISK-005: realtime gesture previews must authorize every touched property and
  project the patch separately for each recipient before delivery.
- RISK-006: a durable timeline transition spanning several source transactions
  is rejected until the server can execute the whole range atomically; snapshot
  rewriting is not an authorized fallback.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
