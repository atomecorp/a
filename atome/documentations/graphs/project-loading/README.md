# Graphs - project-loading

## Status

Point traite: project-loading.

## Purpose

Ce dossier cartographie le bloc project-loading pour faciliter le debug du chargement projet, auth gate, restauration atomes, timelines mtrax, medias, et conflits online/offline.

## Files analyzed

- eVe/intuition/tools/project_bootstrap.js
- eVe/intuition/tools/project_drop.js
- eVe/default_data/default_project.js
- eVe/core/project_security.js
- eVe/domains/mtrax/project/commit_bridge_runtime.js
- eVe/domains/mtrax/project/project_automation_session_runtime.js
- eVe/domains/mtrax/project/project_playback_timeline_runtime.js
- server/githubSync.js
- database/adole.js
- database/driver.js

## Main entry points

- `waitForAuthCheck` - eVe/intuition/tools/project_bootstrap.js:93
- `ensureCurrentProject` - eVe/intuition/tools/project_bootstrap.js:574
- `bootstrapProject` - eVe/intuition/tools/project_bootstrap.js:819
- `scheduleBootstrap` - eVe/intuition/tools/project_bootstrap.js:807
- `createMtrackCommitBridgeRuntime` - eVe/domains/mtrax/project/commit_bridge_runtime.js:6
- `commitTimelineMutation` - eVe/domains/mtrax/project/commit_bridge_runtime.js:98
- `handleRemoteAtomeChanged` - eVe/domains/mtrax/project/commit_bridge_runtime.js:161

## Main risks found

- RISK-001: `ASYNC_RISK` sur chargement UI stale-first detache.
- RISK-002: `MULTI_SOURCE_OF_TRUTH` entre `window.__currentProject`, AdoleAPI, saved project, project view DOM, ADOLE DB et mtrax group timeline.
- RISK-003: `CONFLICT` online/offline sur remote reload et local commit guard.
- RISK-004: `PARTIAL_LIFECYCLE` possible si logout/clear-view arrive pendant load.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
